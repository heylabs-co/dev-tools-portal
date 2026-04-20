/**
 * Enrich data/mcp-servers/*.json with install_command or npm_package
 * by fetching package.json / pyproject.toml from their GitHub repos.
 *
 * Usage: npx tsx scripts/enrich-mcp-installs.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIR = 'data/mcp-servers';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // optional
const RATE_LIMIT_MS = 300;

const headers: Record<string, string> = { 'User-Agent': 'tool.news-enricher' };
if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// Normalize repo string — accept "owner/repo" or full URL.
function normRepo(raw: string): string | null {
  if (!raw) return null;
  let r = raw.trim();
  if (r.startsWith('http')) {
    const m = r.match(/github\.com\/([^\/]+\/[^\/\?#]+)/);
    if (!m) return null;
    r = m[1];
  }
  return r.replace(/\.git$/, '').replace(/\/$/, '');
}

async function fetchRaw(repo: string, branch: string, path: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  try {
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function getPackageJson(repo: string): Promise<any | null> {
  for (const br of ['main', 'master']) {
    const txt = await fetchRaw(repo, br, 'package.json');
    if (txt) {
      try { return JSON.parse(txt); } catch { /* ignore */ }
    }
  }
  return null;
}

async function getPyproject(repo: string): Promise<string | null> {
  for (const br of ['main', 'master']) {
    const txt = await fetchRaw(repo, br, 'pyproject.toml');
    if (txt) return txt;
  }
  return null;
}

function parsePyprojectName(toml: string): string | null {
  // naive — find [project] section and name
  const proj = toml.match(/\[project\][\s\S]*?(?=\n\[|\n*$)/);
  if (!proj) return null;
  const m = proj[0].match(/^\s*name\s*=\s*["']([^"']+)["']/m);
  return m?.[1] ?? null;
}

async function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
  let processed = 0, enriched = 0, skipped = 0, notFound = 0;

  for (const f of files) {
    processed++;
    const fp = join(DIR, f);
    const d = JSON.parse(readFileSync(fp, 'utf-8'));

    // Skip if already has install_command or npm_package
    if (d.install_command || d.npm_package) { skipped++; continue; }

    const repo = normRepo(d.github_repo || '');
    if (!repo) { notFound++; continue; }

    process.stdout.write(`[${processed}/${files.length}] ${d.slug} (${repo})... `);

    let wrote = false;
    const pkg = await getPackageJson(repo);
    await sleep(RATE_LIMIT_MS);
    if (pkg?.name) {
      d.npm_package = pkg.name;
      wrote = true;
      console.log(`npm=${pkg.name}`);
    } else {
      const toml = await getPyproject(repo);
      await sleep(RATE_LIMIT_MS);
      const pyname = toml ? parsePyprojectName(toml) : null;
      if (pyname) {
        d.install_command = `uvx ${pyname}`;
        wrote = true;
        console.log(`py=${pyname}`);
      } else {
        console.log('no package.json or pyproject.toml');
        notFound++;
      }
    }

    if (wrote) {
      writeFileSync(fp, JSON.stringify(d, null, 2) + '\n');
      enriched++;
    }
  }

  console.log(`\nDone. Total: ${processed}, Enriched: ${enriched}, Already OK: ${skipped}, Not found: ${notFound}`);
}

main();
