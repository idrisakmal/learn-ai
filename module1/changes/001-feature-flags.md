# 001 — Per-application feature flags

> As an application developer, I want feature flags per application, so that I
> can enable or disable functionality without deploying code changes.

**Notes:** The `Flag` model exists as of task 1 — ULID primary key,
`applicationId` FK with `ON DELETE CASCADE`, and `name` unique *per application*
rather than globally, following `Configuration`. It carries no `comments` column
and no default for `enabled`. The value is a plain boolean, not opaque `jsonb` —
a flag that is neither on nor off is not a flag.

## Acceptance criteria

Each is one task, roughly one commit, and goes through all four stages before
the next one starts.

### 1. Create a flag

- **Given** a registered Application
- **When** `POST /api/v1/flags` is sent `{ applicationId, name, enabled }`
- **Then** the flag is stored with a generated ULID and returned with `201`; a
  second flag with the same `name` for the same Application is rejected with
  `409`, while the same `name` under a different Application succeeds
- **Status:** ✅ complete

### 2. Read an Application's flags

- **Given** an Application with flags
- **When** `GET /api/v1/applications/:id/flags` is requested
- **Then** its flags come back in creation order; an Application with no flags
  returns an empty list, and an unknown Application id returns `404` rather
  than an empty list
- **Status:** 🔄 in progress

### 3. Toggle a flag

- **Given** an existing flag with `enabled: true`
- **When** `PUT /api/v1/flags/:id` is sent `{ enabled: false }`
- **Then** only `enabled` changes — `name` and `applicationId` are untouched,
  matching the partial-`PUT` semantics the rest of the API already uses — and
  an unknown flag id returns `404`
- **Status:** ❌ not started

### 4. Toggle a flag from the Admin UI

- **Given** the Admin UI showing an Application
- **When** the administrator toggles one of its flags
- **Then** the change is sent to the API and the row is rebuilt from the
  response, so a rejected write never leaves the UI showing a value the service
  did not accept
- **Status:** ❌ not started

<!-- Status values: ❌ not started · 🔄 in progress · ✅ complete -->

## Current task

**Task:** 2 — read an Application's flags · **Stage:** PLAN

### PLAN

#### Shape

`GET /api/v1/applications/:id/flags`, the exact mirror of the Configuration
nested read. ARCHITECTURE.md already settled where the pieces live: the route is
registered in `application.routes.ts`, so every `/applications/*` path stays in
one file, while the query lives in `flag.service.ts`, so all Flag data access
stays in one file. A route calling another resource's service is still
routes → services.

The Application-exists check is what makes `404` distinguishable from `[]`, and
it belongs in the service — the route must not learn to tell the two apart.

#### Three decisions this task was told to make — all now settled

**1. Order by `createdAt: 'asc'`, matching Configuration.** `id: 'asc'` was the
alternative and is strictly more robust: ULIDs sort chronologically by design —
ARCHITECTURE.md names that as a *reason they were chosen* — whereas `createdAt`
is `TIMESTAMP(3)`, so two flags written inside one millisecond tie and come back
in whatever order PostgreSQL picks. Consistency won: two sibling endpoints
ordering differently for no stated reason costs more than a tie needing two
writes in the same millisecond. Switching would have to change *both* services,
which is its own task, not a divergence smuggled in here.

**2. `GET /api/v1/flags/:id` — no.** Decided against, not deferred again. The UI
reads the list and nothing else reads a single flag; symmetry with Configuration
was never a requirement. Note deleted from *Future tasks*.

**3. `flagIds` on `GET /api/v1/applications/:id` — no.** Same reasoning, and
this endpoint returns the full flags in one request, which is precisely what
`configurationIds` forces a client to work around. Note deleted.

#### One cleanup, deliberately in scope

Four functions now open with the same six lines — look the Application up by id,
`select: { id: true }`, throw `NotFoundError` if absent: `createConfiguration`,
`listConfigurationsByApplication`, `createFlag`, and `listFlagsByApplication`
once written. This task writes the fourth copy, which is the moment to stop.

Extract `assertApplicationExists(id)` into `application.service.ts` and import it
from the other two services. That is a **service → service** import, which the
codebase has not done before — routes already reach across resources, but
services have not. It is the same direction of dependency and introduces no
cycle, and if adopted it needs a line in ARCHITECTURE.md's layering section.

**This is the one part of the plan that touches code outside `flags/`.** Agreed
as in scope: the alternative is four copies and a fifth waiting.

#### Test strategy

**`flag.service.test.ts`** — a new `describe('listFlagsByApplication')` block
mirroring the Configuration one:

| Case | Asserts |
|---|---|
| Returns an application's flags, oldest first | order is creation order, and records are full (`enabled` present, not just ids) |
| Excludes another application's flags | length 1, `applicationId` matches |
| Application with no flags | `[]` |
| Unknown application id | throws `NotFoundError` |

**`application.routes.test.ts`** — beside the three existing nested-configuration
tests, in the file that owns `/applications/*` routes:

| Case | Expects |
|---|---|
| `GET /applications/:id/flags` with flags | `200`, full flag objects in creation order |
| Application with no flags | `200` and `[]` |
| Unknown application id | `404` |

The empty-list and unknown-id cases are the criterion's real content — a service
that returned `[]` for both would pass a naive happy-path test and lose the
distinction the criterion exists to protect.

If the cleanup is adopted, the existing Configuration tests are the regression
net for it; no new tests are needed for the extraction itself.

#### File changes

| File | Layer | Change |
|---|---|---|
| `src/flags/flag.service.ts` | service | Add `listFlagsByApplication()` |
| `src/applications/application.routes.ts` | route | Register `GET /applications/:id/flags` |
| `src/flags/flag.service.test.ts` | tests | The four service cases above |
| `src/applications/application.routes.test.ts` | tests | The three route cases above |
| `src/applications/application.service.ts` | service | *(cleanup)* Export `assertApplicationExists()` |
| `src/configurations/configuration.service.ts` | service | *(cleanup)* Use it in two functions |
| `context/ARCHITECTURE.md` | docs | *(cleanup)* Note that services may call a peer service |

No schema change, no migration. `ABOUT.md` and `IMPLEMENTATION.md` need nothing —
the resource and its conventions already exist.

#### Not in this task

- `PUT /api/v1/flags/:id` — task 3. `flag.schema.ts` gains no `idParamSchema`
  here; this route's id is an *Application* id and `application.schema.ts`
  already has one.
- Anything in `ui/` — task 4.
- Demo flags in `prisma/seed.ts` — still task 4's prerequisite.
- Pagination. ARCHITECTURE.md lists the nested reads as where pagination should
  land first; nothing has enough flags for it to matter, and adding it to one
  nested read and not the other would be worse than neither.

### BUILD & ASSESS

### REFLECT & ADAPT

### COMMIT & PICK NEXT

## Future tasks

- **Demo flags in `prisma/seed.ts`** — a prerequisite of task 4, not an
  optional extra. The UI cannot create a flag, so an empty table leaves nothing
  to toggle. Upsert on `(applicationId, name)` like the rest of the seed.

## Out of scope

Stated here so it does not get argued per task:

- **No `DELETE`.** The API has no delete endpoints at all, by choice, while
  there is no authentication. Flags do not get to be the exception.
- **No targeting, no rollout percentages, no per-user flags.** A flag is on or
  off for an Application. Anything else is a different product.
- **No authentication.** Still explicitly out of scope project-wide.
