"""MCP support — the client half of what Module 5 built.

Module 5 built a server that advertises tools. This is the other side: read
`mcp.json`, start the servers it names, ask each one what it can do, and turn
the answers into tools the registry can hold alongside the harness's own.

The MCP SDK is async and the REPL is not, so the hub owns a single event loop
on a background thread and hands sync callers their results. That keeps the
stdio sessions alive between calls — a server started per tool call would pay
process startup every time and lose any state it holds.
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from .tools import Tool

STARTUP_TIMEOUT = 60.0
CALL_TIMEOUT = 120.0


class McpError(RuntimeError):
    """Raised when MCP configuration is unusable or a server will not start."""


class McpHub:
    """Owns every MCP connection the harness has, and the loop they run on."""

    def __init__(self, config_path: Path) -> None:
        self._config_path = config_path
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._stack: AsyncExitStack | None = None
        self._sessions: dict[str, ClientSession] = {}

    def start(self) -> list[Tool]:
        """Connect to every configured server and return their tools.

        A server that will not start is reported and skipped rather than
        stopping the harness: losing one capability should not cost you all of
        them, and the banner shows what was actually loaded.
        """
        servers = _read_config(self._config_path)
        if not servers:
            return []

        self._start_loop()

        tools: list[Tool] = []
        failures: list[str] = []
        for name, spec in servers.items():
            try:
                tools.extend(self._connect(name, spec))
            except Exception as exc:  # noqa: BLE001 - one bad server is survivable
                failures.append(f"{name}: {type(exc).__name__}: {exc}")

        self.failures = failures
        return tools

    def _start_loop(self) -> None:
        if self._loop is not None:
            return
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._loop.run_forever, name="mcp-hub", daemon=True
        )
        self._thread.start()
        self._stack = self._run(_make_stack(), timeout=STARTUP_TIMEOUT)

    def _connect(self, name: str, spec: dict[str, Any]) -> list[Tool]:
        session = self._run(
            self._open_session(spec), timeout=STARTUP_TIMEOUT
        )
        self._sessions[name] = session

        listed = self._run(session.list_tools(), timeout=STARTUP_TIMEOUT)
        return [self._as_tool(name, session, tool) for tool in listed.tools]

    async def _open_session(self, spec: dict[str, Any]) -> ClientSession:
        assert self._stack is not None
        params = StdioServerParameters(
            command=spec["command"],
            args=spec.get("args", []),
            env={**os.environ, **spec.get("env", {})},
            cwd=spec.get("cwd"),
        )
        read, write = await self._stack.enter_async_context(stdio_client(params))
        session = await self._stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        return session

    def _as_tool(self, server: str, session: ClientSession, spec: Any) -> Tool:
        def run(arguments: dict[str, Any]) -> str:
            result = self._run(
                session.call_tool(spec.name, arguments), timeout=CALL_TIMEOUT
            )
            return _render(result)

        return Tool(
            name=spec.name,
            description=spec.description or f"Tool {spec.name} from the {server} MCP server.",
            parameters=_input_schema(spec),
            run=run,
            source=f"mcp:{server}",
        )

    def _run(self, coro: Any, timeout: float) -> Any:
        assert self._loop is not None
        return asyncio.run_coroutine_threadsafe(coro, self._loop).result(timeout)

    def close(self) -> None:
        """Shut the servers down. Safe to call when nothing ever started."""
        if self._loop is None:
            return
        if self._stack is not None:
            try:
                self._run(self._stack.aclose(), timeout=STARTUP_TIMEOUT)
            except Exception:  # noqa: BLE001 - we are already on the way out
                pass
        self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread is not None:
            self._thread.join(timeout=5)
        self._loop = None


async def _make_stack() -> AsyncExitStack:
    return AsyncExitStack()


def _input_schema(spec: Any) -> dict[str, Any]:
    """The SDK renamed this field between major versions; accept either."""
    schema = getattr(spec, "input_schema", None) or getattr(spec, "inputSchema", None)
    return schema or {"type": "object", "properties": {}}


def _read_config(path: Path) -> dict[str, dict[str, Any]]:
    """Parse `mcp.json`, resolving `cwd` against the file's own location."""
    if not path.is_file():
        raise McpError(
            f"No MCP configuration at {path}. "
            "Create it, or the harness runs without MCP tools."
        )

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise McpError(f"{path} is not valid JSON: {exc}") from exc

    servers = raw.get("mcpServers")
    if not isinstance(servers, dict):
        raise McpError(f"{path} has no 'mcpServers' object.")

    resolved: dict[str, dict[str, Any]] = {}
    for name, spec in servers.items():
        if not isinstance(spec, dict) or "command" not in spec:
            raise McpError(f"MCP server {name!r} in {path} has no 'command'.")
        spec = dict(spec)
        if spec.get("cwd"):
            spec["cwd"] = str((path.parent / spec["cwd"]).resolve())
        resolved[name] = spec
    return resolved


def _render(result: Any) -> str:
    """Flatten an MCP tool result into text the model can read."""
    if getattr(result, "is_error", None) or getattr(result, "isError", False):
        return f"Error from MCP tool: {_content_text(result) or 'no detail given'}"
    return _content_text(result) or "(the tool returned no content)"


def _content_text(result: Any) -> str:
    parts: list[str] = []
    for block in getattr(result, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return "\n".join(parts).strip()
