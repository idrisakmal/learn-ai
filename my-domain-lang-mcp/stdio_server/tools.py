"""Tool implementations.

Each function returns a string, because that is what the model reads. Structured
results are JSON-encoded so the model gets one predictable shape per tool —
including for errors.
"""

from __future__ import annotations

import json
from typing import Any

from stdio_server import kg


def _dump(payload: Any) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False)


def _require_term(term: str) -> dict[str, Any] | None:
    if not term or not term.strip():
        return kg.validation_error("term", "term must be a non-empty string")
    return None


async def ping(message: str) -> str:
    return f"Pong: {message}"


async def lookup_term(term: str) -> str:
    invalid = _require_term(term)
    if invalid:
        return _dump(invalid)
    return _dump(await kg.run_json(["lookup", term.strip()]))


async def get_related_terms(term: str) -> str:
    invalid = _require_term(term)
    if invalid:
        return _dump(invalid)
    return _dump(await kg.run_json(["related", term.strip()]))


async def list_domain_areas() -> str:
    return _dump(await kg.run_json(["list-areas"]))


async def validate_knowledge_graph() -> str:
    return _dump(await kg.run_validate())
