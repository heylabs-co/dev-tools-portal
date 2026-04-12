/**
 * Generate top-100 comparison pairs from company data.
 * Strategy: For each category, take top companies (with most data) and pair them.
 *
 * Usage: npx tsx scripts/generate-comparisons.ts
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(process.cwd(), 'data/companies');
const COMPARISONS_DIR = join(process.cwd(), 'data/comparisons');

// Manually curated high-value pairs (highest search volume)
const CURATED_PAIRS: Array<[string, string]> = [
  ['stripe', 'adyen'],
  ['stripe', 'paddle'],
  ['stripe', 'square-block'],
  ['stripe', 'paypal-braintree'],
  ['adyen', 'checkout-com'],
  ['recurly', 'chargebee'],
  ['paddle', 'lemonsqueezy'],
  ['auth0-okta', 'clerk'],
  ['auth0-okta', 'workos'],
  ['clerk', 'stytch'],
  ['clerk', 'kinde'],
  ['firebase', 'supabase'],
  ['supabase', 'appwrite'],
  ['supabase', 'neon'],
  ['supabase', 'convex'],
  ['neon', 'planetscale'],
  ['mongodb-atlas', 'cockroachdb'],
  ['planetscale', 'cockroachdb'],
  ['cloudflare', 'fastly'],
  ['cloudflare', 'vercel'],
  ['vercel', 'netlify'],
  ['algolia', 'meilisearch'],
  ['algolia', 'typesense'],
  ['meilisearch', 'typesense'],
  ['twilio', 'vonage'],
  ['twilio', 'sinch'],
  ['sendgrid', 'resend'],
  ['resend', 'postmark'],
  ['onesignal', 'braze'],
  ['amplitude', 'mixpanel'],
  ['amplitude', 'posthog'],
  ['posthog', 'mixpanel'],
  ['posthog', 'heap'],
  ['adjust-applovin', 'appsflyer'],
  ['appsflyer', 'branch'],
  ['fullstory', 'hotjar'],
  ['logrocket', 'hotjar'],
  ['sentry', 'bugsnag'],
  ['sentry', 'crashlytics-firebase'],
  ['datadog', 'new-relic'],
  ['datadog', 'grafana-labs'],
  ['grafana-labs', 'elastic'],
  ['new-relic', 'dynatrace'],
  ['launchdarkly', 'statsig'],
  ['launchdarkly', 'flagsmith'],
  ['statsig', 'eppo'],
  ['optimizely', 'statsig'],
  ['github-actions', 'circleci'],
  ['circleci', 'bitrise'],
  ['browserstack', 'sauce-labs'],
  ['intercom', 'zendesk'],
  ['intercom', 'freshdesk'],
  ['braze', 'clevertap'],
  ['lokalise', 'phrase'],
  ['crowdin', 'lokalise'],
  ['snyk', 'sonarqube'],
  ['vanta', 'drata'],
  ['drata', 'sprinto'],
  ['fivetran', 'airbyte'],
  ['kong', 'postman'],
  ['openai-api', 'anthropic-api'],
  ['openai-api', 'google-ai-platform'],
  ['cursor', 'github-copilot'],
  ['cursor', 'windsurf'],
  ['applovin-max', 'google-admob'],
  ['revenuecat', 'adapty'],
  ['revenuecat', 'qonversion'],
  ['sensor-tower', 'apptweak'],
  ['ably', 'pusher'],
  ['pusher', 'pubnub'],
  ['retool', 'bubble'],
  ['retool', 'flutterflow'],
  ['mapbox', 'google-maps-platform'],
  ['cloudinary', 'imgix'],
  ['hashicorp-vault', 'doppler'],
  ['jumio', 'persona'],
];

function main() {
  if (!existsSync(COMPARISONS_DIR)) mkdirSync(COMPARISONS_DIR, { recursive: true });

  // Get all available company slugs
  const availableSlugs = new Set(
    readdirSync(COMPANIES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  );

  // Load company data for category-based pair generation
  const companiesByCategory: Record<string, Array<{ slug: string; hasEnrichment: boolean }>> = {};
  for (const file of readdirSync(COMPANIES_DIR).filter(f => f.endsWith('.json'))) {
    const company = JSON.parse(readFileSync(join(COMPANIES_DIR, file), 'utf-8'));
    const catSlug = company.categories.primary.slug;
    if (!companiesByCategory[catSlug]) companiesByCategory[catSlug] = [];
    companiesByCategory[catSlug].push({
      slug: company.slug,
      hasEnrichment: !!(company.pricing || company.scores?.lock_in || company.scale),
    });
  }

  // Build pairs: curated + auto-generated
  const pairs: Array<{ slug_a: string; slug_b: string; category: string }> = [];
  const pairSet = new Set<string>();

  const addPair = (a: string, b: string, cat: string) => {
    const key = [a, b].sort().join('|');
    if (pairSet.has(key)) return;
    if (!availableSlugs.has(a) || !availableSlugs.has(b)) return;
    pairSet.add(key);
    pairs.push({ slug_a: a, slug_b: b, category: cat });
  };

  // Add curated pairs first
  for (const [a, b] of CURATED_PAIRS) {
    // Figure out category from first company
    const catEntries = Object.entries(companiesByCategory);
    let cat = 'unknown';
    for (const [catSlug, companies] of catEntries) {
      if (companies.some(c => c.slug === a)) {
        cat = catSlug;
        break;
      }
    }
    addPair(a, b, cat);
  }

  // Auto-generate more pairs from enriched companies in each category
  for (const [catSlug, companies] of Object.entries(companiesByCategory)) {
    const enriched = companies.filter(c => c.hasEnrichment).slice(0, 5);
    for (let i = 0; i < enriched.length; i++) {
      for (let j = i + 1; j < enriched.length; j++) {
        addPair(enriched[i].slug, enriched[j].slug, catSlug);
      }
    }
    if (pairs.length >= 120) break; // enough
  }

  // Limit to 100
  const topPairs = pairs.slice(0, 100).map(p => ({
    ...p,
    pair_slug: `${p.slug_a}-vs-${p.slug_b}`,
    seo: {
      title: `${nameFromSlug(p.slug_a)} vs ${nameFromSlug(p.slug_b)} 2026: Pricing, Lock-in & Migration`,
      meta_description: `Side-by-side comparison of ${nameFromSlug(p.slug_a)} and ${nameFromSlug(p.slug_b)}: pricing, lock-in risk, developer experience, and total cost.`,
    },
  }));

  writeFileSync(
    join(COMPARISONS_DIR, 'top-pairs.json'),
    JSON.stringify(topPairs, null, 2) + '\n'
  );

  console.log(`Generated ${topPairs.length} comparison pairs.`);
  console.log(`Curated: ${Math.min(CURATED_PAIRS.length, topPairs.length)}, Auto-generated: ${Math.max(0, topPairs.length - CURATED_PAIRS.length)}`);
}

function nameFromSlug(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

main();
