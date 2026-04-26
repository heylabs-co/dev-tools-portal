/**
 * Cloudflare Worker: AI Tool Recommender API
 * Deploy: npx wrangler deploy --config workers/recommend-api/wrangler.toml
 *
 * POST / { description, budget?, prefer_low_lockin? }
 *   → { recommendations: [...], stack_summary: "..." }
 *
 * Requires OPENROUTER_API_KEY secret set in Cloudflare dashboard.
 * Tool list is embedded from tool-list.txt at build time (or inline fallback).
 */

import TOOL_LIST from './tool-list.txt';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Simple in-memory rate limiter (per-isolate, resets on cold start)
const rateLimits = new Map();
const RATE_LIMIT = 10; // requests per day per IP
const DAY_MS = 86400000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now - entry.start > DAY_MS) {
    rateLimits.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

async function handleMigrate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { source_slug, target_slug, context } = body || {};
  if (!source_slug || !target_slug || typeof source_slug !== 'string' || typeof target_slug !== 'string') {
    return json({ error: 'source_slug + target_slug required' }, 400);
  }
  if (source_slug === target_slug) {
    return json({ error: 'source and target must be different tools' }, 400);
  }

  // Find source + target lines in TOOL_LIST so the model has the same
  // context the recommender already trusts. Avoids sending the whole
  // catalog for a 2-tool query.
  const find = (slug) => {
    const re = new RegExp('^' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\|', 'm');
    const m = TOOL_LIST.match(re);
    return m ? m[0] : null;
  };
  const sourceLine = find(source_slug);
  const targetLine = find(target_slug);
  if (!sourceLine || !targetLine) {
    return json({ error: 'tool slug not found in catalog' }, 404);
  }

  const userContext = (typeof context === 'string' ? context : '').slice(0, 1500).trim();

  const systemPrompt = `You draft a concise migration plan from one developer tool to another.

You will be given a source tool, a target tool, and optionally the user's context (their stack, data volume, what matters). Return STRICT JSON with this exact shape:

{
  "email": {
    "subject": "<short subject for the data export request to source vendor>",
    "body": "<plain-text email body, ≤ 200 words, polite + specific. Asks for: full data export in machine-readable format (JSON/CSV), specifies the data types likely needed (users, transactions, configurations — match the source tool category), gives a reasonable timeline (14 days), and asks about sunset/billing implications. Sign as 'Your customer'.>"
  },
  "steps": [
    "<step 1 — typically: request export from source>",
    "<step 2 — set up target tool account/project>",
    "<step 3 — concrete export action with the actual API or feature name when known>",
    "<step 4 — concrete import or transformation step>",
    "<step 5 — verification step (compare counts, smoke test)>",
    "<step 6 — cutover/dual-write or DNS swap>",
    "<step 7 — decommission source>"
  ],
  "effort": "<rough estimate, e.g. '2-4 days', '1-2 weeks', '1 day'>",
  "gotchas": [
    "<concrete pitfall #1 — webhook URLs to update, ID format mismatches, missing features at target, billing overlap, data format differences. ONLY list things you have real evidence for; do not invent.>",
    "<concrete pitfall #2>",
    "<concrete pitfall #3>"
  ]
}

RULES:
- Keep email body under 200 words.
- Each step is a single sentence — concrete and verifiable.
- ONLY include gotchas you can back up with concrete API/feature knowledge. Better 1 real gotcha than 3 invented ones. If you have nothing solid, return an empty array.
- Effort is a range, not a guarantee.
- Output ONLY the JSON. No markdown fences, no preamble, no commentary.`;

  const userPrompt = `Source tool: ${sourceLine}
Target tool: ${targetLine}
${userContext ? `\nUser context: ${userContext}` : ''}

Draft the migration plan now. JSON only.`;

  let aiResponse;
  try {
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://tool.news',
        'X-Title': 'tool.news Migrate',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3-0324',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
    });
    if (!orRes.ok) {
      const txt = await orRes.text().catch(() => '');
      console.error('migrate openrouter', orRes.status, txt);
      return json({ error: 'AI service unavailable' }, 502);
    }
    aiResponse = await orRes.json();
  } catch (e) {
    console.error('migrate fetch failed', e);
    return json({ error: 'AI service unavailable' }, 502);
  }

  const content = aiResponse?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return json({ error: 'Empty AI response' }, 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to recover a JSON block if the model wrapped it.
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: 'Could not parse AI response' }, 502);
    try { parsed = JSON.parse(m[0]); } catch { return json({ error: 'Could not parse AI response' }, 502); }
  }

  // Sanitize shape
  const email = parsed && parsed.email && typeof parsed.email === 'object' ? parsed.email : {};
  const steps = Array.isArray(parsed?.steps) ? parsed.steps.slice(0, 10).map((s) => String(s).slice(0, 280)) : [];
  const gotchas = Array.isArray(parsed?.gotchas) ? parsed.gotchas.slice(0, 6).map((g) => String(g).slice(0, 240)) : [];

  return json({
    source_slug,
    target_slug,
    email: {
      subject: String(email.subject || `Data export request — preparing migration off ${source_slug}`).slice(0, 140),
      body: String(email.body || '').slice(0, 2000),
    },
    steps,
    effort: typeof parsed?.effort === 'string' ? parsed.effort.slice(0, 60) : '',
    gotchas,
  });
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    // Rate limit
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(ip)) {
      return json({ error: 'Rate limit exceeded. Try again tomorrow.' }, 429);
    }

    // Route by path: /migrate dispatches to the migration drafter.
    const path = new URL(request.url).pathname;
    if (path === '/migrate') {
      return handleMigrate(request, env);
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const { description, budget, prefer_low_lockin } = body;
    if (!description || typeof description !== 'string' || description.length < 5) {
      return json({ error: 'Description required (min 5 characters)' }, 400);
    }
    if (description.length > 2000) {
      return json({ error: 'Description too long (max 2000 characters)' }, 400);
    }

    // Build system prompt
    const budgetLabel =
      budget === 'free' ? 'Free tools only' :
      budget === 'under100' ? 'Under $100/month' :
      'Any budget';

    const systemPrompt = `You are a developer tools advisor for tool.news. You have access to a curated catalog of 5,900+ developer tools plus a fresh list of trending GitHub repos updated daily.

Given a project description, recommend 3-5 specific tools that best fit the project needs.

Secondary recommendations:
- MCP Servers: tools that connect AI assistants to external services
- AI Skills: cursor rules and coding instructions for AI assistants
- VS Code Extensions: editor extensions for the recommended stack
- Trending Repos: recent GitHub projects that may be relevant (optional)

Trending repos are open-source projects that may not yet be in the main catalog. Their slugs are PREFIXED with "trending:" (e.g. "trending:anthropic/claude-code"). Include 1-2 when a fresh open-source option genuinely fits the user's need — prefer them over catalog entries only if they're the best fit.

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "recommendations": [
    {
      "slug": "tool-slug-from-catalog",
      "name": "Tool Name",
      "category": "Category Name",
      "reason": "Why this tool fits the project (1-2 sentences)",
      "pricing_note": "Free tier available" or "From $X/mo" or "Usage-based",
      "lock_in_level": "low" or "medium" or "high"
    }
  ],
  "mcp_servers": [{"name": "Server Name", "slug": "server-slug", "reason": "Why this MCP server is useful"}],
  "skills": [{"name": "Skill Name", "slug": "skill-slug", "reason": "Why this skill helps"}],
  "extensions": [{"name": "Extension Name", "slug": "extension-slug", "reason": "Why this extension is useful"}],
  "trending_repos": [{"slug": "trending:owner/repo", "name": "owner/repo", "reason": "Why this trending repo is worth considering", "language": "TypeScript or null"}],
  "stack_summary": "Brief summary of the recommended stack (1 sentence)"
}

RULES:
- ONLY recommend items from the catalog below. Do not invent entries.
- Match the exact slug from the catalog (including the "trending:" prefix when applicable).
- Be specific about WHY each tool fits.
- Consider budget and lock-in preferences.
- Include 1-3 relevant MCP servers, skills, and extensions when applicable.
- Include 0-2 trending repos ONLY when genuinely helpful; leave the array empty otherwise.
- MCP servers, skills, extensions and trending repos are optional — only include if relevant.
- Tools marked with " | HWM" at the end of their catalog line have HIGH WATER MARK pricing — the bill locks to peak usage or reserved capacity and does NOT scale down within a billing cycle (e.g. Datadog, Snowflake, annual seat commits). When the user mentions "budget", "flexible", "hobby", "side project", "scale down", "no commits", or signals cost-consciousness, PREFER non-HWM alternatives from the same category. If you recommend a HWM tool anyway, ALWAYS flag this in the reason field (e.g. "Note: uses peak-usage pricing — bill locks at the highest host count for the month").

Budget preference: ${budgetLabel}
Prefer low vendor lock-in: ${prefer_low_lockin ? 'Yes' : 'No'}

TOOL CATALOG:
${TOOL_LIST}`;

    // Call OpenRouter (DeepSeek V3)
    let aiResponse;
    try {
      const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://tool.news',
          'X-Title': 'tool.news Recommender',
        },
        body: JSON.stringify({
          // Gemini 2.0 Flash — 1M context handles our 670KB catalog cleanly,
          // ~$0.10/1M input tokens. DeepSeek V3 was maxing out context.
          model: 'google/gemini-2.0-flash-001',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: description },
          ],
          temperature: 0.3,
          max_tokens: 1200,
          response_format: { type: 'json_object' },
        }),
      });

      if (!openRouterRes.ok) {
        const errText = await openRouterRes.text();
        console.error('OpenRouter error:', openRouterRes.status, errText);
        return json({ error: 'AI service unavailable' }, 502);
      }

      aiResponse = await openRouterRes.json();
    } catch (e) {
      console.error('OpenRouter fetch failed:', e);
      return json({ error: 'AI service unavailable' }, 502);
    }

    // Parse AI response
    try {
      const content = aiResponse.choices?.[0]?.message?.content;
      if (!content) {
        return json({ error: 'Empty AI response' }, 502);
      }

      const parsed = JSON.parse(content);

      // Validate structure
      if (!Array.isArray(parsed.recommendations)) {
        return json({ error: 'Invalid AI response format' }, 502);
      }

      // Trending entries may leak into `recommendations` if the model isn't
      // strict; move them to `trending_repos` so the UI renders them as
      // GitHub cards instead of looking up a missing tool slug.
      const rawRecs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      const rawTrending = Array.isArray(parsed.trending_repos) ? parsed.trending_repos : [];
      const catalogRecs = [];
      const trendingFromRecs = [];
      for (const r of rawRecs) {
        const slug = String(r?.slug ?? '');
        if (slug.startsWith('trending:')) trendingFromRecs.push(r);
        else catalogRecs.push(r);
      }

      const recommendations = catalogRecs.slice(0, 5).map((rec) => ({
        slug: rec.slug || '',
        name: rec.name || '',
        category: rec.category || '',
        reason: rec.reason || '',
        pricing_note: rec.pricing_note || '',
        lock_in_level: ['low', 'medium', 'high'].includes(rec.lock_in_level) ? rec.lock_in_level : null,
        logo: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(rec.slug)}.com&sz=128`,
      }));

      const trending_repos = [...trendingFromRecs, ...rawTrending]
        .slice(0, 3)
        .map((r) => {
          const slug = String(r?.slug ?? '');
          const fullName = slug.replace(/^trending:/, '');
          return {
            slug,                        // "trending:owner/repo"
            full_name: fullName,         // "owner/repo" — used to build GitHub URL
            name: r?.name || fullName,
            reason: r?.reason || '',
            language: r?.language || null,
            url: fullName.includes('/') ? `https://github.com/${fullName}` : '',
          };
        })
        .filter((r) => r.full_name);

      return json({
        recommendations,
        mcp_servers: Array.isArray(parsed.mcp_servers) ? parsed.mcp_servers.slice(0, 5).map((s) => ({
          name: s.name || '',
          slug: s.slug || '',
          reason: s.reason || '',
        })) : [],
        skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 5).map((s) => ({
          name: s.name || '',
          slug: s.slug || '',
          reason: s.reason || '',
        })) : [],
        extensions: Array.isArray(parsed.extensions) ? parsed.extensions.slice(0, 5).map((e) => ({
          name: e.name || '',
          slug: e.slug || '',
          reason: e.reason || '',
        })) : [],
        trending_repos,
        stack_summary: parsed.stack_summary || '',
      });
    } catch (e) {
      console.error('Failed to parse AI response:', e, aiResponse);
      return json({ error: 'Failed to parse AI response' }, 502);
    }
  },
};
