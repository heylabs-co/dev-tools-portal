/**
 * TwitterAPI.io batched poller for Cloudflare Workers.
 *
 * Strategy: instead of 1 advanced-search call per handle (expensive in credits
 * and in requests/sec), we group ~10 handles per call using
 *   (from:a OR from:b OR ... from:j) since_time:<unix>
 * keeping the query under the 500-char limit.
 *
 * Worker runtime limits mean we only process MAX_BATCHES_PER_RUN batches per
 * invocation; leftover handles get picked up on the next cron tick because
 * getStalestHandles orders by last_polled_at ASC.
 */

import type { Env } from './env';
import {
  getStalestHandles,
  insertEvent,
  updateHandlePoll,
  logPollRun,
} from './db/client';
import {
  TwitterApiIoClient,
  RateLimitError,
  filterOriginals,
  type Tweet,
} from './sources/twitter';
import { fetchHackerNews } from './sources/hackernews';
import { fetchLobsters } from './sources/lobsters';
import { fetchReddit } from './sources/reddit';
import { fetchGithubTrending } from './sources/github';
import { fetchProductHunt } from './sources/producthunt';

// ── Constants ───────────────────────────────────────────────────────────

const TIER_MAX = 3;
const BATCH_SIZE = 10;
const QUERY_MAX_LEN = 500;
const MAX_BATCHES_PER_RUN = 50;
const INTER_BATCH_DELAY_MS = 1500;
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7d cap for first-run handles
const HANDLES_FETCH_LIMIT = MAX_BATCHES_PER_RUN * BATCH_SIZE; // 500

interface HandleForPoll {
  handle: string;
  last_polled_at?: string | null;
}

interface Batch {
  handles: string[];
  sinceTime: number; // unix seconds
  query: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildQuery(handles: string[], sinceTime: number): string {
  const parts = handles.map((h) => `from:${h}`).join(' OR ');
  return `(${parts}) since_time:${sinceTime}`;
}

/**
 * Convert last_polled_at ISO → unix seconds. Missing/invalid falls back to
 * now - 24h. Any resulting window older than 7d is clamped to now - 7d.
 */
function toSinceTime(iso: string | null | undefined): number {
  const now = Date.now();
  const floor = now - MAX_WINDOW_MS;
  let ms: number;
  if (!iso) {
    ms = now - DEFAULT_WINDOW_MS;
  } else {
    const parsed = Date.parse(iso);
    ms = Number.isNaN(parsed) ? now - DEFAULT_WINDOW_MS : parsed;
  }
  if (ms < floor) ms = floor;
  return Math.floor(ms / 1000);
}

/**
 * Pack handles into batches constrained by BATCH_SIZE and QUERY_MAX_LEN.
 * Each batch's since_time is the OLDEST last_polled_at among its members
 * (so we don't miss tweets for a stale handle that's grouped with fresh ones).
 */
function buildBatches(handles: HandleForPoll[]): Batch[] {
  const out: Batch[] = [];
  let i = 0;
  while (i < handles.length) {
    const group: HandleForPoll[] = [];
    let oldestSince = Number.POSITIVE_INFINITY;

    while (i < handles.length && group.length < BATCH_SIZE) {
      const next = handles[i];
      const nextSince = toSinceTime(next.last_polled_at);
      const candidateSince = Math.min(oldestSince, nextSince);
      const candidate = [...group, next];
      const candidateQuery = buildQuery(
        candidate.map((h) => h.handle),
        candidateSince,
      );
      if (candidateQuery.length > QUERY_MAX_LEN && group.length > 0) {
        break;
      }
      group.push(next);
      oldestSince = candidateSince;
      i++;
    }

    if (group.length === 0) break; // single handle blows the length cap

    out.push({
      handles: group.map((h) => h.handle),
      sinceTime: oldestSince,
      query: buildQuery(group.map((h) => h.handle), oldestSince),
    });
  }
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────

export interface PollerStats {
  batches: number;
  handles: number;
  tweets_fetched: number;
  new_events: number;
  rate_limited: number;
  duration_ms: number;
}

export async function runPoller(env: Env): Promise<PollerStats> {
  const t0 = Date.now();
  const stats: PollerStats = {
    batches: 0,
    handles: 0,
    tweets_fetched: 0,
    new_events: 0,
    rate_limited: 0,
    duration_ms: 0,
  };

  if (!env.TWITTERAPI_KEY) {
    await logPollRun(env.DB, {
      source: 'twitter-batched',
      duration_ms: Date.now() - t0,
      error: 'missing TWITTERAPI_KEY',
    });
    stats.duration_ms = Date.now() - t0;
    return stats;
  }

  // Stalest first so leftovers next cron tick naturally rotate.
  const rawHandles = await getStalestHandles(
    env.DB,
    TIER_MAX,
    HANDLES_FETCH_LIMIT,
  );
  const handles: HandleForPoll[] = rawHandles.map((h) => ({
    handle: h.handle,
    last_polled_at: h.last_polled_at,
  }));

  const allBatches = buildBatches(handles);
  const batches = allBatches.slice(0, MAX_BATCHES_PER_RUN);

  const client = new TwitterApiIoClient(env.TWITTERAPI_KEY);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchT0 = Date.now();
    let fetched = 0;
    let added = 0;
    let errMsg: string | undefined;
    let rateLimited = false;

    try {
      const res = await client.advancedSearch(batch.query);
      const originals = filterOriginals(res.tweets);
      fetched = res.tweets.length;

      const newestPerHandle = new Map<string, Tweet>();

      for (const t of originals) {
        const rawHandle = t.author?.userName;
        if (!rawHandle) continue;
        const handle = rawHandle.toLowerCase();
        // Defensive: the API should honour `from:` but double-check.
        if (!batch.handles.includes(handle)) continue;

        const ok = await insertEvent(env.DB, {
          id: t.id,
          source: 'twitter',
          source_handle: handle,
          url: `https://x.com/${handle}/status/${t.id}`,
          created_at: t.createdAt,
          text: t.text,
          lang: t.lang ?? null,
          like_count: t.likeCount ?? null,
          reply_count: t.replyCount ?? null,
          retweet_count: t.retweetCount ?? null,
          view_count: t.viewCount ?? null,
          raw_json: t,
        });
        if (ok) added++;

        const prev = newestPerHandle.get(handle);
        if (!prev || t.id > prev.id) newestPerHandle.set(handle, t);
      }

      // Update last_polled_at for EVERY queried handle — even those with no
      // tweets — so we rotate forward and stalest-first ordering works.
      for (const h of batch.handles) {
        const newest = newestPerHandle.get(h);
        await updateHandlePoll(env.DB, h, newest?.id ?? null);
      }
    } catch (e) {
      if (e instanceof RateLimitError) {
        rateLimited = true;
        errMsg = 'rate-limit';
        stats.rate_limited++;
      } else {
        errMsg = e instanceof Error ? e.message : String(e);
      }
    }

    stats.batches++;
    stats.handles += batch.handles.length;
    stats.tweets_fetched += fetched;
    stats.new_events += added;

    await logPollRun(env.DB, {
      source: 'twitter-batched',
      handle: batch.handles.join(','),
      duration_ms: Date.now() - batchT0,
      tweets_fetched: fetched,
      new_tweets: added,
      error: errMsg ?? null,
    });

    if (i < batches.length - 1) {
      await sleep(rateLimited ? INTER_BATCH_DELAY_MS * 4 : INTER_BATCH_DELAY_MS);
    }
  }

  stats.duration_ms = Date.now() - t0;
  return stats;
}

// ── Free sources (HN, Lobsters) ────────────────────────────────────────

export interface FreeSourceStats {
  fetched: number;
  inserted: number;
  error?: string;
}

export interface FreeSourcesResult {
  hackernews: FreeSourceStats;
  lobsters: FreeSourceStats;
  reddit: FreeSourceStats;
  github: FreeSourceStats;
  producthunt: FreeSourceStats;
}

type FreeFetcher = () => Promise<Array<Parameters<typeof insertEvent>[1]>>;

async function runOneFreeSource(
  env: Env,
  source: string,
  fetcher: FreeFetcher,
): Promise<FreeSourceStats> {
  const t0 = Date.now();
  const out: FreeSourceStats = { fetched: 0, inserted: 0 };
  let events: Array<Parameters<typeof insertEvent>[1]> = [];
  try {
    events = await fetcher();
    out.fetched = events.length;
    for (const ev of events) {
      try {
        const ok = await insertEvent(env.DB, ev);
        if (ok) out.inserted++;
      } catch (e) {
        console.warn(`[${source}] insertEvent failed`, e);
      }
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
    console.warn(`[${source}] poll failed`, e);
  }

  await logPollRun(env.DB, {
    source,
    duration_ms: Date.now() - t0,
    tweets_fetched: out.fetched,
    new_tweets: out.inserted,
    error: out.error ?? null,
  });

  return out;
}

export async function runFreeSourcesPoller(
  env: Env,
): Promise<FreeSourcesResult> {
  const [hackernews, lobsters, reddit, github, producthunt] = await Promise.all([
    runOneFreeSource(env, 'hackernews', () => fetchHackerNews(24)),
    runOneFreeSource(env, 'lobsters', () => fetchLobsters(24)),
    runOneFreeSource(env, 'reddit', () => fetchReddit()),
    runOneFreeSource(env, 'github', () => fetchGithubTrending()),
    runOneFreeSource(env, 'producthunt', () => fetchProductHunt()),
  ]);
  return { hackernews, lobsters, reddit, github, producthunt };
}
