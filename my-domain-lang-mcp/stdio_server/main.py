"""Stdio MCP server exposing the project's domain knowledge graph.

Tool descriptions are the activation signal — they are the reason the model
reaches for a tool instead of guessing from the code. Keep them in step with
DESIGN.md.
"""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer

from stdio_server import tools


def build_server() -> MCPServer:
    server = MCPServer("my-domain-lang-mcp", version="0.1.0")

    @server.tool(
        name="ping",
        description=(
            "Connectivity check for the domain-lang server. Echoes the supplied "
            "message back as 'Pong: <message>'. Use it only to verify the server "
            "is reachable when tool calls appear to be failing; it carries no "
            "domain information."
        ),
    )
    async def ping_tool(message: str) -> str:
        return await tools.ping(message)

    @server.tool(
        name="lookup_term",
        description=(
            "Look up the authoritative definition of a domain term in this "
            "project's knowledge graph. Accepts the canonical id "
            "('configuration_item'), the display name ('ConfigurationItem'), or a "
            "known alias ('config item'). Returns the definition plus aliases, "
            "warnings about commonly confused terms, and the source files and docs "
            "where the concept lives. Prefer this over inferring meaning from code "
            "or identifier names whenever the user asks what a domain term means in "
            "this system. Returns {'error': 'not_found'} if the term is not in the graph."
        ),
    )
    async def lookup_term_tool(term: str) -> str:
        return await tools.lookup_term(term)

    @server.tool(
        name="get_related_terms",
        description=(
            "List the relationships a domain term has to other terms in the "
            "knowledge graph. Each edge gives 'from', 'to', and the relationship "
            "kind ('has', 'scoped_to', ...). Use it to map how a concept connects "
            "to the rest of the domain, or to find the neighbouring terms worth "
            "looking up next. Use lookup_term instead when you need one term's "
            "definition rather than its connections."
        ),
    )
    async def get_related_terms_tool(term: str) -> str:
        return await tools.get_related_terms(term)

    @server.tool(
        name="list_domain_areas",
        description=(
            "List the distinct domain areas the knowledge graph is partitioned "
            "into. Use it to discover what subject areas exist before looking up "
            "terms — it is the cheapest way to find out what the graph covers."
        ),
    )
    async def list_domain_areas_tool() -> str:
        return await tools.list_domain_areas()

    @server.tool(
        name="validate_knowledge_graph",
        description=(
            "Check the knowledge graph for missing references and inconsistencies "
            "— for example an edge pointing at a term that no longer exists. "
            "Returns {'valid': true, 'issues': []} when the graph is sound. Use it "
            "when graph answers look wrong or stale, or after the YAML sources have "
            "been edited."
        ),
    )
    async def validate_knowledge_graph_tool() -> str:
        return await tools.validate_knowledge_graph()

    return server


def main() -> None:
    build_server().run()


if __name__ == "__main__":
    main()
