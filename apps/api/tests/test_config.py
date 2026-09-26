from typing import Any

import pytest

from app.config import Settings


def settings(**values: Any) -> Settings:
    return Settings(_env_file=None, **values)


def test_assemblyai_is_the_default_provider() -> None:
    s = settings(assemblyai_api_key="aai-key")
    assert s.llm_provider == "assemblyai"
    assert s.llm_base == "https://llm-gateway.assemblyai.com/v1"
    assert s.llm_key == "aai-key"
    assert (s.answer_model, s.analysis_model) == ("claude-sonnet-4-6", "claude-haiku-4-5")
    assert s.llm_problem is None


def test_assemblyai_without_a_key_is_a_clear_problem() -> None:
    assert settings().llm_problem == "ASSEMBLYAI_API_KEY is not configured on the server."


@pytest.mark.parametrize(
    ("provider", "base"),
    [
        ("openrouter", "https://openrouter.ai/api/v1"),
        ("groq", "https://api.groq.com/openai/v1"),
        ("gemini", "https://generativelanguage.googleapis.com/v1beta/openai"),
        ("openai", "https://api.openai.com/v1"),
    ],
)
def test_openai_compatible_providers(provider: str, base: str) -> None:
    s = settings(
        assemblyai_api_key="aai-key",
        llm_provider=provider,
        llm_api_key=" llm-key ",
        llm_model="big",
        llm_fast_model="small",
    )
    assert s.llm_base == base
    assert s.llm_key == "llm-key"  # never the AssemblyAI key
    assert (s.answer_model, s.analysis_model) == ("big", "small")
    assert s.llm_problem is None


def test_other_providers_need_their_own_key_and_model() -> None:
    no_key = settings(assemblyai_api_key="aai-key", llm_provider="openrouter", llm_model="m")
    assert no_key.llm_problem == "LLM_API_KEY is not configured on the server."
    no_model = settings(llm_provider="openrouter", llm_api_key="k")
    assert no_model.llm_problem is not None and "LLM_MODEL" in no_model.llm_problem
    # The AssemblyAI model defaults don't leak into another provider.
    assert no_model.answer_model == "" and no_model.analysis_model == ""


def test_fast_model_falls_back_to_the_main_model() -> None:
    s = settings(llm_provider="groq", llm_api_key="k", llm_model="openai/gpt-oss-120b")
    assert s.analysis_model == "openai/gpt-oss-120b"


def test_custom_provider_needs_a_base_url() -> None:
    s = settings(llm_provider="custom", llm_api_key="k", llm_model="m")
    assert s.llm_problem == "LLM_BASE_URL is not configured on the server."
    s = settings(llm_provider="custom", llm_api_key="k", llm_model="m", llm_base_url="http://x/v1/")
    assert s.llm_base == "http://x/v1" and s.llm_problem is None
