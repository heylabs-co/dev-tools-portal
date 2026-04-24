#!/usr/bin/env node

/**
 * tool.news MCP server — exposes the tool.news developer-tool catalog
 * to AI assistants via Model Context Protocol.
 *
 * Data is fetched at runtime from tool.news HTTPS API endpoints, so every
 * user gets fresh data (catalog refreshes every 6 hours) without having to
 * reinstall the server.
 *
 * Cache TTL: 1 hour for all endpoints. Use TOOL_NEWS_BASE env var to point
 * at a different host (useful for self-hosted forks or local dev).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = (process.env.TOOL_NEWS_BASE ?? 'https://tool.news').replace(/\/$/, '');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type Company = {
  slug: string;
  name: string;
  description?: string;
  website: string;
  logo?: string;
  hq_country?: string;
  categories?: { primary?: { slug?: string; name?: string } };
  pricing?: { model?: string; has_free_tier?: boolean; entry_price?: string };
  scores?: { lock_in?: { level?: string; score?: number } };
  scale?: { customers?: string; revenue?: string; employees?: string };
  review?: { verdict?: string; pros?: string[]; cons?: string[]; best_for?: string; not_for?: string };
};

type FullTool = {
  slug: string;
  name: string;
  description?: string;
  website?: string;
  category?: { slug?: string; name?: string };
  pricing?: { model?: string; has_free_tier?: boolean; entry_price?: string };
  scores?: { lock_in?: { level?: string; score?: number } };
  review?: { verdict?: string; pros?: string[]; cons?: string[]; best_for?: string; not_for?: string };
  when_to_use?: string[];
  works_well_with?: string[];
  url?: string;
};

type McpServerRow = {
  slug: string;
  name: string;
  description?: string;
  github_repo?: string;
  npm_package?: string;
  install_command?: string;
  category?: string;
  official?: boolean;
};

type SkillRow = {
  slug: string;
  name: string;
  description?: string;
  source_url?: string;
  category?: string;
  framework?: string;
  format?: string;
  stars?: number;
};

type ExtensionRow = {
  slug: string;
  name: string;
  publisher?: string;
  description?: string;
  category?: string;
  installs?: string;
  vscode_id?: string;
};

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  ai_native?: boolean;
  company_count?: number;
};

// ---- Caching fetcher --------------------------------------------------

const cache = new Map<string, { expires: number; value: unknown }>();

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) {
    return hit.value as T;
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': 'tool-news-mcp/2.0' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const value = (await res.json()) as T;
  cache.set(url, { expires: Date.now() + CACHE_TTL_MS, value });
  return value;
}

const getCompanies = () => fetchJson<Company[]>('/api/companies.json');

let toolsFullIndex: Map<string, FullTool> | null = null;
async function loadToolsFull(): Promise<Map<string, FullTool>> {
  if (toolsFullIndex) return toolsFullIndex;
  const data = await fetchJson<Record<string, FullTool>>('/api/tools-full.json');
  toolsFullIndex = new Map(Object.entries(data));
  return toolsFullIndex;
}
const getTool = async (slug: string): Promise<FullTool> => {
  const map = await loadToolsFull();
  const tool = map.get(slug);
  if (!tool) throw new Error(`Tool not found: ${slug}`);
  return tool;
};
const getMcpServers = () => fetchJson<McpServerRow[]>('/api/mcp-servers.json');
const getSkills = () => fetchJson<SkillRow[]>('/api/skills.json');
const getExtensions = () => fetchJson<ExtensionRow[]>('/api/extensions.json');
const getPlugins = () => fetchJson<Array<{ slug: string; name: string; description?: string; category?: string; ide?: string }>>('/api/plugins.json');
const getCategories = () => fetchJson<CategoryRow[]>('/api/categories.json');

// ---- Server setup -----------------------------------------------------

const server = new McpServer(
  { name: 'tool-news', version: '2.1.2' },
  { capabilities: { tools: {} } },
);

/** Tokenized case-insensitive AND match across the given field values joined. */
function matchesFields(query: string | undefined, ...fields: Array<string | undefined>): boolean {
  if (!query) return true; // no query = no filter
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = fields.filter((f): f is string => !!f).join(' ').toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

// ---- Tools ------------------------------------------------------------

server.tool(
  'search_tools',
  'Search 5,800+ developer tools (APIs, SDKs, SaaS) by name, category, pricing, or lock-in level.',
  {
    query: z.string().describe('Free-text query matched against name, description, category').optional(),
    category: z.string().describe('Category slug or name filter, e.g. "payment-gateway" or "AI API"').optional(),
    pricing_model: z.enum(['usage', 'subscription', 'freemium', 'seat', 'hybrid', 'credit', 'unknown']).optional(),
    has_free_tier: z.boolean().optional(),
    lock_in_level: z.enum(['low', 'medium', 'high']).optional(),
    limit: z.number().min(1).max(50).default(20),
  },
  async ({ query, category, pricing_model, has_free_tier, lock_in_level, limit }) => {
    const companies = await getCompanies();
    const results = companies.filter((c) => {
      if (!matchesFields(query, c.name, c.description, c.categories?.primary?.name)) return false;
      if (!matchesFields(category, c.categories?.primary?.slug, c.categories?.primary?.name)) return false;
      if (pricing_model && c.pricing?.model !== pricing_model) return false;
      if (has_free_tier !== undefined && c.pricing?.has_free_tier !== has_free_tier) return false;
      if (lock_in_level && c.scores?.lock_in?.level !== lock_in_level) return false;
      return true;
    }).slice(0, limit);

    return {
      content: [{
        type: 'text',
        text: results.length === 0
          ? 'No matching tools found.'
          : results.map((c) => {
              const cat = c.categories?.primary?.name ?? '—';
              const price = c.pricing?.entry_price ?? c.pricing?.model ?? '—';
              const lock = c.scores?.lock_in?.level ?? '—';
              return `• ${c.name} (${cat}) — pricing: ${price}, lock-in: ${lock}\n  https://tool.news/tools/${c.slug}/\n  ${c.description ?? ''}`.trim();
            }).join('\n\n'),
      }],
    };
  },
);

server.tool(
  'get_tool',
  'Get full details for a specific tool by slug — pricing, lock-in, review, pros/cons, use cases, verdict.',
  { slug: z.string() },
  async ({ slug }) => {
    let t: FullTool;
    try {
      t = await getTool(slug);
    } catch {
      return { content: [{ type: 'text', text: `Tool "${slug}" not found. Try search_tools first.` }] };
    }
    const lines: string[] = [
      `# ${t.name}`,
      `URL: ${t.url ?? `https://tool.news/tools/${t.slug}/`}`,
      `Website: ${t.website ?? '—'}`,
      `Category: ${t.category?.name ?? '—'}`,
      '',
    ];
    if (t.description) lines.push(t.description, '');

    if (t.review?.verdict) {
      lines.push('## Verdict', t.review.verdict, '');
    }
    if (t.review?.best_for || t.review?.not_for) {
      if (t.review.best_for) lines.push(`**Best for:** ${t.review.best_for}`);
      if (t.review.not_for) lines.push(`**Not for:** ${t.review.not_for}`);
      lines.push('');
    }

    if (t.review?.pros?.length) {
      lines.push('## Pros');
      t.review.pros.forEach((p) => lines.push(`- ${p}`));
      lines.push('');
    }
    if (t.review?.cons?.length) {
      lines.push('## Cons');
      t.review.cons.forEach((p) => lines.push(`- ${p}`));
      lines.push('');
    }

    if (t.when_to_use?.length) {
      lines.push('## When to use');
      t.when_to_use.forEach((u) => lines.push(`- ${u}`));
      lines.push('');
    }

    if (t.pricing?.model || t.pricing?.entry_price !== undefined || t.pricing?.has_free_tier !== undefined) {
      lines.push('## Pricing');
      if (t.pricing.model) lines.push(`- Model: ${t.pricing.model}`);
      if (t.pricing.has_free_tier !== undefined) lines.push(`- Free tier: ${t.pricing.has_free_tier ? 'yes' : 'no'}`);
      if (t.pricing.entry_price) lines.push(`- Entry price: ${t.pricing.entry_price}`);
      lines.push('');
    }
    if (t.scores?.lock_in) {
      lines.push('## Lock-in');
      lines.push(`- Level: ${t.scores.lock_in.level ?? '—'}`);
      if (t.scores.lock_in.score !== undefined) lines.push(`- Score: ${t.scores.lock_in.score}/5`);
      lines.push('');
    }
    if (t.works_well_with?.length) {
      lines.push(`## Pairs well with`, t.works_well_with.map((s) => `- ${s}`).join('\n'), '');
    }

    return { content: [{ type: 'text', text: lines.join('\n').trimEnd() }] };
  },
);

server.tool(
  'compare_tools',
  'Side-by-side compare of two tools on pricing, lock-in, pros, cons.',
  { slug_a: z.string(), slug_b: z.string() },
  async ({ slug_a, slug_b }) => {
    const companies = await getCompanies();
    const a = companies.find((c) => c.slug === slug_a);
    const b = companies.find((c) => c.slug === slug_b);
    if (!a || !b) {
      return { content: [{ type: 'text', text: `Tool(s) not found: ${!a ? slug_a : ''} ${!b ? slug_b : ''}`.trim() }] };
    }
    const rows = [
      ['Name', a.name, b.name],
      ['Category', a.categories?.primary?.name ?? '—', b.categories?.primary?.name ?? '—'],
      ['Pricing model', a.pricing?.model ?? '—', b.pricing?.model ?? '—'],
      ['Free tier', String(a.pricing?.has_free_tier ?? '—'), String(b.pricing?.has_free_tier ?? '—')],
      ['Entry price', a.pricing?.entry_price ?? '—', b.pricing?.entry_price ?? '—'],
      ['Lock-in', a.scores?.lock_in?.level ?? '—', b.scores?.lock_in?.level ?? '—'],
    ];
    const out = rows.map(([k, v1, v2]) => `${k.padEnd(15)} | ${String(v1).padEnd(30)} | ${String(v2)}`).join('\n');
    return { content: [{ type: 'text', text: `Compare: ${a.name} vs ${b.name}\n\n${out}\n\nFull side-by-side: https://tool.news/compare/${slug_a}-vs-${slug_b}/` }] };
  },
);

server.tool(
  'list_categories',
  'List all 42 tool categories with counts.',
  {},
  async () => {
    const cats = await getCategories();
    const text = cats
      .sort((a, b) => (b.company_count ?? 0) - (a.company_count ?? 0))
      .map((c) => `• ${c.name} (${c.company_count ?? 0}) — /categories/${c.slug}/`)
      .join('\n');
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'search_mcp_servers',
  'Search 377+ MCP servers for AI assistants. Returns name, install command, category.',
  {
    query: z.string().optional(),
    category: z.string().optional(),
    official_only: z.boolean().default(false),
    limit: z.number().min(1).max(50).default(20),
  },
  async ({ query, category, official_only, limit }) => {
    const servers = await getMcpServers();
    const results = servers.filter((s) => {
      if (!matchesFields(query, s.name, s.description, s.category)) return false;
      if (!matchesFields(category, s.category)) return false;
      if (official_only && !s.official) return false;
      return true;
    }).slice(0, limit);
    const text = results.length === 0
      ? 'No MCP servers found.'
      : results.map((s) => {
          const install = s.install_command ?? (s.npm_package ? `npx -y ${s.npm_package}` : '—');
          return `• ${s.name}${s.official ? ' [OFFICIAL]' : ''} (${s.category ?? '—'})\n  Install: ${install}\n  https://tool.news/mcp-servers/${s.slug}/`;
        }).join('\n\n');
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'get_mcp_server',
  'Get full details for an MCP server by slug — including install command for Claude Code / Cursor / VS Code.',
  { slug: z.string() },
  async ({ slug }) => {
    const servers = await getMcpServers();
    const s = servers.find((x) => x.slug === slug);
    if (!s) return { content: [{ type: 'text', text: `MCP server "${slug}" not found.` }] };

    const lines: string[] = [`# ${s.name}${s.official ? ' (Official)' : ''}`, `URL: https://tool.news/mcp-servers/${s.slug}/`];
    if (s.github_repo) lines.push(`GitHub: https://github.com/${s.github_repo}`);
    if (s.description) lines.push('', s.description, '');

    if (s.install_command) {
      lines.push('## Install (Claude Code)', `claude mcp add-json ${s.slug} '${JSON.stringify({ command: s.install_command.split(/\s+/)[0], args: s.install_command.split(/\s+/).slice(1) })}'`);
    } else if (s.npm_package) {
      lines.push('## Install (Claude Code)', `claude mcp add-json ${s.slug} '${JSON.stringify({ command: 'npx', args: ['-y', s.npm_package] })}'`);
    } else {
      lines.push('## Install', `See repository README: https://github.com/${s.github_repo ?? ''}`);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

server.tool(
  'search_skills',
  'Search AI coding skills (Cursor rules, Claude Skills, Copilot instructions, Windsurf rules).',
  {
    query: z.string().optional(),
    category: z.string().optional(),
    framework: z.string().optional(),
    format: z.enum(['cursorrules', 'claude-skill', 'copilot', 'windsurf', 'instructions', 'prompt']).optional(),
    limit: z.number().min(1).max(50).default(20),
  },
  async ({ query, category, framework, format, limit }) => {
    const skills = await getSkills();
    const results = skills.filter((s) => {
      if (!matchesFields(query, s.name, s.description, s.category, s.framework)) return false;
      if (!matchesFields(category, s.category)) return false;
      if (!matchesFields(framework, s.framework)) return false;
      if (format && s.format !== format) return false;
      return true;
    })
      .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
      .slice(0, limit);
    const text = results.length === 0
      ? 'No skills found.'
      : results.map((s) => `• ${s.name} (${s.format ?? '—'}, ${s.framework ?? 'any'})\n  ⭐ ${s.stars ?? 0}\n  https://tool.news/skills/${s.slug}/`).join('\n\n');
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'search_extensions',
  'Search VS Code extensions (356+ curated).',
  {
    query: z.string().optional(),
    category: z.string().optional(),
    limit: z.number().min(1).max(50).default(20),
  },
  async ({ query, category, limit }) => {
    const exts = await getExtensions();
    const results = exts.filter((e) => {
      if (!matchesFields(query, e.name, e.description, e.category)) return false;
      if (!matchesFields(category, e.category)) return false;
      return true;
    }).slice(0, limit);
    const text = results.length === 0
      ? 'No extensions found.'
      : results.map((e) => {
          const cmd = e.vscode_id ? `code --install-extension ${e.vscode_id}` : '—';
          return `• ${e.name} by ${e.publisher ?? '—'} (${e.installs ?? '—'} installs)\n  Install: ${cmd}\n  https://tool.news/extensions/${e.slug}/`;
        }).join('\n\n');
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'search_plugins',
  'Search JetBrains plugins (IntelliJ/PyCharm/WebStorm/GoLand etc.).',
  {
    query: z.string().optional(),
    category: z.string().optional(),
    ide: z.string().optional(),
    limit: z.number().min(1).max(50).default(20),
  },
  async ({ query, category, ide, limit }) => {
    const plugins = await getPlugins();
    const results = plugins.filter((p) => {
      if (!matchesFields(query, p.name, p.description, p.category, p.ide)) return false;
      if (!matchesFields(category, p.category)) return false;
      if (!matchesFields(ide, p.ide)) return false;
      return true;
    }).slice(0, limit);
    const text = results.length === 0
      ? 'No plugins found.'
      : results.map((p) => `• ${p.name} (${p.category ?? '—'}, ${p.ide ?? 'any JetBrains IDE'})\n  https://tool.news/plugins/${p.slug}/`).join('\n\n');
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'catalog_stats',
  'Return total count of entries across all tool.news catalogs.',
  {},
  async () => {
    const meta = await fetchJson<{ endpoints: Record<string, { count: number }>; total_entries: number; generated_at: string }>('/api/index.json');
    const lines = [
      `tool.news catalog stats (generated at ${meta.generated_at}):`,
      '',
      ...Object.entries(meta.endpoints).map(([k, v]) => `- ${k}: ${v.count.toLocaleString()}`),
      '',
      `Total entries: ${meta.total_entries.toLocaleString()}`,
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ---- Boot -------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`tool.news MCP server v2.0 ready (BASE=${BASE})`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
