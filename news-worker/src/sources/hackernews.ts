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

/**
 * Strip HTML tags + decode common entities. HN's Algolia `story_text` keeps
 * the original Hacker News HTML (`<a href="...">`, `&#x2F;` for URL slashes,
 * `&#x27;` for apostrophes, etc). If we pass that through our rendering
 * pipeline (which HTML-escapes defensively), it shows up as literal
 * `&#x2F;` / `<a href=…>` in the card body. So we normalize to plain text
 * at the source.
 */
function htmlToText(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input);
  // Preserve line breaks where HN uses them.
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n');
  // Drop every remaining tag.
  s = s.replace(/<[^>]+>/g, '');
  // Decode numeric + hex entities + the handful of named ones HN emits.
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  s = s.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return s.trim() || null;
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
    text: htmlToText(h.story_text),
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
