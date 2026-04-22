/**
 * Read agent outputs /tmp/compare-output-c*.json and split them into
 * per-pair files in data/comparisons/enrichment/<pair_slug>.json.
 *
 * Each agent output is a JSON object keyed by pair_slug mapping to
 * { intro, quick_take, verdict_a, verdict_b, faq[{q,a}] }.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const INPUT_DIR = '/tmp';
const OUT_DIR = join(ROOT, 'data/comparisons/enrichment');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

type Enrichment = {
  intro: string;
  quick_take: string;
  verdict_a: string;
  verdict_b: string;
  faq: Array<{ q: string; a: string }>;
};

function validate(e: any): Enrichment | null {
  if (
    !e ||
    typeof e.intro !== 'string' ||
    typeof e.quick_take !== 'string' ||
    typeof e.verdict_a !== 'string' ||
    typeof e.verdict_b !== 'string' ||
    !Array.isArray(e.faq) ||
    e.faq.length < 3
  )
    return null;
  for (const f of e.faq) {
    if (typeof f.q !== 'string' || typeof f.a !== 'string') return null;
  }
  return {
    intro: e.intro.trim(),
    quick_take: e.quick_take.trim(),
    verdict_a: e.verdict_a.trim(),
    verdict_b: e.verdict_b.trim(),
    faq: e.faq.map((f: any) => ({ q: f.q.trim(), a: f.a.trim() })),
  };
}

const files = readdirSync(INPUT_DIR).filter((f) =>
  /^compare-output-c\w+\.json$/.test(f),
);
files.sort();

let total = 0;
let written = 0;
let skippedExisting = 0;
let failedValidation = 0;

for (const f of files) {
  const fp = join(INPUT_DIR, f);
  let data: Record<string, any>;
  try {
    data = JSON.parse(readFileSync(fp, 'utf-8'));
  } catch (e) {
    console.warn(`  ! ${f}: could not parse JSON — ${(e as Error).message}`);
    continue;
  }
  let perFileWritten = 0;
  let perFileSkipped = 0;
  let perFileBad = 0;
  for (const [pairSlug, raw] of Object.entries(data)) {
    total++;
    const validated = validate(raw);
    if (!validated) {
      perFileBad++;
      failedValidation++;
      continue;
    }
    const outPath = join(OUT_DIR, `${pairSlug}.json`);
    if (existsSync(outPath)) {
      perFileSkipped++;
      skippedExisting++;
      continue;
    }
    writeFileSync(outPath, JSON.stringify(validated, null, 2) + '\n');
    perFileWritten++;
    written++;
  }
  console.log(
    `  ${f}: wrote=${perFileWritten}  skipped=${perFileSkipped}  invalid=${perFileBad}`,
  );
}

console.log(`\nTotal entries seen: ${total}`);
console.log(`Written:            ${written}`);
console.log(`Skipped (existing): ${skippedExisting}`);
console.log(`Failed validation:  ${failedValidation}`);
console.log(`Total enrichment files: ${readdirSync(OUT_DIR).filter((f) => f.endsWith('.json')).length}`);
