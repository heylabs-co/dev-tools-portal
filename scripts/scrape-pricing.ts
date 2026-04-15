/**
 * Scrape pricing pages for companies without pricing data.
 *
 * Reads all company JSONs, filters to those without pricing info,
 * fetches their pricing page, extracts pricing signals from HTML,
 * and updates the JSON files.
 *
 * Usage: npx tsx scripts/scrape-pricing.ts
 *
 * No external dependencies — uses Node 22 built-in fetch.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(process.cwd(), 'data/companies');
const USER_AGENT = 'DevToolsPortal/1.0 (https://dev-tools-portal.pages.dev)';
const REQUEST_TIMEOUT = 10_000;
const RATE_LIMIT_MS = 500;
const TODAY = '2026-04-15';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PricingData {
  model: 'subscription' | 'usage' | 'freemium' | 'seat' | 'unknown';
  has_free_tier: boolean;
  free_tier_limits: string | undefined;
  entry_price: string | undefined;
  enterprise_available: boolean;
  pricing_url: string;
  transparency_score: number; // 1-5
  last_checked: string;
}

interface CompanyJSON {
  name: string;
  website: string;
  pricing?: { model?: string; [k: string]: unknown };
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hasPricingData(company: CompanyJSON): boolean {
  return !!(company.pricing && company.pricing.model);
}

/** Try to fetch a URL with timeout; returns body text or null. */
async function safeFetch(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (res.ok) return await res.text();
    return null;
  } catch {
    return null;
  }
}

/** Attempt to fetch the pricing page from several URL patterns. */
async function fetchPricingPage(
  website: string,
): Promise<{ html: string; url: string } | null> {
  // Normalise: strip trailing slash
  const base = website.replace(/\/+$/, '');
  const candidates = [`${base}/pricing`, `${base}/pricing/`, `${base}/#pricing`];

  for (const url of candidates) {
    const html = await safeFetch(url);
    if (html && html.length > 500) {
      return { html, url };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pricing extraction
// ---------------------------------------------------------------------------

function extractPricing(html: string, pricingUrl: string): PricingData {
  // Lower-case for keyword matching; keep original for price extraction.
  const lower = html.toLowerCase();

  // --- Pricing model ---
  const model = determinePricingModel(lower);

  // --- Free tier ---
  const hasFreeTier = detectFreeTier(lower);
  const freeTierLimits = hasFreeTier ? extractFreeTierLimits(lower) : undefined;

  // --- Entry price ---
  const entryPrice = extractEntryPrice(html);

  // --- Enterprise ---
  const enterpriseAvailable = detectEnterprise(lower);

  // --- Transparency score ---
  const transparencyScore = computeTransparencyScore({
    hasPricesOnPage: /\$\d/.test(html) || /€\d/.test(html),
    hasFreeTier,
    enterpriseAvailable,
    entryPrice,
    model,
  });

  return {
    model,
    has_free_tier: hasFreeTier,
    free_tier_limits: freeTierLimits,
    entry_price: entryPrice,
    enterprise_available: enterpriseAvailable,
    pricing_url: pricingUrl,
    transparency_score: transparencyScore,
    last_checked: TODAY,
  };
}

function determinePricingModel(
  lower: string,
): PricingData['model'] {
  // Order matters — more specific first.
  const seatSignals = ['per user', 'per seat', '/user', '/seat', 'per member'];
  const usageSignals = [
    'pay as you go',
    'usage-based',
    'usage based',
    'per request',
    'per api call',
    'metered',
    'per transaction',
    'per event',
  ];
  const freemiumSignals = [
    'free forever',
    'free plan',
    'free tier',
    'open source',
    'open-source',
    'free for',
    'hobby plan',
    '$0',
  ];
  const subscriptionSignals = [
    '/mo',
    '/month',
    '/yr',
    '/year',
    'per month',
    'per year',
    'billed monthly',
    'billed annually',
    'monthly',
    'annual',
  ];

  const score = (signals: string[]) =>
    signals.reduce((n, s) => n + (lower.includes(s) ? 1 : 0), 0);

  const scores: [PricingData['model'], number][] = [
    ['seat', score(seatSignals)],
    ['usage', score(usageSignals)],
    ['freemium', score(freemiumSignals)],
    ['subscription', score(subscriptionSignals)],
  ];

  // If a model has seat + subscription signals, prefer seat.
  scores.sort((a, b) => b[1] - a[1]);
  const best = scores[0];
  return best[1] > 0 ? best[0] : 'unknown';
}

function detectFreeTier(lower: string): boolean {
  const signals = [
    'free plan',
    'free tier',
    'free forever',
    '$0',
    'starter free',
    'open source',
    'open-source',
    'free for developers',
    'free to use',
    'free for personal',
    'hobby',
    'get started for free',
    'start for free',
    'free version',
  ];
  return signals.some((s) => lower.includes(s));
}

function extractFreeTierLimits(lower: string): string | undefined {
  // Try to grab the line/sentence around "free" that mentions limits.
  const patterns = [
    /free\s+(?:plan|tier)[^.]*?(?:up to|includes?|limit(?:ed)?)[^.]{5,80}/i,
    /(?:up to|includes?)\s+\d[^.]{3,60}free/i,
    /free[^.]{0,20}\d+[^.]{3,60}/i,
  ];
  for (const re of patterns) {
    const m = lower.match(re);
    if (m) return m[0].trim().slice(0, 120);
  }
  return undefined;
}

function extractEntryPrice(html: string): string | undefined {
  // Match patterns like $5/mo, $29/month, $9.99/user/mo, $0, €19/mo
  const patterns = [
    /[\$€]\d{1,6}(?:\.\d{1,2})?(?:\s*\/\s*(?:mo(?:nth)?|yr|year|user(?:\s*\/\s*mo(?:nth)?)?|seat(?:\s*\/\s*mo(?:nth)?)?|month))/i,
    /[\$€]\d{1,6}(?:\.\d{1,2})?\s*(?:per\s+(?:month|user|seat|year))/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[0].trim();
  }
  // Fall back: first dollar/euro amount on the page
  const fallback = html.match(/[\$€]\d{1,6}(?:\.\d{1,2})?/);
  if (fallback) return fallback[0].trim();
  return undefined;
}

function detectEnterprise(lower: string): boolean {
  const signals = [
    'enterprise',
    'contact sales',
    'contact us',
    'custom pricing',
    'talk to sales',
    'get a quote',
    'request a demo',
    'custom plan',
  ];
  return signals.some((s) => lower.includes(s));
}

function computeTransparencyScore(info: {
  hasPricesOnPage: boolean;
  hasFreeTier: boolean;
  enterpriseAvailable: boolean;
  entryPrice: string | undefined;
  model: string;
}): number {
  let score = 1; // base: we found a pricing page
  if (info.hasPricesOnPage) score += 1;
  if (info.entryPrice) score += 1;
  if (info.hasFreeTier) score += 1;
  if (info.model !== 'unknown') score += 1;
  return Math.min(score, 5);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} company files.`);

  const toProcess: { file: string; data: CompanyJSON }[] = [];

  for (const file of files) {
    const raw = readFileSync(join(COMPANIES_DIR, file), 'utf-8');
    const data: CompanyJSON = JSON.parse(raw);
    if (hasPricingData(data)) continue;
    if (!data.website) continue;
    toProcess.push({ file, data });
  }

  console.log(`${toProcess.length} companies without pricing data.\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const { file, data } of toProcess) {
    try {
      const result = await fetchPricingPage(data.website);

      if (!result) {
        console.log(`✗ No pricing page for ${data.name}`);
        skipped++;
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      const pricing = extractPricing(result.html, result.url);
      data.pricing = pricing as unknown as CompanyJSON['pricing'];

      // Write back
      const filePath = join(COMPANIES_DIR, file);
      writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');

      console.log(`✓ Found pricing for ${data.name} (${pricing.model})`);
      updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`⚠ Error for ${data.name}: ${msg}`);
      errors++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log(
    `\nDone. Updated ${updated} companies, skipped ${skipped}, errors ${errors}.`,
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
