from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app.assemblyai.tokens import StreamingTokenClient
from app.config import Settings
from app.conversation.pipeline import TurnPipeline
from app.store.memory import MemoryStore, SessionState


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_store(request: Request) -> MemoryStore:
    return request.app.state.store


def get_pipeline(request: Request) -> TurnPipeline:
    return request.app.state.pipeline


def get_token_client(request: Request) -> StreamingTokenClient:
    return request.app.state.token_client


def get_session(session_id: str, store: Annotated[MemoryStore, Depends(get_store)]) -> SessionState:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session


SettingsDep = Annotated[Settings, Depends(get_settings)]
StoreDep = Annotated[MemoryStore, Depends(get_store)]
PipelineDep = Annotated[TurnPipeline, Depends(get_pipeline)]
TokenClientDep = Annotated[StreamingTokenClient, Depends(get_token_client)]
SessionDep = Annotated[SessionState, Depends(get_session)]
