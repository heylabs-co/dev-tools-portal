/**
 * Prepare shard files so that Sonnet agents each process a subset
 * of the 1,070 compare pairs.
 *
 * Writes /tmp/compare-shards/shard-<N>.json:
 *   { pairs: [{ pair_slug, a: {...slim}, b: {...slim} }, ...] }
 *
 * Usage:
 *   npx tsx scripts/prepare-compare-shards.ts                 # 10 shards
 *   npx tsx scripts/prepare-compare-shards.ts --shards 20     # custom
 *   npx tsx scripts/prepare-compare-shards.ts --pilot 20      # single pilot shard of N pairs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const PAIRS = join(ROOT, 'data/comparisons/top-pairs.json');
const COMP = join(ROOT, 'data/companies');
const OUT_DIR = '/tmp/compare-shards';
const ENRICH_DIR = join(ROOT, 'data/comparisons/enrichment');

const args = process.argv.slice(2);
const shardsArg = args.find((a) => a.startsWith('--shards'));
const pilotArg = args.find((a) => a.startsWith('--pilot'));
const SHARDS = shardsArg ? parseInt(shardsArg.split(/[= ]/)[1] ?? args[args.indexOf('--shards') + 1], 10) : 10;
const PILOT = pilotArg ? parseInt(pilotArg.split(/[= ]/)[1] ?? args[args.indexOf('--pilot') + 1], 10) : 0;

// Fresh dir each run
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

function slim(c: any) {
  return {
    name: c.name,
    description: c.description,
    category: c.categories?.primary?.name,
    pricing: c.pricing
      ? {
          model: c.pricing.model,
          has_free_tier: c.pricing.has_free_tier,
          entry_price: c.pricing.entry_price,
          enterprise_available: c.pricing.enterprise_available,
        }
      : null,
    lock_in: c.scores?.lock_in
      ? {
          level: c.scores.lock_in.level,
          migration_complexity: c.scores.lock_in.migration_complexity,
          reason: c.scores.lock_in.explanation || c.scores.lock_in.reason,
        }
      : null,
    developer_experience: c.scores?.developer_experience?.score ?? null,
    transparency: c.scores?.transparency?.score ?? null,
    pros: c.review?.pros?.slice(0, 4) ?? [],
    cons: c.review?.cons?.slice(0, 4) ?? [],
    best_for: c.review?.best_for,
    not_for: c.review?.not_for,
    verdict: c.review?.verdict,
    when_to_use: c.content?.when_to_use?.slice(0, 4) ?? [],
  };
}

type Pair = { slug_a: string; slug_b: string; pair_slug: string; category: string };
const pairs: Pair[] = JSON.parse(readFileSync(PAIRS, 'utf-8'));
const companies: Record<string, any> = {};

// Load only companies we need
const needed = new Set<string>();
pairs.forEach((p) => {
  needed.add(p.slug_a);
  needed.add(p.slug_b);
});
for (const slug of needed) {
  const fp = join(COMP, `${slug}.json`);
  if (existsSync(fp)) companies[slug] = JSON.parse(readFileSync(fp, 'utf-8'));
}

// Filter valid pairs + skip ones already enriched
const alreadyEnriched = new Set<string>();
if (existsSync(ENRICH_DIR)) {
  readdirSync(ENRICH_DIR).forEach((f: string) => {
    if (f.endsWith('.json')) alreadyEnriched.add(f.replace(/\.json$/, ''));
  });
}

const toEnrich = pairs.filter(
  (p) =>
    companies[p.slug_a] &&
    companies[p.slug_b] &&
    !alreadyEnriched.has(p.pair_slug),
);

console.log(`Total pairs: ${pairs.length}`);
console.log(`Already enriched: ${alreadyEnriched.size}`);
console.log(`To enrich: ${toEnrich.length}`);

// ── Pilot mode ──────────────────────────────────────────────────────────
if (PILOT > 0) {
  // Representative sample: take pairs stratified across categories
  const byCat: Record<string, Pair[]> = {};
  for (const p of toEnrich) {
    (byCat[p.category] ??= []).push(p);
  }
  const sample: Pair[] = [];
  const cats = Object.keys(byCat);
  let ci = 0;
  while (sample.length < PILOT && sample.length < toEnrich.length) {
    const cat = cats[ci % cats.length];
    const p = byCat[cat].shift();
    if (p) sample.push(p);
    ci++;
  }
  const shard = sample.map((p) => ({
    pair_slug: p.pair_slug,
    category: p.category,
    a: slim(companies[p.slug_a]),
    b: slim(companies[p.slug_b]),
  }));
  writeFileSync(join(OUT_DIR, 'shard-pilot.json'), JSON.stringify({ pairs: shard }, null, 2));
  console.log(`\nPILOT: wrote shard-pilot.json with ${shard.length} pairs from ${new Set(sample.map((p) => p.category)).size} categories`);
  process.exit(0);
}

// ── Full shards ─────────────────────────────────────────────────────────
const perShard = Math.ceil(toEnrich.length / SHARDS);
for (let s = 0; s < SHARDS; s++) {
  const start = s * perShard;
  const slice = toEnrich.slice(start, start + perShard);
  if (!slice.length) break;
  const shard = slice.map((p) => ({
    pair_slug: p.pair_slug,
    category: p.category,
    a: slim(companies[p.slug_a]),
    b: slim(companies[p.slug_b]),
  }));
  writeFileSync(join(OUT_DIR, `shard-${s}.json`), JSON.stringify({ pairs: shard }, null, 2));
  console.log(`  shard-${s}.json: ${shard.length} pairs`);
}
