"""In-memory session store.

Good enough for a single-instance hackathon deployment: sessions survive until the
process restarts or they expire. A Supabase implementation can replace it later
without touching the API layer.
"""

import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.assemblyai.routing import speech_model_for
from app.models.session import (
    DocumentKind,
    DocumentOut,
    SessionConfig,
    SessionOut,
    SuggestionOut,
    TurnIn,
    TurnOut,
)
from app.rag.index import LexicalIndex

MAX_TURNS_PER_SESSION = 5000


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


@dataclass
class DocumentRecord:
    id: str
    name: str
    kind: DocumentKind
    size_bytes: int
    status: str
    chunk_count: int | None = None
    error: str | None = None

    def to_out(self) -> DocumentOut:
        return DocumentOut(
            id=self.id,
            name=self.name,
            kind=self.kind,
            size_bytes=self.size_bytes,
            status="ready" if self.status == "ready" else "failed",
            chunk_count=self.chunk_count,
            error=self.error,
        )


@dataclass
class SessionState:
    id: str
    config: SessionConfig
    created_at: datetime
    ended_at: datetime | None = None
    turns: dict[str, TurnOut] = field(default_factory=dict)
    suggestions: dict[str, SuggestionOut] = field(default_factory=dict)
    documents: dict[str, DocumentRecord] = field(default_factory=dict)
    index: LexicalIndex = field(default_factory=LexicalIndex)
    tokens_issued: int = 0
    last_active: float = field(default_factory=time.monotonic)

    def touch(self) -> None:
        self.last_active = time.monotonic()

    def add_turn(self, turn: TurnIn) -> TurnOut | None:
        """Store a final turn. Returns None for duplicates (e.g. resent after reconnect)."""
        if turn.id in self.turns or len(self.turns) >= MAX_TURNS_PER_SESSION:
            return None
        record = TurnOut(
            id=turn.id,
            order=len(self.turns) + 1,
            speaker=turn.speaker,
            text=turn.text.strip(),
            detected_language=turn.detected_language,
            started_at_ms=turn.started_at_ms,
            ended_at_ms=turn.ended_at_ms,
        )
        self.turns[turn.id] = record
        self.touch()
        return record

    def turns_before(self, turn_id: str, limit: int) -> list[TurnOut]:
        ordered = list(self.turns.values())
        position = next((i for i, t in enumerate(ordered) if t.id == turn_id), len(ordered))
        return ordered[max(0, position - limit) : position]

    def to_out(self) -> SessionOut:
        return SessionOut(
            id=self.id,
            config=self.config,
            speech_model=speech_model_for(self.config.speaker_language),
            created_at=self.created_at,
            ended_at=self.ended_at,
            documents=[doc.to_out() for doc in self.documents.values()],
            turn_count=len(self.turns),
        )


class MemoryStore:
    def __init__(self, *, max_sessions: int, ttl_hours: float) -> None:
        self._sessions: dict[str, SessionState] = {}
        self._max_sessions = max_sessions
        self._ttl_seconds = ttl_hours * 3600

    def create(self, config: SessionConfig) -> SessionState:
        self._evict()
        session = SessionState(id=new_id("ses"), config=config, created_at=datetime.now(UTC))
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> SessionState | None:
        session = self._sessions.get(session_id)
        if session is not None:
            session.touch()
        return session

    def _evict(self) -> None:
        now = time.monotonic()
        for session_id in [
            sid for sid, s in self._sessions.items() if now - s.last_active > self._ttl_seconds
        ]:
            del self._sessions[session_id]
        while len(self._sessions) >= self._max_sessions:
            oldest = min(self._sessions.values(), key=lambda s: s.last_active)
            del self._sessions[oldest.id]
