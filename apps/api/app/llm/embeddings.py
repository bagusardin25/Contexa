"""Embeddings for semantic retrieval, from any OpenAI-compatible `/embeddings` API.

Gemini's OpenAI-compatible endpoint offers `gemini-embedding-001` on its free tier;
OpenAI offers `text-embedding-3-small`. Vectors come back unit-length, so the dot
product of two of them is their cosine similarity.
"""

import math
from array import array
from collections.abc import Sequence

import httpx

BATCH_SIZE = 64
MAX_INPUT_CHARS = 8000
MAX_ERROR_DETAIL = 200


class EmbeddingError(Exception):
    """An embedding call failed; callers fall back to lexical search."""


Vector = array  # array("f"): 4 bytes per dimension instead of a list of Python floats


def normalize(values: Sequence[float]) -> Vector:
    norm = math.sqrt(sum(value * value for value in values)) or 1.0
    return array("f", (value / norm for value in values))


def cosine(a: Vector, b: Vector) -> float:
    """Both unit-length: the dot product is the cosine similarity."""
    if len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=True))


class EmbeddingClient:
    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        base_url: str,
        timeout: float,
        dimensions: int | None = None,
        name: str = "the embedding provider",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self.model = model
        self._dimensions = dimensions
        self.name = name
        self._client = httpx.AsyncClient(
            base_url=base_url or "http://embeddings.invalid", timeout=timeout, transport=transport
        )
        self._enabled = bool(api_key and model and base_url)

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def embed(self, texts: Sequence[str]) -> list[Vector]:
        """One unit-length vector per text, in order."""
        if not self._enabled:
            raise EmbeddingError("Semantic search isn't configured.")
        vectors: list[Vector] = []
        for start in range(0, len(texts), BATCH_SIZE):
            batch = [text[:MAX_INPUT_CHARS] or " " for text in texts[start : start + BATCH_SIZE]]
            vectors.extend(await self._embed_batch(batch))
        return vectors

    async def _embed_batch(self, batch: list[str]) -> list[Vector]:
        payload: dict[str, object] = {"model": self.model, "input": batch}
        if self._dimensions:
            payload["dimensions"] = self._dimensions
        try:
            response = await self._client.post(
                "/embeddings", json=payload, headers={"Authorization": f"Bearer {self._api_key}"}
            )
        except httpx.TimeoutException as exc:
            raise EmbeddingError(f"{self.name} timed out.") from exc
        except httpx.HTTPError as exc:
            raise EmbeddingError(f"Couldn't reach {self.name} ({type(exc).__name__}).") from exc
        if response.status_code >= 400:
            detail = " ".join(response.text.split())[:MAX_ERROR_DETAIL]
            if self._api_key:
                detail = detail.replace(self._api_key, "[redacted]")
            raise EmbeddingError(f"{self.name} returned HTTP {response.status_code}: {detail}")
        try:
            items = sorted(response.json()["data"], key=lambda item: item.get("index", 0))
            vectors = [normalize(item["embedding"]) for item in items]
        except (ValueError, KeyError, TypeError) as exc:
            raise EmbeddingError(f"{self.name} returned an unexpected response.") from exc
        if len(vectors) != len(batch):
            raise EmbeddingError(f"{self.name} returned {len(vectors)} vectors for {len(batch)}.")
        return vectors

    async def aclose(self) -> None:
        await self._client.aclose()
