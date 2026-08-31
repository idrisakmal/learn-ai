"""Skills — procedural instructions, loaded only when they are needed.

A skill is a directory containing a `SKILL.md` whose frontmatter names it and
says when to use it. The harness reads only that frontmatter at startup. The
body — which can run to hundreds of lines — is loaded when, and only when, the
model calls `activate_skill`.

That is progressive disclosure, and it is the whole point of this part of the
harness: the model gets a cheap catalogue up front and pays for detail on
demand, rather than carrying every skill's full text in every request.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import Config
from .tools import NO_ARGUMENTS, Tool

SKILL_FILE = "SKILL.md"


@dataclass(frozen=True)
class Skill:
    """What the harness knows about a skill before anyone activates it."""

    name: str
    description: str
    path: Path

    def body(self) -> str:
        """The full instructions, read from disk on demand."""
        return _strip_frontmatter(self.path.read_text(encoding="utf-8"))


class SkillCatalog:
    """Every skill found on disk, by name."""

    def __init__(self, skills: list[Skill]) -> None:
        self._skills = {skill.name: skill for skill in skills}
        self.activated: list[str] = []

    @classmethod
    def scan(cls, skills_dir: Path) -> "SkillCatalog":
        """Find skills without reading their bodies.

        A missing directory is not an error — a harness with no skills is a
        perfectly valid harness, and saying so beats refusing to start.
        """
        if not skills_dir.is_dir():
            return cls([])

        skills: list[Skill] = []
        for candidate in sorted(skills_dir.iterdir()):
            skill_file = candidate / SKILL_FILE
            if not skill_file.is_file():
                continue
            metadata = _read_frontmatter(skill_file)
            name = metadata.get("name") or candidate.name
            skills.append(
                Skill(
                    name=name,
                    description=metadata.get("description", "(no description given)"),
                    path=skill_file,
                )
            )
        return cls(skills)

    def __len__(self) -> int:
        return len(self._skills)

    def names(self) -> list[str]:
        return list(self._skills)

    def get(self, name: str) -> Skill | None:
        return self._skills.get(name)

    def catalog(self) -> str:
        """The lightweight listing the model sees before activating anything."""
        if not self._skills:
            return "No skills are available in this harness."
        lines = [
            f"- {skill.name}: {skill.description}" for skill in self._skills.values()
        ]
        return "Available skills:\n" + "\n".join(lines)

    def activate(self, name: str) -> str:
        skill = self._skills.get(name)
        if skill is None:
            known = ", ".join(sorted(self._skills)) or "none"
            return f"Error: no skill named {name!r}. Available skills: {known}."

        self.activated.append(name)
        return (
            f"Skill '{skill.name}' is now active. Follow these instructions.\n"
            f"Its files are in {skill.path.parent}; paths mentioned below are "
            "relative to that directory unless stated otherwise.\n\n"
            f"{skill.body()}"
        )


def build_skill_tools(catalog: SkillCatalog) -> list[Tool]:
    """The two harness-owned tools that make skills usable."""

    def list_skills(_arguments: dict[str, Any]) -> str:
        return catalog.catalog()

    def activate_skill(arguments: dict[str, Any]) -> str:
        name = arguments.get("name")
        if not isinstance(name, str) or not name.strip():
            return "Error: activate_skill needs a 'name' argument."
        return catalog.activate(name.strip())

    return [
        Tool(
            name="list_skills",
            description=(
                "List the procedural skills this harness has, with a short "
                "description of when each applies. Cheap; call it when you are "
                "unsure whether a defined process covers the task at hand."
            ),
            parameters=NO_ARGUMENTS,
            run=list_skills,
        ),
        Tool(
            name="activate_skill",
            description=(
                "Load the full instructions for one skill by name, and follow "
                "them. Call this only once you have decided a skill applies — "
                "the instructions are long, so they are not loaded until asked for."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Exact skill name, as given by list_skills.",
                    }
                },
                "required": ["name"],
            },
            run=activate_skill,
        ),
    ]


SCRIPT_TIMEOUT = 300
SCRIPT_OUTPUT_LIMIT = 40_000


def build_run_skill_script_tool(catalog: SkillCatalog, config: Config) -> Tool:
    """Run a script that ships with a skill — and only such a script.

    Deliberately not a general shell. A skill's script is written by the same
    people who wrote the skill and lives beside it in the repo, so running one
    is closer to calling a known function than to executing arbitrary input.
    The model chooses which skill, never what to execute.
    """

    def run(arguments: dict[str, Any]) -> str:
        skill_name = arguments.get("skill")
        if not isinstance(skill_name, str) or not skill_name.strip():
            return "Error: run_skill_script needs a 'skill' argument."

        skill = catalog.get(skill_name.strip())
        if skill is None:
            known = ", ".join(sorted(catalog.names())) or "none"
            return f"Error: no skill named {skill_name!r}. Available skills: {known}."

        script_name = str(arguments.get("script") or "script.sh").strip()
        script = (skill.path.parent / script_name).resolve()

        # The skill directory is the boundary; a script name is not a path.
        if skill.path.parent.resolve() not in script.parents:
            return f"Error: {script_name!r} is not inside the {skill.name} skill."
        if not script.is_file():
            return f"Error: the {skill.name} skill has no script named {script_name!r}."

        try:
            result = subprocess.run(
                ["bash", str(script)],
                cwd=config.code_dir,
                capture_output=True,
                text=True,
                timeout=SCRIPT_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return f"Error: {script_name} did not finish within {SCRIPT_TIMEOUT}s."

        output = result.stdout.strip()
        if len(output) > SCRIPT_OUTPUT_LIMIT:
            output = output[:SCRIPT_OUTPUT_LIMIT] + "\n\n[output truncated]"
        if result.returncode != 0:
            stderr = result.stderr.strip()[:2000]
            return f"{script_name} exited {result.returncode}.\nstderr:\n{stderr}\n\n{output}"
        return output or f"{script_name} produced no output."

    return Tool(
        name="run_skill_script",
        description=(
            "Run the helper script that ships with a skill, from the anchored "
            "project directory, and return its output. Skills that gather "
            "evidence say in their instructions when to call this. Defaults to "
            "the skill's script.sh."
        ),
        parameters={
            "type": "object",
            "properties": {
                "skill": {
                    "type": "string",
                    "description": "Exact skill name, as given by list_skills.",
                },
                "script": {
                    "type": "string",
                    "description": "Script filename within the skill. Defaults to script.sh.",
                },
            },
            "required": ["skill"],
        },
        run=run,
    )


def _read_frontmatter(path: Path) -> dict[str, str]:
    """Read only the YAML frontmatter block, not the whole file.

    Deliberately a hand-rolled reader rather than a YAML dependency: skill
    frontmatter is flat `key: value` lines, and stopping at the closing `---`
    means a long skill body is never read at catalogue time.
    """
    metadata: dict[str, str] = {}
    with path.open(encoding="utf-8") as handle:
        if handle.readline().strip() != "---":
            return metadata
        for line in handle:
            if line.strip() == "---":
                break
            if ":" not in line:
                continue
            key, _, value = line.partition(":")
            metadata[key.strip()] = _unquote(value.strip())
    return metadata


def _unquote(value: str) -> str:
    """Drop wrapping quotes, but only if the value is genuinely wrapped.

    Stripping quote characters unconditionally would truncate a description
    that legitimately ends in one — as this repo's own skill does.
    """
    for quote in ('"', "'"):
        if len(value) >= 2 and value.startswith(quote) and value.endswith(quote):
            return value[1:-1]
    return value


def _strip_frontmatter(text: str) -> str:
    """Return the instructions without the metadata block."""
    if not text.startswith("---"):
        return text
    parts = text.split("---", 2)
    return parts[2].lstrip() if len(parts) >= 3 else text
