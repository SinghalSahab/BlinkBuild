"""Pydantic models for BlinkBuild shared project state (single source of truth)."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RunStatus(str, Enum):
    QUEUED = "queued"
    PLANNING = "planning"
    GENERATING = "generating"
    VALIDATING = "validating"
    FIXING = "fixing"
    SUCCEEDED = "succeeded"
    ESCALATED = "escalated"
    FAILED = "failed"
    CANCELLED = "cancelled"


TERMINAL_RUN_STATUSES = {
    RunStatus.SUCCEEDED,
    RunStatus.ESCALATED,
    RunStatus.FAILED,
    RunStatus.CANCELLED,
}

ALLOWED_RUN_TRANSITIONS: dict[RunStatus, set[RunStatus]] = {
    RunStatus.QUEUED: {RunStatus.PLANNING, RunStatus.FAILED, RunStatus.CANCELLED},
    RunStatus.PLANNING: {RunStatus.GENERATING, RunStatus.ESCALATED, RunStatus.FAILED, RunStatus.CANCELLED},
    RunStatus.GENERATING: {RunStatus.VALIDATING, RunStatus.ESCALATED, RunStatus.FAILED, RunStatus.CANCELLED},
    RunStatus.VALIDATING: {RunStatus.SUCCEEDED, RunStatus.FIXING, RunStatus.ESCALATED, RunStatus.FAILED, RunStatus.CANCELLED},
    RunStatus.FIXING: {RunStatus.VALIDATING, RunStatus.ESCALATED, RunStatus.FAILED, RunStatus.CANCELLED},
    RunStatus.SUCCEEDED: set(),
    RunStatus.ESCALATED: set(),
    RunStatus.FAILED: set(),
    RunStatus.CANCELLED: set(),
}


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    IMPLEMENTED = "implemented"
    VALIDATED = "validated"
    FAILED = "failed"
    FIX_APPLIED = "fix_applied"


class AgentOwner(str, Enum):
    MANAGER = "manager"
    FRONTEND = "frontend"
    BACKEND = "backend"
    QA = "qa"


class LlmMode(str, Enum):
    AUTO = "auto"
    FAST = "fast"
    LOCAL = "local"


class DefectStatus(str, Enum):
    OPEN = "open"
    FIXING = "fixing"
    RESOLVED = "resolved"
    ESCALATED = "escalated"


class TestCaseStatus(str, Enum):
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"
    BLOCKED = "blocked"


class Run(BaseModel):
    id: str = Field(..., min_length=1)
    clerk_user_id: str = Field(..., min_length=1)
    prompt: str = Field(..., min_length=1)
    template_type: str = Field(..., pattern="^(react|node)$")
    mode: LlmMode = LlmMode.AUTO
    status: RunStatus = RunStatus.QUEUED
    escalation_reason: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Plan(BaseModel):
    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    activated_agents: list[AgentOwner]
    summary: str = ""
    created_at: datetime = Field(default_factory=utc_now)


class Task(BaseModel):
    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    plan_id: str | None = None
    owner: AgentOwner
    title: str = Field(..., min_length=1)
    description: str = ""
    acceptance_criteria: list[str] = Field(default_factory=list)
    size_hint: str = Field(default="short", pattern="^(short|long)$")
    status: TaskStatus = TaskStatus.PENDING
    requirement_refs: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ContractRoute(BaseModel):
    path: str = Field(..., min_length=1)
    method: str = Field(..., min_length=1)
    request_shape: dict[str, Any] = Field(default_factory=dict)
    response_shape: dict[str, Any] = Field(default_factory=dict)


class Contract(BaseModel):
    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    routes: list[ContractRoute] = Field(default_factory=list)
    frontend_paths: list[str] = Field(default_factory=list)
    backend_paths: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


class GeneratedFile(BaseModel):
    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    task_id: str | None = None
    owner: AgentOwner
    path: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    purpose: str = ""
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class TestCase(BaseModel):
    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    task_id: str | None = None
    name: str = Field(..., min_length=1)
    category: str = Field(..., pattern="^(happy_path|negative_edge|security_auth|regression)$")
    requirement_ref: str = ""
    status: TestCaseStatus = TestCaseStatus.PENDING
    created_at: datetime = Field(default_factory=utc_now)


class TestResult(BaseModel):
    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    check_name: str = Field(..., min_length=1)
    status: TestCaseStatus
    duration_ms: int = Field(default=0, ge=0)
    evidence: str = ""
    created_at: datetime = Field(default_factory=utc_now)


class Defect(BaseModel):
    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    task_id: str = Field(..., min_length=1)
    failing_check: str = Field(..., min_length=1)
    evidence: str = Field(..., min_length=1)
    owner: AgentOwner | None = None
    status: DefectStatus = DefectStatus.OPEN
    requirement_refs: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AgentStatus(BaseModel):
    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    agent: AgentOwner
    state: str = Field(..., min_length=1)
    current_task_id: str | None = None
    message: str = ""
    updated_at: datetime = Field(default_factory=utc_now)


class RetryCounter(BaseModel):
    task_id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    count: int = Field(default=0, ge=0, le=3)
    max_retries: int = Field(default=3, ge=1, le=3)
    updated_at: datetime = Field(default_factory=utc_now)


class LlmUsage(BaseModel):
    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    agent: AgentOwner
    provider: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1)
    tokens_in: int | None = Field(default=None, ge=0)
    tokens_out: int | None = Field(default=None, ge=0)
    latency_ms: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=utc_now)


class AuditEntry(BaseModel):
    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    actor: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    requirement_refs: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
