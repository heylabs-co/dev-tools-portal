/**
 * Raw HTTP Telegram Bot API client.
 *
 * Worker-safe: uses `fetch` only, no Node APIs. All methods throw on
 * non-OK HTTP or non-OK Telegram response bodies.
 */

// ── Telegram Update payload types (subset we care about) ────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; username?: string };
  text?: string;
  date: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message?: TelegramMessage;
  data?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

// ── Client ──────────────────────────────────────────────────────────────

export interface SendMessageOpts {
  parseMode?: 'HTML' | 'MarkdownV2';
  replyMarkup?: InlineKeyboardMarkup;
  replyToMessageId?: number;
  disableWebPagePreview?: boolean;
}

export interface WebhookInfo {
  url: string;
  pending_update_count: number;
}

export class TelegramClient {
  constructor(private token: string) {}

  private get base(): string {
    return `https://api.telegram.org/bot${this.token}`;
  }

  private async call<T>(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data: { ok?: boolean; result?: T; description?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      // fall through — handled below
    }
    if (!res.ok || !data.ok) {
      const desc = data.description ?? `HTTP ${res.status}`;
      throw new Error(`Telegram ${method} failed: ${desc}`);
    }
    return data.result as T;
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    opts: SendMessageOpts = {},
  ): Promise<{ message_id: number }> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (opts.parseMode) payload.parse_mode = opts.parseMode;
    if (opts.replyMarkup) payload.reply_markup = opts.replyMarkup;
    if (opts.replyToMessageId !== undefined) {
      payload.reply_to_message_id = opts.replyToMessageId;
    }
    if (opts.disableWebPagePreview !== undefined) {
      payload.disable_web_page_preview = opts.disableWebPagePreview;
    }
    return this.call<{ message_id: number }>('sendMessage', payload);
  }

  async editMessageReplyMarkup(
    chatId: string | number,
    messageId: number,
    markup: InlineKeyboardMarkup | null,
  ): Promise<void> {
    await this.call('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      // Telegram accepts absent reply_markup to clear buttons; sending an
      // empty keyboard works too and is explicit.
      reply_markup: markup ?? { inline_keyboard: [] },
    });
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      callback_query_id: callbackQueryId,
    };
    if (text !== undefined) payload.text = text;
    await this.call('answerCallbackQuery', payload);
  }

  async setWebhook(url: string): Promise<void> {
    await this.call('setWebhook', { url });
  }

  async deleteWebhook(): Promise<void> {
    await this.call('deleteWebhook', {});
  }

  async getWebhookInfo(): Promise<WebhookInfo> {
    return this.call<WebhookInfo>('getWebhookInfo', {});
  }
}
