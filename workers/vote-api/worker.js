/**
 * Cloudflare Worker: Vote API
 * Deploy separately: npx wrangler deploy --config workers/vote-api/wrangler.toml
 *
 * GET  /vote?slug=stripe → { upvotes, downvotes, score, user_vote }
 * POST /vote { slug, vote } → { ok, upvotes, downvotes, score }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // GET /vote?slug=xxx
    if (request.method === 'GET') {
      const slug = url.searchParams.get('slug');
      if (!slug) return json({ error: 'Missing slug' }, 400);

      const counts = await env.DB.prepare(
        'SELECT upvotes, downvotes, score FROM vote_counts WHERE tool_slug = ?'
      ).bind(slug).first();

      const userVote = await env.DB.prepare(
        'SELECT vote_type FROM votes WHERE tool_slug = ? AND voter_ip = ?'
      ).bind(slug, ip).first();

      return json({
        upvotes: counts?.upvotes ?? 0,
        downvotes: counts?.downvotes ?? 0,
        score: counts?.score ?? 0,
        user_vote: userVote?.vote_type ?? null,
      });
    }

    // POST /vote
    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

      const { slug, vote } = body;
      if (!slug || !vote || !['up', 'down'].includes(vote)) {
        return json({ error: 'Need slug and vote (up/down)' }, 400);
      }

      const existing = await env.DB.prepare(
        'SELECT vote_type FROM votes WHERE tool_slug = ? AND voter_ip = ?'
      ).bind(slug, ip).first();

      if (existing) {
        if (existing.vote_type === vote) {
          await env.DB.prepare('DELETE FROM votes WHERE tool_slug = ? AND voter_ip = ?').bind(slug, ip).run();
          const col = vote === 'up' ? 'upvotes' : 'downvotes';
          await env.DB.prepare(`UPDATE vote_counts SET ${col} = MAX(0, ${col} - 1), score = upvotes - downvotes WHERE tool_slug = ?`).bind(slug).run();
        } else {
          await env.DB.prepare('UPDATE votes SET vote_type = ? WHERE tool_slug = ? AND voter_ip = ?').bind(vote, slug, ip).run();
          if (vote === 'up') {
            await env.DB.prepare('UPDATE vote_counts SET upvotes = upvotes + 1, downvotes = MAX(0, downvotes - 1), score = upvotes - downvotes WHERE tool_slug = ?').bind(slug).run();
          } else {
            await env.DB.prepare('UPDATE vote_counts SET downvotes = downvotes + 1, upvotes = MAX(0, upvotes - 1), score = upvotes - downvotes WHERE tool_slug = ?').bind(slug).run();
          }
        }
      } else {
        await env.DB.prepare('INSERT INTO votes (tool_slug, vote_type, voter_ip) VALUES (?, ?, ?)').bind(slug, vote, ip).run();
        const up = vote === 'up' ? 1 : 0;
        const down = vote === 'down' ? 1 : 0;
        await env.DB.prepare(
          `INSERT INTO vote_counts (tool_slug, upvotes, downvotes, score) VALUES (?, ?, ?, ?)
           ON CONFLICT(tool_slug) DO UPDATE SET upvotes = upvotes + ?, downvotes = downvotes + ?, score = upvotes - downvotes`
        ).bind(slug, up, down, up - down, up, down).run();
      }

      const counts = await env.DB.prepare(
        'SELECT upvotes, downvotes, score FROM vote_counts WHERE tool_slug = ?'
      ).bind(slug).first();

      return json({ ok: true, upvotes: counts?.upvotes ?? 0, downvotes: counts?.downvotes ?? 0, score: counts?.score ?? 0 });
    }

    return json({ error: 'Method not allowed' }, 405);
  }
};
