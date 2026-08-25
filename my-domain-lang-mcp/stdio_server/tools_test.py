"""Tool-level tests: the shapes the model actually sees."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from stdio_server import tools

REPO_ROOT = Path(__file__).resolve().parents[2]
KG_DIR = REPO_ROOT / "assisted-to-agentic-module-6" / "examples" / "knowledge-graph"


@pytest.fixture(autouse=True)
def kg_project_dir(monkeypatch):
    monkeypatch.setenv("KG_PROJECT_DIR", str(KG_DIR))


async def test_ping_echoes():
    assert await tools.ping("hello") == "Pong: hello"


async def test_lookup_term_returns_the_record():
    payload = json.loads(await tools.lookup_term("ConfigurationItem"))
    assert payload["id"] == "configuration_item"
    assert payload["area"] == "config_service"
    assert payload["warnings"]


async def test_lookup_term_accepts_an_alias():
    payload = json.loads(await tools.lookup_term("config item"))
    assert payload["name"] == "ConfigurationItem"


async def test_lookup_term_rejects_an_empty_term_without_running_the_cli():
    payload = json.loads(await tools.lookup_term("   "))
    assert payload == {
        "error": "validation_error",
        "field": "term",
        "detail": "term must be a non-empty string",
    }


async def test_get_related_terms_returns_edges():
    edges = json.loads(await tools.get_related_terms("feature_flag"))
    assert len(edges) >= 3
    assert {"from", "to", "relationship"} <= set(edges[0])


async def test_list_domain_areas():
    assert json.loads(await tools.list_domain_areas()) == ["config_service", "feature_flags"]


async def test_validate_knowledge_graph():
    assert json.loads(await tools.validate_knowledge_graph()) == {"valid": True, "issues": []}
