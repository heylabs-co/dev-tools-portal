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

    const systemPrompt = `You are a developer tools advisor for devtools.wiki. You have access to a catalog of 800+ developer tools.

Given a project description, recommend 3-5 specific tools that best fit the project needs.

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
  "stack_summary": "Brief summary of the recommended stack (1 sentence)"
}

RULES:
- ONLY recommend tools from the catalog below. Do not invent tools.
- Match the exact slug from the catalog.
- Be specific about WHY each tool fits.
- Consider budget and lock-in preferences.

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
          'HTTP-Referer': 'https://devtools.wiki',
          'X-Title': 'DevTools Portal Recommender',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat-v3-0324',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: description },
          ],
          temperature: 0.3,
          max_tokens: 1000,
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

      // Enrich with logos from our known pattern
      parsed.recommendations = parsed.recommendations.slice(0, 5).map((rec) => ({
        slug: rec.slug || '',
        name: rec.name || '',
        category: rec.category || '',
        reason: rec.reason || '',
        pricing_note: rec.pricing_note || '',
        lock_in_level: ['low', 'medium', 'high'].includes(rec.lock_in_level) ? rec.lock_in_level : null,
        logo: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(rec.slug)}.com&sz=128`,
      }));

      return json({
        recommendations: parsed.recommendations,
        stack_summary: parsed.stack_summary || '',
      });
    } catch (e) {
      console.error('Failed to parse AI response:', e, aiResponse);
      return json({ error: 'Failed to parse AI response' }, 502);
    }
  },
};
