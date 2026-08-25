# my-domain-lang-mcp

Module 5 exercise — a stdio MCP server that exposes the project's domain
knowledge graph to a coding agent. Design and rationale: [DESIGN.md](DESIGN.md).

It wraps the `knowledge-graph` Typer CLI via subprocess. The CLI is the whole
backend: no network, no daemon, no port.

## Tools

| Tool | Answers |
|---|---|
| `ping` | is the server reachable? |
| `lookup_term` | what does this term mean *in this system*? |
| `get_related_terms` | what does this term connect to? |
| `list_domain_areas` | what does the graph cover? |
| `validate_knowledge_graph` | is the graph internally consistent? |

Every tool returns JSON, errors included — `validation_error`, `not_found`,
`service_error`, `malformed_output`. The model reads the failure and recovers
instead of seeing a stack trace.

## Setup

```bash
uv sync --extra dev
```

The knowledge graph must be imported once before any tool returns data:

```bash
cd ../assisted-to-agentic-module-6/examples/knowledge-graph
uv sync && uv run knowledge-graph import
```

`KG_PROJECT_DIR` must point at that directory whenever the server runs.

## Run

```bash
KG_PROJECT_DIR=/absolute/path/to/knowledge-graph uv run my-domain-lang-mcp-stdio
```

It speaks MCP over stdin/stdout, so there is nothing to see when it starts —
drive it with a client.

## Test

```bash
uv run pytest -q
```

The tests run against the real CLI (deterministic and fast) and monkeypatch
`kg.CLI_COMMAND` to reach the failure paths: missing binary, timeout,
non-JSON output.

## Inspect

```bash
npx @modelcontextprotocol/inspector \
  uv run --directory /Users/idris.haslin/Projects/learn-ai/my-domain-lang-mcp my-domain-lang-mcp-stdio
```

Set `KG_PROJECT_DIR` in Inspector's environment panel before invoking a tool.

## SDK note

Built against **MCP Python SDK 2.0**, where `FastMCP` became
`mcp.server.mcpserver.MCPServer` and result fields are snake_case
(`input_schema`, `is_error`, `server_info`). The course reference server pins
`mcp>=1.0` and still imports `mcp.server.fastmcp`; it works only because its
lockfile holds it on 1.x. Worth knowing in Module 6 — the *client* side of the
SDK moved the same way.
