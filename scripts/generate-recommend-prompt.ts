/**
 * Generate compact tool list for the AI recommender worker.
 *
 * Reads all company JSONs from data/companies/ and outputs a pipe-delimited
 * text file at workers/recommend-api/tool-list.txt
 *
 * Format per line:
 *   slug | Name | Category | pricing model | free tier? | lock-in level
 *
 * Run: npx tsx scripts/generate-recommend-prompt.ts
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(import.meta.dirname, '..', 'data', 'companies');
const OUTPUT_FILE = join(import.meta.dirname, '..', 'workers', 'recommend-api', 'tool-list.txt');

interface CompanyJSON {
  slug: string;
  name: string;
  categories?: {
    primary?: {
      name?: string;
    };
  };
  pricing?: {
    model?: string;
    has_free_tier?: boolean;
    entry_price?: string;
  };
  scores?: {
    lock_in?: {
      level?: string;
    };
  };
  status?: string;
}

const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
console.log(`Found ${files.length} company files`);

const lines: string[] = [];

for (const file of files) {
  try {
    const raw = readFileSync(join(COMPANIES_DIR, file), 'utf-8');
    const data: CompanyJSON = JSON.parse(raw);

    if (data.status && data.status !== 'active') continue;

    const slug = data.slug || file.replace('.json', '');
    const name = data.name || slug;
    const category = data.categories?.primary?.name || 'Uncategorized';
    const pricingModel = data.pricing?.model || 'unknown';
    const hasFree = data.pricing?.has_free_tier ? 'free tier' : 'no free tier';
    const entryPrice = data.pricing?.entry_price || '';
    const lockIn = data.scores?.lock_in?.level || 'unknown';

    // Keep compact: slug | name | category | pricing | free | entry price | lock-in
    const pricePart = entryPrice ? `${pricingModel}, ${entryPrice}` : pricingModel;
    lines.push(`${slug} | ${name} | ${category} | ${pricePart} | ${hasFree} | ${lockIn} lock-in`);
  } catch (e) {
    console.warn(`Skipping ${file}: ${(e as Error).message}`);
  }
}

lines.sort();

const output = lines.join('\n');
writeFileSync(OUTPUT_FILE, output, 'utf-8');

const sizeKB = (Buffer.byteLength(output, 'utf-8') / 1024).toFixed(1);
console.log(`Wrote ${lines.length} tools to ${OUTPUT_FILE} (${sizeKB} KB)`);
