"""Hybrid retrieval: BM25 and embeddings, merged with reciprocal rank fusion (RRF).

Lexical search finds exact names and identifiers; semantic search finds passages that
say the same thing in other words or another language. A chunk ranked well by either
one can be cited.
"""

from collections import defaultdict

from app.llm.embeddings import Vector

from .index import LexicalIndex, ScoredChunk, keyword_highlights
from .vectors import VectorIndex

RRF_K = 60
CANDIDATES = 8
# A semantic match must also be close to the best one, so a weak tail isn't cited.
SIMILARITY_MARGIN = 0.12


def hybrid_search(
    lexical: LexicalIndex,
    vectors: VectorIndex,
    *,
    texts: list[str],
    keywords: list[str],
    query_vector: Vector | None,
    limit: int,
    min_similarity: float,
) -> list[ScoredChunk]:
    lexical_hits = lexical.search(texts, keywords, limit=CANDIDATES)
    semantic_hits: list[tuple[str, float]] = []
    if query_vector is not None and len(vectors):
        ranked = vectors.search(query_vector, limit=CANDIDATES)
        if ranked:
            floor = max(min_similarity, ranked[0][1] - SIMILARITY_MARGIN)
            semantic_hits = [(chunk_id, sim) for chunk_id, sim in ranked if sim >= floor]
    if not semantic_hits:
        return lexical_hits[:limit]

    fused: dict[str, float] = defaultdict(float)
    for rank, hit in enumerate(lexical_hits, start=1):
        fused[hit.chunk.id] += 1 / (RRF_K + rank)
    for rank, (chunk_id, _) in enumerate(semantic_hits, start=1):
        fused[chunk_id] += 1 / (RRF_K + rank)

    lexical_by_id = {hit.chunk.id: hit for hit in lexical_hits}
    similarity = dict(semantic_hits)
    results: list[ScoredChunk] = []
    for chunk_id in sorted(fused, key=lambda cid: fused[cid], reverse=True):
        hit = lexical_by_id.get(chunk_id)
        chunk = hit.chunk if hit else lexical.get(chunk_id)
        if chunk is None:  # removed since it was embedded
            continue
        # The displayed relevance: key-term coverage or semantic similarity, whichever is higher.
        score = max(hit.score if hit else 0.0, similarity.get(chunk_id, 0.0))
        results.append(
            ScoredChunk(
                chunk=chunk,
                score=round(min(1.0, score), 2),
                highlights=hit.highlights if hit else keyword_highlights(chunk.content, keywords),
            )
        )
        if len(results) == limit:
            break
    return results
