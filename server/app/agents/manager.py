"""Manager runtime agent: planning, selective activation (FR-06), and defect routing (FR-08)."""

import json
import uuid
from typing import Any, Callable, Literal
from crewai import Agent
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from app.agents.schemas import strip_json_fences
from app.state.models import (
    AgentOwner,
    AuditEntry,
    Contract,
    ContractRoute,
    Defect,
    Plan,
    Task,
)
from app.state.repository import StateRepository

MANAGER_ROLE = "AI Software Engineering Manager"
MANAGER_GOAL = (
    "Analyze the user prompt, selectively activate only the required engineering agents "
    "(always including QA), define the API contract when both Frontend and Backend are active, "
    "and route QA defects to the responsible owner."
)
MANAGER_BACKSTORY = (
    "You are a disciplined engineering manager who plans and coordinates without writing code. "
    "RULES YOU NEVER BREAK: "
    "(1) Never write application code. "
    "(2) Never count retries or decide to continue past the retry cap. "
    "(3) Never activate an agent that the prompt does not need (QA is always active). "
    "(4) Always define an API contract when both Frontend and Backend are active. "
    "(5) Return ONLY valid JSON."
)


class PlannedTaskSpec(BaseModel):
    owner: Literal["frontend", "backend"]
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    acceptance_criteria: list[str] = Field(..., min_length=1)
    size_hint: Literal["short", "long"] = "short"

    @field_validator("acceptance_criteria", mode="before")
    @classmethod
    def coerce_acceptance_criteria(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [value] if value.strip() else []
        return value

    @field_validator("size_hint", mode="before")
    @classmethod
    def normalize_size_hint(cls, value: Any) -> str:
        if isinstance(value, str):
            v = value.strip().lower()
            if v in ("medium", "med", "large", "xl"):
                return "long"
            if v in ("small", "tiny", "xs"):
                return "short"
            return v
        return value


class ContractSpec(BaseModel):
    routes: list[ContractRoute] = Field(default_factory=list)
    frontend_paths: list[str] = Field(default_factory=list)
    backend_paths: list[str] = Field(default_factory=list)

    @field_validator("routes", mode="before")
    @classmethod
    def coerce_routes(cls, value: Any) -> Any:
        if isinstance(value, dict):
            return [
                {"path": str(k), "method": "GET", "request_shape": {}, "response_shape": {"target": str(v)}}
                for k, v in value.items()
            ]
        if isinstance(value, list):
            out = []
            for item in value:
                if isinstance(item, str):
                    out.append({"path": item, "method": "GET"})
                else:
                    out.append(item)
            return out
        return value

    @field_validator("frontend_paths", "backend_paths", mode="before")
    @classmethod
    def coerce_path_list(cls, value: Any) -> Any:
        if isinstance(value, dict):
            return [str(v).lstrip("/") for v in value.values()]
        if isinstance(value, str):
            return [value.lstrip("/")]
        if isinstance(value, list):
            return [str(v).lstrip("/") for v in value]
        return value


class ManagerPlanOutput(BaseModel):
    """Structured plan returned by the Manager agent (FR-05, FR-06, FR-07)."""

    activated_agents: list[AgentOwner] = Field(..., min_length=2)
    tasks: list[PlannedTaskSpec] = Field(..., min_length=1)
    contract: ContractSpec | None = None
    summary: str = Field(..., min_length=1)

    @model_validator(mode="before")
    @classmethod
    def drop_qa_from_dev_tasks(cls, data: Any) -> Any:
        if isinstance(data, dict) and isinstance(data.get("tasks"), list):
            filtered = [
                t for t in data["tasks"]
                if not (isinstance(t, dict) and str(t.get("owner", "")).strip().lower() == "qa")
            ]
            if filtered:
                data = {**data, "tasks": filtered}
        return data

    @model_validator(mode="after")
    def validate_activation_rules(self) -> "ManagerPlanOutput":
        if AgentOwner.QA not in self.activated_agents:
            raise ValueError("QA agent must always be activated (FR-06)")
        if AgentOwner.MANAGER in self.activated_agents:
            raise ValueError("Manager should not list itself in activated_agents")

        dev_agents = {a for a in self.activated_agents if a in (AgentOwner.FRONTEND, AgentOwner.BACKEND)}
        if not dev_agents:
            raise ValueError("At least one of frontend or backend must be activated")

        task_owners = {AgentOwner(t.owner) for t in self.tasks}
        if task_owners != dev_agents:
            raise ValueError(
                f"Task owners {sorted(o.value for o in task_owners)} must match "
                f"activated developer agents {sorted(a.value for a in dev_agents)}"
            )

        if AgentOwner.FRONTEND in dev_agents and AgentOwner.BACKEND in dev_agents:
            if self.contract is None:
                raise ValueError("API contract is required when both Frontend and Backend are active")

        return self


class DefectRoutingDecision(BaseModel):
    owner: Literal["frontend", "backend"]
    reason: str = Field(..., min_length=1)
    is_contract_issue: bool = False


class DefectRoutingEscalationError(Exception):
    """Raised when the Manager fails to return a valid defect owner after re-ask."""


def build_manager_agent(llm: Any = None) -> Agent:
    """Create the CrewAI Manager runtime agent."""
    kwargs: dict[str, Any] = {
        "role": MANAGER_ROLE,
        "goal": MANAGER_GOAL,
        "backstory": MANAGER_BACKSTORY,
        "allow_delegation": False,
        "verbose": False,
    }
    if llm is not None:
        kwargs["llm"] = llm
    return Agent(**kwargs)


def build_planning_prompt(*, prompt: str, template_type: str, constraints: str) -> str:
    return (
        f"User Prompt: {prompt}\n"
        f"Template Type: {template_type}\n"
        f"{constraints}\n\n"
        "Activation rules (FR-06): "
        "UI-only -> ['frontend', 'qa']; "
        "backend-only -> ['backend', 'qa']; "
        "full-stack -> ['frontend', 'backend', 'qa'] plus a non-null 'contract'.\n"
        'Return ONLY valid JSON matching ManagerPlanOutput: '
        '{"activated_agents": ["frontend", "qa"], '
        '"tasks": [{"owner": "frontend" | "backend", "title": "...", "description": "...", '
        '"acceptance_criteria": ["..."], "size_hint": "short" | "long"}], '
        '"contract": {"routes": [{"path": "/api/...", "method": "GET", "request_shape": {}, "response_shape": {}}], '
        '"frontend_paths": ["src/"], "backend_paths": ["server/"]} | null, "summary": "..."}.'
    )


def plan_run(
    *,
    run_id: str,
    prompt: str,
    template_type: str,
    constraints: str,
    call_llm: Callable[[str], str],
    repo: StateRepository | None = None,
) -> tuple[ManagerPlanOutput, list[Task], Contract | None]:
    """Generate and validate a Manager plan, persisting Plan, Tasks, Contract, and AuditEntry."""
    planning_prompt = build_planning_prompt(
        prompt=prompt, template_type=template_type, constraints=constraints
    )
    candidate = call_llm(planning_prompt)
    last_err: Exception | None = None
    parsed: ManagerPlanOutput | None = None

    for attempt in range(2):
        try:
            parsed = ManagerPlanOutput.model_validate_json(strip_json_fences(candidate))
            break
        except (ValidationError, ValueError) as exc:
            last_err = exc
            if attempt == 0:
                candidate = call_llm(
                    f"{planning_prompt}\n\nVALIDATION FEEDBACK:\n{exc}. Return ONLY valid JSON."
                )

    if parsed is None:
        raise ValueError(f"Manager plan invalid after re-ask: {last_err}")

    plan_id = f"plan-{uuid.uuid4().hex[:12]}"
    created_tasks = [
        Task(
            id=f"task-{spec.owner}-{uuid.uuid4().hex[:8]}",
            run_id=run_id,
            plan_id=plan_id,
            owner=AgentOwner(spec.owner),
            title=spec.title,
            description=spec.description,
            acceptance_criteria=spec.acceptance_criteria,
            size_hint=spec.size_hint,
        )
        for spec in parsed.tasks
    ]

    contract: Contract | None = None
    if parsed.contract is not None:
        contract = Contract(
            id=f"ctr-{uuid.uuid4().hex[:12]}",
            run_id=run_id,
            routes=parsed.contract.routes,
            frontend_paths=parsed.contract.frontend_paths,
            backend_paths=parsed.contract.backend_paths,
        )

    if repo:
        repo.save_plan(
            Plan(
                id=plan_id,
                run_id=run_id,
                activated_agents=parsed.activated_agents,
                summary=parsed.summary,
            )
        )
        if contract is not None:
            repo.save_contract(contract)
        for task in created_tasks:
            repo.create_task(task)
        repo.append_audit(
            AuditEntry(
                id=f"aud-{uuid.uuid4().hex[:12]}",
                run_id=run_id,
                category="PLAN_CREATED",
                actor="manager",
                message=(
                    f"Activated {[a.value for a in parsed.activated_agents]} "
                    f"with {len(created_tasks)} task(s)."
                ),
                requirement_refs=["FR-05", "FR-06"],
            )
        )

    return parsed, created_tasks, contract


def route_defect(
    *,
    defect: Defect,
    contract: Contract | None,
    call_llm: Callable[[str], str],
    repo: StateRepository | None = None,
) -> DefectRoutingDecision:
    """Route a QA defect to 'frontend' or 'backend', re-asking once before escalating (FR-08)."""
    contract_info = contract.model_dump_json(indent=2) if contract else "None"
    prompt = (
        f"Defect ID: {defect.id}\n"
        f"Failing Check: {defect.failing_check}\n"
        f"Evidence: {defect.evidence}\n"
        f"Contract & File Ownership:\n{contract_info}\n\n"
        "Return ONLY valid JSON: "
        '{"owner": "frontend" | "backend", "reason": "<one sentence>", '
        '"is_contract_issue": true | false}.'
    )

    candidate = call_llm(prompt)
    last_err: Exception | None = None

    for attempt in range(2):
        try:
            decision = DefectRoutingDecision.model_validate_json(strip_json_fences(candidate))
            if repo:
                repo.append_audit(
                    AuditEntry(
                        id=f"aud-{uuid.uuid4().hex[:12]}",
                        run_id=defect.run_id,
                        category="DEFECT_ROUTED",
                        actor="manager",
                        message=f"Defect {defect.id} routed to {decision.owner}: {decision.reason}",
                        requirement_refs=["FR-08"],
                    )
                )
            return decision
        except (ValidationError, ValueError) as exc:
            last_err = exc
            if attempt == 0:
                candidate = call_llm(
                    f"{prompt}\n\nINVALID OWNER OR JSON: {exc}. "
                    'Owner MUST be exactly "frontend" or "backend".'
                )

    raise DefectRoutingEscalationError(
        f"Manager failed to route defect {defect.id} after re-ask: {last_err}"
    )
