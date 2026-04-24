/**
 * Parse all /tmp/handles-c*.md agent-output tables, extract @handle + name + category,
 * dedupe case-insensitively, and upsert into SQLite `handles` table.
 *
 * Markdown table format expected (columns vary but always starts with @handle):
 *   | handle | name | ... |
 *
 * Source tracking: each handle gets `source = "agent-c{N}"` so we can audit later.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: join(process.cwd(), '.env') });

import { upsertHandle, db } from './storage.js';

const INPUT_DIR = '/tmp';

// Category mapping per shard
const SHARD_CATEGORIES: Record<string, { category: string; tier: number }> = {
  c1: { category: 'ai-lab-employee', tier: 2 },
  c2: { category: 'ai-researcher', tier: 2 },
  c3: { category: 'dev-cloud', tier: 2 },
  c4: { category: 'dev-tool-founder', tier: 2 },
  c5: { category: 'js-ecosystem', tier: 2 },
  c6: { category: 'polyglot-infra', tier: 2 },
  c7: { category: 'tech-blogger', tier: 2 },
  c8: { category: 'video-creator', tier: 3 },
  c9: { category: 'journalist-analyst', tier: 2 },
  c10: { category: 'mobile-security-design', tier: 3 },
  // Deep research batches (will arrive later)
  'dr-agent': { category: 'ai-agent-builder', tier: 2 },
  'dr-intl': { category: 'international-dev', tier: 3 },
  'dr-yc': { category: 'yc-founder', tier: 2 },
  'dr-niche': { category: 'specialized-niche', tier: 3 },
  'gemini-search': { category: 'gemini-search', tier: 2 },
};

const HANDLE_RE = /@([A-Za-z0-9_]{2,15})\b/g;

type Entry = {
  handle: string;
  name?: string;
  description?: string;
  source: string;
  category: string;
  tier: number;
};

function parseMarkdownTable(content: string, shardId: string): Entry[] {
  const cfg = SHARD_CATEGORIES[shardId] ?? { category: 'misc', tier: 3 };
  const rows = content.split('\n');
  const entries: Entry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.includes('|')) continue;
    if (row.trim().startsWith('|---') || row.trim().startsWith('| ---')) continue;
    if (/^\|\s*handle\s*\|/i.test(row.trim())) continue; // header row

    const cells = row
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 2) continue;

    const handleMatch = cells[0].match(/@([A-Za-z0-9_]{2,15})/);
    if (!handleMatch) continue;
    const handle = handleMatch[1].toLowerCase();
    if (seen.has(handle)) continue;
    seen.add(handle);

    const name = cells[1]?.replace(/[[\]]/g, '').trim() || undefined;
    const description =
      cells
        .slice(2)
        .join(' · ')
        .replace(/\[|\]/g, '')
        .slice(0, 400) || undefined;

    entries.push({
      handle,
      name,
      description,
      source: `agent-${shardId}`,
      category: cfg.category,
      tier: cfg.tier,
    });
  }
  return entries;
}

// Regex fallback for files that don't use proper table format
function parseHandlesFallback(content: string, shardId: string): Entry[] {
  const cfg = SHARD_CATEGORIES[shardId] ?? { category: 'misc', tier: 3 };
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(HANDLE_RE)) {
    const handle = match[1].toLowerCase();
    if (seen.has(handle)) continue;
    seen.add(handle);
    entries.push({
      handle,
      source: `agent-${shardId}`,
      category: cfg.category,
      tier: cfg.tier,
    });
  }
  return entries;
}

// ── Main ────────────────────────────────────────────────────────────────

const files = readdirSync(INPUT_DIR).filter((f) => /^handles-[\w-]+\.md$/.test(f));
console.log(`Found ${files.length} md files in ${INPUT_DIR}`);

let totalParsed = 0;
let totalNew = 0;
const perShard: Record<string, { parsed: number; added: number }> = {};

const beforeCount = (db().prepare(`SELECT COUNT(*) AS c FROM handles`).get() as any).c;

for (const f of files) {
  const shardMatch = f.match(/^handles-([\w-]+)\.md$/);
  if (!shardMatch) continue;
  const shardId = shardMatch[1];
  const path = join(INPUT_DIR, f);
  const content = readFileSync(path, 'utf-8');

  let entries = parseMarkdownTable(content, shardId);
  if (entries.length < 10) {
    // Fall back to regex if table parse gave too few hits
    const fallback = parseHandlesFallback(content, shardId);
    if (fallback.length > entries.length) entries = fallback;
  }

  const before = (db().prepare(`SELECT COUNT(*) AS c FROM handles`).get() as any).c;
  for (const e of entries) {
    upsertHandle(e);
  }
  const after = (db().prepare(`SELECT COUNT(*) AS c FROM handles`).get() as any).c;

  totalParsed += entries.length;
  totalNew += after - before;
  perShard[shardId] = { parsed: entries.length, added: after - before };

  console.log(`  ${f}: parsed=${entries.length}  new=${after - before}`);
}

const afterCount = (db().prepare(`SELECT COUNT(*) AS c FROM handles`).get() as any).c;

console.log(`\n--- Summary ---`);
console.log(`Handles before: ${beforeCount}`);
console.log(`Handles after:  ${afterCount}`);
console.log(`Total parsed:   ${totalParsed}`);
console.log(`Newly added:    ${totalNew}`);
console.log(`Skipped (dup):  ${totalParsed - totalNew}`);

console.log(`\n--- By category ---`);
const byCat = db()
  .prepare(`SELECT category, COUNT(*) AS c FROM handles GROUP BY category ORDER BY c DESC`)
  .all() as any[];
for (const row of byCat) {
  console.log(`  ${String(row.category).padEnd(32)} ${row.c}`);
}

console.log(`\n--- By tier ---`);
const byTier = db()
  .prepare(`SELECT tier, COUNT(*) AS c FROM handles GROUP BY tier ORDER BY tier`)
  .all() as any[];
console.log(byTier);
