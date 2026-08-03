<!--
MAINTENANCE NOTE (for humans and assistants)

The process every piece of work follows: four stages, what each needs, and who
decides a stage is over. Read before starting work, not while doing it.

When updating:
  - This file is the process. The current position in it lives in
    WORKFLOW_STATUS.md, and the detail of the work lives in changes/NNN-*.md.
    Do not restate either here.
  - A rule nobody has hit yet is a guess. Prefer rules that came from friction.
  - If this file and what actually happened disagree, what happened wins —
    correct the file in the REFLECT & ADAPT stage that noticed.
-->

# Workflow

One work item at a time. One task at a time inside it. Four stages per task, in
order, and **the user decides when each one ends**.

Three files carry the work, and they do not overlap:

| File | Holds | Lifespan |
|---|---|---|
| `context/WORKFLOW.md` (this) | The process | Stable |
| `context/WORKFLOW_STATUS.md` | Which work item, task and stage are live | Changes every stage |
| `changes/NNN-name.md` | The acceptance criteria and the working notes | Deleted down to its criteria as each task lands |

## Vocabulary

- A **work item** is one feature, worth a numbered file in `changes/`. Feature
  flags are one work item.
- A **task** is one Given-When-Then acceptance criterion inside it — roughly
  one commit. A task goes through all four stages before the next one starts.

Acceptance criteria are always **Given-When-Then**, because it forces the
criterion to name observable behaviour. "Add a flags table" is not a criterion;
"Given an application with no flags, When a flag is created, Then it comes back
in that application's flag list" is.

## The four stages

### 1. PLAN

**In:** one Given-When-Then criterion from the work item.
**Out:** the test strategy and the file changes, written into the work item's
*Current task* section — **not** left in the conversation, which does not
survive.

- What tests give confidence: the happy path, the failure path, the edge case
  that will be got wrong.
- Which files change, and which layer each change belongs in. Check
  ARCHITECTURE.md before inventing an endpoint, a table or a layer.
- Say what is **not** in this task. Scope creep is easiest to stop here.

**Done when:** the user agrees the test strategy and file list are right. The
plan is committed before any code is written, so what was intended stays
legible next to what was built.

> Plan against the context framework, not from memory. If ABOUT.md, ARCHITECTURE.md
> or IMPLEMENTATION.md already answers a question, the answer is not a choice.

### 2. BUILD & ASSESS

**In:** the committed plan.
**Out:** working, tested code that satisfies the criterion — and nothing else.

- Write the tests and the implementation. Follow IMPLEMENTATION.md's conventions;
  they are not suggestions.
- **`make check` must pass cleanly.** Lint, format, type-check, build, both test
  suites. No skipped tests, no ignored warnings, no "that failure is unrelated".
- Anything discovered that is out of scope goes in the work item's notes as a
  future task. It does not get built now.

**Done when:** the user confirms `make check` is green and the behaviour matches
the criterion. Green tests alone are not the bar — a test can pass and still not
be the behaviour that was asked for.

### 3. REFLECT & ADAPT

**In:** what just happened.
**Out:** corrections to the remaining plan, and to the process itself.

- Where was there friction? Was the plan accurate, or did the work reveal it was
  wrong?
- Do the remaining criteria need changing, reordering, or adding to now that this
  one is built?
- **Did a context document turn out to be wrong or silent?** Fix it here, in this
  change — the framework rots when this is deferred.

**Done when:** the user agrees the remaining tasks and the documents reflect what
is now known. This is the stage most likely to be skipped, and skipping it is how
the process stops improving.

### 4. COMMIT & PICK NEXT

**In:** green code and an up-to-date work item.
**Out:** a commit, current documents, and a named next task.

- Commit. **This repo does not use conventional-commit prefixes** — subjects are
  short imperative sentences and the body explains *why*, matching the existing
  history. Consistency with the log beats consistency with the convention.
- Review the README of every folder touched. Correct anything no longer true.
- **Purge the work item.** Delete the PLAN / BUILD / REFLECT notes for the task
  just finished. Keep the acceptance criterion and mark it complete.
- Name the next task and update `WORKFLOW_STATUS.md`.

**Done when:** the commit exists, the work item holds no stale scaffolding, and
the status file points at the next task.

## Who decides

**Only the user closes a stage.** The assistant does the stage's work, says what
it believes is outstanding, and waits. It does not announce that a stage is
complete, and it does not start the next one because the current one looks
finished. The user says so explicitly — "move to BUILD & ASSESS" — or the stage
is still open.

The assistant *should* say "I think PLAN is covered — the test strategy and file
list are in the work item" and stop there. That is a report, not a transition.

## Branching and commits

**Work happens on `main`.** No feature branches, no pull requests. One person, no
reviewers, no CI — a branch would be ceremony that protects nothing. This is a
deliberate departure from the course material; revisit it the moment a second
person or a CI pipeline exists.

Each task is normally one commit. The plan is committed at the end of PLAN, so a
task usually leaves two: the plan, then the code.

## Purge discipline

**Once a task is committed, its working notes are noise.** The code is the truth
and the commit message is the reasoning; a stale plan next to shipped code is a
document that lies. Delete the stage notes, keep the criterion and its status.

What survives a task: the acceptance criterion, whether it passed, and anything
learned that belongs in a context document. What does not: test strategies, file
lists, progress checkboxes, and reflections that have already been acted on.

## Starting a conversation mid-flight

A fresh conversation should be able to answer "what's our status?" from
`WORKFLOW_STATUS.md` plus the linked work item, with nothing else supplied. If it
cannot, the status file is not doing its job and that is a REFLECT & ADAPT finding.
