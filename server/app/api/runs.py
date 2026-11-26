"""Authenticated /runs API endpoints and SSE event stream (PM.md Section 11.1)."""

import os
import uuid
from pathlib import Path
from typing import Literal
from alembic import command
from alembic.config import Config
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from app.agents.merge import merge_to_bolt_artifact
from app.agents.schemas import FileEntry
from app.api.auth import verify_internal_auth
from app.api.events import RunEventBus
from app.config.settings import get_settings
from app.flows.control_loop import BlinkBuildOrchestrator
from app.llm.config import LlmConfig
from app.llm.router import LlmRouter, RunBudgetTracker
from app.sandbox.runner import SandboxRunner
from app.state.db import create_sqlite_engine
from app.state.models import (
    AgentOwner,
    AuditEntry,
    Defect,
    LlmMode,
    LlmUsage,
    Run,
    RunStatus,
    Task,
    TestResult,
)
from app.state.repository import StateRepository

router = APIRouter(prefix="/runs", tags=["runs"])

_event_bus = RunEventBus()
_active_orchestrators: dict[str, BlinkBuildOrchestrator] = {}


def get_event_bus() -> RunEventBus:
    return _event_bus


def _get_repo() -> StateRepository:
    settings = get_settings()
    db_path = settings.sqlite_db_path
    engine = create_sqlite_engine(db_path)
    return StateRepository(engine)


def ensure_migrations_applied(db_path: str) -> None:
    alembic_ini = Path(__file__).resolve().parents[2] / "alembic.ini"
    cfg = Config(str(alembic_ini))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    command.upgrade(cfg, "head")


class CreateRunRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    template_type: Literal["react", "node"] = "react"
    mode: LlmMode = LlmMode.AUTO


class CreateRunResponse(BaseModel):
    run_id: str
    status: RunStatus


class RunSummaryResponse(BaseModel):
    run: Run
    tasks: list[Task]
    defects: list[Defect]
    test_results: list[TestResult]
    audit_entries: list[AuditEntry]
    retries: dict[str, int]
    llm_usage: list[LlmUsage]
    providers_used: list[str]
    total_tokens: int
    duration_ms: int
    artifact_xml: str | None = None


def _execute_run_in_background(
    *,
    run_id: str,
    clerk_user_id: str,
    prompt: str,
    template_type: str,
    mode: LlmMode,
) -> None:
    settings = get_settings()
    repo = _get_repo()
    llm_cfg = LlmConfig.from_env()
    llm_router = LlmRouter(llm_cfg, repo=repo)
    import time

    tracker = RunBudgetTracker(run_id=run_id, started_at=time.monotonic())
    flow_db = os.environ.get(
        "CREWAI_FLOW_DB_PATH",
        str(Path(settings.sqlite_db_path).parent / "crewai_flows.db"),
    )

    def _call_agent(owner: AgentOwner, agent_prompt: str, size_hint: str) -> str:
        res = llm_router.generate(
            agent=owner,
            prompt=agent_prompt,
            mode=mode,
            tracker=tracker,
            size_hint=size_hint,
        )
        if res.fallback_notice:
            _event_bus.publish(
                run_id=run_id,
                event_type="provider_fallback",
                message=res.fallback_notice,
                data={"provider": res.provider},
            )
        return res.text

    orchestrator = BlinkBuildOrchestrator(
        repo=repo,
        sandbox=SandboxRunner(),
        event_bus=_event_bus,
        call_agent_llm=_call_agent,
        flow_db_path=flow_db,
    )
    _active_orchestrators[run_id] = orchestrator
    try:
        orchestrator.run_flow(
            run_id=run_id,
            clerk_user_id=clerk_user_id,
            prompt=prompt,
            template_type=template_type,
            mode=mode,
        )
    except Exception as exc:
        _event_bus.publish(run_id=run_id, event_type="error", message=str(exc))
        _event_bus.close(run_id)
    finally:
        _active_orchestrators.pop(run_id, None)


@router.post("", response_model=CreateRunResponse, status_code=status.HTTP_201_CREATED)
def create_run(
    payload: CreateRunRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(verify_internal_auth),
) -> CreateRunResponse:
    repo = _get_repo()
    run_id = f"run-{uuid.uuid4().hex[:12]}"
    run = repo.create_run(
        Run(
            id=run_id,
            clerk_user_id=user_id,
            prompt=payload.prompt,
            template_type=payload.template_type,
            mode=payload.mode,
        )
    )
    _event_bus.publish(run_id=run_id, event_type="run_status", message="Run queued")
    background_tasks.add_task(
        _execute_run_in_background,
        run_id=run_id,
        clerk_user_id=user_id,
        prompt=payload.prompt,
        template_type=payload.template_type,
        mode=payload.mode,
    )
    return CreateRunResponse(run_id=run.id, status=run.status)


@router.get("/{run_id}", response_model=RunSummaryResponse)
def get_run_summary(
    run_id: str,
    _user_id: str = Depends(verify_internal_auth),
) -> RunSummaryResponse:
    repo = _get_repo()
    run = repo.get_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    tasks = repo.list_tasks(run_id)
    retries = {t.id: repo.get_retry_count(t.id) for t in tasks}
    gen_files = repo.list_generated_files(run_id)
    artifact_xml = None
    if gen_files:
        # Deduplicate latest by path
        latest_by_path: dict[str, FileEntry] = {}
        for gf in gen_files:
            latest_by_path[gf.path] = FileEntry(
                path=gf.path, content=gf.content, purpose=gf.purpose or "generated"
            )
        artifact_xml = merge_to_bolt_artifact(
            artifact_id=f"blinkbuild-{run_id}",
            title="BlinkBuild Generated Project",
            files=list(latest_by_path.values()),
        )

    usage = repo.list_llm_usage(run_id)
    providers_used = sorted({u.provider for u in usage})
    total_tokens = sum((u.tokens_in or 0) + (u.tokens_out or 0) for u in usage)
    duration_ms = max(
        0,
        int((run.updated_at - run.created_at).total_seconds() * 1000),
    )

    return RunSummaryResponse(
        run=run,
        tasks=tasks,
        defects=repo.list_defects(run_id),
        test_results=repo.list_test_results(run_id),
        audit_entries=repo.list_audit_entries(run_id),
        retries=retries,
        llm_usage=usage,
        providers_used=providers_used,
        total_tokens=total_tokens,
        duration_ms=duration_ms,
        artifact_xml=artifact_xml,
    )


@router.get("/{run_id}/events")
async def stream_run_events(
    run_id: str,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    _user_id: str = Depends(verify_internal_auth),
) -> StreamingResponse:
    after = int(last_event_id) if last_event_id and last_event_id.isdigit() else 0
    return StreamingResponse(
        _event_bus.subscribe(run_id, after_id=after),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/{run_id}/cancel")
def cancel_run(
    run_id: str,
    _user_id: str = Depends(verify_internal_auth),
) -> dict[str, str]:
    repo = _get_repo()
    run = repo.get_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    orch = _active_orchestrators.get(run_id)
    if orch:
        orch.cancel(run_id)
    elif run.status not in (
        RunStatus.SUCCEEDED,
        RunStatus.ESCALATED,
        RunStatus.FAILED,
        RunStatus.CANCELLED,
    ):
        repo.update_run_status(run_id, RunStatus.CANCELLED)
        SandboxRunner().cleanup_stale_sandboxes()

    return {"run_id": run_id, "status": "cancelled"}
