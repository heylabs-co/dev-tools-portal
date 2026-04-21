/**
 * Download company logos → public/logos/<slug>.webp (128x128, quality 85).
 *
 * Fallback chain per company:
 *   1. existing logo URL from JSON (Clearbit/Google/GitHub/DDG)
 *   2. https://logo.clearbit.com/<domain>
 *   3. https://www.google.com/s2/favicons?domain=<domain>&sz=128
 *   4. https://github.com/<org>.png?size=128
 *   5. Placeholder SVG (first letter of name on accent bg)
 *
 * Idempotent: skips slugs whose WebP file already exists.
 * After download, rewrites data/companies/*.json → logo: "/logos/<slug>.webp".
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const ROOT = process.cwd();
const COMP = join(ROOT, 'data/companies');
const LOGOS = join(ROOT, 'public/logos');
if (!existsSync(LOGOS)) mkdirSync(LOGOS, { recursive: true });

const CONCURRENCY = 20;
const TIMEOUT_MS = 12000;

type Candidate = { url: string; source: string };

function sourceOf(url: string): string {
  if (url.includes('clearbit.com')) return 'clearbit';
  if (url.includes('google.com/s2')) return 'google';
  if (url.includes('github.com')) return 'github';
  if (url.includes('duckduckgo.com')) return 'duckduckgo';
  return 'custom';
}

function domainFrom(website?: string): string | null {
  if (!website) return null;
  try {
    const raw = website.startsWith('http') ? website : 'https://' + website;
    return new URL(raw).host.replace(/^www\./, '');
  } catch { return null; }
}

function githubOrg(repo?: string): string | null {
  if (!repo) return null;
  const m = repo.match(/^([^/]+)\/[^/]+/);
  return m ? m[1] : null;
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'toolnews-logo-fetch/1.0' },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/') && !ct.includes('svg')) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength < 64) return null;
    return Buffer.from(arr);
  } catch { return null; }
}

function placeholderSvg(name: string): Buffer {
  const letter = (name?.trim()[0] || '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="20" fill="#5E6AD2"/>
  <text x="64" y="82" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="56" font-weight="700" fill="#fff">${letter.replace(/[<&>]/g, '')}</text>
</svg>`;
  return Buffer.from(svg);
}

type Result = { slug: string; status: 'ok' | 'placeholder' | 'fail'; source: string };

async function processOne(d: any): Promise<Result> {
  const slug = d.slug;
  const name = d.name || slug;
  const dest = join(LOGOS, `${slug}.webp`);

  if (existsSync(dest)) return { slug, status: 'ok', source: 'cached' };

  const candidates: Candidate[] = [];
  if (d.logo && /^https?:/.test(d.logo)) candidates.push({ url: d.logo, source: sourceOf(d.logo) });
  const domain = domainFrom(d.website);
  if (domain) {
    candidates.push({ url: `https://logo.clearbit.com/${domain}`, source: 'clearbit' });
    candidates.push({ url: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`, source: 'google' });
  }
  const org = githubOrg(d.github?.repo);
  if (org) candidates.push({ url: `https://github.com/${org}.png?size=128`, source: 'github' });

  for (const c of candidates) {
    const buf = await fetchBytes(c.url);
    if (!buf) continue;
    try {
      await sharp(buf)
        .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 85 })
        .toFile(dest);
      return { slug, status: 'ok', source: c.source };
    } catch {
      continue;
    }
  }

  try {
    await sharp(placeholderSvg(name), { density: 150 })
      .resize(128, 128)
      .webp({ quality: 85 })
      .toFile(dest);
    return { slug, status: 'placeholder', source: 'placeholder' };
  } catch {
    return { slug, status: 'fail', source: 'none' };
  }
}

async function runPool<T, R>(items: T[], worker: (x: T) => Promise<R>, n: number, onProgress?: (d: number, t: number) => void): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0, done = 0;
  async function runOne() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await worker(items[i]);
      done++;
      if (onProgress && done % 50 === 0) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: n }, runOne));
  return results;
}

async function main() {
  const files = readdirSync(COMP).filter((f) => f.endsWith('.json'));
  const companies = files.map((f) => ({ file: f, data: JSON.parse(readFileSync(join(COMP, f), 'utf-8')) }));

  console.log(`Downloading logos for ${companies.length} companies (concurrency=${CONCURRENCY})…`);
  const t0 = Date.now();

  const results = await runPool(
    companies,
    async (c) => ({ ...c, result: await processOne(c.data) }),
    CONCURRENCY,
    (d, t) => console.log(`  ${d}/${t}`),
  );

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${dt}s\n`);

  const stats: Record<string, number> = {};
  for (const { result } of results) stats[result.source] = (stats[result.source] || 0) + 1;
  for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  let updated = 0;
  for (const { file, data, result } of results) {
    if (result.status === 'fail') continue;
    const newLogo = `/logos/${data.slug}.webp`;
    if (data.logo !== newLogo || data.logo_source !== result.source) {
      data.logo = newLogo;
      data.logo_source = result.source;
      writeFileSync(join(COMP, file), JSON.stringify(data, null, 2) + '\n');
      updated++;
    }
  }
  console.log(`\nUpdated ${updated} JSON files`);
}

main();
