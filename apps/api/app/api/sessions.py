import logging
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.assemblyai.routing import ENCODING, SAMPLE_RATE, speech_model_for, websocket_url
from app.assemblyai.tokens import StreamingTokenError
from app.documents.chunking import chunk_sections
from app.documents.parsing import DocumentParseError, parse_document
from app.documents.validation import UploadRejected, content_problem, detect_kind, sanitize_filename
from app.models.session import (
    AnswerRequest,
    DocumentOut,
    SessionConfig,
    SessionOut,
    StreamTokenOut,
    SuggestionOut,
    TranscriptOut,
)
from app.store.memory import DocumentRecord, new_id

from .deps import PipelineDep, SessionDep, SettingsDep, StoreDep, TokenClientDep

logger = logging.getLogger("contexa.api")
router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_session(config: SessionConfig, store: StoreDep) -> SessionOut:
    """FR-001: a session with its languages and response settings."""
    return store.create(config).to_out()


@router.get("/{session_id}")
async def get_session(session: SessionDep) -> SessionOut:
    return session.to_out()


@router.post("/{session_id}/end")
async def end_session(session: SessionDep) -> SessionOut:
    session.ended_at = session.ended_at or datetime.now(UTC)
    return session.to_out()


@router.get("/{session_id}/turns")
async def get_transcript(session: SessionDep) -> TranscriptOut:
    return TranscriptOut(
        turns=list(session.turns.values()),
        suggestions=list(session.suggestions.values()),
    )


@router.post("/{session_id}/stream-token")
async def create_stream_token(
    session: SessionDep, settings: SettingsDep, tokens: TokenClientDep
) -> StreamTokenOut:
    """Short-lived AssemblyAI token so the browser can stream audio directly (guide §10)."""
    if session.ended_at is not None:
        raise HTTPException(status_code=409, detail="This session has ended.")
    if session.tokens_issued >= settings.streaming_tokens_per_session:
        raise HTTPException(status_code=429, detail="Too many streaming tokens for this session.")
    try:
        token = await tokens.create(
            expires_in_seconds=settings.streaming_token_ttl_seconds,
            max_session_seconds=settings.streaming_max_session_seconds,
        )
    except StreamingTokenError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    session.tokens_issued += 1
    return StreamTokenOut(
        token=token.token,
        expires_in_seconds=token.expires_in_seconds,
        max_session_duration_seconds=settings.streaming_max_session_seconds,
        speech_model=speech_model_for(session.config.speaker_language),
        sample_rate=SAMPLE_RATE,
        encoding=ENCODING,
        websocket_url=websocket_url(
            settings.assemblyai_streaming_ws_url, session.config, token.token
        ),
    )


@router.post("/{session_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile, session: SessionDep, settings: SettingsDep
) -> DocumentOut:
    """FR-006/007: validate, parse, chunk, and index one document for this session."""
    name = sanitize_filename(file.filename)
    try:
        kind = detect_kind(name)
        if len(session.documents) >= settings.max_documents_per_session:
            raise UploadRejected(
                f"A session can hold up to {settings.max_documents_per_session} documents.", 409
            )
        data = await file.read(settings.max_upload_bytes + 1)
        if not data:
            raise UploadRejected("The file is empty.")
        if len(data) > settings.max_upload_bytes:
            limit_mb = settings.max_upload_bytes // (1024 * 1024)
            raise UploadRejected(f"Files must be {limit_mb} MB or smaller.", 413)
    except UploadRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    finally:
        await file.close()

    record = DocumentRecord(
        id=new_id("doc"), name=name, kind=kind, size_bytes=len(data), status="failed"
    )
    problem = content_problem(data, kind)
    if problem is None:
        try:
            sections = await run_in_threadpool(parse_document, data, kind)
            chunks = chunk_sections(sections, record.id, name)
            session.index.add(chunks)
            record.status, record.chunk_count = "ready", len(chunks)
        except DocumentParseError as exc:
            problem = str(exc)
    record.error = problem
    session.documents[record.id] = record
    logger.info(
        "document %s session=%s kind=%s status=%s", record.id, session.id, kind, record.status
    )
    return record.to_out()


@router.delete("/{session_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, session: SessionDep) -> Response:
    if session.documents.pop(document_id, None) is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    session.index.remove_document(document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{session_id}/answer")
async def request_answer(
    body: AnswerRequest, session: SessionDep, pipeline: PipelineDep
) -> SuggestionOut:
    """FR-012: manual "Generate answer" for a finalized turn (HTTP alternative to the socket)."""
    suggestion = await pipeline.answer(session, body.turn_id, "manual")
    if suggestion is None:
        raise HTTPException(status_code=404, detail="Turn not found.")
    return suggestion
