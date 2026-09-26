"""The one client for reasoning calls (guide §17–19): the AssemblyAI LLM Gateway, or any
OpenAI-compatible chat completions API (OpenRouter, Groq, Gemini, OpenAI).

Every translation, classification, and answer call goes through `complete_json`, which asks
for a strict JSON-schema structured output. A model that can't do that falls back to JSON
mode, then to JSON described in the prompt; callers validate the reply either way.
"""

import asyncio
import json
import re
from typing import Any, Literal

import httpx

MAX_ERROR_DETAIL = 200
# Free tiers answer bursts with 429; one short wait usually gets the call through.
MAX_RATE_LIMIT_WAIT = 5.0

JsonMode = Literal["json_schema", "json_object", "prompt"]
_FALLBACK: dict[str, JsonMode] = {"json_schema": "json_object", "json_object": "prompt"}
# How providers say a model can't do structured output (OpenRouter: "No endpoints found
# that can handle the requested parameters").
_FORMAT_ERRORS = (
    "response_format",
    "json_schema",
    "json schema",
    "json_object",
    "json mode",
    "structured",
    "requested parameters",
)
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
# How providers refuse `reasoning_effort` on models that don't reason.
_REASONING_ERRORS = ("reasoning_effort", "reasoning effort", "reasoning.effort", "thinking")


class LLMError(Exception):
    """A gateway call failed; callers degrade instead of crashing the session."""


def _capitalize(text: str) -> str:
    return text[:1].upper() + text[1:]


class LLMGateway:
    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        base_url: str,
        timeout: float,
        temperature: float | None = 0.2,
        reasoning_effort: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        provider: str = "assemblyai",
        name: str = "the AssemblyAI LLM Gateway",
        problem: str | None = None,
    ) -> None:
        """`base_url` is the API root that `/chat/completions` hangs off (…/v1).

        `reasoning_effort` ("low", …) is sent to reasoning models when set. `problem` is a
        configuration error (missing key, model, or URL) that every call reports instead
        of calling out.
        """
        self._api_key = api_key
        self.model = model
        self.provider = provider
        self.name = name
        self._problem = problem
        self._temperature = temperature
        self._reasoning_effort = reasoning_effort or None
        # Per model, learned from rejections: newer Claude models refuse `temperature`,
        # many open models can't do strict JSON-schema output, models that don't reason
        # refuse `reasoning_effort`, and OpenAI's newer models want max_completion_tokens.
        self._no_temperature: set[str] = set()
        self._no_reasoning_effort: set[str] = set()
        self._json_modes: dict[str, JsonMode] = {}
        self._max_completion_tokens: set[str] = set()
        headers = {"X-Title": "Contexa"} if provider == "openrouter" else {}
        self._client = httpx.AsyncClient(
            base_url=base_url, timeout=timeout, transport=transport, headers=headers
        )

    @property
    def configured(self) -> bool:
        return self._problem is None and bool(self._api_key)

    async def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: dict[str, Any],
        max_tokens: int = 800,
        model: str | None = None,
    ) -> dict[str, Any]:
        """One structured-output call. `model` overrides the default model for this call."""
        if self._problem:
            raise LLMError(self._problem)
        if not self._api_key:
            key = "ASSEMBLYAI_API_KEY" if self.provider == "assemblyai" else "LLM_API_KEY"
            raise LLMError(f"{key} is not configured on the server.")
        model = (model or self.model).strip()
        if not model:
            raise LLMError("LLM_MODEL is not configured on the server.")

        send_temperature = self._temperature is not None and model not in self._no_temperature
        send_effort = self._reasoning_effort is not None and model not in self._no_reasoning_effort
        mode = self._json_modes.get(model, "json_schema")
        waited = grown = False
        while True:
            payload = self._payload(
                model,
                system,
                user,
                schema_name,
                schema,
                max_tokens,
                mode,
                temperature=send_temperature,
                reasoning_effort=send_effort,
            )
            response = await self._post(payload)
            if response.status_code == 429 and not waited:
                waited = True
                await asyncio.sleep(_retry_after(response))
                continue
            if response.status_code in (400, 404, 422):
                detail = self._error_detail(response).lower()
                if send_temperature and "temperature" in detail:
                    send_temperature = False
                    self._no_temperature.add(model)
                    continue
                if send_effort and any(marker in detail for marker in _REASONING_ERRORS):
                    send_effort = False
                    self._no_reasoning_effort.add(model)
                    continue
                if "max_completion_tokens" in detail and "max_tokens" in payload:
                    self._max_completion_tokens.add(model)
                    continue
                if mode in _FALLBACK and any(marker in detail for marker in _FORMAT_ERRORS):
                    mode = _FALLBACK[mode]
                    self._json_modes[model] = mode
                    continue

            if response.status_code >= 400:
                detail = self._error_detail(response)
                message = f"{_capitalize(self.name)} returned HTTP {response.status_code}"
                raise LLMError(_sentence(f"{message}: {detail}" if detail else message))

            try:
                choice = response.json()["choices"][0]
                content = choice["message"].get("content")
                finish_reason = choice.get("finish_reason")
            except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
                raise LLMError(
                    f"{_capitalize(self.name)} returned an unexpected response."
                ) from exc
            try:
                return parse_json_content(content)
            except LLMError:
                if finish_reason != "length":
                    raise
                if grown:
                    raise LLMError(
                        "The model used up its token budget before finishing the reply. "
                        "Reasoning models think first: pick a faster model or set "
                        "LLM_REASONING_EFFORT=low."
                    ) from None
            # Cut off at max_tokens: reasoning models spend the budget on thinking before
            # they answer. One retry gets twice the room.
            grown = True
            max_tokens *= 2

    def _payload(
        self,
        model: str,
        system: str,
        user: str,
        schema_name: str,
        schema: dict[str, Any],
        max_tokens: int,
        mode: JsonMode,
        *,
        temperature: bool,
        reasoning_effort: bool,
    ) -> dict[str, Any]:
        if mode != "json_schema":
            # Without schema-constrained decoding, the prompt carries the schema.
            system = (
                f"{system}\n\nReply with one JSON object and nothing else. It must match "
                f"this JSON Schema:\n{json.dumps(schema, separators=(',', ':'))}"
            )
        new_tokens = self.provider == "openai" or model in self._max_completion_tokens
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_completion_tokens" if new_tokens else "max_tokens": max_tokens,
        }
        if mode == "json_schema":
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            }
            if self.provider == "openrouter":
                # Only route to endpoints that honour response_format.
                payload["provider"] = {"require_parameters": True}
        elif mode == "json_object":
            payload["response_format"] = {"type": "json_object"}
        if temperature:
            payload["temperature"] = self._temperature
        # Not for OpenRouter: with require_parameters, a reasoning parameter would limit
        # routing to reasoning models.
        if reasoning_effort and self.provider != "openrouter":
            payload["reasoning_effort"] = self._reasoning_effort
        return payload

    async def _post(self, payload: dict[str, Any]) -> httpx.Response:
        key = self._api_key or ""
        # The AssemblyAI gateway takes the raw key; OpenAI-compatible APIs take a bearer token.
        authorization = key if self.provider == "assemblyai" else f"Bearer {key}"
        try:
            return await self._client.post(
                "/chat/completions", json=payload, headers={"Authorization": authorization}
            )
        except httpx.TimeoutException as exc:
            raise LLMError(f"{_capitalize(self.name)} timed out.") from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"Couldn't reach {self.name} ({type(exc).__name__}).") from exc

    def _error_detail(self, response: httpx.Response) -> str:
        """The provider's own error message, shortened, so failures are diagnosable in the UI."""
        try:
            text = _find_message(response.json())
        except ValueError:
            text = response.text
        text = " ".join(text.split())
        if self._api_key:
            text = text.replace(self._api_key, "[redacted]")
        if len(text) > MAX_ERROR_DETAIL:
            text = f"{text[:MAX_ERROR_DETAIL].rstrip()}…"
        return text

    async def aclose(self) -> None:
        await self._client.aclose()


def _retry_after(response: httpx.Response) -> float:
    try:
        seconds = float(response.headers.get("retry-after", "2"))
    except ValueError:
        seconds = 2.0
    return min(MAX_RATE_LIMIT_WAIT, max(0.0, seconds))


def _find_message(body: Any) -> str:
    if isinstance(body, str):
        return body
    if isinstance(body, dict):
        for key in ("message", "msg", "error", "detail"):
            found = _find_message(body.get(key))
            if found:
                return found
    if isinstance(body, list) and body:
        return _find_message(body[0])
    return ""


def _sentence(text: str) -> str:
    return text if text.endswith((".", "!", "?", "…")) else f"{text}."


def parse_json_content(content: Any) -> dict[str, Any]:
    """Extract the JSON object from message content (string or content parts)."""
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    if not isinstance(content, str):
        raise LLMError("The model returned no text.")

    # Reasoning models may put their thinking inline before the answer.
    text = _THINK.sub("", content).strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise LLMError("The model didn't return JSON.") from None
        try:
            value = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise LLMError("The model didn't return valid JSON.") from exc

    if not isinstance(value, dict):
        raise LLMError("The model returned JSON that isn't an object.")
    return value
