"""CrewAI Flow control loop with deterministic bounded retries (P9-T1..T6)."""

import uuid
from typing import Any, Callable
from crewai.flow.flow import Flow, listen, router, start
from crewai.flow.persistence import SQLiteFlowPersistence, persist
from pydantic import BaseModel, Field
from app.agents.backend import run_backend_task
from app.agents.constraints import WEBCONTAINER_CONSTRAINTS
from app.agents.frontend import run_frontend_task
from app.agents.manager import DefectRoutingEscalationError, plan_run, route_defect
from app.agents.merge import MergeConflictError, merge_agent_outputs
from app.agents.qa import evaluate_with_sandbox, generate_qa_tests
from app.agents.schemas import AgentFileOutput, AgentTaskInput
from app.api.events import RunEventBus
from app.llm.router import AllProvidersFailedError, RunLimitExceeded
from app.sandbox.runner import SandboxRunner
from app.state.models import (
    AgentOwner,
    AgentStatus,
    AuditEntry,
    Contract,
    DefectStatus,
    LlmMode,
    RunStatus,
    Task,
    TaskStatus,
)
from app.state.repository import StateRepository


class FlowRunState(BaseModel):
    """Persisted CrewAI Flow state for resume after interruption (P9-T4)."""

    id: str = Field(default_factory=lambda: f"flow-{uuid.uuid4().hex[:12]}")
    run_id: str = ""
    clerk_user_id: str = ""
    prompt: str = ""
    template_type: str = "react"
    mode: LlmMode = LlmMode.AUTO
    current_step: str = "understand"
    activated_agents: list[str] = Field(default_factory=list)
    task_ids: list[str] = Field(default_factory=list)
    primary_task_id: str = ""
    contract_id: str | None = None
    artifact_xml: str = ""
    qa_passed: bool = False
    cancelled: bool = False
    escalation_report: dict[str, Any] | None = None


class BlinkBuildOrchestrator:
    """Executes and persists the 7-step control loop with CrewAI Flow + SQLite."""

    def __init__(
        self,
        *,
        repo: StateRepository,
        sandbox: SandboxRunner,
        event_bus: RunEventBus,
        call_agent_llm: Callable[[AgentOwner, str, str], str],
        flow_db_path: str,
        checks: list[tuple[str, list[str]]] | None = None,
    ):
        self.repo = repo
        self.sandbox = sandbox
        self.event_bus = event_bus
        self.call_agent_llm = call_agent_llm
        self.flow_db_path = flow_db_path
        self.checks = checks
        self._cancelled_runs: set[str] = set()

    def cancel(self, run_id: str) -> None:
        self._cancelled_runs.add(run_id)
        run = self.repo.get_run(run_id)
        if run and run.status not in (
            RunStatus.SUCCEEDED,
            RunStatus.ESCALATED,
            RunStatus.FAILED,
            RunStatus.CANCELLED,
        ):
            self.repo.update_run_status(run_id, RunStatus.CANCELLED)
            self.repo.append_audit(
                AuditEntry(
                    id=f"aud-{uuid.uuid4().hex[:12]}",
                    run_id=run_id,
                    category="RUN_CANCELLED",
                    actor="user",
                    message="Run cancelled by user.",
                )
            )
            self.event_bus.publish(run_id=run_id, event_type="run_status", message="Run cancelled")
            self.sandbox.cleanup_stale_sandboxes()
            self.event_bus.close(run_id)

    def _build_escalation_report(self, run_id: str, reason: str, task_id: str) -> dict[str, Any]:
        run = self.repo.get_run(run_id)
        defects = self.repo.list_defects(run_id)
        retries = self.repo.get_retry_count(task_id)
        return {
            "run_id": run_id,
            "prompt": run.prompt if run else "",
            "reason": reason,
            "retries_attempted": retries,
            "defects": [
                {
                    "id": d.id,
                    "failing_check": d.failing_check,
                    "owner": d.owner.value if d.owner else "unassigned",
                    "evidence": d.evidence,
                }
                for d in defects
            ],
            "next_steps": [
                "Inspect the failing check evidence and defect list above.",
                "Adjust the prompt or manually patch the generated files in the Code tab.",
            ],
        }

    def run_flow(
        self,
        *,
        run_id: str,
        clerk_user_id: str,
        prompt: str,
        template_type: str,
        mode: LlmMode,
    ) -> FlowRunState:
        orchestrator = self
        from pathlib import Path
        Path(self.flow_db_path).parent.mkdir(parents=True, exist_ok=True)
        persistence = SQLiteFlowPersistence(self.flow_db_path)
        persistence.init_db()

        @persist(persistence=persistence)
        class _RunFlow(Flow[FlowRunState]):
            @start()
            def understand(self) -> None:
                self.state.run_id = run_id
                self.state.clerk_user_id = clerk_user_id
                self.state.prompt = prompt
                self.state.template_type = template_type
                self.state.mode = mode
                self.state.current_step = "plan"

                orchestrator.repo.update_run_status(run_id, RunStatus.PLANNING)
                orchestrator.event_bus.publish(
                    run_id=run_id, event_type="run_status", message="Planning run"
                )

            @listen(understand)
            def plan(self) -> None:
                if run_id in orchestrator._cancelled_runs:
                    self.state.cancelled = True
                    return

                orchestrator.event_bus.publish(
                    run_id=run_id, event_type="agent_started", message="Manager planning"
                )
                plan_out, tasks, contract = plan_run(
                    run_id=run_id,
                    prompt=self.state.prompt,
                    template_type=self.state.template_type,
                    constraints=WEBCONTAINER_CONSTRAINTS,
                    call_llm=lambda p: orchestrator.call_agent_llm(AgentOwner.MANAGER, p, "short"),
                    repo=orchestrator.repo,
                )
                self.state.activated_agents = [a.value for a in plan_out.activated_agents]
                self.state.task_ids = [t.id for t in tasks]
                self.state.primary_task_id = tasks[0].id
                self.state.contract_id = contract.id if contract else None
                self.state.current_step = "execute"

                orchestrator._latest_tasks = tasks
                orchestrator._latest_contract = contract

                orchestrator.event_bus.publish(
                    run_id=run_id,
                    event_type="plan_ready",
                    message=f"Plan ready: {', '.join(self.state.activated_agents)}",
                    data={"activated_agents": self.state.activated_agents},
                )

            @listen(plan)
            def execute(self) -> None:
                if self.state.cancelled or run_id in orchestrator._cancelled_runs:
                    self.state.cancelled = True
                    return

                orchestrator.repo.update_run_status(run_id, RunStatus.GENERATING)
                orchestrator.event_bus.publish(
                    run_id=run_id, event_type="run_status", message="Generating code"
                )

                tasks: list[Task] = getattr(orchestrator, "_latest_tasks", [])
                contract: Contract | None = getattr(orchestrator, "_latest_contract", None)
                outputs: list[tuple[AgentOwner, str, AgentFileOutput]] = []

                for task in tasks:
                    orchestrator.repo.update_task_status(task.id, TaskStatus.IN_PROGRESS)
                    orchestrator.repo.set_agent_status(
                        AgentStatus(
                            id=f"as-{run_id}-{task.owner.value}",
                            run_id=run_id,
                            agent=task.owner,
                            state="working",
                            current_task_id=task.id,
                            message=task.title,
                        )
                    )
                    orchestrator.event_bus.publish(
                        run_id=run_id,
                        event_type="agent_started",
                        message=f"{task.owner.value} started: {task.title}",
                    )
                    prefixes = (
                        contract.frontend_paths
                        if contract and task.owner == AgentOwner.FRONTEND
                        else (contract.backend_paths if contract and task.owner == AgentOwner.BACKEND else [])
                    )
                    task_in = AgentTaskInput(
                        task=task,
                        template_type=self.state.template_type,
                        contract=contract,
                        allowed_prefixes=prefixes,
                        constraints=WEBCONTAINER_CONSTRAINTS,
                    )
                    if task.owner == AgentOwner.FRONTEND:
                        out = run_frontend_task(
                            task_input=task_in,
                            call_llm=lambda p, sh=task.size_hint: orchestrator.call_agent_llm(
                                AgentOwner.FRONTEND, p, sh
                            ),
                            repo=orchestrator.repo,
                        )
                    else:
                        out = run_backend_task(
                            task_input=task_in,
                            call_llm=lambda p, sh=task.size_hint: orchestrator.call_agent_llm(
                                AgentOwner.BACKEND, p, sh
                            ),
                            repo=orchestrator.repo,
                        )
                    orchestrator.repo.update_task_status(task.id, TaskStatus.IMPLEMENTED)
                    orchestrator.event_bus.publish(
                        run_id=run_id,
                        event_type="agent_finished",
                        message=f"{task.owner.value} finished {len(out.files)} file(s)",
                    )
                    outputs.append((task.owner, task.id, out))

                orchestrator._latest_outputs = outputs
                artifact = merge_agent_outputs(
                    run_id=run_id,
                    title="BlinkBuild Generated Project",
                    outputs=outputs,
                    repo=orchestrator.repo,
                )
                self.state.artifact_xml = artifact
                self.state.current_step = "validate"
                orchestrator.event_bus.publish(
                    run_id=run_id,
                    event_type="files_ready",
                    message="Merged generated files",
                    data={"artifact": artifact},
                )

            @listen(execute)
            def validate(self) -> None:
                self._run_validation()

            @listen("retry_validation")
            def revalidate(self) -> None:
                self._run_validation()

            def _run_validation(self) -> None:
                if self.state.cancelled or run_id in orchestrator._cancelled_runs:
                    self.state.cancelled = True
                    return

                orchestrator.repo.update_run_status(run_id, RunStatus.VALIDATING)
                orchestrator.event_bus.publish(
                    run_id=run_id, event_type="qa_started", message="QA verification started"
                )

                tasks: list[Task] = getattr(orchestrator, "_latest_tasks", [])
                contract: Contract | None = getattr(orchestrator, "_latest_contract", None)
                outputs: list[tuple[AgentOwner, str, AgentFileOutput]] = getattr(
                    orchestrator, "_latest_outputs", []
                )
                app_files = {f.path: f.content for _, _, out in outputs for f in out.files}

                qa_out = generate_qa_tests(
                    run_id=run_id,
                    tasks=tasks,
                    contract=contract,
                    app_files=app_files,
                    call_llm=lambda p: orchestrator.call_agent_llm(AgentOwner.QA, p, "short"),
                    repo=orchestrator.repo,
                )

                passed, outcomes, defects = evaluate_with_sandbox(
                    run_id=run_id,
                    primary_task_id=self.state.primary_task_id,
                    app_files=app_files,
                    qa_output=qa_out,
                    sandbox=orchestrator.sandbox,
                    repo=orchestrator.repo,
                    checks=orchestrator.checks,
                )
                self.state.qa_passed = passed
                orchestrator._latest_defects = defects

                orchestrator.event_bus.publish(
                    run_id=run_id,
                    event_type="qa_result",
                    message=f"QA {'PASSED' if passed else 'FAILED'} ({len(outcomes)} check(s))",
                    data={"passed": passed, "defects": [d.id for d in defects]},
                )
                for d in defects:
                    orchestrator.event_bus.publish(
                        run_id=run_id,
                        event_type="defect_logged",
                        message=f"Defect {d.id} on {d.failing_check}",
                        data={"defect_id": d.id, "check": d.failing_check},
                    )

            @router(validate)
            def decide_initial(self) -> str:
                return self._decide()

            @router(revalidate)
            def decide_after_fix(self) -> str:
                return self._decide()

            def _decide(self) -> str:
                if self.state.cancelled or run_id in orchestrator._cancelled_runs:
                    return "done"

                if self.state.qa_passed:
                    for tid in self.state.task_ids:
                        orchestrator.repo.update_task_status(tid, TaskStatus.VALIDATED)
                    orchestrator.repo.update_run_status(run_id, RunStatus.SUCCEEDED)
                    orchestrator.repo.append_audit(
                        AuditEntry(
                            id=f"aud-{uuid.uuid4().hex[:12]}",
                            run_id=run_id,
                            category="RUN_SUCCEEDED",
                            actor="flow",
                            message="All QA checks passed.",
                            requirement_refs=["FR-19"],
                        )
                    )
                    orchestrator.event_bus.publish(
                        run_id=run_id, event_type="succeeded", message="Run succeeded"
                    )
                    return "done"

                # Deterministic retry cap check (FR-18, FR-20, FR-21)
                current_retries = orchestrator.repo.get_retry_count(self.state.primary_task_id)
                if current_retries >= 3:
                    reason = (
                        f"Task {self.state.primary_task_id} reached max retry cap (3/3)."
                    )
                    self.state.escalation_report = orchestrator._build_escalation_report(
                        run_id, reason, self.state.primary_task_id
                    )
                    orchestrator.repo.update_run_status(
                        run_id, RunStatus.ESCALATED, escalation_reason=reason
                    )
                    orchestrator.repo.append_audit(
                        AuditEntry(
                            id=f"aud-{uuid.uuid4().hex[:12]}",
                            run_id=run_id,
                            category="ESCALATED",
                            actor="flow",
                            message=reason,
                            requirement_refs=["FR-20"],
                        )
                    )
                    orchestrator.event_bus.publish(
                        run_id=run_id,
                        event_type="escalated",
                        message=reason,
                        data={"report": self.state.escalation_report},
                    )
                    return "done"

                # Increment counter in SQLite BEFORE attempting fix (P9-T3)
                counter = orchestrator.repo.increment_retry(run_id, self.state.primary_task_id)
                orchestrator.repo.update_run_status(run_id, RunStatus.FIXING)
                orchestrator.repo.append_audit(
                    AuditEntry(
                        id=f"aud-{uuid.uuid4().hex[:12]}",
                        run_id=run_id,
                        category="RETRY",
                        actor="flow",
                        message=f"Starting retry {counter.count}/3 for task {self.state.primary_task_id}",
                        requirement_refs=["FR-18", "FR-37"],
                    )
                )
                orchestrator.event_bus.publish(
                    run_id=run_id,
                    event_type="retry_started",
                    message=f"Starting retry {counter.count}/3",
                    data={"retry": counter.count},
                )

                defects: list = getattr(orchestrator, "_latest_defects", [])
                contract: Contract | None = getattr(orchestrator, "_latest_contract", None)
                tasks: list[Task] = getattr(orchestrator, "_latest_tasks", [])
                outputs: list[tuple[AgentOwner, str, AgentFileOutput]] = getattr(
                    orchestrator, "_latest_outputs", []
                )

                target_defect = defects[0]
                decision = route_defect(
                    defect=target_defect,
                    contract=contract,
                    call_llm=lambda p: orchestrator.call_agent_llm(AgentOwner.MANAGER, p, "short"),
                    repo=orchestrator.repo,
                )
                owner_role = AgentOwner(decision.owner)
                orchestrator.repo.update_defect(target_defect.id, DefectStatus.FIXING, owner=owner_role)

                matching_task = next((t for t in tasks if t.owner == owner_role), tasks[0])
                existing_owned = {
                    f.path: f.content
                    for out_owner, _, out in outputs
                    if out_owner == owner_role
                    for f in out.files
                }
                fix_in = AgentTaskInput(
                    task=matching_task,
                    template_type=self.state.template_type,
                    contract=contract,
                    existing_owned_files=existing_owned,
                    constraints=f"{WEBCONTAINER_CONSTRAINTS}\n\nFIX DEFECT: {target_defect.evidence}",
                )
                if owner_role == AgentOwner.FRONTEND:
                    fixed_out = run_frontend_task(
                        task_input=fix_in,
                        call_llm=lambda p: orchestrator.call_agent_llm(AgentOwner.FRONTEND, p, "short"),
                        repo=orchestrator.repo,
                    )
                else:
                    fixed_out = run_backend_task(
                        task_input=fix_in,
                        call_llm=lambda p: orchestrator.call_agent_llm(AgentOwner.BACKEND, p, "short"),
                        repo=orchestrator.repo,
                    )

                orchestrator.repo.update_task_status(matching_task.id, TaskStatus.FIX_APPLIED)
                # Replace owner's output and re-merge
                new_outputs = [
                    (o, tid, fixed_out if o == owner_role else out)
                    for o, tid, out in outputs
                ]
                orchestrator._latest_outputs = new_outputs
                self.state.artifact_xml = merge_agent_outputs(
                    run_id=run_id,
                    title="BlinkBuild Generated Project",
                    outputs=new_outputs,
                    repo=orchestrator.repo,
                )
                orchestrator.event_bus.publish(
                    run_id=run_id,
                    event_type="files_ready",
                    message="Updated files after fix",
                    data={"artifact": self.state.artifact_xml},
                )
                return "retry_validation"

            @listen("done")
            def finish(self) -> None:
                orchestrator.event_bus.close(run_id)

        flow = _RunFlow()
        try:
            flow.kickoff()
        except RunLimitExceeded as exc:
            reason = str(exc)
            self.repo.append_audit(
                AuditEntry(
                    id=f"aud-{uuid.uuid4().hex[:12]}",
                    run_id=run_id,
                    category="LIMIT_REACHED",
                    actor="llm_router",
                    message=reason,
                    requirement_refs=["FR-29", "FR-37"],
                )
            )
            self.event_bus.publish(run_id=run_id, event_type="limit_reached", message=reason)
            flow.state.escalation_report = self._build_escalation_report(
                run_id, reason, flow.state.primary_task_id or "unknown"
            )
            current = self.repo.get_run(run_id)
            if current and current.status not in (
                RunStatus.SUCCEEDED,
                RunStatus.ESCALATED,
                RunStatus.FAILED,
                RunStatus.CANCELLED,
            ):
                self.repo.update_run_status(run_id, RunStatus.ESCALATED, escalation_reason=reason)
            self.event_bus.publish(
                run_id=run_id,
                event_type="escalated",
                message=reason,
                data={"report": flow.state.escalation_report},
            )
            self.event_bus.close(run_id)
        except (AllProvidersFailedError, DefectRoutingEscalationError, MergeConflictError, ValueError) as exc:
            reason = str(exc)
            self.repo.append_audit(
                AuditEntry(
                    id=f"aud-{uuid.uuid4().hex[:12]}",
                    run_id=run_id,
                    category="RUN_ERROR",
                    actor="flow",
                    message=reason,
                )
            )
            flow.state.escalation_report = self._build_escalation_report(
                run_id, reason, flow.state.primary_task_id or "unknown"
            )
            current = self.repo.get_run(run_id)
            if current and current.status not in (
                RunStatus.SUCCEEDED,
                RunStatus.ESCALATED,
                RunStatus.FAILED,
                RunStatus.CANCELLED,
            ):
                target_status = (
                    RunStatus.FAILED
                    if isinstance(exc, AllProvidersFailedError)
                    else RunStatus.ESCALATED
                )
                self.repo.update_run_status(run_id, target_status, escalation_reason=reason)
            self.event_bus.publish(
                run_id=run_id,
                event_type="error" if isinstance(exc, AllProvidersFailedError) else "escalated",
                message=reason,
                data={"report": flow.state.escalation_report},
            )
            self.event_bus.close(run_id)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            current = self.repo.get_run(run_id)
            if current and current.status not in (
                RunStatus.SUCCEEDED,
                RunStatus.ESCALATED,
                RunStatus.FAILED,
                RunStatus.CANCELLED,
            ):
                self.repo.update_run_status(run_id, RunStatus.FAILED, escalation_reason=reason)
            self.event_bus.publish(run_id=run_id, event_type="error", message=reason)
            self.event_bus.close(run_id)

        return flow.state
