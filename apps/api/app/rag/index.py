"""Lexical retrieval (BM25) over a session's document chunks.

PRD §16 asks for a fallback that works without an embedding provider; this is it.
An embedding retriever (Supabase + pgvector) can sit behind the same `search` call.
"""

import math
import re
from collections import Counter
from dataclasses import dataclass

from .tokenize import tokenize

K1 = 1.5
B = 0.75


@dataclass(frozen=True)
class Chunk:
    id: str
    document_id: str
    document_name: str
    index: int
    content: str
    page: int | None = None
    heading: str | None = None

    @property
    def location(self) -> str:
        parts = []
        if self.page is not None:
            parts.append(f"p. {self.page}")
        if self.heading:
            parts.append(self.heading)
        return " · ".join(parts) or f"Chunk {self.index + 1}"


@dataclass(frozen=True)
class ScoredChunk:
    chunk: Chunk
    score: float
    """Share of the query's (idf-weighted) key terms found in the chunk, 0–1."""
    highlights: list[str]


class LexicalIndex:
    def __init__(self) -> None:
        self._chunks: dict[str, Chunk] = {}
        self._term_freqs: dict[str, Counter[str]] = {}
        self._lengths: dict[str, int] = {}
        self._doc_freq: Counter[str] = Counter()

    def __len__(self) -> int:
        return len(self._chunks)

    def add(self, chunks: list[Chunk]) -> None:
        for chunk in chunks:
            tokens = tokenize(
                chunk.content if not chunk.heading else f"{chunk.heading}\n{chunk.content}"
            )
            freqs = Counter(tokens)
            self._chunks[chunk.id] = chunk
            self._term_freqs[chunk.id] = freqs
            self._lengths[chunk.id] = len(tokens)
            self._doc_freq.update(freqs.keys())

    def remove_document(self, document_id: str) -> None:
        for chunk_id in [cid for cid, c in self._chunks.items() if c.document_id == document_id]:
            self._doc_freq.subtract(self._term_freqs[chunk_id].keys())
            del self._chunks[chunk_id], self._term_freqs[chunk_id], self._lengths[chunk_id]
        self._doc_freq += Counter()  # drop zero counts

    def _idf(self, term: str) -> float:
        n = len(self._chunks)
        df = self._doc_freq.get(term, 0)
        return math.log(1 + (n - df + 0.5) / (df + 0.5))

    def search(
        self,
        texts: list[str],
        keywords: list[str],
        *,
        limit: int = 3,
        min_score: float = 0.25,
    ) -> list[ScoredChunk]:
        """Rank chunks for a question.

        `texts` (the spoken question and its translation) and `keywords` (terms
        extracted by turn analysis) both feed BM25; keywords count double. The
        displayed score is the idf-weighted share of key terms a chunk contains.
        """
        if not self._chunks:
            return []

        keyword_tokens = [t for kw in keywords for t in tokenize(kw)]
        query = Counter(t for text in texts for t in tokenize(text))
        for token in keyword_tokens:
            query[token] += 2

        vocabulary = {t for t in query if self._doc_freq.get(t, 0) > 0}
        if not vocabulary:
            return []
        key_terms = {t for t in keyword_tokens if t in vocabulary} or vocabulary
        key_mass = sum(self._idf(t) for t in key_terms)
        average_length = sum(self._lengths.values()) / len(self._lengths)

        ranked: list[tuple[float, float, Chunk]] = []
        for chunk_id, freqs in self._term_freqs.items():
            bm25 = 0.0
            for term in vocabulary:
                tf = freqs.get(term, 0)
                if not tf:
                    continue
                norm = tf + K1 * (1 - B + B * self._lengths[chunk_id] / average_length)
                bm25 += query[term] * self._idf(term) * tf * (K1 + 1) / norm
            if bm25 <= 0:
                continue
            coverage = sum(self._idf(t) for t in key_terms if freqs.get(t)) / key_mass
            ranked.append((bm25, coverage, self._chunks[chunk_id]))

        ranked.sort(key=lambda item: item[0], reverse=True)
        if not ranked:
            return []
        top = ranked[0][0]
        results = []
        for bm25, coverage, chunk in ranked:
            if coverage < min_score or bm25 < top * 0.35:
                continue
            results.append(
                ScoredChunk(
                    chunk=chunk,
                    score=round(min(1.0, coverage), 2),
                    highlights=_highlights(chunk.content, keywords, key_terms),
                )
            )
            if len(results) == limit:
                break
        return results


def _highlights(content: str, keywords: list[str], terms: set[str]) -> list[str]:
    """Phrases to mark in the snippet, in the chunk's own casing."""
    found: dict[str, str] = {}
    lowered = content.lower()
    for keyword in sorted(keywords, key=len, reverse=True):
        start = lowered.find(keyword.lower().strip())
        if keyword.strip() and start >= 0:
            phrase = content[start : start + len(keyword.strip())]
            found.setdefault(phrase.lower(), phrase)
    for term in terms:
        if not term.isascii() or len(term) < 3:
            continue
        match = re.search(rf"\b{re.escape(term)}\w*", content, flags=re.IGNORECASE)
        if match and not any(match.group(0).lower() in key for key in found):
            found.setdefault(match.group(0).lower(), match.group(0))
    return sorted(found.values(), key=len, reverse=True)[:6]


def make_snippet(content: str, highlights: list[str], max_chars: int = 600) -> str:
    """The chunk text, trimmed around the first highlight when it's long."""
    if len(content) <= max_chars:
        return content
    lowered = content.lower()
    positions = [lowered.find(h.lower()) for h in highlights if lowered.find(h.lower()) >= 0]
    center = min(positions) if positions else 0
    start = max(0, min(center - max_chars // 4, len(content) - max_chars))
    snippet = content[start : start + max_chars].strip()
    return f"{'…' if start > 0 else ''}{snippet}{'…' if start + max_chars < len(content) else ''}"
