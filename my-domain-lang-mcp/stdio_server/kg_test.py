"""Wrapper tests. These run against the real CLI — it is deterministic and fast,
and mocking it would only prove the mock works."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from stdio_server import kg

REPO_ROOT = Path(__file__).resolve().parents[2]
KG_DIR = REPO_ROOT / "assisted-to-agentic-module-6" / "examples" / "knowledge-graph"


@pytest.fixture(autouse=True)
def kg_project_dir(monkeypatch):
    monkeypatch.setenv("KG_PROJECT_DIR", str(KG_DIR))


async def test_run_json_decodes_a_known_term():
    payload = await kg.run_json(["lookup", "ConfigurationItem"])
    assert payload["name"] == "ConfigurationItem"


async def test_not_found_is_passed_through_not_treated_as_a_failure():
    payload = await kg.run_json(["lookup", "nonsense"])
    assert payload == {"error": "not_found", "term": "nonsense"}


async def test_unset_project_dir_is_a_service_error(monkeypatch):
    monkeypatch.delenv("KG_PROJECT_DIR")
    payload = await kg.run_json(["list-areas"])
    assert payload["error"] == "service_error"
    assert "KG_PROJECT_DIR" in payload["detail"]


async def test_bad_project_dir_is_a_service_error(monkeypatch):
    monkeypatch.setenv("KG_PROJECT_DIR", "/nowhere/at/all")
    payload = await kg.run_json(["lookup", "ConfigurationItem"])
    assert payload["error"] == "service_error"
    assert payload["kg_project_dir"] == "/nowhere/at/all"


async def test_missing_cli_binary_is_a_service_error(monkeypatch):
    monkeypatch.setattr(kg, "CLI_COMMAND", ("definitely-not-a-real-binary",))
    payload = await kg.run_json(["list-areas"])
    assert payload["error"] == "service_error"
    assert "PATH" in payload["detail"]


async def test_non_json_stdout_is_reported_as_malformed(monkeypatch):
    monkeypatch.setattr(kg, "CLI_COMMAND", ("python3", "-c", "print('not json at all')"))
    payload = await kg.run_json(["list-areas"])
    assert payload["error"] == "malformed_output"
    assert payload["stdout"] == "not json at all"


async def test_timeout_is_a_service_error(monkeypatch):
    monkeypatch.setattr(kg, "CLI_COMMAND", ("python3", "-c", "import time; time.sleep(5)"))
    result = await kg.run_cli(["list-areas"], timeout=0.2)
    assert result["error"] == "service_error"
    assert "did not finish" in result["detail"]


async def test_validate_normalises_the_exit_code_into_json():
    assert await kg.run_validate() == {"valid": True, "issues": []}


async def test_validate_reports_issues_when_the_cli_exits_non_zero(monkeypatch):
    script = "import sys; print('edge -> missing_term'); sys.exit(1)"
    monkeypatch.setattr(kg, "CLI_COMMAND", ("python3", "-c", script))
    assert await kg.run_validate() == {"valid": False, "issues": ["edge -> missing_term"]}
