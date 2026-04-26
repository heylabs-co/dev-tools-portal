/**
 * Apply migration-out-*.json files into data/migrations/<source>-to-<target>.json.
 * Idempotent — overwrites existing guides so re-running picks up improvements.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'data', 'migrations');
mkdirSync(OUT_DIR, { recursive: true });

const TMP_FILES = readdirSync('/tmp')
  .filter((f) => f.startsWith('migration-out-') && f.endsWith('.json'))
  .sort();

let total = 0;
let written = 0;
let skipped = 0;

for (const f of TMP_FILES) {
  const path = `/tmp/${f}`;
  let arr: any[];
  try {
    arr = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    console.warn(`  ${f}: parse error, skipping`);
    continue;
  }
  if (!Array.isArray(arr)) {
    console.warn(`  ${f}: not an array, skipping`);
    continue;
  }
  for (const g of arr) {
    total++;
    if (!g || typeof g !== 'object') { skipped++; continue; }

    // Some agents flatten source/target to bare slugs instead of {slug, name}.
    // Normalize both shapes.
    const normalizeSide = (v: unknown): { slug: string; name: string } | null => {
      if (typeof v === 'string') return { slug: v, name: v };
      if (v && typeof v === 'object' && typeof (v as any).slug === 'string') {
        return { slug: (v as any).slug, name: (v as any).name ?? (v as any).slug };
      }
      return null;
    };
    const src = normalizeSide((g as any).source);
    const tgt = normalizeSide((g as any).target);
    if (!src || !tgt) { skipped++; continue; }

    const guide: any = { ...g, source: src, target: tgt };
    const outPath = join(OUT_DIR, `${src.slug}-to-${tgt.slug}.json`);
    writeFileSync(outPath, JSON.stringify(guide, null, 2) + '\n', 'utf-8');
    written++;
  }
}

console.log(`Source files: ${TMP_FILES.length}`);
console.log(`Total guides: ${total}`);
console.log(`Written:      ${written}`);
console.log(`Skipped:      ${skipped} (missing source/target)`);
console.log(`Out dir:      ${OUT_DIR}`);
