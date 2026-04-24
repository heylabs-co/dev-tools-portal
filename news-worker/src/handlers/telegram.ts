/**
 * Telegram review flow — webhook-driven.
 *
 * `pushDraftedEvents` sends the day's drafts into the review chat.
 * `handleTelegramWebhook` is invoked by POST /telegram with the raw
 * Update payload and routes:
 *   - callback_query (button press) → DB update + ack + strip buttons + reply
 *   - message (/start, /status)     → simple info reply
 *
 * The webhook handler never throws: Telegram retries on non-2xx, so we
 * swallow errors and log them so the router can return 200 immediately.
 */

import type { Env } from '../env';
import {
  approveEventVariant,
  getEventById,
  getPushableEvents,
  markEventPushed,
  rejectEvent,
  skipEvent,
  type EventRow,
} from '../db/client';
import {
  TelegramClient,
  type InlineKeyboardMarkup,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramUpdate,
} from '../lib/telegram';

// ── Draft JSON shape (written by drafter) ───────────────────────────────

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

// ── HTML helpers ────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMessage(ev: EventRow, d: DraftArtifact): string {
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

function buildKeyboard(eventId: string): InlineKeyboardMarkup {
  // callback_data is capped at 64 bytes. "action:id" stays well under.
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

// ── Push ────────────────────────────────────────────────────────────────

export async function pushDraftedEvents(
  env: Env,
  limit: number,
): Promise<{ pushed: number; failed: number }> {
  const tg = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const chatId = env.TELEGRAM_REVIEW_CHAT_ID;

  const queue = await getPushableEvents(env.DB, limit);
  if (queue.length === 0) {
    return { pushed: 0, failed: 0 };
  }

  let pushed = 0;
  let failed = 0;

  for (const ev of queue) {
    const drafts = parseDrafts(ev.drafts_json);
    if (!drafts) {
      console.warn(`[tg push] ${ev.id} drafts_json unparseable — skipping`);
      failed++;
      continue;
    }
    try {
      const text = buildMessage(ev, drafts);
      const msg = await tg.sendMessage(chatId, text, {
        parseMode: 'HTML',
        disableWebPagePreview: true,
        replyMarkup: buildKeyboard(ev.id),
      });
      await markEventPushed(env.DB, ev.id, msg.message_id);
      pushed++;
    } catch (e) {
      failed++;
      console.error(
        `[tg push] ${ev.id} send failed:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { pushed, failed };
}

// ── Webhook routing ─────────────────────────────────────────────────────

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

export async function handleTelegramWebhook(
  env: Env,
  update: TelegramUpdate,
): Promise<void> {
  const tg = new TelegramClient(env.TELEGRAM_BOT_TOKEN);

  try {
    if (update.callback_query) {
      await handleCallback(env, tg, update.callback_query);
      return;
    }
    if (update.message) {
      await handleMessage(env, tg, update.message);
      return;
    }
    // Unknown update type — ignore silently (still return 200 to TG).
  } catch (e) {
    // Never throw out of the webhook — Telegram would retry.
    console.error(
      '[tg webhook] handler error:',
      e instanceof Error ? e.message : e,
    );
  }
}

async function handleCallback(
  env: Env,
  tg: TelegramClient,
  cb: TelegramCallbackQuery,
): Promise<void> {
  const cbId = cb.id;
  const data = cb.data ?? '';
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  const [action, eventId] = data.split(':', 2);

  if (!action || !eventId) {
    await tg.answerCallbackQuery(cbId, 'Bad payload').catch((e) => {
      console.warn('[tg cb] ack failed:', e instanceof Error ? e.message : e);
    });
    return;
  }

  const ev = await getEventById(env.DB, eventId);
  if (!ev) {
    await tg.answerCallbackQuery(cbId, 'Event not found').catch((e) => {
      console.warn('[tg cb] ack failed:', e instanceof Error ? e.message : e);
    });
    return;
  }

  let replyText = '';
  let toast = '';

  if (action === 'v1' || action === 'v2' || action === 'v3') {
    const variantKey = VARIANT_KEYS[action];
    const label = LABELS[action];
    await approveEventVariant(env.DB, eventId, variantKey);
    const drafts = parseDrafts(ev.drafts_json);
    const chosen = drafts?.drafts?.[variantKey] ?? '(draft missing)';
    replyText = `✅ Approved ${label}. Copy this to X:\n\n<code>${escHtml(chosen)}</code>`;
    toast = `✅ Approved ${label}`;
  } else if (action === 'skip') {
    await skipEvent(env.DB, eventId);
    replyText = '⏭ Skipped';
    toast = '⏭ Skipped';
  } else if (action === 'reject') {
    await rejectEvent(env.DB, eventId);
    replyText = '✖ Rejected';
    toast = '✖ Rejected';
  } else {
    toast = 'Unknown action';
  }

  // Ack the click so the spinner stops (must happen within 15s).
  await tg.answerCallbackQuery(cbId, toast).catch((e) => {
    console.warn('[tg cb] ack failed:', e instanceof Error ? e.message : e);
  });

  // Strip buttons so no further decisions can be made on this message.
  if (chatId !== undefined && messageId !== undefined) {
    await tg.editMessageReplyMarkup(chatId, messageId, null).catch((e) => {
      console.warn(
        '[tg cb] edit markup failed:',
        e instanceof Error ? e.message : e,
      );
    });
  }

  // Send follow-up with the chosen variant (or status).
  if (replyText && chatId !== undefined) {
    await tg
      .sendMessage(chatId, replyText, {
        parseMode: 'HTML',
        replyToMessageId: messageId,
        disableWebPagePreview: true,
      })
      .catch((e) => {
        console.warn(
          '[tg cb] reply failed:',
          e instanceof Error ? e.message : e,
        );
      });
  }
}

async function handleMessage(
  env: Env,
  tg: TelegramClient,
  msg: TelegramMessage,
): Promise<void> {
  const text = (msg.text ?? '').trim();
  const chatId = msg.chat.id;

  if (text.startsWith('/start')) {
    await tg
      .sendMessage(
        chatId,
        'tool.news review bot. Drafts will appear here daily at 06:00 UTC.',
      )
      .catch((e) => {
        console.warn(
          '[tg msg] /start reply failed:',
          e instanceof Error ? e.message : e,
        );
      });
    return;
  }

  if (text === '/status') {
    try {
      const pending = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM events WHERE drafts_json IS NOT NULL AND posted = 0`,
      ).first<{ n: number }>();
      const approved = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM events WHERE posted = 1 AND approved_variant IS NOT NULL`,
      ).first<{ n: number }>();
      const body = [
        `📊 Status`,
        `Pending review: ${pending?.n ?? 0}`,
        `Approved (all-time): ${approved?.n ?? 0}`,
      ].join('\n');
      await tg.sendMessage(chatId, body);
    } catch (e) {
      console.warn(
        '[tg msg] /status failed:',
        e instanceof Error ? e.message : e,
      );
    }
    return;
  }

  // Any other text — ignore (no /unknown spam).
}
