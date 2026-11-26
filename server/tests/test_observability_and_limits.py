"""Phase 12 tests: Audit entries, run summary metrics, low-limit escalation, and secret hygiene."""

import json
from unittest.mock import MagicMock
import httpx
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from app.api.events import RunEventBus
from app.config.settings import get_settings
from app.flows.control_loop import BlinkBuildOrchestrator
from app.llm.config import LlmConfig
from app.llm.router import LlmRouter, RunBudgetTracker
from app.main import app
from app.sandbox.runner import SandboxRunner
from app.state.db import create_sqlite_engine
from app.state.models import AgentOwner, LlmMode, LlmUsage, Run, RunStatus
from app.state.repository import StateRepository


def test_low_limit_triggers_limit_reached_audit_and_escalation(monkeypatch, tmp_path):
    db_file = str(tmp_path / "p12_limit.db")
    flow_db = str(tmp_path / "p12_flows.db")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}")
    command.upgrade(cfg, "head")

    monkeypatch.setenv("BLINKBUILD_SERVER_SECRET", "super-secret-value-xyz")
    monkeypatch.setenv("SQLITE_DB_PATH", db_file)
    monkeypatch.setenv("LLM_MODEL_MANAGER", "stub-mgr")
    monkeypatch.setenv("LLM_MODEL_FRONTEND", "stub-fe")
    monkeypatch.setenv("LLM_MODEL_BACKEND", "stub-be")
    monkeypatch.setenv("LLM_MODEL_QA", "stub-qa")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_super_secret_key_12345")
    monkeypatch.setenv("RUN_MAX_LLM_CALLS", "1")
    for k in ("RUN_MAX_TOKENS", "RUN_MAX_SECONDS", "LLM_RPM_GROQ", "LLM_RPM_OLLAMA", "LLM_RPM_GEMINI", "LLM_FALLBACK_CHAIN"):
        monkeypatch.delenv(k, raising=False)

    repo = StateRepository(create_sqlite_engine(db_file))
    repo.create_run(
        Run(
            id="run-lim",
            clerk_user_id="user_1",
            prompt="Build landing page",
            template_type="react",
            mode=LlmMode.FAST,
        )
    )

    plan_payload = json.dumps(
        {
            "activated_agents": ["frontend", "qa"],
            "tasks": [
                {
                    "owner": "frontend",
                    "title": "Build UI",
                    "description": "UI",
                    "acceptance_criteria": ["Renders"],
                    "size_hint": "short",
                }
            ],
            "contract": None,
            "summary": "UI plan",
        }
    )

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": plan_payload}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 20},
            },
        )

    router = LlmRouter(
        LlmConfig.from_env(),
        repo=repo,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    tracker = RunBudgetTracker(run_id="run-lim", started_at=0.0)
    bus = RunEventBus()

    orch = BlinkBuildOrchestrator(
        repo=repo,
        sandbox=SandboxRunner(docker_client=MagicMock()),
        event_bus=bus,
        call_agent_llm=lambda owner, p, sh: router.generate(
            agent=owner, prompt=p, mode=LlmMode.FAST, tracker=tracker, size_hint=sh
        ).text,
        flow_db_path=flow_db,
    )
    orch.run_flow(
        run_id="run-lim",
        clerk_user_id="user_1",
        prompt="Build landing page",
        template_type="react",
        mode=LlmMode.FAST,
    )

    run = repo.get_run("run-lim")
    assert run.status == RunStatus.ESCALATED
    assert "RUN_MAX_LLM_CALLS" in (run.escalation_reason or "")
    audits = repo.list_audit_entries("run-lim")
    assert any(a.category == "LIMIT_REACHED" for a in audits)
    assert all("gsk_super_secret_key_12345" not in a.message for a in audits)
    assert all("super-secret-value-xyz" not in a.message for a in audits)
    events = [e["event"] for e in bus.get_history("run-lim")]
    assert "limit_reached" in events
    assert "escalated" in events


def test_run_summary_includes_usage_providers_tokens_and_duration(monkeypatch, tmp_path):
    db_file = str(tmp_path / "p12_summary.db")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}")
    command.upgrade(cfg, "head")

    get_settings.cache_clear()
    monkeypatch.setenv("BLINKBUILD_SERVER_SECRET", "s3cr3t")
    monkeypatch.setenv("SQLITE_DB_PATH", db_file)
    monkeypatch.setenv("LLM_MODEL_MANAGER", "m")
    monkeypatch.setenv("LLM_MODEL_FRONTEND", "f")
    monkeypatch.setenv("LLM_MODEL_BACKEND", "b")
    monkeypatch.setenv("LLM_MODEL_QA", "q")
    monkeypatch.setenv("GROQ_API_KEY", "g")

    repo = StateRepository(create_sqlite_engine(db_file))
    repo.create_run(
        Run(
            id="run-sum-1",
            clerk_user_id="user_1",
            prompt="hello",
            template_type="react",
            mode=LlmMode.FAST,
        )
    )
    repo.record_llm_usage(
        LlmUsage(
            id="u1",
            run_id="run-sum-1",
            agent=AgentOwner.MANAGER,
            provider="groq",
            model="m",
            tokens_in=15,
            tokens_out=25,
            latency_ms=100,
        )
    )

    headers = {"X-BlinkBuild-Secret": "s3cr3t", "X-Clerk-User-Id": "user_1"}
    with TestClient(app) as client:
        resp = client.get("/runs/run-sum-1", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["providers_used"] == ["groq"]
        assert body["total_tokens"] == 40
        assert len(body["llm_usage"]) == 1
        assert isinstance(body["duration_ms"], int)
    get_settings.cache_clear()
