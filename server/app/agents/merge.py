"""Merge agent file outputs into <boltArtifact> XML and detect contract conflicts."""

import uuid
from app.agents.schemas import AgentFileOutput, FileEntry
from app.state.models import AgentOwner, Defect
from app.state.repository import StateRepository


class MergeConflictError(Exception):
    """Raised when two agents write the same file path (FR-11)."""


def merge_to_bolt_artifact(
    *,
    artifact_id: str,
    title: str,
    files: list[FileEntry],
    shell_commands: list[str] | None = None,
) -> str:
    """Merge validated file entries into a single <boltArtifact> string."""
    seen: set[str] = set()
    actions: list[str] = []

    for entry in files:
        if entry.path in seen:
            raise MergeConflictError(f"Duplicate file path in merge: {entry.path}")
        seen.add(entry.path)
        actions.append(
            f'<boltAction type="file" filePath="{entry.path}">\n{entry.content}\n</boltAction>'
        )

    for cmd in shell_commands or []:
        cleaned = cmd.strip()
        if cleaned:
            actions.append(f'<boltAction type="shell">\n{cleaned}\n</boltAction>')

    body = "\n".join(actions)
    return f'<boltArtifact id="{artifact_id}" title="{title}">\n{body}\n</boltArtifact>'


def merge_agent_outputs(
    *,
    run_id: str,
    title: str,
    outputs: list[tuple[AgentOwner, str, AgentFileOutput]],
    repo: StateRepository | None = None,
) -> str:
    """Merge multiple agent outputs, logging a contract Defect on cross-agent path conflict."""
    path_owners: dict[str, AgentOwner] = {}
    files_by_path: dict[str, FileEntry] = {}
    all_commands: list[str] = []

    for owner, task_id, output in outputs:
        for entry in output.files:
            if entry.path in path_owners and path_owners[entry.path] != owner:
                existing_owner = path_owners[entry.path]
                msg = (
                    f"Merge conflict on '{entry.path}': written by both "
                    f"{existing_owner.value} and {owner.value}"
                )
                if repo:
                    repo.log_defect(
                        Defect(
                            id=f"def-{uuid.uuid4().hex[:12]}",
                            run_id=run_id,
                            task_id=task_id,
                            failing_check="contract_merge",
                            evidence=msg,
                            owner=AgentOwner.MANAGER,
                            requirement_refs=["FR-11"],
                        )
                    )
                raise MergeConflictError(msg)
            path_owners[entry.path] = owner
            files_by_path[entry.path] = entry
        all_commands.extend(output.shell_commands)

    return merge_to_bolt_artifact(
        artifact_id=f"blinkbuild-{run_id}",
        title=title,
        files=list(files_by_path.values()),
        shell_commands=all_commands,
    )
