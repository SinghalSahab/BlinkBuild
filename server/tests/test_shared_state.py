"""Phase 3 tests: Alembic migrations, Pydantic validation, SQLite FK/concurrency, persistence."""

import pytest
from alembic import command
from alembic.config import Config
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from app.state.db import create_sqlite_engine
from app.state.models import (
    AgentOwner,
    AuditEntry,
    Defect,
    DefectStatus,
    LlmMode,
    LlmUsage,
    Run,
    RunStatus,
    Task,
    TaskStatus,
    TestCaseStatus,
    TestResult,
)
from app.state.repository import StateRepository


def _run_migrations(db_path: str) -> None:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    command.upgrade(cfg, "head")


def test_migrations_and_full_state_lifecycle(tmp_path):
    db_file = str(tmp_path / "state.db")
    _run_migrations(db_file)

    engine = create_sqlite_engine(db_file)
    repo = StateRepository(engine)

    # Verify PRAGMA foreign_keys is ON
    with engine.connect() as conn:
        fk_enabled = conn.execute(text("PRAGMA foreign_keys")).scalar_one()
        assert fk_enabled == 1

    # 1. Create run
    run = repo.create_run(
        Run(
            id="run-1",
            clerk_user_id="user_123",
            prompt="Build a todo app",
            template_type="react",
            mode=LlmMode.AUTO,
        )
    )
    assert run.status == RunStatus.QUEUED

    # 2. Valid status transitions
    repo.update_run_status("run-1", RunStatus.PLANNING)
    repo.update_run_status("run-1", RunStatus.GENERATING)
    repo.update_run_status("run-1", RunStatus.VALIDATING)

    # 3. Invalid transition rejected
    with pytest.raises(ValueError, match="Invalid run status transition"):
        repo.update_run_status("run-1", RunStatus.QUEUED)

    # 4. Task, test result, defect, retry cap, LLM usage, audit
    task = repo.create_task(
        Task(
            id="task-fe-1",
            run_id="run-1",
            owner=AgentOwner.FRONTEND,
            title="Build Todo UI",
            acceptance_criteria=["AC-1: Renders todo list"],
            requirement_refs=["FR-09"],
        )
    )
    assert task.status == TaskStatus.PENDING

    repo.record_test_result(
        TestResult(
            id="tr-1",
            run_id="run-1",
            check_name="build",
            status=TestCaseStatus.FAILED,
            duration_ms=420,
            evidence="SyntaxError in App.tsx",
        )
    )

    defect = repo.log_defect(
        Defect(
            id="def-1",
            run_id="run-1",
            task_id="task-fe-1",
            failing_check="build",
            evidence="SyntaxError in App.tsx",
            requirement_refs=["FR-15"],
        )
    )
    assert defect.status == DefectStatus.OPEN

    repo.update_defect("def-1", DefectStatus.FIXING, owner=AgentOwner.FRONTEND)
    repo.update_task_status("task-fe-1", TaskStatus.FIX_APPLIED)

    # Retry cap enforced at 3
    assert repo.increment_retry("run-1", "task-fe-1").count == 1
    assert repo.increment_retry("run-1", "task-fe-1").count == 2
    assert repo.increment_retry("run-1", "task-fe-1").count == 3
    with pytest.raises(ValueError, match="Retry cap"):
        repo.increment_retry("run-1", "task-fe-1")

    repo.record_llm_usage(
        LlmUsage(
            id="usage-1",
            run_id="run-1",
            agent=AgentOwner.MANAGER,
            provider="groq",
            model="test-model",
            tokens_in=100,
            tokens_out=50,
            latency_ms=250,
        )
    )
    repo.append_audit(
        AuditEntry(
            id="aud-1",
            run_id="run-1",
            category="RETRY",
            actor="flow",
            message="Retry 3/3 reached",
            requirement_refs=["FR-18"],
        )
    )

    # 5. Dispose engine and re-open to verify file persistence
    engine.dispose()
    engine2 = create_sqlite_engine(db_file)
    repo2 = StateRepository(engine2)
    loaded_run = repo2.get_run("run-1")
    assert loaded_run is not None
    assert loaded_run.status == RunStatus.VALIDATING
    assert len(repo2.list_defects("run-1")) == 1
    assert repo2.get_retry_count("task-fe-1") == 3
    assert len(repo2.list_audit_entries("run-1")) == 1
    engine2.dispose()


def test_rejects_invalid_pydantic_write_and_fk_violation(tmp_path):
    db_file = str(tmp_path / "invalid.db")
    _run_migrations(db_file)
    engine = create_sqlite_engine(db_file)
    repo = StateRepository(engine)

    with pytest.raises(ValidationError):
        Run(
            id="run-bad",
            clerk_user_id="user_1",
            prompt="test",
            template_type="invalid-stack",  # type: ignore[arg-type]
        )

    # Foreign key violation: task referencing nonexistent run_id
    with pytest.raises(IntegrityError):
        repo.create_task(
            Task(
                id="task-orphan",
                run_id="nonexistent-run",
                owner=AgentOwner.BACKEND,
                title="Orphan task",
            )
        )
    engine.dispose()
