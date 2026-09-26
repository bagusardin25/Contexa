"""Fetching documents from the web for import, without becoming a proxy into private networks.

Every hop is checked: http(s) only, no credentials in the URL, default ports, and every
address the host resolves to must be public. Redirects are followed by hand so each
target gets the same checks. Bodies are streamed and cut off at a size limit.
"""

import asyncio
import ipaddress
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

MAX_REDIRECTS = 4
USER_AGENT = "Contexa/0.1 (document import; +https://github.com/bagusardin25/Contexa)"

Resolver = Callable[[str, int], Awaitable[list[str]]]


class ImportFailed(Exception):
    """A user-facing reason the link couldn't be imported, with an HTTP status."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class Fetched:
    url: str
    media_type: str
    charset: str | None
    data: bytes


def _is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped  # ::ffff:127.0.0.1 is loopback, not a public IPv6 address
    return ip.is_global


async def system_resolver(host: str, port: int) -> list[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return sorted({info[4][0] for info in infos})


def _megabytes(limit: int) -> str:
    return f"{limit / (1024 * 1024):g} MB"


async def read_capped(response: httpx.Response, limit: int, what: str) -> bytes:
    declared = response.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise ImportFailed(f"{what} is larger than {_megabytes(limit)}.", 413)
    chunks: list[bytes] = []
    total = 0
    async for chunk in response.aiter_bytes():
        total += len(chunk)
        if total > limit:
            raise ImportFailed(f"{what} is larger than {_megabytes(limit)}.", 413)
        chunks.append(chunk)
    return b"".join(chunks)


class SafeFetcher:
    def __init__(
        self,
        *,
        max_bytes: int,
        timeout: float = 15.0,
        allow_private: bool = False,
        transport: httpx.AsyncBaseTransport | None = None,
        resolver: Resolver = system_resolver,
    ) -> None:
        self._max_bytes = max_bytes
        self._allow_private = allow_private
        self._resolver = resolver
        self._client = httpx.AsyncClient(
            timeout=timeout,
            transport=transport,
            follow_redirects=False,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,text/markdown,text/plain,application/pdf;q=0.9,*/*;q=0.5",
            },
        )

    async def fetch(self, url: str) -> Fetched:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            await self._check(current)
            try:
                async with self._client.stream("GET", current) as response:
                    if response.status_code in (301, 302, 303, 307, 308):
                        location = response.headers.get("location")
                        if not location:
                            raise ImportFailed("The page redirected without a target.", 502)
                        current = urljoin(current, location)
                        continue
                    if response.status_code >= 400:
                        raise ImportFailed(f"The page answered HTTP {response.status_code}.", 502)
                    data = await read_capped(response, self._max_bytes, "The page")
                    content_type = response.headers.get("content-type", "")
            except httpx.TimeoutException as exc:
                raise ImportFailed("The page took too long to respond.", 504) from exc
            except httpx.HTTPError as exc:
                raise ImportFailed(f"Couldn't reach the page ({type(exc).__name__}).", 502) from exc
            media_type, _, params = content_type.partition(";")
            charset = None
            for param in params.split(";"):
                key, _, value = param.strip().partition("=")
                if key.lower() == "charset" and value:
                    charset = value.strip('"').lower()
            return Fetched(
                url=current, media_type=media_type.strip().lower(), charset=charset, data=data
            )
        raise ImportFailed("The page redirected too many times.", 502)

    async def _check(self, url: str) -> None:
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https"):
            raise ImportFailed("Only http:// and https:// links can be imported.", 422)
        if not parts.hostname:
            raise ImportFailed("That doesn't look like a web address.", 422)
        if parts.username or parts.password:
            raise ImportFailed("Links with a user name or password can't be imported.", 422)
        if self._allow_private:
            return
        if parts.port not in (None, 80, 443):
            raise ImportFailed("Only links on the standard web ports can be imported.", 422)
        host = parts.hostname
        try:
            addresses = [str(ipaddress.ip_address(host))]
        except ValueError:
            try:
                addresses = await self._resolver(host, parts.port or 443)
            except OSError as exc:
                raise ImportFailed(f"Couldn't find the server {host}.", 502) from exc
        if not addresses or not all(_is_public(a) for a in addresses):
            raise ImportFailed(
                "That address points to a private or local network, so it can't be imported.",
                422,
            )

    async def aclose(self) -> None:
        await self._client.aclose()


class GitHubClient:
    """Downloads a repository as one zipball: a single API request, whatever its size."""

    def __init__(
        self,
        *,
        api_base_url: str,
        token: str | None,
        max_bytes: int,
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._max_bytes = max_bytes
        self._client = httpx.AsyncClient(
            base_url=api_base_url.rstrip("/"),
            timeout=timeout,
            transport=transport,
            # The zipball answers with a redirect to codeload.github.com.
            follow_redirects=True,
            headers=headers,
        )

    async def zipball(self, owner: str, repo: str, ref: str | None) -> bytes:
        path = f"/repos/{owner}/{repo}/zipball" + (f"/{ref}" if ref else "")
        try:
            async with self._client.stream("GET", path) as response:
                if response.status_code == 404:
                    raise ImportFailed(
                        f"GitHub has no public repository {owner}/{repo}"
                        + (f" at {ref}" if ref else "")
                        + ". For a private one, set GITHUB_TOKEN on the server.",
                        # Not 404: clients read a 404 from this API as "session not found".
                        422,
                    )
                if response.status_code in (403, 429):
                    raise ImportFailed(
                        "GitHub's rate limit was reached (60 requests an hour without a token). "
                        "Set GITHUB_TOKEN on the server or try again later.",
                        429,
                    )
                if response.status_code >= 400:
                    raise ImportFailed(f"GitHub answered HTTP {response.status_code}.", 502)
                return await read_capped(response, self._max_bytes, "The repository")
        except httpx.TimeoutException as exc:
            raise ImportFailed("GitHub took too long to send the repository.", 504) from exc
        except httpx.HTTPError as exc:
            raise ImportFailed(f"Couldn't reach GitHub ({type(exc).__name__}).", 502) from exc

    async def aclose(self) -> None:
        await self._client.aclose()
