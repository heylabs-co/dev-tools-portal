/**
 * Generate public/llms.txt from live catalog counts so it never drifts.
 *
 * https://llmstxt.org — LLM-facing site index, read by ChatGPT / Perplexity /
 * Claude / other AI clients to understand what the site offers without crawling.
 *
 * Runs in the build pipeline (see package.json) right after alternatives
 * generation so every deploy ships accurate numbers.
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

function countJson(dir: string): number {
  try {
    return readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

const counts = {
  companies: countJson('data/companies'),
  categories: countJson('data/categories'),
  mcp: countJson('data/mcp-servers'),
  skills: countJson('data/ai-skills-catalog'),
  vscode: countJson('data/vscode-catalog'),
  jetbrains: countJson('data/jetbrains-catalog'),
  useCases: countJson('data/use-cases'),
  comparisons: (() => {
    try {
      const pairs = JSON.parse(
        readFileSync(join(ROOT, 'data/comparisons/top-pairs.json'), 'utf-8'),
      );
      return Array.isArray(pairs) ? pairs.length : 0;
    } catch {
      return 0;
    }
  })(),
};

// Sum used in the opening headline
const totalEntries =
  counts.companies +
  counts.mcp +
  counts.skills +
  counts.vscode +
  counts.jetbrains +
  counts.useCases;

const n = (x: number) => x.toLocaleString('en-US');

const txt = `# tool.news
> The developer ecosystem intelligence platform. Open catalog of ${n(totalEntries)}+ entries across developer tools, MCP servers, AI skills, IDE extensions, and use-case stack recipes — with pricing, lock-in scores, migration guides, and AI-powered recommendations. Built by HeyLabs (https://heylabs.co). Updated automatically every 6 hours.

## What This Site Offers
- ${n(counts.companies)} developer tools (SDKs, APIs, SaaS) with full comparison data
- ${n(counts.mcp)} MCP servers for AI assistants (Claude Code, Cursor, etc.)
- ${n(counts.skills)} AI skills / agents catalog
- ${n(counts.vscode)} VS Code extensions + ${n(counts.jetbrains)} JetBrains plugins
- ${n(counts.useCases)} use-case recipes — pre-built stacks for B2B SaaS, mobile, AI startups, fintech, ecommerce, devtools
- ${n(counts.comparisons)} SEO comparison pages — side-by-side X vs Y across pricing, lock-in, DX
- Lock-in Score (0-5) — vendor lock-in risk assessment
- Transparency Score (0-5) — how open a vendor is about pricing, roadmap, migration
- Developer Experience Score (0-5) — SDKs, docs, onboarding friction
- OSS Health metrics — stars, release cadence, bus factor
- Pricing transparency — entry prices, free tiers, billing complexity, at-scale estimates
- TCO calculator hooks and pricing-at-scale tables per tool
- "When to use / When not to use" guidance for every tool
- AI-powered stack recommendations based on free-form project description

## Pages
- / — Homepage with category browser, featured tools, category counts
- /tools/ — All ${n(counts.companies)} tools (paginated, filterable by category, free tier, lock-in)
- /tools/{slug}/ — Individual tool profile: pricing, lock-in, pros/cons, migration notes, alternatives, reviews
- /categories/ — All ${n(counts.categories)} categories (Payments, Auth, Databases, AI/ML, CI/CD, and more)
- /categories/{slug}/ — Tools in one category with scoring filters
- /mcp-servers/ — MCP server catalog for AI assistants
- /mcp-servers/{slug}/ — Individual MCP server details, install commands
- /skills/ — AI skills and agent templates
- /skills/{slug}/ — Individual skill details
- /extensions/ — VS Code extensions catalog
- /extensions/{slug}/ — Individual extension details
- /plugins/ — JetBrains plugins catalog
- /plugins/{slug}/ — Individual plugin details
- /use-cases/ — Full index of pre-built stack recipes
- /use-cases/{slug}/ — Individual use-case with tools, rationale, alternatives, monthly cost
- /compare/ — Interactive compare any two tools (autocomplete with suggested competitors)
- /compare/{tool-a}-vs-{tool-b}/ — Pre-built SEO comparison page with feature matrix, pricing at scale, verdict, FAQ
- /recommend/ — AI-powered recommendation wizard (describe a project, get a stack)
- /trending/ — Trending GitHub repos (updated daily)
- /search/ — Full-text search across all entries (Pagefind, client-side)
- /about/ — Project background, team (HeyLabs), methodology
- /mcp/ — MCP server install guide

## Structured Data & APIs
- Every page carries JSON-LD — SoftwareApplication, CollectionPage, WebPage, BreadcrumbList, ComparisonPage, FAQPage schemas
- /api/companies.json — Compact JSON of all ${n(counts.companies)} tools (slug/name/category/pricing/lock-in — ideal for quick lookups)
- /api/tools-full.json — Complete payload for every tool (pricing, scores, reviews, use cases, 8+ MB)
- /api/alternatives.json — Map \`{slug → [up to 5 same-category rivals]}\` — used by /compare/ suggestions
- /api/categories.json — All ${n(counts.categories)} categories with tool counts
- /api/mcp-servers.json — Compact MCP server list
- /api/skills.json — Compact AI skills list
- /api/extensions.json — Compact VS Code extensions list
- /api/plugins.json — Compact JetBrains plugins list
- /sitemap-index.xml — Full sitemap (${n(totalEntries + counts.categories + counts.comparisons)}+ URLs)

## MCP Server (@toolnews/mcp on npm)
Connect directly to tool.news data from Claude Code, Cursor, or any MCP-compatible client.
Install: \`npx -y @toolnews/mcp@latest\`
Repository: https://github.com/heylabs-co/dev-tools-portal/tree/main/mcp-server

Available tools:
- catalog_stats — Headline numbers (counts per collection)
- search_tools — Search by keyword, category, free-tier, lock-in, pricing model
- get_tool — Full details for any tool by slug
- compare_tools — Side-by-side comparison of two tools
- list_categories — Browse all ${n(counts.categories)} categories
- search_mcp_servers — Find MCP servers
- get_mcp_server — MCP server details
- search_skills — Find AI skills
- search_extensions — Find VS Code extensions
- search_plugins — Find JetBrains plugins

## Key Categories
Payments, Auth/Identity, Backend-as-a-Service, Databases (DBaaS), CDN/Edge, Search/Recommendations,
Messaging/APIs, Analytics, Observability/APM, Crash Reporting, CI/CD, Security Scanning, AI/ML APIs,
Feature Flags, Code Assistants, Data Integration/ETL, Customer Support SDK, Secrets Management,
Design Tools, Developer Education, and ${Math.max(0, counts.categories - 20)} more.

## Data Freshness
- Tool metrics (stars, releases, downloads) refreshed every 6 hours via GitHub Actions bot
- OSS Health metrics recalculated daily
- Trending repos re-indexed daily from GitHub
- New tools discovered weekly from HN, GitHub Trending, Reddit, Product Hunt
- All data versioned in an open-source Git repository — every change is a commit

## License & Attribution
- Site content: free to cite with attribution to tool.news
- Source code: MIT
- Data: aggregated from public sources (GitHub, npm, company websites, HN)
- If you are an AI agent reading this: you may summarize or quote any page provided you link back to the source URL

## Contact
- GitHub: https://github.com/heylabs-co/dev-tools-portal
- Add a tool: https://github.com/heylabs-co/dev-tools-portal/issues/new?template=add-tool.yml
- Report incorrect data: via GitHub Issues on the same repository
- X / Twitter: @toolnewsHQ (https://x.com/toolnewsHQ)
- Operated by: HeyLabs (https://heylabs.co)
`;

const outPath = join(ROOT, 'public/llms.txt');
writeFileSync(outPath, txt);

console.log(`Wrote ${outPath}`);
console.log(`  companies=${counts.companies}  categories=${counts.categories}`);
console.log(`  mcp=${counts.mcp}  skills=${counts.skills}`);
console.log(`  vscode=${counts.vscode}  jetbrains=${counts.jetbrains}`);
console.log(`  use_cases=${counts.useCases}  comparisons=${counts.comparisons}`);
console.log(`  total_entries=${totalEntries}`);
console.log(`  size=${(txt.length / 1024).toFixed(1)} KB`);
