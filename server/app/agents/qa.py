"""QA runtime agent: test synthesis, sandbox execution, and honest result recording (P8-T9..11)."""

import json
import uuid
from typing import Any, Callable, Literal
from crewai import Agent
from pydantic import BaseModel, Field, ValidationError
from app.agents.schemas import FileEntry
from app.sandbox.runner import SandboxCheckOutcome, SandboxRunner
from app.state.models import (
    Contract,
    Defect,
    Task,
    TestCase,
    TestCaseStatus,
    TestResult,
)
from app.state.repository import StateRepository

QA_ROLE = "Quality Assurance Verification Engineer"
QA_GOAL = (
    "Synthesize real unit, integration, edge-case, security, and regression tests from "
    "acceptance criteria and verify generated code honestly in the sandbox."
)
QA_BACKSTORY = (
    "You are an objective QA engineer. "
    "RULES YOU NEVER BREAK: "
    "(1) Never edit application source code. "
    "(2) Never mock the business logic under test. "
    "(3) Never report a pass for a check that was skipped, blocked, or failed. "
    "(4) Only write test files under tests/ or *.test.ts / *.spec.ts. "
    "(5) Return ONLY valid JSON."
)


class SynthesizedTestCaseSpec(BaseModel):
    name: str = Field(..., min_length=1)
    category: Literal["happy_path", "negative_edge", "security_auth", "regression"]
    requirement_ref: str = ""


class QATestSynthesisOutput(BaseModel):
    test_cases: list[SynthesizedTestCaseSpec] = Field(..., min_length=1)
    test_files: list[FileEntry] = Field(default_factory=list)


def build_qa_agent(llm: Any = None) -> Agent:
    """Create the CrewAI QA runtime agent."""
    kwargs: dict[str, Any] = {
        "role": QA_ROLE,
        "goal": QA_GOAL,
        "backstory": QA_BACKSTORY,
        "allow_delegation": False,
        "verbose": False,
    }
    if llm is not None:
        kwargs["llm"] = llm
    return Agent(**kwargs)


def generate_qa_tests(
    *,
    run_id: str,
    tasks: list[Task],
    contract: Contract | None,
    app_files: dict[str, str],
    call_llm: Callable[[str], str],
    repo: StateRepository | None = None,
) -> QATestSynthesisOutput:
    """Ask QA agent to synthesize test cases and test files (never mutating app files)."""
    criteria = [
        {"task_id": t.id, "owner": t.owner.value, "acceptance_criteria": t.acceptance_criteria}
        for t in tasks
    ]
    prompt = (
        f"Tasks & Acceptance Criteria:\n{json.dumps(criteria, indent=2)}\n"
        f"Contract:\n{contract.model_dump_json(indent=2) if contract else 'None'}\n"
        f"Application File Paths: {json.dumps(sorted(app_files.keys()))}\n\n"
        "Generate test cases covering happy_path, negative_edge, security_auth (if auth), and regression. "
        "Do NOT mock the business logic under test. Do NOT include any application source files.\n"
        'Return ONLY JSON: {"test_cases": [{"name", "category", "requirement_ref"}], '
        '"test_files": [{"path", "content", "purpose"}]}.'
    )

    candidate = call_llm(prompt)
    last_err: Exception | None = None
    parsed: QATestSynthesisOutput | None = None

    for attempt in range(2):
        try:
            candidate_parsed = QATestSynthesisOutput.model_validate_json(candidate)
            for tf in candidate_parsed.test_files:
                if tf.path in app_files:
                    raise ValueError(f"QA must not overwrite application file: {tf.path}")
            parsed = candidate_parsed
            break
        except (ValidationError, ValueError) as exc:
            last_err = exc
            if attempt == 0:
                candidate = call_llm(f"{prompt}\n\nVALIDATION FEEDBACK:\n{exc}")

    if parsed is None:
        raise ValueError(f"QA test synthesis invalid after re-ask: {last_err}")

    if repo:
        for tc in parsed.test_cases:
            repo.save_test_case(
                TestCase(
                    id=f"tc-{uuid.uuid4().hex[:12]}",
                    run_id=run_id,
                    name=tc.name,
                    category=tc.category,
                    requirement_ref=tc.requirement_ref,
                )
            )

    return parsed


def evaluate_with_sandbox(
    *,
    run_id: str,
    primary_task_id: str,
    app_files: dict[str, str],
    qa_output: QATestSynthesisOutput,
    sandbox: SandboxRunner,
    repo: StateRepository | None = None,
    checks: list[tuple[str, list[str]]] | None = None,
    required_checks: set[str] | None = None,
) -> tuple[bool, list[SandboxCheckOutcome], list[Defect]]:
    """Run sandbox checks and honestly record TestResults and Defects (P8-T10, P8-T11)."""
    combined_files = dict(app_files)
    for tf in qa_output.test_files:
        combined_files[tf.path] = tf.content

    outcomes = sandbox.run_sequence(run_id=run_id, files=combined_files, checks=checks)
    defects: list[Defect] = []

    for outcome in outcomes:
        if repo:
            repo.record_test_result(
                TestResult(
                    id=f"tr-{uuid.uuid4().hex[:12]}",
                    run_id=run_id,
                    check_name=outcome.check_name,
                    status=outcome.status,
                    duration_ms=outcome.duration_ms,
                    evidence=outcome.evidence,
                )
            )

        if outcome.status == TestCaseStatus.FAILED:
            defect = Defect(
                id=f"def-{uuid.uuid4().hex[:12]}",
                run_id=run_id,
                task_id=primary_task_id,
                failing_check=outcome.check_name,
                evidence=outcome.evidence,
                owner=None,
                requirement_refs=["FR-15"],
            )
            defects.append(defect)
            if repo:
                repo.log_defect(defect)

    req = required_checks if required_checks is not None else {o.check_name for o in outcomes}
    all_passed = all(
        o.status == TestCaseStatus.PASSED
        for o in outcomes
        if o.check_name in req
    )
    return all_passed, outcomes, defects
