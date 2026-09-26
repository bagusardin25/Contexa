from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app.assemblyai.tokens import StreamingTokenClient
from app.config import Settings
from app.conversation.pipeline import TurnPipeline
from app.documents.importing import Importer
from app.llm.embeddings import EmbeddingClient
from app.llm.gateway import LLMGateway
from app.store.memory import MemoryStore, SessionState


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_store(request: Request) -> MemoryStore:
    return request.app.state.store


def get_pipeline(request: Request) -> TurnPipeline:
    return request.app.state.pipeline


def get_llm(request: Request) -> LLMGateway:
    return request.app.state.llm


def get_embedder(request: Request) -> EmbeddingClient:
    return request.app.state.embedder


def get_importer(request: Request) -> Importer:
    return request.app.state.importer


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
LLMDep = Annotated[LLMGateway, Depends(get_llm)]
EmbedderDep = Annotated[EmbeddingClient, Depends(get_embedder)]
ImporterDep = Annotated[Importer, Depends(get_importer)]
SessionDep = Annotated[SessionState, Depends(get_session)]
