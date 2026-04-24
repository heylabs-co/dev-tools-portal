/**
 * Product Hunt Atom source connector.
 *
 * Feed: https://www.producthunt.com/feed?category=developer-tools (Atom 1.0, NOT RSS)
 * Returns normalized EventLike rows shaped for insertEvent() in db/client.ts.
 * Never throws — network/parse failures are logged and swallowed.
 *
 * Feed shape (what the upstream actually serves, confirmed 2026-04-23):
 *   <feed xmlns="http://www.w3.org/2005/Atom">
 *     <entry>
 *       <id>tag:www.producthunt.com,2005:Post/1130580</id>
 *       <published>2026-04-23T03:43:25-07:00</published>
 *       <link rel="alternate" type="text/html" href="https://www.producthunt.com/products/toddle"/>
 *       <title>Nordcraft 2.0</title>
 *       <content type="html">&lt;p&gt;...tagline...&lt;/p&gt;&lt;p&gt;&lt;a href="...discussion..."&gt;Discussion&lt;/a&gt; | &lt;a href="...link..."&gt;Link&lt;/a&gt;&lt;/p&gt;</content>
 *       <author><name>Salma Alam-Naylor</name></author>
 *     </entry>
 *     ...
 *   </feed>
 *
 * The previous implementation parsed RSS (<item>, <pubDate>, <description>) and
 * therefore returned an empty list against the current Atom feed.
 */

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

const FEED_URL = 'https://www.producthunt.com/feed?category=developer-tools';
const USER_AGENT = 'tool.news-bot/1.0 (+https://tool.news)';
const TIMEOUT_MS = 15_000;
const TEXT_LIMIT = 1500;

function unwrapCData(s: string): string {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : s;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(s: string): string {
  // Decode entities first (Atom content is HTML-escaped), then strip tags,
  // then collapse whitespace.
  return decodeEntities(decodeEntities(s).replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTag(block: string, tag: string): string | null {
  // Non-greedy match of <tag>...</tag>; ignore tag attributes if any.
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? unwrapCData(m[1]).trim() : null;
}

function pickAltLink(block: string): string | null {
  // Atom: prefer <link rel="alternate" ... href="..."/>; fall back to first <link href="..."/>.
  const altRe =
    /<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i;
  const alt = block.match(altRe);
  if (alt) return alt[1];
  const any = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  return any ? any[1] : null;
}

function extractPostIdFromAtomId(atomId: string): string | null {
  // tag:www.producthunt.com,2005:Post/1130580 → 1130580
  const m = atomId.match(/Post\/(\d+)/i);
  return m ? m[1] : null;
}

function deriveSlug(link: string): string {
  try {
    const u = new URL(link);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? link;
  } catch {
    return link;
  }
}

function parseEntry(block: string): EventLike | null {
  const link = pickAltLink(block);
  const title = pickTag(block, 'title');
  const published = pickTag(block, 'published') ?? pickTag(block, 'updated');
  const contentRaw = pickTag(block, 'content') ?? pickTag(block, 'summary');
  const atomId = pickTag(block, 'id');
  const author = pickTag(block, 'name');

  if (!link && !atomId) return null;

  // Prefer the Post numeric ID from <id> (stable across URL renames); fall
  // back to URL slug.
  const postId = atomId ? extractPostIdFromAtomId(atomId) : null;
  const slug = postId ?? (link ? deriveSlug(link) : atomId ?? 'unknown');
  const id = `ph_${slug}`;

  let created_at = new Date().toISOString();
  if (published) {
    const d = new Date(published);
    if (!Number.isNaN(d.getTime())) created_at = d.toISOString();
  }

  const text = contentRaw ? stripHtml(contentRaw).slice(0, TEXT_LIMIT) : null;

  return {
    id,
    source: 'producthunt',
    source_handle: 'producthunt/developer-tools',
    url: link ?? null,
    created_at,
    title: title ? decodeEntities(title) : null,
    text,
    lang: 'en',
    like_count: null,
    reply_count: null,
    retweet_count: null,
    view_count: null,
    raw_json: { atomId, postId, published, link, author },
  };
}

export async function fetchProductHunt(): Promise<EventLike[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(FEED_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      console.warn(`[producthunt] HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const items: EventLike[] = [];
    // Atom feeds use <entry>...</entry>; keep a legacy <item> fallback in case
    // Product Hunt ever reverts or a mirror serves RSS.
    const entryRe = /<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml)) !== null) {
      try {
        const ev = parseEntry(m[2]);
        if (ev && !seen.has(ev.id)) {
          seen.add(ev.id);
          items.push(ev);
        }
      } catch (err) {
        console.warn('[producthunt] entry parse error:', (err as Error).message);
      }
    }
    if (items.length === 0) {
      console.warn(
        `[producthunt] parsed 0 entries from ${xml.length} bytes (feed shape may have changed)`,
      );
    }
    items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return items;
  } catch (err) {
    console.warn('[producthunt] fetch failed:', (err as Error).message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
