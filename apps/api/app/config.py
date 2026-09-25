from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Secrets come from the environment only, never the client."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    assemblyai_api_key: SecretStr | None = None
    # One place to change the reasoning model (implementation guide §18).
    assemblyai_llm_model: str = "claude-sonnet-4-6"
    assemblyai_llm_base_url: str = "https://llm-gateway.assemblyai.com"
    assemblyai_streaming_base_url: str = "https://streaming.assemblyai.com"
    assemblyai_streaming_ws_url: str = "wss://streaming.assemblyai.com/v3/ws"

    streaming_token_ttl_seconds: int = Field(60, ge=1, le=600)
    # Caps billable streaming time if a browser tab is left open.
    streaming_max_session_seconds: int = Field(3600, ge=60, le=10800)
    streaming_tokens_per_session: int = Field(30, ge=1)

    llm_timeout_seconds: float = Field(15.0, gt=0)
    llm_temperature: float | None = 0.2

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
