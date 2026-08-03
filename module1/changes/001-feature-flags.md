# 001 — Per-application feature flags

> As an application developer, I want feature flags per application, so that I
> can enable or disable functionality without deploying code changes.

**Notes:** ABOUT.md has listed this as *known to be coming* since Module 2 — a
`Flag` model related to `Application` — and `prisma/schema.prisma` carries a
commented extension point for it. The shape follows `Configuration` exactly:
ULID primary key, `applicationId` FK with `ON DELETE CASCADE`, and `name` unique
*per application* rather than globally. The value is a plain boolean, not opaque
`jsonb` — a flag that is neither on nor off is not a flag.

## Acceptance criteria

Each is one task, roughly one commit, and goes through all four stages before
the next one starts.

### 1. Create a flag

- **Given** a registered Application
- **When** `POST /api/v1/flags` is sent `{ applicationId, name, enabled }`
- **Then** the flag is stored with a generated ULID and returned with `201`; a
  second flag with the same `name` for the same Application is rejected with
  `409`, while the same `name` under a different Application succeeds
- **Status:** ❌ not started

### 2. Read an Application's flags

- **Given** an Application with flags
- **When** `GET /api/v1/applications/:id/flags` is requested
- **Then** its flags come back in creation order; an Application with no flags
  returns an empty list, and an unknown Application id returns `404` rather
  than an empty list
- **Status:** ❌ not started

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

**Task:** none yet · **Stage:** not started

### PLAN

### BUILD & ASSESS

### REFLECT & ADAPT

### COMMIT & PICK NEXT

## Future tasks

- **`GET /api/v1/flags/:id`** — `Configuration` has a single-read endpoint and
  symmetry argues for one, but nothing needs it yet: the UI reads the list.
  Decide when task 2 lands rather than speculatively.
- **Update ABOUT.md when task 1 starts.** It currently says feature flags are
  *known to be coming* and "do not build it yet". That line becomes false the
  moment this work item moves, and a context file that lies is worse than one
  that is silent.

## Out of scope

Stated here so it does not get argued per task:

- **No `DELETE`.** The API has no delete endpoints at all, by choice, while
  there is no authentication. Flags do not get to be the exception.
- **No targeting, no rollout percentages, no per-user flags.** A flag is on or
  off for an Application. Anything else is a different product.
- **No authentication.** Still explicitly out of scope project-wide.
