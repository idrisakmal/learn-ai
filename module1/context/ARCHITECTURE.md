<!--
MAINTENANCE NOTE (for humans and assistants)

System shape and the reasoning behind it: components, data flow, boundaries,
and the decisions that would be expensive to reverse. Read before planning a
change; read before proposing a new endpoint, table, or layer.

When updating:
  - This file answers WHY and WHAT SHAPE. Coding rules live in IMPLEMENTATION.md;
    do not restate them here.
  - A decision without its trade-off is not documented. Record what was given up.
  - If the diagram and the code disagree, the code wins and this file is corrected.

Sections marked PLANNED describe work not yet built.
-->

# Architecture

## System shape

```
  Administrator                      Consuming application
       │                                      │
       │ HTTPS (browser)                      │ HTTP
       ▼                                      │
  ┌──────────────┐   /api/v1  (Vite proxy)    │
  │  Admin UI    │ ──────────────────┐        │
  │  PLANNED     │                   │        │
  │  Vite+React  │                   ▼        ▼
  └──────────────┘            ┌──────────────────────┐
                              │   Config API Service │
                              │   Fastify 5 / Node   │
                              │                      │
                              │  routes → services   │
                              │        → Prisma      │
                              └──────────┬───────────┘
                                         │ SQL
                                         ▼
                              ┌──────────────────────┐
                              │  PostgreSQL 16       │
                              │  container :5435     │
                              └──────────────────────┘
```

One service, one database, one process. No cache, no queue, no background
workers, no service-to-service calls. This is deliberate — see *Start small* in
ABOUT.md. Do not introduce infrastructure without a demonstrated need.

## Request lifecycle

```
HTTP request
  → Fastify router (prefix /api/v1)
  → route handler:  schema.parse(body | params)     ← Zod, throws on bad input
  → service:        business rules, domain errors
  → Prisma client:  single shared instance
  → PostgreSQL
  ← plain object returned up the stack
  ← route sets the status code and sends
```

The error path bypasses all of it: anything thrown anywhere lands in the single
`setErrorHandler` in `app.ts`, which is the *only* place that decides an HTTP
status code. Nothing below the route layer knows HTTP exists.

## Layering

Three layers, one direction, no exceptions: **routes → services → Prisma**.

The point is that services are HTTP-agnostic. They take plain input, return
plain data, and throw domain errors. That keeps two things cheap:

- Testing logic without constructing a request.
- Adding a second entry point later — a CLI, a job, a different transport —
  without touching business rules.

The cost: a small amount of ceremony for endpoints that are pure pass-through.
Accepted; the consistency is worth more than the saved lines.

`buildApp()` is separated from `server.ts` for the same reason. `app.ts`
assembles a fully-wired Fastify instance but never listens, so tests get the
real routing and error handling without a port.

## Data model

```
Application ──1───────< Configuration
  id (ULID, PK)          id (ULID, PK)
  name (unique)          applicationId (FK → applications.id, ON DELETE CASCADE)
  comments?              name          ─┐ unique together
  createdAt/updatedAt    comments?      │ with applicationId
                         config (jsonb) │
                         createdAt/updatedAt
```

Decisions worth knowing:

- **`config` is opaque `jsonb`.** The service stores and returns it without
  interpreting the shape. Zod validates only that it is a JSON object of
  name/value pairs — no key schema, no size limit. This is what makes the
  service usable by any application; it also means the service cannot warn a
  caller about a malformed config. Deliberate trade-off.
- **`name` is unique per Application, not globally.** Two applications may both
  have a Configuration named `production`. Enforced by the compound unique
  `(applicationId, name)`.
- **`ON DELETE CASCADE`** on the FK, so removing an Application takes its
  Configurations with it. Nothing exercises this today — there are no DELETE
  endpoints — but the constraint is in place for when there are.

## Identifiers

ULIDs, generated in application code, never by the database.

Chosen because they are lexicographically sortable by creation time (so
`ORDER BY id` is chronological), safe to expose in URLs, and available *before*
the insert — so the service never needs a round trip to learn the id it just
created. The cost over a `bigserial` is 26 bytes per key instead of 8, and no
database-side guarantee that an id was ever generated correctly.

## API design

Versioned under `/api/v1`. The prefix is applied once in `app.ts` by nesting
route registration, so resource modules stay unaware of it.

Decisions that shaped the surface:

- **`PUT` is a partial update, not a replace.** Chosen for ergonomics — the
  Admin UI can send just the changed field. Costs correctness against the HTTP
  spec, where `PATCH` is the right verb. Known and accepted.
- **No `DELETE` endpoints.** Nothing can be removed through the API. Keeps the
  destructive surface at zero while there is no authentication.
- **Payload shapes differ between list and single read.** `GET /applications`
  returns bare Applications; `GET /applications/:id` adds `configurationIds`.
  This keeps the list response small and predictable.
- **Referential integrity is checked in the service, not left to the database.**
  `createConfiguration` looks up the Application first and throws `NotFoundError`
  so the caller gets a 404 with a useful message rather than a foreign-key
  error. The check is not atomic with the insert — a concurrent delete could
  slip between them — but with no DELETE endpoints there is no way to trigger it
  today.

## Error handling

Domain errors (`NotFoundError`, `ConflictError`) are the contract between
services and the HTTP layer. Services throw; the central handler translates.

Prisma error codes are mapped centrally as a **safety net** (`P2002` → 409,
`P2025` → 404), but the preferred pattern is to catch close to the query and
rethrow a domain error carrying a message that names the actual conflict.
Compare the two 409s: the central net says `"Unique constraint violated"`, while
`mapUniqueNameError` says `"An application with name \"billing\" already
exists"`. The second is what a caller can act on.

Every response body is `{ error, message }`, plus `issues` on validation
failures. Clients depend on this shape.

## Persistence

- A **single shared `PrismaClient`** for the process, created once in
  `db/prisma.ts` and released on Fastify's `onClose` hook. Never construct a
  second client — connection pool exhaustion is the failure mode.
- **Prisma Migrate** owns the schema. Migration files are committed. No
  hand-written DDL outside migrations, and no `db push` against a database that
  matters.
- No repository layer between services and Prisma. Prisma *is* the data access
  layer. Adding another indirection would buy testability we get more cheaply by
  testing against a real database.

## Startup and configuration

`config/env.ts` parses the environment with Zod at import time, freezes the
result, and exits non-zero with readable issues if anything is wrong. The
service either starts correctly configured or does not start.

`server.ts` handles `SIGINT`/`SIGTERM` by closing the app, which triggers the
`onClose` hook and disconnects Prisma.

## Testing strategy

The architectural stance: **integration tests against real PostgreSQL, not
mocks.** Route tests build the app and use `app.inject()`, exercising real
routing, real Zod validation, the real error handler, and real SQL.

What this buys: constraint violations, cascade behaviour, and `jsonb`
round-tripping are all covered by tests that would pass vacuously against a
mock.

What it costs: a database is required to run the suite, and test files must run
serially (`fileParallelism: false`) because they share tables. Slower, and not
runnable in an environment without Postgres. Accepted deliberately.

## Key decisions

| Decision | Why | Given up |
|---|---|---|
| Fastify over Express | Native async, faster, first-class TypeScript types | Smaller ecosystem |
| Zod parsed explicitly in handlers | One validation system shared by env, routes, and inferred types | Fastify's built-in JSON-schema validation and its serialization speedup |
| Prisma, no repository layer | Type-safe queries, migrations included; extra indirection buys little | Harder to swap the ORM later |
| App-generated ULIDs | Sortable, URL-safe, known before insert | Larger keys; no DB-side guarantee |
| Opaque `jsonb` config | Any application can store any shape | Service cannot validate or explain a bad config |
| Real DB in tests | Catches constraint and JSON behaviour | Needs Postgres; serial test runs |
| Partial-update `PUT` | Simpler clients | Not HTTP-spec-correct; `PATCH` was the right verb |
| Vite dev proxy over CORS | Zero dependencies, nothing to misconfigure | Local development only |

## Extension points

- **Feature flags (Module 3).** A `Flag` model with a FK to `Application`,
  mirroring the Configuration relation. `prisma/schema.prisma` carries a
  commented stub, and `resetDb()` already truncates with `CASCADE` so it will
  cover the new table. Do not build it yet.
- **Authentication.** Nothing exists. When it arrives it belongs as a Fastify
  hook ahead of the route handlers, leaving services untouched.
- **Environments.** Currently a naming convention on `Configuration.name`, not a
  schema concept — see ABOUT.md. Promoting it to a real column would change the
  compound unique constraint and every existing row.

## Known gaps

- **No way to fetch an Application's Configurations in one request.** The only
  path is `GET /applications/:id` for the `configurationIds`, then one
  `GET /configurations/:id` per id — N+1 round trips. The PLANNED Admin UI needs
  exactly this view, so it will either fan out N requests or the API needs a
  `GET /applications/:id/configurations` endpoint. **Decide before building the
  UI.**
- No pagination on `GET /applications`. Fine at current scale, wrong eventually.
- No authentication or authorisation anywhere. See ABOUT.md for what that
  implies about storing secrets.
- Prisma `P2003` (foreign-key violation) is not mapped by the central error
  handler and would surface as a 500.
- No health-check endpoint, no structured request-id logging.
