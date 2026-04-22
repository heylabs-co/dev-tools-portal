/**
 * Phase 1 of the compare-expansion plan.
 *
 * For each category, rank its companies by a composite score
 * (GitHub stars + DX score + HN mentions), take top 7, then
 * generate all C(7,2) = 21 pairs. Skip sibling products
 * (slug prefix) and anything already in top-pairs.json.
 *
 * Writes to data/comparisons/top-pairs.json. Idempotent: re-running
 * preserves existing pairs and only appends new ones.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');
const CATS = join(ROOT, 'data/categories');
const OUT = join(ROOT, 'data/comparisons/top-pairs.json');

const TOP_N = 7;

type Company = any;

// ── Load ────────────────────────────────────────────────────────────────
const companies: Record<string, Company> = {};
for (const f of readdirSync(COMP)) {
  if (!f.endsWith('.json')) continue;
  const d = JSON.parse(readFileSync(join(COMP, f), 'utf-8'));
  companies[d.slug] = d;
}
console.log(`Loaded ${Object.keys(companies).length} companies`);

// ── Score ───────────────────────────────────────────────────────────────
function score(c: Company): number {
  const stars = c.health?.stars ?? c.github?.stars ?? 0;
  const dx = c.scores?.developer_experience?.score ?? 2.5;
  const hn = c.community?.hn_mentions_30d ?? 0;
  // log10 keeps stars from overwhelming — ties broken by DX + HN
  return Math.log10(stars + 1) + dx * 0.5 + Math.log10(hn + 1) * 0.3;
}

// ── Sibling detection ───────────────────────────────────────────────────
function isSibling(a: string, b: string): boolean {
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  // "stripe" vs "stripe-cli" → skip. "1password" vs "1password-secrets" → skip.
  return long.startsWith(short + '-');
}

// ── Dedup against existing ──────────────────────────────────────────────
type Pair = {
  slug_a: string;
  slug_b: string;
  category: string;
  pair_slug: string;
  seo: { title: string; meta_description: string };
};

const existing: Pair[] = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, 'utf-8'))
  : [];
console.log(`Existing pairs: ${existing.length}`);

const seen = new Set<string>();
for (const p of existing) {
  seen.add(`${p.slug_a}:${p.slug_b}`);
  seen.add(`${p.slug_b}:${p.slug_a}`);
}

// ── Generate ────────────────────────────────────────────────────────────
const out: Pair[] = [...existing];
let created = 0;
let skippedSibling = 0;
let skippedDup = 0;
const perCategory: Record<string, number> = {};

for (const f of readdirSync(CATS)) {
  if (!f.endsWith('.json')) continue;
  const cat = JSON.parse(readFileSync(join(CATS, f), 'utf-8'));
  const slugs: string[] = Array.isArray(cat.companies) ? cat.companies : [];

  const ranked = slugs
    .map((s) => companies[s])
    .filter((c): c is Company => c !== undefined)
    .sort((a, b) => score(b) - score(a))
    .slice(0, TOP_N);

  if (ranked.length < 2) continue;

  let catAdded = 0;
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const a = ranked[i];
      const b = ranked[j];
      if (isSibling(a.slug, b.slug)) {
        skippedSibling++;
        continue;
      }
      const key = `${a.slug}:${b.slug}`;
      if (seen.has(key)) {
        skippedDup++;
        continue;
      }
      seen.add(key);
      seen.add(`${b.slug}:${a.slug}`);

      out.push({
        slug_a: a.slug,
        slug_b: b.slug,
        category: cat.slug,
        pair_slug: `${a.slug}-vs-${b.slug}`,
        seo: {
          title: `${a.name} vs ${b.name} 2026: Pricing, Lock-in & Migration`,
          meta_description: `Side-by-side comparison of ${a.name} and ${b.name}: pricing, lock-in risk, developer experience, and total cost of ownership.`,
        },
      });
      created++;
      catAdded++;
    }
  }
  if (catAdded > 0) perCategory[cat.slug] = catAdded;
}

// ── Sort for stable diff ────────────────────────────────────────────────
out.sort((a, b) => {
  const cat = (a.category ?? '').localeCompare(b.category ?? '');
  if (cat !== 0) return cat;
  return a.pair_slug.localeCompare(b.pair_slug);
});

// ── Write ───────────────────────────────────────────────────────────────
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

// ── Report ──────────────────────────────────────────────────────────────
console.log(`\nTotal pairs in file:     ${out.length}`);
console.log(`  Pre-existing:          ${existing.length}`);
console.log(`  Newly created:         ${created}`);
console.log(`  Skipped (sibling):     ${skippedSibling}`);
console.log(`  Skipped (duplicate):   ${skippedDup}`);
console.log(`\nTop 15 categories by new-pair count:`);
Object.entries(perCategory)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([k, v]) => console.log(`  ${k.padEnd(32)} ${v}`));

console.log(`\nSample of 20 new pairs across categories:`);
const newPairs = out.slice(existing.length);
const sample = newPairs.filter((_, i) => i % Math.max(1, Math.floor(newPairs.length / 20)) === 0).slice(0, 20);
for (const p of sample) {
  console.log(`  [${p.category}] ${p.pair_slug}`);
}
