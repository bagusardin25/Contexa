"""Short-lived AssemblyAI streaming tokens (guide §10).

The browser streams audio straight to AssemblyAI with a token minted here; the raw
API key never leaves the server.
"""

from dataclasses import dataclass

import httpx


class StreamingTokenError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class StreamingToken:
    token: str
    expires_in_seconds: int


class StreamingTokenClient:
    def __init__(
        self,
        *,
        api_key: str | None,
        base_url: str,
        timeout: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout, transport=transport)

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def create(self, *, expires_in_seconds: int, max_session_seconds: int) -> StreamingToken:
        if not self._api_key:
            raise StreamingTokenError("ASSEMBLYAI_API_KEY is not configured on the server.", 503)
        try:
            response = await self._client.get(
                "/v3/token",
                params={
                    "expires_in_seconds": expires_in_seconds,
                    "max_session_duration_seconds": max_session_seconds,
                },
                headers={"Authorization": self._api_key},
            )
        except httpx.HTTPError as exc:
            raise StreamingTokenError(f"Couldn't reach AssemblyAI ({type(exc).__name__}).") from exc

        if response.status_code in (401, 403):
            raise StreamingTokenError("AssemblyAI rejected the server's API key.")
        if response.status_code >= 400:
            raise StreamingTokenError(f"AssemblyAI returned HTTP {response.status_code}.")

        try:
            body = response.json()
            return StreamingToken(
                token=str(body["token"]),
                expires_in_seconds=int(body.get("expires_in_seconds", expires_in_seconds)),
            )
        except (ValueError, KeyError, TypeError) as exc:
            raise StreamingTokenError("AssemblyAI returned an unexpected token response.") from exc

    async def aclose(self) -> None:
        await self._client.aclose()
