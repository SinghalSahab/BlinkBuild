"""LLM router: mode selection, health checks, fallback chain, throttling, and run limits."""

import time
import uuid
from collections import deque
from dataclasses import dataclass
from typing import Callable
import httpx
from app.llm.config import LlmConfig
from app.state.models import AgentOwner, AuditEntry, LlmMode, LlmUsage
from app.state.repository import StateRepository


class RunLimitExceeded(Exception):
    """Raised when a per-run LLM call, token, or wall-clock limit is reached."""


class AllProvidersFailedError(Exception):
    """Raised when every configured provider in the fallback chain fails."""


@dataclass
class LlmResponse:
    provider: str
    model: str
    text: str
    tokens_in: int | None
    tokens_out: int | None
    latency_ms: int
    fallback_notice: str | None = None


@dataclass
class RunBudgetTracker:
    """Tracks per-run calls, tokens, and elapsed wall-clock time."""

    run_id: str
    started_at: float
    calls: int = 0
    tokens: int = 0


class ProviderThrottler:
    """Sliding-window 60s RPM throttler per provider."""

    def __init__(
        self,
        rpm_limits: dict[str, int | None],
        clock: Callable[[], float] = time.monotonic,
        sleeper: Callable[[float], None] = time.sleep,
    ):
        self._rpm_limits = rpm_limits
        self._clock = clock
        self._sleeper = sleeper
        self._timestamps: dict[str, deque[float]] = {k: deque() for k in rpm_limits}

    def acquire(self, provider: str) -> None:
        limit = self._rpm_limits.get(provider)
        if limit is None:
            return
        window = self._timestamps.setdefault(provider, deque())
        now = self._clock()
        while window and now - window[0] >= 60.0:
            window.popleft()
        if len(window) >= limit:
            wait_seconds = 60.0 - (now - window[0])
            if wait_seconds > 0:
                self._sleeper(wait_seconds)
            now = self._clock()
            while window and now - window[0] >= 60.0:
                window.popleft()
        window.append(now)


class LlmRouter:
    """Routes LLM requests across local (Ollama), fast (Groq), and fallback (Gemini)."""

    def __init__(
        self,
        config: LlmConfig,
        repo: StateRepository | None = None,
        http_client: httpx.Client | None = None,
        throttler: ProviderThrottler | None = None,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.config = config
        self.repo = repo
        self._client = http_client or httpx.Client(timeout=30.0)
        self._throttler = throttler or ProviderThrottler(config.rpm_limits, clock=clock)
        self._clock = clock

    def check_provider_health(self, provider: str) -> dict[str, object]:
        """Check health of a provider ('local' or 'groq' or 'gemini')."""
        if provider == "local":
            if not self.config.ollama_base_url:
                return {"configured": False, "healthy": False, "reason": "OLLAMA_BASE_URL not set"}
            headers = {"ngrok-skip-browser-warning": "true"}
            if self.config.ollama_bearer_token:
                headers["Authorization"] = f"Bearer {self.config.ollama_bearer_token}"
            try:
                resp = self._client.get(f"{self.config.ollama_base_url}/api/tags", headers=headers, timeout=5.0)
                return {"configured": True, "healthy": resp.status_code == 200, "status_code": resp.status_code}
            except httpx.HTTPError as exc:
                return {"configured": True, "healthy": False, "reason": type(exc).__name__}

        if provider == "groq":
            if not self.config.groq_api_key:
                return {"configured": False, "healthy": False, "reason": "GROQ_API_KEY not set"}
            try:
                resp = self._client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {self.config.groq_api_key}"},
                    timeout=5.0,
                )
                return {"configured": True, "healthy": resp.status_code == 200, "status_code": resp.status_code}
            except httpx.HTTPError as exc:
                return {"configured": True, "healthy": False, "reason": type(exc).__name__}

        if provider == "gemini":
            return {"configured": bool(self.config.gemini_api_key), "healthy": bool(self.config.gemini_api_key)}

        return {"configured": False, "healthy": False, "reason": f"Unknown provider {provider}"}

    def status_summary(self) -> dict[str, object]:
        return {
            "providers": {
                "local": self.check_provider_health("local"),
                "groq": self.check_provider_health("groq"),
                "gemini": self.check_provider_health("gemini"),
            },
            "agent_models": {k.value: v for k, v in self.config.agent_models.items()},
            "fallback_chain": self.config.fallback_chain,
        }

    def _is_configured(self, provider: str) -> bool:
        if provider == "local":
            return bool(self.config.ollama_base_url)
        if provider == "groq":
            return bool(self.config.groq_api_key)
        if provider == "gemini":
            return bool(self.config.gemini_api_key)
        return False

    def select_providers(self, mode: LlmMode, size_hint: str = "short") -> list[str]:
        """Select ordered list of providers to try based on mode, size_hint, and fallback chain."""
        if mode == LlmMode.FAST:
            primary = "groq"
        elif mode == LlmMode.LOCAL:
            primary = "local"
        else:  # AUTO
            if size_hint == "long" and self.check_provider_health("local").get("healthy"):
                primary = "local"
            else:
                primary = "groq"

        ordered = [primary] + [p for p in self.config.fallback_chain if p != primary]
        return [p for p in ordered if self._is_configured(p)]

    def _check_limits_before(self, tracker: RunBudgetTracker) -> None:
        if self.config.max_calls_per_run is None and self.repo:
            self.repo.append_audit(
                AuditEntry(
                    id=f"aud-{uuid.uuid4().hex[:12]}",
                    run_id=tracker.run_id,
                    category="LIMIT_WARNING",
                    actor="llm_router",
                    message="RUN_MAX_LLM_CALLS is not set; call limit unchecked.",
                    requirement_refs=["FR-29"],
                )
            )
        if (
            self.config.max_calls_per_run is not None
            and tracker.calls >= self.config.max_calls_per_run
        ):
            raise RunLimitExceeded(f"Reached RUN_MAX_LLM_CALLS ({self.config.max_calls_per_run})")

        if (
            self.config.max_tokens_per_run is not None
            and tracker.tokens >= self.config.max_tokens_per_run
        ):
            raise RunLimitExceeded(f"Reached RUN_MAX_TOKENS ({self.config.max_tokens_per_run})")

        if self.config.max_seconds_per_run is not None:
            elapsed = self._clock() - tracker.started_at
            if elapsed >= self.config.max_seconds_per_run:
                raise RunLimitExceeded(f"Reached RUN_MAX_SECONDS ({self.config.max_seconds_per_run})")

    def _call_provider(self, provider: str, model: str, prompt: str) -> tuple[str, int | None, int | None]:
        if provider == "local":
            headers = {"ngrok-skip-browser-warning": "true"}
            if self.config.ollama_bearer_token:
                headers["Authorization"] = f"Bearer {self.config.ollama_bearer_token}"
            resp = self._client.post(
                f"{self.config.ollama_base_url}/api/generate",
                headers=headers,
                json={"model": model, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            if "text/html" in resp.headers.get("content-type", "").lower():
                raise httpx.HTTPError("Received HTML instead of JSON from Ollama tunnel")
            data = resp.json()
            return data.get("response", ""), data.get("prompt_eval_count"), data.get("eval_count")

        if provider == "groq":
            resp = self._client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.config.groq_api_key}"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}]},
            )
            resp.raise_for_status()
            data = resp.json()
            text = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            return text, usage.get("prompt_tokens"), usage.get("completion_tokens")

        if provider == "gemini":
            resp = self._client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                params={"key": self.config.gemini_api_key},
                json={"contents": [{"parts": [{"text": prompt}]}]},
            )
            resp.raise_for_status()
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            meta = data.get("usageMetadata", {})
            return text, meta.get("promptTokenCount"), meta.get("candidatesTokenCount")

        raise ValueError(f"Unsupported provider: {provider}")

    def generate(
        self,
        *,
        agent: AgentOwner,
        prompt: str,
        mode: LlmMode,
        tracker: RunBudgetTracker,
        size_hint: str = "short",
    ) -> LlmResponse:
        """Execute an LLM call with throttling, fallback, usage tracking, and limit checks."""
        self._check_limits_before(tracker)
        model = self.config.agent_models[agent]
        providers = self.select_providers(mode, size_hint=size_hint)
        if not providers:
            raise AllProvidersFailedError("No configured LLM providers available")

        last_error: str | None = None
        first_provider = providers[0]

        for idx, provider in enumerate(providers):
            self._throttler.acquire(provider)
            t0 = self._clock()
            try:
                text, tok_in, tok_out = self._call_provider(provider, model, prompt)
                latency_ms = max(0, int((self._clock() - t0) * 1000))
                tracker.calls += 1
                tracker.tokens += (tok_in or 0) + (tok_out or 0)

                if self.repo:
                    self.repo.record_llm_usage(
                        LlmUsage(
                            id=f"llm-{uuid.uuid4().hex[:12]}",
                            run_id=tracker.run_id,
                            agent=agent,
                            provider=provider,
                            model=model,
                            tokens_in=tok_in,
                            tokens_out=tok_out,
                            latency_ms=latency_ms,
                        )
                    )

                notice = None
                if idx > 0:
                    notice = f"{first_provider} unavailable ({last_error}), using {provider}"
                    if self.repo:
                        self.repo.append_audit(
                            AuditEntry(
                                id=f"aud-{uuid.uuid4().hex[:12]}",
                                run_id=tracker.run_id,
                                category="PROVIDER_FALLBACK",
                                actor="llm_router",
                                message=notice,
                                requirement_refs=["FR-28"],
                            )
                        )

                if (
                    self.config.max_tokens_per_run is not None
                    and tracker.tokens > self.config.max_tokens_per_run
                ):
                    raise RunLimitExceeded(f"Exceeded RUN_MAX_TOKENS ({self.config.max_tokens_per_run})")

                return LlmResponse(
                    provider=provider,
                    model=model,
                    text=text,
                    tokens_in=tok_in,
                    tokens_out=tok_out,
                    latency_ms=latency_ms,
                    fallback_notice=notice,
                )
            except (httpx.HTTPError, ValueError) as exc:
                last_error = type(exc).__name__
                if isinstance(exc, httpx.HTTPStatusError):
                    last_error = f"HTTP {exc.response.status_code}"
                continue

        raise AllProvidersFailedError(f"All providers failed ({', '.join(providers)}): {last_error}")
