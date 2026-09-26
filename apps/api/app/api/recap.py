import logging

from fastapi import APIRouter, HTTPException

from app.conversation.recap import recap_conversation
from app.llm.gateway import LLMError
from app.models.session import RecapOut, RecapRequest

from .deps import LLMDep, SettingsDep

logger = logging.getLogger("contexa.api")
router = APIRouter(prefix="/api", tags=["recap"])


@router.post("/recap")
async def create_recap(body: RecapRequest, llm: LLMDep, settings: SettingsDep) -> RecapOut:
    """PRD golden path step 7: a short recap of the finished conversation."""
    if settings.llm_problem:
        raise HTTPException(status_code=503, detail=settings.llm_problem)
    try:
        return await recap_conversation(llm, settings.answer_model, body)
    except LLMError as exc:
        logger.warning("recap failed turns=%d: %s", len(body.turns), exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
