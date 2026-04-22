/**
 * Phase 3 of the compare-expansion plan.
 *
 * For every pair in data/comparisons/top-pairs.json, generate an intro,
 * quick_take, verdict_a, verdict_b, and FAQ via DeepSeek (OpenRouter).
 * Writes per-pair files to data/comparisons/enrichment/<pair_slug>.json.
 *
 * Idempotent: skips pairs whose enrichment file already exists.
 *
 * Run: OPENROUTER_API_KEY=... npx tsx scripts/enrich-compare-intros.ts [--limit=N]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
  console.error('ERROR: set OPENROUTER_API_KEY env var before running.');
  process.exit(1);
}

const MODEL = 'deepseek/deepseek-chat';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const CONCURRENCY = 10;

const PAIRS = join(ROOT, 'data/comparisons/top-pairs.json');
const COMP = join(ROOT, 'data/companies');
const OUT_DIR = join(ROOT, 'data/comparisons/enrichment');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// ── Load ────────────────────────────────────────────────────────────────
type Pair = { slug_a: string; slug_b: string; pair_slug: string; category: string; seo: any };
const pairs: Pair[] = JSON.parse(readFileSync(PAIRS, 'utf-8'));
const companies: Record<string, any> = {};
for (const file of [...new Set(pairs.flatMap((p) => [p.slug_a, p.slug_b]))]) {
  const fp = join(COMP, `${file}.json`);
  if (existsSync(fp)) companies[file] = JSON.parse(readFileSync(fp, 'utf-8'));
}

// ── Compact per-company context for prompt ──────────────────────────────
function slim(c: any) {
  return {
    name: c.name,
    description: c.description,
    category: c.categories?.primary?.name,
    pricing: c.pricing
      ? {
          model: c.pricing.model,
          has_free_tier: c.pricing.has_free_tier,
          entry_price: c.pricing.entry_price,
          enterprise_available: c.pricing.enterprise_available,
        }
      : null,
    lock_in: c.scores?.lock_in
      ? {
          level: c.scores.lock_in.level,
          migration_complexity: c.scores.lock_in.migration_complexity,
          reason: c.scores.lock_in.explanation || c.scores.lock_in.reason,
        }
      : null,
    developer_experience: c.scores?.developer_experience?.score ?? null,
    transparency: c.scores?.transparency?.score ?? null,
    pros: c.review?.pros?.slice(0, 4) ?? [],
    cons: c.review?.cons?.slice(0, 4) ?? [],
    best_for: c.review?.best_for,
    not_for: c.review?.not_for,
    verdict: c.review?.verdict,
    when_to_use: c.content?.when_to_use?.slice(0, 4) ?? [],
  };
}

// ── Prompt ──────────────────────────────────────────────────────────────
function buildPrompt(a: any, b: any): { system: string; user: string } {
  return {
    system:
      'You are an experienced B2B software reviewer writing concise, evidence-based comparisons for developers evaluating tools. Output strict JSON only — no preamble, no markdown fences.',
    user: `Compare ${a.name} vs ${b.name}. Use only the data below — do NOT invent features.

${JSON.stringify({ a: slim(a), b: slim(b) }, null, 2)}

Return JSON with these fields and nothing else:
{
  "intro": "150-180 words. Plain prose, no headings. Open with the single biggest distinction between ${a.name} and ${b.name} (pricing model, lock-in, target scale, DX — pick the real one). Then the specific use case each fits. End with 'the trade-off' — what you give up choosing one vs the other.",
  "quick_take": "ONE sentence, max 30 words. For a hurried buyer: '${a.name} is for ___, ${b.name} is for ___, decide based on ___.'",
  "verdict_a": "ONE sentence: 'Choose ${a.name} if you need X and Y.' Concrete constraints from the data — NOT marketing fluff.",
  "verdict_b": "ONE sentence: 'Choose ${b.name} if you need X and Y.' Different constraints from verdict_a.",
  "faq": [
    {"q": "Is ${a.name} cheaper than ${b.name}?", "a": "2-3 sentences. Use their real pricing models + entry prices."},
    {"q": "Can I migrate from ${a.name} to ${b.name}?", "a": "2-3 sentences. Use the lock_in and migration_complexity data."},
    {"q": "Which has better developer experience?", "a": "2-3 sentences. Compare the DX scores + any DX-related pros/cons."},
    {"q": "Is ${b.name} a good alternative to ${a.name}?", "a": "2-3 sentences. Reference best_for / not_for if available."}
  ]
}

Rules:
- Be specific. Reference actual numbers, pricing models, lock-in levels.
- Never use 'leading', 'best-in-class', 'powerful', 'robust', 'seamless', or other marketing adjectives.
- If data is missing for a claim, acknowledge uncertainty ('public pricing not disclosed') rather than guess.
- Never recommend a tool that contradicts its 'not_for' field.`,
  };
}

// ── Call ────────────────────────────────────────────────────────────────
type Enrichment = {
  intro: string;
  quick_take: string;
  verdict_a: string;
  verdict_b: string;
  faq: Array<{ q: string; a: string }>;
};

async function enrich(a: any, b: any): Promise<Enrichment | null> {
  const { system, user } = buildPrompt(a, b);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tool.news',
      'X-Title': 'tool.news compare enrichment',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty response');

  // Try to parse; if the model wraps in fences, strip them.
  const cleaned = content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  const parsed = JSON.parse(cleaned);

  // Validate shape
  if (
    typeof parsed.intro !== 'string' ||
    typeof parsed.quick_take !== 'string' ||
    typeof parsed.verdict_a !== 'string' ||
    typeof parsed.verdict_b !== 'string' ||
    !Array.isArray(parsed.faq) ||
    parsed.faq.length < 3
  ) {
    throw new Error('malformed response');
  }
  return parsed as Enrichment;
}

// ── Worker pool ─────────────────────────────────────────────────────────
async function runPool<T, R>(
  items: T[],
  worker: (x: T, i: number) => Promise<R>,
  n: number,
  onProgress?: (done: number, total: number, lastErr?: string) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  async function runOne() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      try {
        results[i] = await worker(items[i], i);
      } catch (e: any) {
        results[i] = undefined as unknown as R;
        console.warn(`  ! pair ${i} failed: ${e.message}`);
      }
      done++;
      if (onProgress && done % 10 === 0) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: n }, runOne));
  return results;
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const toProcess = pairs
    .filter((p) => companies[p.slug_a] && companies[p.slug_b])
    .filter((p) => !existsSync(join(OUT_DIR, `${p.pair_slug}.json`)))
    .slice(0, LIMIT);

  console.log(
    `Pairs total: ${pairs.length}. To process: ${toProcess.length}. Concurrency: ${CONCURRENCY}. Model: ${MODEL}`,
  );

  const t0 = Date.now();
  let success = 0;
  let failed = 0;

  await runPool(
    toProcess,
    async (pair) => {
      const a = companies[pair.slug_a];
      const b = companies[pair.slug_b];
      try {
        const result = await enrich(a, b);
        if (!result) throw new Error('null result');
        writeFileSync(
          join(OUT_DIR, `${pair.pair_slug}.json`),
          JSON.stringify(result, null, 2) + '\n',
        );
        success++;
      } catch (e: any) {
        failed++;
        throw e;
      }
    },
    CONCURRENCY,
    (d, t) => console.log(`  ${d}/${t}  ok=${success}  err=${failed}`),
  );

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${dt}s. Success: ${success}. Failed: ${failed}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
