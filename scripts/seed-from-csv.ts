/**
 * Seed script: reads master_registry.csv and creates JSON files for each company.
 * Also reads enrichment data from R09, R10, R17 for top-80 companies.
 *
 * Usage: npx tsx scripts/seed-from-csv.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// --- Paths ---
const RESEARCH_DIR = '/Users/ilia/Documents/Playground/research';
const CSV_PATH = join(RESEARCH_DIR, '00_meta/master_registry.csv');
const R10_PATH = join(RESEARCH_DIR, '02_company_profiles/R10_pricing_matrix.md');
const R17_PATH = join(RESEARCH_DIR, '02_company_profiles/R17_lockin_portability.md');
const R09_PATH = join(RESEARCH_DIR, '02_company_profiles/R09_scale_metrics.md');

const OUT_DIR = join(process.cwd(), 'data/companies');
const META_DIR = join(process.cwd(), 'data/meta');

// --- Category mapping (CAT-XX → slug + name) ---
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

// --- Helper: slugify company name ---
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- Parse CSV ---
function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    // Handle quoted fields with commas
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
      row[h.trim()] = values[i] || '';
    });
    return row;
  });
}

// --- Parse pricing from R10 ---
function parsePricing(content: string): Map<string, any> {
  const map = new Map();
  const lines = content.split('\n');

  for (const line of lines) {
    // Match table rows: | **Name** | model | free | price | enterprise | complexity |
    const match = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|(.+)/);
    if (!match) continue;

    const name = match[1].trim();
    const rest = match[2].split('|').map(s => s.trim());
    if (rest.length < 5) continue;

    const modelRaw = rest[0].toLowerCase();
    let model = 'unknown';
    if (modelRaw.includes('usage')) model = 'usage';
    else if (modelRaw.includes('subscription')) model = 'subscription';
    else if (modelRaw.includes('freemium')) model = 'freemium';
    else if (modelRaw.includes('seat')) model = 'seat';
    else if (modelRaw.includes('mau')) model = 'mau';
    else if (modelRaw.includes('tier')) model = 'freemium';
    else if (modelRaw.includes('credit')) model = 'credit';
    else if (modelRaw.includes('per-connection')) model = 'per-connection';
    else if (modelRaw.includes('event')) model = 'event';
    if (modelRaw.includes('+') && model !== 'unknown') model = 'hybrid';

    const hasFree = rest[1].toLowerCase().startsWith('да');
    const complexityRaw = rest[4].toLowerCase();
    let billing_complexity: 'low' | 'medium' | 'high' = 'medium';
    if (complexityRaw.includes('low')) billing_complexity = 'low';
    else if (complexityRaw.includes('high')) billing_complexity = 'high';

    map.set(name.toLowerCase(), {
      model,
      has_free_tier: hasFree,
      free_tier_limits: hasFree ? rest[1].replace(/^Да\s*\(/, '').replace(/\)$/, '') : undefined,
      entry_price: rest[2] || undefined,
      enterprise_available: rest[3].toLowerCase().includes('да'),
      billing_complexity,
      transparency_score: hasFree ? 4 : 3,
      last_checked: '2026-04-11',
    });
  }
  return map;
}

// --- Parse lock-in from R17 ---
function parseLockIn(content: string): Map<string, any> {
  const map = new Map();
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|(.+)/);
    if (!match) continue;

    const name = match[1].trim();
    const rest = match[2].split('|').map(s => s.trim());
    if (rest.length < 4) continue;

    const riskRaw = rest[0].toLowerCase();
    let level: 'low' | 'medium' | 'high' = 'medium';
    let score = 3;
    if (riskRaw.includes('low')) { level = 'low'; score = 1; }
    else if (riskRaw.includes('high')) { level = 'high'; score = 5; }
    else if (riskRaw.includes('medium')) { level = 'medium'; score = 3; }

    const migRaw = rest[1].toLowerCase();
    let migration_complexity: 'low' | 'medium' | 'high' = 'medium';
    if (migRaw.includes('низк') || migRaw.includes('low')) migration_complexity = 'low';
    else if (migRaw.includes('высок') || migRaw.includes('high')) migration_complexity = 'high';

    map.set(name.toLowerCase(), {
      level,
      score,
      migration_complexity,
      data_portability: rest[2] || undefined,
      api_compatibility: rest[3] || undefined,
      explanation: rest[0].replace(/\*\*/g, '').trim(),
    });
  }
  return map;
}

// --- Parse scale from R09 ---
// R09 format: ### CompanyName, then a table with rows: | Метрика | Значение | Дата | Источник | Статус |
function parseScale(content: string): Map<string, any> {
  const map = new Map();
  const lines = content.split('\n');

  let currentCompany: string | null = null;
  let companyData: any = {};

  for (const line of lines) {
    // Detect company header: ### Stripe, ### Adyen, ### Auth0/Okta
    const headerMatch = line.match(/^###\s+(.+)/);
    if (headerMatch) {
      // Save previous company
      if (currentCompany && Object.keys(companyData).length > 0) {
        map.set(currentCompany.toLowerCase(), { ...companyData, data_status: 'estimated' });
      }
      currentCompany = headerMatch[1].trim();
      companyData = {};
      continue;
    }

    // Parse table rows: | Метрика | Значение | ...
    if (!currentCompany) continue;
    const rowMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (!rowMatch) continue;

    const metric = rowMatch[1].trim().toLowerCase();
    const value = rowMatch[2].trim();

    // Skip header rows
    if (metric === 'метрика' || metric.startsWith('---')) continue;

    if (metric.includes('клиент') || metric.includes('пользовател') || metric.includes('user') || metric.includes('app')) {
      companyData.customers = value;
    } else if (metric.includes('выручк') || metric.includes('revenue') || metric === 'arr' || metric === 'arpa') {
      companyData.revenue = value;
    } else if (metric.includes('сотрудник') || metric.includes('employee') || metric.includes('fte')) {
      companyData.employees = value;
    } else if (metric.includes('оценк') || metric.includes('valuation') || metric.includes('капитализац') || metric.includes('market cap')) {
      companyData.valuation = value;
    }
  }

  // Don't forget the last company
  if (currentCompany && Object.keys(companyData).length > 0) {
    map.set(currentCompany.toLowerCase(), { ...companyData, data_status: 'estimated' });
  }

  return map;
}

// --- Main ---
function main() {
  console.log('Reading CSV...');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(csvContent);
  console.log(`Parsed ${rows.length} companies from CSV`);

  // Read enrichment files
  console.log('Reading enrichment data...');
  const r10Content = readFileSync(R10_PATH, 'utf-8');
  const r17Content = readFileSync(R17_PATH, 'utf-8');
  const r09Content = readFileSync(R09_PATH, 'utf-8');

  const pricingMap = parsePricing(r10Content);
  const lockInMap = parseLockIn(r17Content);
  const scaleMap = parseScale(r09Content);

  console.log(`Pricing data: ${pricingMap.size} companies`);
  console.log(`Lock-in data: ${lockInMap.size} companies`);
  console.log(`Scale data: ${scaleMap.size} companies`);

  // Ensure output dirs exist
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(META_DIR)) mkdirSync(META_DIR, { recursive: true });

  const registry: Record<string, string> = {};
  const now = new Date().toISOString();

  for (const row of rows) {
    const slug = slugify(row.company_name);
    const catId = row.primary_category;
    const cat = CATEGORY_MAP[catId];

    if (!cat) {
      console.warn(`Unknown category ${catId} for ${row.company_name}`);
      continue;
    }

    const rawStatus = (row.active_or_inactive || 'active').toLowerCase();
    const status = (rawStatus === 'active' || rawStatus === 'inactive') ? rawStatus : 'active';

    const secondaryCats = row.secondary_categories
      ? row.secondary_categories.split(';').map(s => s.trim()).filter(Boolean)
      : [];

    // Lookup enrichment by company name (lowercase)
    const nameLower = row.company_name.toLowerCase();
    // Also try common aliases
    const nameVariants = [
      nameLower,
      nameLower.replace(/\s/g, ''),
      nameLower.split('/')[0].trim(),
      nameLower.split('(')[0].trim(),
    ];

    let pricing = undefined;
    let lockIn = undefined;
    let scale = undefined;

    for (const variant of nameVariants) {
      if (!pricing) pricing = pricingMap.get(variant);
      if (!lockIn) lockIn = lockInMap.get(variant);
      if (!scale) scale = scaleMap.get(variant);
    }

    const company: any = {
      id: row.company_id,
      slug,
      name: row.company_name,
      description: `${row.company_name} — ${cat.name} tool for developers`,
      website: `https://${row.website}`,
      logo: `https://logo.clearbit.com/${row.website}`,
      hq_country: row.hq_country,
      status,
      categories: {
        primary: {
          id: catId,
          slug: cat.slug,
          name: cat.name,
        },
        secondary: secondaryCats,
      },
      alternatives: [],
      seo: {
        title: `${row.company_name} Review 2026: Pricing, Alternatives & Lock-in Score`,
        meta_description: `Complete ${row.company_name} analysis: pricing, lock-in risk, migration difficulty. Compare with alternatives in ${cat.name}.`,
        keywords: [
          `${row.company_name.toLowerCase()} pricing`,
          `${row.company_name.toLowerCase()} alternatives`,
          `${row.company_name.toLowerCase()} review`,
        ],
      },
      updated_at: now,
      created_at: now,
    };

    if (pricing) {
      company.pricing = {
        ...pricing,
        pricing_url: `https://${row.website}/pricing`,
      };
    }

    if (lockIn) {
      company.scores = {
        lock_in: lockIn,
      };
    }

    if (scale) {
      company.scale = scale;
    }

    // Write JSON
    const filePath = join(OUT_DIR, `${slug}.json`);
    writeFileSync(filePath, JSON.stringify(company, null, 2) + '\n');
    registry[slug] = row.company_id;
  }

  // Write registry
  writeFileSync(
    join(META_DIR, 'registry.json'),
    JSON.stringify(registry, null, 2) + '\n'
  );

  // Write last-updated
  writeFileSync(
    join(META_DIR, 'last-updated.json'),
    JSON.stringify({ updated_at: now, company_count: rows.length }, null, 2) + '\n'
  );

  console.log(`\nDone! Created ${Object.keys(registry).length} company JSON files.`);
  console.log(`Registry: data/meta/registry.json`);
}

main();
