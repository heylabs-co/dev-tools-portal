/**
 * Merge per-tool use cases from Sonnet agents into data/companies/*.json.
 *
 * Reads /tmp/usecases-output-*.json (JSON maps slug → string[]) and writes
 * each array into `content.when_to_use[]` — only where the target tool
 * has fewer than 3 use cases today (preserves richer manual content).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');

const INPUT_FILES = [
  '/tmp/usecases-output-ai.json',
  '/tmp/usecases-output-infra.json',
  '/tmp/usecases-output-security.json',
  '/tmp/usecases-output-devops.json',
  '/tmp/usecases-output-paymob-a.json',
  '/tmp/usecases-output-paymob-b.json',
  '/tmp/usecases-output-apis-dev.json',
  '/tmp/usecases-output-growth.json',
  '/tmp/usecases-output-devex.json',
];

const merged: Record<string, string[]> = {};
for (const f of INPUT_FILES) {
  if (!existsSync(f)) {
    console.log(`Missing: ${f}`);
    continue;
  }
  const obj = JSON.parse(readFileSync(f, 'utf-8')) as Record<string, unknown>;
  let taken = 0;
  for (const [slug, arr] of Object.entries(obj)) {
    if (!Array.isArray(arr)) continue;
    const cleaned = arr
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => x.length >= 20 && x.length <= 200);
    if (cleaned.length < 3) continue;
    merged[slug] = cleaned.slice(0, 5);
    taken++;
  }
  console.log(`  ${f.replace('/tmp/', '')}: ${taken} tools enriched`);
}
console.log(`\nTotal slugs with enriched use cases: ${Object.keys(merged).length}`);

let updated = 0;
let skippedAlreadyRich = 0;
let skippedNotInSet = 0;

for (const f of readdirSync(COMP).filter((x) => x.endsWith('.json'))) {
  const fp = join(COMP, f);
  const d = JSON.parse(readFileSync(fp, 'utf-8'));
  const slug = d.slug;
  const incoming = Object.prototype.hasOwnProperty.call(merged, slug) ? merged[slug] : undefined;
  if (!incoming) { skippedNotInSet++; continue; }

  const current = Array.isArray(d.content?.when_to_use) ? d.content.when_to_use : [];
  if (current.length >= 3) { skippedAlreadyRich++; continue; }

  d.content = d.content ?? {};
  d.content.when_to_use = incoming;
  writeFileSync(fp, JSON.stringify(d, null, 2) + '\n');
  updated++;
}

console.log(`\nUpdated: ${updated}`);
console.log(`Skipped (already rich): ${skippedAlreadyRich}`);
console.log(`Skipped (no agent output): ${skippedNotInSet}`);
