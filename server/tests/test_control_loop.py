"""Phase 9 tests: CrewAI Flow control loop (success, defect recovery, 3-retry escalation, API)."""

import json
import sqlite3
from unittest.mock import MagicMock
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from app.api.events import RunEventBus
from app.config.settings import get_settings
from app.flows.control_loop import BlinkBuildOrchestrator
from app.main import app
from app.sandbox.runner import SandboxRunner
from app.state.db import create_sqlite_engine
from app.state.models import AgentOwner, LlmMode, Run, RunStatus
from app.state.repository import StateRepository


def _setup_state(tmp_path, run_id: str) -> tuple[StateRepository, str]:
    db_file = str(tmp_path / "p9.db")
    flow_db = str(tmp_path / "crewai_flows.db")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}")
    command.upgrade(cfg, "head")
    repo = StateRepository(create_sqlite_engine(db_file))
    repo.create_run(
        Run(
            id=run_id,
            clerk_user_id="user_1",
            prompt="Build a landing page",
            template_type="react",
            mode=LlmMode.AUTO,
        )
    )
    return repo, flow_db


def _plan_json() -> str:
    return json.dumps(
        {
            "activated_agents": ["frontend", "qa"],
            "tasks": [
                {
                    "owner": "frontend",
                    "title": "Build Landing UI",
                    "description": "Create App.tsx",
                    "acceptance_criteria": ["Renders hero section"],
                    "size_hint": "short",
                }
            ],
            "contract": None,
            "summary": "UI-only plan",
        }
    )


def _fe_json(code: str) -> str:
    return json.dumps(
        {
            "files": [{"path": "src/App.tsx", "content": code, "purpose": "App UI"}],
            "shell_commands": [],
            "notes": "done",
        }
    )


def _qa_json() -> str:
    return json.dumps(
        {
            "test_cases": [{"name": "Build passes", "category": "happy_path", "requirement_ref": "AC-1"}],
            "test_files": [{"path": "tests/app.test.ts", "content": "test('ok', () => {})", "purpose": "test"}],
        }
    )


def test_flow_normal_prompt_succeeds_and_persists_crewai_state(tmp_path):
    repo, flow_db = _setup_state(tmp_path, "run-ok")
    bus = RunEventBus()

    mock_docker = MagicMock()
    ok_container = MagicMock()
    ok_container.wait.return_value = {"StatusCode": 0}
    ok_container.logs.return_value = b"build ok"
    mock_docker.containers.create.return_value = ok_container

    def call_llm(owner: AgentOwner, _prompt: str, _size: str) -> str:
        if owner == AgentOwner.MANAGER:
            return _plan_json()
        if owner == AgentOwner.FRONTEND:
            return _fe_json("export default function App() { return <h1>Hi</h1>; }")
        return _qa_json()

    orch = BlinkBuildOrchestrator(
        repo=repo,
        sandbox=SandboxRunner(docker_client=mock_docker),
        event_bus=bus,
        call_agent_llm=call_llm,
        flow_db_path=flow_db,
        checks=[("build", ["npm", "run", "build"])],
    )
    state = orch.run_flow(
        run_id="run-ok",
        clerk_user_id="user_1",
        prompt="Build a landing page",
        template_type="react",
        mode=LlmMode.AUTO,
    )

    assert state.qa_passed is True
    assert repo.get_run("run-ok").status == RunStatus.SUCCEEDED
    assert '<boltAction type="file" filePath="src/App.tsx">' in state.artifact_xml
    events = [e["event"] for e in bus.get_history("run-ok")]
    assert "succeeded" in events

    # Verify CrewAI SQLiteFlowPersistence wrote rows to crewai_flows.db
    with sqlite3.connect(flow_db) as conn:
        count = conn.execute("SELECT COUNT(*) FROM flow_states").fetchone()[0]
        assert count >= 1


def test_flow_defect_recovery_fixes_on_retry_1(tmp_path):
    repo, flow_db = _setup_state(tmp_path, "run-fix")
    bus = RunEventBus()

    mock_docker = MagicMock()
    c_fail = MagicMock()
    c_fail.wait.return_value = {"StatusCode": 1}
    c_fail.logs.return_value = b"SyntaxError"
    c_pass = MagicMock()
    c_pass.wait.return_value = {"StatusCode": 0}
    c_pass.logs.return_value = b"ok"
    mock_docker.containers.create.side_effect = [c_fail, c_pass]

    def call_llm(owner: AgentOwner, prompt: str, _size: str) -> str:
        if owner == AgentOwner.MANAGER:
            if "Defect ID:" in prompt:
                return json.dumps({"owner": "frontend", "reason": "Syntax error in App.tsx"})
            return _plan_json()
        if owner == AgentOwner.FRONTEND:
            return _fe_json("export default function App() { return <h1>Fixed</h1>; }")
        return _qa_json()

    orch = BlinkBuildOrchestrator(
        repo=repo,
        sandbox=SandboxRunner(docker_client=mock_docker),
        event_bus=bus,
        call_agent_llm=call_llm,
        flow_db_path=flow_db,
        checks=[("build", ["npm", "run", "build"])],
    )
    state = orch.run_flow(
        run_id="run-fix",
        clerk_user_id="user_1",
        prompt="Build a landing page",
        template_type="react",
        mode=LlmMode.AUTO,
    )

    assert state.qa_passed is True
    assert repo.get_run("run-fix").status == RunStatus.SUCCEEDED
    assert repo.get_retry_count(state.primary_task_id) == 1


def test_flow_unfixable_escalates_at_exactly_3_retries(tmp_path):
    repo, flow_db = _setup_state(tmp_path, "run-esc")
    bus = RunEventBus()

    mock_docker = MagicMock()
    c_fail = MagicMock()
    c_fail.wait.return_value = {"StatusCode": 1}
    c_fail.logs.return_value = b"Persistent build error"
    mock_docker.containers.create.return_value = c_fail

    def call_llm(owner: AgentOwner, prompt: str, _size: str) -> str:
        if owner == AgentOwner.MANAGER:
            if "Defect ID:" in prompt:
                return json.dumps({"owner": "frontend", "reason": "Broken component"})
            return _plan_json()
        if owner == AgentOwner.FRONTEND:
            return _fe_json("broken(")
        return _qa_json()

    orch = BlinkBuildOrchestrator(
        repo=repo,
        sandbox=SandboxRunner(docker_client=mock_docker),
        event_bus=bus,
        call_agent_llm=call_llm,
        flow_db_path=flow_db,
        checks=[("build", ["npm", "run", "build"])],
    )
    state = orch.run_flow(
        run_id="run-esc",
        clerk_user_id="user_1",
        prompt="Build a landing page",
        template_type="react",
        mode=LlmMode.AUTO,
    )

    run = repo.get_run("run-esc")
    assert run.status == RunStatus.ESCALATED
    assert repo.get_retry_count(state.primary_task_id) == 3
    assert state.escalation_report is not None
    assert state.escalation_report["retries_attempted"] == 3
    assert len(state.escalation_report["defects"]) == 4  # initial + 3 retries


def test_runs_api_get_and_cancel(monkeypatch, tmp_path):
    db_file = str(tmp_path / "api_runs.db")
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
            id="run-api-1",
            clerk_user_id="user_1",
            prompt="hello",
            template_type="react",
            mode=LlmMode.FAST,
        )
    )

    headers = {"X-BlinkBuild-Secret": "s3cr3t", "X-Clerk-User-Id": "user_1"}
    with TestClient(app) as client:
        r_get = client.get("/runs/run-api-1", headers=headers)
        assert r_get.status_code == 200
        assert r_get.json()["run"]["id"] == "run-api-1"

        r_cancel = client.post("/runs/run-api-1/cancel", headers=headers)
        assert r_cancel.status_code == 200
        assert r_cancel.json()["status"] == "cancelled"

        r_after = client.get("/runs/run-api-1", headers=headers)
        assert r_after.json()["run"]["status"] == "cancelled"
    get_settings.cache_clear()
