---
name: start-work
description: Use at the beginning of a piece of work to orient on the codebase, recent activity, and any open friction. Provide a feature description, or invoke with no arguments to ask "where were we?"
---

# Start Work

You orient the user before they begin a piece of work. Produce a short, grounded brief that tells them where the codebase is right now, what's in scope for the work they're about to do, what to watch out for, and one specific recommended starting point. The brief should never include generic advice — only things the script's evidence supports.

## Inputs

- **Feature description** (optional): a sentence or two from the user describing what they're about to do. If absent, treat the invocation as "where were we?" and let the recent activity drive scope.
- **Working directory**: the user's current shell working directory. The script grounds in this.

## How to do this

### Step 1 — Read the feature description and the codebase structure

If a feature description is provided, read it carefully. Identify the files most likely to be involved — what will need to be modified, what will be read, what new files might need to be created. Use `AGENTS.md` (or `CLAUDE.md` / `README.md`) and the directory structure to get oriented. In this repo `AGENTS.md` points at `module1/context/` — read `ABOUT.md` and `WORKFLOW_STATUS.md` there before forming a hypothesis. Do not yet read the code itself; you're forming a hypothesis.

If no feature description is provided, skip this step and let the script output drive the scope.

### Step 2 — Run the script and reconcile

Run `script.sh` from the project root — for this repo that is `module1/`, not the repo root — and read its full output. The script returns sections:

- `=== RECENT COMMITS ===` — the last 10 commits on the current branch
- `=== FILES TOUCHED ===` — files modified in the last 10 commits
- `=== PER-FILE HISTORY ===` — recent commits per touched file
- `=== TEST STATUS ===` — whether the project's test suite passes (best-effort: tries `make test`, then `npm test`, then `pytest`, then reports inability)
- `=== OPEN TODOS ===` — `TODO` / `FIXME` / `HACK` lines in recently touched files
- `=== PROJECT CONTEXT ===` — list of `context/*.md` files plus the contents of `context/WORKFLOW_STATUS.md` (this project's convention; `memory/` and `WORK_CONTEXT.md` are supported fallbacks for other repos)

Reconcile what the script found against your initial hypothesis from Step 1. The script is the ground truth for what's actually happening in the repo right now. Adjust the scope assessment based on it.

### Step 3 — Synthesise the brief

Produce the orientation brief as Markdown with these four sections, in this order:

1. **Where we are** — current branch, what's in progress, what was done in recent sessions
2. **Scope** — files likely to be modified, files likely to be read, new files to create
3. **Watch out for** — recent changes to dependencies, failing tests, open TODOs, infrastructure concerns
4. **Recommended starting point** — one specific next action, with a brief reason why

Keep it tight. No preamble. No generic advice. If the script could not run the test suite, say so explicitly in **Watch out for** rather than silently omitting test status. Confirm the file list with the user before they begin: "I've identified X files as in scope — let me know if I've missed something obvious."

## Output

A single Markdown brief with the four sections above. The user reads it and acts on it (or corrects you and re-invokes).
