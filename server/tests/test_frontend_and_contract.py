"""Phase 6 tests: Frontend agent, Contract ownership, full-stack merge, and conflict defect."""

import json
import pytest
from alembic import command
from alembic.config import Config
from app.agents.backend import run_backend_task
from app.agents.constraints import WEBCONTAINER_CONSTRAINTS
from app.agents.frontend import build_frontend_agent, build_frontend_prompt, run_frontend_task
from app.agents.merge import MergeConflictError, merge_agent_outputs
from app.agents.schemas import AgentTaskInput
from app.state.db import create_sqlite_engine
from app.state.models import AgentOwner, Contract, ContractRoute, LlmMode, Run, Task
from app.state.repository import StateRepository


def _setup_repo(tmp_path) -> tuple[StateRepository, str]:
    db_file = str(tmp_path / "p6.db")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}")
    command.upgrade(cfg, "head")
    repo = StateRepository(create_sqlite_engine(db_file))
    repo.create_run(
        Run(
            id="run-p6",
            clerk_user_id="user_1",
            prompt="Full-stack notes app",
            template_type="react",
            mode=LlmMode.AUTO,
        )
    )
    return repo, "run-p6"


def test_build_frontend_agent_and_context_minimization():
    agent = build_frontend_agent()
    assert agent.role == "Frontend Software Engineer"
    assert agent.allow_delegation is False

    task = Task(
        id="task-fe-1",
        run_id="run-p6",
        owner=AgentOwner.FRONTEND,
        title="Build Notes UI",
        acceptance_criteria=["Displays notes list"],
    )
    prompt = build_frontend_prompt(
        AgentTaskInput(
            task=task,
            template_type="react",
            existing_owned_files={"src/App.tsx": "export default function App() {}"},
            allowed_prefixes=["src/"],
            constraints=WEBCONTAINER_CONSTRAINTS,
        )
    )
    assert "src/App.tsx" in prompt
    assert "Build Notes UI" in prompt


def test_ui_only_and_fullstack_merge(tmp_path):
    repo, run_id = _setup_repo(tmp_path)
    contract = Contract(
        id="ctr-1",
        run_id=run_id,
        routes=[ContractRoute(path="/api/notes", method="GET", response_shape={"notes": "string[]"})],
        frontend_paths=["src/"],
        backend_paths=["server/"],
    )
    repo.save_contract(contract)

    fe_task = repo.create_task(
        Task(id="t-fe", run_id=run_id, owner=AgentOwner.FRONTEND, title="Notes UI")
    )
    be_task = repo.create_task(
        Task(id="t-be", run_id=run_id, owner=AgentOwner.BACKEND, title="Notes API")
    )

    fe_out = run_frontend_task(
        task_input=AgentTaskInput(
            task=fe_task,
            template_type="react",
            contract=contract,
            allowed_prefixes=contract.frontend_paths,
            constraints=WEBCONTAINER_CONSTRAINTS,
        ),
        call_llm=lambda _p: json.dumps(
            {
                "files": [
                    {
                        "path": "src/App.tsx",
                        "content": "export default function App() { return <div>Notes</div>; }",
                        "purpose": "Root UI",
                    }
                ],
                "shell_commands": [],
                "notes": "UI ready",
            }
        ),
        repo=repo,
    )

    be_out = run_backend_task(
        task_input=AgentTaskInput(
            task=be_task,
            template_type="react",
            contract=contract,
            allowed_prefixes=contract.backend_paths,
            constraints=WEBCONTAINER_CONSTRAINTS,
        ),
        call_llm=lambda _p: json.dumps(
            {
                "files": [
                    {
                        "path": "server/index.js",
                        "content": "console.log('api');",
                        "purpose": "API server",
                    }
                ],
                "shell_commands": ["npm install"],
                "notes": "API ready",
            }
        ),
        repo=repo,
    )

    artifact = merge_agent_outputs(
        run_id=run_id,
        title="Full-Stack Notes",
        outputs=[
            (AgentOwner.FRONTEND, fe_task.id, fe_out),
            (AgentOwner.BACKEND, be_task.id, be_out),
        ],
        repo=repo,
    )
    assert 'filePath="src/App.tsx"' in artifact
    assert 'filePath="server/index.js"' in artifact
    assert len(repo.list_generated_files(run_id)) == 2


def test_cross_agent_conflict_logs_contract_defect(tmp_path):
    repo, run_id = _setup_repo(tmp_path)
    fe_task = repo.create_task(Task(id="t-fe-c", run_id=run_id, owner=AgentOwner.FRONTEND, title="UI"))
    be_task = repo.create_task(Task(id="t-be-c", run_id=run_id, owner=AgentOwner.BACKEND, title="API"))

    fe_out = run_frontend_task(
        task_input=AgentTaskInput(task=fe_task, template_type="react", constraints=WEBCONTAINER_CONSTRAINTS),
        call_llm=lambda _p: json.dumps(
            {"files": [{"path": "shared.ts", "content": "export const a = 1;", "purpose": "fe"}]}
        ),
    )
    be_out = run_backend_task(
        task_input=AgentTaskInput(task=be_task, template_type="react", constraints=WEBCONTAINER_CONSTRAINTS),
        call_llm=lambda _p: json.dumps(
            {"files": [{"path": "shared.ts", "content": "export const a = 2;", "purpose": "be"}]}
        ),
    )

    with pytest.raises(MergeConflictError, match="shared.ts"):
        merge_agent_outputs(
            run_id=run_id,
            title="Conflict",
            outputs=[
                (AgentOwner.FRONTEND, fe_task.id, fe_out),
                (AgentOwner.BACKEND, be_task.id, be_out),
            ],
            repo=repo,
        )

    defects = repo.list_defects(run_id)
    assert len(defects) == 1
    assert defects[0].owner == AgentOwner.MANAGER
    assert defects[0].failing_check == "contract_merge"
