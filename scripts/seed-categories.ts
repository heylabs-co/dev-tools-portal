/**
 * Seed categories: reads company JSONs and generates category JSON files.
 * Usage: npx tsx scripts/seed-categories.ts
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(process.cwd(), 'data/companies');
const CATEGORIES_DIR = join(process.cwd(), 'data/categories');

// Category metadata from R02_taxonomy.md
const CATEGORY_META: Record<string, { description: string }> = {
  'payments-orchestration': { description: 'Platforms routing transactions through multiple PSPs for higher conversion and lower fees.' },
  'payment-gateway': { description: 'Online payment providers through a single API — cards, wallets, local methods.' },
  'subscription-billing': { description: 'Recurring payment management, plan upgrades/downgrades, dunning management.' },
  'invoicing-taxes': { description: 'Tax calculation automation (VAT, GST, sales tax), invoice generation and compliance.' },
  'fraud-risk-management': { description: 'Fraud detection, chargeback management, real-time risk scoring with ML models.' },
  'identity-auth': { description: 'Authentication SDKs (SSO, MFA, passwordless), authorization (RBAC) and user management.' },
  'kyc-kyb-aml': { description: 'Identity verification, business checks and AML monitoring APIs.' },
  'secrets-management': { description: 'Secure storage and rotation of API keys, tokens, certificates and env variables.' },
  'backend-as-a-service': { description: 'Managed backend with ready APIs for data storage, auth, files, push notifications.' },
  'dbaas': { description: 'Managed databases (SQL, NoSQL, vector, graph) with autoscaling and serverless pricing.' },
  'object-storage-media': { description: 'File, image, video storage and processing with on-the-fly transformations.' },
  'cdn-edge': { description: 'Content delivery through global edge networks. Edge compute, caching, DDoS protection.' },
  'maps-geolocation': { description: 'Maps, geocoding, routing and geofencing APIs for location-aware applications.' },
  'search-recommendations': { description: 'Full-text search, faceted filtering and personalized recommendation APIs.' },
  'messaging-api': { description: 'APIs for transactional and marketing messages — email, SMS, WhatsApp, voice.' },
  'push-in-app-messaging': { description: 'Push notification and in-app messaging SDKs with user targeting.' },
  'product-analytics': { description: 'User behavior tracking: funnels, retention, cohorts, event analytics.' },
  'mobile-attribution': { description: 'Install and event attribution for mobile apps. Deep linking, SKAdNetwork.' },
  'session-replay': { description: 'Session recording, heatmaps, click analysis for UX problem discovery.' },
  'crash-reporting': { description: 'Automatic crash collection, grouping and alerting for mobile and web apps.' },
  'apm': { description: 'Application performance monitoring: latency, throughput, error rates, distributed tracing.' },
  'observability': { description: 'Log, metric and trace collection and analysis. OpenTelemetry-compatible platforms.' },
  'feature-flags': { description: 'Feature toggle management for gradual rollouts and remote configuration.' },
  'ab-testing': { description: 'Controlled experiment platforms with statistical analysis methods.' },
  'ci-cd': { description: 'Continuous integration and delivery: build, test, deploy pipelines for apps.' },
  'test-automation': { description: 'UI test automation, real device clouds, visual regression and E2E testing.' },
  'release-app-store': { description: 'App Store and Google Play publishing automation: metadata, screenshots, rollout.' },
  'customer-support-sdk': { description: 'In-app support SDKs: chat, knowledge base, ticket system, AI assistants.' },
  'crm-lifecycle': { description: 'User lifecycle automation: onboarding, re-engagement, churn prevention.' },
  'localization': { description: 'App translation APIs and platforms, OTA string updates, TMS for developers.' },
  'content-moderation': { description: 'Content moderation APIs for text, images, video: toxicity, NSFW, spam detection.' },
  'security-scanning': { description: 'SAST/DAST analysis, dependency scanning, mobile app reverse-engineering protection.' },
  'compliance-automation': { description: 'Audit prep automation, control monitoring for SOC 2, ISO 27001, GDPR, PCI DSS.' },
  'data-integration-etl': { description: 'Data pipelines for syncing between apps, warehouses and analytics systems.' },
  'api-management': { description: 'Developer portals, API lifecycle management, gateways, rate limiting, docs.' },
  'ai-api-sdk': { description: 'APIs for embedding AI capabilities: LLM, vision, speech, embeddings, inference.' },
  'code-assistants': { description: 'AI coding assistants, refactoring, code review. Agent coding platforms.' },
  'ad-monetization': { description: 'Mobile ad SDKs and mediation between ad networks for maximum eCPM.' },
  'iap-optimization': { description: 'Paywall A/B testing, pricing optimization, entitlement management for mobile IAP.' },
  'app-growth-aso': { description: 'App store page optimization, icon/screenshot testing, rating monitoring.' },
  'realtime-websocket': { description: 'Managed real-time infrastructure: WebSockets, pub/sub, presence, channels.' },
  'no-code-low-code': { description: 'App building platforms without code: visual constructors, drag-and-drop components.' },
};

function main() {
  if (!existsSync(CATEGORIES_DIR)) mkdirSync(CATEGORIES_DIR, { recursive: true });

  // Read all company files to build category → companies mapping
  const companyFiles = readdirSync(COMPANIES_DIR).filter(f => f.endsWith('.json'));
  console.log(`Reading ${companyFiles.length} company files...`);

  const categoryCompanies: Record<string, string[]> = {};
  const categoryInfo: Record<string, { id: string; name: string; section: string; ai_native: boolean }> = {};

  for (const file of companyFiles) {
    const company = JSON.parse(readFileSync(join(COMPANIES_DIR, file), 'utf-8'));
    const catSlug = company.categories.primary.slug;

    if (!categoryCompanies[catSlug]) {
      categoryCompanies[catSlug] = [];
      categoryInfo[catSlug] = {
        id: company.categories.primary.id,
        name: company.categories.primary.name,
        section: '', // Will be filled from CATEGORY_META lookup
        ai_native: false,
      };
    }
    categoryCompanies[catSlug].push(company.slug);
  }

  // AI-native categories
  const aiNativeSlugs = new Set([
    'fraud-risk-management', 'kyc-kyb-aml', 'search-recommendations',
    'localization', 'content-moderation', 'ai-api-sdk', 'code-assistants',
  ]);

  let created = 0;
  for (const [catSlug, companies] of Object.entries(categoryCompanies)) {
    const info = categoryInfo[catSlug];
    const meta = CATEGORY_META[catSlug];

    const category = {
      id: info.id,
      slug: catSlug,
      name: info.name,
      section: info.section,
      description: meta?.description || `${info.name} tools for developers`,
      ai_native: aiNativeSlugs.has(catSlug),
      company_count: companies.length,
      companies: companies.sort(),
      seo: {
        title: `Best ${info.name} Tools 2026 — Compare ${companies.length} Solutions`,
        meta_description: `Compare ${companies.length} ${info.name.toLowerCase()} tools: pricing, lock-in scores, migration difficulty. Side-by-side comparison.`,
        h1: `${info.name} Tools`,
      },
    };

    writeFileSync(
      join(CATEGORIES_DIR, `${catSlug}.json`),
      JSON.stringify(category, null, 2) + '\n'
    );
    created++;
  }

  console.log(`Created ${created} category JSON files.`);
}

main();
