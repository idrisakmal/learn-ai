# Module 1 — Collaboration Journal

A record of how the Config API Service was built with AI assistance: what we asked,
how, and what we learned.

Stack chosen: **TypeScript / Node.js 22 / Fastify 5 / Prisma 6 / PostgreSQL 16 / Vitest**,
with **Bun as the package manager only** (the app runs on Node).

---

## Entry 1 — Create the prompt (specs → prompt)

- **Prompt:** Read `@/prompts/1-web-api-specs.md` and follow the instructions at the top of the file.
- **Tool:** Claude Code
- **Mode:** Plan-style (produce an artifact, no service code)
- **Context:** Clean
- **Model:** Claude Opus 4.8
- **Input:** `prompts/1-web-api-specs.md`
- **Output:** `prompts/2-web-api-prompt.md`
- **Cost:** [enter after the run completes]
- **Reflections:**
  - The spec's meta-instruction header (four bullets) mapped cleanly onto the generated
    prompt — strict adherence, no unapproved dependencies, ask-for-clarification, and a
    comprehensive-plan request all carried through.
  - Made the Node-runtime / Bun-package-manager split an explicit ground rule in the prompt
    so the downstream plan doesn't drift into Bun-runtime assumptions (`bun test`, etc.).
  - Zod is technically an added dependency on top of Fastify's native validation; flagged
    in the spec, still included. Worth watching whether the plan questions it.
  - [add more after reviewing the generated plan in the next step]

---

## Entry 2 — Create the plan (prompt → plan)

- **Prompt:** Read `@/prompts/2-web-api-prompt.md` and follow the instructions at the top of the file.
- **Tool:** Claude Code
- **Mode:** Plan-style (produce an artifact, no service code)
- **Context:** Clean
- **Model:** Claude Opus 4.8
- **Input:** `prompts/2-web-api-prompt.md` (which references `1-web-api-specs.md`)
- **Output:** `prompts/3-web-api-plan.md`
- **Cost:** [enter after the run completes]
- **Reflections:**
  - The "don't add dependencies without approval" rule did real work: the plan surfaced a
    **Dependencies needing approval** section instead of silently pulling in `tsx`, ESLint,
    and `pino-pretty`. It recommended zero-new-dependency alternatives (Node's built-in
    `--watch`/`--experimental-strip-types` for `dev`, `tsc --noEmit` for `lint`). Good sign
    the constraint propagated all the way through the chain.
  - The plan ended with 5 open questions (PUT patch-vs-replace, list payload shape, missing
    DELETE endpoints, config size limits). These are genuine gaps in the spec — the "output
    tells you what's missing" effect the instructions predicted.
  - Node-vs-Bun split held: scripts use `node --env-file`/`bun run`, no Bun-runtime calls.
  - **Decisions made before executing** (folded back into `3-web-api-plan.md`):
    - Approved `tsx` + `eslint` + `typescript-eslint`; rejected `pino-pretty`. Chose DX over
      a minimal dependency count — a conscious relaxation of the "no new deps" rule.
    - PUT = partial update (patch); empty body rejected.
    - `GET /applications` returns bare apps; `configurationIds` only on the single-item GET.
    - No DELETE endpoints; no size cap on `config`.
  - Takeaway: the plan couldn't be executed cleanly until these 5 gaps were closed — cheap
    to resolve now on paper, expensive to discover mid-implementation.

