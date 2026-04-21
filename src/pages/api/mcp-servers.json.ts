import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const servers = await getCollection('mcpServers');
  const data = servers.map((s) => ({
    slug: s.data.slug,
    name: s.data.name,
    description: s.data.description,
    github_repo: s.data.github_repo,
    npm_package: s.data.npm_package,
    install_command: s.data.install_command,
    category: s.data.category,
    official: s.data.official,
    author: s.data.author,
    tools_count: s.data.tools_count,
  }));
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
