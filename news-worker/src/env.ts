/**
 * Bindings exposed by wrangler.toml + secrets set via `wrangler secret put`.
 * Every handler, cron, and utility uses this type — single source of truth.
 */

export interface Env {
  // D1 database (events, handles, poll_runs)
  DB: D1Database;

  // KV namespace (tg-offset, small caches)
  KV: KVNamespace;

  // Secrets (wrangler secret put NAME)
  TWITTERAPI_KEY: string;
  OPENROUTER_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_REVIEW_CHAT_ID: string; // may be "123" or "-1001234" (negative for channels)

  // Optional. Public channel where approved variants are auto-posted.
  // Accepts "@toolnewshq" (public) or "-1001234567890" (numeric).
  TELEGRAM_CHANNEL_ID?: string;
}
