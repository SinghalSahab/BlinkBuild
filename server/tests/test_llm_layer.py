"""Phase 4 tests: LLM config, mode routing, fallback chain, throttling, and run limits."""

import json
import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from app.config.settings import get_settings
from app.llm.config import LlmConfig
from app.llm.router import LlmRouter, ProviderThrottler, RunBudgetTracker, RunLimitExceeded
from app.main import app
from app.state.db import create_sqlite_engine
from app.state.models import AgentOwner, LlmMode, Run
from app.state.repository import StateRepository


def _setup_env(monkeypatch, **overrides):
    defaults = {
        "BLINKBUILD_SERVER_SECRET": "test-secret",
        "SQLITE_DB_PATH": "/tmp/llm_test.db",
        "LLM_MODEL_MANAGER": "stub-mgr",
        "LLM_MODEL_FRONTEND": "stub-fe",
        "LLM_MODEL_BACKEND": "stub-be",
        "LLM_MODEL_QA": "stub-qa",
        "GROQ_API_KEY": "stub-groq",
        "OLLAMA_BASE_URL": "https://stub.ngrok-free.app",
        "OLLAMA_BEARER_TOKEN": "stub-ollama-token",
        "GEMINI_API_KEY": "stub-gemini",
    }
    defaults.update(overrides)
    for k, v in defaults.items():
        if v is None:
            monkeypatch.delenv(k, raising=False)
        else:
            monkeypatch.setenv(k, v)


def _make_repo(tmp_path) -> tuple[StateRepository, str]:
    db_file = str(tmp_path / "llm.db")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}")
    command.upgrade(cfg, "head")
    engine = create_sqlite_engine(db_file)
    repo = StateRepository(engine)
    repo.create_run(
        Run(
            id="run-llm-1",
            clerk_user_id="user_1",
            prompt="test",
            template_type="react",
            mode=LlmMode.AUTO,
        )
    )
    return repo, "run-llm-1"


def test_missing_model_env_fails_fast(monkeypatch):
    _setup_env(monkeypatch, LLM_MODEL_MANAGER=None)
    with pytest.raises(RuntimeError, match="LLM_MODEL_MANAGER"):
        LlmConfig.from_env()


def test_local_mode_sends_ngrok_header_and_fallback_to_groq(monkeypatch, tmp_path):
    _setup_env(monkeypatch)
    repo, run_id = _make_repo(tmp_path)
    seen_headers = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if "ngrok-free.app" in str(request.url):
            seen_headers.update(dict(request.headers))
            return httpx.Response(503, json={"error": "tunnel down"})
        if "api.groq.com" in str(request.url):
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": "groq-ok"}}],
                    "usage": {"prompt_tokens": 12, "completion_tokens": 8},
                },
            )
        return httpx.Response(500)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    router = LlmRouter(LlmConfig.from_env(), repo=repo, http_client=client)
    tracker = RunBudgetTracker(run_id=run_id, started_at=0.0)

    res = router.generate(
        agent=AgentOwner.BACKEND,
        prompt="build api",
        mode=LlmMode.LOCAL,
        tracker=tracker,
    )
    assert res.provider == "groq"
    assert res.text == "groq-ok"
    assert res.fallback_notice is not None and "local unavailable" in res.fallback_notice
    assert seen_headers.get("ngrok-skip-browser-warning") == "true"
    assert seen_headers.get("authorization") == "Bearer stub-ollama-token"
    assert tracker.calls == 1
    assert tracker.tokens == 20

    audits = repo.list_audit_entries(run_id)
    assert any(a.category == "PROVIDER_FALLBACK" for a in audits)
    assert any(a.category == "LIMIT_WARNING" for a in audits)


def test_throttler_sleeps_when_rpm_configured():
    now = [0.0]
    slept = []

    def clock():
        return now[0]

    def sleeper(sec):
        slept.append(sec)
        now[0] += sec

    throttler = ProviderThrottler({"groq": 2}, clock=clock, sleeper=sleeper)
    throttler.acquire("groq")
    throttler.acquire("groq")
    throttler.acquire("groq")
    assert slept == [60.0]


def test_per_run_limits_enforced(monkeypatch, tmp_path):
    _setup_env(monkeypatch, RUN_MAX_LLM_CALLS="1", RUN_MAX_TOKENS="100", RUN_MAX_SECONDS="10")
    repo, run_id = _make_repo(tmp_path)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            },
        )

    client = httpx.Client(transport=httpx.MockTransport(handler))
    router = LlmRouter(LlmConfig.from_env(), repo=repo, http_client=client, clock=lambda: 1.0)
    tracker = RunBudgetTracker(run_id=run_id, started_at=0.0)

    router.generate(agent=AgentOwner.MANAGER, prompt="plan", mode=LlmMode.FAST, tracker=tracker)
    with pytest.raises(RunLimitExceeded, match="RUN_MAX_LLM_CALLS"):
        router.generate(agent=AgentOwner.FRONTEND, prompt="ui", mode=LlmMode.FAST, tracker=tracker)


def test_llm_status_endpoint_requires_auth(monkeypatch):
    get_settings.cache_clear()
    _setup_env(monkeypatch)
    with TestClient(app) as client:
        unauth = client.get("/llm/status")
        assert unauth.status_code == 401
        auth = client.get(
            "/llm/status",
            headers={"X-BlinkBuild-Secret": "test-secret", "X-Clerk-User-Id": "user_1"},
        )
        assert auth.status_code == 200
        body = auth.json()
        assert "providers" in body
        assert body["agent_models"]["manager"] == "stub-mgr"
    get_settings.cache_clear()


def test_ngrok_html_interstitial_and_disconnect_fallback(monkeypatch, tmp_path):
    _setup_env(monkeypatch)
    repo, run_id = _make_repo(tmp_path)
    calls = {"local": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if "ngrok-free.app" in str(request.url):
            calls["local"] += 1
            if calls["local"] == 1:
                return httpx.Response(200, headers={"content-type": "text/html"}, text="<html>ngrok warning</html>")
            raise httpx.ConnectError("Tunnel disconnected", request=request)
        if "api.groq.com" in str(request.url):
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": "groq-recovered"}}],
                    "usage": {"prompt_tokens": 5, "completion_tokens": 5},
                },
            )
        return httpx.Response(500)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    router = LlmRouter(LlmConfig.from_env(), repo=repo, http_client=client)
    tracker = RunBudgetTracker(run_id=run_id, started_at=0.0)

    # 1. HTML interstitial triggers fallback
    r1 = router.generate(agent=AgentOwner.FRONTEND, prompt="ui", mode=LlmMode.LOCAL, tracker=tracker)
    assert r1.provider == "groq"
    assert r1.fallback_notice is not None

    # 2. Mid-session disconnect triggers fallback
    r2 = router.generate(agent=AgentOwner.FRONTEND, prompt="ui2", mode=LlmMode.LOCAL, tracker=tracker)
    assert r2.provider == "groq"
    assert "ConnectError" in (r2.fallback_notice or "")


def test_provider_specific_model_overrides_during_fallback(monkeypatch, tmp_path):
    _setup_env(
        monkeypatch,
        LLM_MODEL_OLLAMA="ollama-coder-model",
        LLM_MODEL_GROQ="groq-fast-model",
        LLM_MODEL_GROQ_FRONTEND="groq-ui-model",
    )
    repo, run_id = _make_repo(tmp_path)
    seen_models = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        seen_models.append(body.get("model"))
        if "ngrok-free.app" in str(request.url):
            return httpx.Response(503, json={"error": "down"})
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 5, "completion_tokens": 5},
            },
        )

    router = LlmRouter(
        LlmConfig.from_env(),
        repo=repo,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    tracker = RunBudgetTracker(run_id=run_id, started_at=0.0)
    res = router.generate(agent=AgentOwner.FRONTEND, prompt="ui", mode=LlmMode.LOCAL, tracker=tracker)
    assert seen_models == ["ollama-coder-model", "groq-ui-model"]
    assert res.model == "groq-ui-model"
