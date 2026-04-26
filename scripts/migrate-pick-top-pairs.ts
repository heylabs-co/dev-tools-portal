/**
 * Pick the top-N migration pairs from data/comparisons/top-pairs.json based
 * on data richness. We only auto-generate guides for pairs where both tools
 * have enough catalog detail that the LLM has real material to work with —
 * a thin pair makes for a hallucinated guide.
 *
 * Score per pair:
 *   - +3 if both tools have review.verdict ≥ 100 chars
 *   - +2 if both tools have pricing.model and at least one has entry_price
 *   - +2 if both tools have categories.primary
 *   - +1 if at least one is in the HWM-flagged set (migration is more urgent)
 *   - +1 if lock-in levels differ (meaningful switch)
 *
 * Output: /tmp/migration-targets.json — array of { source, target, score }
 *
 * Usage:
 *   npx tsx scripts/migrate-pick-top-pairs.ts          # top 100
 *   npx tsx scripts/migrate-pick-top-pairs.ts --limit 50
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAIRS = JSON.parse(readFileSync(join(ROOT, 'data/comparisons/top-pairs.json'), 'utf-8')) as Array<{
  slug_a: string;
  slug_b: string;
  pair_slug: string;
  seo?: { title?: string; meta_description?: string };
  category?: string;
}>;

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = Number(arg('--limit')) || 100;

interface Company {
  slug: string;
  name: string;
  description?: string;
  categories?: { primary?: { slug?: string; name?: string } };
  pricing?: { model?: string; entry_price?: string; high_water_mark?: boolean };
  scores?: { lock_in?: { level?: string } };
  review?: { verdict?: string };
  status?: string;
}

const companyCache = new Map<string, Company | null>();
function readCompany(slug: string): Company | null {
  if (companyCache.has(slug)) return companyCache.get(slug)!;
  const path = join(ROOT, 'data/companies', `${slug}.json`);
  if (!existsSync(path)) {
    companyCache.set(slug, null);
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as Company;
    companyCache.set(slug, data);
    return data;
  } catch {
    companyCache.set(slug, null);
    return null;
  }
}

function scorePair(a: Company, b: Company): number {
  let score = 0;
  if ((a.review?.verdict?.length ?? 0) >= 100 && (b.review?.verdict?.length ?? 0) >= 100) score += 3;
  if (a.pricing?.model && b.pricing?.model && (a.pricing.entry_price || b.pricing.entry_price)) score += 2;
  if (a.categories?.primary && b.categories?.primary) score += 2;
  if (a.pricing?.high_water_mark || b.pricing?.high_water_mark) score += 1;
  const al = a.scores?.lock_in?.level;
  const bl = b.scores?.lock_in?.level;
  if (al && bl && al !== bl) score += 1;
  return score;
}

interface Target {
  source: { slug: string; name: string };
  target: { slug: string; name: string };
  pair_slug: string;
  category?: string;
  score: number;
  source_hwm: boolean;
  target_hwm: boolean;
}

const candidates: Target[] = [];
for (const p of PAIRS) {
  const a = readCompany(p.slug_a);
  const b = readCompany(p.slug_b);
  if (!a || !b) continue;
  if (a.status === 'inactive' || b.status === 'inactive') continue;

  const s = scorePair(a, b);
  // Both directions are interesting (Stripe→Adyen vs Adyen→Stripe), but for
  // v1 we only generate one direction per pair to stay within budget.
  // Direction: prefer source = HWM-flagged tool (more migration urgency).
  let source = a, target = b;
  if (b.pricing?.high_water_mark && !a.pricing?.high_water_mark) {
    source = b; target = a;
  }
  candidates.push({
    source: { slug: source.slug, name: source.name },
    target: { slug: target.slug, name: target.name },
    pair_slug: `${source.slug}-to-${target.slug}`,
    category: p.category,
    score: s,
    source_hwm: !!source.pricing?.high_water_mark,
    target_hwm: !!target.pricing?.high_water_mark,
  });
}

candidates.sort((x, y) => y.score - x.score);
const picked = candidates.slice(0, LIMIT);

writeFileSync('/tmp/migration-targets.json', JSON.stringify(picked, null, 2), 'utf-8');

console.log(`Total pairs in catalog: ${PAIRS.length}`);
console.log(`Pairs with full data on both sides: ${candidates.length}`);
console.log(`Picked top ${picked.length} for guide generation`);
console.log(`HWM source pairs: ${picked.filter((p) => p.source_hwm).length}`);
console.log('Score distribution:');
const dist: Record<number, number> = {};
for (const p of picked) dist[p.score] = (dist[p.score] ?? 0) + 1;
for (const [s, n] of Object.entries(dist).sort((a, b) => Number(b[0]) - Number(a[0]))) {
  console.log(`  score ${s}: ${n}`);
}
console.log('\nFirst 10 targets:');
for (const t of picked.slice(0, 10)) {
  const flag = t.source_hwm ? ' 🔴' : '';
  console.log(`  ${t.source.slug} → ${t.target.slug}${flag} (score ${t.score})`);
}
console.log(`\nWrote /tmp/migration-targets.json`);
