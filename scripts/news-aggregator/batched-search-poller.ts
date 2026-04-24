/**
 * Batched advanced-search poller for TwitterAPI.io.
 *
 * Instead of 1 call per handle (300 credits), we group ~10 handles per call
 * using `(from:a OR from:b OR ...) since_time:<unix>` queries.
 *
 * Run:
 *   npx tsx scripts/news-aggregator/batched-search-poller.ts \
 *     [--tier 1] [--limit 0] [--interval 6000] [--batch-size 10] [--dry-run]
 */

import { config as loadEnv } from 'dotenv';
import { join } from 'path';
loadEnv({ path: join(process.cwd(), '.env') });

import {
  db,
  getActiveHandles,
  updateHandlePoll,
  insertEvent,
  logPollRun,
} from './storage.js';

const args = process.argv.slice(2);
const argVal = (key: string, fallback: string) => {
  const idx = args.findIndex((a) => a === `--${key}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
};
const hasFlag = (key: string) => args.includes(`--${key}`);

const TIER_MAX = parseInt(argVal('tier', '1'), 10);
const LIMIT = parseInt(argVal('limit', '0'), 10); // max batches, 0 = all
const INTERVAL_MS = parseInt(argVal('interval', '6000'), 10);
const BATCH_SIZE = parseInt(argVal('batch-size', '10'), 10);
const DRY_RUN = hasFlag('dry-run');

const QUERY_MAX_LEN = 500; // safety margin under the 512-char API limit
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

type HandleRow = {
  handle: string;
  user_id?: string;
  tier: number;
  last_tweet_id?: string;
  last_polled_at?: string;
};

type Batch = {
  handles: string[];
  sinceTime: number; // unix seconds
  query: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Load handles with last_polled_at so we can compute per-batch since_time. */
function loadHandles(tierMax: number): HandleRow[] {
  // getActiveHandles doesn't return last_polled_at — hit the DB directly.
  const rows = db()
    .prepare(
      `SELECT handle, user_id, tier, last_tweet_id, last_polled_at
         FROM handles
        WHERE active = 1 AND tier <= ?
        ORDER BY tier, handle`,
    )
    .all(tierMax) as HandleRow[];
  return rows;
}

/** Turn an ISO timestamp (or null) into unix seconds, defaulting to now - 24h. */
function toSinceTime(iso: string | undefined | null): number {
  if (!iso) return Math.floor((Date.now() - DEFAULT_WINDOW_MS) / 1000);
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return Math.floor((Date.now() - DEFAULT_WINDOW_MS) / 1000);
  return Math.floor(ms / 1000);
}

/** Build batches constrained by both handle count and query length. */
function buildBatches(handles: HandleRow[], maxPerBatch: number): Batch[] {
  const out: Batch[] = [];
  let i = 0;
  while (i < handles.length) {
    const group: HandleRow[] = [];
    let oldestSince = Number.POSITIVE_INFINITY;

    while (i < handles.length && group.length < maxPerBatch) {
      const next = handles[i];
      const nextSince = toSinceTime(next.last_polled_at);
      const candidateSince = Math.min(oldestSince, nextSince);
      const candidateGroup = [...group, next];
      const candidateQuery = buildQuery(
        candidateGroup.map((h) => h.handle),
        candidateSince,
      );
      if (candidateQuery.length > QUERY_MAX_LEN && group.length > 0) {
        break; // stop here, commit current group
      }
      group.push(next);
      oldestSince = candidateSince;
      i++;
    }

    if (group.length === 0) {
      // Single handle already exceeds the limit — shouldn't happen but guard it.
      break;
    }

    out.push({
      handles: group.map((h) => h.handle),
      sinceTime: oldestSince,
      query: buildQuery(
        group.map((h) => h.handle),
        oldestSince,
      ),
    });
  }
  return out;
}

function buildQuery(handles: string[], sinceTime: number): string {
  const parts = handles.map((h) => `from:${h}`).join(' OR ');
  return `(${parts}) since_time:${sinceTime}`;
}

/** Run one batch — call API, insert events, update handle rows. */
async function runBatch(
  batch: Batch,
  advancedSearch: (q: string) => Promise<import('./sources/twitter.js').AdvancedSearchResult>,
  RateLimitError: typeof import('./sources/twitter.js').RateLimitError,
): Promise<{ fetched: number; added: number; error?: string }> {
  const t0 = Date.now();
  const handleLabel = batch.handles.slice(0, 3).join(',') + (batch.handles.length > 3 ? `+${batch.handles.length - 3}` : '');

  async function attempt(): Promise<{ fetched: number; added: number }> {
    const res = await advancedSearch(batch.query);
    const tweets = res.tweets ?? [];

    // Group newest tweet id per handle so updateHandlePoll records the latest.
    const newestPerHandle = new Map<string, string>();
    let added = 0;

    for (const t of tweets) {
      if (t.isReply) continue;
      if (t.retweeted_tweet && Object.keys(t.retweeted_tweet).length > 0) continue;
      const rawHandle = t.author?.userName;
      if (!rawHandle) continue;
      const handle = rawHandle.toLowerCase();
      // Only accept handles we actually queried (defensive; API should respect from:)
      if (!batch.handles.includes(handle)) continue;

      const ok = insertEvent({
        id: t.id,
        source: 'twitter',
        source_handle: handle,
        url: `https://x.com/${handle}/status/${t.id}`,
        created_at: t.createdAt,
        text: t.text,
        lang: t.lang,
        like_count: t.likeCount,
        reply_count: t.replyCount,
        retweet_count: t.retweetCount,
        view_count: t.viewCount,
        raw_json: t,
      });
      if (ok) added++;

      const prev = newestPerHandle.get(handle);
      if (!prev || t.id > prev) newestPerHandle.set(handle, t.id);
    }

    // Update last_polled_at for every queried handle, newest id where we have one.
    for (const h of batch.handles) {
      updateHandlePoll(h, newestPerHandle.get(h) ?? null);
    }

    return { fetched: tweets.length, added };
  }

  try {
    let result: { fetched: number; added: number };
    try {
      result = await attempt();
    } catch (e) {
      if (e instanceof RateLimitError) {
        console.log(`    rate-limited on ${handleLabel}, sleeping 12s and retrying once`);
        await sleep(12_000);
        result = await attempt();
      } else {
        throw e;
      }
    }

    const dt = Date.now() - t0;
    logPollRun({
      source: 'twitter-batched',
      handle: batch.handles.join(','),
      duration_ms: dt,
      tweets_fetched: result.fetched,
      new_tweets: result.added,
    });
    return result;
  } catch (e: unknown) {
    const dt = Date.now() - t0;
    const err = e instanceof RateLimitError ? 'rate-limit' : (e as Error)?.message ?? String(e);
    logPollRun({
      source: 'twitter-batched',
      handle: batch.query.slice(0, 50),
      duration_ms: dt,
      error: err,
    });
    return { fetched: 0, added: 0, error: err };
  }
}

async function main() {
  const handles = loadHandles(TIER_MAX);
  console.log(`Loaded ${handles.length} active handles (tier <= ${TIER_MAX})`);

  let batches = buildBatches(handles, BATCH_SIZE);
  if (LIMIT > 0) batches = batches.slice(0, LIMIT);

  console.log(
    `Built ${batches.length} batches (batch-size ${BATCH_SIZE}, interval ${INTERVAL_MS}ms, dry-run=${DRY_RUN})`,
  );

  if (DRY_RUN) {
    for (let i = 0; i < batches.length; i++) {
      const b = batches[i];
      console.log(`\n[batch ${i + 1}/${batches.length}] handles=${b.handles.length} len=${b.query.length}`);
      console.log(`  since_time=${b.sinceTime} (${new Date(b.sinceTime * 1000).toISOString()})`);
      console.log(`  query: ${b.query}`);
    }
    console.log(`\nDry run complete. ${batches.length} batches would be called.`);
    return;
  }

  // Lazy-load the twitter module so --dry-run doesn't require TWITTERAPI_KEY.
  const tw = await import('./sources/twitter.js');

  let totalFetched = 0;
  let totalNew = 0;
  let rateLimited = 0;
  const t0 = Date.now();

  for (let i = 0; i < batches.length; i++) {
    const b = batches[i];
    const label = b.handles.slice(0, 3).join(',') + (b.handles.length > 3 ? `+${b.handles.length - 3}` : '');
    const result = await runBatch(b, tw.advancedSearch, tw.RateLimitError);
    totalFetched += result.fetched;
    totalNew += result.added;
    if (result.error === 'rate-limit') rateLimited++;
    const marker = result.error ? `ERR ${result.error}` : `fetched=${result.fetched} new=${result.added}`;
    console.log(`  [${i + 1}/${batches.length}] (${label})  ${marker}`);
    if (i < batches.length - 1) {
      await sleep(result.error === 'rate-limit' ? INTERVAL_MS * 2 : INTERVAL_MS);
    }
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const totalHandles = batches.reduce((s, b) => s + b.handles.length, 0);
  console.log(
    `\nDone. batches=${batches.length} handles=${totalHandles} tweets_fetched=${totalFetched} new_events=${totalNew} rate_limited=${rateLimited} duration=${dt}s`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
