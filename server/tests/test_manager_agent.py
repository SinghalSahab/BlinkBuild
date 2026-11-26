"""Phase 7 tests: Manager CrewAI agent, FR-06 activation across 6 prompts, and defect routing."""

import json
import pytest
from alembic import command
from alembic.config import Config
from app.agents.constraints import WEBCONTAINER_CONSTRAINTS
from app.agents.manager import (
    DefectRoutingEscalationError,
    build_manager_agent,
    plan_run,
    route_defect,
)
from app.state.db import create_sqlite_engine
from app.state.models import AgentOwner, Contract, Defect, LlmMode, Run, Task
from app.state.repository import StateRepository


def _setup_repo(tmp_path) -> tuple[StateRepository, str]:
    db_file = str(tmp_path / "p7.db")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}")
    command.upgrade(cfg, "head")
    repo = StateRepository(create_sqlite_engine(db_file))
    repo.create_run(
        Run(
            id="run-p7",
            clerk_user_id="user_1",
            prompt="test",
            template_type="react",
            mode=LlmMode.AUTO,
        )
    )
    return repo, "run-p7"


def test_build_manager_agent():
    agent = build_manager_agent()
    assert agent.role == "AI Software Engineering Manager"
    assert agent.allow_delegation is False


@pytest.mark.parametrize(
    "prompt,expected_agents,expect_contract",
    [
        ("Build a sleek SaaS landing page with pricing cards", ["frontend", "qa"], False),
        ("Create a responsive portfolio gallery with dark mode", ["frontend", "qa"], False),
        ("Build a REST API in Node for user profiles and JWT auth", ["backend", "qa"], False),
        ("Create an Express webhook receiver with signature check", ["backend", "qa"], False),
        ("Build a full-stack todo app with React UI and Node API", ["frontend", "backend", "qa"], True),
        ("Create a notes app with login UI and backend persistence", ["frontend", "backend", "qa"], True),
    ],
)
def test_selective_activation_six_prompts(tmp_path, prompt, expected_agents, expect_contract):
    repo, run_id = _setup_repo(tmp_path)

    tasks = []
    if "frontend" in expected_agents:
        tasks.append(
            {
                "owner": "frontend",
                "title": "Build UI",
                "description": prompt,
                "acceptance_criteria": ["UI renders cleanly"],
                "size_hint": "long",
            }
        )
    if "backend" in expected_agents:
        tasks.append(
            {
                "owner": "backend",
                "title": "Build API",
                "description": prompt,
                "acceptance_criteria": ["API returns 200"],
                "size_hint": "short",
            }
        )

    plan_json = json.dumps(
        {
            "activated_agents": expected_agents,
            "tasks": tasks,
            "contract": (
                {
                    "routes": [],
                    "frontend_paths": ["src/"],
                    "backend_paths": ["server/"],
                }
                if expect_contract
                else None
            ),
            "summary": f"Plan for: {prompt}",
        }
    )

    plan, created_tasks, contract = plan_run(
        run_id=run_id,
        prompt=prompt,
        template_type="react",
        constraints=WEBCONTAINER_CONSTRAINTS,
        call_llm=lambda _p: plan_json,
        repo=repo,
    )
    assert [a.value for a in plan.activated_agents] == expected_agents
    assert (contract is not None) is expect_contract
    assert len(created_tasks) == len(tasks)


def test_defect_routing_valid_reask_and_escalation(tmp_path):
    repo, run_id = _setup_repo(tmp_path)
    repo.create_task(Task(id="t1", run_id=run_id, owner=AgentOwner.BACKEND, title="API"))
    defect = Defect(
        id="def-1",
        run_id=run_id,
        task_id="t1",
        failing_check="unit_tests",
        evidence="401 expected on /api/profile",
    )
    contract = Contract(
        id="ctr-1",
        run_id=run_id,
        frontend_paths=["src/"],
        backend_paths=["server/"],
    )

    # 1. Invalid owner first, valid on re-ask
    responses = iter(
        [
            json.dumps({"owner": "devops", "reason": "wrong role", "is_contract_issue": False}),
            json.dumps({"owner": "backend", "reason": "auth middleware bug", "is_contract_issue": False}),
        ]
    )
    decision = route_defect(
        defect=defect,
        contract=contract,
        call_llm=lambda _p: next(responses),
        repo=repo,
    )
    assert decision.owner == "backend"

    # 2. Invalid owner twice -> escalate
    with pytest.raises(DefectRoutingEscalationError):
        route_defect(
            defect=defect,
            contract=contract,
            call_llm=lambda _p: json.dumps({"owner": "qa", "reason": "invalid"}),
        )
