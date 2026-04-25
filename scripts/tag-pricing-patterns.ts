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
const MODEL = 'anthropic/claude-sonnet-4-5';
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

const SYSTEM_PROMPT = `You label a developer tool's pricing model with a strict boolean: does it charge HIGH WATER MARK pricing?

## Definition (narrow — do not generalize)

"High water mark pricing" = the bill is LOCKED to peak usage or pre-paid reserved capacity during a billing period and does NOT scale down within the cycle, EVEN IF the customer reduces usage. The customer is penalized for temporary spikes.

Known confirmed examples (seed list — answer TRUE for):
- Datadog: bills on peak host count per month
- Snowflake: reserved compute credits don't release mid-term
- Splunk: annual ingest commitment regardless of actual volume
- Elastic Cloud / reserved tiers
- MongoDB Atlas dedicated clusters (fixed price)
- Auth0: MAU tiers bill on peak monthly active users
- Okta / Salesforce / HubSpot / GitLab: annual seat commits that can't be reduced mid-contract
- Mixpanel / Amplitude / Heap / FullStory: annual event-volume commits on paid plans

## Anti-examples — answer FALSE

- AWS Lambda / Stripe / Twilio: metered per-unit, no peak lock
- Vercel / Netlify hobby & pro tiers: scale with usage, downgradable monthly
- Cloudflare Workers / KV: metered, scale up AND down
- Any hobby / indie / self-serve tier you can downgrade next cycle
- GitHub / GitLab Free / open-source tools with optional donations
- Any tool whose pricing is ONLY described as "contact sales" without explicit evidence of peak-lock — we DO NOT assume enterprise contracts are HWM
- Any tool where the catalog text only says "subscription" or "per-seat" without mentioning annual commit, reservation, or peak-based billing

## Critical rule: be a skeptic

Without EXPLICIT evidence of peak-lock or non-scalable reservation in the pricing description, default to FALSE. Do not infer HWM from "enterprise" or "custom pricing" alone. Do not infer HWM from "annual plans available" alone. Do not fabricate pricing details that aren't in the input.

When unsure → FALSE.

## Output

Return STRICT JSON only, no prose, no markdown fences:
{"high_water_mark": true|false, "reason": "<=120 chars — evidence-backed. 'standard metered' / 'downgradable monthly' / 'insufficient pricing evidence' if false"}`;

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
