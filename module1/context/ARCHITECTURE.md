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
       │ HTTP (browser, :5173)                │ HTTP
       ▼                                      │
  ┌──────────────┐   /api/v1  (Vite proxy)    │
  │  Admin UI    │ ──────────────────┐        │
  │  Vite+React  │                   │        │
  │  :5173       │                   ▼        ▼
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

The Admin UI is a separate application with its own build and its own test
suite. It is a **pure client of the public API** — it shares no code with the
service, holds no database connection, and knows nothing the API does not tell
it. That means the service can be exercised without the UI, and the UI can be
tested without a database.

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
- **Nested reads live under the parent.** `GET /applications/:id/configurations`
  returns an application's full Configurations in one request, so clients never
  have to follow `configurationIds` with a request per id. It 404s when the
  application does not exist and returns `[]` when it simply has none — the two
  cases are distinguishable. The route is registered in `application.routes.ts`
  (all `/applications/*` paths in one place) while the query lives in
  `configuration.service.ts` (all Configuration data access in one place); a
  route may call another resource's service, since that is still routes →
  services.
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

## Admin UI shape

Master–detail on one screen: Applications on the left, the selected
Application's Configurations on the right. There is no router — the whole UI is
one view, and a URL scheme would be structure with nothing to hold.

```
App                      owns the selected application id
 ├─ ApplicationList      GET /applications
 └─ ConfigurationPanel   GET /applications/:id/configurations   (keyed by id)
     └─ ConfigurationCard × n   PUT /configurations/:id
```

Decisions worth knowing:

- **State lives in the component that owns it; there is no store.** `App` holds
  the selected id, each `ConfigurationCard` holds its own draft. Nothing is
  shared, so nothing needs lifting. A store would be pure ceremony at this size
  and is the first thing to reach for if the UI ever grows a second screen.
- **`ConfigurationPanel` is keyed by application id.** Switching applications
  remounts the subtree, which discards every in-progress edit rather than
  carrying a half-typed value onto a different application's configuration.
  Losing an unsaved edit on an explicit navigation is the safer failure.
- **Each card saves independently.** There is no page-level save, so one
  configuration failing to save cannot block or silently roll back another.
- **The response is the source of truth after a write.** A saved card rebuilds
  its rows from the `PUT` response, so anything the service normalised shows up
  immediately instead of drifting until the next reload.
- **No polling, no cache, no optimistic updates.** Data is fetched on mount and
  on explicit retry. With one administrator and no concurrent writers, staleness
  is not a problem worth infrastructure. Optimistic updates were specifically
  rejected: showing a value as saved when it was not is worse than a brief wait.
- **The UI reads nothing but the public API.** No shared types package between
  service and UI — `ui/src/api/types.ts` is a hand-written mirror of the wire
  format. The cost is that a service response change will not break the UI's
  build; it will surface at runtime. Accepted for now, and the reason the extra
  credit client library is interesting.

## UI testing strategy

The mirror image of the service's stance. The service tests against a **real
database and no mocks**; the UI tests against a **mocked API client and no
network**.

The seam is `api/client.ts`. Everything above it — loading states, validation,
dirty tracking, error rendering — is tested through the rendered DOM with
Testing Library. `client.ts` itself is tested separately by stubbing `fetch`,
which is where the `{ error, message }` contract and the URL shapes are pinned.

What this buys: the suite is fast, needs no database, and `make ui-test` runs
from cold. What it costs: **nothing verifies that the mocked shapes still match
what the service actually sends.** That gap is real and currently covered only
by running both together. An end-to-end test would close it and does not exist.

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
| UI state in components, no store | Nothing is shared, so nothing needs lifting | Would need rework if a second screen arrives |
| Typed value rows over a JSON textarea | Editing one value is one field, not hand-edited JSON | More UI code; nested values still fall back to raw JSON |
| Hand-written wire types in the UI | No build coupling between the two apps | A response change breaks at runtime, not at compile time |
| UI tested against a mocked client | Fast, no database, runs from cold | Nothing checks the mocks still match the real service |

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

- No pagination on `GET /applications` or `GET /applications/:id/configurations`.
  Fine at current scale, wrong eventually. The nested route is where pagination
  should land first.
- No authentication or authorisation anywhere. See ABOUT.md for what that
  implies about storing secrets.
- Prisma `P2003` (foreign-key violation) is not mapped by the central error
  handler and would surface as a 500.
- No health-check endpoint, no structured request-id logging.
- **No end-to-end test.** Nothing exercises the UI against the real service, so
  a change to a response shape would pass both suites and break the screen.
- The UI cannot add or rename a config key, only change the values of keys that
  already exist. Adding one means `POST /configurations` or editing the payload
  elsewhere. Deliberate for now — it keeps the UI inside the fixed scope.
- The UI has no build for anything but local development. `ui-build` produces a
  static bundle, but nothing serves it, and served from another origin it would
  need CORS on the service.
