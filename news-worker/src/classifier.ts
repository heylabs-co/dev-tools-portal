/**
 * Stage-1 newsworthiness + virality classifier (Worker edition).
 *
 * Two axes scored 0-10 by DeepSeek:
 *   - news_score: technical substance / industry significance
 *   - virality_score: social-media traction potential
 *
 * Final `score` (written to events.score) is a weighted blend that favours
 * virality (60%) over pure newsworthiness (40%). Gatekeeping everything on
 * raw news_score produces gimmicky, over-technical picks that don't travel on
 * social feeds; boosting virality pulls in takes, drama, and broadly-relatable
 * angles that actually get shared.
 */

import type { Env } from './env';
import { getUnscoredEvents, setEventScore, type EventRow } from './db/client';
import { callOpenRouter } from './lib/openrouter';

const MODEL = 'deepseek/deepseek-chat';
const BATCH_SIZE = 10;
const INTER_BATCH_SLEEP_MS = 500;
// Workers Paid: 1000 subrequests/invocation. Each event = 2 (LLM + D1 write).
// 200 events = 401 subrequests — well under the cap.
const MAX_EVENTS_PER_RUN = 200;

// Virality is weighted heavier than raw newsworthiness — see header comment.
const NEWS_WEIGHT = 0.4;
const VIRALITY_WEIGHT = 0.6;

// ── Prompt ──────────────────────────────────────────────────────────────

export const CLASSIFIER_SYSTEM_PROMPT = `You score events for a dev-tools / AI-lab news feed on TWO independent axes.

Audience: engineers, founders, AI builders. The feed re-posts picks to Twitter/X, so social traction matters as much as substance.

## news_score (0-10) — technical substance

- 9-10: Major announcement — new product launch from a top-20 company (OpenAI, Anthropic, Google, Meta, Vercel, Stripe, GitHub, Cursor, Replit, etc.), major version release, pricing change, funding round $50M+, acquisition, security incident.
- 7-8: Substantive release — new tool launch, notable OSS release, meaningful benchmark, research paper with industry impact.
- 5-6: Useful but narrow — tool update, tip with real value, smaller OSS release.
- 3-4: Minor interest — conference talk, personal take on industry.
- 1-2: Personal / off-topic / self-promo with no substance.
- 0: Spam, unrelated, or foreign-language without English.

## virality_score (0-10) — social traction potential

Predict: will dev-Twitter actually share / quote / argue about this today?

- 9-10: Will dominate dev-Twitter — OpenAI/Anthropic drama, unexpected pivot, controversy, a "holy shit" moment, a provocative hot take with real stake, a benchmark that embarrasses a known player.
- 7-8: Strong shareability — surprising benchmark, AI-vs-X comparison, result that reshapes expectations, polarizing opinion from a big name, a new product with a killer demo.
- 5-6: Mild engagement — interesting technical demo, a curious edge case worth posting, a quality OSS release in a trending area.
- 3-4: Discussed in a niche corner only.
- 1-2: Only insiders or contributors care.
- 0: Nobody re-shares this.

Factors that RAISE virality: novelty surprise, controversy, a quotable one-liner, celebrity or drama factor, broad relatability beyond pure hackers, a visual or demo-worthy element, a clear before/after story, a pricing shock, an existential "is X dead?" angle.

Factors that LOWER virality: pure boilerplate release notes, birthday/anniversary nostalgia, personal-life posts, unmoderated self-promo, deeply niche internals that need 5 paragraphs of context.

## Calibration examples

- "Cursor raised $100M" → news=9, virality=7
- "Neovim fork with new cursor-shape option" → news=4, virality=2
- "Sam Altman: 1 engineer will replace 10 in 2 years" → news=4, virality=9
- "Claude outperforms GPT-5 on new SWE-Bench Verified" → news=7, virality=8
- "New way to format Rust match arms" → news=3, virality=1
- "Stripe lays off 14% of engineering" → news=7, virality=9
- "Bun 1.3 ships with 40% faster startup" → news=7, virality=6
- "Happy 10th birthday to VS Code 🎂" → news=2, virality=3

## Output

JSON only, this exact shape:
{"news_score": <int 0-10>, "virality_score": <int 0-10>, "reason": "<=80 char phrase explaining both axes"}

Reason examples: "funding headline + founder-drama angle", "minor config knob, zero share potential", "GPT-5 vs Claude benchmark — hot debate fuel".`;

// ── Parsing ─────────────────────────────────────────────────────────────

interface ParsedScore {
  news_score: number;
  virality_score: number;
  reason: string;
}

function clamp10(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function parseScoreContent(content: string): ParsedScore {
  const trimmed = (content ?? '').trim();
  if (!trimmed) return { news_score: 5, virality_score: 5, reason: 'parse-fail' };

  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return { news_score: 5, virality_score: 5, reason: 'parse-fail' };
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return { news_score: 5, virality_score: 5, reason: 'parse-fail' };
    }
  }

  const obj = parsed as {
    news_score?: unknown;
    virality_score?: unknown;
    // Back-compat: if DeepSeek returns legacy `score`, treat it as news_score.
    score?: unknown;
    reason?: unknown;
  };

  const news = clamp10(Number(obj?.news_score ?? obj?.score));
  const virality = clamp10(Number(obj?.virality_score));

  let reason = String(obj?.reason ?? '').trim();
  if (!reason) reason = 'no-reason';
  if (reason.length > 80) reason = reason.slice(0, 80);

  return { news_score: news, virality_score: virality, reason };
}

function combinedScore(news: number, virality: number): number {
  return clamp10(news * NEWS_WEIGHT + virality * VIRALITY_WEIGHT);
}

// ── Single event scoring ────────────────────────────────────────────────

async function classifyOne(
  apiKey: string,
  row: EventRow,
): Promise<ParsedScore> {
  const title = row.title ? `title: ${row.title}\n` : '';
  const userPayload = `source: ${row.source}\nhandle: @${row.source_handle ?? 'unknown'}\n${title}text: ${row.text ?? ''}`;

  try {
    const content = await callOpenRouter({
      apiKey,
      model: MODEL,
      system: CLASSIFIER_SYSTEM_PROMPT,
      user: userPayload,
      maxTokens: 160,
      temperature: 0,
      responseFormat: 'json_object',
    });
    return parseScoreContent(content);
  } catch (e) {
    console.warn(
      `[classifier] event ${row.id} failed:`,
      (e as Error)?.message ?? e,
    );
    return { news_score: 5, virality_score: 5, reason: 'parse-fail' };
  }
}

// ── Entrypoint ──────────────────────────────────────────────────────────

export async function runClassifier(env: Env): Promise<{
  scored: number;
  failed: number;
  distribution: Record<number, number>;
  duration_ms: number;
}> {
  const startedAt = Date.now();

  const events = await getUnscoredEvents(env.DB, MAX_EVENTS_PER_RUN);
  const distribution: Record<number, number> = {};
  let scored = 0;
  let failed = 0;

  if (events.length === 0) {
    return {
      scored: 0,
      failed: 0,
      distribution,
      duration_ms: Date.now() - startedAt,
    };
  }

  console.log(
    `[classifier] scoring ${events.length} events with ${MODEL} (batch ${BATCH_SIZE})`,
  );

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    if (i > 0) await new Promise((r) => setTimeout(r, INTER_BATCH_SLEEP_MS));
    await Promise.all(
      batch.map(async (ev) => {
        const { news_score, virality_score, reason } = await classifyOne(
          env.OPENROUTER_API_KEY,
          ev,
        );
        const combined = combinedScore(news_score, virality_score);
        try {
          await setEventScore(
            env.DB,
            ev.id,
            combined,
            reason,
            news_score,
            virality_score,
          );
          scored++;
          distribution[combined] = (distribution[combined] ?? 0) + 1;
          if (reason === 'parse-fail') failed++;
        } catch (e) {
          failed++;
          console.error(`[classifier] DB write failed for ${ev.id}:`, e);
        }
      }),
    );
  }

  const duration_ms = Date.now() - startedAt;
  console.log(
    `[classifier] done: scored=${scored} failed=${failed} duration_ms=${duration_ms}`,
  );
  return { scored, failed, distribution, duration_ms };
}
