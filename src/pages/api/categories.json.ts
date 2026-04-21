import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const categories = await getCollection('categories');
  const data = categories.map((c) => ({
    id: c.data.id,
    slug: c.data.slug,
    name: c.data.name,
    section: c.data.section,
    description: c.data.description,
    ai_native: c.data.ai_native,
    company_count: c.data.company_count,
  }));
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
