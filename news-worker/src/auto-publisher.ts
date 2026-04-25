/**
 * Auto-publisher — promotes scored events onto the public site and (a subset)
 * into the Telegram channel without a human in the loop.
 *
 * Two tiers:
 *   - Site  (`/whats-new`)    — score >= 6,  marker `approved_variant='auto'`
 *   - Channel (@toolnewshq)   — score >= 8 AND virality >= 7, ingested <24h
 *
 * Ignores anything the drafter has already touched (drafts_json set) —
 * those belong to the daily human-review queue and are reserved for X.
 */

import type { Env } from './env';
import { type EventRow } from './db/client';
import { postApprovedToChannel } from './handlers/telegram';

// score >= 5 lets "useful but narrow" events onto the site (Bun release,
// benchmark threads, OSS launches). Previously 6 was too strict — only ~1%
// of classified events hit it, so the feed stalled for hours between approvals.
const SITE_SCORE_THRESHOLD = 5;
const CHANNEL_SCORE_THRESHOLD = 7;
const CHANNEL_VIRALITY_THRESHOLD = 6;
const MAX_AUTO_PUBLISH_PER_RUN = 50;
const MAX_CHANNEL_POSTS_PER_RUN = 5;
const CHANNEL_FRESH_HOURS = 24;

export interface AutoPublishStats {
  auto_published: number;
  channel_posted: number;
  channel_skipped_stale: number;
  candidates: number;
  duration_ms: number;
}

function fresherThanHours(iso: string | null | undefined, hours: number): boolean {
  if (!iso) return false;
  // D1 stores CURRENT_TIMESTAMP as "YYYY-MM-DD HH:MM:SS". Normalize to Date.
  const s = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const t = Date.parse(s);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= hours * 3600_000;
}

export async function runAutoPublisher(env: Env): Promise<AutoPublishStats> {
  const t0 = Date.now();
  const stats: AutoPublishStats = {
    auto_published: 0,
    channel_posted: 0,
    channel_skipped_stale: 0,
    candidates: 0,
    duration_ms: 0,
  };

  // Step 1: pick events eligible for site publication.
  // Order by score DESC so high-score events get to channel first when
  // backlog is draining; tie-break by age so we chew the oldest first.
  const { results } = await env.DB.prepare(
    `SELECT * FROM events
      WHERE score >= ?
        AND posted = 0
        AND pushed_at IS NULL
        AND drafts_json IS NULL
      ORDER BY score DESC, virality_score DESC, ingested_at ASC
      LIMIT ?`,
  )
    .bind(SITE_SCORE_THRESHOLD, MAX_AUTO_PUBLISH_PER_RUN)
    .all<EventRow>();

  const events = results ?? [];
  stats.candidates = events.length;

  if (events.length === 0) {
    stats.duration_ms = Date.now() - t0;
    return stats;
  }

  // Step 2: mark them as auto-approved so /whats-new picks them up.
  for (const ev of events) {
    try {
      await env.DB.prepare(
        `UPDATE events
            SET posted = 1,
                pushed_at = CURRENT_TIMESTAMP,
                approved_variant = 'auto'
          WHERE id = ? AND posted = 0`,
      )
        .bind(ev.id)
        .run();
      stats.auto_published++;
    } catch (e) {
      console.warn(
        `[auto-publish] UPDATE failed for ${ev.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Step 3: cherry-pick a small set for the public channel.
  // Only push "fresh" items — the channel shouldn't dump a year-old backlog.
  const channelCandidates: EventRow[] = [];
  for (const ev of events) {
    const s = ev.score ?? 0;
    const v = ev.virality_score ?? 0;
    if (s < CHANNEL_SCORE_THRESHOLD) continue;
    if (v < CHANNEL_VIRALITY_THRESHOLD) continue;
    if (!fresherThanHours(ev.ingested_at, CHANNEL_FRESH_HOURS)) {
      stats.channel_skipped_stale++;
      continue;
    }
    channelCandidates.push(ev);
    if (channelCandidates.length >= MAX_CHANNEL_POSTS_PER_RUN) break;
  }

  for (const ev of channelCandidates) {
    try {
      await postApprovedToChannel(env, ev, 'auto');
      stats.channel_posted++;
    } catch (e) {
      console.warn(
        `[auto-publish] channel post failed ${ev.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  stats.duration_ms = Date.now() - t0;
  console.log(
    `[auto-publish] candidates=${stats.candidates} site=${stats.auto_published} channel=${stats.channel_posted} stale_skipped=${stats.channel_skipped_stale} ms=${stats.duration_ms}`,
  );
  return stats;
}
