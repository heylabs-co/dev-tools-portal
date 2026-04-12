/**
 * Fetch npm weekly download counts and latest version for companies with npm.package.
 *
 * Usage: npx tsx scripts/fetch-npm.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(process.cwd(), 'data/companies');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CompanyData {
  name: string;
  npm?: {
    package?: string;
    weekly_downloads?: number;
    latest_version?: string;
    [key: string]: unknown;
  };
  updated_at?: string;
  [key: string]: unknown;
}

async function fetchWeeklyDownloads(pkg: string): Promise<number> {
  const res = await fetch(
    `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(pkg)}`
  );
  if (!res.ok) throw new Error(`Downloads API ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as { downloads: number };
  return data.downloads;
}

async function fetchLatestVersion(pkg: string): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`);
  if (!res.ok) throw new Error(`Registry API ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as { version: string };
  return data.version;
}

async function main() {
  const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} company files`);

  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = join(COMPANIES_DIR, file);
    const data: CompanyData = JSON.parse(readFileSync(filePath, 'utf-8'));

    if (!data.npm?.package) {
      skipped++;
      continue;
    }

    const pkg = data.npm.package;

    try {
      const [downloads, version] = await Promise.all([
        fetchWeeklyDownloads(pkg),
        fetchLatestVersion(pkg),
      ]);

      // Only write if something changed
      if (
        data.npm.weekly_downloads !== downloads ||
        data.npm.latest_version !== version
      ) {
        data.npm.weekly_downloads = downloads;
        data.npm.latest_version = version;
        data.updated_at = new Date().toISOString();
        writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
        updated++;
        console.log(`Updated ${data.name} — ${pkg}@${version} (${downloads.toLocaleString()} downloads/week)`);
      } else {
        console.log(`Unchanged ${data.name} — ${pkg}@${version}`);
      }
    } catch (err: any) {
      console.error(`Error fetching ${data.name} (${pkg}): ${err.message}`);
    }

    await sleep(100);
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (no package): ${skipped}`);
}

main();
