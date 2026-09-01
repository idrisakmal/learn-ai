# PAIR Agent — Implementation Plan

Module 6 exercise. Answers Step 0 of `assisted-to-agentic-module-6/project/STEPS.md`.
The spec is `assisted-to-agentic-module-6/project/DESIGN.md`; this file is the
plan for *our* build of it, not a restatement of the spec.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Language | Python 3.12 + `uv` | Matches `my-domain-lang-mcp` from M5; the official MCP client SDK is Python-first. |
| Provider | OpenRouter, via the `openai` SDK against `https://openrouter.ai/api/v1` | OpenRouter is OpenAI-wire-compatible, so one well-understood tool-calling path. One provider only, per DESIGN §3. |
| Model | `OPENROUTER_MODEL`, default `minimax/minimax-m3:free` | Cheap, reliably tool-calling. Configurable. |
| Secrets | `.env` (gitignored) + `.env.example` committed | DESIGN §3 forbids committed credentials. |
| `mcp.json` location | `my-pair-agent/mcp.json` | The harness owns its own MCP config. The repo-root `.mcp.json` belongs to Claude Code; coupling to it would make the harness depend on another agent's config file. Same `domain-lang` server, pointed at the M5 build. |
| Skills directory | `../.claude/skills`, overridable via `PAIR_AGENT_SKILLS_DIR` | STEPS.md suggests `.agents/skills`, but the M4 skill already lives in `.claude/skills/start-work/` with the exact `name`/`description` frontmatter the catalog needs. Reuse beats duplication; DESIGN §5 only asks for "a skills directory". |
| Repo anchor | `../module1`, via `PAIR_AGENT_CODE_DIR` | Where `config-service` and `context/` live. |
| System prompt | Base prompt + repo `AGENTS.md` appended at startup | DESIGN acceptance: "effective system prompt can incorporate repo instructions from `AGENTS.md`". |

## Dependencies (need approval before install)

- `openai` — provider client, pointed at OpenRouter's base URL
- `mcp` — official MCP client SDK (M5 already uses it server-side)
- `python-dotenv` — load `.env`
- `pytest` (dev) — matches M5's test setup

## Files to create

```
my-pair-agent/
  pyproject.toml         entry point: pair-agent = "pair_agent.main:main"
  mcp.json               domain-lang stdio server definition
  .env.example           OPENROUTER_* + PAIR_AGENT_* keys
  .gitignore             .env, .venv, __pycache__
  README.md              what it is, how to run it
  PLAN.md                this file
  pair_agent/
    __init__.py
    config.py            env + path resolution; fails loudly on missing config
    provider.py          OpenRouter seam: messages + tool schemas -> assistant turn
    tools.py             registry (name -> schema + callable), dispatch, result formatting
    skills.py            scan dir, parse frontmatter, list_skills, activate_skill
    mcp_client.py        read mcp.json, start sessions, discover tools, invoke
    conversation.py      messages array + the loop (respond / execute tools / continue)
    main.py              CLI: startup wiring, REPL, /commands
```

Tests alongside as `*_test.py`, matching the M5 convention.

## Build order

Follows STEPS.md, one commit per step, manually validated before the next.

1. **Conversation** — CLI REPL, `messages` array, system prompt, one provider call. Validate: multi-turn memory.
2. **Tool loop** — registry + dispatch + tool-result turns. One trivial harness tool (`repo_status`) to prove the loop. Validate: model calls it, sees the result, continues.
3. **MCP** — load `mcp.json`, stdio session to the M5 server, discover tools, register them. Validate: ask a domain-term question, watch `lookup_term` fire.
4. **Skill discovery** — scan `.claude/skills`, parse frontmatter only, expose `list_skills`. Validate: catalog lists `start-work` with no `SKILL.md` body in the messages array.
5. **Skill activation** — `activate_skill(name)` returns the full body + base path. Validate: body appears only after activation.
6. **Assembly** — final system prompt, both capabilities loaded at startup. Validate with the STEPS.md combined prompt: orient on feature flags, then explain the domain terms.
7. **Robustness** — clear errors for missing key, missing `mcp.json`, unknown skill name. Validate by breaking each on purpose.

## How to run and test

```bash
cd my-pair-agent
uv run pair-agent          # the REPL
uv run pytest              # unit tests
```

A `/messages` REPL command dumps the raw messages array — the module's central
concept should be inspectable, not just described.

## Explicitly not building

Per DESIGN "Non-Goals": no tracing, no eval harness, no context compaction, no
multi-provider abstraction, no reimplementation of the MCP protocol. Those are
Module 7's.


## What actually changed during the build

Recorded because the plan above was written before any of it was known.

- **Model.** Started on `nvidia/nemotron-3-super-120b-a12b:free`. It worked for
  a handful of calls, then its free capacity failed every request. Of six free
  tool-calling models probed, only `minimax/minimax-m3:free` and
  `cohere/north-mini-code:free` were up; the harness runs on the former.
- **Retries moved from Step 7 to Step 1.** Not gold-plating — the free endpoint
  is unreliable enough that no later step could be validated without them.
- **`build_system_prompt` lives in `conversation.py`**, not its own module. It
  is twenty lines and belongs beside the thing that uses it.
- **MCP tool names are prefixed only on collision**, not always. One server is
  the common case and clean names are worth keeping.
- **`read_file` and `run_skill_script` were added after Step 6.** The first
  combined run exposed the gap: the model activated `start-work`, found it
  could not read `WORKFLOW_STATUS.md` or run `script.sh`, and said so instead
  of inventing a brief. Both tools go beyond DESIGN.md's stated minimum, and
  without them the "a skill *and* an MCP tool" criterion cannot really be met.
  Both are bounded — see README.
- **Known mismatch: the knowledge graph describes a different codebase.** The
  Module 6 example graph is built from the course's Python `svc/` service, not
  this repo's TypeScript `module1/config-service/`. Domain *terms* transfer;
  the `source_files` paths in the graph do not.
