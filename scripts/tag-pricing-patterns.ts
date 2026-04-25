/**
 * tag-pricing-patterns.ts
 *
 * One-shot (resumable) batch LLM pass that flags `pricing.high_water_mark` +
 * `pricing.high_water_mark_reason` across data/companies/*.json.
 *
 * Uses Gemini 2.0 Flash via OpenRouter (1M context, cheap, already used in
 * workers/recommend-api/worker.js).
 *
 * Cost: ~$2-5 across the full 5,978-file catalog on Gemini 2.0 Flash.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/tag-pricing-patterns.ts
 *   ... --limit 50        # process only N pending files
 *   ... --dry-run         # don't write anything, just print decisions
 *   ... --force           # re-classify files that already have the field
 *   ... --concurrency 10  # parallel requests (default 10)
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error('ERROR: OPENROUTER_API_KEY not set');
  process.exit(1);
}

const COMPANIES_DIR = join(import.meta.dirname, '..', 'data', 'companies');
const MODEL = 'google/gemini-2.0-flash-001';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');
const LIMIT = Number(arg('--limit')) || 0;
const CONCURRENCY = Number(arg('--concurrency')) || 10;

const SYSTEM_PROMPT = `You label a developer tool's pricing model with a single boolean: is it "high water mark pricing"?

"High water mark pricing" = the bill locks to peak usage / reserved capacity during a billing period and does NOT scale DOWN within the cycle. Examples: Datadog (peak host count per month), Snowflake reserved capacity, Splunk commit tiers, annual seat commits, reserved throughput you pay for even if unused.

NOT high water mark:
- Pure usage-based metered billing that scales up AND down (AWS Lambda, Stripe, Twilio per-SMS)
- Monthly subscriptions that you can downgrade on the next cycle
- Free tier with overage charges only on actual usage
- Hobby/indie tiers with soft limits

Return STRICT JSON only:
{"high_water_mark": true|false, "reason": "<=120 chars explaining the mechanism or 'standard metered' if false"}`;

interface Result {
  high_water_mark: boolean;
  reason: string;
}

async function classifyOne(data: any): Promise<Result | null> {
  const summary = [
    `Name: ${data.name ?? data.slug}`,
    data.categories?.primary?.name ? `Category: ${data.categories.primary.name}` : '',
    data.description ? `Description: ${String(data.description).slice(0, 400)}` : '',
    data.pricing?.model ? `Model: ${data.pricing.model}` : '',
    data.pricing?.has_free_tier !== undefined ? `Free tier: ${data.pricing.has_free_tier}` : '',
    data.pricing?.entry_price ? `Entry price: ${data.pricing.entry_price}` : '',
    data.review?.verdict ? `Verdict snippet: ${String(data.review.verdict).slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: summary },
        ],
        max_tokens: 80,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`  ! HTTP ${res.status}: ${txt.slice(0, 160)}`);
      return null;
    }
    const body = await res.json() as any;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return null;
    const parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, ''));
    const hwm = parsed.high_water_mark === true;
    const reason = String(parsed.reason ?? '').slice(0, 120);
    return { high_water_mark: hwm, reason };
  } catch (e) {
    console.warn(`  ! error: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function main(): Promise<void> {
  const allFiles = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Total company files: ${allFiles.length}`);

  // Build pending queue
  const pending: string[] = [];
  for (const f of allFiles) {
    const raw = readFileSync(join(COMPANIES_DIR, f), 'utf-8');
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!FORCE && data.pricing?.high_water_mark !== undefined) continue;
    pending.push(f);
  }
  console.log(`Pending: ${pending.length}`);

  const queue = LIMIT > 0 ? pending.slice(0, LIMIT) : pending;
  console.log(`Processing: ${queue.length} (concurrency=${CONCURRENCY})`);

  let flagged = 0;
  let normal = 0;
  let failed = 0;

  // Simple worker pool
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push((async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= queue.length) return;
        const file = queue[idx];
        const path = join(COMPANIES_DIR, file);
        const raw = readFileSync(path, 'utf-8');
        let data: any;
        try { data = JSON.parse(raw); } catch { failed++; continue; }

        const result = await classifyOne(data);
        if (!result) { failed++; continue; }

        data.pricing = data.pricing ?? {};
        data.pricing.high_water_mark = result.high_water_mark;
        data.pricing.high_water_mark_reason = result.reason;

        if (!DRY) {
          writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
        }

        if (result.high_water_mark) {
          flagged++;
          console.log(`  🔴 ${data.slug ?? file}: ${result.reason}`);
        } else {
          normal++;
          if ((flagged + normal) % 50 === 0) {
            console.log(`  … ${flagged + normal}/${queue.length}`);
          }
        }
      }
    })());
  }
  await Promise.all(workers);

  console.log('');
  console.log(`Flagged (HWM):  ${flagged}`);
  console.log(`Normal pricing: ${normal}`);
  console.log(`Failed:         ${failed}`);
  if (DRY) console.log('\n(dry-run — no files written)');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
