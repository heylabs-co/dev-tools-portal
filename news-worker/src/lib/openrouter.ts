/**
 * Minimal OpenRouter chat-completions client for the Cloudflare Worker runtime.
 *
 * No Node deps — `fetch` only. Retries once on HTTP 429 with a 5s backoff.
 * Non-2xx responses throw; 429 after retry throws RateLimitError.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export class RateLimitError extends Error {
  constructor(message = 'OpenRouter rate limit (429)') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface CallOpenRouterParams {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json_object' | 'text';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Call an OpenRouter chat model. Returns the raw assistant message content
 * (which may be JSON text when responseFormat === 'json_object').
 */
export async function callOpenRouter(params: CallOpenRouterParams): Promise<string> {
  const {
    apiKey,
    model,
    system,
    user,
    maxTokens,
    temperature,
    responseFormat,
  } = params;

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (typeof maxTokens === 'number') body.max_tokens = maxTokens;
  if (typeof temperature === 'number') body.temperature = temperature;
  if (responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  const doFetch = async (): Promise<Response> =>
    fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  // Retry 429 up to 3 times with exponential backoff (2s, 4s, 8s + jitter).
  let res = await doFetch();
  for (let attempt = 1; attempt <= 3 && res.status === 429; attempt++) {
    const waitMs = Math.round(1_000 * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4));
    await sleep(waitMs);
    res = await doFetch();
  }
  if (res.status === 429) {
    throw new RateLimitError();
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `OpenRouter HTTP ${res.status}: ${txt.slice(0, 300)}`,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`OpenRouter returned non-JSON response: ${String(e)}`);
  }

  // OpenRouter sometimes returns HTTP 200 with an error body when a provider
  // throttles (especially DeepSeek). Treat these as rate limits so the caller
  // can skip the row and retry on the next cron.
  const errObj = (data as { error?: { message?: unknown; code?: unknown } })?.error;
  if (errObj) {
    const msg = typeof errObj.message === 'string' ? errObj.message : JSON.stringify(errObj);
    if (/rate|quota|too many|429|throttl/i.test(msg)) {
      throw new RateLimitError(`OpenRouter provider rate-limited: ${msg}`);
    }
    throw new Error(`OpenRouter error body: ${msg.slice(0, 200)}`);
  }

  const content: unknown =
    (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message
      ?.content;

  // Empty content on a "successful" 200 almost always means the provider hit
  // a limit and returned an empty completion. Treat as rate-limited too.
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new RateLimitError('OpenRouter returned empty content');
  }

  return content;
}
