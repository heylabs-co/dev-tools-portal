-- D1 schema for toolnews-news Worker
-- Mirrors scripts/news-aggregator/storage.ts but with D1-friendly types.
-- Run: wrangler d1 execute toolnews-news --file=migrations/0001_init.sql

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

CREATE INDEX IF NOT EXISTS idx_handles_active_tier ON handles(active, tier);

CREATE TABLE IF NOT EXISTS events (
  id                 TEXT PRIMARY KEY,
  source             TEXT NOT NULL,
  source_handle      TEXT,
  url                TEXT,
  created_at         TEXT NOT NULL,
  ingested_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  title              TEXT,
  text               TEXT,
  lang               TEXT,
  like_count         INTEGER,
  reply_count        INTEGER,
  retweet_count      INTEGER,
  view_count         INTEGER,
  score              INTEGER,
  score_reason       TEXT,
  drafts_json        TEXT,
  posted             INTEGER DEFAULT 0,
  pushed_at          TEXT,
  tg_message_id      INTEGER,
  approved_variant   TEXT,
  raw_json           TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_ingested ON events(ingested_at);
CREATE INDEX IF NOT EXISTS idx_events_score   ON events(score);
CREATE INDEX IF NOT EXISTS idx_events_source  ON events(source, source_handle);
CREATE INDEX IF NOT EXISTS idx_events_pending_draft ON events(score, posted, drafts_json);

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

CREATE INDEX IF NOT EXISTS idx_poll_runs_time ON poll_runs(ran_at);
