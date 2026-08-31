from pathlib import Path

from .skills import SkillCatalog, build_skill_tools

LONG_BODY = "\n".join(f"step {i}: do the thing" for i in range(200))


def write_skill(root: Path, name: str, description: str, body: str = LONG_BODY) -> Path:
    directory = root / name
    directory.mkdir(parents=True)
    (directory / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: {description}\n---\n\n{body}\n",
        encoding="utf-8",
    )
    return directory


def test_catalog_lists_metadata_only(tmp_path):
    write_skill(tmp_path, "start-work", "Use at the beginning of a piece of work.")

    catalog = SkillCatalog.scan(tmp_path).catalog()

    assert "start-work" in catalog
    assert "Use at the beginning" in catalog
    assert "step 0: do the thing" not in catalog, "the body must not be preloaded"


def test_a_description_ending_in_a_quote_is_not_truncated(tmp_path):
    write_skill(tmp_path, "start-work", 'orient, or ask "where were we?"')

    catalog = SkillCatalog.scan(tmp_path)

    assert catalog.catalog().endswith('"where were we?"')


def test_a_fully_quoted_description_loses_its_wrapping(tmp_path):
    write_skill(tmp_path, "s", '"a quoted description"')
    assert "a quoted description" in SkillCatalog.scan(tmp_path).catalog()


def test_activation_returns_the_full_body_and_its_location(tmp_path):
    directory = write_skill(tmp_path, "start-work", "orient")

    result = SkillCatalog.scan(tmp_path).activate("start-work")

    assert "step 199: do the thing" in result
    assert str(directory) in result, "relative references need a base path"
    assert "description: orient" not in result, "frontmatter is metadata, not instructions"


def test_unknown_skill_names_come_back_as_a_usable_error(tmp_path):
    write_skill(tmp_path, "start-work", "orient")

    result = SkillCatalog.scan(tmp_path).activate("start_work")

    assert "no skill named 'start_work'" in result
    assert "start-work" in result, "the model should be told the real name"


def test_directories_without_a_skill_file_are_ignored(tmp_path):
    write_skill(tmp_path, "real", "a real skill")
    (tmp_path / "not-a-skill").mkdir()

    assert SkillCatalog.scan(tmp_path).names() == ["real"]


def test_a_missing_skills_directory_is_not_fatal(tmp_path):
    catalog = SkillCatalog.scan(tmp_path / "nope")
    assert len(catalog) == 0
    assert "No skills are available" in catalog.catalog()


def test_the_body_is_read_only_when_activated(tmp_path):
    write_skill(tmp_path, "start-work", "orient")
    catalog = SkillCatalog.scan(tmp_path)

    assert catalog.activated == []
    catalog.activate("start-work")
    assert catalog.activated == ["start-work"]


def test_activate_skill_tool_requires_a_name(tmp_path):
    write_skill(tmp_path, "start-work", "orient")
    tools = {t.name: t for t in build_skill_tools(SkillCatalog.scan(tmp_path))}

    assert "needs a 'name'" in tools["activate_skill"].run({})
    assert "step 0" in tools["activate_skill"].run({"name": "start-work"})
    assert "step 0" not in tools["list_skills"].run({})


from .skills import build_run_skill_script_tool


class ScriptConfig:
    def __init__(self, code_dir):
        self.code_dir = code_dir


def test_runs_a_skills_own_script_from_the_project_directory(tmp_path):
    directory = write_skill(tmp_path, "start-work", "orient")
    (directory / "script.sh").write_text("echo running in $(basename $PWD)", encoding="utf-8")
    project = tmp_path / "module1"
    project.mkdir()

    catalog = SkillCatalog.scan(tmp_path)
    tool = build_run_skill_script_tool(catalog, ScriptConfig(project))

    assert "running in module1" in tool.run({"skill": "start-work"})


def test_refuses_to_run_anything_outside_the_skill_directory(tmp_path):
    write_skill(tmp_path, "start-work", "orient")
    (tmp_path / "evil.sh").write_text("echo pwned", encoding="utf-8")
    project = tmp_path / "module1"
    project.mkdir()

    tool = build_run_skill_script_tool(SkillCatalog.scan(tmp_path), ScriptConfig(project))

    result = tool.run({"skill": "start-work", "script": "../evil.sh"})

    assert "not inside" in result
    assert "pwned" not in result


def test_unknown_skill_is_reported_rather_than_run(tmp_path):
    write_skill(tmp_path, "start-work", "orient")
    tool = build_run_skill_script_tool(SkillCatalog.scan(tmp_path), ScriptConfig(tmp_path))
    assert "no skill named 'nope'" in tool.run({"skill": "nope"})


def test_a_missing_script_is_reported(tmp_path):
    write_skill(tmp_path, "start-work", "orient")
    tool = build_run_skill_script_tool(SkillCatalog.scan(tmp_path), ScriptConfig(tmp_path))
    assert "no script named" in tool.run({"skill": "start-work"})


def test_a_failing_script_surfaces_its_exit_code_and_stderr(tmp_path):
    directory = write_skill(tmp_path, "start-work", "orient")
    (directory / "script.sh").write_text("echo bad >&2; exit 3", encoding="utf-8")
    tool = build_run_skill_script_tool(SkillCatalog.scan(tmp_path), ScriptConfig(tmp_path))

    result = tool.run({"skill": "start-work"})

    assert "exited 3" in result
    assert "bad" in result
