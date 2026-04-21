import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const companies = await getCollection('companies');
  return companies.map((c) => ({ params: { slug: c.data.slug } }));
}

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug as string;
  const companies = await getCollection('companies');
  const c = companies.find((x) => x.data.slug === slug);
  if (!c) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const d = c.data;
  const payload = {
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
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
