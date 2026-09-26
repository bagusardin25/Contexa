from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

LLMProvider = Literal["assemblyai", "openrouter", "groq", "gemini", "openai", "custom"]

# OpenAI-compatible chat completions APIs, by base URL (ending in /v1 or equivalent).
LLM_BASE_URLS: dict[str, str] = {
    "openrouter": "https://openrouter.ai/api/v1",
    "groq": "https://api.groq.com/openai/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "openai": "https://api.openai.com/v1",
}

LLM_PROVIDER_NAMES: dict[str, str] = {
    "assemblyai": "the AssemblyAI LLM Gateway",
    "openrouter": "OpenRouter",
    "groq": "Groq",
    "gemini": "the Gemini API",
    "openai": "OpenAI",
    "custom": "the LLM provider",
}


class Settings(BaseSettings):
    """Runtime configuration. Secrets come from the environment only, never the client."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    assemblyai_api_key: SecretStr | None = None
    # One place to change the reasoning models (implementation guide §18). Grounded answers
    # use the main model; the per-turn analysis (translation + question detection) runs on
    # every finished turn, so it gets a faster model. Leave the fast model empty to use the
    # main model for both.
    assemblyai_llm_model: str = "claude-sonnet-4-6"
    assemblyai_llm_fast_model: str = "claude-haiku-4-5"
    assemblyai_llm_base_url: str = "https://llm-gateway.assemblyai.com"
    assemblyai_streaming_base_url: str = "https://streaming.assemblyai.com"
    assemblyai_streaming_ws_url: str = "wss://streaming.assemblyai.com/v3/ws"

    # Who translates, detects questions, and drafts answers. "assemblyai" is the AssemblyAI
    # LLM Gateway (ASSEMBLYAI_API_KEY; not part of AssemblyAI's free plan). Every other
    # provider is an OpenAI-compatible API called with LLM_API_KEY and LLM_MODEL.
    llm_provider: LLMProvider = "assemblyai"
    llm_api_key: SecretStr | None = None
    # An OpenAI-compatible base URL, e.g. http://host/v1. Required for LLM_PROVIDER=custom;
    # for the named providers it replaces their default (a proxy, a regional endpoint).
    llm_base_url: str = ""
    # Override the models for any provider (required for all but assemblyai).
    llm_model: str = ""
    llm_fast_model: str = ""

    streaming_token_ttl_seconds: int = Field(60, ge=1, le=600)
    # Caps billable streaming time if a browser tab is left open.
    streaming_max_session_seconds: int = Field(3600, ge=60, le=10800)
    streaming_tokens_per_session: int = Field(30, ge=1)

    llm_timeout_seconds: float = Field(15.0, gt=0)
    llm_temperature: float | None = 0.2
    # For reasoning models (gpt-oss, Gemini 2.5, o-series): "low" answers faster and spends
    # fewer tokens of a free tier's per-minute budget. Empty = the provider's default.
    llm_reasoning_effort: str = ""

    cors_origins: str = "http://localhost:3000"
    max_upload_bytes: int = 10 * 1024 * 1024
    max_documents_per_session: int = 10
    max_sessions: int = 500
    session_ttl_hours: float = 12

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def api_key(self) -> str | None:
        if self.assemblyai_api_key is None:
            return None
        return self.assemblyai_api_key.get_secret_value() or None

    @property
    def llm_base(self) -> str:
        """Base URL of the chat completions API: `{llm_base}/chat/completions`."""
        if self.llm_provider == "assemblyai":
            return f"{self.assemblyai_llm_base_url.rstrip('/')}/v1"
        override = self.llm_base_url.strip().rstrip("/")
        if override or self.llm_provider == "custom":
            return override
        return LLM_BASE_URLS[self.llm_provider]

    @property
    def llm_key(self) -> str | None:
        if self.llm_provider == "assemblyai":
            return self.api_key
        if self.llm_api_key is None:
            return None
        return self.llm_api_key.get_secret_value().strip() or None

    @property
    def llm_name(self) -> str:
        return LLM_PROVIDER_NAMES[self.llm_provider]

    @property
    def answer_model(self) -> str:
        if self.llm_model.strip():
            return self.llm_model.strip()
        return self.assemblyai_llm_model.strip() if self.llm_provider == "assemblyai" else ""

    @property
    def analysis_model(self) -> str:
        fast = self.llm_fast_model.strip()
        if not fast and self.llm_provider == "assemblyai":
            fast = self.assemblyai_llm_fast_model.strip()
        return fast or self.answer_model

    @property
    def llm_problem(self) -> str | None:
        """Why translations and answers can't run as configured, or None."""
        if not self.llm_key:
            name = "ASSEMBLYAI_API_KEY" if self.llm_provider == "assemblyai" else "LLM_API_KEY"
            return f"{name} is not configured on the server."
        if self.llm_provider == "custom" and not self.llm_base:
            return "LLM_BASE_URL is not configured on the server."
        if not self.answer_model:
            return f"LLM_MODEL is not configured on the server (LLM_PROVIDER={self.llm_provider})."
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()
