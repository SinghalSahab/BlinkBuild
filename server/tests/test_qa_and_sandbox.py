"""Phase 8 tests: Hardened sandbox template, archive copy, timeout/cleanup, and QA agent."""

import json
import tarfile
from unittest.mock import MagicMock
import pytest
from alembic import command
from alembic.config import Config
from app.agents.qa import build_qa_agent, evaluate_with_sandbox, generate_qa_tests
from app.sandbox.runner import SANDBOX_LABEL_KEY, SANDBOX_LABEL_VALUE, SandboxRunner, build_tar_archive
from app.state.db import create_sqlite_engine
from app.state.models import AgentOwner, LlmMode, Run, Task, TestCaseStatus
from app.state.repository import StateRepository


def _setup_repo(tmp_path) -> tuple[StateRepository, str, str]:
    db_file = str(tmp_path / "p8.db")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}")
    command.upgrade(cfg, "head")
    repo = StateRepository(create_sqlite_engine(db_file))
    repo.create_run(
        Run(
            id="run-p8",
            clerk_user_id="user_1",
            prompt="test",
            template_type="react",
            mode=LlmMode.AUTO,
        )
    )
    repo.create_task(
        Task(
            id="task-1",
            run_id="run-p8",
            owner=AgentOwner.FRONTEND,
            title="Build App",
            acceptance_criteria=["App builds cleanly"],
        )
    )
    return repo, "run-p8", "task-1"


def test_build_tar_archive_contains_relative_files():
    stream = build_tar_archive({"src/App.tsx": "export default () => null;"})
    with tarfile.open(fileobj=stream, mode="r") as tar:
        names = tar.getnames()
    assert names == ["src/App.tsx"]


def test_sandbox_hardening_options_and_blocked_install():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_container.wait.return_value = {"StatusCode": 0}
    mock_container.logs.return_value = b"build ok"
    mock_client.containers.create.return_value = mock_container

    runner = SandboxRunner(docker_client=mock_client, image="blinkbuild-sandbox:latest")
    outcomes = runner.run_sequence(
        run_id="run-p8",
        files={"package.json": "{}"},
        checks=[("install", ["npm", "ci"]), ("build", ["npm", "run", "build"])],
    )

    assert outcomes[0].check_name == "install"
    assert outcomes[0].status == TestCaseStatus.BLOCKED
    assert outcomes[1].check_name == "build"
    assert outcomes[1].status == TestCaseStatus.PASSED

    kwargs = mock_client.containers.create.call_args.kwargs
    assert kwargs["cap_drop"] == ["ALL"]
    assert kwargs["security_opt"] == ["no-new-privileges:true"]
    assert kwargs["privileged"] is False
    assert kwargs["read_only"] is True
    assert kwargs["network_mode"] == "none"
    assert kwargs["user"] == "pwuser"
    assert kwargs["labels"][SANDBOX_LABEL_KEY] == SANDBOX_LABEL_VALUE
    mock_container.put_archive.assert_called_once()
    mock_container.remove.assert_called_once_with(force=True)


def test_sandbox_timeout_kills_and_removes_container():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_container.wait.side_effect = TimeoutError("exceeded 120s")
    mock_client.containers.create.return_value = mock_container

    runner = SandboxRunner(docker_client=mock_client, timeout_seconds=1)
    outcome = runner.run_check(
        run_id="run-p8",
        check_name="build",
        command=["npm", "run", "build"],
        files={"package.json": "{}"},
    )
    assert outcome.status == TestCaseStatus.FAILED
    assert "TimeoutError" in outcome.evidence
    mock_container.kill.assert_called_once()
    mock_container.remove.assert_called_once_with(force=True)


def test_cleanup_stale_sandboxes_removes_leftovers():
    mock_client = MagicMock()
    c1, c2 = MagicMock(), MagicMock()
    mock_client.containers.list.return_value = [c1, c2]

    runner = SandboxRunner(docker_client=mock_client)
    removed = runner.cleanup_stale_sandboxes()
    assert removed == 2
    c1.remove.assert_called_once_with(force=True)
    c2.remove.assert_called_once_with(force=True)


def test_qa_agent_honest_pass_and_failure_defect_logging(tmp_path):
    repo, run_id, task_id = _setup_repo(tmp_path)
    qa_agent = build_qa_agent()
    assert qa_agent.role == "Quality Assurance Verification Engineer"

    qa_json = json.dumps(
        {
            "test_cases": [
                {"name": "App builds", "category": "happy_path", "requirement_ref": "AC-1"}
            ],
            "test_files": [
                {"path": "tests/app.test.ts", "content": "test('ok', () => {})", "purpose": "unit"}
            ],
        }
    )
    qa_out = generate_qa_tests(
        run_id=run_id,
        tasks=repo.list_tasks(run_id),
        contract=None,
        app_files={"src/App.tsx": "export default function App() {}"},
        call_llm=lambda _p: qa_json,
        repo=repo,
    )

    # 1. QA cannot overwrite app files
    with pytest.raises(ValueError, match="must not overwrite application file"):
        generate_qa_tests(
            run_id=run_id,
            tasks=repo.list_tasks(run_id),
            contract=None,
            app_files={"src/App.tsx": "x"},
            call_llm=lambda _p: json.dumps(
                {
                    "test_cases": [{"name": "t", "category": "happy_path"}],
                    "test_files": [{"path": "src/App.tsx", "content": "hacked", "purpose": "bad"}],
                }
            ),
        )

    # 2. Bad project fails build and logs Defect honestly; blocked install is never passed
    mock_client = MagicMock()
    bad_container = MagicMock()
    bad_container.wait.return_value = {"StatusCode": 1}
    bad_container.logs.return_value = b"SyntaxError: Unexpected token"
    mock_client.containers.create.return_value = bad_container

    runner = SandboxRunner(docker_client=mock_client)
    passed, outcomes, defects = evaluate_with_sandbox(
        run_id=run_id,
        primary_task_id=task_id,
        app_files={"src/App.tsx": "broken("},
        qa_output=qa_out,
        sandbox=runner,
        repo=repo,
        checks=[("install", ["npm", "ci"]), ("build", ["npm", "run", "build"])],
    )
    assert passed is False
    assert outcomes[0].status == TestCaseStatus.BLOCKED
    assert outcomes[1].status == TestCaseStatus.FAILED
    assert len(defects) == 1
    assert defects[0].owner is None
    assert len(repo.list_defects(run_id)) == 1
