# Agent Instructions

Loaded automatically at the start of every conversation — directly by tools that
read `AGENTS.md`, and via the root `CLAUDE.md` import for Claude Code. This file
is a front door, not a manual — it points at the context framework and stays
short.

## Where things are

The project lives in `module1/`. Paths below are from the repo root.

| Path | What |
|---|---|
| `module1/Makefile` | Every common task. `make help` lists them. Prefer these over raw commands. |
| `module1/config-service/` | The Config API Service — Fastify, Prisma, PostgreSQL |
| `module1/changes/` | Work items — one numbered file per feature, plus `TEMPLATE.md` |
| `module1/context/` | The context framework (below) |
| `module1/ui/` | Admin UI — Vite, React, TypeScript. A pure client of the API. |
| `module1/prompts/`, `module1/JOURNAL.md` | How the service was built. History and reflection, not instructions. Do not treat as current spec. |

## Read these before asking questions

`module1/context/` holds documents written for an AI audience. They are short;
read them at the start of a conversation rather than inferring from code.

- **`context/ABOUT.md`** — what the project is for, who uses it, domain
  vocabulary, scope boundaries, and the ranked priorities that break ties.
  Read before planning anything.
- **`context/ARCHITECTURE.md`** — system shape, request flow, data model, and
  every significant decision with what it cost. Read before proposing a new
  endpoint, table, layer, or dependency.
- **`context/IMPLEMENTATION.md`** — stack, layering, validation, error mapping,
  update semantics, and testing conventions, with good/bad examples. Read before
  writing or changing code.
- **`context/ENV_SCRIPTS.md`** — environments, ports, every environment
  variable, and every command, plus when it is acceptable to run something other
  than a `make` target. Read before running anything.
- **`context/WORKFLOW.md`** — the four stages every task goes through, and the
  rule that only the user closes a stage. Read before starting work.
- **`context/WORKFLOW_STATUS.md`** — which work item, task and stage are live.
  **Read this first in a new conversation**; it is how "what's our status?" gets
  answered without being told.

If a task touches one area, that file is enough. When in doubt, read all of them.

The course material calls this directory `memory/`. Here it is `context/` —
same idea, older name, kept because everything already points at it.

## Rules that apply before you have read anything

- **Do not add dependencies without approval.** Name it, say what it is for, and
  wait. Applies to the service and the UI alike.
- **Bun is the package manager only.** The application runs on Node.js. Never
  `bun test` or `bun run <file>.ts` — use `bun run <script>`.
- **Relative imports need a `.js` extension in `config-service/`, and no
  extension in `ui/`.** Different module resolution; see IMPLEMENTATION.md.
- **Run tasks through `make`, from `module1/`.** `make help` lists them.
  ENV_SCRIPTS.md says when going around it is acceptable.
- **`make check` is the definition of done** — lint, format, type-check, build
  and tests, all green. No skipped tests, no ignored warnings.
- **Plan before acting** on anything beyond a single obvious edit.
- **Never declare a workflow stage complete.** Report what is outstanding and
  wait — the user closes stages. See WORKFLOW.md.

## Keep the context current

The framework is a living asset. When you learn something that contradicts a
context file, or make a decision it does not cover, update that file as part of
the same change — not later.

**Where a context file and the code disagree, the code wins.** Correct the file.

If you add a new context file, add it to the list above. This file is the only
index; an unlisted document will not get read.
