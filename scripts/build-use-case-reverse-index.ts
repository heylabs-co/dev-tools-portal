/**
 * Build reverse index: tool slug → [use-case summaries].
 *
 * Reads all data/use-cases/*.json and generates data/meta/use-cases-by-tool.json:
 *   { "stripe": [{ slug, title, meta_category }, ...], "supabase": [...] }
 *
 * Used by the tool detail page to render a "Used in these stacks" section.
 *
 * Run: npx tsx scripts/build-use-case-reverse-index.ts
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const USE_CASES_DIR = join(ROOT, 'data/use-cases');
const META_DIR = join(ROOT, 'data/meta');
const OUT_FILE = join(META_DIR, 'use-cases-by-tool.json');

if (!existsSync(USE_CASES_DIR)) {
  console.log(`No ${USE_CASES_DIR} yet — writing empty reverse index.`);
  if (!existsSync(META_DIR)) mkdirSync(META_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify({}) + '\n');
  process.exit(0);
}

const files = readdirSync(USE_CASES_DIR).filter((f) => f.endsWith('.json'));
console.log(`Found ${files.length} use-case files`);

const reverse: Record<string, Array<{ slug: string; title: string; meta_category: string }>> = {};

for (const file of files) {
  const fp = join(USE_CASES_DIR, file);
  let data: any;
  try {
    data = JSON.parse(readFileSync(fp, 'utf-8'));
  } catch (e) {
    console.warn(`Skipping ${file}: ${(e as Error).message}`);
    continue;
  }

  const { slug, title, meta_category, tools } = data;
  if (!slug || !title || !Array.isArray(tools)) continue;

  for (const t of tools) {
    if (!t?.slug) continue;
    if (!reverse[t.slug]) reverse[t.slug] = [];
    reverse[t.slug].push({ slug, title, meta_category });
  }
}

// Dedup per tool (in case a use case accidentally lists the same tool twice)
for (const toolSlug of Object.keys(reverse)) {
  const seen = new Set<string>();
  reverse[toolSlug] = reverse[toolSlug].filter((u) => {
    if (seen.has(u.slug)) return false;
    seen.add(u.slug);
    return true;
  });
}

if (!existsSync(META_DIR)) mkdirSync(META_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(reverse, null, 2) + '\n');

const totalTools = Object.keys(reverse).length;
const totalMentions = Object.values(reverse).reduce((sum, arr) => sum + arr.length, 0);
console.log(`Wrote ${OUT_FILE}`);
console.log(`  Tools referenced: ${totalTools}`);
console.log(`  Total mentions: ${totalMentions}`);
console.log(`  Avg mentions per tool: ${(totalMentions / Math.max(1, totalTools)).toFixed(1)}`);
