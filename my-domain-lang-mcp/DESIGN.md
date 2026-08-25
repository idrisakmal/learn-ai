# MCP Server Design — `my-domain-lang-mcp`

Filled-in copy of `assisted-to-agentic-module-5/examples/MCP_SERVER_DESIGN_TEMPLATE.md`.
Written before the implementation; updated only where the code proved the design wrong.

---

## Server identity

**Server name:** `domain-lang`

**One-line purpose:** Lets an LLM answer "what does this term mean in *this* system?"
from the project's curated domain knowledge graph, instead of inferring meaning from
identifier names in the code.

**Underlying backend:** The `knowledge-graph` Typer CLI
(`assisted-to-agentic-module-6/examples/knowledge-graph`), wrapped via subprocess.
The CLI reads a SQLite store built from human-authored YAML — deterministic, no network.

**Transport:** stdio. Single local client (one coding agent, one PAIR Agent harness),
no shared state, no deployment story needed. HTTP would buy nothing here.

**Why the CLI and not the REST API:** the CLI needs no running process, so the server
has no start-up ordering problem and no port to own. The REST API (`./api-server`) is the
right seam only if multiple clients need the graph at once.

---

## Tools

### Tool: `ping`

**Description (read by the LLM):** Connectivity check for the domain-lang server. Echoes
the supplied message back as `Pong: <message>`. Use only to verify the server is reachable
when tool calls appear to be failing; it carries no domain information.

**Input schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `message` | string | yes | Text to echo back. |

**Output:** Plain text — `Pong: <message>`.

**Errors handled:**
- Missing `message` → schema validation error raised by the SDK before the handler runs.

---

### Tool: `lookup_term`

**Description (read by the LLM):** Look up the authoritative definition of a domain term
in this project's knowledge graph — accepts the canonical id (`configuration_item`), the
display name (`ConfigurationItem`), or a known alias (`config item`). Returns the
definition plus aliases, warnings about commonly confused terms, and the source files and
docs where the concept lives. Prefer this over inferring meaning from code or identifier
names whenever the user asks what a domain term means in this system.

**Input schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `term` | string | yes | Term, alias, or display name. Case-insensitive. Must be non-empty. |

**Output:** JSON object — `id`, `type`, `area`, `name`, `definition`, `aliases[]`,
`warnings[]`, `source_files[]`, `documentation[]`.

**Errors handled:**
- Unknown term → CLI exits 1 with `{"error": "not_found", "term": ...}`; passed through unchanged.
- Empty/whitespace `term` → rejected in the handler as `{"error": "validation_error", ...}` before spawning a subprocess.
- Backend unreachable (bad `KG_PROJECT_DIR`, `uv` not on PATH) → `{"error": "service_error", "detail": ...}`.
- Non-JSON stdout → `{"error": "malformed_output", ...}`.

---

### Tool: `get_related_terms`

**Description (read by the LLM):** List the relationships a domain term has to other terms
in the knowledge graph — each edge gives `from`, `to`, and the relationship kind (`has`,
`scoped_to`, ...). Use it to map how a concept connects to the rest of the domain, or to
find the neighbouring terms worth looking up next. Use `lookup_term` instead when you need
one term's definition rather than its connections.

**Input schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `term` | string | yes | Term to find relationships for. |

**Output:** JSON array of `{from, to, relationship}`. Empty array when the term exists but
has no outbound edges.

**Errors handled:** same four categories as `lookup_term`.

---

### Tool: `list_domain_areas`

**Description (read by the LLM):** List the distinct domain areas the knowledge graph is
partitioned into. Use it to discover what subject areas exist before looking up terms —
it is the cheapest way to find out what the graph covers.

**Input schema:** no parameters.

**Output:** JSON array of area names, e.g. `["config_service", "feature_flags"]`.

**Errors handled:** service / malformed-output only (nothing to validate, nothing to not-find).

---

### Tool: `validate_knowledge_graph`

**Description (read by the LLM):** Check the knowledge graph for missing references and
inconsistencies — for example an edge pointing at a term that no longer exists. Use it
when graph answers look wrong or stale, or after the YAML sources have been edited.

**Input schema:** no parameters.

**Output:** Normalised JSON — `{"valid": true, "issues": []}` or
`{"valid": false, "issues": ["..."]}`.

**Note (design changed by the code):** unlike the other commands, `validate` takes no
`--format` flag and prints human text (`knowledge graph is valid`), signalling validity
through its exit code. The tool normalises that into the JSON shape above so the LLM sees
one consistent contract across all tools.

**Errors handled:** service / malformed-output. A graph with issues is a *result*
(`valid: false`), not an error.

---

## Granularity check

- `lookup_term` vs `get_related_terms` — different questions (definition vs connections),
  different output shapes. Kept separate; the descriptions say when to pick which.
- `list_domain_areas` vs `validate_knowledge_graph` — both parameterless graph-wide
  queries, but one is discovery and one is diagnosis. Kept separate.
- No tool takes an "action type" parameter. Nothing to split.

---

## Error categories

| Category | Example in this server | How it is signalled |
|---|---|---|
| Validation | empty `term` string | `{"error": "validation_error", "field": "term", "detail": ...}` — no subprocess spawned |
| Not found | term absent from the graph | `{"error": "not_found", "term": ...}` — passed through from the CLI |
| Service | `KG_PROJECT_DIR` wrong, `uv` missing, subprocess timeout | `{"error": "service_error", "detail": ...}` — message, never a stack trace |
| Malformed | CLI prints non-JSON on stdout | `{"error": "malformed_output", "detail": ..., "stdout": <truncated>}` |

Every error is a normal tool result carrying structured JSON, not a protocol-level
exception: the model can read it and recover (retry with a different term, tell the user
the backend is misconfigured) rather than seeing an opaque failure.

---

## Testing plan

- Unit tests over the subprocess wrapper and each tool, with the real CLI (it is
  deterministic and fast — no mocks needed for the happy paths) and a deliberately broken
  `KG_PROJECT_DIR` for the service-error path.
- MCP Inspector: every tool against known-good input; `lookup_term` with `nonsense`, with
  no `term`, and with `KG_PROJECT_DIR` pointed at a bad path.
- End to end: registered in Claude Code, prompted in natural language
  ("What does ConfigurationItem mean in this system?") with no tool named.

---

## Configuration in the harness

- Harness: Claude Code (M5), then the PAIR Agent harness via `mcp.json` (M6).
- Registration:
  ```bash
  claude mcp add --transport stdio domain-lang \
    -e KG_PROJECT_DIR=/Users/idris.haslin/Projects/learn-ai/assisted-to-agentic-module-6/examples/knowledge-graph \
    -- uv run --directory /Users/idris.haslin/Projects/learn-ai/my-domain-lang-mcp my-domain-lang-mcp-stdio
  ```

---

## Open questions

1. **Where does the knowledge graph live long-term?** Today it is read out of the
   course example directory, which is republished per module. If the graph is a team asset
   it belongs beside `module1/config-service`; if it is a personal tool it stays wherever
   `KG_PROJECT_DIR` points. Deferred — the env var keeps the decision reversible.
2. **The graph describes a Python config-service** (`svc/api/repository.py`), while ours is
   TypeScript. The domain terms transfer; the `source_files` do not. Worth re-authoring the
   YAML against `module1/` before leaning on it in M6.
3. **Should `lookup_term` fall back to fuzzy matching** on a miss? Not now — a clean
   `not_found` is more honest than a confident wrong term, and the model can call
   `list_domain_areas` to recover.
