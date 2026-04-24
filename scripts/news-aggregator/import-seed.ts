/**
 * Load seed-handles.json into the SQLite handles table.
 * Re-runnable (UPSERT).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { upsertHandle, db } from './storage.js';

const seedPath = join(process.cwd(), 'scripts/news-aggregator/data/seed-handles.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf-8')) as Array<{
  handle: string;
  name?: string;
  category?: string;
  tier?: number;
  description?: string;
}>;

let added = 0;
for (const h of seed) {
  upsertHandle({ ...h, source: 'seed' });
  added++;
}

const total = (db().prepare(`SELECT COUNT(*) AS c FROM handles`).get() as any).c;
const byTier = db().prepare(`SELECT tier, COUNT(*) AS c FROM handles GROUP BY tier ORDER BY tier`).all() as any[];
const byCat = db().prepare(`SELECT category, COUNT(*) AS c FROM handles GROUP BY category ORDER BY c DESC`).all() as any[];

console.log(`Upserted: ${added}`);
console.log(`Total handles in db: ${total}`);
console.log('By tier:', byTier);
console.log('By category:');
for (const row of byCat) console.log(`  ${String(row.category).padEnd(28)} ${row.c}`);
