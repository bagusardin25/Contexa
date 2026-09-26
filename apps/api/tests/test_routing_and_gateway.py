import asyncio
import json
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.assemblyai.routing import speech_model_for, streaming_params, websocket_url
from app.llm.gateway import LLMError, LLMGateway, parse_json_content
from app.models.session import SessionConfig


@pytest.mark.parametrize(
    ("language", "model"),
    [
        ("en", "universal-3-5-pro"),
        ("ja", "universal-3-5-pro"),
        ("multi", "universal-3-5-pro"),
        ("id", "whisper-rt"),
        ("auto", "whisper-rt"),
    ],
)
def test_speech_model_routing(language: str, model: str) -> None:
    assert speech_model_for(language) == model  # type: ignore[arg-type]


def test_streaming_params_and_url() -> None:
    config = SessionConfig(speaker_language="ja", speaker_labels=True)
    url = websocket_url("wss://streaming.assemblyai.com/v3/ws", config, "tok en")
    parsed = urlparse(url)
    query = {k: v[0] for k, v in parse_qs(parsed.query).items()}

    assert parsed.netloc == "streaming.assemblyai.com" and parsed.path == "/v3/ws"
    assert query == {
        "speech_model": "universal-3-5-pro",
        "sample_rate": "16000",
        "encoding": "pcm_s16le",
        "format_turns": "true",
        "speaker_labels": "true",
        "token": "tok en",
    }


def test_whisper_gets_no_language_or_speaker_hints() -> None:
    params = streaming_params(SessionConfig(speaker_language="id", speaker_labels=True))
    assert params["speech_model"] == "whisper-rt"
    assert "speaker_labels" not in params and "language" not in params


def test_parse_json_content_variants() -> None:
    assert parse_json_content('{"a": 1}') == {"a": 1}
    assert parse_json_content('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_content('Here you go: {"a": 1} thanks') == {"a": 1}
    assert parse_json_content([{"type": "text", "text": '{"a": 2}'}]) == {"a": 2}
    with pytest.raises(LLMError):
        parse_json_content("no json here")
    with pytest.raises(LLMError):
        parse_json_content("[1, 2]")


def _gateway(handler, api_key: str | None = "key-123") -> LLMGateway:
    return LLMGateway(
        api_key=api_key,
        model="claude-sonnet-4-6",
        base_url="https://llm-gateway.assemblyai.com",
        timeout=5,
        transport=httpx.MockTransport(handler),
    )


def test_gateway_request_shape() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    result = asyncio.run(
        _gateway(handler).complete_json(
            system="s", user="u", schema_name="x", schema={"type": "object"}
        )
    )
    assert result == {"ok": True}
    assert seen["url"] == "https://llm-gateway.assemblyai.com/v1/chat/completions"
    assert seen["auth"] == "key-123"  # raw key, as the AssemblyAI docs specify
    assert seen["body"]["model"] == "claude-sonnet-4-6"
    assert seen["body"]["response_format"]["json_schema"]["strict"] is True


def test_gateway_errors_become_llm_errors() -> None:
    def failing(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    def timeout(_: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    for handler in (failing, timeout):
        with pytest.raises(LLMError):
            asyncio.run(
                _gateway(handler).complete_json(system="s", user="u", schema_name="x", schema={})
            )

    with pytest.raises(LLMError, match="not configured"):
        asyncio.run(
            _gateway(failing, api_key=None).complete_json(
                system="s", user="u", schema_name="x", schema={}
            )
        )


def _complete(gateway: LLMGateway, **kwargs) -> dict:
    return asyncio.run(
        gateway.complete_json(system="s", user="u", schema_name="x", schema={}, **kwargs)
    )


def test_gateway_errors_carry_the_gateway_message_without_the_key() -> None:
    def forbidden(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403,
            json={"error": {"message": "LLM Gateway isn't available on the free plan (key-123)"}},
        )

    with pytest.raises(LLMError) as exc:
        _complete(_gateway(forbidden))
    message = str(exc.value)
    assert message.startswith("The LLM Gateway returned HTTP 403: LLM Gateway isn't available")
    assert "key-123" not in message and "[redacted]" in message
    assert message.endswith(".")


def test_gateway_retries_without_temperature_when_the_model_rejects_it() -> None:
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        if "temperature" in body:
            return httpx.Response(
                400, json={"error": {"message": "temperature is deprecated for this model"}}
            )
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": 1}'}}]})

    gateway = _gateway(handler)
    assert _complete(gateway) == {"ok": 1}
    assert _complete(gateway) == {"ok": 1}
    # One rejected attempt, then the model is remembered and temperature is never sent again.
    assert ["temperature" in body for body in bodies] == [True, False, False]


def test_gateway_does_not_retry_other_bad_requests() -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(400, json={"error": "response_format is not supported"})

    with pytest.raises(LLMError, match="response_format is not supported"):
        _complete(_gateway(handler))
    assert len(calls) == 1


def test_gateway_model_override() -> None:
    models = []

    def handler(request: httpx.Request) -> httpx.Response:
        models.append(json.loads(request.content)["model"])
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    gateway = _gateway(handler)
    _complete(gateway)
    _complete(gateway, model="claude-haiku-4-5")
    assert models == ["claude-sonnet-4-6", "claude-haiku-4-5"]
