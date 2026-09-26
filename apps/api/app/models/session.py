from datetime import datetime
from typing import Literal

from pydantic import Field

from .base import CamelModel

LanguageCode = Literal["id", "en", "ja"]
SpeakerLanguage = Literal["en", "ja", "multi", "id", "auto"]
SpeechModel = Literal["universal-3-5-pro", "whisper-rt"]
TurnType = Literal["statement", "question", "action_request", "other"]
SuggestionStage = Literal["retrieving", "generating", "ready", "failed"]
SuggestionTrigger = Literal["auto", "manual"]
DocumentKind = Literal["pdf", "docx", "md", "txt"]
AnswerStyle = Literal["concise", "professional", "technical", "casual"]


class SessionConfig(CamelModel):
    title: str = Field("", max_length=80)
    speaker_language: SpeakerLanguage = "en"
    display_language: LanguageCode = "id"
    response_language: LanguageCode | Literal["auto"] = "auto"
    speaker_labels: bool = True
    answer_style: AnswerStyle = "professional"


class SessionConfigUpdate(CamelModel):
    """Partial update: only the fields sent are changed."""

    title: str | None = Field(None, max_length=80)
    speaker_language: SpeakerLanguage | None = None
    display_language: LanguageCode | None = None
    response_language: LanguageCode | Literal["auto"] | None = None
    speaker_labels: bool | None = None
    answer_style: AnswerStyle | None = None


DOCUMENT_ID_PATTERN = r"^[A-Za-z0-9_.:-]+$"


class DocumentOut(CamelModel):
    id: str
    name: str
    kind: DocumentKind
    size_bytes: int
    status: Literal["ready", "failed"]
    chunk_count: int | None
    error: str | None
    # Distinctive terms found in the document, sent to AssemblyAI as keyterms.
    keyterms: list[str]


class SessionOut(CamelModel):
    id: str
    config: SessionConfig
    speech_model: SpeechModel
    created_at: datetime
    ended_at: datetime | None
    documents: list[DocumentOut]
    turn_count: int
    # What the next stream would send as keyterms_prompt ([] when the model has no support).
    keyterms: list[str]


class StreamTokenOut(CamelModel):
    token: str
    expires_in_seconds: int
    max_session_duration_seconds: int
    speech_model: SpeechModel
    sample_rate: int
    encoding: str
    # Ready-to-open AssemblyAI URL (query params + token) for the browser.
    websocket_url: str
    keyterms: list[str]


class TurnIn(CamelModel):
    """A finalized AssemblyAI turn (`end_of_turn = true`) relayed by the browser."""

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$")
    speaker: str | None = Field(None, max_length=16)
    text: str = Field(min_length=1, max_length=5000)
    detected_language: str | None = Field(None, max_length=8)
    started_at_ms: int = Field(0, ge=0)
    ended_at_ms: int = Field(0, ge=0)


class TranslationResult(CamelModel):
    source_language: str
    target_language: LanguageCode
    text: str
    technical_terms_preserved: list[str]


class TurnClassification(CamelModel):
    type: TurnType
    requires_answer: bool
    confidence: float = Field(ge=0, le=1)


class TurnOut(CamelModel):
    id: str
    order: int
    speaker: str | None
    text: str
    detected_language: str | None
    started_at_ms: int
    ended_at_ms: int
    translation: TranslationResult | None = None
    translation_error: str | None = None
    classification: TurnClassification | None = None
    suggestion_id: str | None = None
    # Retrieval hints from turn analysis; internal only.
    search_keywords: list[str] = Field(default_factory=list, exclude=True)


class Evidence(CamelModel):
    chunk_id: str
    document_id: str
    document_name: str
    location: str
    snippet: str
    score: float = Field(ge=0, le=1)
    highlights: list[str]


class ContextRef(CamelModel):
    document_id: str
    chunk_id: str


class SuggestedAnswer(CamelModel):
    question_summary: str
    answer_preferred_language: str
    answer_target_language: str
    preferred_language: LanguageCode
    target_language: str
    used_context: list[ContextRef]
    confidence_note: str


class SuggestionOut(CamelModel):
    id: str
    turn_id: str
    trigger: SuggestionTrigger
    style: AnswerStyle = "professional"
    stage: SuggestionStage
    evidence: list[Evidence] | None = None
    answer: SuggestedAnswer | None = None
    error: str | None = None
    created_at_ms: int
    latency_ms: float | None = None


class TranscriptOut(CamelModel):
    turns: list[TurnOut]
    suggestions: list[SuggestionOut]


class AnswerRequest(CamelModel):
    turn_id: str = Field(min_length=1, max_length=64)
    # Another style redrafts an existing answer; empty = the session's style.
    style: AnswerStyle | None = None


class RecapTurn(CamelModel):
    speaker: str | None = Field(None, max_length=32)
    text: str = Field(min_length=1, max_length=4000)
    type: TurnType | None = None


class RecapRequest(CamelModel):
    """A finished conversation, sent by the browser, which holds the full transcript even
    when the API restarted mid-session."""

    title: str = Field("", max_length=80)
    language: LanguageCode = "id"
    turns: list[RecapTurn] = Field(min_length=1, max_length=2000)


class RecapOut(CamelModel):
    summary: str
    key_points: list[str]
    action_items: list[str]
    open_questions: list[str]
