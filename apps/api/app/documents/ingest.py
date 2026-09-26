"""One path from raw bytes to a searchable document, whatever the source (upload, web
page, GitHub file): validate, parse, extract keyterms, chunk, index, and embed."""

import logging

from starlette.concurrency import run_in_threadpool

from app.llm.embeddings import EmbeddingClient, EmbeddingError
from app.rag.index import Chunk
from app.store.memory import DocumentRecord, SessionState

from .chunking import chunk_sections
from .keyterms import extract_keyterms
from .parsing import DocumentParseError, Section, parse_document
from .validation import content_problem

logger = logging.getLogger("contexa.documents")


def _embedding_text(chunk: Chunk) -> str:
    return f"{chunk.heading}\n{chunk.content}" if chunk.heading else chunk.content


async def ingest_document(
    session: SessionState, record: DocumentRecord, data: bytes, embedder: EmbeddingClient
) -> DocumentRecord:
    """Index an uploaded file into the session and attach `record` (ready or failed) to it."""
    problem = content_problem(data, record.kind)
    if problem is None:
        try:
            sections = await run_in_threadpool(parse_document, data, record.kind)
        except DocumentParseError as exc:
            problem = str(exc)
        else:
            return await ingest_sections(session, record, sections, embedder)
    record.error = problem
    session.documents[record.id] = record
    _log(session, record)
    return record


async def ingest_sections(
    session: SessionState,
    record: DocumentRecord,
    sections: list[Section],
    embedder: EmbeddingClient,
) -> DocumentRecord:
    """Index already-parsed sections (an imported page or repository) into the session."""
    keyterms = await run_in_threadpool(extract_keyterms, sections)
    chunks = chunk_sections(sections, record.id, record.name)
    session.index.add(chunks)
    record.status, record.chunk_count, record.keyterms = "ready", len(chunks), keyterms
    record.error = None
    record.embedded = await _embed(session, record, chunks, embedder)
    session.documents[record.id] = record
    _log(session, record)
    return record


def _log(session: SessionState, record: DocumentRecord) -> None:
    logger.info(
        "document %s session=%s kind=%s status=%s embedded=%s",
        record.id,
        session.id,
        record.kind,
        record.status,
        record.embedded,
    )


async def _embed(
    session: SessionState, record: DocumentRecord, chunks: list[Chunk], embedder: EmbeddingClient
) -> bool:
    """Semantic search is a bonus: when embeddings fail, BM25 still covers the document."""
    if not embedder.enabled or not chunks:
        return False
    try:
        vectors = await embedder.embed([_embedding_text(chunk) for chunk in chunks])
    except EmbeddingError as exc:
        logger.warning("embeddings failed for %s: %s", record.id, exc)
        return False
    session.vectors.add(record.id, {c.id: v for c, v in zip(chunks, vectors, strict=True)})
    return True
