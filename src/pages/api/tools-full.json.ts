import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const companies = await getCollection('companies');
  const payload: Record<string, unknown> = {};
  for (const c of companies) {
    const d = c.data;
    payload[d.slug] = {
      slug: d.slug,
      name: d.name,
      description: d.description,
      website: d.website,
      logo: d.logo,
      hq_country: d.hq_country,
      category: d.categories?.primary,
      pricing: d.pricing,
      scores: d.scores,
      scale: d.scale,
      review: d.review,
      when_to_use: d.content?.when_to_use ?? [],
      works_well_with: d.content?.works_well_with ?? [],
      url: `https://tool.news/tools/${d.slug}/`,
    };
  }
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
