/**
 * Telegram review flow for the news-aggregator pipeline.
 *
 * Two modes:
 *   push   — send queued drafts to the review chat (one message per event,
 *            with inline keyboard for V1/V2/V3/Skip/Reject).
 *   listen — long-poll getUpdates, react to callback presses, update DB,
 *            reply with the chosen variant text, strip the buttons.
 *
 * Run:
 *   npx tsx scripts/news-aggregator/telegram-bot.ts push [--limit N]
 *   npx tsx scripts/news-aggregator/telegram-bot.ts listen
 */

import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

loadEnv({ path: join(process.cwd(), '.env') });

import {
  approveEventVariant,
  getEventById,
  getPushableEvents,
  markEventPushed,
  rejectEvent,
  skipEvent,
  type PushableEvent,
} from './storage.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_REVIEW_CHAT_ID;

if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Add it to .env.');
  process.exit(1);
}
if (!CHAT_ID) {
  console.error('TELEGRAM_REVIEW_CHAT_ID is not set. Add it to .env.');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const OFFSET_FILE = join(
  process.cwd(),
  'scripts/news-aggregator/output/tg-offset.txt',
);

// ── CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE = args[0];
function argVal(key: string): string | undefined {
  const idx = args.findIndex((a) => a === `--${key}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
}
const LIMIT = argVal('limit') ? parseInt(argVal('limit')!, 10) : 100;

// ── HTTP helpers ────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function tg(
  method: string,
  payload: Record<string, unknown> = {},
  attempt = 1,
): Promise<any> {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 429) {
    const backoff = 30_000;
    console.warn(`  [tg 429] backing off ${backoff}ms`);
    await sleep(backoff);
    if (attempt < 3) return tg(method, payload, attempt + 1);
  }
  const data = await res.json().catch(() => ({ ok: false }));
  if (!res.ok || !data.ok) {
    throw new Error(
      `Telegram ${method} failed: HTTP ${res.status} — ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return data.result;
}

async function tgGet(method: string, qs: Record<string, string | number>): Promise<any> {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(qs).map(([k, v]) => [k, String(v)])),
  );
  const res = await fetch(`${API}/${method}?${q.toString()}`);
  if (res.status === 429) {
    await sleep(30_000);
  }
  const data = await res.json().catch(() => ({ ok: false }));
  if (!res.ok || !data.ok) {
    throw new Error(
      `Telegram ${method} failed: HTTP ${res.status} — ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return data.result;
}

// ── HTML helpers ────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface DraftArtifact {
  rank?: number;
  rank_reason?: string;
  quick_take?: string;
  drafts?: { straight?: string; hot_take?: string; thread?: string };
  drafted_at?: string;
}

function parseDrafts(json: string | null): DraftArtifact | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as DraftArtifact;
  } catch {
    return null;
  }
}

function buildMessage(ev: PushableEvent, d: DraftArtifact): string {
  const handle = ev.source_handle ? `@${ev.source_handle}` : ev.source;
  const reason = d.rank_reason ?? ev.score_reason ?? '';
  const header = `📣 Score ${ev.score ?? '?'} · ${escHtml(handle)}${reason ? ` · ${escHtml(reason)}` : ''}`;
  const qt = d.quick_take ? escHtml(d.quick_take) : '';
  const straight = escHtml(d.drafts?.straight ?? '—');
  const hot = escHtml(d.drafts?.hot_take ?? '—');
  const thread = escHtml(d.drafts?.thread ?? '—');
  const url = ev.url ? escHtml(ev.url) : '';

  return [
    `<b>${header}</b>`,
    qt ? `\n<i>${qt}</i>` : '',
    `\n━━ 1. STRAIGHT ━━\n${straight}`,
    `\n━━ 2. HOT TAKE ━━\n${hot}`,
    `\n━━ 3. THREAD ━━\n${thread}`,
    url ? `\n🔗 Original: ${url}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildKeyboard(eventId: string): { inline_keyboard: any[][] } {
  // callback_data is capped at 64 bytes. "action:id" keeps well under.
  return {
    inline_keyboard: [
      [
        { text: '📋 V1 Straight', callback_data: `v1:${eventId}` },
        { text: '🔥 V2 Hot', callback_data: `v2:${eventId}` },
        { text: '🧵 V3 Thread', callback_data: `v3:${eventId}` },
      ],
      [
        { text: '⏭ Skip', callback_data: `skip:${eventId}` },
        { text: '✖ Reject', callback_data: `reject:${eventId}` },
      ],
    ],
  };
}

// ── Push mode ───────────────────────────────────────────────────────────

async function runPush(): Promise<void> {
  const queue = getPushableEvents(LIMIT);
  if (queue.length === 0) {
    console.log('No drafts queued. Run drafter first.');
    return;
  }
  console.log(`[tg push] sending ${queue.length} draft(s) to chat ${CHAT_ID}`);

  let ok = 0;
  let fail = 0;
  for (const ev of queue) {
    const drafts = parseDrafts(ev.drafts_json);
    if (!drafts) {
      console.warn(`  [${ev.id}] drafts_json unparseable — skipping`);
      fail++;
      continue;
    }
    try {
      const text = buildMessage(ev, drafts);
      const msg = await tg('sendMessage', {
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buildKeyboard(ev.id),
      });
      markEventPushed(ev.id, msg.message_id);
      ok++;
      console.log(
        `  [${ev.id}] pushed → tg msg_id=${msg.message_id} score=${ev.score}`,
      );
    } catch (e: any) {
      fail++;
      console.error(`  [${ev.id}] push failed: ${e?.message ?? e}`);
    }
    await sleep(150); // gentle pacing
  }
  console.log(`[tg push] done. pushed=${ok} failed=${fail}`);
}

// ── Listener mode ───────────────────────────────────────────────────────

function readOffset(): number {
  try {
    if (!existsSync(OFFSET_FILE)) return 0;
    const raw = readFileSync(OFFSET_FILE, 'utf8').trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeOffset(n: number): void {
  const dir = dirname(OFFSET_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(OFFSET_FILE, String(n), 'utf8');
}

const LABELS: Record<string, string> = {
  v1: 'Straight',
  v2: 'Hot Take',
  v3: 'Thread',
};

const VARIANT_KEYS: Record<string, 'straight' | 'hot_take' | 'thread'> = {
  v1: 'straight',
  v2: 'hot_take',
  v3: 'thread',
};

async function handleCallback(cb: any): Promise<void> {
  const cbId = cb.id as string;
  const data = (cb.data as string) ?? '';
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const [action, eventId] = data.split(':', 2);

  if (!action || !eventId) {
    await tg('answerCallbackQuery', {
      callback_query_id: cbId,
      text: 'Bad payload',
    });
    return;
  }

  const ev = getEventById(eventId);
  if (!ev) {
    await tg('answerCallbackQuery', {
      callback_query_id: cbId,
      text: 'Event not found',
    });
    return;
  }

  let replyText = '';
  let toast = '';

  if (action === 'v1' || action === 'v2' || action === 'v3') {
    const variantKey = VARIANT_KEYS[action];
    const label = LABELS[action];
    approveEventVariant(eventId, variantKey);
    const drafts = parseDrafts(ev.drafts_json);
    const chosen = drafts?.drafts?.[variantKey] ?? '(draft missing)';
    replyText = `✅ Approved ${label}. Copy this to X:\n\n<code>${escHtml(chosen)}</code>`;
    toast = `Approved ${label}`;
  } else if (action === 'skip') {
    skipEvent(eventId);
    replyText = '⏭ Skipped';
    toast = 'Skipped';
  } else if (action === 'reject') {
    rejectEvent(eventId);
    replyText = '✖ Rejected';
    toast = 'Rejected';
  } else {
    toast = 'Unknown action';
  }

  // Ack the click
  await tg('answerCallbackQuery', {
    callback_query_id: cbId,
    text: toast,
  }).catch(() => {});

  // Strip buttons so no further decisions can be made
  if (chatId && messageId) {
    await tg('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    }).catch((e) => console.warn(`  editMessageReplyMarkup: ${e?.message ?? e}`));
  }

  // Send follow-up with the chosen text
  if (replyText && chatId) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: replyText,
      parse_mode: 'HTML',
      reply_to_message_id: messageId,
      disable_web_page_preview: true,
    }).catch((e) => console.warn(`  reply send: ${e?.message ?? e}`));
  }

  console.log(`  [cb] event=${eventId} action=${action}`);
}

let stopping = false;

async function runListen(): Promise<void> {
  console.log(`[tg listen] polling getUpdates (Ctrl+C to stop) chat=${CHAT_ID}`);
  let offset = readOffset();

  const handleSig = () => {
    if (stopping) return;
    stopping = true;
    console.log('\n[tg listen] shutting down...');
  };
  process.on('SIGINT', handleSig);
  process.on('SIGTERM', handleSig);

  while (!stopping) {
    try {
      const updates: any[] = await tgGet('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: JSON.stringify(['callback_query', 'message']),
      });

      for (const u of updates) {
        if (u.update_id >= offset) offset = u.update_id + 1;
        if (u.callback_query) {
          try {
            await handleCallback(u.callback_query);
          } catch (e: any) {
            console.error(`  [cb err] ${e?.message ?? e}`);
          }
        }
      }
      writeOffset(offset);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (stopping) break;
      console.warn(`  [poll err] ${msg}`);
      await sleep(3_000);
    }
  }
  console.log('[tg listen] stopped.');
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (MODE === 'push') {
    await runPush();
  } else if (MODE === 'listen') {
    await runListen();
  } else {
    console.error(
      'Usage:\n  telegram-bot.ts push [--limit N]\n  telegram-bot.ts listen',
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
