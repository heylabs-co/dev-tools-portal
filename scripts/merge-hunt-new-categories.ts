/**
 * Merge hunt-agent outputs for 5 new categories into data/companies/.
 *
 * Reads /tmp/hunt-*.json files (from the Dev Education / Design / Monorepo /
 * Accessibility / Game Dev agents), dedupes against existing slugs,
 * validates categories, and writes each accepted row as a new company JSON.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');
const CATS = join(ROOT, 'data/categories');

const HUNT_FILES = [
  '/tmp/hunt-developer-education.json',
  '/tmp/hunt-design-tools.json',
  '/tmp/hunt-monorepo-tooling.json',
  '/tmp/hunt-accessibility.json',
  '/tmp/hunt-game-dev.json',
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
function getDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch { return url; }
}

const existingSlugs = new Set<string>();
const existingNames = new Set<string>();
const existingDomains = new Set<string>();
for (const f of readdirSync(COMP).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(COMP, f), 'utf-8'));
  existingSlugs.add(d.slug || f.replace('.json', ''));
  existingNames.add((d.name || '').toLowerCase().trim());
  if (d.website) existingDomains.add(getDomain(d.website));
}

const categoryBySlug: Record<string, any> = {};
for (const f of readdirSync(CATS).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(CATS, f), 'utf-8'));
  categoryBySlug[d.slug] = d;
}
const validCats = new Set(Object.keys(categoryBySlug));

let created = 0;
let skippedDupe = 0;
let skippedBad = 0;
let skippedCat = 0;
const byCat: Record<string, string[]> = {};

for (const f of HUNT_FILES) {
  if (!existsSync(f)) {
    console.log(`Skipping missing file: ${f}`);
    continue;
  }
  const arr = JSON.parse(readFileSync(f, 'utf-8')) as any[];
  for (const r of arr) {
    const name = (r.name || '').trim();
    const website = (r.website || '').trim();
    if (!name || !website || name.length > 80) { skippedBad++; continue; }

    const slug = (r.slug || slugify(name)).trim();
    const nameLower = name.toLowerCase();
    const domain = getDomain(website);

    if (existingSlugs.has(slug)) { skippedDupe++; continue; }
    if (existingNames.has(nameLower)) { skippedDupe++; continue; }
    if (existingDomains.has(domain)) { skippedDupe++; continue; }

    // Accept flat or nested category — some agents used r.category_slug, others r.categories.primary.slug
    let catSlug = (r.category_slug || r.categories?.primary?.slug || r.category || '').trim();
    if (!validCats.has(catSlug)) { skippedCat++; continue; }
    const catData = categoryBySlug[catSlug];

    const websiteFull = website.startsWith('http') ? website : `https://${website}`;
    const description = (r.description || `${name} — ${catData.name} tool.`).replace(/[<>"'`]/g, '').slice(0, 240);

    const entry: any = {
      id: slug,
      slug,
      name,
      website: websiteFull,
      description,
      logo: `https://logo.clearbit.com/${domain}`,
      status: 'active',
      categories: { primary: { id: catData.id, slug: catData.slug, name: catData.name } },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (r.hq_country && typeof r.hq_country === 'string' && r.hq_country.length <= 3 && r.hq_country !== 'Unknown') {
      entry.hq_country = r.hq_country.toUpperCase();
    }
    const fy = typeof r.founded_year === 'number' ? r.founded_year : parseInt(String(r.founded_year || ''));
    if (fy && fy > 1900 && fy <= 2026) entry.founded = fy;
    if (r.github_repo && typeof r.github_repo === 'string' && r.github_repo.includes('/')) {
      entry.github = { repo: r.github_repo };
    }
    entry.seo = {
      title: `${name} — ${catData.name}`,
      meta_description: `${name}: ${description}`.slice(0, 160),
    };

    writeFileSync(join(COMP, `${slug}.json`), JSON.stringify(entry, null, 2) + '\n');
    existingSlugs.add(slug);
    existingNames.add(nameLower);
    existingDomains.add(domain);
    (byCat[catSlug] = byCat[catSlug] || []).push(slug);
    created++;
  }
}

// Update category files
let updatedCats = 0;
for (const [cat, slugs] of Object.entries(byCat)) {
  const fp = join(CATS, `${cat}.json`);
  const d = JSON.parse(readFileSync(fp, 'utf-8'));
  d.companies = Array.from(new Set([...(d.companies || []), ...slugs])).sort();
  d.company_count = d.companies.length;
  writeFileSync(fp, JSON.stringify(d, null, 2) + '\n');
  updatedCats++;
}

console.log(`Created: ${created}`);
console.log(`Skipped dupes: ${skippedDupe}`);
console.log(`Skipped bad: ${skippedBad}`);
console.log(`Skipped cat: ${skippedCat}`);
console.log(`Categories updated: ${updatedCats}`);
console.log(`\nBy category:`);
for (const [c, s] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${s.length.toString().padStart(4)} ${c}`);
}
