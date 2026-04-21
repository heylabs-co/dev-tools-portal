import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const exts = await getCollection('extensions');
  const data = exts.map((e) => ({
    slug: e.data.slug,
    name: e.data.name,
    publisher: e.data.publisher,
    description: e.data.description,
    category: e.data.category,
    installs: e.data.installs,
    vscode_id: e.data.vscode_id,
  }));
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
