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
