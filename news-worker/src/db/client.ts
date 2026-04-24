/**
 * Typed helpers around the D1 binding. All queries go through here so
 * handlers don't need to know raw SQL.
 */

export interface HandleRow {
  handle: string;
  user_id: string | null;
  name: string | null;
  category: string | null;
  tier: number;
  description: string | null;
  source: string | null;
  active: number;
  added_at: string;
  last_polled_at: string | null;
  last_tweet_id: string | null;
}

export interface EventRow {
  id: string;
  source: string;
  source_handle: string | null;
  url: string | null;
  created_at: string;
  ingested_at: string;
  title: string | null;
  text: string | null;
  lang: string | null;
  like_count: number | null;
  reply_count: number | null;
  retweet_count: number | null;
  view_count: number | null;
  score: number | null;
  news_score: number | null;
  virality_score: number | null;
  score_reason: string | null;
  drafts_json: string | null;
  posted: number;
  pushed_at: string | null;
  tg_message_id: number | null;
  approved_variant: string | null;
  raw_json: string | null;
}

// ── handles ─────────────────────────────────────────────────────────────

export async function getActiveHandles(
  db: D1Database,
  tierMax = 3,
): Promise<Pick<HandleRow, 'handle' | 'user_id' | 'tier' | 'last_tweet_id'>[]> {
  const { results } = await db
    .prepare(
      `SELECT handle, user_id, tier, last_tweet_id
         FROM handles
        WHERE active = 1 AND tier <= ?
        ORDER BY tier, handle`,
    )
    .bind(tierMax)
    .all<Pick<HandleRow, 'handle' | 'user_id' | 'tier' | 'last_tweet_id'>>();
  return results ?? [];
}

/**
 * Like getActiveHandles but ordered by last_polled_at ASC (NULLS FIRST) so
 * stalest (never-polled or longest-unpolled) handles surface first. Used by
 * the Worker poller which can only process a limited number of batches per
 * cron tick and must make forward progress across the full handle set.
 */
export async function getStalestHandles(
  db: D1Database,
  tierMax = 3,
  limit = 1000,
): Promise<
  Pick<
    HandleRow,
    'handle' | 'user_id' | 'tier' | 'last_tweet_id' | 'last_polled_at'
  >[]
> {
  const { results } = await db
    .prepare(
      `SELECT handle, user_id, tier, last_tweet_id, last_polled_at
         FROM handles
        WHERE active = 1 AND tier <= ?
        ORDER BY (last_polled_at IS NULL) DESC, last_polled_at ASC, tier, handle
        LIMIT ?`,
    )
    .bind(tierMax, limit)
    .all<
      Pick<
        HandleRow,
        'handle' | 'user_id' | 'tier' | 'last_tweet_id' | 'last_polled_at'
      >
    >();
  return results ?? [];
}

export async function updateHandlePoll(
  db: D1Database,
  handle: string,
  lastTweetId: string | null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE handles
         SET last_polled_at = CURRENT_TIMESTAMP,
             last_tweet_id = COALESCE(?, last_tweet_id)
       WHERE handle = ?`,
    )
    .bind(lastTweetId, handle.toLowerCase())
    .run();
}

// ── events ──────────────────────────────────────────────────────────────

export async function insertEvent(
  db: D1Database,
  e: {
    id: string;
    source: string;
    source_handle?: string | null;
    url?: string | null;
    created_at: string;
    title?: string | null;
    text?: string | null;
    lang?: string | null;
    like_count?: number | null;
    reply_count?: number | null;
    retweet_count?: number | null;
    view_count?: number | null;
    raw_json?: unknown;
  },
): Promise<boolean> {
  const rs = await db
    .prepare(
      `INSERT OR IGNORE INTO events
         (id, source, source_handle, url, created_at, title, text, lang,
          like_count, reply_count, retweet_count, view_count, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      e.id,
      e.source,
      e.source_handle ?? null,
      e.url ?? null,
      e.created_at,
      e.title ?? null,
      e.text ?? null,
      e.lang ?? null,
      e.like_count ?? null,
      e.reply_count ?? null,
      e.retweet_count ?? null,
      e.view_count ?? null,
      e.raw_json ? JSON.stringify(e.raw_json) : null,
    )
    .run();
  return (rs.meta.changes ?? 0) > 0;
}

export async function getUnscoredEvents(
  db: D1Database,
  limit = 50,
): Promise<EventRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM events WHERE score IS NULL ORDER BY ingested_at ASC LIMIT ?`,
    )
    .bind(limit)
    .all<EventRow>();
  return results ?? [];
}

export async function setEventScore(
  db: D1Database,
  id: string,
  score: number,
  reason: string,
  newsScore: number | null = null,
  viralityScore: number | null = null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE events
          SET score = ?,
              news_score = ?,
              virality_score = ?,
              score_reason = ?
        WHERE id = ?`,
    )
    .bind(score, newsScore, viralityScore, reason, id)
    .run();
}

export async function getDraftCandidates(
  db: D1Database,
  windowHours: number,
  minScore = 5,
): Promise<EventRow[]> {
  // D1 stores ingested_at via CURRENT_TIMESTAMP → "YYYY-MM-DD HH:MM:SS" (space).
  // ISO "...T...Z" lexicographically > space form, so using raw toISOString()
  // silently filters out every row. Convert to D1's shape before binding.
  const cutoff = new Date(Date.now() - windowHours * 3600_000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  const { results } = await db
    .prepare(
      `SELECT * FROM events
        WHERE score >= ?
          AND ingested_at >= ?
          AND posted = 0
          AND drafts_json IS NULL
        ORDER BY score DESC, created_at DESC`,
    )
    .bind(minScore, cutoff)
    .all<EventRow>();
  return results ?? [];
}

export async function setEventDrafts(
  db: D1Database,
  id: string,
  draftsJson: string,
): Promise<void> {
  await db
    .prepare(`UPDATE events SET drafts_json = ? WHERE id = ?`)
    .bind(draftsJson, id)
    .run();
}

export async function getPushableEvents(
  db: D1Database,
  limit: number,
): Promise<EventRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM events
        WHERE drafts_json IS NOT NULL
          AND posted = 0
          AND pushed_at IS NULL
        ORDER BY score DESC, created_at DESC
        LIMIT ?`,
    )
    .bind(limit)
    .all<EventRow>();
  return results ?? [];
}

export async function markEventPushed(
  db: D1Database,
  id: string,
  tgMessageId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE events
          SET pushed_at = CURRENT_TIMESTAMP,
              tg_message_id = ?
        WHERE id = ?`,
    )
    .bind(tgMessageId, id)
    .run();
}

export async function approveEventVariant(
  db: D1Database,
  id: string,
  variant: 'straight' | 'hot_take' | 'thread',
): Promise<void> {
  await db
    .prepare(
      `UPDATE events SET approved_variant = ?, posted = 1 WHERE id = ?`,
    )
    .bind(variant, id)
    .run();
}

export async function skipEvent(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(`UPDATE events SET posted = 1 WHERE id = ?`)
    .bind(id)
    .run();
}

export async function rejectEvent(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(`UPDATE events SET posted = -1 WHERE id = ?`)
    .bind(id)
    .run();
}

export async function getEventById(
  db: D1Database,
  id: string,
): Promise<EventRow | null> {
  const row = await db
    .prepare(`SELECT * FROM events WHERE id = ?`)
    .bind(id)
    .first<EventRow>();
  return row ?? null;
}

// ── poll_runs audit ─────────────────────────────────────────────────────

export async function logPollRun(
  db: D1Database,
  row: {
    source: string;
    handle?: string | null;
    duration_ms: number;
    tweets_fetched?: number | null;
    new_tweets?: number | null;
    error?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO poll_runs (source, handle, duration_ms, tweets_fetched, new_tweets, error)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.source,
      row.handle ?? null,
      row.duration_ms,
      row.tweets_fetched ?? null,
      row.new_tweets ?? null,
      row.error ?? null,
    )
    .run();
}
