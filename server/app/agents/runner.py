"""Shared specialist prompt builder and validated execution helper (FR-09, FR-10)."""

import json
import uuid
from typing import Callable
from app.agents.schemas import (
    AgentFileOutput,
    AgentTaskInput,
    parse_agent_output_with_reask,
)
from app.state.models import AgentOwner, GeneratedFile
from app.state.repository import StateRepository


def build_specialist_prompt(task_input: AgentTaskInput, role_label: str) -> str:
    """Build minimal scoped context: only task, contract, owned files, and constraints."""
    contract_json = (
        task_input.contract.model_dump_json(indent=2)
        if task_input.contract
        else f"None ({role_label}-only task)"
    )
    owned_files_json = json.dumps(task_input.existing_owned_files, indent=2)
    return (
        f"Role: {role_label}\n"
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


def run_specialist_task(
    *,
    owner: AgentOwner,
    task_input: AgentTaskInput,
    call_llm: Callable[[str], str],
    repo: StateRepository | None = None,
) -> AgentFileOutput:
    """Run a specialist task with Pydantic validation, 1 re-ask, and DB persistence."""
    prompt = build_specialist_prompt(task_input, owner.value)
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
                    owner=owner,
                    path=entry.path,
                    content=entry.content,
                    purpose=entry.purpose,
                )
            )

    return output
