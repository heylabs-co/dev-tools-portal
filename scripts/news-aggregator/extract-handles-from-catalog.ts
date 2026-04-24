/**
 * Pull X/Twitter handles out of our existing catalog of 5977 tools.
 *
 * Looks at:
 *   - company.twitter (if we ever added this field — probably not yet)
 *   - anywhere in the JSON that contains "twitter.com/..." or "x.com/..."
 *
 * Writes scripts/news-aggregator/data/handles-from-catalog.json:
 *   [{ handle, company_slug, company_name, source: "catalog-company" }]
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');
const OUT = join(ROOT, 'scripts/news-aggregator/data/handles-from-catalog.json');

const TWITTER_RE =
  /(?:twitter\.com|x\.com)\/(?!i\/|home|search|explore|notifications|messages|settings|intent|hashtag|share)([A-Za-z0-9_]{1,15})/gi;

const BLOCK = new Set(['intent', 'search', 'hashtag', 'share', 'home', 'i', 'explore']);

type Hit = {
  handle: string;
  company_slug: string;
  company_name: string;
  source: string;
};

const seen = new Map<string, Hit>();

for (const f of readdirSync(COMP)) {
  if (!f.endsWith('.json')) continue;
  const d = JSON.parse(readFileSync(join(COMP, f), 'utf-8'));
  const blob = JSON.stringify(d);
  const matches = blob.matchAll(TWITTER_RE);
  for (const m of matches) {
    const handle = m[1];
    if (BLOCK.has(handle.toLowerCase())) continue;
    if (handle.length < 2) continue;
    const key = handle.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, {
        handle,
        company_slug: d.slug,
        company_name: d.name,
        source: 'catalog-company',
      });
    }
  }
}

const out = [...seen.values()].sort((a, b) => a.handle.localeCompare(b.handle));
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`Extracted ${out.length} unique handles from catalog → ${OUT}`);
