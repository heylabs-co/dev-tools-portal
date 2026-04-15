/**
 * discover-new-tools.ts
 *
 * Searches free sources for new developer tools and writes results
 * to data/discovered/{date}.json. No external dependencies — uses
 * Node 22 built-in fetch.
 *
 * Sources:
 *   A. Hacker News (Algolia API) — Show HN posts from last 7 days
 *   B. GitHub Trending — weekly trending repos matching dev-tool keywords
 *   C. Reddit — r/selfhosted + r/webdev top posts (JSON API)
 *   D. Product Hunt — developer-tools topic page (HTML scrape)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscoveredTool {
  name: string;
  website: string;
  source: "hackernews" | "github" | "reddit" | "producthunt";
  source_url: string;
  description: string;
  score: number;
  discovered_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname ?? ".", "..");
const REGISTRY_PATH = resolve(ROOT, "data/meta/registry.json");
const TODAY = new Date().toISOString().slice(0, 10);
const OUTPUT_DIR = resolve(ROOT, "data/discovered");
const OUTPUT_PATH = resolve(OUTPUT_DIR, `${TODAY}.json`);

const TOOL_KEYWORDS = /\b(sdk|api|cli|framework|tool|platform|saas|devtool|developer|library|infra|runtime|compiler|linter|bundler|database|monitoring|deployment|testing)\b/i;

let registry: Record<string, string> = {};

function loadRegistry(): void {
  try {
    const raw = readFileSync(REGISTRY_PATH, "utf-8");
    registry = JSON.parse(raw);
  } catch {
    console.warn("⚠ Could not load registry.json — will treat all tools as new");
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isKnown(name: string, url: string): boolean {
  const slug = slugify(name);
  if (registry[slug]) return true;

  const domain = domainFromUrl(url);
  if (!domain) return false;
  // Check if domain stem (e.g. "vercel" from "vercel.com") is a known slug
  const domainStem = domain.split(".")[0];
  if (registry[domainStem]) return true;

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": "DevToolsPortal/1.0 (discovery bot)",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`⚠ ${url} responded ${res.status}`);
      return null;
    }
    return res;
  } catch (err: any) {
    console.warn(`⚠ Failed to fetch ${url}: ${err?.message ?? err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source A: Hacker News (Algolia API)
// ---------------------------------------------------------------------------

async function searchHackerNews(): Promise<DiscoveredTool[]> {
  console.log("→ Searching Hacker News…");
  const tools: DiscoveredTool[] = [];

  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  const url = `https://hn.algolia.com/api/v1/search?query=Show%20HN&tags=show_hn&hitsPerPage=50&numericFilters=created_at_i>${sevenDaysAgo}`;

  const res = await safeFetch(url);
  if (!res) return tools;

  const data = await res.json() as any;

  for (const hit of data.hits ?? []) {
    const title: string = hit.title ?? "";
    const storyUrl: string = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
    const points: number = hit.points ?? 0;

    // Rough filter: look for tool-ish keywords in title
    if (!TOOL_KEYWORDS.test(title) && !title.toLowerCase().includes("show hn")) {
      // Keep "Show HN" posts even without keywords — they are tool launches
    }

    if (isKnown(title, storyUrl)) continue;

    // Clean up "Show HN: " prefix for the name
    const name = title.replace(/^Show HN:\s*/i, "").split(/[–—\-:|]/)[0].trim();

    tools.push({
      name,
      website: storyUrl,
      source: "hackernews",
      source_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      description: title.replace(/^Show HN:\s*/i, "").slice(0, 200),
      score: points,
      discovered_at: TODAY,
    });
  }

  console.log(`  Found ${tools.length} candidates from Hacker News`);
  return tools;
}

// ---------------------------------------------------------------------------
// Source B: GitHub Trending
// ---------------------------------------------------------------------------

async function searchGitHubTrending(): Promise<DiscoveredTool[]> {
  console.log("→ Searching GitHub Trending…");
  const tools: DiscoveredTool[] = [];

  const url = "https://github.com/trending?since=weekly&spoken_language_code=en";
  const res = await safeFetch(url);
  if (!res) return tools;

  const html = await res.text();

  // Parse each repo row from the trending page HTML
  const repoPattern = /<h2 class="h3 lh-condensed">[\s\S]*?<a href="\/([^"]+)"[\s\S]*?<\/h2>/g;
  const descPattern = /<p class="col-9 color-fg-muted my-1 pr-4">\s*([\s\S]*?)\s*<\/p>/g;
  const starsPattern = /(\d[\d,]*)\s*stars?\s*today/gi;

  // Simpler extraction: find all repo links in h2.h3
  const articleRegex = /<article class="Box-row">([\s\S]*?)<\/article>/g;
  let match: RegExpExecArray | null;

  while ((match = articleRegex.exec(html)) !== null) {
    const block = match[1];

    // Extract repo full name
    const repoMatch = block.match(/href="\/([^"]+?)"\s/);
    if (!repoMatch) continue;
    const fullName = repoMatch[1].replace(/\/$/, "");
    const [owner, repo] = fullName.split("/");
    if (!repo) continue;

    // Extract description
    const descMatch = block.match(/<p class="[^"]*color-fg-muted[^"]*">\s*([\s\S]*?)\s*<\/p>/);
    const description = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "";

    // Extract stars count (today or total)
    const starsMatch = block.match(/([\d,]+)\s*stars/i);
    const stars = starsMatch ? parseInt(starsMatch[1].replace(/,/g, ""), 10) : 0;

    // Filter: only repos that look like dev tools
    const combined = `${repo} ${description}`.toLowerCase();
    if (!TOOL_KEYWORDS.test(combined)) continue;

    const repoUrl = `https://github.com/${fullName}`;
    if (isKnown(repo, repoUrl)) continue;

    tools.push({
      name: repo,
      website: repoUrl,
      source: "github",
      source_url: repoUrl,
      description: description.slice(0, 200) || repo,
      score: stars,
      discovered_at: TODAY,
    });
  }

  console.log(`  Found ${tools.length} candidates from GitHub Trending`);
  return tools;
}

// ---------------------------------------------------------------------------
// Source C: Reddit (JSON API)
// ---------------------------------------------------------------------------

async function searchReddit(): Promise<DiscoveredTool[]> {
  console.log("→ Searching Reddit…");
  const tools: DiscoveredTool[] = [];

  const subreddits = [
    "https://www.reddit.com/r/selfhosted/top/.json?t=week&limit=25",
    "https://www.reddit.com/r/webdev/top/.json?t=week&limit=25",
  ];

  for (const url of subreddits) {
    await sleep(1000);
    const res = await safeFetch(url);
    if (!res) continue;

    let data: any;
    try {
      data = await res.json();
    } catch {
      console.warn(`⚠ Could not parse JSON from ${url}`);
      continue;
    }

    const posts = data?.data?.children ?? [];

    for (const child of posts) {
      const post = child?.data;
      if (!post) continue;

      const title: string = post.title ?? "";
      const postUrl: string = post.url ?? "";
      const permalink: string = post.permalink
        ? `https://www.reddit.com${post.permalink}`
        : "";
      const score: number = post.score ?? 0;
      const selftext: string = post.selftext ?? "";

      // Filter: posts that mention tools, launches, new projects
      const combined = `${title} ${selftext}`.toLowerCase();
      if (!TOOL_KEYWORDS.test(combined) && !/launch|built|released|open.?source|alternative/i.test(combined)) {
        continue;
      }

      const linkUrl = postUrl.startsWith("https://www.reddit.com") ? permalink : postUrl;
      if (isKnown(title, linkUrl)) continue;

      // Try to extract a clean name from the title
      const name = title
        .replace(/\[.*?\]/g, "")
        .replace(/\(.*?\)/g, "")
        .split(/[–—\-:|]/)[0]
        .trim()
        .slice(0, 80);

      tools.push({
        name,
        website: linkUrl || permalink,
        source: "reddit",
        source_url: permalink,
        description: title.slice(0, 200),
        score,
        discovered_at: TODAY,
      });
    }
  }

  console.log(`  Found ${tools.length} candidates from Reddit`);
  return tools;
}

// ---------------------------------------------------------------------------
// Source D: Product Hunt (developer-tools topic page)
// ---------------------------------------------------------------------------

async function searchProductHunt(): Promise<DiscoveredTool[]> {
  console.log("→ Searching Product Hunt…");
  const tools: DiscoveredTool[] = [];

  const url = "https://www.producthunt.com/topics/developer-tools";
  const res = await safeFetch(url);
  if (!res) return tools;

  const html = await res.text();

  // Product Hunt renders links to products — try to extract them
  // Look for product cards with name and tagline
  const productPattern = /"name"\s*:\s*"([^"]+)"[\s\S]*?"tagline"\s*:\s*"([^"]+)"[\s\S]*?"slug"\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = productPattern.exec(html)) !== null) {
    const name = match[1];
    const tagline = match[2];
    const slug = match[3];

    const productUrl = `https://www.producthunt.com/products/${slug}`;
    if (isKnown(name, productUrl)) continue;

    tools.push({
      name,
      website: productUrl,
      source: "producthunt",
      source_url: productUrl,
      description: tagline.slice(0, 200),
      score: 0,
      discovered_at: TODAY,
    });
  }

  // Fallback: try extracting from href patterns
  if (tools.length === 0) {
    const hrefPattern = /href="\/posts\/([^"]+)"[^>]*>[\s\S]*?<[^>]*>([^<]+)</g;
    while ((match = hrefPattern.exec(html)) !== null) {
      const slug = match[1];
      const name = match[2].trim();
      if (!name || name.length < 2) continue;

      const productUrl = `https://www.producthunt.com/posts/${slug}`;
      if (isKnown(name, productUrl)) continue;

      tools.push({
        name,
        website: productUrl,
        source: "producthunt",
        source_url: productUrl,
        description: name,
        score: 0,
        discovered_at: TODAY,
      });
    }
  }

  console.log(`  Found ${tools.length} candidates from Product Hunt`);
  return tools;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function dedup(tools: DiscoveredTool[]): DiscoveredTool[] {
  const seen = new Set<string>();
  const result: DiscoveredTool[] = [];

  for (const tool of tools) {
    const key = slugify(tool.name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tool);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\n=== Dev Tools Discovery — ${TODAY} ===\n`);

  loadRegistry();
  console.log(`Registry loaded: ${Object.keys(registry).length} known tools\n`);

  const allTools: DiscoveredTool[] = [];
  const sourceResults: Record<string, number> = {};

  // A. Hacker News
  try {
    const hn = await searchHackerNews();
    allTools.push(...hn);
    sourceResults.hackernews = hn.length;
  } catch (err: any) {
    console.error(`✗ Hacker News failed: ${err?.message ?? err}`);
  }

  await sleep(1000);

  // B. GitHub Trending
  try {
    const gh = await searchGitHubTrending();
    allTools.push(...gh);
    sourceResults.github = gh.length;
  } catch (err: any) {
    console.error(`✗ GitHub Trending failed: ${err?.message ?? err}`);
  }

  await sleep(1000);

  // C. Reddit
  try {
    const reddit = await searchReddit();
    allTools.push(...reddit);
    sourceResults.reddit = reddit.length;
  } catch (err: any) {
    console.error(`✗ Reddit failed: ${err?.message ?? err}`);
  }

  await sleep(1000);

  // D. Product Hunt
  try {
    const ph = await searchProductHunt();
    allTools.push(...ph);
    sourceResults.producthunt = ph.length;
  } catch (err: any) {
    console.error(`✗ Product Hunt failed: ${err?.message ?? err}`);
  }

  // Deduplicate
  const unique = dedup(allTools);

  // Sort by score descending
  unique.sort((a, b) => b.score - a.score);

  // Write output
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  writeFileSync(OUTPUT_PATH, JSON.stringify(unique, null, 2) + "\n");

  // Summary
  const activeSources = Object.keys(sourceResults).filter(
    (k) => sourceResults[k] !== undefined
  ).length;

  console.log(`\n=== Summary ===`);
  console.log(`Discovered ${unique.length} new tools from ${activeSources} sources`);
  for (const [src, count] of Object.entries(sourceResults)) {
    console.log(`  ${src}: ${count}`);
  }
  console.log(`Results written to ${OUTPUT_PATH}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
