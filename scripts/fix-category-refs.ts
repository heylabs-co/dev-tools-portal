/**
 * Remove category.companies[] slugs that don't have a corresponding company JSON.
 * Keeps category.company_count in sync with the filtered array.
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');
const CATS = join(ROOT, 'data/categories');

const companySlugs = new Set<string>();
for (const f of readdirSync(COMP)) {
  if (!f.endsWith('.json')) continue;
  const d = JSON.parse(readFileSync(join(COMP, f), 'utf-8'));
  companySlugs.add(d.slug);
}

let catsFixed = 0;
let refsRemoved = 0;

for (const f of readdirSync(CATS)) {
  if (!f.endsWith('.json')) continue;
  const fp = join(CATS, f);
  const d = JSON.parse(readFileSync(fp, 'utf-8'));
  const refs: string[] = Array.isArray(d.companies) ? d.companies : [];
  const kept = refs.filter((s) => companySlugs.has(s));
  const removed = refs.filter((s) => !companySlugs.has(s));
  if (removed.length === 0) continue;
  d.companies = kept;
  if (typeof d.company_count === 'number') d.company_count = kept.length;
  writeFileSync(fp, JSON.stringify(d, null, 2) + '\n');
  catsFixed++;
  refsRemoved += removed.length;
  console.log(`  ${d.slug}: removed ${removed.length} (${removed.join(', ')})`);
}

console.log(`\n${catsFixed} categories cleaned, ${refsRemoved} refs removed`);
