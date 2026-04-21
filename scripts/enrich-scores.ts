/**
 * Enrich tools with scores.lock_in / transparency / developer_experience
 * via DeepSeek V3 (OpenRouter).
 *
 * Each score: level ("low" | "medium" | "high") + score (0-5 int) + one-line reason.
 *
 * Run: OPENROUTER_API_KEY=... npx tsx scripts/enrich-scores.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIR = 'data/companies';
const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'openai/gpt-oss-120b:free';
const CONCURRENCY = 6;

if (!KEY) { console.error('Set OPENROUTER_API_KEY'); process.exit(1); }

const LEVELS = new Set(['low', 'medium', 'high']);

type Score = { level: string; score: number; reason: string };
type Out = {
  lock_in: Score;
  transparency: Score;
  developer_experience: Score;
};

function prompt(name: string, description: string, category: string): string {
  return `Score this developer tool on 3 dimensions. Return ONLY JSON.

Tool: ${name}
Category: ${category}
Description: ${description}

Return shape:
{
  "lock_in":     {"level": "low|medium|high", "score": 0-5, "reason": "..."},
  "transparency": {"level": "low|medium|high", "score": 0-5, "reason": "..."},
  "developer_experience": {"level": "low|medium|high", "score": 0-5, "reason": "..."}
}

Scoring rubrics:

LOCK-IN — how hard to switch away?
- low/5: open-source, open standards, data portable (Postgres, K8s)
- medium/3: proprietary but exportable (Airtable, Notion)
- high/1: proprietary data model + hard to migrate (Firebase Firestore, Salesforce)
Higher score = LOWER lock-in (better for buyer).

TRANSPARENCY — public pricing, open changelog, clear ToS?
- high/5: full public pricing, open changelog, no hidden fees
- medium/3: some public pricing, opaque enterprise tier
- low/1: contact-sales only, hidden limits, sudden policy changes

DEVELOPER_EXPERIENCE — quality of SDK, docs, onboarding?
- high/5: excellent docs, great SDKs in 5+ languages, fast onboarding (Stripe, Twilio)
- medium/3: decent docs, a few SDKs, some rough edges
- low/1: thin docs, single-language SDK, poor error messages

"reason" is one short sentence (30-100 chars) explaining the call.`;
}

async function classify(name: string, description: string, category: string, retries = 2): Promise<Out | null> {
  const body = {
    model: MODEL,
    messages: [{ role: 'user', content: prompt(name, description, category) }],
    temperature: 0.1,
    max_tokens: 400,
    response_format: { type: 'json_object' },
  };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
        return null;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!content) return null;
      const parsed = JSON.parse(content) as Record<string, Score>;
      const out: Partial<Out> = {};
      for (const key of ['lock_in', 'transparency', 'developer_experience'] as const) {
        const s = parsed[key];
        if (!s || !LEVELS.has(s.level) || typeof s.score !== 'number' || s.score < 0 || s.score > 5) return null;
        out[key] = { level: s.level, score: Math.round(s.score), reason: (s.reason || '').trim().slice(0, 140) };
      }
      return out as Out;
    } catch {
      if (attempt < retries) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
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
    const hasAll = d.scores?.lock_in?.level && d.scores?.transparency?.level && d.scores?.developer_experience?.level;
    if (hasAll) continue;
    todo.push({
      fp,
      name: d.name ?? d.slug,
      description: (d.description ?? '').slice(0, 400),
      category: d.categories?.primary?.name ?? 'developer tool',
    });
  }

  console.log(`Scores to enrich: ${todo.length}  concurrency: ${CONCURRENCY}`);
  let done = 0, ok = 0, fail = 0, idx = 0;
  const start = Date.now();

  async function worker() {
    while (idx < todo.length) {
      const t = todo[idx++];
      const r = await classify(t.name, t.description, t.category);
      if (r) {
        const d = JSON.parse(readFileSync(t.fp, 'utf-8'));
        d.scores = d.scores ?? {};
        if (!d.scores.lock_in?.level) d.scores.lock_in = r.lock_in;
        if (!d.scores.transparency?.level) d.scores.transparency = r.transparency;
        if (!d.scores.developer_experience?.level) d.scores.developer_experience = r.developer_experience;
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

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nDone. Total: ${done}  ok: ${ok}  fail: ${fail}  elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main();
