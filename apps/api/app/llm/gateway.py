"""The one client for the AssemblyAI LLM Gateway (guide §17–19).

Every translation, classification, and answer call goes through `complete_json`,
which requests a strict JSON-schema structured output.
"""

import json
import re
from typing import Any

import httpx

MAX_ERROR_DETAIL = 200


class LLMError(Exception):
    """A gateway call failed; callers degrade instead of crashing the session."""


class LLMGateway:
    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        base_url: str,
        timeout: float,
        temperature: float | None = 0.2,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self.model = model
        self._temperature = temperature
        # Newer Claude models reject `temperature`; once a model does, it's no longer sent.
        self._no_temperature: set[str] = set()
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout, transport=transport)

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

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
        if not self._api_key:
            raise LLMError("ASSEMBLYAI_API_KEY is not configured on the server.")

        model = model or self.model
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        }
        send_temperature = self._temperature is not None and model not in self._no_temperature
        if send_temperature:
            payload["temperature"] = self._temperature

        response = await self._post(payload)
        if (
            response.status_code == 400
            and send_temperature
            and "temperature" in self._error_detail(response).lower()
        ):
            self._no_temperature.add(model)
            del payload["temperature"]
            response = await self._post(payload)

        if response.status_code >= 400:
            detail = self._error_detail(response)
            message = f"The LLM Gateway returned HTTP {response.status_code}"
            raise LLMError(_sentence(f"{message}: {detail}" if detail else message))

        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMError("The LLM Gateway returned an unexpected response.") from exc
        return parse_json_content(content)

    async def _post(self, payload: dict[str, Any]) -> httpx.Response:
        try:
            return await self._client.post(
                "/v1/chat/completions",
                json=payload,
                headers={"Authorization": self._api_key or ""},
            )
        except httpx.TimeoutException as exc:
            raise LLMError("The LLM Gateway timed out.") from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"Couldn't reach the LLM Gateway ({type(exc).__name__}).") from exc

    def _error_detail(self, response: httpx.Response) -> str:
        """The gateway's own error message, shortened, so failures are diagnosable in the UI."""
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

    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
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
