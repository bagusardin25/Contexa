import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import realtime, sessions
from app.assemblyai.tokens import StreamingTokenClient
from app.config import Settings, get_settings
from app.conversation.pipeline import TurnPipeline
from app.llm.gateway import LLMGateway
from app.store.memory import MemoryStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(
    settings: Settings | None = None,
    *,
    llm_transport: httpx.AsyncBaseTransport | None = None,
    streaming_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    """Build the app. Transports are injectable so tests never call AssemblyAI."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        llm = LLMGateway(
            api_key=settings.api_key,
            model=settings.assemblyai_llm_model,
            base_url=settings.assemblyai_llm_base_url,
            timeout=settings.llm_timeout_seconds,
            temperature=settings.llm_temperature,
            transport=llm_transport,
        )
        token_client = StreamingTokenClient(
            api_key=settings.api_key,
            base_url=settings.assemblyai_streaming_base_url,
            transport=streaming_transport,
        )
        app.state.settings = settings
        app.state.store = MemoryStore(
            max_sessions=settings.max_sessions, ttl_hours=settings.session_ttl_hours
        )
        app.state.llm = llm
        app.state.token_client = token_client
        app.state.pipeline = TurnPipeline(
            llm,
            analysis_model=settings.analysis_model,
            answer_model=settings.assemblyai_llm_model,
        )
        app.state.background_tasks = set()
        try:
            yield
        finally:
            await llm.aclose()
            await token_client.aclose()

    app = FastAPI(
        title="Contexa API",
        version="0.1.0",
        summary="Streaming tokens, live translation, question detection, grounded answers.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
    )
    app.include_router(sessions.router)
    app.include_router(realtime.router)

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, object]:
        return {
            "status": "ok",
            "assemblyaiConfigured": settings.api_key is not None,
            "llmModel": settings.assemblyai_llm_model,
            "llmAnalysisModel": settings.analysis_model,
        }

    return app


app = create_app()
