import pytest

from .config import Config, ConfigError


def test_load_fails_clearly_without_a_key(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ConfigError, match="OPENROUTER_API_KEY"):
        Config.load(tmp_path)


def test_placeholder_key_is_treated_as_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "replace-me")
    with pytest.raises(ConfigError, match="OPENROUTER_API_KEY"):
        Config.load(tmp_path)


def test_relative_paths_resolve_against_the_harness_root(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setenv("PAIR_AGENT_SKILLS_DIR", "skills")
    config = Config.load(tmp_path)
    assert config.skills_dir == (tmp_path / "skills").resolve()


def test_non_numeric_timeout_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setenv("OPENROUTER_TIMEOUT", "soon")
    with pytest.raises(ConfigError, match="OPENROUTER_TIMEOUT"):
        Config.load(tmp_path)
