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
