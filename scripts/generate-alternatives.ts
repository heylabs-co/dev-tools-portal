/**
 * For every company, pre-compute up to 5 "real competitors" from the same
 * primary category, ranked by the same composite score used for compare
 * pair generation (stars + DX + HN mentions). Written to
 * public/api/alternatives.json as a flat map { slug: [slug, ...] }.
 *
 * Runs at build time so /compare/ can show suggestions the instant the
 * user picks Tool A — no client-side ranking, no per-tool fetches.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');
const OUT_DIR = join(ROOT, 'public/api');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const OUT = join(OUT_DIR, 'alternatives.json');

const TOP_N = 5;

type Company = {
  slug: string;
  name: string;
  categories?: { primary?: { slug?: string } };
  health?: { stars?: number };
  github?: { stars?: number };
  scores?: { developer_experience?: { score?: number } };
  community?: { hn_mentions_30d?: number };
};

const companies: Company[] = [];
for (const f of readdirSync(COMP)) {
  if (!f.endsWith('.json')) continue;
  companies.push(JSON.parse(readFileSync(join(COMP, f), 'utf-8')));
}

function score(c: Company): number {
  const stars = c.health?.stars ?? c.github?.stars ?? 0;
  const dx = c.scores?.developer_experience?.score ?? 2.5;
  const hn = c.community?.hn_mentions_30d ?? 0;
  return Math.log10(stars + 1) + dx * 0.5 + Math.log10(hn + 1) * 0.3;
}

function isSibling(a: string, b: string): boolean {
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return long.startsWith(short + '-');
}

// Group by primary category slug
const byCategory: Record<string, Company[]> = {};
for (const c of companies) {
  const cat = c.categories?.primary?.slug;
  if (!cat) continue;
  (byCategory[cat] ??= []).push(c);
}
for (const cat of Object.keys(byCategory)) {
  byCategory[cat].sort((a, b) => score(b) - score(a));
}

const alternatives: Record<string, string[]> = {};
let coverage = 0;
for (const c of companies) {
  const cat = c.categories?.primary?.slug;
  if (!cat) continue;
  const siblings = byCategory[cat] ?? [];
  const alts: string[] = [];
  for (const s of siblings) {
    if (s.slug === c.slug) continue;
    if (isSibling(s.slug, c.slug)) continue;
    alts.push(s.slug);
    if (alts.length >= TOP_N) break;
  }
  if (alts.length > 0) {
    alternatives[c.slug] = alts;
    coverage++;
  }
}

writeFileSync(OUT, JSON.stringify(alternatives));
const sizeKB = (JSON.stringify(alternatives).length / 1024).toFixed(1);
console.log(`Wrote ${OUT}`);
console.log(`Covered: ${coverage} / ${companies.length} companies`);
console.log(`File size: ${sizeKB} KB`);
