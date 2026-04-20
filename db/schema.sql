-- DevTools Portal - Voting System Schema (Cloudflare D1)

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_slug TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK(vote_type IN ('up', 'down')),
  voter_ip TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tool_slug, voter_ip)
);

CREATE INDEX IF NOT EXISTS idx_votes_slug ON votes(tool_slug);

-- Aggregated view for fast reads
CREATE TABLE IF NOT EXISTS vote_counts (
  tool_slug TEXT PRIMARY KEY,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0
);
