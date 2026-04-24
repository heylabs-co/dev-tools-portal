/**
 * Local SQLite event store for raw + classified news events.
 *
 * Uses better-sqlite3. Events never leave this file during dev —
 * pipeline runs entirely local until we decide to ship.
 *
 * Schema:
 *   events:        everything we've ingested (raw + classified fields)
 *   handles:       the priority list with status, last_polled_at, etc.
 *   poll_runs:     audit log (when we hit TwitterAPI, cost in credits)
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

const DEFAULT_PATH = join(process.cwd(), 'scripts/news-aggregator/output/events.db');

let _db: Database.Database | null = null;

export function db(path = DEFAULT_PATH): Database.Database {
  if (_db) return _db;
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  const d = new Database(path);
  d.pragma('journal_mode = WAL');
  d.exec(`
    CREATE TABLE IF NOT EXISTS handles (
      handle             TEXT PRIMARY KEY,
      user_id            TEXT,
      name               TEXT,
      category           TEXT,
      tier               INTEGER DEFAULT 3,
      description        TEXT,
      source             TEXT,
      active             INTEGER DEFAULT 1,
      added_at           TEXT DEFAULT CURRENT_TIMESTAMP,
      last_polled_at     TEXT,
      last_tweet_id      TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id                 TEXT PRIMARY KEY,
      source             TEXT NOT NULL,           -- 'twitter', 'hn', 'reddit', 'gh-trending', ...
      source_handle      TEXT,                    -- who posted it
      url                TEXT,
      created_at         TEXT NOT NULL,           -- ISO from source
      ingested_at        TEXT DEFAULT CURRENT_TIMESTAMP,
      title              TEXT,
      text               TEXT,
      lang               TEXT,
      like_count         INTEGER,
      reply_count        INTEGER,
      retweet_count      INTEGER,
      view_count         INTEGER,
      score              INTEGER,                 -- DeepSeek 0-10 classifier
      score_reason       TEXT,
      drafts_json        TEXT,                    -- Sonnet drafts (stage 2)
      posted             INTEGER DEFAULT 0,
      raw_json           TEXT                     -- full source payload
    );

    CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
    CREATE INDEX IF NOT EXISTS idx_events_score   ON events(score);
    CREATE INDEX IF NOT EXISTS idx_events_source  ON events(source, source_handle);

    CREATE TABLE IF NOT EXISTS poll_runs (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      source             TEXT NOT NULL,
      ran_at             TEXT DEFAULT CURRENT_TIMESTAMP,
      duration_ms        INTEGER,
      handle             TEXT,
      tweets_fetched     INTEGER,
      new_tweets         INTEGER,
      error              TEXT
    );
  `);

  // ── Lightweight migrations ───────────────────────────────────────────
  // CREATE TABLE IF NOT EXISTS won't add new columns to an existing events
  // table, so ALTER them in best-effort (re-runs throw "duplicate column").
  for (const ddl of [
    `ALTER TABLE events ADD COLUMN pushed_at TEXT`,
    `ALTER TABLE events ADD COLUMN tg_message_id INTEGER`,
    `ALTER TABLE events ADD COLUMN approved_variant TEXT`,
  ]) {
    try {
      d.exec(ddl);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (!msg.includes('duplicate column name')) throw e;
    }
  }

  _db = d;
  return d;
}

// ── handles ─────────────────────────────────────────────────────────────

export function upsertHandle(row: {
  handle: string;
  user_id?: string;
  name?: string;
  category?: string;
  tier?: number;
  description?: string;
  source?: string;
}): void {
  db()
    .prepare(
      `INSERT INTO handles (handle, user_id, name, category, tier, description, source)
       VALUES (@handle, @user_id, @name, @category, @tier, @description, @source)
       ON CONFLICT(handle) DO UPDATE SET
         user_id = COALESCE(@user_id, handles.user_id),
         name = COALESCE(@name, handles.name),
         category = COALESCE(@category, handles.category),
         tier = COALESCE(@tier, handles.tier),
         description = COALESCE(@description, handles.description),
         source = COALESCE(@source, handles.source)`,
    )
    .run({
      handle: row.handle.toLowerCase(),
      user_id: row.user_id ?? null,
      name: row.name ?? null,
      category: row.category ?? null,
      tier: row.tier ?? 3,
      description: row.description ?? null,
      source: row.source ?? null,
    });
}

export function getActiveHandles(tierMax = 3): Array<{
  handle: string;
  user_id?: string;
  tier: number;
  last_tweet_id?: string;
}> {
  return db()
    .prepare(`SELECT handle, user_id, tier, last_tweet_id FROM handles WHERE active = 1 AND tier <= ? ORDER BY tier, handle`)
    .all(tierMax) as any;
}

export function updateHandlePoll(
  handle: string,
  lastTweetId: string | null,
): void {
  db()
    .prepare(
      `UPDATE handles SET last_polled_at = CURRENT_TIMESTAMP, last_tweet_id = COALESCE(?, last_tweet_id) WHERE handle = ?`,
    )
    .run(lastTweetId, handle.toLowerCase());
}

// ── events ──────────────────────────────────────────────────────────────

export function insertEvent(e: {
  id: string;
  source: string;
  source_handle?: string;
  url?: string;
  created_at: string;
  title?: string;
  text?: string;
  lang?: string;
  like_count?: number;
  reply_count?: number;
  retweet_count?: number;
  view_count?: number;
  raw_json?: unknown;
}): boolean {
  const info = db()
    .prepare(
      `INSERT OR IGNORE INTO events
         (id, source, source_handle, url, created_at, title, text, lang,
          like_count, reply_count, retweet_count, view_count, raw_json)
       VALUES (@id, @source, @source_handle, @url, @created_at, @title, @text, @lang,
          @like_count, @reply_count, @retweet_count, @view_count, @raw_json)`,
    )
    .run({
      ...e,
      source_handle: e.source_handle ?? null,
      url: e.url ?? null,
      title: e.title ?? null,
      text: e.text ?? null,
      lang: e.lang ?? null,
      like_count: e.like_count ?? null,
      reply_count: e.reply_count ?? null,
      retweet_count: e.retweet_count ?? null,
      view_count: e.view_count ?? null,
      raw_json: e.raw_json ? JSON.stringify(e.raw_json) : null,
    });
  return info.changes > 0;
}

export function setEventScore(id: string, score: number, reason: string): void {
  db()
    .prepare(`UPDATE events SET score = ?, score_reason = ? WHERE id = ?`)
    .run(score, reason, id);
}

// ── stage-2 drafter helpers ─────────────────────────────────────────────

export interface CandidateRow {
  id: string;
  source: string;
  source_handle: string | null;
  url: string | null;
  created_at: string;
  ingested_at: string;
  text: string | null;
  score: number;
  score_reason: string | null;
  like_count: number | null;
  retweet_count: number | null;
  view_count: number | null;
}

/**
 * Return events eligible for Stage-2 drafting:
 *   score >= minScore AND ingested_at >= now - windowHours AND
 *   posted = 0 AND drafts_json IS NULL.
 * Sorted by score DESC, created_at DESC.
 *
 * We filter on ingested_at (ISO) rather than created_at (Twitter-format
 * string that SQLite can't parse).
 */
export function getCandidatesSince(
  windowHours: number,
  minScore = 5,
): CandidateRow[] {
  const cutoff = new Date(Date.now() - windowHours * 3600_000).toISOString();
  return db()
    .prepare(
      `SELECT id, source, source_handle, url, created_at, ingested_at, text,
              score, score_reason, like_count, retweet_count, view_count
         FROM events
        WHERE score >= ?
          AND ingested_at >= ?
          AND posted = 0
          AND drafts_json IS NULL
        ORDER BY score DESC, created_at DESC`,
    )
    .all(minScore, cutoff) as CandidateRow[];
}

export function setEventDrafts(id: string, draftsJson: unknown): void {
  db()
    .prepare(`UPDATE events SET drafts_json = ? WHERE id = ?`)
    .run(JSON.stringify(draftsJson), id);
}

export function markEventPosted(id: string): void {
  db()
    .prepare(`UPDATE events SET posted = 1 WHERE id = ?`)
    .run(id);
}

export function countDraftedEvents(): number {
  const row = db()
    .prepare(`SELECT COUNT(*) AS n FROM events WHERE drafts_json IS NOT NULL`)
    .get() as { n: number };
  return row.n;
}

// ── telegram review helpers ─────────────────────────────────────────────

export interface PushableEvent {
  id: string;
  source: string;
  source_handle: string | null;
  url: string | null;
  score: number | null;
  score_reason: string | null;
  drafts_json: string | null;
}

/**
 * Events with drafts, not posted, not yet pushed to Telegram.
 */
export function getPushableEvents(limit = 100): PushableEvent[] {
  return db()
    .prepare(
      `SELECT id, source, source_handle, url, score, score_reason, drafts_json
         FROM events
        WHERE drafts_json IS NOT NULL
          AND posted = 0
          AND pushed_at IS NULL
        ORDER BY score DESC, ingested_at DESC
        LIMIT ?`,
    )
    .all(limit) as PushableEvent[];
}

export function markEventPushed(id: string, tgMessageId: number): void {
  db()
    .prepare(
      `UPDATE events SET pushed_at = ?, tg_message_id = ? WHERE id = ?`,
    )
    .run(new Date().toISOString(), tgMessageId, id);
}

export function approveEventVariant(id: string, variant: string): void {
  db()
    .prepare(`UPDATE events SET approved_variant = ?, posted = 1 WHERE id = ?`)
    .run(variant, id);
}

export function skipEvent(id: string): void {
  db().prepare(`UPDATE events SET posted = 1 WHERE id = ?`).run(id);
}

export function rejectEvent(id: string): void {
  db().prepare(`UPDATE events SET posted = -1 WHERE id = ?`).run(id);
}

export function getEventById(id: string): any | null {
  return (
    db()
      .prepare(
        `SELECT id, source, source_handle, url, score, drafts_json,
                pushed_at, tg_message_id, approved_variant, posted
           FROM events WHERE id = ?`,
      )
      .get(id) ?? null
  );
}

// ── poll runs (audit) ───────────────────────────────────────────────────

export function logPollRun(row: {
  source: string;
  handle?: string;
  duration_ms: number;
  tweets_fetched?: number;
  new_tweets?: number;
  error?: string;
}): void {
  db()
    .prepare(
      `INSERT INTO poll_runs (source, handle, duration_ms, tweets_fetched, new_tweets, error)
       VALUES (@source, @handle, @duration_ms, @tweets_fetched, @new_tweets, @error)`,
    )
    .run({
      source: row.source,
      handle: row.handle ?? null,
      duration_ms: row.duration_ms,
      tweets_fetched: row.tweets_fetched ?? null,
      new_tweets: row.new_tweets ?? null,
      error: row.error ?? null,
    });
}
