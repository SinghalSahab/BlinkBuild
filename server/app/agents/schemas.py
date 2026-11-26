"""Structured input/output schemas and path validation for Frontend/Backend agents."""

from pathlib import PurePosixPath
from typing import Callable
from pydantic import BaseModel, Field, ValidationError, field_validator
from app.state.models import Contract, Task


class FileEntry(BaseModel):
    """Single generated file returned by a Frontend or Backend runtime agent."""

    path: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    purpose: str = Field(..., min_length=1)

    @field_validator("path")
    @classmethod
    def validate_relative_safe_path(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("File path cannot be empty")
        if cleaned.startswith("/") or cleaned.startswith("\\"):
            raise ValueError(f"File path must be relative, got: {cleaned}")
        if "\\" in cleaned:
            raise ValueError(f"File path must use forward slashes: {cleaned}")
        parts = PurePosixPath(cleaned).parts
        if ".." in parts:
            raise ValueError(f"Parent-folder traversal ('..') is forbidden: {cleaned}")
        normalized = PurePosixPath(*parts).as_posix()
        if normalized in ("", "."):
            raise ValueError(f"Invalid file path: {cleaned}")
        return normalized

    @field_validator("content")
    @classmethod
    def validate_non_empty_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("File content must be non-empty")
        return value


class AgentFileOutput(BaseModel):
    """Structured output required from Frontend and Backend agents."""

    files: list[FileEntry] = Field(..., min_length=1)
    shell_commands: list[str] = Field(default_factory=list)
    notes: str = Field(default="", max_length=1000)


class AgentTaskInput(BaseModel):
    """Minimal scoped context passed to a Frontend or Backend agent (FR-09)."""

    task: Task
    template_type: str = Field(..., pattern="^(react|node)$")
    contract: Contract | None = None
    existing_owned_files: dict[str, str] = Field(default_factory=dict)
    allowed_prefixes: list[str] = Field(default_factory=list)
    constraints: str


def enforce_ownership(output: AgentFileOutput, allowed_prefixes: list[str]) -> None:
    """Ensure every file path stays within the agent's allowed ownership prefixes."""
    if not allowed_prefixes:
        return
    normalized_prefixes = [p.strip("/") + "/" if not p.endswith("/") else p.strip("/") for p in allowed_prefixes]
    for entry in output.files:
        if not any(
            entry.path == prefix.rstrip("/") or entry.path.startswith(prefix)
            for prefix in normalized_prefixes
        ):
            raise ValueError(
                f"Path '{entry.path}' is outside allowed ownership prefixes: {allowed_prefixes}"
            )


def parse_agent_output_with_reask(
    raw_json: str,
    reask_fn: Callable[[str], str],
    allowed_prefixes: list[str] | None = None,
) -> AgentFileOutput:
    """Validate agent JSON output; on failure, re-ask once before raising."""
    last_error: Exception | None = None
    candidate = raw_json

    for attempt in range(2):
        try:
            parsed = AgentFileOutput.model_validate_json(candidate)
            if allowed_prefixes:
                enforce_ownership(parsed, allowed_prefixes)
            return parsed
        except (ValidationError, ValueError) as exc:
            last_error = exc
            if attempt == 0:
                candidate = reask_fn(
                    f"Your previous output failed validation: {exc}. "
                    "Return ONLY valid JSON matching AgentFileOutput."
                )

    raise ValueError(f"Agent output invalid after re-ask: {last_error}")
