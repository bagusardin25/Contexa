"""Meeting history in Postgres, with pgvector for semantic search (Supabase or any Postgres).

Tables live in their own `contexa` schema with row level security on and no policies:
Supabase's public REST API can't reach them, and the API (a privileged connection)
filters every query by owner itself.
"""

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import asyncpg

from app.llm.embeddings import Vector

logger = logging.getLogger("contexa.database")

MIGRATION = """
create schema if not exists contexa;

create table if not exists contexa.meetings (
  id text primary key,
  owner text not null,
  title text not null default '',
  started_at timestamptz,
  ended_at timestamptz,
  speaker_language text not null default '',
  display_language text not null default '',
  turn_count integer not null default 0,
  question_count integer not null default 0,
  summary text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_owner_started on contexa.meetings (owner, started_at desc);

create table if not exists contexa.passages (
  meeting_id text not null references contexa.meetings (id) on delete cascade,
  position integer not null,
  owner text not null,
  kind text not null,
  speaker text,
  text text not null,
  at_ms integer,
  embedding_model text,
  embedding vector,
  primary key (meeting_id, position)
);
create index if not exists passages_owner on contexa.passages (owner, embedding_model);

alter table contexa.meetings enable row level security;
alter table contexa.passages enable row level security;
"""


@dataclass(frozen=True)
class Passage:
    kind: str  # "turn" | "answer" | "recap"
    text: str
    speaker: str | None = None
    at_ms: int | None = None


@dataclass(frozen=True)
class MeetingRow:
    id: str
    title: str
    started_at: datetime | None
    ended_at: datetime | None
    speaker_language: str
    display_language: str
    turn_count: int
    question_count: int
    summary: str | None
    data: dict[str, Any]
    updated_at: datetime


@dataclass(frozen=True)
class SearchRow:
    meeting_id: str
    title: str
    started_at: datetime | None
    kind: str
    speaker: str | None
    text: str
    at_ms: int | None
    score: float


class MeetingConflict(Exception):
    """The meeting id belongs to someone else."""


def vector_literal(vector: Vector) -> str:
    return "[" + ",".join(f"{value:.6g}" for value in vector) + "]"


def _row(record: asyncpg.Record) -> MeetingRow:
    data = record["data"]
    return MeetingRow(
        id=record["id"],
        title=record["title"],
        started_at=record["started_at"],
        ended_at=record["ended_at"],
        speaker_language=record["speaker_language"],
        display_language=record["display_language"],
        turn_count=record["turn_count"],
        question_count=record["question_count"],
        summary=record["summary"],
        data=json.loads(data) if isinstance(data, str) else data,
        updated_at=record["updated_at"],
    )


class Database:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        # statement_cache_size=0: Supabase's transaction pooler (port 6543) can't keep
        # prepared statements between transactions.
        self._pool = await asyncpg.create_pool(
            self._dsn, min_size=0, max_size=5, statement_cache_size=0, command_timeout=15
        )
        async with self._pool.acquire() as connection:
            await connection.execute("create extension if not exists vector")
            await connection.execute(MIGRATION)
        logger.info("history database ready")

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("Database.connect() wasn't called.")
        return self._pool

    async def save_meeting(
        self,
        owner: str,
        meeting_id: str,
        *,
        fields: dict[str, Any],
        data: dict[str, Any],
        passages: Sequence[Passage],
        vectors: Sequence[Vector] | None,
        embedding_model: str | None,
    ) -> None:
        """Creates or replaces a meeting and its searchable passages, in one transaction."""
        async with self.pool.acquire() as connection, connection.transaction():
            current = await connection.fetchval(
                "select owner from contexa.meetings where id = $1 for update", meeting_id
            )
            if current is not None and current != owner:
                raise MeetingConflict(meeting_id)
            await connection.execute(
                """
                insert into contexa.meetings (id, owner, title, started_at, ended_at,
                  speaker_language, display_language, turn_count, question_count, summary, data)
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
                on conflict (id) do update set
                  title = excluded.title, started_at = excluded.started_at,
                  ended_at = excluded.ended_at, speaker_language = excluded.speaker_language,
                  display_language = excluded.display_language,
                  turn_count = excluded.turn_count, question_count = excluded.question_count,
                  summary = excluded.summary, data = excluded.data, updated_at = now()
                """,
                meeting_id,
                owner,
                fields["title"],
                fields["started_at"],
                fields["ended_at"],
                fields["speaker_language"],
                fields["display_language"],
                fields["turn_count"],
                fields["question_count"],
                fields["summary"],
                json.dumps(data),
            )
            await connection.execute(
                "delete from contexa.passages where meeting_id = $1", meeting_id
            )
            rows = [
                (
                    meeting_id,
                    position,
                    owner,
                    passage.kind,
                    passage.speaker,
                    passage.text,
                    passage.at_ms,
                    embedding_model if vectors else None,
                    vector_literal(vectors[position]) if vectors else None,
                )
                for position, passage in enumerate(passages)
            ]
            if rows:
                await connection.executemany(
                    """
                    insert into contexa.passages (meeting_id, position, owner, kind, speaker,
                      text, at_ms, embedding_model, embedding)
                    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
                    """,
                    rows,
                )

    async def list_meetings(self, owner: str, limit: int = 100) -> list[MeetingRow]:
        records = await self.pool.fetch(
            """
            select * from contexa.meetings where owner = $1
            order by coalesce(started_at, created_at) desc limit $2
            """,
            owner,
            limit,
        )
        return [_row(record) for record in records]

    async def get_meeting(self, owner: str, meeting_id: str) -> MeetingRow | None:
        record = await self.pool.fetchrow(
            "select * from contexa.meetings where owner = $1 and id = $2", owner, meeting_id
        )
        return _row(record) if record else None

    async def delete_meeting(self, owner: str, meeting_id: str) -> bool:
        status = await self.pool.execute(
            "delete from contexa.meetings where owner = $1 and id = $2", owner, meeting_id
        )
        return status.endswith(" 1")

    async def search_semantic(
        self, owner: str, vector: Vector, embedding_model: str, limit: int
    ) -> list[SearchRow]:
        records = await self.pool.fetch(
            """
            select p.meeting_id, m.title, m.started_at, p.kind, p.speaker, p.text, p.at_ms,
                   1 - (p.embedding <=> $3::vector) as score
            from contexa.passages p join contexa.meetings m on m.id = p.meeting_id
            where p.owner = $1 and p.embedding_model = $2 and p.embedding is not null
            order by p.embedding <=> $3::vector
            limit $4
            """,
            owner,
            embedding_model,
            vector_literal(vector),
            limit,
        )
        return [_search_row(record) for record in records]

    async def search_text(self, owner: str, query: str, limit: int) -> list[SearchRow]:
        """Full-text search (language-neutral), falling back to a substring match."""
        records = await self.pool.fetch(
            """
            with q as (select plainto_tsquery('simple', $2) as query)
            select p.meeting_id, m.title, m.started_at, p.kind, p.speaker, p.text, p.at_ms,
                   greatest(
                     ts_rank(to_tsvector('simple', p.text), q.query),
                     case when p.text ilike '%' || $2 || '%' then 0.5 else 0 end
                   ) as score
            from contexa.passages p join contexa.meetings m on m.id = p.meeting_id, q
            where p.owner = $1
              and (to_tsvector('simple', p.text) @@ q.query or p.text ilike '%' || $2 || '%')
            order by score desc, m.started_at desc nulls last
            limit $3
            """,
            owner,
            query,
            limit,
        )
        return [_search_row(record) for record in records]


def _search_row(record: asyncpg.Record) -> SearchRow:
    return SearchRow(
        meeting_id=record["meeting_id"],
        title=record["title"],
        started_at=record["started_at"],
        kind=record["kind"],
        speaker=record["speaker"],
        text=record["text"],
        at_ms=record["at_ms"],
        score=float(record["score"]),
    )
