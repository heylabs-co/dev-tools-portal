/**
 * Apply HWM classification results from agent output files.
 *
 * Reads /tmp/hwm-out-1.json through /tmp/hwm-out-N.json (each a JSON map
 * of slug → {hwm: boolean, reason: string}) and writes the result back
 * to data/companies/{slug}.json as pricing.high_water_mark and
 * pricing.high_water_mark_reason.
 *
 * Safe to re-run — only writes if the field is currently undefined.
 * Use --force to overwrite existing values.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const COMPANIES_DIR = join(import.meta.dirname, '..', 'data', 'companies');
const MAX_CHUNK = 20;
const FORCE = process.argv.includes('--force');

interface Result { hwm: boolean; reason: string; }

function main(): void {
  const all = new Map<string, Result>();

  for (let i = 1; i <= MAX_CHUNK; i++) {
    const path = `/tmp/hwm-out-${i}.json`;
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw);
      // Accept both shapes: { slug: {hwm, reason} } or { results: [{slug, hwm, reason}] }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed.results)) {
        for (const [slug, r] of Object.entries(parsed)) {
          if (r && typeof r === 'object' && 'hwm' in (r as any)) {
            all.set(slug, r as Result);
          }
        }
      } else if (Array.isArray(parsed?.results)) {
        for (const row of parsed.results) {
          if (row?.slug) all.set(row.slug, { hwm: !!row.hwm, reason: String(row.reason ?? '').slice(0, 160) });
        }
      }
      console.log(`  ${path} — ${Object.keys(parsed.results ?? parsed).length} entries`);
    } catch (e) {
      console.warn(`  ${path} — parse error`, e);
    }
  }

  console.log(`\nTotal classifications loaded: ${all.size}`);

  let applied = 0;
  let skipped = 0;
  let flaggedCount = 0;
  let missing = 0;

  for (const [slug, result] of all) {
    const path = join(COMPANIES_DIR, `${slug}.json`);
    if (!existsSync(path)) { missing++; continue; }
    const raw = readFileSync(path, 'utf-8');
    let data: any;
    try { data = JSON.parse(raw); } catch { continue; }

    if (!FORCE && data.pricing?.high_water_mark !== undefined) {
      skipped++;
      continue;
    }

    data.pricing = data.pricing ?? {};
    data.pricing.high_water_mark = !!result.hwm;
    data.pricing.high_water_mark_reason = String(result.reason ?? '').slice(0, 160);

    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    applied++;
    if (result.hwm) flaggedCount++;
  }

  console.log(`\nApplied:   ${applied}`);
  console.log(`  Flagged: ${flaggedCount}`);
  console.log(`  Normal:  ${applied - flaggedCount}`);
  console.log(`Skipped:   ${skipped} (already had field)`);
  console.log(`Missing:   ${missing} (slug not in catalog)`);
}

main();
