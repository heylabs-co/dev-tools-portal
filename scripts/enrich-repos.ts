/**
 * Enrich company JSON files with GitHub repo and npm package fields.
 * Searches GitHub and npm registries by company name/domain, applies
 * confidence heuristics, and writes back only high-confidence matches.
 *
 * Usage: npx tsx scripts/enrich-repos.ts
 *
 * Env:
 *   GITHUB_TOKEN — optional, raises rate limit from 10 to 5000 req/hr
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ── Config ──────────────────────────────────────────────────────────────────

const COMPANIES_DIR = join(process.cwd(), 'data/companies');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MIN_STARS = 50;
const GITHUB_DELAY_MS = 500;
const NPM_DELAY_MS = 200;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ghHeaders: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'dev-tools-portal',
};
if (GITHUB_TOKEN) {
  ghHeaders['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
}

interface CompanyData {
  name: string;
  slug: string;
  website?: string;
  github?: {
    repo?: string;
    [key: string]: unknown;
  };
  npm?: {
    package?: string;
    [key: string]: unknown;
  };
  updated_at?: string;
  [key: string]: unknown;
}

/** Extract domain name without TLD from a URL, e.g. "https://supabase.com" → "supabase" */
function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname; // "supabase.com"
    const parts = hostname.replace(/^www\./, '').split('.');
    // Return first part (before TLD)
    return parts[0] || null;
  } catch {
    return null;
  }
}

/** Normalize a string for fuzzy comparison */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Simple similarity: longest common substring ratio */
function similarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;

  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return shorter / longer;
  }

  // Levenshtein-based similarity for short strings
  const len = Math.max(na.length, nb.length);
  const dist = levenshtein(na, nb);
  return 1 - dist / len;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── GitHub search ───────────────────────────────────────────────────────────

interface GHSearchResult {
  items: Array<{
    full_name: string; // "owner/repo"
    name: string;
    owner: { login: string };
    stargazers_count: number;
    description: string | null;
  }>;
}

async function searchGitHubRepo(
  companyName: string,
  domain: string | null
): Promise<string | null> {
  const query = encodeURIComponent(`${companyName} in:name`);
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&per_page=3`;

  const res = await fetch(url, { headers: ghHeaders });
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      console.log(`  ⚠ GitHub rate limited (${res.status}), pausing 60s...`);
      await sleep(60_000);
      return null;
    }
    console.log(`  ⚠ GitHub search error: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as GHSearchResult;
  if (!data.items || data.items.length === 0) return null;

  const normName = norm(companyName);
  const normDomain = domain ? norm(domain) : null;

  // Score each result
  let bestRepo: string | null = null;
  let bestScore = 0;

  for (const item of data.items) {
    if (item.stargazers_count < MIN_STARS) continue;

    let score = 0;
    const orgName = norm(item.owner.login);
    const repoName = norm(item.name);

    // Org name matches domain — strongest signal
    if (normDomain && orgName === normDomain) {
      score += 5;
    }

    // Org name matches company name
    if (similarity(orgName, normName) > 0.8) {
      score += 4;
    }

    // Repo name matches company name
    if (similarity(repoName, normName) > 0.8) {
      score += 3;
    }

    // Repo name contains company name
    if (repoName.includes(normName) || normName.includes(repoName)) {
      score += 2;
    }

    // Stars bonus (log scale)
    score += Math.min(Math.log10(item.stargazers_count) / 5, 1);

    if (score > bestScore) {
      bestScore = score;
      bestRepo = item.full_name;
    }
  }

  // Require a minimum confidence score
  if (bestScore < 2) return null;

  return bestRepo;
}

// ── npm search ──────────────────────────────────────────────────────────────

interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string;
      scope: string;
      version: string;
      description: string;
      links: { npm: string; homepage?: string };
    };
    score: {
      final: number;
      detail: { quality: number; popularity: number; maintenance: number };
    };
  }>;
}

async function searchNpmPackage(companyName: string): Promise<string | null> {
  const query = encodeURIComponent(companyName);
  const url = `https://registry.npmjs.org/-/v1/search?text=${query}&size=3`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'dev-tools-portal' },
  });
  if (!res.ok) {
    console.log(`  ⚠ npm search error: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as NpmSearchResult;
  if (!data.objects || data.objects.length === 0) return null;

  const normName = norm(companyName);

  let bestPkg: string | null = null;
  let bestScore = 0;

  for (const obj of data.objects) {
    const pkgName = obj.package.name;
    const normPkg = norm(pkgName.replace(/^@[^/]+\//, '')); // strip scope for comparison
    const popularity = obj.score?.detail?.popularity ?? 0;

    let score = 0;

    // Exact name match (strongest)
    if (normPkg === normName) {
      score += 5;
    } else if (similarity(normPkg, normName) > 0.8) {
      score += 3;
    } else if (normPkg.includes(normName) || normName.includes(normPkg)) {
      score += 2;
    }

    // Scoped package where scope matches company name
    if (pkgName.startsWith('@')) {
      const scope = norm(pkgName.split('/')[0].slice(1));
      if (scope === normName) {
        score += 3;
      }
    }

    // Popularity bonus
    score += popularity * 2;

    if (score > bestScore) {
      bestScore = score;
      bestPkg = pkgName;
    }
  }

  // Require minimum confidence
  if (bestScore < 2) return null;

  return bestPkg;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} company files\n`);

  if (GITHUB_TOKEN) {
    console.log('Using authenticated GitHub requests (5000 req/hr)\n');
  } else {
    console.log('⚠ No GITHUB_TOKEN set — limited to 10 req/hr. Set GITHUB_TOKEN for better results.\n');
  }

  let ghFound = 0;
  let ghSkipped = 0;
  let ghMissed = 0;
  let npmFound = 0;
  let npmSkipped = 0;
  let npmMissed = 0;
  let filesUpdated = 0;

  for (const file of files) {
    const filePath = join(COMPANIES_DIR, file);
    const raw = readFileSync(filePath, 'utf-8');
    const company: CompanyData = JSON.parse(raw);
    let dirty = false;

    const domain = company.website ? extractDomain(company.website) : null;

    // ── GitHub ────────────────────────────────────────────────────────
    if (company.github?.repo) {
      ghSkipped++;
    } else {
      await sleep(GITHUB_DELAY_MS);
      try {
        const repo = await searchGitHubRepo(company.name, domain);
        if (repo) {
          if (!company.github) company.github = {};
          company.github.repo = repo;
          console.log(`✓ ${company.name}: found repo ${repo}`);
          ghFound++;
          dirty = true;
        } else {
          console.log(`✗ ${company.name}: no GitHub match`);
          ghMissed++;
        }
      } catch (err: any) {
        console.log(`✗ ${company.name}: GitHub error — ${err.message}`);
        ghMissed++;
      }
    }

    // ── npm ───────────────────────────────────────────────────────────
    if (company.npm?.package) {
      npmSkipped++;
    } else {
      await sleep(NPM_DELAY_MS);
      try {
        const pkg = await searchNpmPackage(company.name);
        if (pkg) {
          if (!company.npm) company.npm = {};
          company.npm.package = pkg;
          console.log(`✓ ${company.name}: found npm ${pkg}`);
          npmFound++;
          dirty = true;
        } else {
          console.log(`✗ ${company.name}: no npm match`);
          npmMissed++;
        }
      } catch (err: any) {
        console.log(`✗ ${company.name}: npm error — ${err.message}`);
        npmMissed++;
      }
    }

    // ── Save ──────────────────────────────────────────────────────────
    if (dirty) {
      company.updated_at = new Date().toISOString();
      writeFileSync(filePath, JSON.stringify(company, null, 2) + '\n', 'utf-8');
      filesUpdated++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50));
  console.log('ENRICHMENT SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Total companies:   ${files.length}`);
  console.log();
  console.log(`GitHub repos:`);
  console.log(`  Found:           ${ghFound}`);
  console.log(`  Already set:     ${ghSkipped}`);
  console.log(`  No match:        ${ghMissed}`);
  console.log();
  console.log(`npm packages:`);
  console.log(`  Found:           ${npmFound}`);
  console.log(`  Already set:     ${npmSkipped}`);
  console.log(`  No match:        ${npmMissed}`);
  console.log();
  console.log(`Files updated:     ${filesUpdated}`);
  console.log('═'.repeat(50));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
