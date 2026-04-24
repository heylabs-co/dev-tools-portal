/**
 * Stage-2 drafter.
 *
 * Takes Stage-1 scored events (score >= 5, last N hours, unposted, no drafts
 * yet), asks Claude Sonnet to rank them and pick the top N, then asks
 * DeepSeek to generate three tweet variants + a quick-take per pick.
 * Writes the result back to events.drafts_json.
 *
 * Run:
 *   npx tsx scripts/news-aggregator/drafter.ts [--top 15] [--window 24] [--dry-run]
 */

import { config as loadEnv } from 'dotenv';
import { join } from 'path';
loadEnv({ path: join(process.cwd(), '.env') });

import {
  countDraftedEvents,
  getCandidatesSince,
  setEventDrafts,
  type CandidateRow,
} from './storage.js';

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
  console.error('OPENROUTER_API_KEY is not set. Add it to .env.');
  process.exit(1);
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const RANK_MODEL = 'anthropic/claude-sonnet-4-5';
const DRAFT_MODEL = 'deepseek/deepseek-chat';
const RANK_INPUT_CAP = 200;
const DRAFT_CONCURRENCY = 5;

// ── CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function argVal(key: string): string | undefined {
  const idx = args.findIndex((a) => a === `--${key}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
}
function argFlag(key: string): boolean {
  return args.includes(`--${key}`);
}

const TOP_N = argVal('top') ? parseInt(argVal('top')!, 10) : 15;
const WINDOW_H = argVal('window') ? parseInt(argVal('window')!, 10) : 24;
const DRY_RUN = argFlag('dry-run');

// ── Prompts ─────────────────────────────────────────────────────────────

const RANK_SYSTEM_PROMPT = `You are the editorial director of a developer-tools news feed for engineers and founders.
You see a list of candidate events (tweets/releases/posts) from the last 24 hours.
Select the top N that are most newsworthy for a savvy dev audience.
Prefer: concrete product launches, major version releases, funding rounds, technical breakthroughs, substantive threads.
Reject: personal opinions, memes, self-promo without substance, generic advice threads, conference travel tweets.
Output STRICT JSON — no prose, no code fences.`;

const DRAFT_SYSTEM_PROMPT = `You write three tweet variants for a dev-tools news feed called tool.news (@toolnewsHQ).
Rules:
- NO marketing fluff ("game-changing", "revolutionary", "powerful", "seamless")
- NO emoji except 🚨 allowed in thread opener
- Keep each variant under 250 chars (room for link)
- The "link" is the original tweet URL — we'll put it in the first reply, so DON'T include it in the body
- Attribute the source in V1: "X just released Y"
- V2 should add ONE substantive insight beyond the headline
- V3 should be a hook promising depth — a thread starter
Output STRICT JSON: { "straight": "...", "hot_take": "...", "thread": "..." }
Also include a "quick_take" field: one sentence (<=140 chars) plain-English summary for a reviewer.
So final shape: { "straight": "...", "hot_take": "...", "thread": "...", "quick_take": "..." }`;

// ── Types ───────────────────────────────────────────────────────────────

interface RankPick {
  id: string;
  rank: number;
  reason: string;
}

interface RankResult {
  picks: RankPick[];
  rejected_ids?: string[];
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

// ── HTTP helpers ────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function openRouterChat(body: unknown, attempt = 1): Promise<any> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (attempt < 3) {
      await sleep(3_000 * attempt);
      return openRouterChat(body, attempt + 1);
    }
    throw e;
  }

  if (res.status === 429) {
    if (attempt < 4) {
      const delay = 5_000 * attempt;
      console.warn(`  [429] backing off ${delay}ms (attempt ${attempt})`);
      await sleep(delay);
      return openRouterChat(body, attempt + 1);
    }
    throw new Error('OpenRouter 429 after retries');
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (attempt < 3 && res.status >= 500) {
      await sleep(3_000 * attempt);
      return openRouterChat(body, attempt + 1);
    }
    throw new Error(`OpenRouter HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }

  return res.json();
}

function parseJsonContent(raw: string): any {
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

function truncate(s: string, n: number): string {
  const oneLine = (s ?? '').replace(/\s+/g, ' ').trim();
  return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + '…';
}

// ── Stage 2a: ranking ───────────────────────────────────────────────────

async function rankCandidates(
  cands: CandidateRow[],
  topN: number,
): Promise<RankResult> {
  // Compact payload: id, score, source_handle, first 200 chars of text.
  const compact = cands.slice(0, RANK_INPUT_CAP).map((c) => ({
    id: c.id,
    score: c.score,
    source: c.source,
    source_handle: c.source_handle ?? 'unknown',
    text: truncate(c.text ?? '', 200),
  }));

  const userPrompt = `Select the top ${topN} most-newsworthy events from the list below.
Output STRICT JSON with this shape:
{
  "picks": [
    { "id": "<event id>", "rank": 1, "reason": "<=80 char why it wins" }
  ],
  "rejected_ids": ["<ids you rejected as low-value noise>"]
}
Rank 1 = most newsworthy. Return exactly ${topN} picks if possible; fewer is fine if the pool lacks substance.
Events:
${JSON.stringify(compact, null, 2)}`;

  const resp = await openRouterChat({
    model: RANK_MODEL,
    temperature: 0,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: RANK_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const content: string = resp?.choices?.[0]?.message?.content ?? '';
  const parsed = parseJsonContent(content);
  if (!parsed || !Array.isArray(parsed.picks)) {
    throw new Error(
      `Ranker returned invalid JSON. First 300 chars: ${content.slice(0, 300)}`,
    );
  }

  // Clean + validate picks. Only keep ids that were in the input.
  const validIds = new Set(compact.map((c) => c.id));
  const picks: RankPick[] = [];
  for (const p of parsed.picks) {
    if (!p || typeof p.id !== 'string' || !validIds.has(p.id)) continue;
    picks.push({
      id: p.id,
      rank: Number.isFinite(Number(p.rank)) ? Number(p.rank) : picks.length + 1,
      reason: truncate(String(p.reason ?? ''), 80),
    });
  }
  picks.sort((a, b) => a.rank - b.rank);

  return { picks: picks.slice(0, topN), rejected_ids: parsed.rejected_ids ?? [] };
}

// ── Stage 2b: drafting ──────────────────────────────────────────────────

async function draftOne(
  cand: CandidateRow,
): Promise<{
  quick_take: string;
  drafts: DraftVariants;
} | null> {
  const userPayload = `Source: ${cand.source} / @${cand.source_handle ?? 'unknown'}
Score: ${cand.score}
URL: ${cand.url ?? ''}
Tweet text:
"""
${cand.text ?? ''}
"""

Write the three variants + quick_take now. Return JSON only.`;

  const resp = await openRouterChat({
    model: DRAFT_MODEL,
    temperature: 0.4,
    max_tokens: 600,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: DRAFT_SYSTEM_PROMPT },
      { role: 'user', content: userPayload },
    ],
  });

  const content: string = resp?.choices?.[0]?.message?.content ?? '';
  const parsed = parseJsonContent(content);
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

// Simple worker pool for drafts.
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

async function main(): Promise<void> {
  const cands = getCandidatesSince(WINDOW_H, 5);
  console.log(
    `[drafter] window=${WINDOW_H}h min_score=5 candidates=${cands.length} top=${TOP_N}${DRY_RUN ? ' [dry-run]' : ''}`,
  );

  if (cands.length === 0) {
    console.log('[drafter] nothing to do.');
    return;
  }

  // Rank
  let ranked: RankResult;
  try {
    ranked = await rankCandidates(cands, TOP_N);
  } catch (e: any) {
    console.error(`[drafter] ranker failed: ${e?.message ?? String(e)}`);
    console.error('[drafter] aborting run — no DB writes.');
    process.exit(2);
  }

  console.log(
    `[drafter] ranker returned ${ranked.picks.length} picks (rejected ${ranked.rejected_ids?.length ?? 0})`,
  );

  const byId = new Map(cands.map((c) => [c.id, c]));
  const orderedPicks = ranked.picks
    .map((p) => ({ pick: p, cand: byId.get(p.id) }))
    .filter((x) => x.cand) as { pick: RankPick; cand: CandidateRow }[];

  // Show top 5 ranking preview
  console.log('[drafter] top 5 ranking:');
  for (const { pick, cand } of orderedPicks.slice(0, 5)) {
    console.log(
      `  #${pick.rank} (score=${cand.score}) @${cand.source_handle ?? 'unknown'} "${truncate(cand.text ?? '', 70)}" — ${pick.reason}`,
    );
  }

  if (DRY_RUN) {
    console.log('[drafter] dry-run: skipping drafting + DB writes.');
    console.log(`[drafter] candidates=${cands.length} → picked=${orderedPicks.length} → drafted=0 (errors=0)`);
    return;
  }

  // Draft each pick in parallel (bounded)
  let errors = 0;
  let drafted = 0;

  const draftLogs: string[] = new Array(orderedPicks.length);

  await runPool(
    orderedPicks,
    async ({ pick, cand }, idx) => {
      try {
        const out = await draftOne(cand);
        if (!out) {
          errors++;
          draftLogs[idx] = `  #${pick.rank} (score=${cand.score}) @${cand.source_handle ?? 'unknown'} "${truncate(cand.text ?? '', 70)}" → DRAFT FAILED`;
          return;
        }
        const artifact: DraftArtifact = {
          rank: pick.rank,
          rank_reason: pick.reason,
          quick_take: out.quick_take,
          drafts: out.drafts,
          drafted_at: new Date().toISOString(),
        };
        setEventDrafts(cand.id, artifact);
        drafted++;
        draftLogs[idx] = `  #${pick.rank} (score=${cand.score}) @${cand.source_handle ?? 'unknown'} "${truncate(cand.text ?? '', 70)}" → straight/hot_take/thread drafted`;
      } catch (e: any) {
        errors++;
        draftLogs[idx] = `  #${pick.rank} (score=${cand.score}) @${cand.source_handle ?? 'unknown'} ERROR ${e?.message ?? String(e)}`;
      }
    },
    DRAFT_CONCURRENCY,
  );

  console.log('[drafter] draft log:');
  for (const line of draftLogs) if (line) console.log(line);

  console.log(
    `[drafter] candidates=${cands.length} → picked=${orderedPicks.length} → drafted=${drafted} (errors=${errors})`,
  );

  const totalDrafted = countDraftedEvents();
  console.log(`[drafter] DB summary: events.drafts_json NOT NULL = ${totalDrafted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
