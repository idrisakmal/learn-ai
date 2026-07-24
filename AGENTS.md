# AGENTS.md

Persistent instructions for AI coding assistants working in this repo. Loaded
automatically at the start of a conversation. Keep it short and specific.

## Stack (Config API Service — module1)

- TypeScript on **Node.js** (runtime). **Bun is the package manager only** — never
  assume the Bun runtime, `bun test`, or Bun-native APIs. Run scripts with `bun run`.
- Fastify 5, Prisma 6, PostgreSQL 16, Zod for validation, Vitest for tests.
- Do **not** add dependencies without calling them out and getting approval first. If a
  task seems to need one, list it separately and explain why.

## Conventions

- Layer strictly: routes (HTTP + Zod validation) → services (business logic) → Prisma.
  Routes never touch Prisma directly; services never touch Fastify request/reply objects.
- Throw typed domain errors (`NotFoundError`, `ConflictError`) from services; let the
  central Fastify error handler map them (and Prisma `P2002`/`P2025`) to HTTP codes.
- IDs are ULIDs generated in application code via `lib/ids.newId()` — never rely on
  database-side id generation or Prisma `@default`.
- Tests use a `.test.ts` suffix and sit next to the unit under test. Route tests use
  Fastify `app.inject()`; integration tests run against a real PostgreSQL test database.

## Learnings from module 1 (things to do better next time)

- Quiet Prisma logging when `NODE_ENV=test` — expected constraint-violation tests
  otherwise print alarming `prisma:error` blocks on a passing run.
- Don't default a service to `PORT=3000`; it collides with other local apps. Pick a less
  common default and make the port easy to override via env.
- A shared `test/` helper folder (e.g. a DB-reset helper) is needed as soon as more than
  one integration test exists — plan for it rather than deferring.

## Local infrastructure

- The Config API Service uses a dedicated PostgreSQL 16 Docker container
  (`config-service-pg`) on host port **5435** (5432–5434 are used by other projects).
  Databases: `config_service` (dev) and `config_service_test` (tests).
