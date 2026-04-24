/**
 * GitHub Trending source connector — Workers-native (global fetch, no deps).
 *
 * There is no official trending API, so we hit the public search endpoint
 * for repos created in the last 7 days with > 50 stars, ordered by stars.
 * Unauthenticated: 60 req/h per IP is plenty for a single cron tick.
 *
 * Exported: fetchGithubTrending(): Promise<EventLike[]>
 */

const USER_AGENT = 'tool.news-bot/1.0';
const FETCH_TIMEOUT_MS = 15_000;
const DESC_MAX_CHARS = 1500;
const LOOKBACK_DAYS = 7;
const MIN_STARS = 50;
const PER_PAGE = 50;

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

interface GhOwner {
  login: string;
}

interface GhRepoItem {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  owner: GhOwner;
  stargazers_count: number;
  open_issues_count?: number | null;
  created_at: string;
}

interface GhSearchResponse {
  total_count?: number;
  incomplete_results?: boolean;
  items?: GhRepoItem[];
  message?: string;
  documentation_url?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

function daysAgoYmd(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function fetchGithubTrending(): Promise<EventLike[]> {
  const since = daysAgoYmd(LOOKBACK_DAYS);
  // NB: the "+" in the q= value must remain unencoded to act as a space
  // separator inside GitHub's qualifier syntax. Build the URL manually so
  // URLSearchParams doesn't re-encode it.
  const q = `created:>${since}+stars:>${MIN_STARS}`;
  const url =
    `https://api.github.com/search/repositories` +
    `?q=${q}&sort=stars&order=desc&per_page=${PER_PAGE}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
      },
      signal: ctrl.signal,
    });
  } catch (err) {
    console.warn('github: network error:', (err as Error).message);
    return [];
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 403 || res.status === 429) {
    console.warn(`github: rate limited (HTTP ${res.status})`);
    return [];
  }
  if (!res.ok) {
    console.warn(`github: HTTP ${res.status}`);
    return [];
  }

  let json: GhSearchResponse;
  try {
    json = (await res.json()) as GhSearchResponse;
  } catch (err) {
    console.warn('github: parse error:', (err as Error).message);
    return [];
  }

  if (json.message && /rate limit exceeded/i.test(json.message)) {
    console.warn('github: API rate limit exceeded');
    return [];
  }

  const items = Array.isArray(json.items) ? json.items : [];
  const out: EventLike[] = [];

  for (const item of items) {
    if (!item || typeof item.id !== 'number') continue;
    if (!item.owner || typeof item.owner.login !== 'string') continue;

    const desc = typeof item.description === 'string' ? item.description : null;
    const text = desc && desc.length > 0 ? truncate(desc, DESC_MAX_CHARS) : null;

    out.push({
      id: `gh_${item.id}`,
      source: 'github',
      source_handle: `github/${item.owner.login}`,
      url: item.html_url,
      created_at: item.created_at,
      title: item.full_name,
      text,
      lang: 'en',
      like_count: typeof item.stargazers_count === 'number' ? item.stargazers_count : null,
      reply_count:
        typeof item.open_issues_count === 'number' ? item.open_issues_count : null,
      retweet_count: null,
      view_count: null,
      raw_json: item,
    });
  }

  out.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return out;
}
