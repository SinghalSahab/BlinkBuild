"""Backend runtime agent definition and execution (PM.md Section 9.3)."""

import json
import uuid
from typing import Any, Callable
from crewai import Agent
from app.agents.schemas import (
    AgentFileOutput,
    AgentTaskInput,
    parse_agent_output_with_reask,
)
from app.state.models import AgentOwner, GeneratedFile
from app.state.repository import StateRepository

BACKEND_ROLE = "Backend Software Engineer"
BACKEND_GOAL = (
    "Implement server-side routes, business logic, and data handling strictly following "
    "the API contract, acceptance criteria, and WebContainer constraints."
)
BACKEND_BACKSTORY = (
    "You write clean, runnable Node.js/TypeScript server code. "
    "RULES YOU NEVER BREAK: "
    "(1) Never write UI code (React components, CSS, HTML pages). "
    "(2) Never edit Frontend-owned files. "
    "(3) Never use native binaries, Python packages, or tools WebContainers cannot run. "
    "(4) Never leave TODO placeholders instead of working code. "
    "(5) Return ONLY valid JSON matching AgentFileOutput."
)


def build_backend_agent(llm: Any = None) -> Agent:
    """Create the CrewAI Backend runtime agent."""
    kwargs: dict[str, Any] = {
        "role": BACKEND_ROLE,
        "goal": BACKEND_GOAL,
        "backstory": BACKEND_BACKSTORY,
        "allow_delegation": False,
        "verbose": False,
    }
    if llm is not None:
        kwargs["llm"] = llm
    return Agent(**kwargs)


def build_backend_prompt(task_input: AgentTaskInput) -> str:
    """Build minimal scoped prompt for the Backend agent (FR-09, FR-12)."""
    contract_json = (
        task_input.contract.model_dump_json(indent=2)
        if task_input.contract
        else "None (backend-only task)"
    )
    owned_files_json = json.dumps(task_input.existing_owned_files, indent=2)
    return (
        f"Task: {task_input.task.title}\n"
        f"Description: {task_input.task.description}\n"
        f"Acceptance Criteria: {json.dumps(task_input.task.acceptance_criteria)}\n"
        f"Template Type: {task_input.template_type}\n"
        f"Allowed Path Prefixes: {json.dumps(task_input.allowed_prefixes)}\n"
        f"API Contract:\n{contract_json}\n"
        f"Existing Owned Files:\n{owned_files_json}\n\n"
        f"{task_input.constraints}\n\n"
        "Respond with ONLY a JSON object having keys: "
        '"files" (list of {"path", "content", "purpose"}), '
        '"shell_commands" (list of strings), and "notes" (string).'
    )


def run_backend_task(
    *,
    task_input: AgentTaskInput,
    call_llm: Callable[[str], str],
    repo: StateRepository | None = None,
) -> AgentFileOutput:
    """Execute a backend task with Pydantic validation, 1 re-ask, and state persistence."""
    prompt = build_backend_prompt(task_input)
    raw = call_llm(prompt)

    def _reask(feedback: str) -> str:
        return call_llm(f"{prompt}\n\nVALIDATION FEEDBACK:\n{feedback}")

    output = parse_agent_output_with_reask(
        raw,
        reask_fn=_reask,
        allowed_prefixes=task_input.allowed_prefixes or None,
    )

    if repo:
        for entry in output.files:
            repo.save_generated_file(
                GeneratedFile(
                    id=f"file-{uuid.uuid4().hex[:12]}",
                    run_id=task_input.task.run_id,
                    task_id=task_input.task.id,
                    owner=AgentOwner.BACKEND,
                    path=entry.path,
                    content=entry.content,
                    purpose=entry.purpose,
                )
            )

    return output
