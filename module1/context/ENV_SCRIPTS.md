<!--
MAINTENANCE NOTE (for humans and assistants)

Procedural memory: how to run this project. Environments, ports, every
environment variable, and every command. Read before running anything.

When updating:
  - Every command here must have been run. If it was not, do not list it.
  - This file answers HOW TO RUN. Coding rules live in IMPLEMENTATION.md and
    design reasoning in ARCHITECTURE.md; do not restate either here.
  - If a command here and the Makefile disagree, the Makefile wins and this
    file is corrected.

Sections marked PLANNED describe work not yet built.
-->

# Environments and scripts

**Run everything through `make`, from `module1/`.** `make help` lists the
targets. The package scripts underneath are documented below for the rare case
where a target does not fit, but the Makefile is the interface — it is where the
database dependencies, the test database URL, and the cold-start ordering live,
and going around it is how those get skipped.

## Environments

Two exist. Both are on your machine.

| Environment | What it is | Database | `NODE_ENV` |
|---|---|---|---|
| **development** | `make dev` + `make ui-dev`, seeded with demo data | `config_service` | `development` |
| **test** | What `make test` runs against; truncated between cases | `config_service_test` | `test` (set by `vitest.config.ts`) |

Both databases live in the **same** PostgreSQL container, `config-service-pg`.
Stopping it stops both.

**There is no CI and no production.** No `.github/` workflow exists, so `make
check` is run by a person or it is not run at all. Nothing is deployed anywhere,
there is no staging, and no production credentials exist to leak. Treat "CI"
below as shorthand for "what CI would run if it existed".

### Ports

| Port | What | Set in |
|---|---|---|
| **3999** | The service | `PORT` in `.env`; default in `src/config/env.ts` |
| **5173** | Admin UI dev server | `ui/vite.config.ts` |
| **5435** | PostgreSQL, host side (5432 inside the container) | `PG_PORT` in the `Makefile` |

None of these are the usual defaults, and that is deliberate. **3000 was
abandoned** because it collides with nearly every other local dev server, and
**5435 instead of 5432** so the container does not fight a PostgreSQL already
installed on the machine. If you change `PG_PORT`, `DATABASE_URL` in `.env` must
change with it — the Makefile does not rewrite `.env`.

The UI proxies `/api` to `http://localhost:3999`, so **`make dev` must be
running in another terminal or every UI request 502s**. That proxy is also why
the service carries no CORS middleware.

## Environment variables

The service reads four, all validated by a Zod schema in
`config-service/src/config/env.ts`. **The schema is parsed at import time and
the process exits on failure** — a bad value is a startup crash with the
offending field named, never a mystery at request time.

| Variable | Required | Default | Controls |
|---|---|---|---|
| `DATABASE_URL` | **yes** | none | PostgreSQL connection string. No default; the service will not start without it. |
| `PORT` | no | `3999` | HTTP port. |
| `LOG_LEVEL` | no | `info` | One of `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. Also selects Prisma's log levels — see below. |
| `NODE_ENV` | no | `development` | One of `development`, `test`, `production`. |

Live in `config-service/.env`, which is **git-ignored**. A fresh clone has none,
so `make env` (and therefore `make install` and `make setup`) copies
`.env.example` over. `.env.example` is the documentation of last resort — keep
it in step with the schema.

`LOG_LEVEL=silent` means silent, including Prisma. Prisma logs the expected
constraint violations behind the 409 and 404 paths at `error` level, so a
passing test run would otherwise be full of alarming `prisma:error` blocks. The
mapping is `resolvePrismaLogLevels` in `src/db/prisma.ts`; the tests set
`silent`.

**`TEST_DATABASE_URL`** is not part of the schema and is not read by the
service. The Makefile passes it into `vitest` and `prisma migrate deploy` so
that the suite and the migrations cannot disagree about which database they
mean. `vitest.config.ts` falls back to its own hard-coded default only when it
is unset — which is what happens if you run `bun run test` directly instead of
`make test`, and is a reason not to.

The UI needs no environment variables at all. It has no build-time
configuration; the API base path is the literal `/api/v1`.

## Prerequisites

**Node.js 22+, Bun, and Docker.** Nothing else. `make setup` handles the rest.

**Bun is the package manager only — the application runs on Node.js.** Never
`bun test`, never `bun run <file>.ts`. Install with `bun install` / `bun add`,
run scripts with `bun run <script>`.

## Commands

### Cold start

```bash
make setup    # install both apps, generate the Prisma client, start
              # PostgreSQL, migrate both databases
make seed     # demo data, so the UI has something to show
```

Verified from a fresh clone against a brand-new container: 45/45 service tests
pass with no manual step in between.

| Target | Does |
|---|---|
| `make setup` | The whole cold start, in order. Safe to re-run. |
| `make env` | Create `config-service/.env` from `.env.example` if missing |
| `make install` | `bun install` for the service, then `prisma generate` |
| `make ui-install` | `bun install` for the UI |

`prisma generate` is a separate step because **Bun does not run untrusted
postinstall scripts**, so `bun install` alone leaves the Prisma client
ungenerated and every import of it failing.

### Running it

| Target | Does |
|---|---|
| `make dev` | Service with reload, on 3999 |
| `make ui-dev` | Admin UI with reload, on 5173 (needs `make dev` in another terminal) |
| `make build` | Compile the service to `dist/` |
| `make start` | Run the compiled service on Node |

### Quality gates

**All four must be green before any task is done. No skipped tests, no ignored
warnings.**

```bash
make check    # runs all of it: lint, format-check, build, test, ui-check
```

| Target | Does |
|---|---|
| `make test` | Service suite against the test database (starts the database if needed) |
| `make test-watch` | Same, in watch mode |
| `make lint` | ESLint over the service |
| `make format` | **Rewrites** the service and the UI with Prettier |
| `make format-check` | Fails on unformatted code instead of fixing it. This is what `check` runs. |
| `make ui-test` / `ui-test-watch` | UI suite; needs no database |
| `make ui-lint` | ESLint over the UI |
| `make ui-build` | Type-check (`tsc`) and bundle the UI |
| `make ui-check` | `ui-lint`, `ui-build`, `ui-test` |

**Type-checking has no target of its own.** It happens inside `make build` for
the service and `make ui-build` for the UI, both of which run `tsc` before
anything else. `make check` therefore covers it.

`make format` covers both packages in one target on purpose — the style is
repo-wide, and splitting it per package would let the two drift.

### Database

| Target | Does |
|---|---|
| `make db-up` | Start PostgreSQL and ensure both databases exist. Idempotent. |
| `make db-down` | Stop the container. Data is kept. |
| `make db-shell` | `psql` against the development database |
| `make migrate` | Create and apply a migration (**development database only**) |
| `make migrate-test` | Apply existing migrations to the test database |
| `make seed` | Demo data into the development database. Safe to re-run — it upserts on natural keys. |
| `make db-reset` | **Destructive.** Drop and recreate both databases, then re-migrate. |

Every target that touches the database depends on `db-up`, so `make test` works
from cold on a machine where nothing is running.

Two traps, both hit for real:

> **After changing `prisma/schema.prisma`, `make migrate` is not enough.**
> It updates the development database only. The test database needs
> `make migrate-test` as well, or the suite runs against a stale schema.

> **`make db-reset` fails while anything holds a connection.** PostgreSQL will
> not drop a database in use, and `make dev` holds one. Stop it first.

### Housekeeping

`make clean` removes `dist/` from both apps. It leaves `node_modules` and the
database alone.

## When to go off-script

Use a raw command instead of a target when — and only when — one of these is
true:

- **You are diagnosing the tooling itself.** `make test` failing when
  `bun run test` passes is a Makefile bug, and running both is how you find it.
- **You need a flag no target exposes** — a single test file, `vitest -t`, a
  `prisma` subcommand with no wrapper. One-off investigation, not a workflow.
- **You are inspecting, not changing.** `docker logs config-service-pg`,
  `bunx prisma studio`, `git` — nothing to wrap.

Two rules govern going off-script:

1. **If you run it more than twice, it is a missing target.** Add it to the
   Makefile and to this file, in the same change.
2. **Never go off-script for a quality gate.** `make check` is the definition of
   done. Running `vitest` directly skips the explicit `TEST_DATABASE_URL`, and
   at that point you are testing a different database than you think.

And one thing that is never acceptable off-script or on: **do not add a
dependency without asking first.** Name it, say what it is for, and wait.
