"""Contracts for meeting history: a finished session saved by the browser, and its search."""

from datetime import datetime
from typing import Any, Literal

from pydantic import AwareDatetime, Field

from .base import CamelModel
from .session import AnswerStyle, LanguageCode, RecapOut, SpeakerLanguage, TurnType

MEETING_ID_PATTERN = r"^[A-Za-z0-9_-]{8,64}$"


class MeetingTurn(CamelModel):
    id: str = Field(min_length=1, max_length=64)
    speaker: str | None = Field(None, max_length=32)
    text: str = Field(min_length=1, max_length=4000)
    translation: str | None = Field(None, max_length=8000)
    type: TurnType | None = None
    requires_answer: bool = False
    started_at_ms: int = Field(0, ge=0)


class MeetingAnswer(CamelModel):
    turn_id: str = Field(min_length=1, max_length=64)
    question_summary: str = Field("", max_length=1000)
    answer_preferred_language: str = Field("", max_length=4000)
    answer_target_language: str = Field("", max_length=4000)
    style: AnswerStyle | None = None
    # Where the answer came from, e.g. "notewave-architecture.md · Conflict handling".
    sources: list[str] = Field(default_factory=list, max_length=10)


class MeetingIn(CamelModel):
    """A finished session, sent by the browser, which holds the whole transcript."""

    title: str = Field("", max_length=120)
    started_at: AwareDatetime
    ended_at: AwareDatetime
    speaker_language: SpeakerLanguage = "en"
    display_language: LanguageCode = "id"
    turns: list[MeetingTurn] = Field(default_factory=list, max_length=2000)
    answers: list[MeetingAnswer] = Field(default_factory=list, max_length=500)
    recap: RecapOut | None = None


class MeetingSaved(CamelModel):
    id: str
    passages: int
    # Passages got embeddings, so semantic search covers this meeting.
    embedded: bool


class MeetingSummary(CamelModel):
    id: str
    title: str
    started_at: datetime | None
    ended_at: datetime | None
    turn_count: int
    question_count: int
    summary: str | None
    speaker_language: str
    display_language: str


class MeetingList(CamelModel):
    meetings: list[MeetingSummary]


class MeetingDetail(MeetingSummary):
    # The MeetingIn the browser saved, camelCase.
    data: dict[str, Any]


class SearchHit(CamelModel):
    meeting_id: str
    title: str
    started_at: datetime | None
    kind: Literal["turn", "answer", "recap"]
    speaker: str | None
    text: str
    # Where the passage is in the meeting, and the turn to scroll to (turns and answers).
    at_ms: int | None
    turn_id: str | None
    score: float


class SearchResults(CamelModel):
    # Whether the search also matched by meaning (embeddings), not only by words.
    semantic: bool
    hits: list[SearchHit]
