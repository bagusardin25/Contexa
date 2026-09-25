"""Structured contracts between the backend and the LLM Gateway (PRD §20).

The JSON schemas are strict (every property required, no extra keys) so the gateway
can enforce them; the Pydantic models validate what comes back.
"""

from typing import Any

from pydantic import BaseModel, Field

from .session import TurnType


class TurnAnalysis(BaseModel):
    source_language: str
    translation: str | None
    technical_terms_preserved: list[str]
    type: TurnType
    requires_answer: bool
    confidence: float = Field(ge=0, le=1)
    search_keywords: list[str]


class AnswerDraft(BaseModel):
    question_summary: str
    answer_preferred_language: str
    answer_target_language: str
    used_chunk_ids: list[str]
    confidence_note: str


def _strict(properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


_STRING_LIST = {"type": "array", "items": {"type": "string"}}

TURN_ANALYSIS_SCHEMA = _strict(
    {
        "source_language": {"type": "string", "description": "ISO 639-1 code"},
        "translation": {"type": ["string", "null"]},
        "technical_terms_preserved": _STRING_LIST,
        "type": {"type": "string", "enum": ["statement", "question", "action_request", "other"]},
        "requires_answer": {"type": "boolean"},
        "confidence": {"type": "number"},
        "search_keywords": _STRING_LIST,
    }
)

ANSWER_SCHEMA = _strict(
    {
        "question_summary": {"type": "string"},
        "answer_preferred_language": {"type": "string"},
        "answer_target_language": {"type": "string"},
        "used_chunk_ids": _STRING_LIST,
        "confidence_note": {"type": "string"},
    }
)
