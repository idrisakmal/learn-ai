# Prompt: Create an Implementation Plan for the Config API Service

> The instructions at the top of this file are for a human. Copy everything under
> **"Prompt to send"** into your AI coding assistant (in plan mode) to generate the
> implementation plan. The specification it refers to lives in `1-web-api-specs.md`.

---

## Prompt to send

You are a senior backend engineer. I need a **comprehensive implementation plan** (not code
yet) for a REST Web API called the **Config API Service**. The full specification is in
`prompts/1-web-api-specs.md` — read it carefully and treat it as the source of truth.

**Ground rules — follow these strictly:**

1. **Adhere to every detail in `1-web-api-specs.md`**, including the exact technology
   choices and the specific version constraints listed in the Tech Stack table. Do not
   substitute a different framework, database, ORM, test runner, or package manager.
2. **Do not add any dependencies** — runtime or dev — beyond those named in the spec
   without explicitly calling them out and asking for my approval first. If something in
   the spec genuinely cannot be built without an extra library, list it separately under a
   "Dependencies needing approval" heading and explain why.
3. Honour the runtime split: the application runs on **Node.js**; **Bun is the package
   manager only**. Do not assume the Bun runtime, `bun test`, or Bun-native APIs.
4. **Ask me for clarification** on anything ambiguous, underspecified, or contradictory
   rather than guessing. List your open questions at the end.

**The plan must include:**

- **Dependencies** — the complete `package.json` dependency and devDependency lists with
  pinned versions matching the spec, plus a one-line justification for each.
- **File and folder structure** — a full directory tree with a short note on the
  responsibility of each significant file/folder. Reflect the layered separation the spec
  asks for (routes → services → data access via Prisma).
- **Data layer** — the Prisma schema (`Application` and `Configuration` models, relations,
  the compound unique on configuration name per application, `jsonb` config field,
  ULID string ids generated in app code). Explain the migration workflow with Prisma
  Migrate. Note where the future `Flag` model will slot in without building it.
- **API layer** — every endpoint under `/api/v1`, with request/response payload shapes,
  Zod validation schemas, and the HTTP status codes for success and each error case
  (validation, not-found, unique conflict).
- **Configuration & environment** — how env vars are loaded and validated at startup
  (fail-fast), and the contents of `.env.example`.
- **Testing strategy** — how unit and integration tests are organised (`.test.ts` next to
  each unit, Fastify `app.inject()` for route tests, real PostgreSQL for integration),
  and what the ~80%-most-important scenarios are per module.
- **Architectural patterns & conventions** — error handling, the request lifecycle, how
  services depend on the Prisma client, and any cross-cutting concerns (logging, id
  generation).
- **Developer experience** — the `package.json` scripts (`dev`, `build`, `start`, `test`,
  `migrate`, `lint`), the `.gitignore`, and how a developer runs the service locally
  against PostgreSQL for the first time.

**Format:** Present the plan as a structured Markdown document with clear headings so it
can be saved and executed step by step. End with (a) any assumptions you made and (b) your
open questions for me.
