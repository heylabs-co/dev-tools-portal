/**
 * Cloudflare Pages Function: /api/vote
 *
 * GET /api/vote?slug=stripe → { upvotes: 42, downvotes: 3, score: 39, user_vote: "up"|"down"|null }
 * POST /api/vote { slug: "stripe", vote: "up"|"down" } → { ok: true, upvotes, downvotes, score }
 *
 * Rate limit: 1 vote per IP per tool (can change vote, not add second)
 */

interface Env {
  DB: D1Database;
}

// CORS headers for client-side fetch
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function getIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

// --- GET: get vote counts + user's vote ---
async function handleGet(request: Request, env: Env) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return json({ error: 'Missing slug parameter' }, 400);
  }

  const ip = getIP(request);

  // Get counts
  const counts = await env.DB.prepare(
    'SELECT upvotes, downvotes, score FROM vote_counts WHERE tool_slug = ?'
  ).bind(slug).first();

  // Get user's existing vote
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

// --- POST: submit or change vote ---
async function handlePost(request: Request, env: Env) {
  let body: { slug?: string; vote?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { slug, vote } = body;

  if (!slug || !vote || !['up', 'down'].includes(vote)) {
    return json({ error: 'Required: slug (string), vote ("up" or "down")' }, 400);
  }

  const ip = getIP(request);

  // Check existing vote
  const existing = await env.DB.prepare(
    'SELECT vote_type FROM votes WHERE tool_slug = ? AND voter_ip = ?'
  ).bind(slug, ip).first();

  if (existing) {
    if (existing.vote_type === vote) {
      // Same vote — remove it (toggle off)
      await env.DB.prepare(
        'DELETE FROM votes WHERE tool_slug = ? AND voter_ip = ?'
      ).bind(slug, ip).run();

      // Update counts
      if (vote === 'up') {
        await env.DB.prepare(
          'UPDATE vote_counts SET upvotes = MAX(0, upvotes - 1), score = upvotes - downvotes - 1 WHERE tool_slug = ?'
        ).bind(slug).run();
      } else {
        await env.DB.prepare(
          'UPDATE vote_counts SET downvotes = MAX(0, downvotes - 1), score = upvotes - downvotes + 1 WHERE tool_slug = ?'
        ).bind(slug).run();
      }
    } else {
      // Different vote — change it
      await env.DB.prepare(
        'UPDATE votes SET vote_type = ?, created_at = datetime(\'now\') WHERE tool_slug = ? AND voter_ip = ?'
      ).bind(vote, slug, ip).run();

      // Update counts: remove old, add new
      if (vote === 'up') {
        await env.DB.prepare(
          'UPDATE vote_counts SET upvotes = upvotes + 1, downvotes = MAX(0, downvotes - 1), score = upvotes - downvotes + 2 WHERE tool_slug = ?'
        ).bind(slug).run();
      } else {
        await env.DB.prepare(
          'UPDATE vote_counts SET downvotes = downvotes + 1, upvotes = MAX(0, upvotes - 1), score = upvotes - downvotes - 2 WHERE tool_slug = ?'
        ).bind(slug).run();
      }
    }
  } else {
    // New vote
    await env.DB.prepare(
      'INSERT INTO votes (tool_slug, vote_type, voter_ip) VALUES (?, ?, ?)'
    ).bind(slug, vote, ip).run();

    // Upsert counts
    await env.DB.prepare(
      `INSERT INTO vote_counts (tool_slug, upvotes, downvotes, score)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(tool_slug) DO UPDATE SET
         upvotes = upvotes + ?,
         downvotes = downvotes + ?,
         score = upvotes + ? - downvotes - ?`
    ).bind(
      slug,
      vote === 'up' ? 1 : 0,
      vote === 'down' ? 1 : 0,
      vote === 'up' ? 1 : -1,
      vote === 'up' ? 1 : 0,
      vote === 'down' ? 1 : 0,
      vote === 'up' ? 1 : 0,
      vote === 'down' ? 1 : 0,
    ).run();
  }

  // Return updated counts
  const counts = await env.DB.prepare(
    'SELECT upvotes, downvotes, score FROM vote_counts WHERE tool_slug = ?'
  ).bind(slug).first();

  return json({
    ok: true,
    upvotes: counts?.upvotes ?? 0,
    downvotes: counts?.downvotes ?? 0,
    score: counts?.score ?? 0,
  });
}

// --- Main handler ---
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method === 'GET') {
    return handleGet(request, env);
  }

  if (request.method === 'POST') {
    return handlePost(request, env);
  }

  return json({ error: 'Method not allowed' }, 405);
};
