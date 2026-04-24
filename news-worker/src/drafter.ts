/**
 * Stage-2 drafter (Worker edition).
 *
 * 1. Pull draft candidates (last 24h, score >= 5, unposted, no drafts yet).
 * 2. Cap to top 200 by score.
 * 3. Ask Claude Sonnet (one call) to pick the top 15 most newsworthy.
 * 4. For each pick, ask DeepSeek to generate 3 variants + quick_take.
 *    Retry once with a stricter prompt if banned marketing words slip in.
 * 5. Save to events.drafts_json.
 *
 * Cost target: ~$0.05 per invocation.
 */

import type { Env } from './env';
import {
  getDraftCandidates,
  setEventDrafts,
  type EventRow,
} from './db/client';
import { callOpenRouter } from './lib/openrouter';

const RANK_MODEL = 'anthropic/claude-sonnet-4-5';
const DRAFT_MODEL = 'deepseek/deepseek-chat';
const RANK_INPUT_CAP = 200;
const TOP_N = 15;
const WINDOW_HOURS = 24;
const MIN_SCORE = 5;
const DRAFT_CONCURRENCY = 5;

const BANNED_WORDS = [
  'game-changer',
  'revolutionary',
  'powerful',
  'robust',
  'seamless',
  'industry-leading',
  'best-in-class',
  'cutting-edge',
];

// ── Prompts ─────────────────────────────────────────────────────────────

const RANK_SYSTEM_PROMPT = `You are the editorial director of a dev-tools news feed. Pick the top 15 most newsworthy for developers/founders. Return STRICT JSON: {"picks":[{"id":"...","rank":N,"reason":"..."}]}. Reject personal opinions, memes, conference travel.`;

const DRAFT_SYSTEM_PROMPT = `You write three tweet variants for a dev-tools news feed called tool.news (@toolnewsHQ).
Rules:
- NO marketing fluff — banned words: "game-changer", "revolutionary", "powerful", "robust", "seamless", "industry-leading", "best-in-class", "cutting-edge"
- NO emoji except 🚨 allowed in thread opener
- Keep each variant under 250 chars (room for link)
- The link is the original tweet URL — goes in a reply, so DON'T include it in the body
- "straight": direct news, attribute source ("X just released Y")
- "hot_take": +1 substantive insight beyond the headline
- "thread": 🚨 hook promising depth — a thread starter
- "quick_take": one-sentence (<=140 chars) plain-English summary for a reviewer
Output STRICT JSON: { "straight": "...", "hot_take": "...", "thread": "...", "quick_take": "..." }`;

const DRAFT_RETRY_SUFFIX = (offenders: string[]) =>
  `\n\nIMPORTANT: your previous output contained banned marketing words: ${offenders.join(', ')}. Rewrite every variant without those words or any synonym marketing fluff. Return STRICT JSON only.`;

// ── Types ───────────────────────────────────────────────────────────────

interface RankPick {
  id: string;
  rank: number;
  reason: string;
}

interface DraftVariants {
  straight: string;
  hot_take: string;
  thread: string;
}

interface DraftArtifact {
  rank: number;
  rank_reason: string;
  quick_take: string;
  drafts: DraftVariants;
  drafted_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  const oneLine = (s ?? '').replace(/\s+/g, ' ').trim();
  return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + '…';
}

function parseJsonContent(raw: string): unknown {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function findBannedWords(variants: DraftVariants): string[] {
  const blob = [variants.straight, variants.hot_take, variants.thread]
    .join(' ')
    .toLowerCase();
  return BANNED_WORDS.filter((w) => blob.includes(w.toLowerCase()));
}

// Bounded parallelism without external deps.
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

// ── Stage 2a: ranking (one Sonnet call) ─────────────────────────────────

async function rankCandidates(
  apiKey: string,
  cands: EventRow[],
  topN: number,
): Promise<RankPick[]> {
  const compact = cands.slice(0, RANK_INPUT_CAP).map((c) => ({
    id: c.id,
    score: c.score,
    source: c.source,
    source_handle: c.source_handle ?? 'unknown',
    text: truncate(c.text ?? '', 200),
  }));

  const userPrompt = `Select the top ${topN} most-newsworthy events from the list below.
Output STRICT JSON:
{
  "picks": [
    { "id": "<event id>", "rank": 1, "reason": "<=80 char why it wins" }
  ]
}
Rank 1 = most newsworthy. Return exactly ${topN} picks if possible; fewer is fine if the pool lacks substance.
Events:
${JSON.stringify(compact, null, 2)}`;

  const content = await callOpenRouter({
    apiKey,
    model: RANK_MODEL,
    system: RANK_SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 4000,
    temperature: 0,
    responseFormat: 'json_object',
  });

  const parsed = parseJsonContent(content) as
    | { picks?: unknown }
    | null;
  if (!parsed || !Array.isArray(parsed.picks)) {
    throw new Error(
      `Ranker returned invalid JSON. First 300 chars: ${content.slice(0, 300)}`,
    );
  }

  // Only keep picks whose ids were in the input.
  const validIds = new Set(compact.map((c) => c.id));
  const picks: RankPick[] = [];
  for (const raw of parsed.picks) {
    const p = raw as { id?: unknown; rank?: unknown; reason?: unknown };
    if (!p || typeof p.id !== 'string' || !validIds.has(p.id)) continue;
    const rank = Number.isFinite(Number(p.rank))
      ? Number(p.rank)
      : picks.length + 1;
    picks.push({
      id: p.id,
      rank,
      reason: truncate(String(p.reason ?? ''), 80),
    });
  }
  picks.sort((a, b) => a.rank - b.rank);
  return picks.slice(0, topN);
}

// ── Stage 2b: drafting (DeepSeek per pick, with ban-word retry) ─────────

async function draftOnce(
  apiKey: string,
  cand: EventRow,
  extraInstruction = '',
): Promise<{ quick_take: string; drafts: DraftVariants } | null> {
  const userPayload = `Source: ${cand.source} / @${cand.source_handle ?? 'unknown'}
Score: ${cand.score}
URL: ${cand.url ?? ''}
Tweet text:
"""
${cand.text ?? ''}
"""

Write the three variants + quick_take now. Return JSON only.${extraInstruction}`;

  const content = await callOpenRouter({
    apiKey,
    model: DRAFT_MODEL,
    system: DRAFT_SYSTEM_PROMPT,
    user: userPayload,
    maxTokens: 600,
    temperature: 0.4,
    responseFormat: 'json_object',
  });

  const parsed = parseJsonContent(content) as
    | {
        straight?: unknown;
        hot_take?: unknown;
        thread?: unknown;
        quick_take?: unknown;
      }
    | null;
  if (!parsed) return null;

  const straight = String(parsed.straight ?? '').trim();
  const hot_take = String(parsed.hot_take ?? '').trim();
  const thread = String(parsed.thread ?? '').trim();
  const quick_take = truncate(String(parsed.quick_take ?? ''), 200);
  if (!straight || !hot_take || !thread) return null;

  return {
    quick_take: quick_take || truncate(straight, 140),
    drafts: { straight, hot_take, thread },
  };
}

async function draftWithBanCheck(
  apiKey: string,
  cand: EventRow,
): Promise<{ quick_take: string; drafts: DraftVariants } | null> {
  const first = await draftOnce(apiKey, cand);
  if (!first) return null;

  const offenders = findBannedWords(first.drafts);
  if (offenders.length === 0) return first;

  console.warn(
    `[drafter] banned words in event ${cand.id}: ${offenders.join(', ')} — retrying`,
  );

  const retry = await draftOnce(apiKey, cand, DRAFT_RETRY_SUFFIX(offenders));
  if (!retry) return first; // save original if retry fails entirely

  const stillOffends = findBannedWords(retry.drafts);
  if (stillOffends.length > 0) {
    console.warn(
      `[drafter] event ${cand.id} still has banned words after retry: ${stillOffends.join(', ')} — saving anyway`,
    );
  }
  return retry;
}

// ── Entrypoint ──────────────────────────────────────────────────────────

export async function runDrafter(env: Env): Promise<{
  candidates: number;
  picked: number;
  drafted: number;
  failed: number;
  duration_ms: number;
}> {
  const startedAt = Date.now();

  const candsAll = await getDraftCandidates(env.DB, WINDOW_HOURS, MIN_SCORE);
  // getDraftCandidates already orders by score DESC; cap to 200.
  const cands = candsAll.slice(0, RANK_INPUT_CAP);

  if (cands.length === 0) {
    console.log('[drafter] no candidates');
    return {
      candidates: 0,
      picked: 0,
      drafted: 0,
      failed: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  console.log(
    `[drafter] candidates=${cands.length} window=${WINDOW_HOURS}h min_score=${MIN_SCORE} top=${TOP_N}`,
  );

  // Rank. If ranker fails, abort — we don't want to half-draft.
  let picks: RankPick[];
  try {
    picks = await rankCandidates(env.OPENROUTER_API_KEY, cands, TOP_N);
  } catch (e) {
    console.error('[drafter] ranker failed:', (e as Error)?.message ?? e);
    return {
      candidates: cands.length,
      picked: 0,
      drafted: 0,
      failed: cands.length,
      duration_ms: Date.now() - startedAt,
    };
  }

  const byId = new Map(cands.map((c) => [c.id, c]));
  const orderedPicks = picks
    .map((p) => ({ pick: p, cand: byId.get(p.id) }))
    .filter((x): x is { pick: RankPick; cand: EventRow } => !!x.cand);

  console.log(`[drafter] ranker returned ${orderedPicks.length} picks`);

  let drafted = 0;
  let failed = 0;

  await runPool(
    orderedPicks,
    async ({ pick, cand }) => {
      try {
        const out = await draftWithBanCheck(env.OPENROUTER_API_KEY, cand);
        if (!out) {
          failed++;
          console.warn(`[drafter] draft failed for ${cand.id}`);
          return;
        }
        const artifact: DraftArtifact = {
          rank: pick.rank,
          rank_reason: pick.reason,
          quick_take: out.quick_take,
          drafts: out.drafts,
          drafted_at: new Date().toISOString(),
        };
        await setEventDrafts(env.DB, cand.id, JSON.stringify(artifact));
        drafted++;
      } catch (e) {
        failed++;
        console.error(
          `[drafter] error drafting ${cand.id}:`,
          (e as Error)?.message ?? e,
        );
      }
    },
    DRAFT_CONCURRENCY,
  );

  const duration_ms = Date.now() - startedAt;
  console.log(
    `[drafter] done: candidates=${cands.length} picked=${orderedPicks.length} drafted=${drafted} failed=${failed} duration_ms=${duration_ms}`,
  );
  return {
    candidates: cands.length,
    picked: orderedPicks.length,
    drafted,
    failed,
    duration_ms,
  };
}
