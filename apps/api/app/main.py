import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import history, realtime, recap, sessions
from app.api.auth import SupabaseAuth
from app.assemblyai.tokens import StreamingTokenClient
from app.config import Settings, get_settings
from app.conversation.pipeline import TurnPipeline
from app.documents.fetch import GitHubClient, Resolver, SafeFetcher, system_resolver
from app.documents.importing import Importer
from app.llm.embeddings import EmbeddingClient
from app.llm.gateway import LLMGateway
from app.store.database import Database
from app.store.memory import MemoryStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("contexa")


async def connect_database(settings: Settings) -> Database | None:
    """History is optional: without DATABASE_URL, or if the database can't be reached,
    the API runs without it rather than failing to start."""
    if settings.database_url is None or not settings.database_url.get_secret_value().strip():
        return None
    dsn = settings.database_url.get_secret_value().strip()
    database = Database(dsn)
    try:
        await database.connect()
    except Exception as exc:  # noqa: BLE001 - any failure means "no history", never a crash
        reason = f"{type(exc).__name__}: {exc}"
        password = urlsplit(dsn).password
        if password:
            reason = reason.replace(password, "[redacted]")
        logger.error("history is off: couldn't set up the database (%s)", reason)
        await database.close()
        return None
    return database


def create_app(
    settings: Settings | None = None,
    *,
    llm_transport: httpx.AsyncBaseTransport | None = None,
    streaming_transport: httpx.AsyncBaseTransport | None = None,
    embedding_transport: httpx.AsyncBaseTransport | None = None,
    import_transport: httpx.AsyncBaseTransport | None = None,
    import_resolver: Resolver | None = None,
    auth_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    """Build the app. Transports are injectable so tests never call AssemblyAI."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        llm = LLMGateway(
            api_key=settings.llm_key,
            model=settings.answer_model,
            base_url=settings.llm_base,
            timeout=settings.llm_timeout_seconds,
            temperature=settings.llm_temperature,
            reasoning_effort=settings.llm_reasoning_effort.strip() or None,
            transport=llm_transport,
            provider=settings.llm_provider,
            name=settings.llm_name,
            problem=settings.llm_problem,
        )
        embedder = EmbeddingClient(
            api_key=settings.embedding_key,
            model=settings.embedding_model_name,
            base_url=settings.embedding_base,
            timeout=settings.llm_timeout_seconds,
            dimensions=settings.embedding_dimensions,
            transport=embedding_transport,
        )
        importer = Importer(
            SafeFetcher(
                max_bytes=settings.max_import_bytes,
                allow_private=settings.import_allow_private_hosts,
                transport=import_transport,
                resolver=import_resolver or system_resolver,
            ),
            GitHubClient(
                api_base_url=settings.github_api_base_url,
                token=settings.github_token.get_secret_value() if settings.github_token else None,
                max_bytes=settings.max_repo_download_bytes,
                transport=import_transport,
            ),
        )
        token_client = StreamingTokenClient(
            api_key=settings.api_key,
            base_url=settings.assemblyai_streaming_base_url,
            transport=streaming_transport,
        )
        auth = SupabaseAuth(
            url=settings.supabase_url,
            anon_key=settings.supabase_anon_key.get_secret_value().strip()
            if settings.supabase_anon_key
            else None,
            transport=auth_transport,
        )
        app.state.settings = settings
        app.state.store = MemoryStore(
            max_sessions=settings.max_sessions, ttl_hours=settings.session_ttl_hours
        )
        app.state.llm = llm
        app.state.embedder = embedder
        app.state.importer = importer
        app.state.token_client = token_client
        app.state.auth = auth
        app.state.database = await connect_database(settings)
        app.state.pipeline = TurnPipeline(
            llm,
            analysis_model=settings.analysis_model,
            answer_model=settings.answer_model,
            embedder=embedder,
            min_similarity=settings.retrieval_min_similarity,
        )
        app.state.background_tasks = set()
        try:
            yield
        finally:
            await llm.aclose()
            await embedder.aclose()
            await importer.aclose()
            await token_client.aclose()
            await auth.aclose()
            if app.state.database is not None:
                await app.state.database.close()

    app = FastAPI(
        title="Contexa API",
        version="0.1.0",
        summary="Streaming tokens, live translation, question detection, grounded answers.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        # Authorization carries a Supabase access token; X-Contexa-Device a device key.
        allow_headers=["Content-Type", "Authorization", "X-Contexa-Device"],
    )
    app.include_router(sessions.router)
    app.include_router(realtime.router)
    app.include_router(recap.router)
    app.include_router(history.router)

    @app.get("/health", tags=["meta"])
    async def health(request: Request) -> dict[str, object]:
        return {
            "status": "ok",
            "assemblyaiConfigured": settings.api_key is not None,
            "llmProvider": settings.llm_provider,
            "llmConfigured": settings.llm_problem is None,
            "llmProblem": settings.llm_problem,
            "llmModel": settings.answer_model,
            "llmAnalysisModel": settings.analysis_model,
            # Semantic search over documents (and history); null = BM25 only.
            "embeddingModel": settings.embedding_model_name
            if settings.embeddings_enabled
            else None,
            # Finished sessions can be saved, listed, and searched (DATABASE_URL).
            "historyEnabled": getattr(request.app.state, "database", None) is not None,
        }

    return app


app = create_app()
