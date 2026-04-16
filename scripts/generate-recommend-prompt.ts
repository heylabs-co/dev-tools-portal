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

    // Keep compact: slug | name | category | pricing | free | entry price | lock-in
    const pricePart = entryPrice ? `${pricingModel}, ${entryPrice}` : pricingModel;
    lines.push(`${slug} | ${name} | ${category} | ${pricePart} | ${hasFree} | ${lockIn} lock-in`);
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

const output = lines.join('\n');
writeFileSync(OUTPUT_FILE, output, 'utf-8');

const sizeKB = (Buffer.byteLength(output, 'utf-8') / 1024).toFixed(1);
console.log(`Wrote ${lines.length} lines to ${OUTPUT_FILE} (${sizeKB} KB)`);
