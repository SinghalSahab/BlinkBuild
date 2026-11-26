"""Merge agent file outputs into <boltArtifact> XML compatible with client parseXml()."""

from app.agents.schemas import FileEntry


class MergeConflictError(Exception):
    """Raised when two agents write the same file path (FR-11)."""


def merge_to_bolt_artifact(
    *,
    artifact_id: str,
    title: str,
    files: list[FileEntry],
    shell_commands: list[str] | None = None,
) -> str:
    """Merge validated file entries into a single <boltArtifact> string.

    Matches client/app/lib/steps.ts parseXml():
      <boltArtifact id="..." title="...">
        <boltAction type="file" filePath="...">...</boltAction>
        <boltAction type="shell">...</boltAction>
      </boltArtifact>
    """
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
