/**
 * Lobsters source connector — pulls the front-page "hottest" JSON feed.
 *
 * Filters:
 *   - score >= 20
 *   - created within last windowHours
 *   - drops stories whose ONLY tag is `ask` or `meta`
 */

const USER_AGENT = 'tool.news-bot/1.0 (+https://tool.news)';
const DEFAULT_TIMEOUT_MS = 15_000;
const HOTTEST_URL = 'https://lobste.rs/hottest.json';
const MIN_SCORE = 20;

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

interface LobstersStory {
  short_id: string;
  title: string;
  created_at: string;
  score: number;
  comment_count: number;
  description?: string | null;
  comments_url: string;
  tags?: string[];
  submitter_user?: { username?: string | null } | string | null;
}

const HTML_ENTS: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => HTML_ENTS[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function getUsername(s: LobstersStory): string | null {
  const u = s.submitter_user;
  if (!u) return null;
  return typeof u === 'string' ? (u || null) : (u.username ?? null);
}

function storyToEvent(s: LobstersStory): EventLike | null {
  if (!s?.short_id || !s.created_at) return null;
  const username = getUsername(s);
  const desc = s.description ? stripHtml(s.description) : null;
  return {
    id: `lob_${s.short_id}`,
    source: 'lobsters',
    source_handle: username ? `lobsters/${username}` : null,
    url: s.comments_url,
    created_at: s.created_at,
    title: s.title ?? null,
    text: desc && desc.length > 0 ? desc : null,
    lang: 'en',
    like_count: s.score ?? null,
    reply_count: s.comment_count ?? null,
    retweet_count: null,
    view_count: null,
    raw_json: s,
  };
}

export async function fetchLobsters(windowHours: number): Promise<EventLike[]> {
  const cutoffMs = Date.now() - windowHours * 3600_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  let stories: LobstersStory[];
  try {
    const res = await fetch(HOTTEST_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[lobsters] HTTP ${res.status}`);
      return [];
    }
    const parsed = (await res.json()) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn('[lobsters] unexpected response shape');
      return [];
    }
    stories = parsed as LobstersStory[];
  } catch (e) {
    console.warn('[lobsters] fetch error', e);
    return [];
  } finally {
    clearTimeout(timer);
  }

  const results: EventLike[] = [];
  for (const s of stories) {
    if (!s || typeof s.score !== 'number' || s.score < MIN_SCORE) continue;
    const ts = Date.parse(s.created_at);
    if (Number.isNaN(ts) || ts < cutoffMs) continue;
    const tags = Array.isArray(s.tags) ? s.tags : [];
    if (tags.length === 1 && (tags[0] === 'ask' || tags[0] === 'meta')) continue;
    const ev = storyToEvent(s);
    if (ev) results.push(ev);
  }
  results.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return results;
}
