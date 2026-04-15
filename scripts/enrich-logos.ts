/**
 * Enrich company logos by checking Clearbit URLs and falling back to
 * GitHub avatars, Google favicons, or DuckDuckGo favicons.
 *
 * Usage: npx tsx scripts/enrich-logos.ts
 *
 * Requires Node 22+ (built-in fetch).
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ── Config ──────────────────────────────────────────────────────────────────

const COMPANIES_DIR = join(process.cwd(), 'data/companies');
const DELAY_MS = 200;
const TIMEOUT_MS = 5_000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** HEAD request — returns true if HTTP 200 */
async function urlWorks(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Extract domain from a website URL (e.g. "https://stripe.com" -> "stripe.com") */
function extractDomain(website: string): string | null {
  try {
    return new URL(website).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Extract GitHub org from repo field (e.g. "stripe/stripe-node" -> "stripe") */
function extractGitHubOrg(repo: string): string {
  return repo.split('/')[0];
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} company files\n`);

  let updated = 0;
  let kept = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = join(COMPANIES_DIR, file);
    const company = JSON.parse(readFileSync(filePath, 'utf-8'));
    const name = company.name || file;
    const currentLogo: string | undefined = company.logo;
    const domain = company.website ? extractDomain(company.website) : null;
    const githubOrg = company.github?.repo
      ? extractGitHubOrg(company.github.repo)
      : null;

    const progress = `[${i + 1}/${files.length}]`;

    // ── Step 1: Check if current Clearbit logo works ──────────────────────
    const isClearbit = currentLogo?.includes('logo.clearbit.com');
    let clearbitOk = false;

    if (currentLogo && isClearbit) {
      clearbitOk = await urlWorks(currentLogo);
      await sleep(DELAY_MS);
    }

    if (clearbitOk) {
      // ── Step 3: Even if Clearbit works, prefer GitHub avatar for dev tools
      if (githubOrg) {
        const ghUrl = `https://github.com/${githubOrg}.png?size=128`;
        const ghOk = await urlWorks(ghUrl);
        await sleep(DELAY_MS);

        if (ghOk) {
          company.logo = ghUrl;
          writeFileSync(filePath, JSON.stringify(company, null, 2) + '\n');
          console.log(`${progress} ${name}: upgraded to GitHub avatar`);
          updated++;
          continue;
        }
      }

      console.log(`${progress} ${name}: Clearbit OK`);
      kept++;
      continue;
    }

    // ── Step 2: Clearbit failed — try alternatives in order ───────────────
    if (!isClearbit && currentLogo) {
      // Logo is already a non-Clearbit URL, check if it works
      const ok = await urlWorks(currentLogo);
      await sleep(DELAY_MS);
      if (ok) {
        console.log(`${progress} ${name}: existing non-Clearbit logo OK`);
        kept++;
        continue;
      }
    }

    // Try GitHub avatar
    if (githubOrg) {
      const ghUrl = `https://github.com/${githubOrg}.png?size=128`;
      const ghOk = await urlWorks(ghUrl);
      await sleep(DELAY_MS);

      if (ghOk) {
        company.logo = ghUrl;
        writeFileSync(filePath, JSON.stringify(company, null, 2) + '\n');
        console.log(`${progress} ${name}: -> GitHub avatar`);
        updated++;
        continue;
      }
    }

    // Try Google Favicon
    if (domain) {
      const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
      const googleOk = await urlWorks(googleUrl);
      await sleep(DELAY_MS);

      if (googleOk) {
        company.logo = googleUrl;
        writeFileSync(filePath, JSON.stringify(company, null, 2) + '\n');
        console.log(`${progress} ${name}: -> Google favicon`);
        updated++;
        continue;
      }
    }

    // Try DuckDuckGo favicon
    if (domain) {
      const ddgUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
      const ddgOk = await urlWorks(ddgUrl);
      await sleep(DELAY_MS);

      if (ddgOk) {
        company.logo = ddgUrl;
        writeFileSync(filePath, JSON.stringify(company, null, 2) + '\n');
        console.log(`${progress} ${name}: -> DuckDuckGo favicon`);
        updated++;
        continue;
      }
    }

    // Nothing worked
    console.log(`${progress} ${name}: FAILED — no working logo found`);
    failed++;
  }

  console.log('\n── Summary ──────────────────────────────────────');
  console.log(`Updated ${updated} logos, kept ${kept}, failed ${failed}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
