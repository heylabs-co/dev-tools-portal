/**
 * Generate compact tool list for the AI recommender worker.
 *
 * Reads all company JSONs from data/companies/ and outputs a pipe-delimited
 * text file at workers/recommend-api/tool-list.txt
 *
 * Format per line:
 *   slug | Name | Category | pricing model | free tier? | lock-in level
 *
 * Run: npx tsx scripts/generate-recommend-prompt.ts
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(import.meta.dirname, '..', 'data', 'companies');
const OUTPUT_FILE = join(import.meta.dirname, '..', 'workers', 'recommend-api', 'tool-list.txt');

interface CompanyJSON {
  slug: string;
  name: string;
  categories?: {
    primary?: {
      name?: string;
    };
  };
  pricing?: {
    model?: string;
    has_free_tier?: boolean;
    entry_price?: string;
    high_water_mark?: boolean;
  };
  scores?: {
    lock_in?: {
      level?: string;
    };
  };
  status?: string;
}

const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
console.log(`Found ${files.length} company files`);

const lines: string[] = [];

for (const file of files) {
  try {
    const raw = readFileSync(join(COMPANIES_DIR, file), 'utf-8');
    const data: CompanyJSON = JSON.parse(raw);

    if (data.status && data.status !== 'active') continue;

    const slug = data.slug || file.replace('.json', '');
    const name = data.name || slug;
    const category = data.categories?.primary?.name || 'Uncategorized';
    const pricingModel = data.pricing?.model || 'unknown';
    const hasFree = data.pricing?.has_free_tier ? 'free tier' : 'no free tier';
    const entryPrice = data.pricing?.entry_price || '';
    const lockIn = data.scores?.lock_in?.level || 'unknown';

    // Keep compact: slug | name | category | pricing | free | entry price | lock-in [| HWM]
    const pricePart = entryPrice ? `${pricingModel}, ${entryPrice}` : pricingModel;
    const hwm = data.pricing?.high_water_mark ? ' | HWM' : '';
    lines.push(`${slug} | ${name} | ${category} | ${pricePart} | ${hasFree} | ${lockIn} lock-in${hwm}`);
  } catch (e) {
    console.warn(`Skipping ${file}: ${(e as Error).message}`);
  }
}

lines.sort();

// Append MCP servers
const MCP_SERVERS_FILE = join(import.meta.dirname, '..', 'data', 'mcp-servers.json');
try {
  const mcpServers = JSON.parse(readFileSync(MCP_SERVERS_FILE, 'utf-8')) as Array<{
    slug: string; name: string; description: string; category: string; official?: boolean;
  }>;
  lines.push('');
  lines.push('--- MCP SERVERS ---');
  for (const s of mcpServers) {
    lines.push(`${s.slug} | ${s.name} | MCP Server | ${s.category} | ${s.official ? 'official' : 'community'}`);
  }
  console.log(`Added ${mcpServers.length} MCP servers`);
} catch (e) {
  console.warn(`Skipping MCP servers: ${(e as Error).message}`);
}

// Append AI skills
const AI_SKILLS_FILE = join(import.meta.dirname, '..', 'data', 'ai-skills.json');
try {
  const skills = JSON.parse(readFileSync(AI_SKILLS_FILE, 'utf-8')) as Array<{
    slug: string; name: string; description: string; category: string; framework?: string; format: string;
  }>;
  lines.push('');
  lines.push('--- AI SKILLS ---');
  for (const s of skills) {
    lines.push(`${s.slug} | ${s.name} | AI Skill | ${s.category} | ${s.framework || 'general'} | ${s.format}`);
  }
  console.log(`Added ${skills.length} AI skills`);
} catch (e) {
  console.warn(`Skipping AI skills: ${(e as Error).message}`);
}

// Append VS Code extensions
const EXTENSIONS_FILE = join(import.meta.dirname, '..', 'data', 'vscode-extensions.json');
try {
  const extensions = JSON.parse(readFileSync(EXTENSIONS_FILE, 'utf-8')) as Array<{
    slug: string; name: string; description: string; category: string; publisher: string; vscode_id: string;
  }>;
  lines.push('');
  lines.push('--- VS CODE EXTENSIONS ---');
  for (const e of extensions) {
    lines.push(`${e.slug} | ${e.name} | VS Code Extension | ${e.category} | ${e.publisher} | ${e.vscode_id}`);
  }
  console.log(`Added ${extensions.length} VS Code extensions`);
} catch (err) {
  console.warn(`Skipping VS Code extensions: ${(err as Error).message}`);
}

// Append trending GitHub repos (new releases that may not yet be in the catalog).
// Slug is prefixed with `trending:` so the worker + UI can render them with a
// GitHub link rather than a tool.news detail page.
const TRENDING_FILE = join(import.meta.dirname, '..', 'data', 'repos', 'trending.json');
try {
  const trending = JSON.parse(readFileSync(TRENDING_FILE, 'utf-8')) as {
    updated_at?: string;
    hot?: Array<Record<string, unknown>>;
    weekly_trend?: Array<Record<string, unknown>>;
    popular?: Array<Record<string, unknown>>;
    weekly?: Array<Record<string, unknown>>;
    rising?: Array<Record<string, unknown>>;
  };

  // Merge + dedupe by full_name across buckets; keep the hottest signal per repo.
  const merged = new Map<string, {
    full_name: string;
    description: string;
    stars: number;
    stars_today?: number;
    stars_week?: number;
    language?: string;
    topics?: string[];
    company_slug?: string | null;
    url: string;
  }>();
  const buckets = [
    ...(trending.hot ?? []),
    ...(trending.weekly_trend ?? []),
    ...(trending.popular ?? trending.weekly ?? []),
    ...(trending.rising ?? []),
  ];
  for (const raw of buckets) {
    const r = raw as Record<string, unknown>;
    const full_name = String(r.full_name ?? '').trim();
    if (!full_name) continue;
    const existing = merged.get(full_name);
    const next = {
      full_name,
      description: String(r.description ?? ''),
      stars: Number(r.stars ?? 0),
      stars_today: typeof r.stars_today === 'number' ? (r.stars_today as number) : existing?.stars_today,
      stars_week: typeof r.stars_week === 'number' ? (r.stars_week as number) : existing?.stars_week,
      language: (r.language as string | null | undefined) ?? existing?.language,
      topics: (r.topics as string[] | undefined) ?? existing?.topics,
      company_slug: (r.company_slug as string | null | undefined) ?? existing?.company_slug,
      url: String(r.url ?? existing?.url ?? ''),
    };
    merged.set(full_name, { ...(existing ?? {}), ...next, stars: Math.max(existing?.stars ?? 0, next.stars) });
  }

  // Skip repos that are already in the catalog — no need to double-surface them.
  const catalogSlugs = new Set(lines.map((l) => l.split(' | ')[0]));
  const repos = Array.from(merged.values()).filter((r) => {
    if (!r.company_slug) return true;
    return !catalogSlugs.has(r.company_slug);
  });

  if (repos.length > 0) {
    lines.push('');
    lines.push('--- TRENDING GITHUB REPOS (new / rising; prefix slug "trending:" in recommendations) ---');
    for (const r of repos) {
      // Encode the github slug — org/repo — so we can reconstruct the URL later.
      const key = r.full_name.replace(/[^a-zA-Z0-9/_-]/g, '').toLowerCase();
      const langPart = r.language ? `${r.language}` : 'multi-language';
      const topicPart = r.topics && r.topics.length ? r.topics.slice(0, 6).join(',') : 'general';
      const starsPart = r.stars_today ? `+${r.stars_today}/day`
        : r.stars_week ? `+${r.stars_week}/week`
        : `${r.stars} total`;
      const desc = r.description.slice(0, 100).replace(/\s*\|\s*/g, ' ').trim();
      lines.push(`trending:${key} | ${r.full_name} | GitHub Trending | ${langPart}, ${topicPart} | ${starsPart} | ${desc}`);
    }
    console.log(`Added ${repos.length} trending GitHub repos`);
  }
} catch (err) {
  console.warn(`Skipping trending repos: ${(err as Error).message}`);
}

const output = lines.join('\n');
writeFileSync(OUTPUT_FILE, output, 'utf-8');

const sizeKB = (Buffer.byteLength(output, 'utf-8') / 1024).toFixed(1);
console.log(`Wrote ${lines.length} lines to ${OUTPUT_FILE} (${sizeKB} KB)`);
