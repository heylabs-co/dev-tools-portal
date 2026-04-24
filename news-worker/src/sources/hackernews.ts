/**
 * Hacker News source connector via the Algolia search API.
 *
 * We fetch the discussion-page URL (not the outlinked story) because the
 * classifier/drafter want the HN comment context alongside the title.
 *
 * Two separate queries:
 *   - top stories with points>=50
 *   - Show HN posts with points>=30 (lower bar; they're inherently launches)
 */

const USER_AGENT = 'tool.news-bot/1.0 (+https://tool.news)';
const DEFAULT_TIMEOUT_MS = 15_000;
const BASE = 'https://hn.algolia.com/api/v1/search_by_date';

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

interface AlgoliaHit {
  objectID: string;
  author?: string | null;
  title?: string | null;
  story_text?: string | null;
  points?: number | null;
  num_comments?: number | null;
  created_at_i: number;
}

interface AlgoliaResponse {
  hits?: AlgoliaHit[];
}

async function fetchJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} at ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function hitToEvent(h: AlgoliaHit): EventLike | null {
  if (!h?.objectID || typeof h.created_at_i !== 'number') return null;
  return {
    id: `hn_${h.objectID}`,
    source: 'hackernews',
    source_handle: h.author ?? null,
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    created_at: new Date(h.created_at_i * 1000).toISOString(),
    title: h.title ?? null,
    text: h.story_text ?? null,
    lang: 'en',
    like_count: h.points ?? null,
    reply_count: h.num_comments ?? null,
    retweet_count: null,
    view_count: null,
    raw_json: h,
  };
}

function buildUrl(tag: 'story' | 'show_hn', minPoints: number, since: number): string {
  const nf = `points%3E%3D${minPoints},created_at_i%3E${since}`;
  return `${BASE}?tags=${tag}&numericFilters=${nf}&hitsPerPage=100`;
}

export async function fetchHackerNews(windowHours: number): Promise<EventLike[]> {
  const since = Math.floor((Date.now() - windowHours * 3600_000) / 1000);
  const safe = (url: string, label: string) =>
    fetchJson<AlgoliaResponse>(url).catch((e) => {
      console.warn(`[hackernews] ${label} fetch failed`, e);
      return { hits: [] } as AlgoliaResponse;
    });

  let responses: AlgoliaResponse[];
  try {
    responses = await Promise.all([
      safe(buildUrl('story', 50, since), 'story'),
      safe(buildUrl('show_hn', 30, since), 'show_hn'),
    ]);
  } catch (e) {
    console.warn('[hackernews] fetch error', e);
    return [];
  }

  const seen = new Set<string>();
  const results: EventLike[] = [];
  for (const resp of responses) {
    for (const h of resp.hits ?? []) {
      const ev = hitToEvent(h);
      if (!ev || seen.has(ev.id)) continue;
      seen.add(ev.id);
      results.push(ev);
    }
  }
  results.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return results;
}
