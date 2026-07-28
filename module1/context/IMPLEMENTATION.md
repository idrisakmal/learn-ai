<!--
MAINTENANCE NOTE (for humans and assistants)

How code gets written here: stack, conventions, and the specific mistakes an
assistant makes without this file. Read it before writing or changing code.

When updating:
  - Every rule must be checkable against real source. Cite the file.
  - Prefer a good/bad pair over a paragraph of prose.
  - If a rule and the code disagree, the code wins and this file is corrected.
  - Project purpose and scope live in ABOUT.md. Do not restate them here.

Sections marked PLANNED describe work not yet built. Do not present them as
existing code.
-->

# Implementation

## Stack

Versions are pinned in `config-service/package.json`. Do not bump them casually.

| Area | Choice | Version |
|---|---|---|
| Language | TypeScript | 5.7 |
| Runtime | Node.js | >= 22 (dev machine runs 24) |
| Web framework | Fastify | 5.2 |
| Validation | Zod | 3.24 |
| ORM | Prisma | 6.2 |
| Database | PostgreSQL | 16 |
| Tests | Vitest | 3.0 |
| Lint | ESLint + typescript-eslint | 9.17 / 8.19 |
| Package manager | Bun | 1.x |

**Bun is the package manager only.** The application runs on Node.js. Never use
`bun test`, `bun run src/server.ts`, or Bun-native APIs. Install with
`bun install` / `bun add`; run scripts with `bun run <script>`.

**Do not add dependencies without asking first.** List the dependency, say what
it is for, and wait for approval.

## Running it

From `config-service/`:

| Command | Does |
|---|---|
| `bun run dev` | tsx watch, reads `.env` |
| `bun run build` | `tsc -p tsconfig.json` → `dist/` |
| `bun run start` | runs the built output on Node |
| `bun run test` | `vitest run` |
| `bun run migrate` | `prisma migrate dev` |
| `bun run lint` | `eslint .` |

- Service listens on **3999** locally (`.env`). PostgreSQL 16 runs in the
  `config-service-pg` Docker container on host port **5435**.
- Databases: `config_service` (dev), `config_service_test` (tests).

> **Known inconsistency:** `src/config/env.ts` and `.env.example` still default
> `PORT` to 3000, which collides with other local apps — the local `.env`
> overrides it to 3999. A fresh clone reproduces the collision. Worth fixing.

## Module system and imports

ESM throughout (`"type": "module"`, `module: NodeNext`).

**Relative imports must carry a `.js` extension, even though the source is
`.ts`.** This is the single most common mistake here.

```ts
// GOOD
import { prisma } from '../db/prisma.js';
import { newId } from '../lib/ids.js';

// BAD — fails at runtime under NodeNext
import { prisma } from '../db/prisma';
import { newId } from '../lib/ids.ts';
```

Package imports are unaffected: `import Fastify from 'fastify'`.

## Layout and naming

```
config-service/src/
  app.ts                  buildApp(): Fastify instance, no listen
  server.ts               entrypoint: listen + graceful shutdown
  config/env.ts           Zod-validated environment
  db/prisma.ts            single shared PrismaClient
  lib/errors.ts           domain error types
  lib/ids.ts              newId() → ULID
  test/helpers.ts         resetDb() and other shared test helpers
  <resource>/
    <resource>.routes.ts    HTTP layer
    <resource>.service.ts   business logic
    <resource>.schema.ts    Zod schemas + inferred types
    *.test.ts               colocated, next to the unit under test
```

A new resource gets its own folder with the same three files. Register its
routes in `app.ts` under the `/api/v1` prefix.

`app.ts` is deliberately separate from `server.ts` so tests can build an app and
call `app.inject()` without opening a port.

## Layering

**routes → services → Prisma.** Strictly one direction.

- Routes parse input with Zod, call the service, set the status code. Nothing else.
- Services hold the logic and throw domain errors. They never see `request` or
  `reply` and never set a status code.
- Only services touch `prisma`.

```ts
// GOOD — route stays thin (application.routes.ts)
app.post('/applications', async (request, reply) => {
  const body = createApplicationSchema.parse(request.body);
  const created = await createApplication(body);
  return reply.code(201).send(created);
});

// BAD — route reaches past the service into Prisma
app.post('/applications', async (request, reply) => {
  const created = await prisma.application.create({ data: request.body });
  return reply.code(201).send(created);
});

// BAD — service knows about HTTP
export async function createApplication(input, reply) {
  const created = await prisma.application.create({ ... });
  return reply.code(201).send(created);
}
```

## Validation

Zod schemas live in `<resource>.schema.ts` and export both the schema and its
inferred input type. Handlers call `.parse()` explicitly — Fastify's built-in
JSON-schema validation is **not** used.

```ts
export const createApplicationSchema = z.object({
  name: z.string().min(1).max(256),
  comments: z.string().max(1024).optional(),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
```

Field limits mirror the database columns: `name` max 256, `comments` max 1024.
Keep them in sync with `prisma/schema.prisma`.

A thrown `ZodError` is caught centrally and becomes a 400 — do not catch it in
the handler.

## Errors and HTTP mapping

Services throw the domain errors in `lib/errors.ts`. The single error handler in
`app.ts` maps everything:

| Thrown | Status | Response `error` |
|---|---|---|
| `ZodError` | 400 | `ValidationError` (plus `issues`) |
| `NotFoundError` | 404 | `NotFound` |
| `ConflictError` | 409 | `Conflict` |
| Prisma `P2002` | 409 | `Conflict` |
| Prisma `P2025` | 404 | `NotFound` |
| anything else | 500 | `InternalServerError` |

Response body is always `{ error, message }`, plus `issues` on validation
failures. Clients — including the Admin UI — can rely on that shape.

```ts
// GOOD — service throws, handler stays out of it
if (!application) throw new NotFoundError(`Application ${id} not found`);

// BAD — service formats an HTTP concern
if (!application) return reply.code(404).send({ error: 'NotFound' });
```

Prefer catching a Prisma error close to the query and rethrowing a domain error
with a useful message (see `mapUniqueNameError` in `application.service.ts`);
the central `P2002` → 409 mapping is the fallback, not the goal.

## IDs

ULIDs, generated in application code by `newId()` and passed to Prisma. The
database never generates ids — no `@default` on any `id` column. A ULID is 26
characters, which tests assert on.

## Update semantics

`PUT` is a **partial update**, not a replace. An empty body is rejected by
`.refine()` with a 400.

- Field absent (`undefined`) → leave the column untouched.
- Field explicitly `null` → clear the column (`comments` only; nullable fields).

```ts
// GOOD — absent fields are not written
data: {
  ...(input.name !== undefined ? { name: input.name } : {}),
  ...(input.comments !== undefined ? { comments: input.comments } : {}),
}

// BAD — wipes comments whenever the caller omits it
data: { name: input.name, comments: input.comments ?? null }
```

## Environment configuration

`config/env.ts` parses `process.env` with Zod once at import time, freezes the
result, and calls `process.exit(1)` with readable issues if anything is missing
or malformed. Fail fast — the service never starts half-configured.

Read config through the exported `env` object. Do not reach for `process.env`
elsewhere. Every variable must be documented in `.env.example`; `.env` is
git-ignored.

## Testing

- Vitest. Files use a `.test.ts` suffix and sit next to the unit under test.
- Route tests build the app and use `app.inject()` — no network listener.
- Integration tests run against a **real** PostgreSQL database
  (`config_service_test` on 5435), not mocks. Override with `TEST_DATABASE_URL`.
- `fileParallelism: false` — test files share tables and must not run concurrently.
- Call `resetDb()` from `test/helpers.ts` in `beforeEach`; it truncates
  `configurations` then `applications` with `CASCADE`.
- `globals: false` — import `describe`, `it`, `expect` from `vitest` explicitly.
- Cover roughly the 80% of scenarios that matter per module, including the error
  paths (400 / 404 / 409). Pure type files and barrel re-exports need no tests.

> **Known annoyance:** `db/prisma.ts` selects Prisma log levels from `LOG_LEVEL`
> but does not special-case `silent`, so `prisma:error` blocks still print
> during a passing test run. Noise, not failure.

## Lint and TypeScript

- ESLint flat config, `typescript-eslint` recommended.
- `strict: true`, plus `noUnusedLocals` and `noUnusedParameters`. Prefix
  intentionally unused bindings with `_` (`_request`, `_reply`).
- Tests are excluded from the build (`tsconfig.json` `exclude`), not from lint.
- No `any`. Use `unknown` and narrow, as `mapUniqueNameError` does.

## Admin UI — PLANNED

Not built yet. Decisions made up front so implementation does not drift:

- `ui/` sits beside `config-service/` inside `module1/`.
- **Vite + React + TypeScript.** Vitest for tests, matching the service.
- The UI talks to the API through a **Vite dev proxy**, not CORS:

```ts
// ui/vite.config.ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:3999', changeOrigin: true },
  },
}
```

  The UI therefore fetches same-origin `/api/v1/...`. **The service has no CORS
  middleware and does not need any** while development stays local. If the UI is
  ever served from a different origin, `@fastify/cors` becomes necessary — that
  is a new dependency and needs approval first.

- Scope is fixed: list Applications, view one Application's Configurations,
  update a configuration value. No create, no delete. See ABOUT.md.
- Error handling relies on the `{ error, message }` response shape above.
