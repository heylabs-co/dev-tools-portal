/**
 * toolnews-news Worker — entrypoint.
 *
 * Handles:
 *   - POST /telegram       Telegram webhook (button callbacks)
 *   - POST /cron/poll      Manual trigger for poller (dev/testing)
 *   - POST /cron/draft     Manual trigger for drafter (dev/testing)
 *   - GET  /whats-new      Public feed (JSON, later HTML)
 *   - GET  /health         Health + version
 *
 * Cron triggers from wrangler.toml fire scheduled() below.
 */

import { Hono } from 'hono';
import type { Env } from './env';
import { handleTelegramWebhook, pushDraftedEvents } from './handlers/telegram';
import { runPoller } from './poller';
import { runFreeSourcesPoller } from './poller';
import { runDrafter } from './drafter';
import { runClassifier } from './classifier';
import { runAutoPublisher } from './auto-publisher';

const PUSH_LIMIT = 15;

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'toolnews-news',
    version: '0.1.0',
    time: new Date().toISOString(),
  }),
);

app.post('/telegram', async (c) => {
  try {
    const update = await c.req.json();
    await handleTelegramWebhook(c.env, update);
    return c.json({ ok: true });
  } catch (e) {
    console.error('telegram webhook error', e);
    return c.json({ ok: false, error: String(e) }, 500);
  }
});

// Manual triggers for dev
app.post('/cron/poll', async (c) => {
  const stats = await runPoller(c.env);
  return c.json({ ok: true, stats });
});

app.post('/cron/poll-free', async (c) => {
  const stats = await runFreeSourcesPoller(c.env);
  return c.json({ ok: true, stats });
});

app.post('/cron/classify', async (c) => {
  const stats = await runClassifier(c.env);
  return c.json({ ok: true, stats });
});

app.post('/cron/auto-publish', async (c) => {
  const stats = await runAutoPublisher(c.env);
  return c.json({ ok: true, stats });
});

app.get('/debug/stats', async (c) => {
  const q = async (sql: string) =>
    await c.env.DB.prepare(sql).first<Record<string, unknown>>();

  const totals = await q(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN score IS NOT NULL THEN 1 ELSE 0 END) AS scored,
            SUM(CASE WHEN drafts_json IS NOT NULL THEN 1 ELSE 0 END) AS drafted,
            SUM(CASE WHEN pushed_at IS NOT NULL THEN 1 ELSE 0 END) AS pushed,
            SUM(CASE WHEN approved_variant IS NOT NULL THEN 1 ELSE 0 END) AS approved
       FROM events`,
  );
  const pipeline = await q(
    `SELECT COUNT(*) AS eligible_for_draft
       FROM events
      WHERE score >= 5
        AND ingested_at >= datetime('now', '-24 hours')
        AND posted = 0
        AND drafts_json IS NULL`,
  );
  const ingestWindow = await q(
    `SELECT COUNT(*) AS ingested_24h,
            SUM(CASE WHEN score >= 5 THEN 1 ELSE 0 END) AS high_score_24h
       FROM events WHERE ingested_at >= datetime('now', '-24 hours')`,
  );
  const pollToday = await q(
    `SELECT COUNT(*) AS runs_today, MIN(ran_at) AS earliest, MAX(ran_at) AS latest
       FROM poll_runs WHERE ran_at >= datetime('now', 'start of day')`,
  );
  const pending = await q(
    `SELECT COUNT(*) AS pending_tg_review
       FROM events
      WHERE drafts_json IS NOT NULL
        AND pushed_at IS NOT NULL
        AND posted = 0`,
  );

  return c.json({ totals, pipeline, ingestWindow, pollToday, pending });
});

app.get('/debug/top-scored', async (c) => {
  const limit = Number(c.req.query('limit') ?? '25');
  const { results } = await c.env.DB.prepare(
    `SELECT id, source, source_handle, score, news_score, virality_score, score_reason,
            substr(COALESCE(title, text, ''), 1, 120) AS preview
       FROM events
      WHERE score IS NOT NULL
      ORDER BY score DESC, virality_score DESC
      LIMIT ?`,
  )
    .bind(limit)
    .all();
  return c.json({ items: results ?? [] });
});

app.post('/debug/reset-fails', async (c) => {
  const res = await c.env.DB.prepare(
    `UPDATE events SET score = NULL, score_reason = NULL, news_score = NULL, virality_score = NULL WHERE score_reason = 'parse-fail'`,
  ).run();
  return c.json({ ok: true, changes: res.meta.changes });
});

// Diagnostic: classify a single event from D1 and return raw LLM output
app.get('/debug/classify-one', async (c) => {
  const id = c.req.query('id');
  const row = id
    ? await c.env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first()
    : await c.env.DB.prepare(
        `SELECT * FROM events WHERE score IS NULL OR score_reason = 'parse-fail' LIMIT 1`,
      ).first();
  if (!row) return c.json({ error: 'no event found' }, 404);

  const { callOpenRouter } = await import('./lib/openrouter');
  const { CLASSIFIER_SYSTEM_PROMPT } = await import('./classifier');

  const userPayload = `source: ${row.source}\nhandle: @${row.source_handle ?? 'unknown'}\ntitle: ${row.title ?? ''}\ntext: ${row.text ?? ''}`;

  try {
    const content = await callOpenRouter({
      apiKey: c.env.OPENROUTER_API_KEY,
      model: 'deepseek/deepseek-chat',
      system: CLASSIFIER_SYSTEM_PROMPT,
      user: userPayload,
      maxTokens: 160,
      temperature: 0,
      responseFormat: 'json_object',
    });
    return c.json({ ok: true, event_id: row.id, raw: content });
  } catch (e) {
    return c.json({ ok: false, event_id: row.id, error: String(e) });
  }
});

app.post('/cron/draft', async (c) => {
  const stats = await runDrafter(c.env);
  return c.json({ ok: true, stats });
});

app.post('/cron/push', async (c) => {
  const stats = await pushDraftedEvents(c.env, PUSH_LIMIT);
  return c.json({ ok: true, stats });
});

// Public JSON feed — consumed by the Astro /news page client-side.
// CORS open: it's approved-only content, safe to read from any origin.
app.get('/whats-new', async (c) => {
  // Sort by source-creation time so a 2-day-old reddit post that just
  // got auto-approved doesn't jump to the top of the feed. The visible
  // time on the card also comes from created_at, so users see the real
  // age of the source post — pushed_at gets clobbered with the same
  // CURRENT_TIMESTAMP for every event in an auto-publish batch (~50
  // events in a few seconds), which made every card read "just now".
  const rows = await c.env.DB.prepare(
    `SELECT id, source, source_handle, url, text, title, score,
            news_score, virality_score, approved_variant, drafts_json,
            like_count, reply_count,
            created_at, pushed_at
       FROM events
      WHERE posted = 1 AND approved_variant IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 500`,
  ).all();

  return new Response(JSON.stringify({ items: rows.results ?? [] }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Cache-Control': 'public, max-age=60',
    },
  });
});

export default {
  fetch: app.fetch,

  // Cron triggers fire this. wrangler.toml defines the schedule.
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Three crons, routed by scheduledTime. wrangler.toml:
    //   */15 * * * *   → Twitter poll + classifier
    //   30 */3 * * *   → free sources (HN, Reddit, GH, Lobsters, PH)
    //   0    6 * * *   → daily drafter + push to Telegram
    const d = new Date(event.scheduledTime);
    const utcH = d.getUTCHours();
    const utcM = d.getUTCMinutes();

    const isDailyDrafter = utcH === 6 && utcM === 0;
    const isFreeSourcesTick = utcM === 30 && utcH % 3 === 0;

    if (isDailyDrafter) {
      console.log('[cron] daily drafter + push');
      ctx.waitUntil(
        (async () => {
          await runDrafter(env);
          await pushDraftedEvents(env, PUSH_LIMIT);
        })(),
      );
    } else if (isFreeSourcesTick) {
      console.log('[cron] free sources poll');
      ctx.waitUntil(runFreeSourcesPoller(env));
    } else {
      console.log('[cron] twitter poll + classify + auto-publish');
      ctx.waitUntil(
        (async () => {
          await runPoller(env);
          await runClassifier(env);
          await runAutoPublisher(env);
        })(),
      );
    }
  },
};
