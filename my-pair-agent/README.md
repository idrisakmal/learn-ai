# PAIR Agent

A small agent harness anchored to the `config-service` repo. Module 6 exercise.

It is deliberately not a framework. It is the smallest thing that shows the
moving parts of an agent: a conversation loop, a messages array, a tool
registry, MCP tool discovery, and skills loaded on demand.

## Running it

```bash
cp .env.example .env      # then put your OpenRouter key in it
uv run pair-agent
```

REPL commands: `/messages` dumps the raw messages array, `/tools` lists every
tool the model can call and where it came from, `/help`, `/quit`.

```bash
uv run pytest
```

## The parts

| File | What it owns |
|---|---|
| `conversation.py` | The messages array and the loop that grows it. The harness in miniature. |
| `provider.py` | The one provider path (OpenRouter). Everything above it speaks plain dicts. |
| `tools.py` | The registry, plus `repo_status` and `read_file`. Harness tools and MCP tools become indistinguishable here. |
| `skills.py` | Skill discovery and progressive disclosure. |
| `mcp_client.py` | The client half of Module 5: read `mcp.json`, start servers, discover tools. |
| `config.py` | Startup configuration, and clear failure when it is wrong. |
| `main.py` | The CLI. |

## The messages array

Every turn lives in one ordered list — system, user, assistant, and tool
results — and the whole list is sent on every request. There is no hidden state
anywhere else. `/messages` prints it, because the concept is easier to believe
once you have seen it.

## Progressive disclosure

The harness reads only each skill's frontmatter at startup, so the model sees a
catalogue of names and descriptions. A skill's body is read from disk only when
the model calls `activate_skill`. MCP works the same way: tool schemas up
front, results only when a tool is actually called.

## What the agent may touch

`read_file` enforces two boundaries, both after resolving symlinks: the file
must be inside the repository, and it must not be git-ignored. The second is
the important one — `.env` sits beside this harness and holds an API key, and
"ignored by git" is precisely the line between committed source and local
secrets. Large files are truncated rather than allowed to flood the context.

`run_skill_script` is not a shell. It runs a script that ships inside a skill
directory, from the anchored project directory. The model chooses which skill;
it never chooses what to execute.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Required. |
| `OPENROUTER_MODEL` | `minimax/minimax-m3:free` | Must support tool calling. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | |
| `OPENROUTER_TIMEOUT` | `120` | Seconds. |
| `OPENROUTER_TEMPERATURE` | `0.2` | |
| `PAIR_AGENT_SKILLS_DIR` | `../.claude/skills` | Any directory of `<name>/SKILL.md`. |
| `PAIR_AGENT_CODE_DIR` | `../module1` | The repo the agent is anchored to. |

MCP servers are configured in `mcp.json`, whose `cwd` paths resolve relative to
that file.

## Notes from building it

**Free OpenRouter endpoints fail in three shapes**, and the harness handles all
three because it had to: an upstream fault arrives as *HTTP 200 with an error
body* (a naive client reports "no choices" and hides the cause); rate limits and
5xx are transient; and an upstream routing failure arrives as a **404 that looks
exactly like a misspelled model name** — `metadata.provider_name` is the only
thing telling them apart. Only the first three are retried.

**The MCP SDK renamed `inputSchema` to `input_schema`** in 2.x, and `isError` to
`is_error`. Both are read defensively.

**A whole MCP server failing does not stop the harness.** It reports which one
died and runs with the tools that did load.
