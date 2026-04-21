/**
 * Merge pricing model classifications from Sonnet agents into data/companies/*.json.
 *
 * Reads /tmp/pricing-output-p*.json (JSON maps slug → {model, has_free_tier}).
 * Only writes to tools that don't already have pricing.model set.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');
const INPUT_DIR = '/tmp';

const VALID_MODELS = new Set([
  'subscription', 'freemium', 'usage', 'seat', 'hybrid', 'free', 'custom', 'unknown',
]);

type Out = { model: string; has_free_tier: boolean };

const merged: Record<string, Out> = {};
const files = readdirSync(INPUT_DIR).filter((f) => /^pricing-output-p\d+\.json$/.test(f));
files.sort();

for (const f of files) {
  const fp = join(INPUT_DIR, f);
  if (!existsSync(fp)) continue;
  const obj = JSON.parse(readFileSync(fp, 'utf-8')) as Record<string, unknown>;
  let taken = 0;
  for (const [slug, val] of Object.entries(obj)) {
    if (!val || typeof val !== 'object') continue;
    const v = val as Record<string, unknown>;
    const model = typeof v.model === 'string' ? v.model.toLowerCase() : '';
    if (!VALID_MODELS.has(model)) continue;
    merged[slug] = { model, has_free_tier: Boolean(v.has_free_tier) };
    taken++;
  }
  console.log(`  ${f}: ${taken}`);
}
console.log(`\nTotal: ${Object.keys(merged).length}`);

let updated = 0, skippedHas = 0, skippedNo = 0;
for (const f of readdirSync(COMP).filter((x) => x.endsWith('.json'))) {
  const fp = join(COMP, f);
  const d = JSON.parse(readFileSync(fp, 'utf-8'));
  const slug = d.slug;
  const incoming = Object.prototype.hasOwnProperty.call(merged, slug) ? merged[slug] : undefined;
  if (!incoming) { skippedNo++; continue; }
  if (d.pricing?.model) { skippedHas++; continue; }

  d.pricing = d.pricing ?? {};
  d.pricing.model = incoming.model;
  if (d.pricing.has_free_tier === undefined) d.pricing.has_free_tier = incoming.has_free_tier;
  writeFileSync(fp, JSON.stringify(d, null, 2) + '\n');
  updated++;
}

console.log(`\nUpdated: ${updated}  Skipped (has): ${skippedHas}  Skipped (no): ${skippedNo}`);
