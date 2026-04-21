/**
 * Enrich 5,200+ tools with pricing.model + has_free_tier via DeepSeek V3 (OpenRouter).
 *
 * Models: subscription, freemium, usage, seat, hybrid, free, custom, unknown
 *
 * Run: OPENROUTER_API_KEY=... npx tsx scripts/enrich-pricing.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIR = 'data/companies';
const KEY = process.env.OPENROUTER_API_KEY;
const MODELS = [
  'openai/gpt-oss-120b:free',
  'minimax/minimax-m2.5:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'z-ai/glm-4.5-air:free',
];
const CONCURRENCY = 16; // 4 per model

if (!KEY) { console.error('Set OPENROUTER_API_KEY'); process.exit(1); }

const VALID_MODELS = new Set([
  'subscription', 'freemium', 'usage', 'seat', 'hybrid', 'free', 'custom', 'unknown',
]);

type Out = { model: string; has_free_tier: boolean };

function prompt(name: string, description: string, category: string): string {
  return `Classify the pricing model for this developer tool:

Tool: ${name}
Category: ${category}
Description: ${description}

Return ONLY JSON: {"model": "...", "has_free_tier": true|false}

Pricing models:
- "subscription": flat recurring fee (monthly/annual), often per-seat or plan-based
- "freemium": free tier + paid upgrade (most SaaS)
- "usage": pay per API call / per GB / per transaction / credits
- "seat": strictly per-user pricing (Notion, Slack-style)
- "hybrid": subscription base + usage overage
- "free": completely free / open-source (no paid tier)
- "custom": enterprise contact-sales only (no public price)
- "unknown": truly cannot determine

has_free_tier: true if there's ANY free plan/trial beyond a short trial period. False for paid-only.`;
}

async function classify(name: string, description: string, category: string, workerIdx: number, retries = 3): Promise<Out | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Rotate through models; on retry, jump to next model
    const model = MODELS[(workerIdx + attempt) % MODELS.length];
    const body = {
      model,
      messages: [{ role: 'user', content: prompt(name, description, category) }],
      temperature: 0,
      max_tokens: 80,
      response_format: { type: 'json_object' },
    };
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
        return null;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!content) { if (attempt < retries) continue; return null; }
      const parsed = JSON.parse(content);
      const pm = (parsed.model || '').toLowerCase();
      if (!VALID_MODELS.has(pm)) { if (attempt < retries) continue; return null; }
      return { model: pm, has_free_tier: Boolean(parsed.has_free_tier) };
    } catch {
      if (attempt < retries) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
      return null;
    }
  }
  return null;
}

async function main() {
  const files = readdirSync(DIR).filter(f => f.endsWith('.json'));
  const todo: { fp: string; name: string; description: string; category: string }[] = [];
  for (const f of files) {
    const fp = join(DIR, f);
    const d = JSON.parse(readFileSync(fp, 'utf-8'));
    if (d.pricing?.model) continue;
    todo.push({
      fp,
      name: d.name ?? d.slug,
      description: (d.description ?? '').slice(0, 400),
      category: d.categories?.primary?.name ?? 'developer tool',
    });
  }

  console.log(`Pricing to classify: ${todo.length}  concurrency: ${CONCURRENCY}`);
  let done = 0, ok = 0, fail = 0, idx = 0;
  const start = Date.now();

  async function worker(workerIdx: number) {
    while (idx < todo.length) {
      const t = todo[idx++];
      const r = await classify(t.name, t.description, t.category, workerIdx);
      if (r) {
        const d = JSON.parse(readFileSync(t.fp, 'utf-8'));
        d.pricing = d.pricing ?? {};
        d.pricing.model = r.model;
        if (d.pricing.has_free_tier === undefined) d.pricing.has_free_tier = r.has_free_tier;
        writeFileSync(t.fp, JSON.stringify(d, null, 2) + '\n');
        ok++;
      } else {
        fail++;
      }
      done++;
      if (done % 50 === 0) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = done / elapsed;
        const eta = Math.round((todo.length - done) / rate);
        console.log(`  ${done}/${todo.length}  ok=${ok}  fail=${fail}  ${rate.toFixed(1)}/s  ETA ${Math.floor(eta/60)}m${eta%60}s`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  console.log(`\nDone. Total: ${done}  ok: ${ok}  fail: ${fail}  elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main();
