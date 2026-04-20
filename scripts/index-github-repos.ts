/**
 * Fetches trending/popular developer tool repos from GitHub
 * and saves to data/repos/trending.json.
 *
 * Sources:
 *   1. GitHub Search API (multiple dev-tool topics)
 *   2. GitHub Trending page (weekly, HTML scrape)
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... npx tsx scripts/index-github-repos.ts
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const RATE_LIMIT_MS = 500;
const DATA_DIR = path.resolve(import.meta.dirname ?? '.', '..', 'data', 'repos');
const COMPANIES_DIR = path.resolve(import.meta.dirname ?? '.', '..', 'data', 'companies');

const SEARCH_TOPICS = ['developer-tools', 'sdk', 'api-client', 'cli-tool', 'devops-tools'];

interface RepoEntry {
  full_name: string;
  name: string;
  description: string;
  url: string;
  homepage: string | null;
  stars: number;
  language: string | null;
  topics: string[];
  created_at: string;
  pushed_at: string;
  company_slug: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'devtools-indexer/1.0',
  };
  if (GITHUB_TOKEN) {
    h.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }
  return h;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API error ${res.status} for ${url}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Company matching
// ---------------------------------------------------------------------------

function loadCompanySlugs(): Map<string, string> {
  /** Maps normalised domain (e.g. "supabase.com") -> company slug */
  const map = new Map<string, string>();
  if (!fs.existsSync(COMPANIES_DIR)) return map;

  for (const file of fs.readdirSync(COMPANIES_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(COMPANIES_DIR, file), 'utf-8');
      const data = JSON.parse(raw);
      if (data.website) {
        try {
          const domain = new URL(data.website).hostname.replace(/^www\./, '');
          map.set(domain, data.slug);
        } catch { /* bad URL */ }
      }
    } catch { /* skip */ }
  }
  return map;
}

function matchCompany(
  repoFullName: string,
  homepage: string | null,
  companyDomains: Map<string, string>,
): string | null {
  // Try matching homepage domain
  if (homepage) {
    try {
      const domain = new URL(homepage).hostname.replace(/^www\./, '');
      const slug = companyDomains.get(domain);
      if (slug) return slug;
    } catch { /* */ }
  }

  // Try matching org name as domain: github.com/supabase/* -> supabase.com
  const org = repoFullName.split('/')[0].toLowerCase();
  const guess = `${org}.com`;
  const slug = companyDomains.get(guess);
  if (slug) return slug;

  // Also try .io
  const guessIo = `${org}.io`;
  return companyDomains.get(guessIo) ?? null;
}

function toRepoEntry(item: any, companyDomains: Map<string, string>): RepoEntry {
  return {
    full_name: item.full_name,
    name: item.name,
    description: (item.description ?? '').slice(0, 200),
    url: item.html_url,
    homepage: item.homepage || null,
    stars: item.stargazers_count,
    language: item.language ?? null,
    topics: item.topics ?? [],
    created_at: item.created_at?.slice(0, 10) ?? '',
    pushed_at: item.pushed_at?.slice(0, 10) ?? '',
    company_slug: matchCompany(item.full_name, item.homepage, companyDomains),
  };
}

// ---------------------------------------------------------------------------
// GitHub Search API
// ---------------------------------------------------------------------------

async function searchRepos(companyDomains: Map<string, string>): Promise<RepoEntry[]> {
  const seen = new Set<string>();
  const repos: RepoEntry[] = [];

  for (const topic of SEARCH_TOPICS) {
    const url = `https://api.github.com/search/repositories?q=topic:${topic}+created:>2026-01-01&sort=stars&per_page=30`;
    console.log(`Searching topic: ${topic}`);
    try {
      const data = await fetchJSON(url);
      for (const item of data.items ?? []) {
        if (seen.has(item.full_name)) continue;
        seen.add(item.full_name);
        repos.push(toRepoEntry(item, companyDomains));
      }
    } catch (err: any) {
      console.error(`  Error searching ${topic}: ${err.message}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  return repos;
}

// ---------------------------------------------------------------------------
// GitHub Trending (HTML scrape)
// ---------------------------------------------------------------------------

async function scrapeTrending(companyDomains: Map<string, string>): Promise<RepoEntry[]> {
  console.log('Scraping GitHub Trending (weekly)...');
  const repos: RepoEntry[] = [];
  const seen = new Set<string>();

  try {
    const res = await fetch('https://github.com/trending?since=weekly', {
      headers: { 'User-Agent': 'devtools-indexer/1.0' },
    });
    if (!res.ok) {
      console.error(`  Trending page returned ${res.status}`);
      return repos;
    }
    const html = await res.text();

    // Extract repo slugs from article[class*=Box-row] h2 a href="/org/repo"
    const repoPattern = /href="\/([^/]+\/[^/"]+)"[^>]*class="[^"]*"/g;
    // Simpler: match the h2 > a patterns specifically
    const articlePattern = /<article[^>]*>[\s\S]*?<\/article>/g;
    let article: RegExpExecArray | null;

    while ((article = articlePattern.exec(html)) !== null) {
      const block = article[0];
      // Find repo link: <h2 ...><a href="/org/repo" ...>
      const linkMatch = block.match(/href="\/([^/]+\/[^/"]+)"/);
      if (!linkMatch) continue;
      const fullName = linkMatch[1].trim();
      if (seen.has(fullName)) continue;
      seen.add(fullName);

      // We need full details from API
      try {
        const data = await fetchJSON(`https://api.github.com/repos/${fullName}`);
        repos.push(toRepoEntry(data, companyDomains));
        await sleep(RATE_LIMIT_MS);
      } catch (err: any) {
        console.error(`  Error fetching ${fullName}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.error(`  Error scraping trending: ${err.message}`);
  }

  return repos;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== GitHub Repo Indexer ===');
  console.log(`Token: ${GITHUB_TOKEN ? 'provided' : 'NOT SET (rate limits will be strict)'}`);

  const companyDomains = loadCompanySlugs();
  console.log(`Loaded ${companyDomains.size} company domains for matching\n`);

  // Fetch from both sources
  const searchResults = await searchRepos(companyDomains);
  console.log(`\nSearch API: ${searchResults.length} repos`);

  const trendingResults = await scrapeTrending(companyDomains);
  console.log(`Trending scrape: ${trendingResults.length} repos\n`);

  // Merge & deduplicate
  const allMap = new Map<string, RepoEntry>();
  for (const r of [...searchResults, ...trendingResults]) {
    // Keep the one with more stars (or trending version if duplicate)
    const existing = allMap.get(r.full_name);
    if (!existing || r.stars > existing.stars) {
      allMap.set(r.full_name, r);
    }
  }

  const all = Array.from(allMap.values());

  // Weekly: top 30 by stars
  const weekly = [...all].sort((a, b) => b.stars - a.stars).slice(0, 30);

  // Rising: created after 2026-01-01, sorted by stars, top 20
  const rising = [...all]
    .filter((r) => r.created_at >= '2026-01-01')
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 20);

  const output = {
    updated_at: new Date().toISOString().slice(0, 10),
    weekly,
    rising,
  };

  // Ensure dir exists
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const outPath = path.join(DATA_DIR, 'trending.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`Saved ${outPath}`);
  console.log(`  weekly: ${weekly.length} repos`);
  console.log(`  rising: ${rising.length} repos`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
