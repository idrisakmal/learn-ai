<!--
Copy to changes/NNN-short-name.md and fill in. Delete these instructions and
every bracketed placeholder as you go — a template artefact left in a real work
item is how they stop being read.

The process this serves is context/WORKFLOW.md. Read that first.

Two rules that are easy to get wrong:
  - The Current task section holds ONE task. Not a history of tasks.
  - After a task is committed, delete its stage notes. Keep the criterion and
    its status. See "Purge discipline" in WORKFLOW.md.
-->

# NNN — [Feature name]

> As a [persona], I want [capability], so that [reason].

**Notes:** [One or two sentences of anything that shapes the work and is not
obvious from the story — a schema decision, a constraint, what is deliberately
excluded.]

## Acceptance criteria

Each is one task, roughly one commit, and goes through all four stages before
the next one starts.

### 1. [What this criterion is about]

- **Given** [the starting state]
- **When** [the action]
- **Then** [the observable outcome]
- **Status:** ❌ not started

### 2. [What this criterion is about]

- **Given** [the starting state]
- **When** [the action]
- **Then** [the observable outcome]
- **Status:** ❌ not started

<!-- Status values: ❌ not started · 🔄 in progress · ✅ complete -->

## Current task

**Task:** [number and name] · **Stage:** [PLAN / BUILD & ASSESS / REFLECT & ADAPT / COMMIT & PICK NEXT]

### PLAN

- **Out of scope for this task:** [what is deliberately not being built now]
- **Tests:**
  - [ ] [happy path]
  - [ ] [failure path]
  - [ ] [the edge case that will be got wrong]
- **Files:**
  - [ ] `path/to/file` — [what changes, and which layer it belongs in]

### BUILD & ASSESS

- [ ] Tests written and failing for the right reason
- [ ] Implemented
- [ ] Tests passing
- [ ] `make check` green — lint, format, type-check, build, both suites

### REFLECT & ADAPT

- **Friction:** [what fought back; blank is a valid answer, "n/a" is not]
- **Was the plan right?** [where it was wrong, and why]
- **Remaining criteria:** [changes, reorderings, additions]
- **Context documents:** [anything found wrong or missing — fix it in this change]

### COMMIT & PICK NEXT

- [ ] Committed
- [ ] READMEs of touched folders reviewed
- [ ] Stage notes above purged, criterion marked complete
- [ ] `context/WORKFLOW_STATUS.md` updated
- **Next task:** [number and name]

## Future tasks

[Anything found along the way that is out of scope. Promote to a criterion or
delete it — this list is not a graveyard.]
