"""Semantic retrieval: chunk embeddings for one session, kept in memory.

Sessions are short-lived, so their vectors live as long as the session does. The
durable vectors (saved meetings) live in Postgres with pgvector (`app/store/database.py`).
"""

from app.llm.embeddings import Vector, cosine


class VectorIndex:
    def __init__(self) -> None:
        self._vectors: dict[str, Vector] = {}
        self._documents: dict[str, str] = {}

    def __len__(self) -> int:
        return len(self._vectors)

    def add(self, document_id: str, vectors: dict[str, Vector]) -> None:
        for chunk_id, vector in vectors.items():
            self._vectors[chunk_id] = vector
            self._documents[chunk_id] = document_id

    def remove_document(self, document_id: str) -> None:
        for chunk_id in [cid for cid, doc in self._documents.items() if doc == document_id]:
            del self._vectors[chunk_id], self._documents[chunk_id]

    def search(self, query: Vector, *, limit: int) -> list[tuple[str, float]]:
        """The closest chunks as (chunk id, cosine similarity), best first."""
        scored = [(chunk_id, cosine(query, vector)) for chunk_id, vector in self._vectors.items()]
        scored.sort(key=lambda item: item[1], reverse=True)
        return scored[:limit]
