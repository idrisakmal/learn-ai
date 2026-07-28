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

---

## Entry 3 — Execute the plan (plan → code)

- **Prompt:** Create a Config API Service in the `config-service` folder, according to the Implementation Plan in `@/prompts/3-web-api-plan.md`.
- **Tool:** Claude Code
- **Mode:** Act (filesystem read/write, run commands)
- **Context:** Clean
- **Model:** Claude Opus 4.8
- **Input:** `prompts/3-web-api-plan.md`
- **Output:** `config-service/`
- **Cost:** [enter after the run completes]
- **Environment notes:**
  - Machine has Node 24 (spec/plan targeted Node 22 LTS) — newer, backward-compatible, no
    change needed. Bun 1.3.10, Docker present. Port 5432 already had an unknown Postgres, so
    the project runs its **own PostgreSQL 16 container on port 5433** for isolation.
- **Reflections:**
  - **Outcome:** clean build, lint passes, **35/35 tests green**, and the server boots and
    serves the full happy path plus 400/409/404 error paths against real PostgreSQL. ULIDs
    are generated app-side (e.g. `01KY8W1W6DYC8XCA2H2BTVNJB1`); jsonb `config` round-trips.
  - The plan executed almost verbatim — the up-front decision-closing (Entry 3) paid off:
    no mid-build detours to resolve ambiguity.
  - Things I'd want different next time (captured as persistent rules in root `AGENTS.md`):
    - The `test/` folder ended up needed immediately (shared `resetDb` helper), so the
      "don't create it until needed" guidance resolved on the first module. Fine, but worth
      stating the DB-reset strategy in the spec next time.
    - Prisma logs expected constraint violations at `error` level, so the passing test run
      still prints scary `prisma:error` blocks. Noise, not failure — but a spec note to
      quiet Prisma logging under `NODE_ENV=test` would make green runs actually look green.
    - Default `PORT=3000` collided with another local app; had to move to 3999. A less
      common default (or documenting the collision) would smooth first-run.
    - `z.record(z.string(), z.unknown())` accepts any JSON object for `config` (per the
      decision to leave it uncapped) — revisit if we ever want size/shape limits.
  - Environment: Node 24 (not the planned 22 LTS) worked with no changes. Postgres runs in
    a dedicated `config-service-pg` container on **5435** (5432/5433/5434 were taken by
    other projects).

---

# Module 2 — Building a Context Framework

Same service, same folder (`module1/` is now simply the project root). This module
adds `context/` — documents written for an AI audience — plus the first feature
built while those documents were in play.

Note on ordering: exercises were done 1, 2, 4, then the code work, then 3. Writing
`AGENTS.md` last meant writing the front door once, against a finished set of files,
instead of rewriting it after every addition.

---

## Entry 4 — Context framework: ABOUT.md and IMPLEMENTATION.md

- **Prompt:** Read the Module 2 README, learn from the Module 1 journal, then scaffold
  and collaboratively fill `context/ABOUT.md`, followed by `context/IMPLEMENTATION.md`.
- **Tool:** Claude Code
- **Mode:** Plan → Act
- **Context:** Clean
- **Model:** Claude Opus 5 (1M context)
- **Input:** Module 2 `README.md` / `INSTRUCTIONS.md` / `examples/`, `prisma/schema.prisma`,
  the whole of `config-service/src/`, `package.json`, `tsconfig.json`, `vitest.config.ts`
- **Output:** `context/ABOUT.md`, `context/IMPLEMENTATION.md`
- **Cost:** [enter after the run completes]
- **Reflections:**
  - **Scaffolding the document first is what kept invented content out.** The file was
    created with section headers and `[FILL: ...]` markers the assistant was explicitly
    forbidden to guess at. The first draft contained zero fabricated personas because
    there was nowhere to put them. This is the reusable technique, not the document.
  - The split that made it work: **verifiable from the repo** (domain vocabulary, scope
    boundaries, constraints) the assistant drafts; **only the human knows** (why it
    exists, who uses it, what to prioritise) stays a placeholder until answered.
  - The course's example `ABOUT.md` assumes an "environment" concept the schema does not
    have. Copying it would have introduced vocabulary the code cannot back. Resolved by
    documenting environments as a *naming convention* on `Configuration.name` — which the
    existing compound unique constraint already supports — and saying plainly that the
    schema does not enforce it.
  - **Ranked priorities turned out to be the most valuable section.** "Easy-to-use UI
    first, start small second, don't foreclose scale third" is the only part of the
    document that resolves a genuine tie later.
  - Writing `IMPLEMENTATION.md` from source rather than memory **worked as an audit**:
    it surfaced three things that contradicted the code, including two "learnings" from
    Module 1 that had been written into `AGENTS.md` but never actually applied.
  - The good/bad example pairs are the highest-value content per line. Three specific
    traps: `.js` extensions on relative imports under `NodeNext`, routes reaching past
    services into Prisma, and `undefined` vs `null` in a partial update.
  - **Process mistake worth remembering:** the `ABOUT.md` scaffold was staged, then the
    file was rewritten, then committed without re-staging — so the placeholder version
    landed in git and the real content leaked into a later commit. Caught by inspecting
    the commit afterwards, fixed by rebuilding three unpushed commits. Lesson: re-run
    `git add` after the final write, and verify with `git show <sha>:<path>` before
    moving on.

---

## Entry 5 — Context framework: ARCHITECTURE.md

- **Prompt:** Write `context/ARCHITECTURE.md` — system shape and reasoning — without
  duplicating `IMPLEMENTATION.md`.
- **Tool:** Claude Code
- **Mode:** Act
- **Context:** Continued
- **Model:** Claude Opus 5 (1M context)
- **Input:** `config-service/src/` (all layers), `prisma/schema.prisma`, `context/ABOUT.md`
- **Output:** `context/ARCHITECTURE.md`
- **Cost:** [enter after the run completes]
- **Reflections:**
  - The rule that shaped the document: **a decision without its trade-off is not
    documented.** Every entry in the decisions table has a "given up" column and every
    one is filled. Decisions recorded without their cost are the ones an assistant later
    "improves" — partial-update `PUT`, for instance, looks like a bug until you read that
    HTTP-spec correctness was knowingly traded for client simplicity.
  - The useful split: `ARCHITECTURE.md` answers *why* and *what shape*, `IMPLEMENTATION.md`
    answers *how*. Without that boundary the two files converge and both go stale.
  - **Tracing the data flow found a real gap.** Describing what the planned Admin UI would
    need exposed that no single request returns an application's configurations —
    `GET /applications/:id` returns bare ids, so rendering one screen meant 1 + N requests.
    Nothing in the code looked wrong; the gap only appeared when the *flow* was written down.

---

## Entry 6 — Acting on what the documents surfaced

- **Prompt:** Add the missing endpoint; then settle the two Module 1 learnings that were
  never applied to code.
- **Tool:** Claude Code
- **Mode:** Act
- **Context:** Continued
- **Model:** Claude Opus 5 (1M context)
- **Output:** `GET /api/v1/applications/:id/configurations`; `PORT` default 3000 → 3999;
  `resolvePrismaLogLevels` in `db/prisma.ts`; 35 → 45 tests
- **Cost:** [enter after the run completes]
- **Reflections:**
  - **First real test of the framework.** The endpoint went in on one pass with no
    clarifying questions: layering, file placement, naming, error semantics and testing
    conventions were already pinned, so there was nothing left to ask. The visible saving
    is in questions *not* asked rather than in code produced.
  - It also settled a design question by itself — the route belongs in
    `application.routes.ts` (all `/applications/*` paths together) while the query belongs
    in `configuration.service.ts` (all Configuration data access together), because the
    documented rule is routes → services, not routes → *their own* service.
  - **The sharpest lesson of the day: writing a rule down is not the same as fixing it.**
    Both the `PORT=3000` collision and the noisy `prisma:error` output were recorded in
    `AGENTS.md` after Module 1 as things to do better — and both were still fully present
    in the code months later. A fresh clone reproduced the exact problems the notes
    described. Context documents describe reality; they do not change it.
  - Corollary: prefer fixing over documenting where a fix is cheap. Both were one-liners.
    Extracting the Prisma log selection into a pure, tested function pins the behaviour so
    the noise reads as a regression if it ever returns, instead of as normal.

---

## Entry 7 — AGENTS.md as a front door

- **Prompt:** Rewrite root `AGENTS.md` to auto-load the context framework.
- **Tool:** Claude Code
- **Mode:** Act
- **Context:** Continued
- **Model:** Claude Opus 5 (1M context)
- **Output:** `AGENTS.md` (repo root)
- **Cost:** [enter after the run completes]
- **Reflections:**
  - The old `AGENTS.md` carried stack, conventions and infrastructure inline — all now
    covered in `context/` with more detail and worked examples. **Keeping both copies
    guarantees drift**, so the inline content was removed rather than trimmed.
  - What legitimately stays at the front door: where the project is on disk, which file to
    read for which kind of task, and the handful of guardrails that must apply *before*
    anything has been read (dependency approval, Bun-as-package-manager-only, plan first).
  - **The prediction was wrong.** Expected the file to shrink substantially; it went from
    38 to 51 lines. Length was the wrong metric — duplication was the right one, and that
    went to roughly zero.
  - The rule that keeps the whole framework from rotting: **where a context file and the
    code disagree, the code wins — correct the file.** Stale context is worse than none,
    because it is trusted.

---

## Carried forward

- Scaffold-then-fill, with placeholders the assistant may not guess at, is the technique
  to reuse on the next project. Consider turning it into a template (Module 2 extra credit).
- Check whether a documented "learning" was ever applied to the code. Several were not.
- Still outstanding: the Admin UI (exercise 5), and a `Makefile` before Module 3.
- Unmeasured: no cost figures were recorded for any Module 2 entry. Worth capturing next
  time, since comparing model cost against output quality is an explicit module objective.



