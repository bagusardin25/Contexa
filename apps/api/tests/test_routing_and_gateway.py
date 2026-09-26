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
    url = websocket_url(
        "wss://streaming.assemblyai.com/v3/ws", config, "tok en", ["Supabase", "Next.js"]
    )
    parsed = urlparse(url)
    query = {k: v[0] for k, v in parse_qs(parsed.query).items()}

    assert parsed.netloc == "streaming.assemblyai.com" and parsed.path == "/v3/ws"
    # Universal-3.5 Pro always formats turns, so format_turns isn't sent (migration guide).
    assert query == {
        "speech_model": "universal-3-5-pro",
        "sample_rate": "16000",
        "encoding": "pcm_s16le",
        "speaker_labels": "true",
        "keyterms_prompt": '["Supabase", "Next.js"]',
        "token": "tok en",
    }
    assert json.loads(query["keyterms_prompt"]) == ["Supabase", "Next.js"]


def test_universal_without_keyterms_sends_no_keyterms_prompt() -> None:
    params = streaming_params(SessionConfig(speaker_language="en", speaker_labels=False))
    assert "keyterms_prompt" not in params and "speaker_labels" not in params


def test_whisper_gets_no_language_speaker_or_keyterm_hints() -> None:
    config = SessionConfig(speaker_language="id", speaker_labels=True)
    params = streaming_params(config, ["Supabase"])
    assert params["speech_model"] == "whisper-rt"
    assert params["format_turns"] == "true"
    assert not {"speaker_labels", "language", "keyterms_prompt"} & params.keys()


def test_parse_json_content_variants() -> None:
    assert parse_json_content('{"a": 1}') == {"a": 1}
    assert parse_json_content('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_content('Here you go: {"a": 1} thanks') == {"a": 1}
    assert parse_json_content([{"type": "text", "text": '{"a": 2}'}]) == {"a": 2}
    with pytest.raises(LLMError):
        parse_json_content("no json here")
    with pytest.raises(LLMError):
        parse_json_content("[1, 2]")


def _gateway(handler, api_key: str | None = "key-123", **options) -> LLMGateway:
    return LLMGateway(
        api_key=api_key,
        model=options.pop("model", "claude-sonnet-4-6"),
        base_url=options.pop("base_url", "https://llm-gateway.assemblyai.com/v1"),
        timeout=5,
        transport=httpx.MockTransport(handler),
        **options,
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
    assert message.startswith(
        "The AssemblyAI LLM Gateway returned HTTP 403: LLM Gateway isn't available"
    )
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
        return httpx.Response(400, json={"error": "max_tokens is too large for this model"})

    with pytest.raises(LLMError, match="max_tokens is too large"):
        _complete(_gateway(handler))
    assert len(calls) == 1


def test_openai_compatible_request_shape() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["headers"] = request.headers
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    gateway = _gateway(
        handler,
        api_key="sk-or-1",
        model="vendor/model:free",
        base_url="https://openrouter.ai/api/v1",
        provider="openrouter",
        name="OpenRouter",
    )
    _complete(gateway)
    assert seen["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert seen["headers"]["authorization"] == "Bearer sk-or-1"
    assert seen["headers"]["x-title"] == "Contexa"
    assert seen["body"]["response_format"]["type"] == "json_schema"
    assert seen["body"]["provider"] == {"require_parameters": True}


def test_structured_output_falls_back_to_json_mode_then_prompt() -> None:
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        kind = body.get("response_format", {}).get("type")
        if kind == "json_schema":
            return httpx.Response(
                404,
                json={
                    "error": {
                        "message": "No endpoints found that can handle the requested parameters."
                    }
                },
            )
        if kind == "json_object":
            return httpx.Response(400, json={"error": {"message": "json_object is not supported"}})
        # Prompt-only JSON, wrapped the way chatty models answer.
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": 'Sure!\n```json\n{"ok": 1}\n```'}}]},
        )

    gateway = _gateway(handler, provider="openrouter", name="OpenRouter", model="m:free")
    schema = {"type": "object", "properties": {"ok": {"type": "integer"}}}
    result = asyncio.run(
        gateway.complete_json(system="Return JSON.", user="u", schema_name="x", schema=schema)
    )
    assert result == {"ok": 1}
    assert [b.get("response_format", {}).get("type") for b in bodies] == [
        "json_schema",
        "json_object",
        None,
    ]
    # The prompt now carries the schema, and OpenRouter isn't asked for parameters it lacks.
    assert '"ok":{"type":"integer"}' in bodies[-1]["messages"][0]["content"]
    assert "provider" not in bodies[-1]

    # The model is remembered: the next call goes straight to prompt-only JSON.
    asyncio.run(gateway.complete_json(system="s", user="u", schema_name="x", schema=schema))
    assert "response_format" not in bodies[-1] and len(bodies) == 4


def test_rate_limit_is_retried_once() -> None:
    statuses = iter([429, 200])
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        status = next(statuses)
        if status == 429:
            return httpx.Response(429, headers={"retry-after": "0"}, json={"error": "slow down"})
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": 1}'}}]})

    assert _complete(_gateway(handler)) == {"ok": 1}
    assert len(calls) == 2

    def always_limited(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429, headers={"retry-after": "0"}, json={"error": {"message": "free-models-per-day"}}
        )

    gateway = _gateway(always_limited, provider="openrouter", name="OpenRouter")
    with pytest.raises(LLMError, match="OpenRouter returned HTTP 429: free-models-per-day"):
        _complete(gateway)


def test_misconfigured_gateway_never_calls_out() -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200)

    with pytest.raises(LLMError, match="LLM_API_KEY is not configured"):
        _complete(_gateway(handler, api_key=None, provider="groq", name="Groq"))
    with pytest.raises(LLMError, match="LLM_MODEL is not configured"):
        _complete(_gateway(handler, model="", provider="groq", name="Groq"))
    with pytest.raises(LLMError, match="LLM_BASE_URL is not configured"):
        _complete(_gateway(handler, problem="LLM_BASE_URL is not configured on the server."))
    assert calls == []


def test_think_blocks_are_ignored() -> None:
    content = '<think>The user wants {"draft": true}… let me answer.</think>\n{"ok": 2}'
    assert parse_json_content(content) == {"ok": 2}


def test_gateway_model_override() -> None:
    models = []

    def handler(request: httpx.Request) -> httpx.Response:
        models.append(json.loads(request.content)["model"])
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    gateway = _gateway(handler)
    _complete(gateway)
    _complete(gateway, model="claude-haiku-4-5")
    assert models == ["claude-sonnet-4-6", "claude-haiku-4-5"]
