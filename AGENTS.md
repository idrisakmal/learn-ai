# Agent Instructions

Loaded automatically at the start of every conversation. This file is a front
door, not a manual — it points at the context framework and stays short.

## Where things are

The project lives in `module1/`. Paths below are from the repo root.

| Path | What |
|---|---|
| `module1/Makefile` | Every common task. `make help` lists them. Prefer these over raw commands. |
| `module1/config-service/` | The Config API Service — Fastify, Prisma, PostgreSQL |
| `module1/context/` | The context framework (below) |
| `module1/ui/` | Admin UI — **planned, not built yet** |
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

If a task touches one area, that file is enough. When in doubt, read all three.

## Rules that apply before you have read anything

- **Do not add dependencies without approval.** Name it, say what it is for, and
  wait. Applies to the service and the UI alike.
- **Bun is the package manager only.** The application runs on Node.js. Never
  `bun test` or `bun run <file>.ts` — use `bun run <script>`.
- **Plan before acting** on anything beyond a single obvious edit.

## Keep the context current

The framework is a living asset. When you learn something that contradicts a
context file, or make a decision it does not cover, update that file as part of
the same change — not later.

**Where a context file and the code disagree, the code wins.** Correct the file.

If you add a new context file, add it to the list above. This file is the only
index; an unlisted document will not get read.
