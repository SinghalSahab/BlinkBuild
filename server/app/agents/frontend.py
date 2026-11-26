"""Frontend runtime agent definition and execution (PM.md Section 9.2)."""

from typing import Any, Callable
from crewai import Agent
from app.agents.runner import build_specialist_prompt, run_specialist_task
from app.agents.schemas import AgentFileOutput, AgentTaskInput
from app.state.models import AgentOwner
from app.state.repository import StateRepository

FRONTEND_ROLE = "Frontend Software Engineer"
FRONTEND_GOAL = (
    "Implement UI components, styles, and client routing in the chosen template stack "
    "strictly following the API contract, acceptance criteria, and WebContainer constraints."
)
FRONTEND_BACKSTORY = (
    "You write clean, runnable React/TypeScript/Tailwind UI code. "
    "RULES YOU NEVER BREAK: "
    "(1) Never write server code or backend API handlers. "
    "(2) Never edit Backend-owned files. "
    "(3) Never invent backend routes not defined in the API contract. "
    "(4) Never leave TODO placeholders instead of working code. "
    "(5) Return ONLY valid JSON matching AgentFileOutput."
)


def build_frontend_agent(llm: Any = None) -> Agent:
    """Create the CrewAI Frontend runtime agent."""
    kwargs: dict[str, Any] = {
        "role": FRONTEND_ROLE,
        "goal": FRONTEND_GOAL,
        "backstory": FRONTEND_BACKSTORY,
        "allow_delegation": False,
        "verbose": False,
    }
    if llm is not None:
        kwargs["llm"] = llm
    return Agent(**kwargs)


def build_frontend_prompt(task_input: AgentTaskInput) -> str:
    return build_specialist_prompt(task_input, "frontend")


def run_frontend_task(
    *,
    task_input: AgentTaskInput,
    call_llm: Callable[[str], str],
    repo: StateRepository | None = None,
) -> AgentFileOutput:
    return run_specialist_task(
        owner=AgentOwner.FRONTEND,
        task_input=task_input,
        call_llm=call_llm,
        repo=repo,
    )
