#!/usr/bin/env bash
# start-work skill — grounding script.
# Gathers deterministic facts about the current repo state so the LLM can
# synthesise an orientation brief. Output is sectioned plain text on stdout.
set -uo pipefail

print_section() {
  printf '\n=== %s ===\n' "$1"
}

# --- Sanity: must be inside a git repo ---
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  print_section "ERROR"
  echo "Not inside a git working tree. Run this from a checked-out repo."
  exit 0
fi

# --- Recent commits on the current branch ---
print_section "RECENT COMMITS"
git log --oneline -10 2>/dev/null || echo "(no commit history)"

# --- Files touched in the last 10 commits ---
print_section "FILES TOUCHED"
touched_files=$(git diff --name-only HEAD~10..HEAD 2>/dev/null || git ls-files | head -20)
if [ -z "$touched_files" ]; then
  echo "(no files changed in last 10 commits)"
else
  echo "$touched_files"
fi

# --- Per-file recent history ---
print_section "PER-FILE HISTORY"
if [ -z "$touched_files" ]; then
  echo "(no files to report on)"
else
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    echo "--- $f ---"
    git log --oneline -5 -- "$f" 2>/dev/null || echo "  (no history)"
  done <<< "$touched_files"
fi

# --- Test status: try common runners in order ---
print_section "TEST STATUS"
test_ran=0
if [ -f Makefile ] && grep -qE '^test:' Makefile; then
  echo "Trying: make test"
  if make test >/tmp/start-work-test.log 2>&1; then
    echo "PASS (make test)"
  else
    echo "FAIL (make test) — last 20 lines:"
    tail -n 20 /tmp/start-work-test.log
  fi
  test_ran=1
fi
if [ "$test_ran" -eq 0 ] && [ -f package.json ] && grep -q '"test"' package.json; then
  echo "Trying: npm test"
  if npm test >/tmp/start-work-test.log 2>&1; then
    echo "PASS (npm test)"
  else
    echo "FAIL (npm test) — last 20 lines:"
    tail -n 20 /tmp/start-work-test.log
  fi
  test_ran=1
fi
if [ "$test_ran" -eq 0 ] && command -v pytest >/dev/null 2>&1 && { [ -d tests ] || ls test_*.py >/dev/null 2>&1; }; then
  echo "Trying: pytest"
  if pytest -q >/tmp/start-work-test.log 2>&1; then
    echo "PASS (pytest)"
  else
    echo "FAIL (pytest) — last 20 lines:"
    tail -n 20 /tmp/start-work-test.log
  fi
  test_ran=1
fi
if [ "$test_ran" -eq 0 ]; then
  echo "(no recognised test runner — flag this in 'Watch out for')"
fi

# --- Open TODOs in recently touched files ---
print_section "OPEN TODOS"
if [ -z "$touched_files" ]; then
  echo "(nothing to grep)"
else
  found_any=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    matches=$(grep -nE 'TODO|FIXME|HACK' "$f" 2>/dev/null || true)
    if [ -n "$matches" ]; then
      echo "--- $f ---"
      echo "$matches"
      found_any=1
    fi
  done <<< "$touched_files"
  [ "$found_any" -eq 0 ] && echo "(none found)"
fi

# --- Project context framework ---
# Projects can define their own context layout. This script supports three
# conventions, in order:
#   - context/WORKFLOW_STATUS.md (this project's framework — see AGENTS.md)
#   - memory/WORKFLOW_STATUS.md  (the same idea under the course's name)
#   - WORK_CONTEXT.md            (a single-file convention some projects use)
# It prints whichever is present and lists the other context files alongside.
print_section "PROJECT CONTEXT"
printed=0
for dir in context memory; do
  [ "$printed" -eq 1 ] && break
  [ -d "$dir" ] || continue
  echo "Context framework files ($dir/):"
  ls "$dir"/*.md 2>/dev/null | sed 's/^/  /'
  if [ -f "$dir/WORKFLOW_STATUS.md" ]; then
    echo
    echo "--- $dir/WORKFLOW_STATUS.md ---"
    cat "$dir/WORKFLOW_STATUS.md"
    printed=1
  fi
done
if [ "$printed" -eq 0 ] && [ -f WORK_CONTEXT.md ]; then
  echo "--- WORK_CONTEXT.md ---"
  cat WORK_CONTEXT.md
  printed=1
fi
if [ "$printed" -eq 0 ]; then
  echo "(no context/WORKFLOW_STATUS.md, memory/WORKFLOW_STATUS.md or WORK_CONTEXT.md present)"
fi
