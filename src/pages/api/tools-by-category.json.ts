/**
 * /api/tools-by-category.json
 *
 * Compact map: { categorySlug: [{ slug, name }] }
 * Powers the migrate-modal target dropdown — we want quick same-category
 * alternatives loaded on the client without shipping the full 5,978-tool
 * catalog over the wire (tools-full.json is ~5MB).
 */

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const companies = await getCollection('companies');
  const out: Record<string, Array<{ slug: string; name: string; lock_in?: string; hwm?: boolean }>> = {};

  for (const c of companies) {
    if (c.data.status === 'inactive') continue;
    const cat = c.data.categories?.primary?.slug;
    if (!cat) continue;
    if (!out[cat]) out[cat] = [];
    out[cat].push({
      slug: c.data.slug,
      name: c.data.name,
      lock_in: c.data.scores?.lock_in?.level,
      hwm: (c.data.pricing as { high_water_mark?: boolean } | undefined)?.high_water_mark === true,
    });
  }

  // Sort each bucket: low lock-in first, then alphabetical.
  const rank = (l?: string) => (l === 'low' ? 0 : l === 'medium' ? 1 : l === 'high' ? 2 : 3);
  for (const cat of Object.keys(out)) {
    out[cat].sort((a, b) => {
      const r = rank(a.lock_in) - rank(b.lock_in);
      return r !== 0 ? r : a.name.localeCompare(b.name);
    });
  }

  return new Response(JSON.stringify(out), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
