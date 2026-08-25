"""Subprocess wrapper around the `knowledge-graph` CLI.

Every tool in this server goes through here. The wrapper owns three concerns the
tools should not repeat: locating the backend, running it without hanging, and
turning every possible failure into a structured result the model can read.

Nothing in this module raises for an expected failure. Callers get either the
decoded payload or a dict with an `error` key — see DESIGN.md for the taxonomy.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

DEFAULT_TIMEOUT_SECONDS = 30.0

# The CLI is invoked through `uv run` so it picks up the knowledge-graph
# project's own virtualenv rather than whatever Python is on PATH here.
CLI_COMMAND = ("uv", "run", "knowledge-graph")

MAX_CAPTURED_OUTPUT = 2000


def service_error(detail: str, **extra: Any) -> dict[str, Any]:
    """A failure of the backend itself, not of the request."""
    return {"error": "service_error", "detail": detail, **extra}


def validation_error(field: str, detail: str) -> dict[str, Any]:
    """A request the wrapper refuses before spawning anything."""
    return {"error": "validation_error", "field": field, "detail": detail}


def _truncate(text: str) -> str:
    text = text.strip()
    if len(text) <= MAX_CAPTURED_OUTPUT:
        return text
    return text[:MAX_CAPTURED_OUTPUT] + "... (truncated)"


def project_dir() -> Path | None:
    """The knowledge-graph checkout the CLI runs in, or None if unusable."""
    raw = os.environ.get("KG_PROJECT_DIR", "").strip()
    if not raw:
        return None
    path = Path(raw).expanduser()
    return path if path.is_dir() else None


async def run_cli(
    args: list[str], *, timeout: float = DEFAULT_TIMEOUT_SECONDS
) -> tuple[int, str, str] | dict[str, Any]:
    """Run the CLI with `args`. Returns (returncode, stdout, stderr) or a service error."""
    cwd = project_dir()
    if cwd is None:
        return service_error(
            "KG_PROJECT_DIR is not set to an existing directory. Point it at the "
            "knowledge-graph checkout, e.g. "
            "KG_PROJECT_DIR=/path/to/examples/knowledge-graph.",
            kg_project_dir=os.environ.get("KG_PROJECT_DIR") or None,
        )

    try:
        process = await asyncio.create_subprocess_exec(
            *CLI_COMMAND,
            *args,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return service_error(
            f"`{CLI_COMMAND[0]}` is not on PATH, so the knowledge-graph CLI cannot "
            "be started. Install uv, or fix the PATH the MCP server inherits."
        )
    except OSError as exc:  # permissions, exec format, ...
        return service_error(f"could not start the knowledge-graph CLI: {exc}")

    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except TimeoutError:
        process.kill()
        await process.wait()
        return service_error(
            f"the knowledge-graph CLI did not finish within {timeout:.0f}s "
            f"(command: {' '.join(args)})"
        )

    return (
        process.returncode or 0,
        stdout.decode("utf-8", errors="replace"),
        stderr.decode("utf-8", errors="replace"),
    )


async def run_json(args: list[str]) -> Any:
    """Run a CLI command that speaks JSON and decode it.

    Exit code 1 with a JSON body on stdout is the CLI's way of reporting a
    domain-level miss (`{"error": "not_found", ...}`); that is passed straight
    through, because it is an answer, not a malfunction.
    """
    result = await run_cli([*args, "--format", "json"])
    if isinstance(result, dict):
        return result

    returncode, stdout, stderr = result

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        if returncode != 0:
            return service_error(
                f"the knowledge-graph CLI exited {returncode}",
                command=" ".join(args),
                stderr=_truncate(stderr) or None,
            )
        return {
            "error": "malformed_output",
            "detail": "the knowledge-graph CLI returned output that is not valid JSON",
            "command": " ".join(args),
            "stdout": _truncate(stdout),
        }

    return payload


async def run_validate() -> dict[str, Any]:
    """`validate` is the odd one out: no --format flag, human text, exit code as the verdict."""
    result = await run_cli(["validate"])
    if isinstance(result, dict):
        return result

    returncode, stdout, stderr = result
    if returncode == 0:
        return {"valid": True, "issues": []}

    issues = [line.strip() for line in stdout.splitlines() if line.strip()]
    if not issues:
        detail = _truncate(stderr)
        if detail:
            return service_error(
                f"the knowledge-graph CLI exited {returncode} without reporting issues",
                stderr=detail,
            )
        issues = [f"the knowledge-graph CLI exited {returncode} without detail"]

    return {"valid": False, "issues": issues}
