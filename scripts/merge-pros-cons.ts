/**
 * Merge pros/cons/verdict/best_for/not_for from Sonnet agents into data/companies/*.json.
 *
 * Reads /tmp/proscons-output-b*.json (JSON maps slug → review object) and writes
 * each into `review.*` — only where the target tool doesn't already have pros.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');
const INPUT_DIR = '/tmp';

type Review = {
  pros: string[];
  cons: string[];
  verdict: string;
  best_for: string;
  not_for: string;
};

const merged: Record<string, Review> = {};
const files = readdirSync(INPUT_DIR).filter((f) => /^proscons-output-b\d+\.json$/.test(f));
files.sort();

for (const f of files) {
  const fp = join(INPUT_DIR, f);
  if (!existsSync(fp)) continue;
  const obj = JSON.parse(readFileSync(fp, 'utf-8')) as Record<string, unknown>;
  let taken = 0;
  for (const [slug, review] of Object.entries(obj)) {
    if (!review || typeof review !== 'object') continue;
    const r = review as Record<string, unknown>;
    const pros = Array.isArray(r.pros) ? r.pros.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x.length >= 5 && x.length <= 100) : [];
    const cons = Array.isArray(r.cons) ? r.cons.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x.length >= 5 && x.length <= 100) : [];
    const verdict = typeof r.verdict === 'string' ? r.verdict.trim() : '';
    const best_for = typeof r.best_for === 'string' ? r.best_for.trim() : '';
    const not_for = typeof r.not_for === 'string' ? r.not_for.trim() : '';
    if (pros.length < 3 || cons.length < 3) continue;
    if (verdict.length < 40 || best_for.length < 15 || not_for.length < 15) continue;
    merged[slug] = { pros: pros.slice(0, 5), cons: cons.slice(0, 5), verdict, best_for, not_for };
    taken++;
  }
  console.log(`  ${f}: ${taken} tools`);
}
console.log(`\nTotal slugs in merged map: ${Object.keys(merged).length}`);

let updated = 0;
let skippedAlreadyHas = 0;
let skippedNotInSet = 0;

for (const f of readdirSync(COMP).filter((x) => x.endsWith('.json'))) {
  const fp = join(COMP, f);
  const d = JSON.parse(readFileSync(fp, 'utf-8'));
  const slug = d.slug;
  const incoming = Object.prototype.hasOwnProperty.call(merged, slug) ? merged[slug] : undefined;
  if (!incoming) { skippedNotInSet++; continue; }

  const hasPros = Array.isArray(d.review?.pros) && d.review.pros.length > 0;
  if (hasPros) { skippedAlreadyHas++; continue; }

  d.review = { ...(d.review ?? {}), ...incoming };
  writeFileSync(fp, JSON.stringify(d, null, 2) + '\n');
  updated++;
}

console.log(`\nUpdated: ${updated}`);
console.log(`Skipped (already has review.pros): ${skippedAlreadyHas}`);
console.log(`Skipped (no agent output): ${skippedNotInSet}`);
