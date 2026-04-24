/**
 * Main polling loop over X/Twitter handles in the SQLite handles table.
 *
 * Strategy:
 *   - Respect QPS limit (free tier: 1 req / 5s). Default 6s between calls.
 *   - Resolve user_id on first poll (user/info endpoint).
 *   - Fetch last_tweets, filter isReply + retweet + older than last_tweet_id.
 *   - Insert new originals into events.
 *   - Update handles.last_tweet_id on success.
 *
 * Run:
 *   npx tsx scripts/news-aggregator/poller.ts [--tier 1] [--limit 10] [--interval 6000]
 */

import { config as loadEnv } from 'dotenv';
import { join } from 'path';
loadEnv({ path: join(process.cwd(), '.env') });

import {
  db,
  getActiveHandles,
  upsertHandle,
  updateHandlePoll,
  insertEvent,
  logPollRun,
} from './storage.js';
import {
  getUserInfo,
  getLastTweets,
  filterOriginals,
  RateLimitError,
  type Tweet,
} from './sources/twitter.js';

const args = process.argv.slice(2);
const argVal = (key: string, fallback: string) => {
  const idx = args.findIndex((a) => a === `--${key}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
};

const TIER_MAX = parseInt(argVal('tier', '1'), 10);
const LIMIT = parseInt(argVal('limit', '0'), 10); // 0 = no limit
const INTERVAL_MS = parseInt(argVal('interval', '6000'), 10);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollOne(row: {
  handle: string;
  user_id?: string | null;
  tier: number;
  last_tweet_id?: string | null;
}): Promise<{ fetched: number; added: number; error?: string }> {
  const t0 = Date.now();
  try {
    // Fetch latest tweets
    const res = await getLastTweets(row.handle);
    const tweets: Tweet[] = res.tweets ?? [];

    // Diff against last_tweet_id if we have one
    let toConsider = tweets;
    if (row.last_tweet_id) {
      const idx = tweets.findIndex((t) => t.id === row.last_tweet_id);
      if (idx >= 0) toConsider = tweets.slice(0, idx);
    }

    const originals = filterOriginals(toConsider);
    let added = 0;
    for (const t of originals) {
      const ok = insertEvent({
        id: t.id,
        source: 'twitter',
        source_handle: row.handle,
        url: `https://x.com/${row.handle}/status/${t.id}`,
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
    }

    // Save newest tweet id so next poll only looks at tweets above it.
    const newest = tweets[0]?.id ?? null;
    updateHandlePoll(row.handle, newest);

    const dt = Date.now() - t0;
    logPollRun({
      source: 'twitter',
      handle: row.handle,
      duration_ms: dt,
      tweets_fetched: tweets.length,
      new_tweets: added,
    });
    return { fetched: tweets.length, added };
  } catch (e: any) {
    const dt = Date.now() - t0;
    const err = e instanceof RateLimitError ? 'rate-limit' : e?.message ?? String(e);
    logPollRun({
      source: 'twitter',
      handle: row.handle,
      duration_ms: dt,
      error: err,
    });
    return { fetched: 0, added: 0, error: err };
  }
}

async function main() {
  let handles = getActiveHandles(TIER_MAX);
  if (LIMIT > 0) handles = handles.slice(0, LIMIT);

  console.log(
    `Polling ${handles.length} handles (tier ≤ ${TIER_MAX}), interval ${INTERVAL_MS}ms`,
  );

  let totalFetched = 0;
  let totalNew = 0;
  let rateLimited = 0;
  const t0 = Date.now();

  for (let i = 0; i < handles.length; i++) {
    const h = handles[i];
    const result = await pollOne({ ...h, user_id: h.user_id ?? null, last_tweet_id: h.last_tweet_id ?? null });
    totalFetched += result.fetched;
    totalNew += result.added;
    if (result.error === 'rate-limit') rateLimited++;
    const marker = result.error ? `ERR ${result.error}` : `fetched=${result.fetched} new=${result.added}`;
    console.log(`  [${i + 1}/${handles.length}] @${h.handle}  ${marker}`);
    if (i < handles.length - 1) {
      await sleep(result.error === 'rate-limit' ? INTERVAL_MS * 2 : INTERVAL_MS);
    }
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\nDone in ${dt}s. fetched=${totalFetched} new_events=${totalNew} rate_limited=${rateLimited}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
