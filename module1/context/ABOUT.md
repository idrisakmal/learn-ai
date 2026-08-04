<!--
MAINTENANCE NOTE (for humans and assistants)

This file orients a reader who knows nothing about the project, in under two
minutes. It informs PRIORITY, DESIGN, and QUALITY decisions. It is not a spec,
an API reference, or a changelog.

When updating:
  - Terse. Statements, not paragraphs. If a line is not actionable, cut it.
  - Say what is TRUE now. Mark anything speculative as speculative.
  - Do not duplicate ARCHITECTURE.md or IMPLEMENTATION.md. No stack details,
    no file layout, no code conventions.
  - Domain concepts are verified against prisma/schema.prisma and the routes.
    If they drift, the code wins and this file gets corrected.
-->

# Config API Service

A centralized configuration service: one source of truth for configuration
shared across all applications in the company. Administrators manage
configuration through a web UI; applications read what they need through the
API.

## Why this exists

Most applications have no admin interface of their own. Today, changing an
application's configuration means an administrator editing rows directly in
that application's database — manual, unaudited, and requiring database access
to do routine work.

This service replaces that. Administrators change configuration in one place,
and applications fetch their own configuration from the API at runtime.

## Who it's for

- **Administrator** — manages configuration for every application from the
  admin UI. The only human who writes. Day-to-day use.
- **Consuming application** — a running service or client app reading its own
  configuration from the API. Not a person. Highest volume by far, so reads
  must stay cheap and predictable.
- **Integrating developer** — registers a new application and wires it up to
  read configuration. Occasional, but they are the first to hit the API and the
  first to be confused by it. API ergonomics matter to this persona.

## Domain concepts

- **Application** — a registered consumer of the service. Has a unique `name`
  and optional `comments`. Owns zero or more Configurations.
- **Configuration** — a named bundle of settings belonging to one Application.
  `name` is unique *within* an Application, not globally.
- **Environment** — by convention, a Configuration's `name` is the environment
  it applies to: `production`, `staging`, `development`. This is a convention
  only; the schema does not enforce it and nothing prevents other names.
  Because `name` is unique per Application, an Application has at most one
  Configuration per environment.
- **Flag** — a named on/off switch belonging to one Application, so behaviour
  can be turned on or off without a deploy. `name` is unique *within* an
  Application, as with Configuration, and the value is a plain boolean —
  a flag is on or off, nothing else.
- **config** — the payload of a Configuration: an arbitrary JSON object of
  name/value pairs, stored as PostgreSQL `jsonb`. Shape is not validated or
  size-capped; that was a deliberate Module 1 decision.
- **ULID** — the identifier format for every record. Generated in application
  code, never by the database.

## Scope

### In scope now

- CRUD for Applications and Configurations over a versioned REST API.
- An admin web UI to list Applications, view an Application's Configurations,
  and update a configuration value.
- Per-application feature flags. Being built now — see
  `changes/001-feature-flags.md` for which parts exist.

### Explicitly out of scope

- **Authentication and authorisation.** Deferred, not forgotten. Do not add it,
  and do not design around it speculatively.
- Deleting Applications or Configurations. No DELETE endpoints exist by choice.
- Validating or constraining the shape or size of a `config` payload.

## Priorities and quality bar

Ranked. Use this to break ties.

1. **The admin UI is easy to use.** It is the primary human surface. If it is
   awkward, the service does not get used.
2. **Start small.** Prefer the smallest thing that works over the general
   solution. Scope creep is the main risk to this project.
3. **Do not foreclose scale.** Design should not make growth impossible — but
   do not build for scale that does not exist yet.

Quality bar: a learning project built *as if* deployable. Real database,
migrations committed, tests required. It is not serving real traffic or real
data.

## Constraints

- Local development only. Single PostgreSQL 16 container on host port 5435.
- **No authentication exists, and `config` accepts arbitrary JSON. Nothing
  sensitive — secrets, credentials, tokens — belongs in a config payload.**
  Do not suggest storing them there.
