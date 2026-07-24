# Config Service — Specifications & Prompt Request

This document contains the details necessary to create a **prompt**, which will later be
used to create an implementation plan for a REST Web API. Please review the contents of
this file and recommend a PROMPT that can be sent to an AI coding assistant for help with
creating an implementation plan for this service.

The prompt should:

- ask the assistant to create a comprehensive plan that includes dependencies,
  file/folder structure, and architectural patterns.
- recommend strict adherence to ALL of the details in this document, including the
  SPECIFIC version numbers listed below.
- strongly encourage the assistant NOT to add any additional dependencies without
  approval.
- encourage the assistant to ask for more information if anything is unclear or missing.

---

## Tech Stack

| Area                | Choice        | Version   |
|---------------------|---------------|-----------|
| Language            | TypeScript    | 5.x       |
| Runtime             | Node.js       | 22 LTS    |
| Web framework       | Fastify       | 5.x       |
| Validation          | Zod           | 3.x       |
| ORM / data access   | Prisma        | 6.x       |
| Database engine     | PostgreSQL    | 16        |
| Testing framework   | Vitest        | 3.x       |
| Package manager     | Bun           | 1.x       |

Pin these versions in `package.json`. Do not introduce additional runtime or dev
dependencies without asking first.

## Data Models

**Application**
Prisma model: `Application` (table `applications`)
Fields:
  - `id`: primary key, ULID stored as a string, generated in application code
  - `name`: string (max 256), unique
  - `comments`: string (max 1024), optional
  - `createdAt` / `updatedAt`: timestamps managed by Prisma

**Configuration**
Prisma model: `Configuration` (table `configurations`)
Fields:
  - `id`: primary key, ULID stored as a string, generated in application code
  - `applicationId`: foreign key -> `applications.id`
  - `name`: string (max 256), unique per application (compound unique with `applicationId`)
  - `comments`: string (max 1024), optional
  - `config`: JSON object of name/value pairs, stored as `Json` (PostgreSQL `jsonb`)
  - `createdAt` / `updatedAt`: timestamps managed by Prisma

> **Looking ahead (Module 3):** a future `Flag` model will hold per-application feature
> flags with a foreign key back to `applications`. Design the schema and relations so this
> is a clean addition — do not build it now, but don't paint us into a corner.

## API Endpoints

All endpoints prefixed with `/api/v1`.

**Applications**
  - `POST   /applications`        — create an application
  - `PUT    /applications/{id}`   — update an application
  - `GET    /applications/{id}`   — fetch one, including the ids of all related configurations
  - `GET    /applications`        — list all applications

**Configurations**
  - `POST   /configurations`      — create a configuration
  - `PUT    /configurations/{id}` — update a configuration
  - `GET    /configurations/{id}` — fetch one configuration

Request and response bodies are JSON. Validate every request body and path/query param
with Zod before it reaches the data layer. Return appropriate HTTP status codes
(201 on create, 200 on read/update, 404 when not found, 400 on validation failure,
409 on unique-constraint conflicts).

## Data Persistence

- Use **Prisma** as the ORM. No raw SQL except where Prisma genuinely cannot express a query.
- A single Prisma schema at `prisma/schema.prisma`.
- Use **Prisma Migrate** for schema migrations (`prisma migrate dev` in development,
  `prisma migrate deploy` for production). Migration files are committed to the repo.
- ULIDs are generated in application code (via the `ulid` package) and passed to Prisma —
  do NOT rely on database-side id generation.
- The database connection string comes from the environment; never hard-code it.

## Automated Testing

- Every source module that contains logic MUST have an associated test file focusing on
  the ~80% most important scenarios for that module. Trivial files (pure type
  definitions, barrel/index re-exports) are exempt.
- Test files use a `.test.ts` suffix and live next to the unit under test.
- Prefer Fastify's `app.inject()` for HTTP-level route tests — no network listener needed.
- If a shared `test/` folder becomes necessary, it should hold only test helpers, shared
  mocks, and/or integration tests. Do not create it until it is needed.
- Integration tests run against a real PostgreSQL database, not mocks.

## Service Configuration

- Store environment variables in a `.env` file (database URL, log level, port, etc.).
- Parse and validate environment variables at startup with a Zod schema; fail fast with a
  clear error if anything required is missing or malformed.
- Provide a `.env.example` documenting every variable. `.env` is git-ignored.

## Developer Experience

- Use **Bun** for dependency management (`bun install`, `bun add`) and script running
  (`bun run <script>`). Do not use npm, yarn, or pnpm. Note: Bun is the package manager
  only — the application itself runs on **Node.js**, not the Bun runtime.
- Provide `package.json` scripts for the common tasks: `dev`, `build`, `start`, `test`,
  `migrate`, and `lint`.
- Include a `.gitignore` appropriate for a Node/TypeScript/Prisma project
  (`node_modules`, `.env`, build output, etc.).
- Structure the code so routes, business logic, and data access are separated
  (e.g. routes -> services -> Prisma), not all crammed into route handlers.

## Authentication

Out of scope for now. This is a future feature — do not plan for it yet.
