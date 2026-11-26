"""Backend runtime agent definition and execution (PM.md Section 9.3)."""

from typing import Any, Callable
from crewai import Agent
from app.agents.runner import build_specialist_prompt, run_specialist_task
from app.agents.schemas import AgentFileOutput, AgentTaskInput
from app.state.models import AgentOwner
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
    return build_specialist_prompt(task_input, "backend")


def run_backend_task(
    *,
    task_input: AgentTaskInput,
    call_llm: Callable[[str], str],
    repo: StateRepository | None = None,
) -> AgentFileOutput:
    return run_specialist_task(
        owner=AgentOwner.BACKEND,
        task_input=task_input,
        call_llm=call_llm,
        repo=repo,
    )
