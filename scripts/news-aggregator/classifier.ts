/**
 * Stage-1 newsworthiness classifier.
 *
 * Reads unscored events from the SQLite events table, asks DeepSeek (via
 * OpenRouter) to score each 0-10 with a short reason, and writes the result
 * back via setEventScore.
 *
 * Run:
 *   npx tsx scripts/news-aggregator/classifier.ts [--limit N] [--rescore]
 */

import { config as loadEnv } from 'dotenv';
import { join } from 'path';
loadEnv({ path: join(process.cwd(), '.env') });

import { db, setEventScore } from './storage.js';

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
  console.error('OPENROUTER_API_KEY is not set. Add it to .env.');
  process.exit(1);
}

const MODEL = 'deepseek/deepseek-chat';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const CONCURRENCY = 10;

// ── CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function argVal(key: string): string | undefined {
  const idx = args.findIndex((a) => a === `--${key}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
}
function argFlag(key: string): boolean {
  return args.includes(`--${key}`);
}

const LIMIT = argVal('limit') ? parseInt(argVal('limit')!, 10) : 0; // 0 = no limit
const MIN_ID = argVal('min-id');
const RESCORE = argFlag('rescore');

// ── Prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You score how newsworthy a tweet is for a dev-tools / AI-lab news digest.
Target audience: engineers and founders tracking the dev-tool and AI-lab ecosystem.

Scoring rubric (integer 0-10):
- 9-10: Major announcement — new product launch from a top-20 company (OpenAI, Anthropic, Vercel, Stripe, GitHub, etc.), major version release, pricing change, funding round $50M+, acquisition. Something a dev-news newsletter would headline.
- 7-8: Substantive technical release — new tool launch, notable open-source release, meaningful benchmark, research paper with industry impact, interesting technical deep-dive thread.
- 5-6: Useful but narrow — tool update, tip thread with real value, small but notable OSS release, hiring announcement from a notable company.
- 3-4: Minor interest — conference talk, birthday/anniversary tweet with tech reference, personal take on the industry.
- 1-2: Pure personal / off-topic / meme / self-promo without substance.
- 0: Spam, unrelated, or foreign-language without English translation (we don't translate yet).

Output JSON only, exactly this shape:
{"score": <int 0-10>, "reason": "<=80 char phrase explaining the score"}

Keep the reason concrete ("GPT-5 Turbo launch", "Bun 1.3 benchmark", "personal travel photo"). No trailing punctuation needed.`;

// ── Types ───────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  source_handle: string | null;
  text: string | null;
  created_at: string;
}

interface ScoreResult {
  id: string;
  handle: string;
  text: string;
  score: number;
  reason: string;
}

// ── OpenRouter call ─────────────────────────────────────────────────────

async function classifyOne(
  row: EventRow,
  attempt = 1,
): Promise<{ score: number; reason: string }> {
  const userPayload = `handle: @${row.source_handle ?? 'unknown'}\ntext: ${row.text ?? ''}`;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPayload },
        ],
      }),
    });
  } catch (e) {
    if (attempt < 2) {
      await sleep(5_000);
      return classifyOne(row, attempt + 1);
    }
    return { score: 5, reason: 'parse-fail' };
  }

  if (res.status === 429) {
    if (attempt < 2) {
      await sleep(10_000);
      return classifyOne(row, attempt + 1);
    }
    return { score: 5, reason: 'parse-fail' };
  }

  if (!res.ok) {
    if (attempt < 2) {
      await sleep(3_000);
      return classifyOne(row, attempt + 1);
    }
    return { score: 5, reason: 'parse-fail' };
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    return { score: 5, reason: 'parse-fail' };
  }

  const content: string = data?.choices?.[0]?.message?.content ?? '';
  return parseScoreContent(content);
}

function parseScoreContent(content: string): { score: number; reason: string } {
  const trimmed = (content ?? '').trim();
  if (!trimmed) return { score: 5, reason: 'parse-fail' };

  // Strip optional markdown code-fence wrappers.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Try to extract the first {...} block.
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return { score: 5, reason: 'parse-fail' };
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return { score: 5, reason: 'parse-fail' };
    }
  }

  const rawScore = Number(parsed?.score);
  if (!Number.isFinite(rawScore)) return { score: 5, reason: 'parse-fail' };
  const score = Math.max(0, Math.min(10, Math.round(rawScore)));

  let reason = String(parsed?.reason ?? '').trim();
  if (!reason) reason = 'no-reason';
  if (reason.length > 80) reason = reason.slice(0, 80);

  return { score, reason };
}

// ── Worker pool ─────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runPool<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    runners.push(
      (async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= items.length) return;
          results[idx] = await worker(items[idx], idx);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

// ── Main ────────────────────────────────────────────────────────────────

function loadEvents(): EventRow[] {
  const clauses: string[] = [];
  const params: any[] = [];
  if (!RESCORE) clauses.push('score IS NULL');
  if (MIN_ID) {
    clauses.push('id >= ?');
    params.push(MIN_ID);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT id, source_handle, text, created_at FROM events ${where} ORDER BY created_at DESC`;
  const rows = db().prepare(sql).all(...params) as EventRow[];
  return LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + '…';
}

async function main(): Promise<void> {
  const events = loadEvents();
  if (events.length === 0) {
    console.log('No events to classify.');
    return;
  }

  console.log(
    `Classifying ${events.length} events with ${MODEL} (concurrency ${CONCURRENCY})${RESCORE ? ' [rescore]' : ''}`,
  );

  const results: ScoreResult[] = [];
  let done = 0;

  await runPool(
    events,
    async (ev) => {
      const { score, reason } = await classifyOne(ev);
      setEventScore(ev.id, score, reason);
      const result: ScoreResult = {
        id: ev.id,
        handle: ev.source_handle ?? 'unknown',
        text: ev.text ?? '',
        score,
        reason,
      };
      results.push(result);
      done++;
      if (done % 10 === 0 || done === events.length) {
        console.log(
          `  [${done}/${events.length}] @${result.handle} score=${score} "${truncate(reason, 60)}"`,
        );
      }
      return result;
    },
    CONCURRENCY,
  );

  // ── Final report ─────────────────────────────────────────────────────

  const buckets = {
    '9-10': 0,
    '7-8': 0,
    '5-6': 0,
    '3-4': 0,
    '0-2': 0,
  };
  for (const r of results) {
    if (r.score >= 9) buckets['9-10']++;
    else if (r.score >= 7) buckets['7-8']++;
    else if (r.score >= 5) buckets['5-6']++;
    else if (r.score >= 3) buckets['3-4']++;
    else buckets['0-2']++;
  }

  console.log(`\nClassified: ${results.length} events`);
  console.log('Score distribution:');
  console.log(`  9-10: ${buckets['9-10']}  (major news)`);
  console.log(`  7-8:  ${buckets['7-8']}  (substantive)`);
  console.log(`  5-6:  ${buckets['5-6']}  (useful)`);
  console.log(`  3-4:  ${buckets['3-4']}  (minor)`);
  console.log(`  0-2:  ${buckets['0-2']}  (skip)`);

  const top = [...results].sort((a, b) => b.score - a.score).slice(0, 5);
  console.log('\nTop 5 events by score:');
  for (const r of top) {
    console.log(
      `  [score ${r.score}] @${r.handle} · "${truncate(r.text, 80)}"`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
