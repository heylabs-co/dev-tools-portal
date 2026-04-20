import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.resolve(import.meta.dirname, '../data/mcp-servers.json');
const OUT_DIR = path.resolve(import.meta.dirname, '../data/mcp-servers');

interface McpServer {
  name: string;
  slug: string;
  description?: string;
  github_repo?: string;
  npm_package?: string;
  author?: string;
  category?: string;
  tools_count?: number;
  install_command?: string;
  official?: boolean;
}

const raw = fs.readFileSync(DATA_FILE, 'utf-8');
const servers: McpServer[] = JSON.parse(raw);

fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;

for (const server of servers) {
  const title = server.official
    ? `${server.name} MCP Server (Official) — Install & Config`
    : `${server.name} MCP Server — Install & Config`;

  const meta_description = server.description
    ? `${server.name} MCP server: ${server.description.slice(0, 120)}. Install instructions, config snippet, and usage guide.`
    : `Install and configure the ${server.name} MCP server for Claude Code and other AI assistants.`;

  const entry = {
    ...server,
    seo: { title, meta_description },
  };

  const outPath = path.join(OUT_DIR, `${server.slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(entry, null, 2) + '\n');
  written++;
}

console.log(`Wrote ${written} MCP server files to ${OUT_DIR}`);
