"""The tool registry and the harness's own tools.

Two kinds of tool end up in here, and the model cannot tell them apart:
tools the harness implements itself, and tools discovered from MCP servers.
That is the point — the registry is the seam where both become callable.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .config import Config


@dataclass(frozen=True)
class Tool:
    """One callable capability, described well enough for a model to choose it."""

    name: str
    description: str
    parameters: dict[str, Any]
    run: Callable[[dict[str, Any]], str]
    source: str = "harness"

    def schema(self) -> dict[str, Any]:
        """The tool as the provider's wire format wants it."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


NO_ARGUMENTS: dict[str, Any] = {"type": "object", "properties": {}, "required": []}


class ToolRegistry:
    """Everything the model is allowed to call, by name."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Two tools are both named {tool.name!r}.")
        self._tools[tool.name] = tool

    def schemas(self) -> list[dict[str, Any]]:
        return [tool.schema() for tool in self._tools.values()]

    def names(self) -> list[str]:
        return list(self._tools)

    def describe(self) -> list[tuple[str, str]]:
        """(name, source) pairs, for showing the user what the harness loaded."""
        return [(tool.name, tool.source) for tool in self._tools.values()]

    def invoke(self, name: str, raw_arguments: str) -> str:
        """Run a tool and return its result as text for the model.

        Failures come back as text rather than exceptions on purpose: a tool
        that blows up should give the model something it can read and recover
        from, not tear down the conversation.
        """
        tool = self._tools.get(name)
        if tool is None:
            known = ", ".join(sorted(self._tools)) or "none"
            return f"Error: no tool named {name!r}. Available tools: {known}."

        try:
            arguments = json.loads(raw_arguments) if raw_arguments.strip() else {}
        except json.JSONDecodeError as exc:
            return f"Error: arguments for {name!r} were not valid JSON ({exc})."

        if not isinstance(arguments, dict):
            return f"Error: arguments for {name!r} must be a JSON object."

        try:
            return tool.run(arguments)
        except Exception as exc:  # noqa: BLE001 - the model gets to see and retry
            return f"Error: {name!r} failed: {type(exc).__name__}: {exc}"


MAX_FILE_BYTES = 120_000


def build_read_file_tool(config: Config) -> Tool:
    """Let the agent read the repo it is anchored to — and nothing else.

    Two boundaries, both enforced after resolving symlinks: the file must be
    inside the repo, and it must not be git-ignored. The second matters more
    than it looks — `.env` sits next to this harness and holds an API key, and
    "ignored by git" is exactly the line between committed source and local
    secrets, so it is the right rule rather than a blocklist of names.
    """

    root = _repo_root(config.code_dir)

    def run(arguments: dict[str, Any]) -> str:
        raw = arguments.get("path")
        if not isinstance(raw, str) or not raw.strip():
            return "Error: read_file needs a 'path' argument."
        return _read_file(root, raw.strip())

    return Tool(
        name="read_file",
        description=(
            "Read a text file from the repository. Paths may be relative to the "
            "repository root or to the anchored project directory. Use it to read "
            "context documents, source files, and configuration before answering "
            "questions about them."
        ),
        parameters={
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file, relative to the repository root.",
                }
            },
            "required": ["path"],
        },
        run=run,
    )


def _repo_root(code_dir: Path) -> Path:
    """The git root above the anchored project, or the project itself."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=code_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return Path(result.stdout.strip()).resolve()
    except (OSError, subprocess.SubprocessError):
        pass
    return code_dir.resolve()


def _read_file(root: Path, raw: str) -> str:
    candidate = Path(raw).expanduser()
    if candidate.is_absolute():
        target = candidate.resolve()
    else:
        # Accept paths written from either the repo root or the project dir,
        # since the repo's own docs use both.
        target = (root / candidate).resolve()
        if not target.exists():
            for child in root.iterdir():
                alternative = (child / candidate).resolve()
                if child.is_dir() and alternative.exists():
                    target = alternative
                    break

    if not _is_within(target, root):
        return f"Error: {raw!r} is outside the repository; refusing to read it."
    if _is_git_ignored(root, target):
        return (
            f"Error: {raw!r} is git-ignored (it may hold local secrets); "
            "refusing to read it."
        )
    if not target.is_file():
        return f"Error: no file at {raw!r}."

    size = target.stat().st_size
    text = target.read_text(encoding="utf-8", errors="replace")
    if size > MAX_FILE_BYTES:
        text = text[:MAX_FILE_BYTES] + f"\n\n[truncated at {MAX_FILE_BYTES} bytes]"
    return f"{target.relative_to(root)}:\n\n{text}"


def _is_within(target: Path, root: Path) -> bool:
    return target == root or root in target.parents


def _is_git_ignored(root: Path, target: Path) -> bool:
    if ".git" in target.parts:
        return True
    try:
        result = subprocess.run(
            ["git", "check-ignore", "-q", str(target)],
            cwd=root,
            capture_output=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return False  # git unavailable; the containment check still applies
    return result.returncode == 0


def build_repo_status_tool(config: Config) -> Tool:
    """A small, real tool, so the loop is proved against something honest."""

    def run(_arguments: dict[str, Any]) -> str:
        return _repo_status(config.code_dir)

    return Tool(
        name="repo_status",
        description=(
            "Show the current state of the working tree for the repository this "
            "agent is anchored to: uncommitted changes and the most recent commits. "
            "Use it before suggesting edits, to know what is already in progress."
        ),
        parameters=NO_ARGUMENTS,
        run=run,
    )


def _repo_status(code_dir: Path) -> str:
    def git(*args: str) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=code_dir,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "git failed")
        return result.stdout.strip()

    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    changes = git("status", "--short")
    log = git("log", "-5", "--oneline")

    return (
        f"branch: {branch}\n\n"
        f"uncommitted changes:\n{changes or '  (working tree clean)'}\n\n"
        f"recent commits:\n{log}"
    )
