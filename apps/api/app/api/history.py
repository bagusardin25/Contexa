"""Meeting history: finished sessions saved by the browser, listed, opened, deleted, and
searched by words and by meaning.

Each meeting is split into passages (turns with their translations, answers, the recap)
that are embedded when semantic search is configured. Search fuses pgvector's nearest
passages with Postgres full-text matches by reciprocal rank fusion, like document retrieval.
"""

import logging
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response

from app.llm.embeddings import EmbeddingError
from app.models.history import (
    MEETING_ID_PATTERN,
    MeetingDetail,
    MeetingIn,
    MeetingList,
    MeetingSaved,
    MeetingSummary,
    SearchHit,
    SearchResults,
)
from app.store.database import Database, MeetingConflict, MeetingRow, Passage, SearchRow

from .auth import OwnerDep
from .deps import EmbedderDep

logger = logging.getLogger("contexa.history")
router = APIRouter(prefix="/api/meetings", tags=["history"])

MAX_PASSAGES = 500
SEARCH_LIMIT = 20
# Below this cosine similarity a passage is too far from the query to show.
MIN_SEMANTIC_SCORE = 0.3
RRF_K = 60


def get_database(request: Request) -> Database:
    database: Database | None = request.app.state.database
    if database is None:
        raise HTTPException(503, "History isn't set up on this server (DATABASE_URL).")
    return database


DatabaseDep = Annotated[Database, Depends(get_database)]
MeetingId = Annotated[str, Path(pattern=MEETING_ID_PATTERN)]


def meeting_passages(meeting: MeetingIn) -> list[Passage]:
    """The searchable pieces of a meeting: the recap and answers first, then every turn."""
    passages: list[Passage] = []
    if meeting.recap is not None:
        recap = meeting.recap
        lines = [recap.summary, *recap.key_points, *recap.action_items, *recap.open_questions]
        text = "\n".join(line.strip() for line in lines if line.strip())
        if text:
            passages.append(Passage(kind="recap", text=text))
    starts = {turn.id: turn.started_at_ms for turn in meeting.turns}
    for answer in meeting.answers:
        parts = (
            answer.question_summary,
            answer.answer_preferred_language,
            answer.answer_target_language,
        )
        text = "\n".join(part.strip() for part in parts if part.strip())
        if text:
            passages.append(
                Passage(
                    kind="answer", text=text, at_ms=starts.get(answer.turn_id), ref=answer.turn_id
                )
            )
    for turn in meeting.turns:
        text = turn.text.strip()
        if turn.translation and turn.translation.strip():
            text = f"{text}\n{turn.translation.strip()}"
        passages.append(
            Passage(
                kind="turn", text=text, speaker=turn.speaker, at_ms=turn.started_at_ms, ref=turn.id
            )
        )
    return passages[:MAX_PASSAGES]


def _summary(row: MeetingRow) -> MeetingSummary:
    return MeetingSummary(
        id=row.id,
        title=row.title,
        started_at=row.started_at,
        ended_at=row.ended_at,
        turn_count=row.turn_count,
        question_count=row.question_count,
        summary=row.summary,
        speaker_language=row.speaker_language,
        display_language=row.display_language,
    )


@router.put("/{meeting_id}")
async def save_meeting(
    database: DatabaseDep,
    owner: OwnerDep,
    embedder: EmbedderDep,
    meeting_id: MeetingId,
    body: MeetingIn,
) -> MeetingSaved:
    """Create or replace a meeting; saving it again (say, after Retry recap) is safe."""
    passages = meeting_passages(body)
    vectors = None
    if embedder.enabled and passages:
        try:
            vectors = await embedder.embed([passage.text for passage in passages])
        except EmbeddingError as exc:
            # Saved all the same: words still find it, only search by meaning misses it.
            logger.warning("meeting %s saved without embeddings: %s", meeting_id, exc)
    fields = {
        "title": body.title.strip(),
        "started_at": body.started_at,
        "ended_at": body.ended_at,
        "speaker_language": body.speaker_language,
        "display_language": body.display_language,
        "turn_count": len(body.turns),
        "question_count": sum(
            1 for turn in body.turns if turn.type == "question" or turn.requires_answer
        ),
        "summary": body.recap.summary if body.recap else None,
    }
    try:
        await database.save_meeting(
            owner,
            meeting_id,
            fields=fields,
            data=body.model_dump(mode="json", by_alias=True),
            passages=passages,
            vectors=vectors,
            embedding_model=embedder.model if vectors else None,
        )
    except MeetingConflict as exc:
        # Someone else's id: answer as if it didn't exist.
        raise HTTPException(404, "Meeting not found.") from exc
    logger.info(
        "meeting saved id=%s turns=%d passages=%d embedded=%s",
        meeting_id,
        len(body.turns),
        len(passages),
        vectors is not None,
    )
    return MeetingSaved(id=meeting_id, passages=len(passages), embedded=vectors is not None)


@router.get("")
async def list_meetings(database: DatabaseDep, owner: OwnerDep) -> MeetingList:
    return MeetingList(meetings=[_summary(row) for row in await database.list_meetings(owner)])


def _fuse(semantic: list[SearchRow], lexical: list[SearchRow], limit: int) -> list[SearchHit]:
    fused: dict[tuple[str, int], float] = defaultdict(float)
    rows: dict[tuple[str, int], SearchRow] = {}
    scores: dict[tuple[str, int], float] = defaultdict(float)
    for ranked in (semantic, lexical):
        for rank, row in enumerate(ranked, start=1):
            key = (row.meeting_id, row.position)
            fused[key] += 1 / (RRF_K + rank)
            rows.setdefault(key, row)
            scores[key] = max(scores[key], row.score)
    hits: list[SearchHit] = []
    for key in sorted(fused, key=lambda k: fused[k], reverse=True)[:limit]:
        row = rows[key]
        hits.append(
            SearchHit(
                meeting_id=row.meeting_id,
                title=row.title,
                started_at=row.started_at,
                kind=row.kind,
                speaker=row.speaker,
                text=row.text,
                at_ms=row.at_ms,
                turn_id=row.ref,
                score=round(min(1.0, scores[key]), 2),
            )
        )
    return hits


@router.get("/search")
async def search_meetings(
    database: DatabaseDep,
    owner: OwnerDep,
    embedder: EmbedderDep,
    q: Annotated[str, Query(min_length=1, max_length=300)],
) -> SearchResults:
    query = " ".join(q.split())
    if not query:
        raise HTTPException(422, "Type something to search for.")
    semantic: list[SearchRow] = []
    by_meaning = False
    if embedder.enabled:
        try:
            [vector] = await embedder.embed([query])
        except EmbeddingError as exc:
            logger.warning("history search without embeddings: %s", exc)
        else:
            rows = await database.search_semantic(owner, vector, embedder.model, SEARCH_LIMIT)
            semantic = [row for row in rows if row.score >= MIN_SEMANTIC_SCORE]
            by_meaning = True
    lexical = await database.search_text(owner, query, SEARCH_LIMIT)
    return SearchResults(semantic=by_meaning, hits=_fuse(semantic, lexical, SEARCH_LIMIT))


@router.get("/{meeting_id}")
async def get_meeting(
    database: DatabaseDep, owner: OwnerDep, meeting_id: MeetingId
) -> MeetingDetail:
    row = await database.get_meeting(owner, meeting_id)
    if row is None:
        raise HTTPException(404, "Meeting not found.")
    return MeetingDetail(**_summary(row).model_dump(), data=row.data)


@router.delete("/{meeting_id}", status_code=204)
async def delete_meeting(database: DatabaseDep, owner: OwnerDep, meeting_id: MeetingId) -> Response:
    if not await database.delete_meeting(owner, meeting_id):
        raise HTTPException(404, "Meeting not found.")
    return Response(status_code=204)
