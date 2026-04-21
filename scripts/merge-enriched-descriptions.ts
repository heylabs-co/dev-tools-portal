/**
 * Apply enriched descriptions from Sonnet agents.
 *
 * Reads all /tmp/enriched-descriptions-*.json files (JSON map slug → desc)
 * and updates data/companies/{slug}.json — ONLY where the current
 * description matches a known placeholder pattern. Human-written ones
 * are preserved.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');

const ENRICH_FILES = [
  '/tmp/enriched-descriptions-ai.json',
  '/tmp/enriched-descriptions-infra.json',
  '/tmp/enriched-descriptions-devops.json',
  '/tmp/enriched-descriptions-security.json',
  '/tmp/enriched-descriptions-payments-mobile.json',
  '/tmp/enriched-descriptions-analytics-misc.json',
];

const placeholderPatterns: RegExp[] = [
  /^[A-Z].+—\s*.+\s+tool for developers$/i,
  /^[A-Z].+solution\.$/i,
  /^.+ tool\.$/i,
];
const isPlaceholder = (desc: string): boolean => {
  const trimmed = (desc || '').trim();
  if (trimmed.length < 30) return true;
  return placeholderPatterns.some((p) => p.test(trimmed));
};

// Merge all enrich files
const enrichMap: Record<string, string> = {};
for (const f of ENRICH_FILES) {
  if (!existsSync(f)) {
    console.log(`Missing: ${f}`);
    continue;
  }
  const obj = JSON.parse(readFileSync(f, 'utf-8')) as Record<string, string>;
  let taken = 0;
  for (const [slug, desc] of Object.entries(obj)) {
    if (enrichMap[slug]) continue; // first wins — shouldn't happen but defensive
    enrichMap[slug] = (desc || '').trim().slice(0, 240);
    taken++;
  }
  console.log(`  ${f.replace('/tmp/', '')}: ${taken} descriptions`);
}
console.log(`Total unique slugs: ${Object.keys(enrichMap).length}`);

let updated = 0;
let skippedNoSlug = 0;
let skippedNotPlaceholder = 0;

for (const f of readdirSync(COMP).filter((x) => x.endsWith('.json'))) {
  const fp = join(COMP, f);
  const d = JSON.parse(readFileSync(fp, 'utf-8'));
  const slug = d.slug;
  if (!slug || !enrichMap[slug]) { skippedNoSlug++; continue; }

  const current = d.description || '';
  if (!isPlaceholder(current)) { skippedNotPlaceholder++; continue; }

  d.description = enrichMap[slug];

  // Also refresh seo.meta_description if it was derived from the placeholder
  if (d.seo?.meta_description && d.seo.meta_description.length < 80) {
    d.seo.meta_description = `${d.name}: ${enrichMap[slug]}`.slice(0, 160);
  }

  writeFileSync(fp, JSON.stringify(d, null, 2) + '\n');
  updated++;
}

console.log(`\nUpdated: ${updated}`);
console.log(`Skipped (no slug match): ${skippedNoSlug}`);
console.log(`Skipped (already good description): ${skippedNotPlaceholder}`);
