"""Who owns a saved meeting: a signed-in Supabase user, or else this browser's device key.

A Supabase access token is checked with Supabase itself (`GET /auth/v1/user`), so the API
needs no JWT secret and works with both legacy and asymmetric signing keys. Answers are
cached for a few minutes. Without a token (or without Supabase on the server), a random
key the browser keeps in localStorage identifies the device; only its hash is stored.
"""

import hashlib
import logging
import re
import time
from typing import Annotated

import httpx
from fastapi import Depends, Header, HTTPException, Request

logger = logging.getLogger("contexa.auth")

CACHE_SECONDS = 300
MAX_CACHE = 1000
DEVICE_KEY = re.compile(r"^[A-Za-z0-9_-]{32,128}$")


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class SupabaseAuth:
    def __init__(
        self,
        *,
        url: str,
        anon_key: str | None,
        timeout: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._url = url.strip().rstrip("/")
        self._anon_key = anon_key
        self._client = httpx.AsyncClient(timeout=timeout, transport=transport)
        self._cache: dict[str, tuple[float, str | None]] = {}

    @property
    def enabled(self) -> bool:
        return bool(self._url and self._anon_key)

    async def user_id(self, token: str) -> str | None:
        """The user id behind an access token, or None when Supabase rejects it."""
        key = _sha256(token)
        now = time.monotonic()
        cached = self._cache.get(key)
        if cached and cached[0] > now:
            return cached[1]
        try:
            response = await self._client.get(
                f"{self._url}/auth/v1/user",
                headers={"apikey": self._anon_key or "", "Authorization": f"Bearer {token}"},
            )
        except httpx.HTTPError as exc:
            logger.warning("supabase auth check failed: %s", type(exc).__name__)
            raise HTTPException(503, "Couldn't check your sign-in with Supabase.") from exc
        if response.status_code in (401, 403):
            user = None
        elif response.status_code >= 400:
            logger.warning("supabase auth check returned HTTP %d", response.status_code)
            raise HTTPException(503, "Couldn't check your sign-in with Supabase.")
        else:
            user = str(response.json().get("id") or "") or None
        if len(self._cache) >= MAX_CACHE:
            self._cache = {k: v for k, v in self._cache.items() if v[0] > now}
            if len(self._cache) >= MAX_CACHE:
                self._cache.clear()
        self._cache[key] = (now + CACHE_SECONDS, user)
        return user

    async def aclose(self) -> None:
        await self._client.aclose()


def get_auth(request: Request) -> SupabaseAuth:
    return request.app.state.auth


async def get_owner(
    auth: Annotated[SupabaseAuth, Depends(get_auth)],
    authorization: Annotated[str | None, Header()] = None,
    x_contexa_device: Annotated[str | None, Header()] = None,
) -> str:
    """`user:{id}` for a signed-in user, `device:{hash}` for this browser, or 401."""
    scheme, _, token = (authorization or "").partition(" ")
    if auth.enabled and scheme.lower() == "bearer" and token.strip():
        user = await auth.user_id(token.strip())
        if user is None:
            raise HTTPException(401, "Your sign-in has expired. Sign in again.")
        return f"user:{user}"
    if x_contexa_device and DEVICE_KEY.match(x_contexa_device):
        return f"device:{_sha256(x_contexa_device)[:40]}"
    raise HTTPException(401, "Sign in, or allow this browser to keep a device key.")


OwnerDep = Annotated[str, Depends(get_owner)]
