/**
 * Seed script for new tools discovery CSV.
 * Reads data/new_tools_discovery.csv and creates company JSON files,
 * updates category files and registry.
 *
 * Usage: npx tsx scripts/seed-new-tools.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = process.cwd();
const CSV_PATH = join(BASE, 'data/new_tools_discovery.csv');
const COMPANIES_DIR = join(BASE, 'data/companies');
const CATEGORIES_DIR = join(BASE, 'data/categories');
const META_DIR = join(BASE, 'data/meta');
const REGISTRY_PATH = join(META_DIR, 'registry.json');

// --- CATEGORY_MAP from seed-from-csv.ts (CAT-XX -> slug + name) ---
const CATEGORY_MAP: Record<string, { slug: string; name: string; section: string; ai_native: boolean }> = {
  'CAT-01': { slug: 'payments-orchestration', name: 'Payments Orchestration', section: 'A. Payments', ai_native: false },
  'CAT-02': { slug: 'payment-gateway', name: 'Payment Gateway / PSP', section: 'A. Payments', ai_native: false },
  'CAT-03': { slug: 'subscription-billing', name: 'Subscription Billing', section: 'A. Payments', ai_native: false },
  'CAT-04': { slug: 'invoicing-taxes', name: 'Invoicing / Taxes / Sales Tax', section: 'A. Payments', ai_native: false },
  'CAT-05': { slug: 'fraud-risk-management', name: 'Fraud & Risk Management', section: 'A. Payments', ai_native: true },
  'CAT-06': { slug: 'identity-auth', name: 'Identity / Auth / User Management', section: 'B. Identity & Security', ai_native: false },
  'CAT-07': { slug: 'kyc-kyb-aml', name: 'KYC / KYB / AML API', section: 'B. Identity & Security', ai_native: true },
  'CAT-08': { slug: 'secrets-management', name: 'Secrets Management', section: 'B. Identity & Security', ai_native: false },
  'CAT-09': { slug: 'backend-as-a-service', name: 'Backend-as-a-Service', section: 'C. Backend & Data', ai_native: false },
  'CAT-10': { slug: 'dbaas', name: 'DBaaS / Serverless Databases', section: 'C. Backend & Data', ai_native: false },
  'CAT-11': { slug: 'object-storage-media', name: 'Object Storage / Media API', section: 'C. Backend & Data', ai_native: false },
  'CAT-12': { slug: 'cdn-edge', name: 'CDN / Edge / Acceleration', section: 'C. Backend & Data', ai_native: false },
  'CAT-13': { slug: 'maps-geolocation', name: 'Maps / Geolocation / Routing', section: 'D. Specialized APIs', ai_native: false },
  'CAT-14': { slug: 'search-recommendations', name: 'Search / Recommendations API', section: 'D. Specialized APIs', ai_native: true },
  'CAT-15': { slug: 'messaging-api', name: 'Messaging API (Email / SMS / Voice)', section: 'D. Specialized APIs', ai_native: false },
  'CAT-16': { slug: 'push-in-app-messaging', name: 'Push / In-app Messaging SDK', section: 'D. Specialized APIs', ai_native: false },
  'CAT-17': { slug: 'product-analytics', name: 'Product Analytics', section: 'E. Analytics & Monitoring', ai_native: false },
  'CAT-18': { slug: 'mobile-attribution', name: 'Mobile Attribution / MMP', section: 'E. Analytics & Monitoring', ai_native: false },
  'CAT-19': { slug: 'session-replay', name: 'Session Replay / UX Analytics', section: 'E. Analytics & Monitoring', ai_native: false },
  'CAT-20': { slug: 'crash-reporting', name: 'Crash Reporting', section: 'E. Analytics & Monitoring', ai_native: false },
  'CAT-21': { slug: 'apm', name: 'Performance Monitoring / APM', section: 'E. Analytics & Monitoring', ai_native: false },
  'CAT-22': { slug: 'observability', name: 'Observability / Logging / Tracing', section: 'E. Analytics & Monitoring', ai_native: false },
  'CAT-23': { slug: 'feature-flags', name: 'Feature Flags / Remote Config', section: 'F. Development & Deploy', ai_native: false },
  'CAT-24': { slug: 'ab-testing', name: 'A/B Testing / Experimentation', section: 'F. Development & Deploy', ai_native: false },
  'CAT-25': { slug: 'ci-cd', name: 'CI/CD for Applications', section: 'F. Development & Deploy', ai_native: false },
  'CAT-26': { slug: 'test-automation', name: 'Test Automation / Device Cloud', section: 'F. Development & Deploy', ai_native: false },
  'CAT-27': { slug: 'release-app-store', name: 'Release / App Store Operations', section: 'F. Development & Deploy', ai_native: false },
  'CAT-28': { slug: 'customer-support-sdk', name: 'Customer Support SDK / In-app Helpdesk', section: 'G. User Interaction', ai_native: false },
  'CAT-29': { slug: 'crm-lifecycle', name: 'CRM / Lifecycle Automation', section: 'G. User Interaction', ai_native: false },
  'CAT-30': { slug: 'localization', name: 'Localization / Translation API', section: 'G. User Interaction', ai_native: true },
  'CAT-31': { slug: 'content-moderation', name: 'Content Moderation API', section: 'G. User Interaction', ai_native: true },
  'CAT-32': { slug: 'security-scanning', name: 'Security Scanning / Mobile App Sec', section: 'H. Security & Compliance', ai_native: false },
  'CAT-33': { slug: 'compliance-automation', name: 'Compliance Automation', section: 'H. Security & Compliance', ai_native: false },
  'CAT-34': { slug: 'data-integration-etl', name: 'Data Integration / ETL / Reverse ETL', section: 'I. Data & Integrations', ai_native: false },
  'CAT-35': { slug: 'api-management', name: 'Developer Portals / API Management', section: 'I. Data & Integrations', ai_native: false },
  'CAT-36': { slug: 'ai-api-sdk', name: 'AI API / SDK for Developers', section: 'J. AI & Generative', ai_native: true },
  'CAT-37': { slug: 'code-assistants', name: 'Code Assistants / Agent Tooling', section: 'J. AI & Generative', ai_native: true },
  'CAT-38': { slug: 'ad-monetization', name: 'Ad Monetization / Mediation', section: 'K. Monetization & Growth', ai_native: false },
  'CAT-39': { slug: 'iap-optimization', name: 'In-app Purchase Optimization', section: 'K. Monetization & Growth', ai_native: false },
  'CAT-40': { slug: 'app-growth-aso', name: 'App Growth Tooling (ASO)', section: 'K. Monetization & Growth', ai_native: false },
  'CAT-41': { slug: 'realtime-websocket', name: 'Real-time / WebSocket Infrastructure', section: 'L. Additional', ai_native: false },
  'CAT-42': { slug: 'no-code-low-code', name: 'No-code / Low-code App Builders', section: 'L. Additional', ai_native: false },
};

// --- Map CSV primary_category (human-readable) -> category slug ---
const CSV_CATEGORY_TO_SLUG: Record<string, string> = {
  'Auth': 'identity-auth',
  'Payments': 'payment-gateway',
  'AI API': 'ai-api-sdk',
  'CDN': 'cdn-edge',
  'Code Assistants': 'code-assistants',
  'No-code': 'no-code-low-code',
  'Test Automation': 'test-automation',
  'Observability': 'observability',
  'CI/CD': 'ci-cd',
  'Security Scanning': 'security-scanning',
  'ETL': 'data-integration-etl',
  'Analytics': 'product-analytics',
  'Maps': 'maps-geolocation',
  'Support SDK': 'customer-support-sdk',
  'BaaS': 'backend-as-a-service',
  'DBaaS': 'dbaas',
  'Payment Gateway': 'payment-gateway',
  'Messaging': 'messaging-api',
  'Localization': 'localization',
  'ASO': 'app-growth-aso',
  'APM': 'apm',
  'Feature Flags': 'feature-flags',
  'Search': 'search-recommendations',
  'Push': 'push-in-app-messaging',
  'Session Replay': 'session-replay',
  'Real-time': 'realtime-websocket',
  'IAP': 'iap-optimization',
  'API Management': 'api-management',
  'Compliance': 'compliance-automation',
  'Content Moderation': 'content-moderation',
  'CRM': 'crm-lifecycle',
  'Ad Monetization': 'ad-monetization',
  'App Growth': 'app-growth-aso',
};

// --- CATEGORY_USE_CASES (from enrich-content.ts) ---
const CATEGORY_USE_CASES: Record<string, { good_for: string[]; not_for: string[]; consider_instead: string[] }> = {
  'payment-gateway': {
    good_for: ['SaaS with online payments', 'E-commerce checkout', 'Marketplace payment processing'],
    not_for: ['Offline-only retail', 'Internal tools without billing'],
    consider_instead: ['payments-orchestration'],
  },
  'payments-orchestration': {
    good_for: ['Multi-PSP routing for higher conversion', 'Enterprise with multiple payment providers', 'Cross-border optimization'],
    not_for: ['Single-market startups', 'Low transaction volume (<$1M/year)'],
    consider_instead: ['payment-gateway'],
  },
  'identity-auth': {
    good_for: ['Apps needing SSO/MFA', 'B2B requiring SAML/SCIM', 'Passwordless authentication'],
    not_for: ['Internal tools with basic auth', 'Static sites without user accounts'],
    consider_instead: ['backend-as-a-service'],
  },
  'backend-as-a-service': {
    good_for: ['MVP/prototyping speed', 'Mobile apps needing ready backend', 'Teams without backend engineers'],
    not_for: ['Complex custom business logic', 'High-performance computing workloads'],
    consider_instead: ['dbaas'],
  },
  'dbaas': {
    good_for: ['Apps needing managed database', 'Serverless architectures', 'Global data distribution'],
    not_for: ['Simple key-value storage needs', 'Embedded/offline-first apps'],
    consider_instead: ['backend-as-a-service'],
  },
  'cdn-edge': {
    good_for: ['Global audience with low latency needs', 'Static site hosting', 'Edge computing / serverless functions'],
    not_for: ['Single-region internal apps', 'Low-traffic internal tools'],
    consider_instead: ['object-storage-media'],
  },
  'maps-geolocation': {
    good_for: ['Location-based services', 'Delivery/logistics apps', 'Store locators and geofencing'],
    not_for: ['Apps without location features', 'Simple address input forms'],
    consider_instead: [],
  },
  'search-recommendations': {
    good_for: ['E-commerce product search', 'Documentation/knowledge base search', 'Content recommendations'],
    not_for: ['Simple filter/sort on small datasets', 'Apps with <1000 records'],
    consider_instead: [],
  },
  'messaging-api': {
    good_for: ['Transactional emails (receipts, alerts)', 'SMS verification', 'Multi-channel notifications'],
    not_for: ['Internal team communication', 'Marketing-only email campaigns'],
    consider_instead: ['push-in-app-messaging'],
  },
  'push-in-app-messaging': {
    good_for: ['Mobile app engagement', 'User lifecycle messaging', 'In-app announcements and onboarding'],
    not_for: ['Web-only products without mobile', 'B2B with low user count'],
    consider_instead: ['messaging-api'],
  },
  'product-analytics': {
    good_for: ['Understanding user behavior (funnels, retention)', 'Data-driven product decisions', 'A/B test analysis'],
    not_for: ['Pre-product stage', 'Simple pageview tracking (use Plausible)'],
    consider_instead: ['session-replay'],
  },
  'session-replay': {
    good_for: ['UX debugging and optimization', 'Understanding user friction points', 'QA and bug reproduction'],
    not_for: ['Apps with strict privacy requirements (healthcare)', 'B2B with very low user volume'],
    consider_instead: ['product-analytics'],
  },
  'apm': {
    good_for: ['Microservices performance monitoring', 'Distributed tracing', 'Infrastructure monitoring at scale'],
    not_for: ['Simple monolith apps', 'Static sites'],
    consider_instead: ['observability'],
  },
  'observability': {
    good_for: ['Distributed systems debugging', 'Log aggregation and analysis', 'OpenTelemetry-based monitoring'],
    not_for: ['Single-server apps with basic logging', 'Non-technical teams'],
    consider_instead: ['apm'],
  },
  'feature-flags': {
    good_for: ['Gradual rollouts to reduce risk', 'Kill switches for features', 'Remote config without releases'],
    not_for: ['Solo developer shipping to production', 'Products with no users yet'],
    consider_instead: ['ab-testing'],
  },
  'ci-cd': {
    good_for: ['Automated build/test/deploy pipelines', 'Team collaboration on code', 'Mobile app CI (iOS/Android)'],
    not_for: ['Manual deployment is sufficient', 'Single-person hobby projects'],
    consider_instead: [],
  },
  'test-automation': {
    good_for: ['Cross-browser/device testing', 'E2E test automation', 'Visual regression testing'],
    not_for: ['Unit tests only (use Jest/Vitest)', 'No QA process yet'],
    consider_instead: ['ci-cd'],
  },
  'customer-support-sdk': {
    good_for: ['In-app customer support chat', 'Knowledge base integration', 'Ticket management for apps'],
    not_for: ['Products without customer support', 'Email-only support workflow'],
    consider_instead: ['crm-lifecycle'],
  },
  'crm-lifecycle': {
    good_for: ['User onboarding automation', 'Churn prevention campaigns', 'Multi-channel lifecycle messaging'],
    not_for: ['Pre-launch products', 'B2B with <100 customers (manual is fine)'],
    consider_instead: ['push-in-app-messaging'],
  },
  'localization': {
    good_for: ['Apps targeting multiple languages/markets', 'OTA translation updates', 'Team translation workflows'],
    not_for: ['English-only products', 'Static marketing sites (use simple i18n)'],
    consider_instead: [],
  },
  'content-moderation': {
    good_for: ['UGC platforms (social, marketplace)', 'Chat/messaging apps', 'Image/video review'],
    not_for: ['B2B products without user content', 'Internal tools'],
    consider_instead: [],
  },
  'security-scanning': {
    good_for: ['Vulnerability scanning in CI/CD', 'Dependency audit for compliance', 'Mobile app protection'],
    not_for: ['Personal/hobby projects', 'No compliance requirements'],
    consider_instead: ['compliance-automation'],
  },
  'compliance-automation': {
    good_for: ['SOC 2 / ISO 27001 preparation', 'Continuous compliance monitoring', 'Audit evidence collection'],
    not_for: ['Pre-revenue startups', 'No enterprise customers requiring compliance'],
    consider_instead: ['security-scanning'],
  },
  'data-integration-etl': {
    good_for: ['Data warehouse syncing', 'Multi-source data pipelines', 'Reverse ETL for activation'],
    not_for: ['Simple API-to-API integrations', 'Small datasets (<10K records)'],
    consider_instead: [],
  },
  'api-management': {
    good_for: ['API gateway and rate limiting', 'Developer portal for external APIs', 'API documentation and versioning'],
    not_for: ['Internal APIs with few consumers', 'Simple REST endpoints'],
    consider_instead: [],
  },
  'ai-api-sdk': {
    good_for: ['Adding LLM/AI capabilities to apps', 'Speech/vision/embedding APIs', 'AI inference at scale'],
    not_for: ['Apps without AI features', 'Simple rule-based logic'],
    consider_instead: ['code-assistants'],
  },
  'code-assistants': {
    good_for: ['Accelerating coding workflow', 'Code generation and refactoring', 'AI-powered code review'],
    not_for: ['Non-coding roles', 'Highly regulated codebases with strict audit'],
    consider_instead: ['ai-api-sdk'],
  },
  'ad-monetization': {
    good_for: ['Free mobile games and apps', 'Ad-supported content apps', 'Maximizing eCPM with mediation'],
    not_for: ['Subscription-only apps', 'B2B products'],
    consider_instead: ['iap-optimization'],
  },
  'iap-optimization': {
    good_for: ['Mobile apps with subscriptions', 'Paywall A/B testing', 'Cross-platform IAP management'],
    not_for: ['Free apps without monetization', 'Web-only products'],
    consider_instead: ['subscription-billing'],
  },
  'app-growth-aso': {
    good_for: ['App Store optimization', 'Keyword and competitor tracking', 'Screenshot/icon A/B testing'],
    not_for: ['Web-only products', 'Enterprise B2B apps (not in public stores)'],
    consider_instead: [],
  },
  'realtime-websocket': {
    good_for: ['Chat applications', 'Live collaboration features', 'Real-time notifications and presence'],
    not_for: ['Static content sites', 'Batch processing workflows'],
    consider_instead: ['push-in-app-messaging'],
  },
  'no-code-low-code': {
    good_for: ['Internal tools and dashboards', 'Rapid prototyping', 'Non-technical team workflows'],
    not_for: ['Complex custom applications', 'High-performance systems'],
    consider_instead: ['backend-as-a-service'],
  },
};

// --- Build reverse lookup: slug -> CAT-XX ---
const SLUG_TO_CAT: Record<string, { catId: string; name: string; section: string; ai_native: boolean }> = {};
for (const [catId, info] of Object.entries(CATEGORY_MAP)) {
  SLUG_TO_CAT[info.slug] = { catId, name: info.name, section: info.section, ai_native: info.ai_native };
}

// --- Helper: slugify company name ---
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- Parse CSV (handles quoted fields) ---
function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || '';
    });
    return row;
  });
}

// --- Main ---
function main() {
  console.log('Reading CSV...');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(csvContent);
  console.log(`Parsed ${rows.length} rows from CSV`);

  // Load existing registry
  const existingRegistry: Record<string, string> = existsSync(REGISTRY_PATH)
    ? JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'))
    : {};

  // Determine starting ID
  const existingIds = Object.values(existingRegistry).map(id => parseInt(id.replace('COMP-', ''), 10));
  const maxExistingId = existingIds.length > 0 ? Math.max(...existingIds) : 630;
  let nextId = Math.max(maxExistingId + 1, 631);
  console.log(`Starting company IDs from COMP-${String(nextId).padStart(4, '0')}`);

  // Track new companies per category slug for updating category files
  const categoryAdditions: Record<string, string[]> = {};
  const now = new Date().toISOString();
  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const companyName = row.company_name;
    const website = row.website;
    const csvCategory = row.primary_category;
    const subcategory = row.subcategory;
    const hqCountry = row.hq_country;
    const status = (row.status || 'active').toLowerCase() as 'active' | 'inactive';

    // Resolve slug from CSV category
    const categorySlug = CSV_CATEGORY_TO_SLUG[csvCategory];
    if (!categorySlug) {
      console.warn(`  [SKIP] Unknown CSV category "${csvCategory}" for ${companyName}`);
      continue;
    }

    const catInfo = SLUG_TO_CAT[categorySlug];
    if (!catInfo) {
      console.warn(`  [SKIP] No CAT-XX found for slug "${categorySlug}" (company: ${companyName})`);
      continue;
    }

    const slug = slugify(companyName);
    const filePath = join(COMPANIES_DIR, `${slug}.json`);

    // Skip if file already exists
    if (existsSync(filePath)) {
      console.log(`  [EXISTS] ${slug}.json — skipping`);
      skipped++;
      // Still track in registry if not already there
      if (!existingRegistry[slug]) {
        const compId = `COMP-${String(nextId).padStart(4, '0')}`;
        existingRegistry[slug] = compId;
        nextId++;
      }
      // Still add to category if not tracked
      if (!categoryAdditions[categorySlug]) categoryAdditions[categorySlug] = [];
      categoryAdditions[categorySlug].push(slug);
      continue;
    }

    const compId = `COMP-${String(nextId).padStart(4, '0')}`;
    nextId++;

    // Clean up the domain (remove paths for sites like sourcegraph.com/cody)
    const domain = website.split('/')[0];

    // Build "when to use" content
    const useCases = CATEGORY_USE_CASES[categorySlug];

    const company: any = {
      id: compId,
      slug,
      name: companyName,
      description: `${companyName} — ${catInfo.name} tool for developers. ${subcategory ? `Specializes in ${subcategory}.` : ''}`,
      website: `https://${website}`,
      logo: `https://logo.clearbit.com/${domain}`,
      hq_country: hqCountry,
      status,
      categories: {
        primary: {
          id: catInfo.catId,
          slug: categorySlug,
          name: catInfo.name,
        },
        secondary: [],
      },
      alternatives: [],
      seo: {
        title: `${companyName} Review 2026: Pricing, Alternatives & Lock-in Score`,
        meta_description: `Complete ${companyName} analysis: pricing, lock-in risk, migration difficulty. Compare with alternatives in ${catInfo.name}.`,
        keywords: [
          `${companyName.toLowerCase()} pricing`,
          `${companyName.toLowerCase()} alternatives`,
          `${companyName.toLowerCase()} review`,
          `${companyName.toLowerCase()} vs`,
          categorySlug.replace(/-/g, ' '),
        ],
      },
      updated_at: now,
      created_at: now,
    };

    // Add when_to_use content from CATEGORY_USE_CASES
    if (useCases) {
      company.content = {
        when_to_use: useCases.good_for,
        when_not_to_use: useCases.not_for,
        consider_instead: useCases.consider_instead,
      };
    }

    writeFileSync(filePath, JSON.stringify(company, null, 2) + '\n');
    existingRegistry[slug] = compId;
    created++;

    // Track for category file updates
    if (!categoryAdditions[categorySlug]) categoryAdditions[categorySlug] = [];
    categoryAdditions[categorySlug].push(slug);
  }

  // --- Update category JSON files ---
  console.log('\nUpdating category files...');
  for (const [categorySlug, newSlugs] of Object.entries(categoryAdditions)) {
    const catFilePath = join(CATEGORIES_DIR, `${categorySlug}.json`);
    if (!existsSync(catFilePath)) {
      console.warn(`  [WARN] Category file not found: ${catFilePath}`);
      continue;
    }

    const catData = JSON.parse(readFileSync(catFilePath, 'utf-8'));
    const existingCompanies: string[] = catData.companies || [];
    const uniqueNew = newSlugs.filter(s => !existingCompanies.includes(s));

    if (uniqueNew.length === 0) continue;

    catData.companies = [...existingCompanies, ...uniqueNew].sort();
    catData.company_count = catData.companies.length;

    // Update SEO title to reflect new count
    catData.seo = catData.seo || {};
    catData.seo.title = `Best ${catData.name} Tools 2026 — Compare ${catData.company_count} Solutions`;
    catData.seo.meta_description = `Compare ${catData.company_count} ${catData.name.toLowerCase()} tools: pricing, lock-in scores, migration difficulty. Side-by-side comparison.`;

    writeFileSync(catFilePath, JSON.stringify(catData, null, 2) + '\n');
    console.log(`  [UPDATED] ${categorySlug}.json: +${uniqueNew.length} companies (total: ${catData.company_count})`);
  }

  // --- Write updated registry ---
  // Sort registry alphabetically
  const sortedRegistry: Record<string, string> = {};
  for (const key of Object.keys(existingRegistry).sort()) {
    sortedRegistry[key] = existingRegistry[key];
  }
  writeFileSync(REGISTRY_PATH, JSON.stringify(sortedRegistry, null, 2) + '\n');

  // --- Update last-updated ---
  const totalCount = Object.keys(sortedRegistry).length;
  writeFileSync(
    join(META_DIR, 'last-updated.json'),
    JSON.stringify({ updated_at: now, company_count: totalCount }, null, 2) + '\n'
  );

  console.log(`\nDone!`);
  console.log(`  Created: ${created} new company JSON files`);
  console.log(`  Skipped: ${skipped} (already existed)`);
  console.log(`  Total in registry: ${totalCount}`);
}

main();
