/**
 * TwitterAPI.io client — Workers-native (uses global fetch, no Node APIs).
 *
 * Docs: https://twitterapi.io/docs
 * Base URL: https://api.twitterapi.io
 * Auth: X-API-Key header
 *
 * Only the advanced search endpoint is exposed — that's all the batched
 * poller needs. Caller passes the fully built query string.
 */

const BASE = 'https://api.twitterapi.io';
const DEFAULT_TIMEOUT_MS = 15_000;

export class RateLimitError extends Error {
  constructor() {
    super('TwitterAPI.io rate limit (429)');
    this.name = 'RateLimitError';
  }
}

// ── Types ───────────────────────────────────────────────────────────────

export interface TweetAuthor {
  id: string;
  userName: string;
  name: string;
  profilePicture?: string;
}

export interface Tweet {
  id: string;
  createdAt: string;
  text: string;
  lang?: string;
  isReply: boolean;
  inReplyToId?: string | null;
  retweeted_tweet?: Partial<Tweet> & { url?: string };
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
  viewCount?: number;
  author?: TweetAuthor;
}

export interface AdvancedSearchResult {
  tweets: Tweet[];
  has_next_page: boolean;
  next_cursor?: string;
}

interface AdvancedSearchResponse {
  status?: string;
  code?: number;
  msg?: string;
  tweets?: Tweet[];
  data?: { tweets?: Tweet[] } | Tweet[];
  has_next_page?: boolean;
  next_cursor?: string;
}

// ── Client ──────────────────────────────────────────────────────────────

export class TwitterApiIoClient {
  constructor(private apiKey: string) {
    if (!apiKey) {
      throw new Error('TwitterApiIoClient: apiKey is required');
    }
  }

  private async apiGet<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: { 'X-API-Key': this.apiKey, Accept: 'application/json' },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) {
      throw new RateLimitError();
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `TwitterAPI.io HTTP ${res.status} at ${path}: ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }

  /**
   * Advanced search — caller supplies a query string such as
   *   `(from:sama OR from:dhh) since_time:1713700000`.
   * We do NOT paginate (since_time windows keep results bounded).
   */
  async advancedSearch(query: string): Promise<AdvancedSearchResult> {
    const qs = new URLSearchParams({ query, queryType: 'Latest', cursor: '' });
    const res = await this.apiGet<AdvancedSearchResponse>(
      `/twitter/tweet/advanced_search?${qs}`,
    );
    const raw = res.tweets ?? res.data;
    const tweets = Array.isArray(raw) ? raw : (raw?.tweets ?? []);
    return {
      tweets,
      has_next_page: !!res.has_next_page,
      next_cursor: res.next_cursor,
    };
  }
}

/** Drop replies and retweets; keep originals only. */
export function filterOriginals(tweets: Tweet[]): Tweet[] {
  return tweets.filter((t) => {
    if (t.isReply) return false;
    if (t.retweeted_tweet && Object.keys(t.retweeted_tweet).length > 0) {
      return false;
    }
    return true;
  });
}
