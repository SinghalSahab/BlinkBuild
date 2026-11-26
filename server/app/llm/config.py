"""Environment-only LLM provider, model, throttling, and per-run limit configuration.

Per D-016: model strings, provider RPM limits, and per-run limits are NOT hardcoded.
"""

import logging
import os
from dataclasses import dataclass
from app.state.models import AgentOwner

logger = logging.getLogger(__name__)


def _require_env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return val


def _optional_int_env(name: str) -> int | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"Environment variable {name} must be an integer") from exc
    if value <= 0:
        raise RuntimeError(f"Environment variable {name} must be positive")
    return value


@dataclass(frozen=True)
class LlmConfig:
    agent_models: dict[AgentOwner, str]
    groq_api_key: str | None
    gemini_api_key: str | None
    ollama_base_url: str | None
    ollama_bearer_token: str | None
    fallback_chain: list[str]
    rpm_limits: dict[str, int | None]
    max_calls_per_run: int | None
    max_tokens_per_run: int | None
    max_seconds_per_run: int | None

    @classmethod
    def from_env(cls) -> "LlmConfig":
        agent_models = {
            AgentOwner.MANAGER: _require_env("LLM_MODEL_MANAGER"),
            AgentOwner.FRONTEND: _require_env("LLM_MODEL_FRONTEND"),
            AgentOwner.BACKEND: _require_env("LLM_MODEL_BACKEND"),
            AgentOwner.QA: _require_env("LLM_MODEL_QA"),
        }

        groq_api_key = os.environ.get("GROQ_API_KEY", "").strip() or None
        gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip() or None
        ollama_base_url = os.environ.get("OLLAMA_BASE_URL", "").strip() or None
        ollama_bearer_token = os.environ.get("OLLAMA_BEARER_TOKEN", "").strip() or None

        if not groq_api_key and not ollama_base_url and not gemini_api_key:
            raise RuntimeError(
                "Missing required LLM provider credentials: set at least one of "
                "GROQ_API_KEY, OLLAMA_BASE_URL, or GEMINI_API_KEY"
            )

        raw_chain = os.environ.get("LLM_FALLBACK_CHAIN", "").strip()
        if raw_chain:
            fallback_chain = [p.strip().lower() for p in raw_chain.split(",") if p.strip()]
        else:
            fallback_chain = ["local", "groq", "gemini"]

        rpm_limits = {
            "groq": _optional_int_env("LLM_RPM_GROQ"),
            "local": _optional_int_env("LLM_RPM_OLLAMA"),
            "gemini": _optional_int_env("LLM_RPM_GEMINI"),
        }
        for provider, rpm in rpm_limits.items():
            if rpm is None:
                logger.warning("Throttling is OFF for provider '%s' (RPM env not set)", provider)

        return cls(
            agent_models=agent_models,
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            ollama_base_url=ollama_base_url.rstrip("/") if ollama_base_url else None,
            ollama_bearer_token=ollama_bearer_token,
            fallback_chain=fallback_chain,
            rpm_limits=rpm_limits,
            max_calls_per_run=_optional_int_env("RUN_MAX_LLM_CALLS"),
            max_tokens_per_run=_optional_int_env("RUN_MAX_TOKENS"),
            max_seconds_per_run=_optional_int_env("RUN_MAX_SECONDS"),
        )
