"""Phase 5 tests: Backend agent, WebContainer constraints, validation/re-ask, and parseXml."""

import json
import subprocess
from pathlib import Path
import pytest
from app.agents.backend import build_backend_agent, run_backend_task
from app.agents.constraints import WEBCONTAINER_CONSTRAINTS
from app.agents.merge import MergeConflictError, merge_to_bolt_artifact
from app.agents.schemas import AgentFileOutput, AgentTaskInput, FileEntry, parse_agent_output_with_reask
from app.state.models import AgentOwner, Task


def test_build_backend_agent_with_crewai():
    agent = build_backend_agent()
    assert agent.role == "Backend Software Engineer"
    assert agent.allow_delegation is False


def test_path_validation_rejects_traversal_and_absolute():
    with pytest.raises(ValueError, match="Parent-folder traversal"):
        FileEntry(path="../secret.txt", content="x", purpose="bad")
    with pytest.raises(ValueError, match="relative"):
        FileEntry(path="/etc/passwd", content="x", purpose="bad")
    with pytest.raises(ValueError, match="non-empty"):
        FileEntry(path="server.js", content="   ", purpose="empty")


def test_reask_once_on_invalid_output():
    valid_json = json.dumps(
        {
            "files": [{"path": "index.js", "content": "console.log('ok');", "purpose": "entry"}],
            "shell_commands": ["npm install"],
            "notes": "done",
        }
    )
    calls = []

    def reask(msg: str) -> str:
        calls.append(msg)
        return valid_json

    out = parse_agent_output_with_reask("not-json", reask_fn=reask)
    assert len(calls) == 1
    assert out.files[0].path == "index.js"


def test_backend_task_merges_and_parses_in_client_parsexml():
    task = Task(
        id="task-be-1",
        run_id="run-1",
        owner=AgentOwner.BACKEND,
        title="Create Node health API",
        acceptance_criteria=["GET /health returns 200"],
    )
    task_input = AgentTaskInput(
        task=task,
        template_type="node",
        allowed_prefixes=["index.js", "package.json"],
        constraints=WEBCONTAINER_CONSTRAINTS,
    )

    payload = json.dumps(
        {
            "files": [
                {
                    "path": "index.js",
                    "content": "const http = require('http');\nhttp.createServer((req, res) => res.end('ok')).listen(3000);",
                    "purpose": "HTTP server",
                },
                {
                    "path": "package.json",
                    "content": '{"name": "api", "scripts": {"start": "node index.js"}}',
                    "purpose": "Node manifest",
                },
            ],
            "shell_commands": ["npm start"],
            "notes": "Created Node HTTP server",
        }
    )

    output = run_backend_task(task_input=task_input, call_llm=lambda _p: payload)
    artifact = merge_to_bolt_artifact(
        artifact_id="blinkbuild-run-1",
        title="Backend API",
        files=output.files,
        shell_commands=output.shell_commands,
    )

    # Verify with Node against the exact parseXml regexes from client/app/lib/steps.ts
    steps_ts = Path(__file__).resolve().parents[2] / "client" / "app" / "lib" / "steps.ts"
    assert steps_ts.exists()

    node_script = """
const fs = require('fs');
const artifact = process.argv[1];
const artifactMatch = artifact.match(/<boltArtifact[^>]*>([\\s\\S]*?)<\\/boltArtifact>/);
if (!artifactMatch) process.exit(2);
const actionRegex = /<boltAction[^>]*type="([^"]*)"(?:[^>]*filePath="([^"]*)")?[^>]*>([\\s\\S]*?)<\\/boltAction>/g;
const actions = [];
let m;
while ((m = actionRegex.exec(artifactMatch[1])) !== null) {
  actions.push({ type: m[1], filePath: m[2] || null });
}
console.log(JSON.stringify(actions));
"""
    proc = subprocess.run(
        ["node", "-e", node_script, artifact],
        capture_output=True,
        text=True,
        check=True,
    )
    parsed_actions = json.loads(proc.stdout)
    assert parsed_actions == [
        {"type": "file", "filePath": "index.js"},
        {"type": "file", "filePath": "package.json"},
        {"type": "shell", "filePath": None},
    ]


def test_merge_rejects_duplicate_paths():
    f1 = FileEntry(path="index.js", content="a", purpose="a")
    f2 = FileEntry(path="index.js", content="b", purpose="b")
    with pytest.raises(MergeConflictError):
        merge_to_bolt_artifact(artifact_id="x", title="x", files=[f1, f2])
