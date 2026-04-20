/**
 * Fetch GitHub release data for companies with a github.repo field.
 * Updates stars, open issues, and latest release version.
 *
 * Usage: npx tsx scripts/fetch-github.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(process.cwd(), 'data/companies');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

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

interface CompanyData {
  name: string;
  github?: {
    repo?: string;
    stars?: number;
    open_issues?: number;
    latest_release?: string;
    release_date?: string;
    [key: string]: unknown;
  };
  updated_at?: string;
  [key: string]: unknown;
}

async function fetchRepoInfo(repo: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!res.ok) throw new Error(`Repo API ${res.status}: ${res.statusText}`);
  return (await res.json()) as { stargazers_count: number; open_issues_count: number };
}

async function fetchLatestRelease(repo: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (res.status === 404) return null; // No releases
  if (!res.ok) throw new Error(`Release API ${res.status}: ${res.statusText}`);
  return (await res.json()) as { tag_name: string; published_at: string };
}

async function main() {
  const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} company files`);

  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = join(COMPANIES_DIR, file);
    const data: CompanyData = JSON.parse(readFileSync(filePath, 'utf-8'));

    if (!data.github?.repo) {
      skipped++;
      continue;
    }

    const repo = data.github.repo;

    try {
      const [repoInfo, release] = await Promise.all([
        fetchRepoInfo(repo),
        fetchLatestRelease(repo),
      ]);

      const newVersion = release?.tag_name ?? null;
      const oldVersion = data.github.latest_release ?? null;

      // Only write if something changed
      if (
        data.github.stars !== repoInfo.stargazers_count ||
        data.github.open_issues !== repoInfo.open_issues_count ||
        oldVersion !== newVersion
      ) {
        data.github.stars = repoInfo.stargazers_count;
        data.github.open_issues = repoInfo.open_issues_count;
        if (release) {
          data.github.latest_release = release.tag_name;
          data.github.release_date = release.published_at;
        }
        data.updated_at = new Date().toISOString();
        writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
        updated++;
        console.log(`Updated ${data.name} — ${newVersion ?? 'no release'}`);
      } else {
        console.log(`Unchanged ${data.name} — ${oldVersion ?? 'no release'}`);
      }
    } catch (err: any) {
      console.error(`Error fetching ${data.name} (${repo}): ${err.message}`);
    }

    await sleep(100);
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (no repo): ${skipped}`);
}

main();
