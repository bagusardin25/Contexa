"""WebSocket protocol for `/ws/sessions/{id}`.

Server events mirror the web app's `SessionEvent` union (types/session.ts), so the
live transport can forward them to the store unchanged.
"""

from typing import Annotated, Literal

from pydantic import Field, TypeAdapter

from .base import CamelModel
from .session import (
    AnswerStyle,
    Evidence,
    SuggestedAnswer,
    SuggestionTrigger,
    TranslationResult,
    TurnClassification,
    TurnIn,
)

# Browser → server


class TurnFinalMessage(CamelModel):
    type: Literal["turn_final"]
    turn: TurnIn


class RequestAnswerMessage(CamelModel):
    type: Literal["request_answer"]
    turn_id: str = Field(min_length=1, max_length=64)
    # Another style redrafts an existing answer; empty = the session's style.
    style: AnswerStyle | None = None


class RetryTranslationMessage(CamelModel):
    type: Literal["retry_translation"]
    turn_id: str = Field(min_length=1, max_length=64)


ClientMessage = Annotated[
    TurnFinalMessage | RequestAnswerMessage | RetryTranslationMessage,
    Field(discriminator="type"),
]
client_message_adapter: TypeAdapter[ClientMessage] = TypeAdapter(ClientMessage)

# Server → browser


class TranslationDone(CamelModel):
    type: Literal["translation_done"] = "translation_done"
    turn_id: str
    result: TranslationResult
    latency_ms: float


class TranslationFailed(CamelModel):
    type: Literal["translation_failed"] = "translation_failed"
    turn_id: str
    message: str


class TurnClassified(CamelModel):
    type: Literal["turn_classified"] = "turn_classified"
    turn_id: str
    classification: TurnClassification


class SuggestionStarted(CamelModel):
    type: Literal["suggestion_started"] = "suggestion_started"
    suggestion_id: str
    turn_id: str
    trigger: SuggestionTrigger
    style: AnswerStyle
    created_at_ms: int


class SuggestionEvidence(CamelModel):
    type: Literal["suggestion_evidence"] = "suggestion_evidence"
    suggestion_id: str
    evidence: list[Evidence]


class SuggestionReady(CamelModel):
    type: Literal["suggestion_ready"] = "suggestion_ready"
    suggestion_id: str
    answer: SuggestedAnswer
    latency_ms: float


class SuggestionFailed(CamelModel):
    type: Literal["suggestion_failed"] = "suggestion_failed"
    suggestion_id: str
    message: str


class ErrorEvent(CamelModel):
    type: Literal["error"] = "error"
    message: str


ServerEvent = (
    TranslationDone
    | TranslationFailed
    | TurnClassified
    | SuggestionStarted
    | SuggestionEvidence
    | SuggestionReady
    | SuggestionFailed
    | ErrorEvent
)
