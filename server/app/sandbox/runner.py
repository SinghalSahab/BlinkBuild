"""Hardened sibling-container runner for untrusted generated code (P8-T1..T8, P8-T11).

ONLY this module may talk to Docker. Agents and agent tools have zero Docker access.
Container security options are fixed in code and never influenced by agent output.
"""

import io
import os
import tarfile
import time
from dataclasses import dataclass
from typing import Any
import docker
from docker.errors import DockerException
from app.state.models import TestCaseStatus

SANDBOX_LABEL_KEY = "blinkbuild.sandbox"
SANDBOX_LABEL_VALUE = "true"
MAX_EVIDENCE_CHARS = 4000

CHECK_SEQUENCE: list[tuple[str, list[str]]] = [
    ("install", ["sh", "-c", "npm ci --ignore-scripts || npm install --ignore-scripts"]),
    ("build", ["sh", "-c", "npm run build"]),
    ("lint", ["sh", "-c", "npm run lint"]),
    ("typecheck", ["sh", "-c", "npx tsc --noEmit"]),
    ("unit_tests", ["sh", "-c", "npx vitest run"]),
    ("browser_smoke", ["sh", "-c", "npx playwright test"]),
]


@dataclass(frozen=True)
class SandboxCheckOutcome:
    check_name: str
    status: TestCaseStatus
    duration_ms: int
    evidence: str


def build_tar_archive(files: dict[str, str]) -> io.BytesIO:
    """Create an in-memory tar archive of relative file paths (no host bind mounts)."""
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w") as tar:
        for rel_path, content in files.items():
            encoded = content.encode("utf-8")
            info = tarfile.TarInfo(name=rel_path.lstrip("/"))
            info.size = len(encoded)
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(encoded))
    stream.seek(0)
    return stream


def trim_evidence(raw: str | bytes, limit: int = MAX_EVIDENCE_CHARS) -> str:
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
    if len(text) <= limit:
        return text.strip()
    return f"...[trimmed]...\n{text[-limit:].strip()}"


class SandboxRunner:
    """Runs each QA check in its own short-lived, hardened sibling Docker container."""

    def __init__(
        self,
        docker_client: Any = None,
        *,
        image: str | None = None,
        timeout_seconds: int | None = None,
        mem_limit: str | None = None,
        nano_cpus: int | None = None,
        install_network_mode: str | None = None,
    ):
        self._client = docker_client
        self.image = image or os.environ.get("SANDBOX_IMAGE", "blinkbuild-sandbox:latest")
        self.timeout_seconds = timeout_seconds or int(os.environ.get("SANDBOX_TIMEOUT_SECONDS", "120"))
        self.mem_limit = mem_limit or os.environ.get("SANDBOX_MEM_LIMIT", "2g")
        self.nano_cpus = nano_cpus or int(os.environ.get("SANDBOX_NANO_CPUS", "1000000000"))
        self.install_network_mode = install_network_mode or os.environ.get("SANDBOX_INSTALL_NETWORK", "").strip() or None

    def _get_client(self) -> Any:
        if self._client is None:
            self._client = docker.from_env()
        return self._client

    def _hardened_create_kwargs(
        self,
        *,
        run_id: str,
        check_name: str,
        command: list[str],
        network_mode: str,
    ) -> dict[str, Any]:
        """Fixed hardened container template; never accepts options from agent output."""
        return {
            "image": self.image,
            "command": command,
            "working_dir": "/workspace",
            "user": "pwuser",
            "cap_drop": ["ALL"],
            "security_opt": ["no-new-privileges:true"],
            "privileged": False,
            "read_only": True,
            "tmpfs": {
                "/workspace": "rw,nosuid,size=512m",
                "/tmp": "rw,nosuid,noexec,size=128m",
            },
            "pids_limit": 128,
            "mem_limit": self.mem_limit,
            "nano_cpus": self.nano_cpus,
            "network_mode": network_mode,
            "init": True,
            "shm_size": "256m",
            "labels": {
                SANDBOX_LABEL_KEY: SANDBOX_LABEL_VALUE,
                "blinkbuild.run_id": run_id,
                "blinkbuild.check": check_name,
            },
            "detach": True,
        }

    def run_check(
        self,
        *,
        run_id: str,
        check_name: str,
        command: list[str],
        files: dict[str, str],
    ) -> SandboxCheckOutcome:
        """Run one check in an isolated short-lived container without exec."""
        if check_name == "install" and not self.install_network_mode:
            return SandboxCheckOutcome(
                check_name=check_name,
                status=TestCaseStatus.BLOCKED,
                duration_ms=0,
                evidence="Install phase blocked: no allow-listed package mirror/proxy configured (P8-T4 / H2).",
            )

        network_mode = self.install_network_mode if check_name == "install" else "none"
        assert network_mode is not None

        client = self._get_client()
        container = None
        t0 = time.monotonic()

        try:
            create_kwargs = self._hardened_create_kwargs(
                run_id=run_id,
                check_name=check_name,
                command=command,
                network_mode=network_mode,
            )
            container = client.containers.create(**create_kwargs)
            archive = build_tar_archive(files)
            container.put_archive("/workspace", archive)
            container.start()

            wait_result = container.wait(timeout=self.timeout_seconds)
            exit_code = int(wait_result.get("StatusCode", 1))
            logs = trim_evidence(container.logs(stdout=True, stderr=True))
            duration_ms = max(0, int((time.monotonic() - t0) * 1000))

            return SandboxCheckOutcome(
                check_name=check_name,
                status=TestCaseStatus.PASSED if exit_code == 0 else TestCaseStatus.FAILED,
                duration_ms=duration_ms,
                evidence=logs or f"Exited with code {exit_code}",
            )
        except Exception as exc:
            duration_ms = max(0, int((time.monotonic() - t0) * 1000))
            if container is not None:
                try:
                    container.kill()
                except Exception:
                    pass
            return SandboxCheckOutcome(
                check_name=check_name,
                status=TestCaseStatus.FAILED,
                duration_ms=duration_ms,
                evidence=f"Sandbox check aborted ({type(exc).__name__}): {exc}",
            )
        finally:
            if container is not None:
                try:
                    container.remove(force=True)
                except Exception:
                    pass

    def run_sequence(
        self,
        *,
        run_id: str,
        files: dict[str, str],
        checks: list[tuple[str, list[str]]] | None = None,
    ) -> list[SandboxCheckOutcome]:
        """Run the ordered QA check sequence."""
        outcomes: list[SandboxCheckOutcome] = []
        for check_name, cmd in (checks or CHECK_SEQUENCE):
            outcomes.append(
                self.run_check(
                    run_id=run_id,
                    check_name=check_name,
                    command=cmd,
                    files=files,
                )
            )
        return outcomes

    def cleanup_stale_sandboxes(self) -> int:
        """Remove any leftover sandbox containers on server startup (P8-T7)."""
        removed = 0
        try:
            client = self._get_client()
            containers = client.containers.list(
                all=True,
                filters={"label": f"{SANDBOX_LABEL_KEY}={SANDBOX_LABEL_VALUE}"},
            )
            for c in containers:
                try:
                    c.remove(force=True)
                    removed += 1
                except DockerException:
                    pass
        except Exception:
            pass
        return removed
