"""The messages array and the loop that drives it.

The messages array is the agent's entire working memory for a session. Every
turn — human, assistant, and later tool calls and their results — is appended
to it in order, and the whole array is sent to the model on every request.
There is no hidden state anywhere else in the harness.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from .config import Config
from .provider import Provider
from .tools import ToolRegistry

BASE_SYSTEM_PROMPT = """\
You are the PAIR Agent: a pair-programming assistant anchored to one specific \
codebase, the config-service project in this repository.

You are not a general chatbot. Your job is to help a developer understand and \
change this repo. Answer in terms of what is actually in it. When you do not \
know something about the repo, say so plainly rather than inventing a \
plausible-sounding answer — a confident wrong answer about a codebase costs \
more than an admission of ignorance.

## Your capabilities

You have three kinds of tool, and choosing the right one matters:

- **Repo tools** report the live state of the working tree. Use them for \
  questions about what is currently going on in the repo.
- **Domain tools** query an authoritative knowledge graph of this system's \
  domain vocabulary. When a question turns on what a domain term *means*, look \
  it up rather than inferring it from the code or from your own assumptions. \
  The graph is the source of truth for vocabulary; you are not.
- **Skill tools** give you the team's written procedures. `list_skills` is \
  cheap — call it when a request sounds procedural ("how do I start...", \
  "orient me", "what's the process for..."). If a skill applies, call \
  `activate_skill` and then actually follow what it says, rather than \
  improvising your own version of the same process.

Chain them when a task needs it: orienting on a piece of work and explaining \
its vocabulary are two different questions answered by two different tools.

Keep replies short and concrete. Prefer naming real files and real commands \
over describing them in general terms.
"""


def build_system_prompt(config: Config, catalog: Any = None) -> str:
    """Assemble the system prompt, folding in the repo's own agent instructions.

    `AGENTS.md` is how this repo tells an agent how to behave in it. The harness
    would be ignoring the repo's own rules if it did not read them.
    """
    parts = [BASE_SYSTEM_PROMPT]

    # The catalogue, not the bodies. The model needs to know a skill exists to
    # decide whether to pay for it; that is the whole trade progressive
    # disclosure is making.
    if catalog is not None and len(catalog):
        parts.append(catalog.catalog())

    agents_md = _find_agents_md(config.code_dir)
    if agents_md is not None:
        parts.append(
            "The repository provides the following instructions in "
            f"`{agents_md.name}`. Treat them as binding.\n\n"
            "<repo_instructions>\n"
            f"{agents_md.read_text(encoding='utf-8').strip()}\n"
            "</repo_instructions>"
        )

    return "\n\n".join(parts)


def _find_agents_md(code_dir: Path) -> Path | None:
    """Look for AGENTS.md beside the code, then one level up at the repo root."""
    for candidate in (code_dir / "AGENTS.md", code_dir.parent / "AGENTS.md"):
        if candidate.is_file():
            return candidate
    return None


# A model that keeps calling tools without ever answering is stuck, not busy.
MAX_TOOL_ROUNDS = 8


class Conversation:
    """An ordered list of turns, plus the loop that adds to it."""

    def __init__(
        self,
        provider: Provider,
        system_prompt: str,
        tools: ToolRegistry | None = None,
        on_tool_call: Callable[[str, str], None] | None = None,
    ) -> None:
        self._provider = provider
        self._tools = tools or ToolRegistry()
        self._on_tool_call = on_tool_call
        self.messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt}
        ]

    def send(self, user_text: str) -> str:
        """Run one exchange to completion, tool calls and all.

        The loop is the whole harness in miniature: ask the model, and if it
        asked for tools rather than answering, run them, append the results,
        and ask again with the conversation that now contains them.
        """
        self.messages.append({"role": "user", "content": user_text})

        for _ in range(MAX_TOOL_ROUNDS):
            assistant = self._provider.complete(
                self.messages, tools=self._tools.schemas() or None
            )
            self.messages.append(assistant)

            tool_calls = assistant.get("tool_calls")
            if not tool_calls:
                return assistant["content"]

            for call in tool_calls:
                self._run_tool_call(call)

        return (
            "I kept reaching for tools without arriving at an answer "
            f"({MAX_TOOL_ROUNDS} rounds). Try asking something narrower."
        )

    def _run_tool_call(self, call: dict[str, Any]) -> None:
        name = call["function"]["name"]
        raw_arguments = call["function"].get("arguments") or "{}"

        if self._on_tool_call is not None:
            self._on_tool_call(name, raw_arguments)

        result = self._tools.invoke(name, raw_arguments)

        # The tool result is a turn in its own right. Without this append the
        # model would ask for the same tool forever, never seeing an answer.
        self.messages.append(
            {
                "role": "tool",
                "tool_call_id": call["id"],
                "name": name,
                "content": result,
            }
        )

    def turns(self) -> list[dict[str, Any]]:
        """Every message except the system prompt."""
        return self.messages[1:]
