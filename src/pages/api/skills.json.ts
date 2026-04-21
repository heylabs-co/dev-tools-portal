import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const skills = await getCollection('skills');
  const data = skills.map((s) => ({
    slug: s.data.slug,
    name: s.data.name,
    description: s.data.description,
    source_url: s.data.source_url,
    author: s.data.author,
    category: s.data.category,
    framework: s.data.framework,
    format: s.data.format,
    stars: s.data.stars,
  }));
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
