/**
 * apply-hwm-seed.ts
 *
 * Mark a hardcoded seed list of tools as having "high water mark" pricing —
 * i.e. you pay based on peak usage or a fixed reserved tier, and the bill
 * can't scale DOWN within a billing cycle.
 *
 * Writes two fields into each matching data/companies/*.json:
 *   pricing.high_water_mark: true
 *   pricing.high_water_mark_reason: string (≤ 120 chars)
 *
 * Usage: npx tsx scripts/apply-hwm-seed.ts
 *        npx tsx scripts/apply-hwm-seed.ts --dry-run
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const COMPANIES_DIR = join(import.meta.dirname, '..', 'data', 'companies');
const DRY = process.argv.includes('--dry-run');

interface SeedEntry {
  slug: string;
  reason: string;
}

const SEED: SeedEntry[] = [
  { slug: 'datadog', reason: 'Bills on peak host count per month — price locks at the highest count even after you scale down.' },
  { slug: 'snowflake', reason: 'Reserved compute credits — pre-paid capacity tiers do not scale down within the billing period.' },
  { slug: 'splunk', reason: 'Annual ingest commitment — you pay the contracted volume regardless of actual usage.' },
  { slug: 'splunk-cloud', reason: 'Annual ingest commitment — you pay the contracted volume regardless of actual usage.' },
  { slug: 'elastic', reason: 'Reserved Elastic Cloud tiers — can\'t downgrade mid-cycle without losing the prepaid commit.' },
  { slug: 'elastic-cloud', reason: 'Reserved Elastic Cloud tiers — can\'t downgrade mid-cycle without losing the prepaid commit.' },
  { slug: 'mongodb-atlas', reason: 'Dedicated cluster tiers are fixed-price — no mid-cycle scale-down on paid plans.' },
  { slug: 'mongodb', reason: 'Atlas dedicated cluster tiers are fixed-price — no mid-cycle scale-down on paid plans.' },
  { slug: 'new-relic', reason: 'Commit-tier pricing — minimum monthly spend applies for the contracted period.' },
  { slug: 'sendgrid', reason: 'Dedicated IPs + annual plans cannot be released within the billing cycle.' },
  { slug: 'twilio-sendgrid', reason: 'Dedicated IPs + annual plans cannot be released within the billing cycle.' },
  { slug: 'salesforce', reason: 'Annual seat commits — cannot reduce seats within the billing cycle.' },
  { slug: 'hubspot', reason: 'Annual seat commits — cannot reduce seats within the billing cycle.' },
  { slug: 'dynatrace', reason: 'Commit-tier pricing with annual minimum spend that cannot be refunded for scale-down.' },
  { slug: 'appdynamics', reason: 'Annual commitment pricing — locked to contracted agent volume for the period.' },
  { slug: 'pagerduty', reason: 'Annual seat commits on paid tiers — cannot reduce seats mid-contract.' },
  { slug: 'segment', reason: 'Annual MTU commit on Team/Business plans — bill does not scale down within the period.' },
  { slug: 'databricks', reason: 'Reserved DBU capacity contracts — committed spend applies regardless of actual usage.' },
  { slug: 'looker', reason: 'Annual seat commits — cannot reduce seats within the billing cycle.' },
  { slug: 'tableau', reason: 'Annual seat commits — seats can\'t be reduced within the billing cycle.' },
  { slug: 'auth0', reason: 'MAU tiers bill on peak monthly active users — does not reduce within the cycle.' },
  { slug: 'okta', reason: 'Annual seat commits for workforce plans — cannot reduce seats mid-contract.' },
  { slug: 'mixpanel', reason: 'Annual MTU commit on paid plans — bill does not scale down within the contracted period.' },
  { slug: 'amplitude', reason: 'Annual event-volume commit on paid plans — does not scale down within the cycle.' },
  { slug: 'heap', reason: 'Annual event-volume commit on paid plans — does not scale down within the cycle.' },
  { slug: 'fullstory', reason: 'Annual session commit — does not scale down within the billing cycle.' },
  { slug: 'algolia', reason: 'Commit tiers based on peak records + operations — bill stays at peak for the cycle.' },
  { slug: 'contentful', reason: 'Annual plan commits — cannot downgrade tier within the contracted period.' },
  { slug: 'sanity', reason: 'Annual plan commits on Team/Business — cannot downgrade tier within the period.' },
  { slug: 'cloudflare-enterprise', reason: 'Enterprise annual contracts — minimum spend applies regardless of traffic.' },
  { slug: 'fastly', reason: 'Annual traffic commits on Enterprise — committed spend applies.' },
  { slug: 'bugsnag', reason: 'Commit-based error-event tiers — locked for the billing cycle.' },
  { slug: 'sentry', reason: 'Annual plans have a minimum spend for the contracted period.' },
  { slug: 'coralogix', reason: 'Commit-tier pricing with annual minimum — locked for the contracted period.' },
  { slug: 'honeycomb', reason: 'Annual event-volume commits on paid plans — do not scale down mid-cycle.' },
  { slug: 'launchdarkly', reason: 'Annual MAU commits on paid plans — cannot scale seats/MAU down mid-contract.' },
  { slug: 'statsig', reason: 'Annual event-volume commits on paid plans — do not scale down mid-cycle.' },
  { slug: 'rollbar', reason: 'Annual event-volume commits — do not scale down within the contracted period.' },
  { slug: 'logrocket', reason: 'Annual session commits — cannot scale down within the billing cycle.' },
  { slug: 'gitlab', reason: 'Annual seat commits on paid tiers — cannot reduce seats within the cycle.' },
];

function main(): void {
  let applied = 0;
  let skipped = 0;
  let missing: string[] = [];

  for (const { slug, reason } of SEED) {
    const path = join(COMPANIES_DIR, `${slug}.json`);
    if (!existsSync(path)) {
      missing.push(slug);
      continue;
    }
    const raw = readFileSync(path, 'utf-8');
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.warn(`[hwm] skip ${slug}: JSON parse error`);
      skipped++;
      continue;
    }

    // Ensure pricing object exists
    data.pricing = data.pricing ?? {};

    // Already flagged? leave it.
    if (data.pricing.high_water_mark === true) {
      skipped++;
      continue;
    }

    data.pricing.high_water_mark = true;
    data.pricing.high_water_mark_reason = reason;

    if (!DRY) {
      writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    }
    applied++;
    console.log(`  ✓ ${slug}`);
  }

  console.log('');
  console.log(`Applied:  ${applied}`);
  console.log(`Skipped:  ${skipped} (already flagged or parse error)`);
  console.log(`Missing:  ${missing.length} — not in catalog: ${missing.join(', ') || '—'}`);
  if (DRY) console.log('\n(dry-run — no files written)');
}

main();
