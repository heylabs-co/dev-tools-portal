/**
 * TwitterAPI.io client — just the endpoints we need for polling user timelines.
 *
 * Docs referenced: https://twitterapi.io/docs
 * Base URL: https://api.twitterapi.io
 * Auth: X-API-Key header
 *
 * Free tier is 1 req / 5s. Paid tier lifts this but we stay conservative.
 */

const BASE = 'https://api.twitterapi.io';
const KEY = process.env.TWITTERAPI_KEY;
if (!KEY) {
  throw new Error('TWITTERAPI_KEY is not set. Add it to .env.');
}

type FetchInit = { timeoutMs?: number };

async function apiGet<T>(path: string, init: FetchInit = {}): Promise<T> {
  const url = `${BASE}${path}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15_000);
  const res = await fetch(url, {
    headers: { 'X-API-Key': KEY!, Accept: 'application/json' },
    signal: ctrl.signal,
  });
  clearTimeout(t);
  if (res.status === 429) {
    throw new RateLimitError();
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TwitterAPI.io HTTP ${res.status} at ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export class RateLimitError extends Error {
  constructor() {
    super('TwitterAPI.io rate limit (429)');
    this.name = 'RateLimitError';
  }
}

// ── Types (subset of what the API returns) ──────────────────────────────

export type UserInfo = {
  id: string;
  name: string;
  userName: string;
  description?: string;
  followers?: number;
  following?: number;
  statusesCount?: number;
  profilePicture?: string;
  createdAt?: string;
};

export type TweetAuthor = {
  id: string;
  userName: string;
  name: string;
  profilePicture?: string;
};

export type Tweet = {
  id: string;
  conversationId?: string;
  createdAt: string;
  text: string;
  lang?: string;
  isReply: boolean;
  inReplyToId: string | null;
  retweeted_tweet?: Partial<Tweet> & { author?: TweetAuthor; url?: string };
  replyCount?: number;
  retweetCount?: number;
  likeCount?: number;
  quoteCount?: number;
  viewCount?: number;
  bookmarkCount?: number;
  author?: TweetAuthor;
  entities?: unknown;
};

type LastTweetsResponse = {
  status: string;
  code?: number;
  msg?: string;
  data: { tweets?: Tweet[] } | Tweet[];
  has_next_page?: boolean;
  next_cursor?: string;
};

// ── Public API ──────────────────────────────────────────────────────────

export async function getUserInfo(userName: string): Promise<UserInfo> {
  const res = await apiGet<{ status: string; data: UserInfo }>(
    `/twitter/user/info?userName=${encodeURIComponent(userName)}`,
  );
  return res.data;
}

export type LastTweetsResult = { tweets: Tweet[]; hasNext: boolean; cursor?: string };

export async function getLastTweets(
  userName: string,
  opts: { cursor?: string } = {},
): Promise<LastTweetsResult> {
  const q = new URLSearchParams({ userName });
  if (opts.cursor) q.set('cursor', opts.cursor);
  const res = await apiGet<LastTweetsResponse>(`/twitter/user/last_tweets?${q}`);
  const raw = res.data;
  const tweets = Array.isArray(raw) ? raw : (raw.tweets ?? []);
  return {
    tweets,
    hasNext: !!res.has_next_page,
    cursor: res.next_cursor,
  };
}

export type AdvancedSearchResult = {
  tweets: Tweet[];
  has_next_page: boolean;
  next_cursor?: string;
};

type AdvancedSearchResponse = {
  status?: string;
  code?: number;
  msg?: string;
  tweets?: Tweet[];
  data?: { tweets?: Tweet[] } | Tweet[];
  has_next_page?: boolean;
  next_cursor?: string;
};

/**
 * Advanced search endpoint — batched queries via `from:` OR-lists + since_time.
 * Docs say DO NOT paginate (we rely on since_time windowing instead).
 */
export async function advancedSearch(query: string): Promise<AdvancedSearchResult> {
  const q = new URLSearchParams({ query, queryType: 'Latest', cursor: '' });
  const res = await apiGet<AdvancedSearchResponse>(`/twitter/tweet/advanced_search?${q}`);
  const raw = res.tweets ?? res.data;
  const tweets = Array.isArray(raw) ? raw : (raw?.tweets ?? []);
  return {
    tweets,
    has_next_page: !!res.has_next_page,
    next_cursor: res.next_cursor,
  };
}

/** Keep only fresh, non-reply, non-retweet posts newer than sinceMs. */
export function filterOriginals(tweets: Tweet[], sinceMs?: number): Tweet[] {
  return tweets.filter((t) => {
    if (t.isReply) return false;
    if (t.retweeted_tweet && Object.keys(t.retweeted_tweet).length > 0) return false;
    if (sinceMs) {
      const ms = Date.parse(t.createdAt);
      if (!Number.isNaN(ms) && ms < sinceMs) return false;
    }
    return true;
  });
}
