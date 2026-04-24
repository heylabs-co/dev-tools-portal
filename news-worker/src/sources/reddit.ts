/**
 * Reddit source connector — Workers-native (global fetch, no deps).
 *
 * Polls a hard-coded list of dev/AI subreddits' top-of-day JSON endpoints
 * and normalizes posts into EventLike rows for the pipeline. No auth
 * required; Reddit enforces User-Agent and some rate limits per IP.
 *
 * Exported: fetchReddit(): Promise<EventLike[]>
 */

const USER_AGENT = 'tool.news-bot/1.0 (+https://tool.news)';
const FETCH_TIMEOUT_MS = 15_000;
const TEXT_MAX_CHARS = 2000;
const MIN_UPS = 50;

const SUBREDDITS: readonly string[] = [
  'programming',
  'webdev',
  'MachineLearning',
  'LocalLLaMA',
  'LLMDevs',
  'node',
  'typescript',
  'rust',
  'golang',
  'javascript',
  'vscode',
  'devops',
  'SideProject',
  'selfhosted',
  'artificial',
  'ClaudeAI',
  'OpenAI',
  'LangChain',
  'singularity',
  'aiagents',
];

// ── Types ───────────────────────────────────────────────────────────────

export interface EventLike {
  id: string;
  source: string;
  source_handle?: string | null;
  url?: string | null;
  created_at: string;
  title?: string | null;
  text?: string | null;
  lang?: string | null;
  like_count?: number | null;
  reply_count?: number | null;
  retweet_count?: number | null;
  view_count?: number | null;
  raw_json?: unknown;
}

interface RedditChildData {
  id: string;
  title: string;
  selftext?: string;
  permalink: string;
  ups: number;
  num_comments: number;
  created_utc: number;
  stickied?: boolean;
  over_18?: boolean;
}

interface RedditChild {
  kind: string;
  data: RedditChildData;
}

interface RedditListing {
  kind?: string;
  data?: {
    children?: RedditChild[];
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

async function fetchSub(sub: string): Promise<EventLike[]> {
  const url = `https://www.reddit.com/r/${sub}/top.json?t=day&limit=25`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
  } catch (err) {
    console.warn(`reddit: network error r/${sub}:`, (err as Error).message);
    return [];
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    console.warn(`reddit: 429 rate-limited r/${sub}, skipping`);
    return [];
  }
  if (!res.ok) {
    console.warn(`reddit: HTTP ${res.status} r/${sub}`);
    return [];
  }

  let json: RedditListing;
  try {
    json = (await res.json()) as RedditListing;
  } catch (err) {
    console.warn(`reddit: parse error r/${sub}:`, (err as Error).message);
    return [];
  }

  const children = json.data?.children ?? [];
  const out: EventLike[] = [];

  for (const child of children) {
    const d = child?.data;
    if (!d || typeof d.id !== 'string') continue;
    if (d.stickied === true) continue;
    if (d.over_18 === true) continue;
    if (typeof d.ups !== 'number' || d.ups < MIN_UPS) continue;

    const selftext = typeof d.selftext === 'string' ? d.selftext : '';
    const text = selftext.length > 0 ? truncate(selftext, TEXT_MAX_CHARS) : null;

    let createdAt: string;
    try {
      createdAt = new Date(d.created_utc * 1000).toISOString();
    } catch {
      continue;
    }

    out.push({
      id: `reddit_${d.id}`,
      source: 'reddit',
      source_handle: `reddit/r/${sub.toLowerCase()}`,
      url: `https://www.reddit.com${d.permalink}`,
      created_at: createdAt,
      title: d.title,
      text,
      lang: 'en',
      like_count: d.ups,
      reply_count: typeof d.num_comments === 'number' ? d.num_comments : null,
      retweet_count: null,
      view_count: null,
      raw_json: d,
    });
  }

  return out;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function fetchReddit(): Promise<EventLike[]> {
  try {
    const settled = await Promise.allSettled(SUBREDDITS.map((s) => fetchSub(s)));
    const all: EventLike[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        all.push(...r.value);
      } else {
        console.warn('reddit: sub fetch rejected:', String(r.reason));
      }
    }
    all.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    return all;
  } catch (err) {
    console.warn('reddit: unexpected error:', (err as Error).message);
    return [];
  }
}
