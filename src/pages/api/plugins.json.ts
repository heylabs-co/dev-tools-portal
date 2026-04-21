import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const plugins = await getCollection('jetbrainsPlugins');
  const data = plugins.map((p) => ({
    slug: p.data.slug,
    name: p.data.name,
    publisher: p.data.publisher,
    description: p.data.description,
    category: p.data.category,
    ide: p.data.ide,
  }));
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
