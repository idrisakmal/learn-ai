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
- **Status:** ✅ complete

### 3. Toggle a flag

- **Given** an existing flag with `enabled: true`
- **When** `PUT /api/v1/flags/:id` is sent `{ enabled: false }`
- **Then** only `enabled` changes — `name` and `applicationId` are untouched,
  matching the partial-`PUT` semantics the rest of the API already uses — and
  an unknown flag id returns `404`
- **Status:** 🔄 in progress

### 4. Toggle a flag from the Admin UI

- **Given** the Admin UI showing an Application
- **When** the administrator toggles one of its flags
- **Then** the change is sent to the API and the row is rebuilt from the
  response, so a rejected write never leaves the UI showing a value the service
  did not accept
- **Status:** ❌ not started

<!-- Status values: ❌ not started · 🔄 in progress · ✅ complete -->

## Current task

**Task:** 3 — toggle a flag · **Stage:** PLAN

### PLAN

**Decision: `PUT /flags/:id` accepts `name` as well as `enabled`.** The open
question from *Future tasks* is settled. Both fields are optional and the body
must carry at least one, exactly like `updateApplicationSchema` and
`updateConfigurationSchema` — an integrating developer learns partial-`PUT`
once and it holds for every resource. The cost is a rename path nothing calls
yet, and the 409 that comes with it; the criterion's "`name` untouched" is
satisfied by absence, not by prohibition.

`applicationId` is **not** accepted. Moving a flag to another application is not
a toggle, and it would need a parent-exists check plus a fresh uniqueness check
in the destination.

#### Test strategy

`flag.service.test.ts` — new `describe('updateFlag')`:

| Case | Asserts |
|---|---|
| `{ enabled: false }` on an enabled flag | returns `enabled: false`; `name` and `applicationId` unchanged — the criterion |
| `{ name: 'renamed' }` only | `name` changes, `enabled` untouched — the absence rule in the other direction |
| unknown id | `NotFoundError` |
| rename onto a sibling's name | `ConflictError` |
| rename onto a name used under a *different* application | succeeds — the constraint is still the compound `(applicationId, name)` on the update path |

The `enabled: false` case is the one that will be got wrong. A truthiness spread
(`...(input.enabled ? { enabled: input.enabled } : {})`) silently refuses to turn
a flag off while every other test stays green; only `!== undefined` is correct.
This is the same trap task 1 guarded against on create.

`flag.routes.test.ts` — new `describe`, all via `app.inject()`:

| Request | Status |
|---|---|
| `PUT /api/v1/flags/:id` `{ enabled: false }` | 200, body shows the new value |
| unknown id | 404 |
| `{}` | 400 — `.refine()` rejects an empty body |
| `{ enabled: 'yes' }` | 400 |
| rename onto a taken name | 409, message names the flag (so it came from the service, not the central P2002 net) |

#### Files

| File | Change |
|---|---|
| `src/flags/flag.schema.ts` | add `updateFlagSchema` + `UpdateFlagInput`, and `idParamSchema` — each resource defines its own, as `application.schema.ts` and `configuration.schema.ts` already do |
| `src/flags/flag.service.ts` | add `updateFlag(id, input)`; spread only fields that are `!== undefined`; catch `P2025` → `NotFoundError`, otherwise rethrow through the existing `mapUniqueNameError` — the same shape as `updateConfiguration` |
| `src/flags/flag.routes.ts` | add `app.put('/flags/:id')` → parse params, parse body, call the service, `200` |
| `src/flags/flag.service.test.ts` | the five service cases above |
| `src/flags/flag.routes.test.ts` | the five route cases above |

No migration — the `Flag` model is unchanged. No `app.ts` change; `flagRoutes` is
already registered. No new dependencies.

#### Not in this task

- **No `GET /flags/:id`.** Nothing asks for it; flags are read through
  `GET /applications/:id/flags`.
- **No `DELETE`.** Out of scope project-wide.
- **No UI.** That is task 4, along with its seed prerequisite.
- **No `updatedAt` assertions.** Prisma maintains it; testing the ORM is not the
  job.

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
