"""Configuration for the harness.

Everything the harness needs to start lives here, loaded from the environment
(and a local `.env`). Missing or unusable configuration fails here, at startup,
with a message that says what to do about it — never deeper in as an opaque
provider error.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


class ConfigError(RuntimeError):
    """Raised when the harness cannot start with the configuration it was given."""


DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "minimax/minimax-m3:free"
DEFAULT_TIMEOUT = 120.0
DEFAULT_TEMPERATURE = 0.2


@dataclass(frozen=True)
class Config:
    """Resolved harness configuration."""

    api_key: str
    base_url: str
    model: str
    timeout: float
    temperature: float
    root: Path
    skills_dir: Path
    code_dir: Path

    @classmethod
    def load(cls, root: Path | None = None) -> "Config":
        """Read configuration from `.env` and the environment.

        `root` is the harness directory; relative paths in the environment are
        resolved against it so the harness behaves the same wherever it is run
        from.
        """
        root = (root or Path(__file__).resolve().parent.parent).resolve()
        load_dotenv(root / ".env")

        api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        if not api_key or api_key == "replace-me":
            raise ConfigError(
                "OPENROUTER_API_KEY is not set.\n"
                f"Copy {root / '.env.example'} to {root / '.env'} "
                "and put your OpenRouter key in it."
            )

        return cls(
            api_key=api_key,
            base_url=os.environ.get("OPENROUTER_BASE_URL", DEFAULT_BASE_URL).strip(),
            model=os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
            timeout=_float("OPENROUTER_TIMEOUT", DEFAULT_TIMEOUT),
            temperature=_float("OPENROUTER_TEMPERATURE", DEFAULT_TEMPERATURE),
            root=root,
            skills_dir=_path(root, "PAIR_AGENT_SKILLS_DIR", "../.claude/skills"),
            code_dir=_path(root, "PAIR_AGENT_CODE_DIR", "../module1"),
        )


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number, got {raw!r}.") from exc


def _path(root: Path, name: str, default: str) -> Path:
    raw = os.environ.get(name, "").strip() or default
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    return candidate.resolve()
