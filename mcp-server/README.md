# tool-news-mcp

MCP server that exposes the [tool.news](https://tool.news) developer-tool catalog to AI assistants.

**What you get:** Claude / Cursor / VS Code / Windsurf / Zed can search across 7,400+ developer tools, MCP servers, AI skills, VS Code extensions, and JetBrains plugins — and return install commands, pricing, lock-in risk, and side-by-side comparisons.

## Install (Claude Code)

```bash
claude mcp add-json tool-news '{"command":"npx","args":["-y","tool-news-mcp"]}'
```

## Install (Cursor / VS Code / other MCP clients)

Add to your MCP config:

```json
{
  "mcpServers": {
    "tool-news": {
      "command": "npx",
      "args": ["-y", "tool-news-mcp"]
    }
  }
}
```

Or click a deep-link install button at https://tool.news/mcp-servers/tool-news/

## Tools exposed

| Tool | Purpose |
|---|---|
| `search_tools` | Search 5,800+ developer tools by query / category / pricing / lock-in |
| `get_tool` | Full profile for a specific tool (pricing, lock-in, pros/cons) |
| `compare_tools` | Side-by-side of two tools |
| `list_categories` | All 42 tool categories with counts |
| `search_mcp_servers` | Search 377+ MCP servers |
| `get_mcp_server` | Get MCP server details + install command |
| `search_skills` | Search Cursor / Claude / Copilot skills |
| `search_extensions` | Search VS Code extensions |
| `search_plugins` | Search JetBrains plugins |
| `catalog_stats` | Total entries across all catalogs |

## Data freshness

This server fetches data from `https://tool.news/api/*.json` endpoints at runtime (cached for 1 hour). The catalog is refreshed every 6 hours from GitHub / npm / Hacker News / Product Hunt, so you always get current data.

## Environment

- `TOOL_NEWS_BASE` — override the host (default `https://tool.news`). Useful for local dev or self-hosted forks.

## Repository

https://github.com/heylabs-co/dev-tools-portal/tree/main/mcp-server

## License

MIT.
