"""The recap shown when a session ends: summary, key points, action items, open questions."""

from pydantic import ValidationError

from app.llm.gateway import LLMError, LLMGateway
from app.llm.prompts import recap_prompt
from app.models.ai import RECAP_SCHEMA, SessionRecap
from app.models.session import RecapOut, RecapRequest, RecapTurn

RECAP_MAX_TOKENS = 1500
# About 3,000 tokens of transcript: room within free tiers' tokens-per-minute budgets.
MAX_TRANSCRIPT_CHARS = 12_000
MAX_ITEMS = 5


def _line(turn: RecapTurn) -> str:
    speaker = f"Speaker {turn.speaker}" if turn.speaker else "Speaker"
    kind = " (question)" if turn.type == "question" else ""
    return f"[{speaker}]{kind} {' '.join(turn.text.split())}"


def transcript_lines(turns: list[RecapTurn], budget: int = MAX_TRANSCRIPT_CHARS) -> list[str]:
    """The most recent turns that fit the budget, oldest first."""
    lines: list[str] = []
    for turn in reversed(turns):
        line = _line(turn)
        if len(line) + 1 > budget:
            break
        lines.append(line)
        budget -= len(line) + 1
    lines.reverse()
    return lines


def _items(values: list[str]) -> list[str]:
    cleaned = [" ".join(value.split()) for value in values]
    return [value for value in cleaned if value][:MAX_ITEMS]


async def recap_conversation(llm: LLMGateway, model: str, request: RecapRequest) -> RecapOut:
    lines = transcript_lines(request.turns)
    if not lines:
        raise LLMError("The transcript is too long to summarize in one turn.")
    system, user = recap_prompt(
        title=request.title,
        language=request.language,
        lines=lines,
        omitted=len(request.turns) - len(lines),
    )
    data = await llm.complete_json(
        system=system,
        user=user,
        schema_name="session_recap",
        schema=RECAP_SCHEMA,
        max_tokens=RECAP_MAX_TOKENS,
        model=model,
    )
    try:
        recap = SessionRecap.model_validate(data)
    except ValidationError as exc:
        raise LLMError("The model returned a recap in an unexpected shape.") from exc
    return RecapOut(
        summary=" ".join(recap.summary.split()),
        key_points=_items(recap.key_points),
        action_items=_items(recap.action_items),
        open_questions=_items(recap.open_questions),
    )
