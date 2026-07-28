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

Two applications live here: the service in `config-service/` and the Admin UI in
`ui/`. Unless a section says otherwise, it describes the service. Everything
specific to the UI is under *Admin UI* at the bottom.

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

**Use the Makefile.** It lives at the project root (`module1/`), and every target
is safe to run twice. `make help` lists them.

| Target | Does |
|---|---|
| `make setup` | Fresh machine: install both apps, start the database, migrate both databases |
| `make dev` | Run the service with reload |
| `make test` | Run the service suite (starts the database first if needed) |
| `make check` | What CI would run, both apps: lint, build, test |
| `make db-up` / `db-down` | Start / stop PostgreSQL; data is kept |
| `make db-shell` | `psql` against the development database |
| `make migrate` | New migration against the development database |
| `make migrate-test` | Apply existing migrations to the test database |
| `make seed` | Load demo data into the development database (safe to re-run) |
| `make db-reset` | **Destructive.** Drop and recreate both databases |
| `make ui-dev` | Run the Admin UI with reload |
| `make ui-test` | Run the UI suite (no database needed) |
| `make ui-check` | Lint, build, and test the UI |

Targets that need the database depend on `db-up`, so `make test` works from cold
on a machine where nothing is running.

**A fresh clone needs only Node 22+, Bun, and Docker.** `make setup` then does
everything: creates `.env` from `.env.example` (it is git-ignored, so a clone has
none), installs dependencies, generates the Prisma client, creates and starts the
PostgreSQL container, and migrates both databases. Verified by cloning the repo
and running it against a brand-new container: 45/45 tests pass.

Underneath, the package scripts in `config-service/package.json` are `dev`,
`build`, `start`, `test`, `migrate`, and `lint` — run them with `bun run <script>`
if you need one directly.

> After changing `prisma/schema.prisma`: `make migrate` updates the development
> database, but the **test database needs `make migrate-test` too**. Forgetting it
> makes tests fail against a stale schema.

> `make db-reset` fails while anything holds a connection — PostgreSQL will not
> drop a database in use. **Stop `make dev` first.**

### Demo data

`prisma/seed.ts` (`make seed`) fills the development database with two
Applications and three Configurations so the Admin UI has something to show on a
fresh machine. It is **not** test data: the suite builds its own fixtures and
truncates between cases, and the seed never touches `config_service_test`.

Every record is upserted on its natural key — `name` for an Application,
`(applicationId, name)` for a Configuration — so re-running restores the demo
values without creating duplicates. Keep it that way; a seed that only inserts
breaks the "every target is safe to run twice" rule the Makefile is built on.

The seeded values deliberately cover a string, a number, a boolean, and a nested
object, because that is what exercises the UI's per-kind value editor.

- Service listens on **3999**. That is the default in `config/env.ts`, not just
  a local override — deliberately not 3000, which collides with most other local
  dev servers. PostgreSQL 16 runs in the `config-service-pg` Docker container on
  host port **5435**.
- Databases: `config_service` (dev), `config_service_test` (tests).

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

**A passing run prints nothing.** `LOG_LEVEL=silent` disables Prisma logging
entirely (`resolvePrismaLogLevels` in `db/prisma.ts`), because Prisma reports
the expected constraint violations behind the 409 and 404 tests at `error`
level. If `prisma:error` blocks reappear on a green run, that helper regressed —
they are not normal.

## Lint and TypeScript

- ESLint flat config, `typescript-eslint` recommended.
- `strict: true`, plus `noUnusedLocals` and `noUnusedParameters`. Prefix
  intentionally unused bindings with `_` (`_request`, `_reply`).
- Tests are excluded from the build (`tsconfig.json` `exclude`), not from lint.
- No `any`. Use `unknown` and narrow, as `mapUniqueNameError` does.

## Admin UI

Built. Lives in `ui/`, beside `config-service/`. Scope is fixed and small: list
Applications, view one Application's Configurations, update a configuration
value. **No create, no delete** — see ABOUT.md before adding either.

### Stack

Versions are pinned in `ui/package.json`. Tooling majors deliberately match the
service so the two do not drift apart.

| Area | Choice | Version |
|---|---|---|
| Framework | React | 19.2 |
| Build | Vite | 6.4 |
| Language | TypeScript | 5.7 (same as the service) |
| Tests | Vitest + Testing Library | 3.2 / RTL 16 |
| DOM for tests | jsdom | 26 |
| Lint | ESLint + typescript-eslint + react-hooks | 9 / 8 / 5 |

**No state library, no router, no component library, no CSS framework.** One
screen does not justify any of them. All styling is `src/styles.css`, loose BEM.
The same rule as the service applies: **do not add dependencies without asking
first.**

### Running it

`make ui-dev` serves on **5173**, and `make dev` must be running in another
terminal or every request 502s. `make ui-test` needs no database — the tests
mock the API client. `make check` runs both apps.

### Talking to the API

The UI fetches same-origin `/api/v1/...` and the Vite dev proxy forwards it:

```ts
// ui/vite.config.ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:3999', changeOrigin: true },
  },
}
```

**The service has no CORS middleware and does not need any** while development
stays local. If the UI is ever served from a different origin, `@fastify/cors`
becomes necessary — a new dependency, so approval first.

`src/api/client.ts` is the only module that calls `fetch`. Components import
named functions from it and never build URLs themselves. Failures arrive as
`ApiError`, which carries the service's own `{ error, message }` through to the
screen; `status === 0` means the request never reached the service at all, and
`isNetworkError` is how that is distinguished from a real HTTP failure.

```ts
// GOOD — the component asks for data, the client owns the URL
const configurations = await listConfigurations(application.id);

// BAD — a URL, a version prefix, and error handling leaking into a component
const res = await fetch(`/api/v1/applications/${id}/configurations`);
```

### Imports — the `.js` rule does NOT apply here

The service's `.js`-extension rule comes from `module: NodeNext`. The UI uses
`moduleResolution: "bundler"` and Vite resolves extensions, so relative imports
carry **no extension**.

```ts
// GOOD — in ui/
import { listApplications } from './api/client';

// BAD — in ui/
import { listApplications } from './api/client.js';
```

### Layout

```
ui/src/
  main.tsx                    mounts <App> into #root
  App.tsx                     master–detail shell, owns the selected id
  styles.css                  the whole stylesheet
  api/
    client.ts                 every fetch call; ApiError
    types.ts                  wire types (dates are ISO strings, not Date)
  components/
    ApplicationList.tsx       the master pane
    ConfigurationPanel.tsx    one application's configurations
    ConfigurationCard.tsx     one configuration, editable; ConfigValueRow lives here
    ErrorNotice.tsx           the one way a failure is rendered
  lib/
    configValues.ts           config object <-> editable rows
    useAsync.ts               loading / error / ready, plus reload
  test/
    setup.ts                  jest-dom matchers and RTL cleanup
    factories.ts              anApplication() / aConfiguration()
  **/*.test.ts(x)             colocated, next to the unit under test
```

### Data loading

`useAsync` is the only loading pattern. It returns a three-state
`AsyncState<T>` — `loading | error | ready` — so a component renders exactly one
branch and an empty list can never be confused with a failure.

Its `load` argument **must be stable**, or the effect loops:

```ts
// GOOD
const load = useCallback(() => listConfigurations(application.id), [application.id]);
const { state, reload } = useAsync(load);

// BAD — a new function every render, so the effect never settles
const { state } = useAsync(() => listConfigurations(application.id));
```

### Editing a config

`config` is opaque `jsonb`, so the editor infers a kind per value and renders a
control to match: `string` and `number` get a text field, `boolean` a checkbox,
and anything else (objects, arrays, `null`) is edited as raw JSON.
`configValues.ts` owns both directions and is where a new kind would be added.

Rules that make the card behave:

- **`configFromRows` validates before anything is sent.** A row that does not
  parse produces a per-key message and the request is not made.
- **Numbers use `type="text"`, not `type="number"`.** A bad entry stays on
  screen to be corrected instead of silently becoming `""`.
- **The card holds `baseline` (last confirmed by the service) and `rows` (being
  edited).** Comparing them is what enables Save and Discard. On a successful
  save, both are replaced from the **response**, not from local state.
- **A failed save keeps the edit** so it can be retried rather than retyped.
- `PUT` is a partial update, so the UI sends only `{ config }` and never
  disturbs `name` or `comments`.

### Testing

- Vitest with `environment: 'jsdom'` and `globals: false`, matching the service.
  Because globals are off, RTL's automatic cleanup never registers itself —
  `src/test/setup.ts` calls `cleanup()` in an explicit `afterEach`. Do not
  remove it; without it, tests leak DOM into each other.
- Component tests mock `api/client` with `vi.mock` and `importOriginal`, keeping
  the real `ApiError` class so `instanceof` checks still work.
- Build fixtures with the factories in `test/factories.ts` and override only the
  field under test.
- Query by role and label, not by class name. Every value row has a `<label>`
  bound to its input, so `getByLabelText('timeoutMs')` is the way to reach it.
- Cover the states a real screen reaches: loading, empty, service unreachable,
  service rejected the write, and the happy path.
