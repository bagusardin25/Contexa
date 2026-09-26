"""Final-turn orchestration: translate + classify, then retrieve + answer.

Only finalized turns come here (guide §11). Every step fails on its own: a broken
translation or answer never tears down the live transcript (guide §29).
"""

import logging
import re
import time
from collections.abc import Awaitable, Callable

from pydantic import ValidationError

from app.llm.embeddings import EmbeddingClient, EmbeddingError
from app.llm.gateway import LLMError, LLMGateway
from app.llm.prompts import ContextLine, Excerpt, answer_prompt, turn_analysis_prompt
from app.models.ai import ANSWER_SCHEMA, TURN_ANALYSIS_SCHEMA, AnswerDraft, TurnAnalysis
from app.models.events import (
    ServerEvent,
    SuggestionEvidence,
    SuggestionFailed,
    SuggestionReady,
    SuggestionStarted,
    TranslationDone,
    TranslationFailed,
    TurnClassified,
)
from app.models.session import (
    AnswerStyle,
    ContextRef,
    Evidence,
    SuggestedAnswer,
    SuggestionOut,
    SuggestionTrigger,
    TranslationResult,
    TurnClassification,
    TurnIn,
    TurnOut,
)
from app.rag.hybrid import hybrid_search
from app.rag.index import make_snippet
from app.store.memory import SessionState, new_id

logger = logging.getLogger("contexa.pipeline")

Emit = Callable[[ServerEvent], Awaitable[None]]

RECENT_TURNS_FOR_ANALYSIS = 3
RECENT_TURNS_FOR_ANSWER = 6
MAX_EVIDENCE = 3
# Room for the translation of a long webinar monologue plus the other fields; a truncated
# response is invalid JSON and would fail the whole analysis.
ANALYSIS_MAX_TOKENS = 1200
ANSWER_MAX_TOKENS = 900


async def _discard(_: ServerEvent) -> None:
    return None


def heuristic_classification(text: str) -> TurnClassification:
    """Fallback when the classifier call fails, so a question can still be answered."""
    stripped = text.strip()
    if stripped.endswith(("?", "？")):
        return TurnClassification(type="question", requires_answer=True, confidence=0.5)
    if re.match(r"(?i)^(could|can|would|will) you\b|^please\b", stripped):
        return TurnClassification(type="action_request", requires_answer=True, confidence=0.4)
    return TurnClassification(type="statement", requires_answer=False, confidence=0.3)


def _elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 1)


def _context_lines(turns: list[TurnOut]) -> list[ContextLine]:
    return [
        ContextLine(
            speaker=turn.speaker,
            text=turn.text,
            translation=turn.translation.text if turn.translation else None,
        )
        for turn in turns
    ]


class TurnPipeline:
    def __init__(
        self,
        llm: LLMGateway,
        *,
        analysis_model: str,
        answer_model: str,
        embedder: EmbeddingClient | None = None,
        min_similarity: float = 0.5,
    ) -> None:
        self._llm = llm
        self._embedder = embedder
        self._min_similarity = min_similarity
        # Analysis runs on every finished turn, so it uses the faster model (latency budget:
        # translation < 2 s). Grounded answers use the stronger one.
        self._analysis_model = analysis_model
        self._answer_model = answer_model

    async def handle_final_turn(self, session: SessionState, turn_in: TurnIn, emit: Emit) -> None:
        turn = session.add_turn(turn_in)
        if turn is None:
            return
        classification = await self._analyze(session, turn, emit, classify=True)
        if classification and classification.requires_answer:
            await self.answer(session, turn.id, "auto", emit)

    async def retry_translation(self, session: SessionState, turn_id: str, emit: Emit) -> None:
        turn = session.turns.get(turn_id)
        if turn is not None:
            await self._analyze(session, turn, emit, classify=False)

    def _needs_translation(self, session: SessionState, turn: TurnOut) -> bool:
        # Same rule as the web app: translate unless the turn is already in the display language.
        return turn.detected_language != session.config.display_language

    async def _analyze(
        self, session: SessionState, turn: TurnOut, emit: Emit, *, classify: bool
    ) -> TurnClassification | None:
        translate = self._needs_translation(session, turn)
        if not translate and not classify:
            return None
        target = session.config.display_language
        system, user = turn_analysis_prompt(
            text=turn.text,
            speaker=turn.speaker,
            target_language=target,
            translate=translate,
            recent=_context_lines(session.turns_before(turn.id, RECENT_TURNS_FOR_ANALYSIS)),
        )

        started = time.perf_counter()
        try:
            data = await self._llm.complete_json(
                system=system,
                user=user,
                schema_name="turn_analysis",
                schema=TURN_ANALYSIS_SCHEMA,
                max_tokens=ANALYSIS_MAX_TOKENS,
                model=self._analysis_model,
            )
            analysis = TurnAnalysis.model_validate(data)
        except (LLMError, ValidationError) as exc:
            message = (
                str(exc) if isinstance(exc, LLMError) else "The model returned an invalid analysis."
            )
            logger.warning(
                "turn analysis failed session=%s turn=%s: %s", session.id, turn.id, message
            )
            if translate:
                turn.translation_error = message
                await emit(TranslationFailed(turn_id=turn.id, message=message))
            if not classify:
                return None
            classification = heuristic_classification(turn.text)
            turn.classification = classification
            await emit(TurnClassified(turn_id=turn.id, classification=classification))
            return classification

        latency = _elapsed_ms(started)
        turn.detected_language = turn.detected_language or analysis.source_language.lower()[:8]
        turn.search_keywords = [kw.strip() for kw in analysis.search_keywords if kw.strip()][:8]

        if translate:
            result = TranslationResult(
                source_language=analysis.source_language.lower(),
                target_language=target,
                text=(analysis.translation or turn.text).strip(),
                technical_terms_preserved=analysis.technical_terms_preserved[:12],
            )
            turn.translation, turn.translation_error = result, None
            await emit(TranslationDone(turn_id=turn.id, result=result, latency_ms=latency))

        if not classify:
            return None
        classification = TurnClassification(
            type=analysis.type,
            requires_answer=analysis.requires_answer,
            confidence=round(min(1.0, max(0.0, analysis.confidence)), 2),
        )
        turn.classification = classification
        await emit(TurnClassified(turn_id=turn.id, classification=classification))
        return classification

    async def answer(
        self,
        session: SessionState,
        turn_id: str,
        trigger: SuggestionTrigger,
        emit: Emit = _discard,
        *,
        style: AnswerStyle | None = None,
    ) -> SuggestionOut | None:
        """Retrieve evidence and draft a grounded answer for one turn (FR-008 to FR-012).

        An existing answer is kept unless it failed or another `style` is asked for; then a
        new draft replaces it.
        """
        turn = session.turns.get(turn_id)
        if turn is None:
            return None
        existing = session.suggestions.get(turn.suggestion_id or "")
        restyle = style is not None and existing is not None and existing.style != style
        if existing is not None and existing.stage != "failed" and not restyle:
            return existing

        suggestion = SuggestionOut(
            id=new_id("sug"),
            turn_id=turn.id,
            trigger=trigger,
            style=style or session.config.answer_style,
            stage="retrieving",
            created_at_ms=turn.ended_at_ms,
        )
        if existing is not None:
            del session.suggestions[existing.id]
        session.suggestions[suggestion.id] = suggestion
        turn.suggestion_id = suggestion.id
        started = time.perf_counter()
        await emit(
            SuggestionStarted(
                suggestion_id=suggestion.id,
                turn_id=turn.id,
                trigger=trigger,
                style=suggestion.style,
                created_at_ms=suggestion.created_at_ms,
            )
        )

        evidence = await self._retrieve(session, turn)
        suggestion.evidence = evidence
        suggestion.stage = "generating"
        await emit(SuggestionEvidence(suggestion_id=suggestion.id, evidence=evidence))

        preferred = session.config.display_language
        target = self._response_language(session, turn)
        labels = {f"C{i}": item for i, item in enumerate(evidence, start=1)}
        system, user = answer_prompt(
            question=turn.text,
            speaker=turn.speaker,
            preferred_language=preferred,
            target_language=target,
            style=suggestion.style,
            excerpts=[
                Excerpt(
                    label=label, source=f"{item.document_name} · {item.location}", text=item.snippet
                )
                for label, item in labels.items()
            ],
            recent=_context_lines(session.turns_before(turn.id, RECENT_TURNS_FOR_ANSWER)),
        )

        try:
            data = await self._llm.complete_json(
                system=system,
                user=user,
                schema_name="grounded_answer",
                schema=ANSWER_SCHEMA,
                max_tokens=ANSWER_MAX_TOKENS,
                model=self._answer_model,
            )
            draft = AnswerDraft.model_validate(data)
        except (LLMError, ValidationError) as exc:
            message = (
                str(exc) if isinstance(exc, LLMError) else "The model returned an invalid answer."
            )
            logger.warning("answer failed session=%s turn=%s: %s", session.id, turn.id, message)
            suggestion.stage, suggestion.error = "failed", message
            await emit(SuggestionFailed(suggestion_id=suggestion.id, message=message))
            return suggestion

        # Only cite excerpts that were actually retrieved (guide §23).
        used = [labels[label] for label in dict.fromkeys(draft.used_chunk_ids) if label in labels]
        answer = SuggestedAnswer(
            question_summary=draft.question_summary.strip(),
            answer_preferred_language=draft.answer_preferred_language.strip(),
            answer_target_language=draft.answer_target_language.strip(),
            preferred_language=preferred,
            target_language=target,
            used_context=[ContextRef(document_id=e.document_id, chunk_id=e.chunk_id) for e in used],
            confidence_note=draft.confidence_note.strip(),
        )
        suggestion.answer = answer
        suggestion.stage = "ready"
        suggestion.latency_ms = _elapsed_ms(started)
        await emit(
            SuggestionReady(
                suggestion_id=suggestion.id, answer=answer, latency_ms=suggestion.latency_ms
            )
        )
        logger.info(
            "answer ready session=%s turn=%s evidence=%d latency_ms=%.0f",
            session.id,
            turn.id,
            len(evidence),
            suggestion.latency_ms,
        )
        return suggestion

    async def _retrieve(self, session: SessionState, turn: TurnOut) -> list[Evidence]:
        """BM25 over the session's chunks, fused with semantic search when it's configured."""
        texts = [turn.text]
        if turn.translation:
            texts.append(turn.translation.text)
        query_vector = None
        if self._embedder is not None and self._embedder.enabled and len(session.vectors):
            query = "\n".join([turn.text, ", ".join(turn.search_keywords)]).strip()
            try:
                [query_vector] = await self._embedder.embed([query])
            except EmbeddingError as exc:
                logger.warning("query embedding failed session=%s: %s", session.id, exc)
        results = hybrid_search(
            session.index,
            session.vectors,
            texts=texts,
            keywords=turn.search_keywords,
            query_vector=query_vector,
            limit=MAX_EVIDENCE,
            min_similarity=self._min_similarity,
        )
        return [
            Evidence(
                chunk_id=result.chunk.id,
                document_id=result.chunk.document_id,
                document_name=result.chunk.document_name,
                location=result.chunk.location,
                snippet=make_snippet(result.chunk.content, result.highlights),
                score=result.score,
                highlights=result.highlights,
            )
            for result in results
        ]

    @staticmethod
    def _response_language(session: SessionState, turn: TurnOut) -> str:
        """Answer in the speaker's language unless the session pins one (FR-010)."""
        if session.config.response_language != "auto":
            return session.config.response_language
        return (turn.detected_language or "en").lower()
