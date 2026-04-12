/**
 * Fetch Hacker News mention counts (last 30 days) for each company.
 * Uses Algolia HN Search API.
 *
 * Usage: npx tsx scripts/fetch-hn.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(process.cwd(), 'data/companies');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CompanyData {
  name: string;
  community?: {
    hn_mentions_30d?: number;
    [key: string]: unknown;
  };
  updated_at?: string;
  [key: string]: unknown;
}

async function fetchHNMentions(query: string): Promise<number> {
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=5&numericFilters=created_at_i>${thirtyDaysAgo}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN API ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as { nbHits: number };
  return data.nbHits;
}

async function main() {
  const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} company files`);

  let updated = 0;

  for (const file of files) {
    const filePath = join(COMPANIES_DIR, file);
    const data: CompanyData = JSON.parse(readFileSync(filePath, 'utf-8'));

    try {
      const mentions = await fetchHNMentions(data.name);
      const oldMentions = data.community?.hn_mentions_30d;

      if (oldMentions !== mentions) {
        if (!data.community) data.community = {};
        data.community.hn_mentions_30d = mentions;
        data.updated_at = new Date().toISOString();
        writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
        updated++;
        console.log(`Updated ${data.name} — ${mentions} HN mentions (30d)`);
      } else {
        console.log(`Unchanged ${data.name} — ${mentions} HN mentions (30d)`);
      }
    } catch (err: any) {
      console.error(`Error fetching ${data.name}: ${err.message}`);
    }

    await sleep(200);
  }

  console.log(`\nDone. Updated: ${updated} of ${files.length} companies`);
}

main();
