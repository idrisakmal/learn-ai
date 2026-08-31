"""CLI entry point — the REPL you talk to the harness through."""

from __future__ import annotations

import json
import sys
from dataclasses import replace

from .config import Config, ConfigError
from .conversation import Conversation, build_system_prompt
from .mcp_client import McpError, McpHub
from .provider import Provider, ProviderError
from .skills import SkillCatalog, build_run_skill_script_tool, build_skill_tools
from .tools import ToolRegistry, build_read_file_tool, build_repo_status_tool

BANNER = """\
PAIR Agent — anchored to {code_dir}
model: {model}
tools: {tools}
skills: {skills}

/messages   dump the raw messages array
/tools      list every tool the model can call
/help       show this
/quit       leave
"""


def main() -> int:
    try:
        config = Config.load()
    except ConfigError as exc:
        print(f"Cannot start: {exc}", file=sys.stderr)
        return 1

    provider = Provider(config)

    catalog = SkillCatalog.scan(config.skills_dir)

    tools = ToolRegistry()
    tools.register(build_repo_status_tool(config))
    tools.register(build_read_file_tool(config))
    tools.register(build_run_skill_script_tool(catalog, config))
    for tool in build_skill_tools(catalog):
        tools.register(tool)

    hub = McpHub(config.root / "mcp.json")
    try:
        for tool in hub.start():
            _register_without_collision(tools, tool)
    except McpError as exc:
        print(f"[mcp] {exc}\n", file=sys.stderr)
    for failure in getattr(hub, "failures", []):
        print(f"[mcp] server failed to start — {failure}\n", file=sys.stderr)

    conversation = Conversation(
        provider,
        build_system_prompt(config, catalog),
        tools=tools,
        on_tool_call=_announce_tool_call,
    )

    banner = BANNER.format(
        code_dir=config.code_dir,
        model=config.model,
        tools=", ".join(tools.names()) or "none",
        skills=", ".join(catalog.names()) or "none",
    )
    print(banner)

    try:
        return _repl(banner, config, conversation, tools)
    finally:
        hub.close()


def _repl(banner, config, conversation, tools) -> int:
    while True:
        try:
            user_input = input("you > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0

        if not user_input:
            continue
        if user_input in ("/quit", "/exit"):
            return 0
        if user_input == "/help":
            print(banner)
            continue
        if user_input == "/tools":
            for name, source in conversation_tools(tools):
                print(f"  {name:<28} [{source}]")
            continue
        if user_input == "/messages":
            print(json.dumps(conversation.messages, indent=2))
            continue

        try:
            reply = conversation.send(user_input)
        except ProviderError as exc:
            print(f"\n[provider error] {exc}\n", file=sys.stderr)
            continue

        print(f"\nagent > {reply}\n")


def _register_without_collision(tools: ToolRegistry, tool) -> None:
    """Keep MCP tool names as their server published them where possible.

    Prefixing every tool with its server would make the common single-server
    case noisier for no benefit, so the server name is only used to break an
    actual clash.
    """
    if tool.name not in tools.names():
        tools.register(tool)
        return
    server = tool.source.split(":", 1)[-1].replace("-", "_")
    tools.register(replace(tool, name=f"{server}_{tool.name}"))


def _announce_tool_call(name: str, arguments: str) -> None:
    """Show tool use as it happens — the module is about watching the loop work."""
    shown = arguments if len(arguments) <= 80 else arguments[:77] + "..."
    print(f"  · calling {name}({shown})")


def conversation_tools(tools: ToolRegistry) -> list[tuple[str, str]]:
    return sorted(tools.describe())


if __name__ == "__main__":
    raise SystemExit(main())
