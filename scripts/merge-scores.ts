/**
 * Merge lock_in/transparency/developer_experience scores from Sonnet agents.
 *
 * Reads /tmp/scores-output-s*.json (maps slug → {lock_in, transparency, developer_experience}).
 * Preserves existing scores (only fills missing).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');
const INPUT_DIR = '/tmp';

const LEVELS = new Set(['low', 'medium', 'high']);

type Score = { level: string; score: number; reason: string };
type Triple = { lock_in: Score; transparency: Score; developer_experience: Score };

function validateScore(s: unknown): Score | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  const level = typeof o.level === 'string' ? o.level.toLowerCase() : '';
  const score = typeof o.score === 'number' ? Math.round(o.score) : -1;
  const reason = typeof o.reason === 'string' ? o.reason.trim().slice(0, 160) : '';
  if (!LEVELS.has(level) || score < 0 || score > 5) return null;
  return { level, score, reason };
}

const merged: Record<string, Triple> = {};
const files = readdirSync(INPUT_DIR).filter((f) => /^scores-output-s\d+\.json$/.test(f));
files.sort();

for (const f of files) {
  const fp = join(INPUT_DIR, f);
  if (!existsSync(fp)) continue;
  const obj = JSON.parse(readFileSync(fp, 'utf-8')) as Record<string, unknown>;
  let taken = 0;
  for (const [slug, val] of Object.entries(obj)) {
    if (!val || typeof val !== 'object') continue;
    const v = val as Record<string, unknown>;
    const lock_in = validateScore(v.lock_in);
    const transparency = validateScore(v.transparency);
    const developer_experience = validateScore(v.developer_experience);
    if (!lock_in || !transparency || !developer_experience) continue;
    merged[slug] = { lock_in, transparency, developer_experience };
    taken++;
  }
  console.log(`  ${f}: ${taken}`);
}
console.log(`\nTotal: ${Object.keys(merged).length}`);

let updated = 0, skippedAll = 0, skippedNo = 0;
for (const f of readdirSync(COMP).filter((x) => x.endsWith('.json'))) {
  const fp = join(COMP, f);
  const d = JSON.parse(readFileSync(fp, 'utf-8'));
  const slug = d.slug;
  const incoming = Object.prototype.hasOwnProperty.call(merged, slug) ? merged[slug] : undefined;
  if (!incoming) { skippedNo++; continue; }
  d.scores = d.scores ?? {};
  let changed = false;
  if (!d.scores.lock_in?.level) { d.scores.lock_in = incoming.lock_in; changed = true; }
  if (!d.scores.transparency?.level) { d.scores.transparency = incoming.transparency; changed = true; }
  if (!d.scores.developer_experience?.level) { d.scores.developer_experience = incoming.developer_experience; changed = true; }
  if (changed) {
    writeFileSync(fp, JSON.stringify(d, null, 2) + '\n');
    updated++;
  } else {
    skippedAll++;
  }
}

console.log(`\nUpdated: ${updated}  Skipped (all present): ${skippedAll}  Skipped (no agent out): ${skippedNo}`);
