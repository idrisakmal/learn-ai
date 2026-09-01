from .tools import NO_ARGUMENTS, Tool, ToolRegistry


def echo_tool(name="echo", run=None):
    return Tool(
        name=name,
        description="Echo the argument back.",
        parameters=NO_ARGUMENTS,
        run=run or (lambda args: f"echoed {args.get('text', '')}"),
    )


def test_registry_exposes_provider_shaped_schemas():
    registry = ToolRegistry()
    registry.register(echo_tool())

    schema = registry.schemas()[0]
    assert schema["type"] == "function"
    assert schema["function"]["name"] == "echo"
    assert "description" in schema["function"]


def test_arguments_are_parsed_from_json_and_passed_through():
    registry = ToolRegistry()
    registry.register(echo_tool())
    assert registry.invoke("echo", '{"text": "hi"}') == "echoed hi"


def test_empty_arguments_are_treated_as_no_arguments():
    registry = ToolRegistry()
    registry.register(echo_tool())
    assert registry.invoke("echo", "") == "echoed "


def test_unknown_tool_returns_a_readable_error_rather_than_raising():
    registry = ToolRegistry()
    registry.register(echo_tool())

    result = registry.invoke("nope", "{}")

    assert "no tool named 'nope'" in result
    assert "echo" in result, "the model should be told what it can call instead"


def test_malformed_arguments_return_an_error_the_model_can_recover_from():
    registry = ToolRegistry()
    registry.register(echo_tool())
    assert "not valid JSON" in registry.invoke("echo", "{oops")


def test_a_raising_tool_does_not_tear_down_the_conversation():
    def explode(_args):
        raise RuntimeError("disk on fire")

    registry = ToolRegistry()
    registry.register(echo_tool(run=explode))

    assert "disk on fire" in registry.invoke("echo", "{}")


def test_duplicate_names_are_refused_at_registration():
    registry = ToolRegistry()
    registry.register(echo_tool())
    try:
        registry.register(echo_tool())
    except ValueError as exc:
        assert "echo" in str(exc)
    else:
        raise AssertionError("registering two tools with one name should fail")


import subprocess

from .tools import build_read_file_tool


class RepoConfig:
    def __init__(self, code_dir):
        self.code_dir = code_dir


def make_repo(tmp_path):
    """A real git repo, because the ignore rules are enforced by git itself."""
    root = tmp_path / "repo"
    (root / "project").mkdir(parents=True)
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    (root / ".gitignore").write_text(".env\nsecrets/\n", encoding="utf-8")
    (root / ".env").write_text("OPENROUTER_API_KEY=sk-real-key", encoding="utf-8")
    (root / "project" / "notes.md").write_text("visible content", encoding="utf-8")
    (root / "outside.txt").write_text("still inside the repo", encoding="utf-8")
    (tmp_path / "elsewhere.txt").write_text("FORBIDDEN-CONTENT", encoding="utf-8")
    return root


def test_reads_a_file_relative_to_the_repo_root(tmp_path):
    root = make_repo(tmp_path)
    tool = build_read_file_tool(RepoConfig(root / "project"))
    assert "visible content" in tool.run({"path": "project/notes.md"})


def test_reads_a_file_relative_to_the_anchored_project(tmp_path):
    root = make_repo(tmp_path)
    tool = build_read_file_tool(RepoConfig(root / "project"))
    assert "visible content" in tool.run({"path": "notes.md"})


def test_refuses_a_git_ignored_file_because_it_may_hold_secrets(tmp_path):
    root = make_repo(tmp_path)
    tool = build_read_file_tool(RepoConfig(root / "project"))

    result = tool.run({"path": ".env"})

    assert "git-ignored" in result
    assert "sk-real-key" not in result


def test_refuses_to_escape_the_repo_with_a_relative_path(tmp_path):
    root = make_repo(tmp_path)
    tool = build_read_file_tool(RepoConfig(root / "project"))

    result = tool.run({"path": "../elsewhere.txt"})

    assert "outside the repository" in result
    assert "FORBIDDEN-CONTENT" not in result


def test_refuses_an_absolute_path_outside_the_repo(tmp_path):
    root = make_repo(tmp_path)
    tool = build_read_file_tool(RepoConfig(root / "project"))
    assert "outside the repository" in tool.run({"path": str(tmp_path / "elsewhere.txt")})


def test_refuses_to_read_git_internals(tmp_path):
    root = make_repo(tmp_path)
    tool = build_read_file_tool(RepoConfig(root / "project"))
    assert "git-ignored" in tool.run({"path": ".git/config"})


def test_missing_path_argument_is_reported(tmp_path):
    root = make_repo(tmp_path)
    tool = build_read_file_tool(RepoConfig(root / "project"))
    assert "needs a 'path'" in tool.run({})


def test_a_large_file_is_truncated_rather_than_flooding_the_context(tmp_path):
    root = make_repo(tmp_path)
    (root / "project" / "big.txt").write_text("x" * 200_000, encoding="utf-8")
    tool = build_read_file_tool(RepoConfig(root / "project"))
    assert "[truncated at" in tool.run({"path": "project/big.txt"})
