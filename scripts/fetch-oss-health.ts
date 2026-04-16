/**
 * Fetch OSS health metrics for companies with a github.repo field.
 * Calculates bus factor, release frequency, issue response time, and health score.
 *
 * Usage: npx tsx scripts/fetch-oss-health.ts
 * Requires GITHUB_TOKEN env var for higher rate limits.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(process.cwd(), 'data/companies');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MAX_COMPANIES = 100;
const RATE_LIMIT_MS = 500;

const headers: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'dev-tools-portal',
};
if (GITHUB_TOKEN) {
  headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface HealthData {
  bus_factor?: number;
  last_commit_days_ago?: number;
  release_frequency_days?: number;
  open_issues?: number;
  issue_close_days?: number;
  license?: string;
  stars?: number;
  forks?: number;
  health_score?: string;
  updated_at?: string;
}

interface CompanyData {
  name: string;
  github?: {
    repo?: string;
    [key: string]: unknown;
  };
  health?: HealthData;
  [key: string]: unknown;
}

async function ghFetch(url: string): Promise<Response> {
  const res = await fetch(url, { headers });
  if (!res.ok && res.status !== 404) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} for ${url}`);
  }
  return res;
}

async function fetchRepoData(repo: string) {
  const res = await ghFetch(`https://api.github.com/repos/${repo}`);
  if (res.status === 404) return null;
  return (await res.json()) as {
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    license: { spdx_id: string } | null;
    created_at: string;
    pushed_at: string;
    description: string | null;
  };
}

async function fetchBusFactor(repo: string): Promise<number> {
  const res = await ghFetch(
    `https://api.github.com/repos/${repo}/contributors?per_page=10`
  );
  if (res.status === 404) return 0;
  const contributors = (await res.json()) as { contributions: number }[];
  if (!Array.isArray(contributors)) return 0;
  return contributors.filter((c) => c.contributions > 10).length;
}

async function fetchReleaseFrequency(repo: string): Promise<number | undefined> {
  const res = await ghFetch(
    `https://api.github.com/repos/${repo}/releases?per_page=5`
  );
  if (res.status === 404) return undefined;
  const releases = (await res.json()) as { published_at: string }[];
  if (!Array.isArray(releases) || releases.length < 2) return undefined;

  const dates = releases
    .filter((r) => r.published_at)
    .map((r) => new Date(r.published_at).getTime())
    .sort((a, b) => b - a);

  if (dates.length < 2) return undefined;

  let totalDays = 0;
  for (let i = 0; i < dates.length - 1; i++) {
    totalDays += (dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24);
  }
  return Math.round(totalDays / (dates.length - 1));
}

async function fetchIssueCloseTime(repo: string): Promise<number | undefined> {
  const res = await ghFetch(
    `https://api.github.com/repos/${repo}/issues?state=closed&per_page=5`
  );
  if (res.status === 404) return undefined;
  const issues = (await res.json()) as {
    created_at: string;
    closed_at: string;
    pull_request?: unknown;
  }[];
  if (!Array.isArray(issues)) return undefined;

  // Filter out pull requests (they also appear in issues endpoint)
  const realIssues = issues.filter((i) => !i.pull_request && i.closed_at);
  if (realIssues.length === 0) return undefined;

  let totalDays = 0;
  for (const issue of realIssues) {
    const created = new Date(issue.created_at).getTime();
    const closed = new Date(issue.closed_at).getTime();
    totalDays += (closed - created) / (1000 * 60 * 60 * 24);
  }
  return Math.round(totalDays / realIssues.length);
}

function detectFundingStatus(description: string | null): string | undefined {
  if (!description) return undefined;
  const lower = description.toLowerCase();
  const patterns = ['yc', 'y combinator', 'series a', 'series b', 'series c', 'series d', 'series e', 'series f', 'seed', 'funded', 'backed by'];
  for (const p of patterns) {
    if (lower.includes(p)) return p;
  }
  return undefined;
}

function calculateHealthScore(health: HealthData): string {
  const { bus_factor, last_commit_days_ago, license, stars } = health;

  // F: no activity > 180 days
  if (last_commit_days_ago !== undefined && last_commit_days_ago > 180) return 'F';

  // D: bus_factor 1, or last_commit > 90 days
  if (
    (last_commit_days_ago !== undefined && last_commit_days_ago > 90) ||
    (bus_factor !== undefined && bus_factor <= 1)
  ) {
    return 'D';
  }

  // A: bus_factor >= 10, last_commit < 7 days, has license, stars > 1000
  if (
    bus_factor !== undefined && bus_factor >= 10 &&
    last_commit_days_ago !== undefined && last_commit_days_ago < 7 &&
    license &&
    stars !== undefined && stars > 1000
  ) {
    return 'A';
  }

  // B: bus_factor >= 5, last_commit < 30 days, has license
  if (
    bus_factor !== undefined && bus_factor >= 5 &&
    last_commit_days_ago !== undefined && last_commit_days_ago < 30 &&
    license
  ) {
    return 'B';
  }

  // C: bus_factor >= 2, last_commit < 90 days
  if (
    bus_factor !== undefined && bus_factor >= 2 &&
    last_commit_days_ago !== undefined && last_commit_days_ago < 90
  ) {
    return 'C';
  }

  return 'C';
}

async function main() {
  const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} company files`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    if (processed >= MAX_COMPANIES) break;

    const filePath = join(COMPANIES_DIR, file);
    const data: CompanyData = JSON.parse(readFileSync(filePath, 'utf-8'));

    if (!data.github?.repo) {
      skipped++;
      continue;
    }

    const repo = data.github.repo;
    processed++;

    try {
      console.log(`[${processed}/${MAX_COMPANIES}] Fetching ${data.name} (${repo})...`);

      // Fetch repo data first
      const repoData = await fetchRepoData(repo);
      await sleep(RATE_LIMIT_MS);

      if (!repoData) {
        console.log(`  Repo not found, skipping`);
        errors++;
        continue;
      }

      // Fetch bus factor
      const busFactor = await fetchBusFactor(repo);
      await sleep(RATE_LIMIT_MS);

      // Fetch release frequency
      const releaseFreq = await fetchReleaseFrequency(repo);
      await sleep(RATE_LIMIT_MS);

      // Fetch issue close time
      const issueClose = await fetchIssueCloseTime(repo);
      await sleep(RATE_LIMIT_MS);

      // Calculate days since last commit
      const now = Date.now();
      const pushedAt = new Date(repoData.pushed_at).getTime();
      const lastCommitDaysAgo = Math.round((now - pushedAt) / (1000 * 60 * 60 * 24));

      const health: HealthData = {
        bus_factor: busFactor,
        last_commit_days_ago: lastCommitDaysAgo,
        release_frequency_days: releaseFreq,
        open_issues: repoData.open_issues_count,
        issue_close_days: issueClose,
        license: repoData.license?.spdx_id ?? undefined,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        updated_at: new Date().toISOString().split('T')[0],
      };

      health.health_score = calculateHealthScore(health);

      data.health = health;
      writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');

      console.log(`  Score: ${health.health_score} | Stars: ${health.stars} | Bus: ${health.bus_factor} | Last commit: ${health.last_commit_days_ago}d`);
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Processed: ${processed}, Skipped (no repo): ${skipped}, Errors: ${errors}`);
}

main();
