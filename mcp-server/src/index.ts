#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Load data ---
function findDataDir(): string {
  // Look for data/ relative to script, then up directories
  const candidates = [
    join(__dirname, '..', '..', 'data'),    // from build/
    join(__dirname, '..', 'data'),           // from src/
    join(process.cwd(), 'data'),             // from project root
  ];
  for (const dir of candidates) {
    try {
      readdirSync(join(dir, 'companies'));
      return dir;
    } catch { /* continue */ }
  }
  throw new Error('Could not find data/ directory. Run from project root or set DATA_DIR env.');
}

const DATA_DIR = process.env.DATA_DIR || findDataDir();

interface Company {
  slug: string;
  name: string;
  description?: string;
  website: string;
  logo?: string;
  hq_country?: string;
  status: string;
  categories: {
    primary: { id: string; slug: string; name: string };
    secondary?: string[];
  };
  pricing?: {
    model?: string;
    has_free_tier?: boolean;
    free_tier_limits?: string;
    entry_price?: string;
    enterprise_available?: boolean;
    billing_complexity?: string;
    transparency_score?: number;
  };
  scale?: {
    customers?: string;
    revenue?: string;
    employees?: string;
    valuation?: string;
  };
  scores?: {
    lock_in?: {
      level: string;
      score: number;
      migration_complexity?: string;
      data_portability?: string;
      api_compatibility?: string;
      explanation?: string;
    };
  };
  content?: {
    when_to_use?: string[];
    when_not_to_use?: string[];
    consider_instead?: string[];
    migration_cheatsheet?: {
      difficulty?: string;
      data_you_keep?: string;
      api_standard?: string;
      tip?: string;
    };
    works_well_with?: string[];
  };
  alternatives?: string[];
}

interface Category {
  id: string;
  slug: string;
  name: string;
  section?: string;
  description?: string;
  ai_native: boolean;
  company_count: number;
  companies: string[];
}

// Load all companies
const companiesDir = join(DATA_DIR, 'companies');
const companies: Company[] = readdirSync(companiesDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(companiesDir, f), 'utf-8')));

const companyMap = new Map(companies.map(c => [c.slug, c]));

// Load all categories
const categoriesDir = join(DATA_DIR, 'categories');
const categories: Category[] = readdirSync(categoriesDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(categoriesDir, f), 'utf-8')));

// Load MCP servers
interface McpServerEntry {
  name: string;
  slug: string;
  description: string;
  github_repo?: string;
  category: string;
  official?: boolean;
}

const mcpServersFile = join(DATA_DIR, 'mcp-servers.json');
let mcpServers: McpServerEntry[] = [];
try {
  mcpServers = JSON.parse(readFileSync(mcpServersFile, 'utf-8'));
} catch { /* file may not exist */ }

// Load AI skills
interface AiSkill {
  name: string;
  slug: string;
  description: string;
  source_url?: string;
  author?: string;
  category: string;
  framework?: string;
  format: string;
  stars?: number;
}

const aiSkillsFile = join(DATA_DIR, 'ai-skills.json');
let aiSkills: AiSkill[] = [];
try {
  aiSkills = JSON.parse(readFileSync(aiSkillsFile, 'utf-8'));
} catch { /* file may not exist */ }

// Load VS Code extensions
interface VscodeExtension {
  name: string;
  slug: string;
  publisher: string;
  description: string;
  category: string;
  installs?: string;
  vscode_id: string;
}

const vscodeExtensionsFile = join(DATA_DIR, 'vscode-extensions.json');
let vscodeExtensions: VscodeExtension[] = [];
try {
  vscodeExtensions = JSON.parse(readFileSync(vscodeExtensionsFile, 'utf-8'));
} catch { /* file may not exist */ }

console.error(`Loaded ${companies.length} companies, ${categories.length} categories, ${mcpServers.length} MCP servers, ${aiSkills.length} AI skills, ${vscodeExtensions.length} VS Code extensions`);

// --- Format helpers ---
function formatCompanyBrief(c: Company): string {
  const parts = [
    `**${c.name}** (${c.website})`,
    `Category: ${c.categories.primary.name}`,
  ];
  if (c.pricing?.model) parts.push(`Pricing: ${c.pricing.model}${c.pricing.has_free_tier ? ' (free tier available)' : ''}`);
  if (c.pricing?.entry_price) parts.push(`Entry price: ${c.pricing.entry_price}`);
  if (c.scores?.lock_in) parts.push(`Lock-in: ${c.scores.lock_in.level} (${c.scores.lock_in.score}/5)`);
  if (c.hq_country) parts.push(`HQ: ${c.hq_country}`);
  return parts.join('\n');
}

function formatCompanyFull(c: Company): string {
  const sections: string[] = [
    `# ${c.name}`,
    `${c.description || ''}`,
    `Website: ${c.website}`,
    `Category: ${c.categories.primary.name}`,
    `Status: ${c.status} | HQ: ${c.hq_country || 'Unknown'}`,
  ];

  if (c.pricing) {
    sections.push(`\n## Pricing`);
    sections.push(`Model: ${c.pricing.model || 'Unknown'}`);
    if (c.pricing.has_free_tier) sections.push(`Free tier: Yes${c.pricing.free_tier_limits ? ` (${c.pricing.free_tier_limits})` : ''}`);
    if (c.pricing.entry_price) sections.push(`Entry price: ${c.pricing.entry_price}`);
    if (c.pricing.enterprise_available) sections.push(`Enterprise: Available`);
    if (c.pricing.transparency_score) sections.push(`Transparency score: ${c.pricing.transparency_score}/5`);
  }

  if (c.scores?.lock_in) {
    const li = c.scores.lock_in;
    sections.push(`\n## Lock-in Assessment`);
    sections.push(`Level: ${li.level} (${li.score}/5)`);
    if (li.migration_complexity) sections.push(`Migration complexity: ${li.migration_complexity}`);
    if (li.data_portability) sections.push(`Data portability: ${li.data_portability}`);
    if (li.api_compatibility) sections.push(`API compatibility: ${li.api_compatibility}`);
    if (li.explanation) sections.push(`Details: ${li.explanation}`);
  }

  if (c.scale) {
    sections.push(`\n## Scale`);
    if (c.scale.customers) sections.push(`Customers: ${c.scale.customers}`);
    if (c.scale.revenue) sections.push(`Revenue: ${c.scale.revenue}`);
    if (c.scale.employees) sections.push(`Employees: ${c.scale.employees}`);
    if (c.scale.valuation) sections.push(`Valuation: ${c.scale.valuation}`);
  }

  if (c.content?.when_to_use) {
    sections.push(`\n## When to Use`);
    c.content.when_to_use.forEach(u => sections.push(`✓ ${u}`));
  }
  if (c.content?.when_not_to_use) {
    sections.push(`\n## When NOT to Use`);
    c.content.when_not_to_use.forEach(u => sections.push(`✗ ${u}`));
  }

  if (c.content?.migration_cheatsheet) {
    const m = c.content.migration_cheatsheet;
    sections.push(`\n## Migration Guide`);
    if (m.difficulty) sections.push(`Difficulty: ${m.difficulty}`);
    if (m.data_you_keep) sections.push(`Data you keep: ${m.data_you_keep}`);
    if (m.api_standard) sections.push(`API standard: ${m.api_standard}`);
    if (m.tip) sections.push(`Tip: ${m.tip}`);
  }

  if (c.content?.works_well_with && c.content.works_well_with.length > 0) {
    sections.push(`\n## Works Well With`);
    sections.push(c.content.works_well_with.join(', '));
  }

  if (c.alternatives && c.alternatives.length > 0) {
    sections.push(`\n## Alternatives`);
    sections.push(c.alternatives.join(', '));
  }

  return sections.join('\n');
}

// --- MCP Server ---
const server = new McpServer(
  { name: 'devtools-portal', version: '1.0.0' },
  {
    instructions: `tool.news MCP Server — search, compare, and get recommendations for 630+ developer tools, MCP servers, AI skills, and VS Code extensions.
Available tools:
- search_tools: Search by keyword or category
- get_tool: Get full details for a specific tool
- compare_tools: Side-by-side comparison of two tools
- list_categories: Browse all 42 tool categories
- recommend_stack: Get tool recommendations for a use case
- search_mcp_servers: Search MCP servers catalog
- get_mcp_server: Get details of a specific MCP server
- search_skills: Search AI coding skills
- search_extensions: Search VS Code extensions`,
  }
);

// 1. Search tools
server.tool(
  'search_tools',
  'Search developer tools by keyword, category, or criteria. Returns matching tools with pricing and lock-in info.',
  {
    query: z.string().describe('Search keyword (tool name, category, or feature)'),
    category: z.string().optional().describe('Filter by category slug (e.g. "payment-gateway", "identity-auth")'),
    has_free_tier: z.boolean().optional().describe('Filter to only tools with a free tier'),
    max_lock_in: z.enum(['low', 'medium', 'high']).optional().describe('Maximum acceptable lock-in level'),
    limit: z.number().optional().default(10).describe('Max results to return (default 10)'),
  },
  async ({ query, category, has_free_tier, max_lock_in, limit }) => {
    let results = companies;

    // Filter by category
    if (category) {
      results = results.filter(c => c.categories.primary.slug === category);
    }

    // Filter by free tier
    if (has_free_tier !== undefined) {
      results = results.filter(c => c.pricing?.has_free_tier === has_free_tier);
    }

    // Filter by lock-in
    if (max_lock_in) {
      const levels = { low: 1, medium: 2, high: 3 };
      const maxLevel = levels[max_lock_in];
      results = results.filter(c => {
        const level = c.scores?.lock_in?.level;
        if (!level) return true; // include if unknown
        return levels[level as keyof typeof levels] <= maxLevel;
      });
    }

    // Search by query
    const q = query.toLowerCase();
    results = results.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      c.categories.primary.name.toLowerCase().includes(q) ||
      c.categories.primary.slug.includes(q)
    );

    const limited = results.slice(0, limit);

    const text = limited.length === 0
      ? `No tools found matching "${query}"${category ? ` in category "${category}"` : ''}.`
      : `Found ${results.length} tools${limited.length < results.length ? ` (showing ${limited.length})` : ''}:\n\n${limited.map(formatCompanyBrief).join('\n\n---\n\n')}`;

    return { content: [{ type: 'text', text }] };
  }
);

// 2. Get tool details
server.tool(
  'get_tool',
  'Get complete details for a specific developer tool including pricing, lock-in score, migration guide, and recommendations.',
  {
    slug: z.string().describe('Tool slug (e.g. "stripe", "supabase", "auth0")'),
  },
  async ({ slug }) => {
    const company = companyMap.get(slug);
    if (!company) {
      // Try fuzzy match
      const fuzzy = companies.find(c => c.name.toLowerCase() === slug.toLowerCase());
      if (fuzzy) {
        return { content: [{ type: 'text', text: formatCompanyFull(fuzzy) }] };
      }
      return { content: [{ type: 'text', text: `Tool "${slug}" not found. Try search_tools to find the correct slug.` }] };
    }
    return { content: [{ type: 'text', text: formatCompanyFull(company) }] };
  }
);

// 3. Compare tools
server.tool(
  'compare_tools',
  'Compare two developer tools side-by-side on pricing, lock-in, features, and migration difficulty.',
  {
    tool_a: z.string().describe('First tool slug (e.g. "stripe")'),
    tool_b: z.string().describe('Second tool slug (e.g. "adyen")'),
  },
  async ({ tool_a, tool_b }) => {
    const a = companyMap.get(tool_a);
    const b = companyMap.get(tool_b);

    if (!a || !b) {
      const missing = [!a ? tool_a : null, !b ? tool_b : null].filter(Boolean).join(', ');
      return { content: [{ type: 'text', text: `Tool(s) not found: ${missing}. Use search_tools to find correct slugs.` }] };
    }

    const rows = [
      ['', a.name, b.name],
      ['Category', a.categories.primary.name, b.categories.primary.name],
      ['Website', a.website, b.website],
      ['HQ', a.hq_country || '?', b.hq_country || '?'],
      ['Pricing Model', a.pricing?.model || '?', b.pricing?.model || '?'],
      ['Free Tier', a.pricing?.has_free_tier ? 'Yes' : 'No', b.pricing?.has_free_tier ? 'Yes' : 'No'],
      ['Entry Price', a.pricing?.entry_price || '?', b.pricing?.entry_price || '?'],
      ['Enterprise', a.pricing?.enterprise_available ? 'Yes' : '?', b.pricing?.enterprise_available ? 'Yes' : '?'],
      ['Lock-in Level', a.scores?.lock_in?.level || '?', b.scores?.lock_in?.level || '?'],
      ['Lock-in Score', a.scores?.lock_in ? `${a.scores.lock_in.score}/5` : '?', b.scores?.lock_in ? `${b.scores.lock_in.score}/5` : '?'],
      ['Migration', a.scores?.lock_in?.migration_complexity || '?', b.scores?.lock_in?.migration_complexity || '?'],
      ['Data Portability', a.scores?.lock_in?.data_portability || '?', b.scores?.lock_in?.data_portability || '?'],
    ];

    const table = `# ${a.name} vs ${b.name}\n\n` +
      rows.map(r => `| ${r.join(' | ')} |`).join('\n') +
      '\n';

    // Add when to use for each
    const sections = [table];
    if (a.content?.when_to_use) {
      sections.push(`\n## When to use ${a.name}\n${a.content.when_to_use.map(u => `✓ ${u}`).join('\n')}`);
    }
    if (b.content?.when_to_use) {
      sections.push(`\n## When to use ${b.name}\n${b.content.when_to_use.map(u => `✓ ${u}`).join('\n')}`);
    }

    sections.push(`\nMore details: https://tool.news/compare/${tool_a}-vs-${tool_b}/`);

    return { content: [{ type: 'text', text: sections.join('\n') }] };
  }
);

// 4. List categories
server.tool(
  'list_categories',
  'List all 42 developer tool categories with tool counts.',
  {
    section: z.string().optional().describe('Filter by section (e.g. "Payments", "Analytics", "AI")'),
  },
  async ({ section }) => {
    let cats = categories;
    if (section) {
      const s = section.toLowerCase();
      cats = cats.filter(c => (c.section || '').toLowerCase().includes(s) || c.name.toLowerCase().includes(s));
    }

    const text = cats
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(c => `- **${c.name}** (${c.company_count} tools) — ${c.slug}${c.ai_native ? ' 🤖 AI-native' : ''}`)
      .join('\n');

    return { content: [{ type: 'text', text: `# Developer Tool Categories\n\n${text}\n\nUse the slug with search_tools to browse tools in a category.` }] };
  }
);

// 5. Recommend stack
server.tool(
  'recommend_stack',
  'Recommend a developer tool stack based on your project needs. Describe what you are building and get tool suggestions.',
  {
    description: z.string().describe('Describe your project and what you need (e.g. "SaaS app with auth, payments, and analytics")'),
    budget: z.enum(['free', 'low', 'medium', 'enterprise']).optional().describe('Budget level: free (only free tiers), low (<$100/mo), medium (<$1000/mo), enterprise (unlimited)'),
    prefer_low_lockin: z.boolean().optional().default(false).describe('Prefer tools with low vendor lock-in'),
  },
  async ({ description, budget, prefer_low_lockin }) => {
    const desc = description.toLowerCase();

    // Map keywords to categories
    const categoryKeywords: Record<string, string[]> = {
      'payment-gateway': ['payment', 'billing', 'checkout', 'stripe', 'charge', 'transaction'],
      'subscription-billing': ['subscription', 'recurring', 'saas billing', 'plan', 'dunning'],
      'identity-auth': ['auth', 'login', 'sso', 'mfa', 'authentication', 'user management', 'signup'],
      'backend-as-a-service': ['backend', 'baas', 'firebase', 'supabase', 'serverless backend'],
      'dbaas': ['database', 'postgres', 'mysql', 'mongodb', 'db', 'sql'],
      'cdn-edge': ['cdn', 'hosting', 'deploy', 'edge', 'static site'],
      'product-analytics': ['analytics', 'tracking', 'events', 'funnel', 'retention', 'metrics'],
      'crash-reporting': ['crash', 'error tracking', 'bug', 'sentry'],
      'observability': ['monitoring', 'logs', 'tracing', 'observability', 'apm'],
      'feature-flags': ['feature flag', 'remote config', 'rollout', 'toggle'],
      'messaging-api': ['email', 'sms', 'notification', 'messaging', 'twilio'],
      'push-in-app-messaging': ['push notification', 'in-app message', 'engagement'],
      'search-recommendations': ['search', 'algolia', 'elasticsearch', 'recommendation'],
      'ci-cd': ['ci/cd', 'pipeline', 'build', 'deploy', 'continuous integration'],
      'ai-api-sdk': ['ai', 'llm', 'gpt', 'claude', 'ml', 'artificial intelligence', 'openai'],
      'iap-optimization': ['in-app purchase', 'iap', 'paywall', 'mobile subscription'],
      'mobile-attribution': ['attribution', 'install tracking', 'mmp', 'campaign tracking'],
      'security-scanning': ['security', 'vulnerability', 'sast', 'dast', 'scanning'],
      'compliance-automation': ['soc 2', 'compliance', 'gdpr', 'iso 27001', 'audit'],
      'localization': ['translation', 'i18n', 'localization', 'multilanguage'],
      'realtime-websocket': ['realtime', 'websocket', 'chat', 'live', 'presence'],
    };

    // Find matching categories
    const matchedCategories: string[] = [];
    for (const [catSlug, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => desc.includes(kw))) {
        matchedCategories.push(catSlug);
      }
    }

    if (matchedCategories.length === 0) {
      return { content: [{ type: 'text', text: `I couldn't match specific tool categories from your description. Try being more specific about what you need (e.g. "auth", "payments", "analytics", "database", "hosting").` }] };
    }

    // For each category, pick best tools
    const recommendations: string[] = [`# Recommended Stack\n\nBased on: "${description}"\n`];

    for (const catSlug of matchedCategories) {
      let tools = companies.filter(c => c.categories.primary.slug === catSlug);

      // Apply budget filter
      if (budget === 'free') {
        tools = tools.filter(c => c.pricing?.has_free_tier);
      }

      // Apply lock-in filter
      if (prefer_low_lockin) {
        tools.sort((a, b) => (a.scores?.lock_in?.score || 3) - (b.scores?.lock_in?.score || 3));
      }

      // Prefer tools with more data (enriched)
      tools.sort((a, b) => {
        const aScore = (a.pricing ? 2 : 0) + (a.scores?.lock_in ? 2 : 0) + (a.scale ? 1 : 0);
        const bScore = (b.pricing ? 2 : 0) + (b.scores?.lock_in ? 2 : 0) + (b.scale ? 1 : 0);
        return bScore - aScore;
      });

      const top = tools.slice(0, 3);
      const catName = categories.find(c => c.slug === catSlug)?.name || catSlug;

      recommendations.push(`\n## ${catName}\n`);
      for (const t of top) {
        recommendations.push(formatCompanyBrief(t));
        recommendations.push('');
      }
    }

    recommendations.push(`\n---\nUse get_tool or compare_tools for deeper analysis of any recommended tool.`);

    return { content: [{ type: 'text', text: recommendations.join('\n') }] };
  }
);

// 6. Search MCP servers
server.tool(
  'search_mcp_servers',
  'Search the MCP servers catalog by keyword or category. Returns matching servers with descriptions, categories, and install info.',
  {
    query: z.string().describe('Search keyword (server name, description, or feature)'),
    category: z.string().optional().describe('Filter by category (e.g. "database", "cloud", "communication", "code", "search", "ai", "other")'),
  },
  async ({ query, category }) => {
    let results = mcpServers;

    if (category) {
      results = results.filter(s => s.category === category);
    }

    const q = query.toLowerCase();
    results = results.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.slug.includes(q)
    );

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No MCP servers found matching "${query}"${category ? ` in category "${category}"` : ''}.` }] };
    }

    const text = results.slice(0, 15).map(s => {
      const parts = [
        `**${s.name}**${s.official ? ' (Official)' : ''}`,
        s.description,
        `Category: ${s.category}`,
        `Slug: ${s.slug}`,
      ];
      if (s.github_repo) parts.push(`Install: \`npx -y @modelcontextprotocol/server-${s.slug}\``);
      return parts.join('\n');
    }).join('\n\n---\n\n');

    return { content: [{ type: 'text', text: `Found ${results.length} MCP servers${results.length > 15 ? ' (showing 15)' : ''}:\n\n${text}` }] };
  }
);

// 7. Get MCP server details
server.tool(
  'get_mcp_server',
  'Get full details for a specific MCP server including install command and config snippet.',
  {
    slug: z.string().describe('MCP server slug (e.g. "filesystem", "brave-search", "github")'),
  },
  async ({ slug }) => {
    const server = mcpServers.find(s => s.slug === slug);
    if (!server) {
      const fuzzy = mcpServers.find(s => s.name.toLowerCase() === slug.toLowerCase());
      if (fuzzy) {
        const s = fuzzy;
        return { content: [{ type: 'text', text: formatMcpServer(s) }] };
      }
      return { content: [{ type: 'text', text: `MCP server "${slug}" not found. Try search_mcp_servers to find the correct slug.` }] };
    }
    return { content: [{ type: 'text', text: formatMcpServer(server) }] };
  }
);

function formatMcpServer(s: McpServerEntry): string {
  const sections = [
    `# ${s.name}${s.official ? ' (Official)' : ''}`,
    s.description,
    `\n**Category:** ${s.category}`,
    `**Slug:** ${s.slug}`,
  ];
  if (s.github_repo) {
    sections.push(`**GitHub:** https://github.com/${s.github_repo}`);
    sections.push(`\n## Install\n\`\`\`\nnpx -y @modelcontextprotocol/server-${s.slug}\n\`\`\``);
    sections.push(`\n## Config Snippet\n\`\`\`json\n{\n  "mcpServers": {\n    "${s.slug}": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-${s.slug}"]\n    }\n  }\n}\n\`\`\``);
  }
  sections.push(`\nMore details: https://tool.news/mcp-servers/${s.slug}/`);
  return sections.join('\n');
}

// 8. Search AI skills
server.tool(
  'search_skills',
  'Search AI coding skills (cursor rules, Claude skills, Copilot instructions). Returns matching skills with descriptions and formats.',
  {
    query: z.string().describe('Search keyword (skill name, framework, or description)'),
    framework: z.string().optional().describe('Filter by framework (e.g. "react", "nextjs", "python", "angular")'),
    format: z.string().optional().describe('Filter by format: "cursorrules", "claude-skill", or "copilot"'),
  },
  async ({ query, framework, format }) => {
    let results = aiSkills;

    if (framework) {
      const fw = framework.toLowerCase();
      results = results.filter(s => (s.framework || '').toLowerCase().includes(fw));
    }

    if (format) {
      results = results.filter(s => s.format === format);
    }

    const q = query.toLowerCase();
    results = results.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      (s.framework || '').toLowerCase().includes(q) ||
      s.slug.includes(q)
    );

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No AI skills found matching "${query}"${framework ? ` for framework "${framework}"` : ''}${format ? ` in format "${format}"` : ''}.` }] };
    }

    const text = results.slice(0, 15).map(s => {
      const parts = [
        `**${s.name}**`,
        s.description,
        `Category: ${s.category} | Format: ${s.format}`,
      ];
      if (s.framework) parts.push(`Framework: ${s.framework}`);
      if (s.author) parts.push(`Author: ${s.author}`);
      return parts.join('\n');
    }).join('\n\n---\n\n');

    return { content: [{ type: 'text', text: `Found ${results.length} AI skills${results.length > 15 ? ' (showing 15)' : ''}:\n\n${text}` }] };
  }
);

// 9. Search VS Code extensions
server.tool(
  'search_extensions',
  'Search VS Code extensions. Returns matching extensions with descriptions, publishers, and install counts.',
  {
    query: z.string().describe('Search keyword (extension name, description, or publisher)'),
    category: z.string().optional().describe('Filter by category (e.g. "ai", "productivity", "language", "theme", "testing")'),
  },
  async ({ query, category }) => {
    let results = vscodeExtensions;

    if (category) {
      results = results.filter(e => e.category === category);
    }

    const q = query.toLowerCase();
    results = results.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.publisher.toLowerCase().includes(q) ||
      e.slug.includes(q)
    );

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No VS Code extensions found matching "${query}"${category ? ` in category "${category}"` : ''}.` }] };
    }

    const text = results.slice(0, 15).map(e => {
      const parts = [
        `**${e.name}** by ${e.publisher}`,
        e.description,
        `Category: ${e.category}`,
      ];
      if (e.installs) parts.push(`Installs: ${e.installs}`);
      parts.push(`Install: \`ext install ${e.vscode_id}\``);
      return parts.join('\n');
    }).join('\n\n---\n\n');

    return { content: [{ type: 'text', text: `Found ${results.length} VS Code extensions${results.length > 15 ? ' (showing 15)' : ''}:\n\n${text}` }] };
  }
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('tool.news MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
