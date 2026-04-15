export const prerender = false;

import type { APIRoute } from 'astro';

interface Runtime {
  env: {
    DB: D1Database;
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function getIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

export const GET: APIRoute = async ({ request, locals }) => {
  const runtime = locals as unknown as { runtime: Runtime };
  const DB = runtime.runtime.env.DB;

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return json({ error: 'Missing slug' }, 400);

  const ip = getIP(request);

  const counts = await DB.prepare(
    'SELECT upvotes, downvotes, score FROM vote_counts WHERE tool_slug = ?'
  ).bind(slug).first();

  const userVote = await DB.prepare(
    'SELECT vote_type FROM votes WHERE tool_slug = ? AND voter_ip = ?'
  ).bind(slug, ip).first();

  return json({
    upvotes: counts?.upvotes ?? 0,
    downvotes: counts?.downvotes ?? 0,
    score: counts?.score ?? 0,
    user_vote: userVote?.vote_type ?? null,
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = locals as unknown as { runtime: Runtime };
  const DB = runtime.runtime.env.DB;

  let body: { slug?: string; vote?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { slug, vote } = body;
  if (!slug || !vote || !['up', 'down'].includes(vote)) {
    return json({ error: 'Required: slug, vote ("up"/"down")' }, 400);
  }

  const ip = getIP(request);

  const existing = await DB.prepare(
    'SELECT vote_type FROM votes WHERE tool_slug = ? AND voter_ip = ?'
  ).bind(slug, ip).first();

  if (existing) {
    if (existing.vote_type === vote) {
      // Toggle off
      await DB.prepare('DELETE FROM votes WHERE tool_slug = ? AND voter_ip = ?').bind(slug, ip).run();
      const col = vote === 'up' ? 'upvotes' : 'downvotes';
      await DB.prepare(`UPDATE vote_counts SET ${col} = MAX(0, ${col} - 1), score = upvotes - downvotes WHERE tool_slug = ?`).bind(slug).run();
    } else {
      // Change vote
      await DB.prepare('UPDATE votes SET vote_type = ? WHERE tool_slug = ? AND voter_ip = ?').bind(vote, slug, ip).run();
      if (vote === 'up') {
        await DB.prepare('UPDATE vote_counts SET upvotes = upvotes + 1, downvotes = MAX(0, downvotes - 1), score = upvotes - downvotes WHERE tool_slug = ?').bind(slug).run();
      } else {
        await DB.prepare('UPDATE vote_counts SET downvotes = downvotes + 1, upvotes = MAX(0, upvotes - 1), score = upvotes - downvotes WHERE tool_slug = ?').bind(slug).run();
      }
    }
  } else {
    // New vote
    await DB.prepare('INSERT INTO votes (tool_slug, vote_type, voter_ip) VALUES (?, ?, ?)').bind(slug, vote, ip).run();
    const up = vote === 'up' ? 1 : 0;
    const down = vote === 'down' ? 1 : 0;
    await DB.prepare(
      `INSERT INTO vote_counts (tool_slug, upvotes, downvotes, score) VALUES (?, ?, ?, ?)
       ON CONFLICT(tool_slug) DO UPDATE SET upvotes = upvotes + ?, downvotes = downvotes + ?, score = upvotes - downvotes`
    ).bind(slug, up, down, up - down, up, down).run();
  }

  const counts = await DB.prepare(
    'SELECT upvotes, downvotes, score FROM vote_counts WHERE tool_slug = ?'
  ).bind(slug).first();

  return json({
    ok: true,
    upvotes: counts?.upvotes ?? 0,
    downvotes: counts?.downvotes ?? 0,
    score: counts?.score ?? 0,
  });
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
