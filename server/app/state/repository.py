"""Repository functions for reading and writing validated shared project state."""

from sqlalchemy import select
from sqlalchemy.engine import Engine
from app.state.db import (
    AgentStatusRow,
    AuditEntryRow,
    ContractRow,
    DefectRow,
    GeneratedFileRow,
    LlmUsageRow,
    PlanRow,
    RetryCounterRow,
    RunRow,
    TaskRow,
    TestCaseRow,
    TestResultRow,
    create_session_factory,
    session_scope,
)
from app.state.models import (
    ALLOWED_RUN_TRANSITIONS,
    AgentOwner,
    AgentStatus,
    AuditEntry,
    Contract,
    Defect,
    DefectStatus,
    GeneratedFile,
    LlmUsage,
    Plan,
    RetryCounter,
    Run,
    RunStatus,
    Task,
    TaskStatus,
    TestCase,
    TestResult,
    utc_now,
)


class StateRepository:
    """Validated persistence layer backed by SQLite."""

    def __init__(self, engine: Engine):
        self._factory = create_session_factory(engine)

    # --- Runs ---
    def create_run(self, run: Run) -> Run:
        validated = Run.model_validate(run)
        with session_scope(self._factory) as session:
            session.add(RunRow(**validated.model_dump()))
        return validated

    def get_run(self, run_id: str) -> Run | None:
        with session_scope(self._factory) as session:
            row = session.get(RunRow, run_id)
            if not row:
                return None
            return Run.model_validate(row, from_attributes=True)

    def update_run_status(
        self,
        run_id: str,
        new_status: RunStatus,
        escalation_reason: str | None = None,
    ) -> Run:
        with session_scope(self._factory) as session:
            row = session.get(RunRow, run_id)
            if not row:
                raise KeyError(f"Run {run_id} not found")
            current = RunStatus(row.status)
            if new_status not in ALLOWED_RUN_TRANSITIONS[current]:
                raise ValueError(
                    f"Invalid run status transition: {current.value} -> {new_status.value}"
                )
            row.status = new_status.value
            if escalation_reason is not None:
                row.escalation_reason = escalation_reason
            row.updated_at = utc_now()
            session.flush()
            return Run.model_validate(row, from_attributes=True)

    # --- Plans & Contracts ---
    def save_plan(self, plan: Plan) -> Plan:
        validated = Plan.model_validate(plan)
        with session_scope(self._factory) as session:
            data = validated.model_dump()
            data["activated_agents"] = [a.value for a in validated.activated_agents]
            session.add(PlanRow(**data))
        return validated

    def save_contract(self, contract: Contract) -> Contract:
        validated = Contract.model_validate(contract)
        with session_scope(self._factory) as session:
            session.add(ContractRow(**validated.model_dump()))
        return validated

    # --- Tasks ---
    def create_task(self, task: Task) -> Task:
        validated = Task.model_validate(task)
        with session_scope(self._factory) as session:
            data = validated.model_dump()
            data["owner"] = validated.owner.value
            data["status"] = validated.status.value
            session.add(TaskRow(**data))
        return validated

    def update_task_status(self, task_id: str, status: TaskStatus) -> Task:
        validated_status = TaskStatus(status)
        with session_scope(self._factory) as session:
            row = session.get(TaskRow, task_id)
            if not row:
                raise KeyError(f"Task {task_id} not found")
            row.status = validated_status.value
            row.updated_at = utc_now()
            session.flush()
            return Task.model_validate(row, from_attributes=True)

    def list_tasks(self, run_id: str) -> list[Task]:
        with session_scope(self._factory) as session:
            rows = session.scalars(select(TaskRow).where(TaskRow.run_id == run_id)).all()
            return [Task.model_validate(r, from_attributes=True) for r in rows]

    # --- Generated Files ---
    def save_generated_file(self, file: GeneratedFile) -> GeneratedFile:
        validated = GeneratedFile.model_validate(file)
        with session_scope(self._factory) as session:
            data = validated.model_dump()
            data["owner"] = validated.owner.value
            session.merge(GeneratedFileRow(**data))
        return validated

    def list_generated_files(self, run_id: str) -> list[GeneratedFile]:
        with session_scope(self._factory) as session:
            rows = session.scalars(
                select(GeneratedFileRow).where(GeneratedFileRow.run_id == run_id)
            ).all()
            return [GeneratedFile.model_validate(r, from_attributes=True) for r in rows]

    # --- Test Cases & Results ---
    def save_test_case(self, tc: TestCase) -> TestCase:
        validated = TestCase.model_validate(tc)
        with session_scope(self._factory) as session:
            data = validated.model_dump()
            data["status"] = validated.status.value
            session.merge(TestCaseRow(**data))
        return validated

    def record_test_result(self, result: TestResult) -> TestResult:
        validated = TestResult.model_validate(result)
        with session_scope(self._factory) as session:
            data = validated.model_dump()
            data["status"] = validated.status.value
            session.add(TestResultRow(**data))
        return validated

    def list_test_results(self, run_id: str) -> list[TestResult]:
        with session_scope(self._factory) as session:
            rows = session.scalars(
                select(TestResultRow).where(TestResultRow.run_id == run_id)
            ).all()
            return [TestResult.model_validate(r, from_attributes=True) for r in rows]

    # --- Defects ---
    def log_defect(self, defect: Defect) -> Defect:
        validated = Defect.model_validate(defect)
        with session_scope(self._factory) as session:
            data = validated.model_dump()
            data["owner"] = validated.owner.value if validated.owner else None
            data["status"] = validated.status.value
            session.add(DefectRow(**data))
        return validated

    def update_defect(
        self,
        defect_id: str,
        status: DefectStatus,
        owner: AgentOwner | None = None,
    ) -> Defect:
        validated_status = DefectStatus(status)
        with session_scope(self._factory) as session:
            row = session.get(DefectRow, defect_id)
            if not row:
                raise KeyError(f"Defect {defect_id} not found")
            row.status = validated_status.value
            if owner is not None:
                row.owner = AgentOwner(owner).value
            row.updated_at = utc_now()
            session.flush()
            return Defect.model_validate(row, from_attributes=True)

    def list_defects(self, run_id: str) -> list[Defect]:
        with session_scope(self._factory) as session:
            rows = session.scalars(select(DefectRow).where(DefectRow.run_id == run_id)).all()
            return [Defect.model_validate(r, from_attributes=True) for r in rows]

    # --- Deterministic Retry Counter (max 3) ---
    def increment_retry(self, run_id: str, task_id: str) -> RetryCounter:
        """Increment retry counter in deterministic code; refuses to exceed max_retries (3)."""
        with session_scope(self._factory) as session:
            row = session.get(RetryCounterRow, task_id)
            if not row:
                row = RetryCounterRow(
                    task_id=task_id,
                    run_id=run_id,
                    count=1,
                    max_retries=3,
                    updated_at=utc_now(),
                )
                session.add(row)
            else:
                if row.count >= row.max_retries:
                    raise ValueError(
                        f"Retry cap ({row.max_retries}) already reached for task {task_id}"
                    )
                row.count += 1
                row.updated_at = utc_now()
            session.flush()
            return RetryCounter.model_validate(row, from_attributes=True)

    def get_retry_count(self, task_id: str) -> int:
        with session_scope(self._factory) as session:
            row = session.get(RetryCounterRow, task_id)
            return row.count if row else 0

    # --- Agent Status, LLM Usage, Audit ---
    def set_agent_status(self, agent_status: AgentStatus) -> AgentStatus:
        validated = AgentStatus.model_validate(agent_status)
        with session_scope(self._factory) as session:
            data = validated.model_dump()
            data["agent"] = validated.agent.value
            session.merge(AgentStatusRow(**data))
        return validated

    def record_llm_usage(self, usage: LlmUsage) -> LlmUsage:
        validated = LlmUsage.model_validate(usage)
        with session_scope(self._factory) as session:
            data = validated.model_dump()
            data["agent"] = validated.agent.value
            session.add(LlmUsageRow(**data))
        return validated

    def append_audit(self, entry: AuditEntry) -> AuditEntry:
        validated = AuditEntry.model_validate(entry)
        with session_scope(self._factory) as session:
            session.add(AuditEntryRow(**validated.model_dump()))
        return validated

    def list_audit_entries(self, run_id: str) -> list[AuditEntry]:
        with session_scope(self._factory) as session:
            rows = session.scalars(
                select(AuditEntryRow)
                .where(AuditEntryRow.run_id == run_id)
                .order_by(AuditEntryRow.created_at)
            ).all()
            return [AuditEntry.model_validate(r, from_attributes=True) for r in rows]
