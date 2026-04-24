-- Add virality scoring alongside news scoring.
-- Final `score` column becomes a weighted blend; individual axes kept for tuning.

ALTER TABLE events ADD COLUMN news_score INTEGER;
ALTER TABLE events ADD COLUMN virality_score INTEGER;

CREATE INDEX IF NOT EXISTS idx_events_virality ON events(virality_score);
