"""The one client for the AssemblyAI LLM Gateway (guide §17–19).

Every translation, classification, and answer call goes through `complete_json`,
which requests a strict JSON-schema structured output.
"""

import json
import re
from typing import Any

import httpx


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
    ) -> dict[str, Any]:
        if not self._api_key:
            raise LLMError("ASSEMBLYAI_API_KEY is not configured on the server.")

        payload: dict[str, Any] = {
            "model": self.model,
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
        if self._temperature is not None:
            payload["temperature"] = self._temperature

        try:
            response = await self._client.post(
                "/v1/chat/completions",
                json=payload,
                headers={"Authorization": self._api_key},
            )
        except httpx.TimeoutException as exc:
            raise LLMError("The LLM Gateway timed out.") from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"Couldn't reach the LLM Gateway ({type(exc).__name__}).") from exc

        if response.status_code >= 400:
            raise LLMError(f"The LLM Gateway returned HTTP {response.status_code}.")

        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMError("The LLM Gateway returned an unexpected response.") from exc
        return parse_json_content(content)

    async def aclose(self) -> None:
        await self._client.aclose()


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
