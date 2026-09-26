import asyncio
import json
import math

import httpx
import pytest

from app.config import Settings
from app.llm.embeddings import EmbeddingClient, EmbeddingError, normalize
from app.rag.hybrid import hybrid_search
from app.rag.index import Chunk, LexicalIndex
from app.rag.vectors import VectorIndex

from .conftest import ORIGIN, README, FakeEmbeddings, FakeLLM, FakeTokens, build_client, fake_vector


def _client(handler, **options) -> EmbeddingClient:
    return EmbeddingClient(
        api_key=options.pop("api_key", "emb-key"),
        model=options.pop("model", "fake-embed"),
        base_url=options.pop("base_url", "https://embeddings.test/v1"),
        timeout=5,
        transport=httpx.MockTransport(handler),
        **options,
    )


def test_embedding_requests_and_unit_vectors(fake_embeddings: FakeEmbeddings) -> None:
    client = _client(fake_embeddings.handler, dimensions=768)
    texts = [f"optimistic locking {i}" for i in range(70)]
    vectors = asyncio.run(client.embed(texts))

    assert len(vectors) == 70
    assert [len(r["input"]) for r in fake_embeddings.requests] == [64, 6]  # batched
    first = fake_embeddings.requests[0]
    assert first["model"] == "fake-embed" and first["dimensions"] == 768
    assert fake_embeddings.headers[0]["authorization"] == "Bearer emb-key"
    # Sorted back by index and unit-length.
    assert math.isclose(sum(v * v for v in vectors[0]), 1.0, rel_tol=1e-5)
    expected = normalize(fake_vector(texts[0]))
    assert all(math.isclose(a, b, rel_tol=1e-5) for a, b in zip(vectors[0], expected, strict=True))


def test_embedding_errors_are_clear_and_redacted() -> None:
    def refuse(_: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "bad key emb-key"}})

    with pytest.raises(EmbeddingError, match=r"HTTP 401: .*\[redacted\]"):
        asyncio.run(_client(refuse).embed(["x"]))

    def short(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": []})

    with pytest.raises(EmbeddingError, match="0 vectors for 1"):
        asyncio.run(_client(short).embed(["x"]))

    disabled = _client(refuse, api_key=None)
    assert not disabled.enabled
    with pytest.raises(EmbeddingError, match="isn't configured"):
        asyncio.run(disabled.embed(["x"]))


def test_dimensions_are_only_sent_when_set(fake_embeddings: FakeEmbeddings) -> None:
    asyncio.run(_client(fake_embeddings.handler).embed(["x"]))
    assert "dimensions" not in fake_embeddings.requests[0]


def settings(**values) -> Settings:
    return Settings(_env_file=None, **values)


def test_embedding_settings_follow_the_llm_provider_when_they_can() -> None:
    gemini = settings(llm_provider="gemini", llm_api_key="g-key", llm_model="gemini-2.5-flash")
    assert gemini.embedding_kind == "gemini" and gemini.embeddings_enabled
    assert gemini.embedding_key == "g-key"
    assert gemini.embedding_model_name == "gemini-embedding-001"
    assert gemini.embedding_base == "https://generativelanguage.googleapis.com/v1beta/openai"

    # Groq has no embeddings: BM25 only, unless Gemini is named with its own key.
    groq = settings(llm_provider="groq", llm_api_key="gsk", llm_model="m")
    assert groq.embedding_kind == "none" and not groq.embeddings_enabled
    groq_gemini = settings(
        llm_provider="groq",
        llm_api_key="gsk",
        llm_model="m",
        embedding_provider="gemini",
        embedding_api_key=" g-key ",
    )
    assert groq_gemini.embeddings_enabled and groq_gemini.embedding_key == "g-key"
    # Without its own key, another provider's key is never borrowed.
    borrowed = settings(llm_provider="groq", llm_api_key="gsk", embedding_provider="gemini")
    assert borrowed.embedding_key is None and not borrowed.embeddings_enabled

    off = settings(llm_provider="openai", llm_api_key="sk", embedding_provider="none")
    assert not off.embeddings_enabled
    openai = settings(llm_provider="openai", llm_api_key="sk", llm_model="gpt")
    assert openai.embedding_model_name == "text-embedding-3-small"


def _chunk(chunk_id: str, content: str, heading: str | None = None) -> Chunk:
    return Chunk(
        id=chunk_id,
        document_id="doc",
        document_name="notes.md",
        index=int(chunk_id[1:]),
        content=content,
        heading=heading,
    )


CHUNKS = [
    _chunk("c0", "Each note row carries a version column; writes use optimistic locking."),
    _chunk("c1", "Pricing will be evaluated after the Q4 pilot with partner campuses."),
    _chunk("c2", "Changes are broadcast over one realtime channel per note."),
]


def _indexes() -> tuple[LexicalIndex, VectorIndex]:
    lexical, vectors = LexicalIndex(), VectorIndex()
    lexical.add(CHUNKS)
    vectors.add("doc", {c.id: normalize(fake_vector(c.content)) for c in CHUNKS})
    return lexical, vectors


def test_semantic_search_finds_passages_without_shared_words() -> None:
    lexical, vectors = _indexes()
    question = "Berapa harga setelah uji coba?"  # Indonesian: no word in common with c1
    assert lexical.search([question], []) == []
    results = hybrid_search(
        lexical,
        vectors,
        texts=[question],
        keywords=[],
        query_vector=normalize(fake_vector(question)),
        limit=3,
        min_similarity=0.5,
    )
    assert [r.chunk.id for r in results] == ["c1"]
    assert results[0].score >= 0.9 and results[0].highlights == []


def test_hybrid_fuses_both_and_drops_weak_semantic_tails() -> None:
    lexical, vectors = _indexes()
    question = "How do concurrent edits work with the version column?"
    results = hybrid_search(
        lexical,
        vectors,
        texts=[question],
        keywords=["optimistic locking", "version column"],
        query_vector=normalize(fake_vector(question)),
        limit=3,
        min_similarity=0.5,
    )
    ids = [r.chunk.id for r in results]
    assert ids[0] == "c0"  # first in both lists
    assert "c1" not in ids  # unrelated: below the similarity floor
    assert "version column" in results[0].highlights

    # Without a query vector, it's plain BM25.
    lexical_only = hybrid_search(
        lexical,
        vectors,
        texts=[question],
        keywords=["optimistic locking"],
        query_vector=None,
        limit=3,
        min_similarity=0.5,
    )
    assert [r.chunk.id for r in lexical_only] == ["c0"]


def test_removed_documents_leave_semantic_search() -> None:
    lexical, vectors = _indexes()
    lexical.remove_document("doc")
    vectors.remove_document("doc")
    assert len(vectors) == 0
    question = "What does it cost?"
    assert (
        hybrid_search(
            lexical,
            vectors,
            texts=[question],
            keywords=[],
            query_vector=normalize(fake_vector(question)),
            limit=3,
            min_similarity=0.5,
        )
        == []
    )


def test_uploads_are_embedded_and_answers_cite_by_meaning(
    fake_llm: FakeLLM, fake_tokens: FakeTokens, fake_embeddings: FakeEmbeddings
) -> None:
    # The analysis returns no usable keywords, and the question shares no words with the
    # roadmap section: only semantic search can find it.
    fake_llm.responses["turn_analysis"] = {
        "source_language": "id",
        "translation": "",
        "technical_terms_preserved": [],
        "type": "question",
        "requires_answer": True,
        "confidence": 0.9,
        "search_keywords": [],
    }
    with build_client(fake_llm, fake_tokens, embeddings=fake_embeddings) as client:
        assert client.get("/health").json()["embeddingModel"] == "fake-embed"
        session_id = client.post("/api/sessions", json={"displayLanguage": "id"}).json()["id"]
        doc = client.post(
            f"/api/sessions/{session_id}/documents", files={"file": ("README.md", README)}
        ).json()
        assert doc["status"] == "ready" and doc["embedded"] is True
        with client.websocket_connect(
            f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}
        ) as ws:
            ws.send_json(
                {
                    "type": "turn_final",
                    "turn": {
                        "id": "t1",
                        "speaker": "B",
                        "text": "Berapa harga setelah uji coba?",
                        "detectedLanguage": "id",
                        "startedAtMs": 0,
                        "endedAtMs": 1000,
                    },
                }
            )
            events = []
            while not events or events[-1]["type"] != "suggestion_ready":
                events.append(ws.receive_json())
    evidence = next(e for e in events if e["type"] == "suggestion_evidence")["evidence"]
    assert [item["location"] for item in evidence][:1] == ["Roadmap"]
    # One embedding call for the document's chunks, one for the question.
    assert len(fake_embeddings.requests) == 2
    answer_prompt = json.dumps(fake_llm.calls("grounded_answer")[0]["messages"])
    assert "Pricing will be evaluated" in answer_prompt


def test_embedding_failures_fall_back_to_bm25(
    fake_llm: FakeLLM, fake_tokens: FakeTokens, fake_embeddings: FakeEmbeddings
) -> None:
    fake_embeddings.failing = True
    with build_client(fake_llm, fake_tokens, embeddings=fake_embeddings) as client:
        session_id = client.post("/api/sessions", json={}).json()["id"]
        doc = client.post(
            f"/api/sessions/{session_id}/documents", files={"file": ("README.md", README)}
        ).json()
    assert doc["status"] == "ready" and doc["embedded"] is False and doc["chunkCount"] > 0
