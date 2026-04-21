import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * API index — lists all data endpoints with counts.
 * Useful for MCP clients / integrations to discover what's available.
 */
export const GET: APIRoute = async () => {
  const [companies, mcpServers, skills, extensions, plugins, categories] = await Promise.all([
    getCollection('companies'),
    getCollection('mcpServers'),
    getCollection('skills'),
    getCollection('extensions'),
    getCollection('jetbrainsPlugins'),
    getCollection('categories'),
  ]);

  const payload = {
    version: 1,
    generated_at: new Date().toISOString(),
    endpoints: {
      companies: {
        url: 'https://tool.news/api/companies.json',
        count: companies.length,
      },
      mcp_servers: {
        url: 'https://tool.news/api/mcp-servers.json',
        count: mcpServers.length,
      },
      skills: {
        url: 'https://tool.news/api/skills.json',
        count: skills.length,
      },
      extensions: {
        url: 'https://tool.news/api/extensions.json',
        count: extensions.length,
      },
      plugins: {
        url: 'https://tool.news/api/plugins.json',
        count: plugins.length,
      },
      categories: {
        url: 'https://tool.news/api/categories.json',
        count: categories.length,
      },
    },
    total_entries:
      companies.length + mcpServers.length + skills.length + extensions.length + plugins.length,
    docs: 'https://tool.news/mcp/',
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
