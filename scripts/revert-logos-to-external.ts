/**
 * Emergency revert: point `logo` fields at external URLs so we can deploy
 * under Cloudflare Pages' 20k file limit. Uses logo_source (saved by the
 * download script) to pick the right external provider per company.
 *
 * github → https://github.com/<org>.png?size=128
 * duckduckgo → https://icons.duckduckgo.com/ip3/<domain>.ico
 * google / placeholder / anything else → https://www.google.com/s2/favicons
 *   (falls back to ui-avatars.com if no domain is known)
 *
 * This is a temporary fix — the permanent home is a Cloudflare R2 bucket.
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const COMP = join(process.cwd(), 'data/companies');

function domainOf(website: string | undefined): string | null {
  if (!website) return null;
  try {
    const raw = website.startsWith('http') ? website : 'https://' + website;
    return new URL(raw).host.replace(/^www\./, '');
  } catch { return null; }
}

function githubOrg(repo: string | undefined): string | null {
  if (!repo) return null;
  const m = repo.match(/^([^/]+)\/[^/]+/);
  return m ? m[1] : null;
}

function pickUrl(d: any): string {
  const source = d.logo_source || 'google';
  const domain = domainOf(d.website);
  const org = githubOrg(d.github && d.github.repo);

  const name = encodeURIComponent(d.name || d.slug || '?');
  const placeholder = `https://ui-avatars.com/api/?name=${name}&size=128&background=5E6AD2&color=fff&bold=true`;

  if (source === 'github' && org) return `https://github.com/${org}.png?size=128`;
  if (source === 'duckduckgo' && domain) return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  if (source === 'placeholder') return placeholder;
  if (domain) return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  return placeholder;
}

const stats: Record<string, number> = {};
let updated = 0;

for (const f of readdirSync(COMP)) {
  if (!f.endsWith('.json')) continue;
  const fp = join(COMP, f);
  const d = JSON.parse(readFileSync(fp, 'utf-8'));
  const url = pickUrl(d);

  if (url.includes('github.com')) stats.github = (stats.github || 0) + 1;
  else if (url.includes('duckduckgo')) stats.duckduckgo = (stats.duckduckgo || 0) + 1;
  else if (url.includes('google.com')) stats.google = (stats.google || 0) + 1;
  else stats['ui-avatars'] = (stats['ui-avatars'] || 0) + 1;

  d.logo = url;
  delete d.logo_source;
  writeFileSync(fp, JSON.stringify(d, null, 2) + '\n');
  updated++;
}

console.log(`Updated ${updated} companies`);
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}
