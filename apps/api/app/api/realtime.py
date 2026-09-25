"""`WS /ws/sessions/{id}`: the browser relays final turns, the server streams results.

Audio never passes through here. The browser sends AssemblyAI's finalized turns and
receives translation, classification, evidence, and answers as they complete.
"""

import asyncio
import json
import logging
from collections.abc import Coroutine
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.conversation.pipeline import TurnPipeline
from app.models.events import (
    ClientMessage,
    ErrorEvent,
    RequestAnswerMessage,
    RetryTranslationMessage,
    ServerEvent,
    TurnFinalMessage,
    client_message_adapter,
)
from app.store.memory import SessionState

logger = logging.getLogger("contexa.realtime")
router = APIRouter()

MAX_IN_FLIGHT = 8
MAX_MESSAGE_BYTES = 64 * 1024


async def _dispatch(
    pipeline: TurnPipeline, session: SessionState, message: ClientMessage, emit
) -> None:
    if isinstance(message, TurnFinalMessage):
        await pipeline.handle_final_turn(session, message.turn, emit)
        return
    assert isinstance(message, RequestAnswerMessage | RetryTranslationMessage)
    if message.turn_id not in session.turns:
        # e.g. the turn was lost during a reconnect; tell the UI instead of leaving it waiting
        await emit(ErrorEvent(message=f"Unknown turn: {message.turn_id}."))
    elif isinstance(message, RequestAnswerMessage):
        await pipeline.answer(session, message.turn_id, "manual", emit)
    else:
        await pipeline.retry_translation(session, message.turn_id, emit)


@router.websocket("/ws/sessions/{session_id}")
async def session_socket(websocket: WebSocket, session_id: str) -> None:
    state = websocket.app.state
    origin = websocket.headers.get("origin")
    # Browsers don't apply CORS to WebSockets, so check the origin explicitly.
    if origin and origin not in state.settings.allowed_origins:
        await websocket.close(code=1008)
        return
    session = state.store.get(session_id)
    if session is None:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    outbox: asyncio.Queue[ServerEvent] = asyncio.Queue()
    connected = True
    in_flight: set[asyncio.Task[Any]] = set()

    async def emit(event: ServerEvent) -> None:
        if connected:
            outbox.put_nowait(event)

    async def sender() -> None:
        # One writer, so concurrent turns never interleave frames on the socket.
        try:
            while True:
                event = await outbox.get()
                await websocket.send_json(event.model_dump(mode="json"))
        except (WebSocketDisconnect, RuntimeError):
            return  # client went away; the receive loop will notice too

    async def run(coro: Coroutine[Any, Any, Any]) -> None:
        try:
            await coro
        except Exception:  # never let one turn take the connection down
            logger.exception("turn processing failed session=%s", session.id)
            await emit(ErrorEvent(message="Processing this turn failed."))

    sender_task = asyncio.create_task(sender())
    try:
        while True:
            raw = await websocket.receive_text()
            if len(raw) > MAX_MESSAGE_BYTES:
                await emit(ErrorEvent(message="Message too large."))
                continue
            try:
                message = client_message_adapter.validate_python(json.loads(raw))
            except (json.JSONDecodeError, ValidationError):
                await emit(ErrorEvent(message="Invalid message."))
                continue
            if len(in_flight) >= MAX_IN_FLIGHT:
                await emit(
                    ErrorEvent(message="Too many turns are being processed. Try again shortly.")
                )
                continue

            task = asyncio.create_task(run(_dispatch(state.pipeline, session, message, emit)))
            in_flight.add(task)
            # Keep a strong reference app-wide so work on final turns can finish (and be
            # stored) even if the socket closes first.
            state.background_tasks.add(task)
            task.add_done_callback(in_flight.discard)
            task.add_done_callback(state.background_tasks.discard)
    except WebSocketDisconnect:
        pass
    finally:
        connected = False
        sender_task.cancel()
