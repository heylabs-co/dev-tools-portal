/**
 * Prepare chunked input files for the HWM tagging agents.
 *
 * Reads all data/companies/*.json, skips ones that already have
 * pricing.high_water_mark set, and writes compact JSONL chunks to /tmp:
 *   /tmp/hwm-chunk-1.jsonl … /tmp/hwm-chunk-N.jsonl
 *
 * Each chunk has N tools. Each line is a JSON object with the fields the
 * agent needs to decide (slug, name, category, pricing, short description
 * snippet, verdict snippet) — keeps input small so one agent can classify
 * hundreds of tools with just 1 Read.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const COMPANIES_DIR = join(import.meta.dirname, '..', 'data', 'companies');
const CHUNKS = 10;
const OUT_PREFIX = '/tmp/hwm-chunk-';

function take(s: string | undefined | null, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function digest(data: any): Record<string, unknown> {
  return {
    slug: data.slug,
    name: data.name,
    category: data.categories?.primary?.name,
    description: take(data.description, 300),
    pricing_model: data.pricing?.model,
    has_free_tier: data.pricing?.has_free_tier,
    entry_price: data.pricing?.entry_price,
    enterprise_available: data.pricing?.enterprise_available,
    verdict: take(data.review?.verdict, 240),
    not_for: take(data.review?.not_for, 120),
  };
}

function main(): void {
  const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
  const pending: Record<string, unknown>[] = [];

  for (const f of files) {
    try {
      const raw = readFileSync(join(COMPANIES_DIR, f), 'utf-8');
      const data = JSON.parse(raw);
      if (data.pricing?.high_water_mark !== undefined) continue;
      pending.push(digest(data));
    } catch { /* skip */ }
  }

  console.log(`Pending to classify: ${pending.length}`);
  const chunkSize = Math.ceil(pending.length / CHUNKS);
  console.log(`Splitting into ${CHUNKS} chunks of ~${chunkSize} tools each`);

  for (let i = 0; i < CHUNKS; i++) {
    const chunk = pending.slice(i * chunkSize, (i + 1) * chunkSize);
    const path = `${OUT_PREFIX}${i + 1}.jsonl`;
    writeFileSync(path, chunk.map((d) => JSON.stringify(d)).join('\n'), 'utf-8');
    console.log(`  ${path} — ${chunk.length} tools`);
  }
}

main();
