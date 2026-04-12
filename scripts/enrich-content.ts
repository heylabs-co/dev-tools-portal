/**
 * Enrich company JSON files with deep content blocks:
 * 1. when_to_use / when_not_to_use
 * 2. pricing_at_scale (from existing pricing data)
 * 3. migration_cheatsheet (from lock-in data)
 * 4. works_well_with (from category co-occurrence)
 *
 * Runs locally using existing data — no API calls needed.
 * Usage: npx tsx scripts/enrich-content.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(process.cwd(), 'data/companies');

// --- Knowledge base for "When to use" generation ---
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
  'subscription-billing': {
    good_for: ['SaaS with recurring revenue', 'Usage-based pricing models', 'Complex plan management'],
    not_for: ['One-time purchases only', 'Simple Stripe Checkout is enough'],
    consider_instead: ['payment-gateway'],
  },
  'invoicing-taxes': {
    good_for: ['Global SaaS selling to multiple countries', 'VAT/GST compliance automation', 'High-volume invoicing'],
    not_for: ['Single-country business', 'B2C with no invoicing needs'],
    consider_instead: ['subscription-billing'],
  },
  'fraud-risk-management': {
    good_for: ['High-value transactions', 'Marketplace with seller risk', 'CNP fraud prevention'],
    not_for: ['Low transaction volume', 'B2B with trusted counterparties'],
    consider_instead: ['payment-gateway'],
  },
  'identity-auth': {
    good_for: ['Apps needing SSO/MFA', 'B2B requiring SAML/SCIM', 'Passwordless authentication'],
    not_for: ['Internal tools with basic auth', 'Static sites without user accounts'],
    consider_instead: ['backend-as-a-service'],
  },
  'kyc-kyb-aml': {
    good_for: ['Fintech requiring identity verification', 'Regulated industries (banking, crypto)', 'Marketplace seller onboarding'],
    not_for: ['Consumer apps without regulatory requirements', 'B2B SaaS with trusted enterprise clients'],
    consider_instead: ['identity-auth'],
  },
  'secrets-management': {
    good_for: ['Teams with many API keys/tokens', 'CI/CD pipelines needing secure env vars', 'SOC2/compliance requirements'],
    not_for: ['Solo developer with few secrets', 'Static sites without backend'],
    consider_instead: ['identity-auth'],
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
  'object-storage-media': {
    good_for: ['Image/video heavy applications', 'User-generated content platforms', 'Media processing pipelines'],
    not_for: ['Text-only applications', 'Small file storage needs (<1GB)'],
    consider_instead: ['cdn-edge'],
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
  'mobile-attribution': {
    good_for: ['Mobile apps with paid acquisition', 'Multi-channel campaign tracking', 'SKAdNetwork/SKAN compliance'],
    not_for: ['Web-only products', 'Organic-only growth strategy'],
    consider_instead: ['product-analytics'],
  },
  'session-replay': {
    good_for: ['UX debugging and optimization', 'Understanding user friction points', 'QA and bug reproduction'],
    not_for: ['Apps with strict privacy requirements (healthcare)', 'B2B with very low user volume'],
    consider_instead: ['product-analytics'],
  },
  'crash-reporting': {
    good_for: ['Mobile and web apps in production', 'Prioritizing bug fixes by impact', 'Release quality monitoring'],
    not_for: ['Pre-launch/beta apps', 'Simple scripts without users'],
    consider_instead: ['apm'],
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
  'ab-testing': {
    good_for: ['Conversion optimization', 'Data-driven product experiments', 'Multi-variant testing'],
    not_for: ['Products with <1000 daily users (insufficient sample)', 'Internal tools'],
    consider_instead: ['feature-flags'],
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
  'release-app-store': {
    good_for: ['Mobile app deployment automation', 'App Store metadata management', 'Staged rollouts'],
    not_for: ['Web-only products', 'Manual releases are sufficient'],
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

// --- Company-specific overrides for top tools ---
const COMPANY_OVERRIDES: Record<string, { when_to_use: string[]; when_not_to_use: string[]; consider_instead: string[] }> = {
  'stripe': {
    when_to_use: ['SaaS with global customers needing fast integration', 'Marketplaces using Stripe Connect', 'Companies wanting unified payments + billing stack'],
    when_not_to_use: ['Need Merchant of Record (MoR) for tax compliance — use Paddle', 'Very high volume enterprise seeking lowest fees — consider Adyen', 'Offline-first retail POS — consider Square'],
    consider_instead: ['adyen', 'paddle', 'square'],
  },
  'adyen': {
    when_to_use: ['Enterprise with $10M+ TPV needing global coverage', 'Unified online + in-store (POS) payments', 'Need 250+ local payment methods worldwide'],
    when_not_to_use: ['Startup with <$1M TPV — minimum fees are high', 'Need quick self-serve setup — Stripe is faster', 'Solo developer building MVP'],
    consider_instead: ['stripe', 'checkout-com'],
  },
  'paddle': {
    when_to_use: ['SaaS needing Merchant of Record for global tax compliance', 'Want to avoid sales tax headaches (Paddle handles it)', 'B2B SaaS selling globally'],
    when_not_to_use: ['Marketplace/platform payments — Paddle is seller-focused', 'Need deep payment customization — limited vs Stripe', 'Physical goods or non-SaaS'],
    consider_instead: ['stripe', 'lemon-squeezy'],
  },
  'auth0': {
    when_to_use: ['Enterprise needing SAML/SCIM with complex rules', 'Existing Okta customer extending to CIAM', 'Need extensive social login + MFA options'],
    when_not_to_use: ['Startup watching costs — Auth0 gets expensive fast at scale', 'Need pre-built UI components — Clerk is better', 'Budget-conscious with <10K users — try FusionAuth self-hosted'],
    consider_instead: ['clerk', 'workos', 'fusionauth'],
  },
  'clerk': {
    when_to_use: ['Next.js / React apps needing drop-in auth UI', 'Startup wanting generous free tier (50K MAU)', 'Need pre-built components (SignIn, UserButton)'],
    when_not_to_use: ['Enterprise requiring SAML/SCIM on day one — Auth0/WorkOS', 'Need self-hosted auth — FusionAuth or Keycloak', 'Non-JavaScript backend'],
    consider_instead: ['auth0', 'workos', 'stytch'],
  },
  'firebase': {
    when_to_use: ['Mobile app MVP with tight deadline', 'Need auth + DB + hosting + analytics in one platform', 'Google Cloud ecosystem user'],
    when_not_to_use: ['Need SQL database or complex queries — use Supabase', 'Want to avoid vendor lock-in — Firebase is HIGH lock-in', 'Need self-hosted option'],
    consider_instead: ['supabase', 'appwrite'],
  },
  'supabase': {
    when_to_use: ['Need PostgreSQL with auth + storage + realtime', 'Firebase alternative with SQL and lower lock-in', 'Open-source preference with managed hosting'],
    when_not_to_use: ['Need offline-first mobile sync — consider Firebase', 'Need reactive queries without polling — consider Convex', 'Enterprise requiring 99.99% SLA — consider managed Postgres (Neon, RDS)'],
    consider_instead: ['firebase', 'neon-acquired-by-databricks', 'appwrite'],
  },
  'datadog': {
    when_to_use: ['Enterprise needing unified APM + logs + metrics', 'Large infrastructure with 100+ hosts', 'Need 700+ integrations out of the box'],
    when_not_to_use: ['Cost-sensitive — Datadog bills add up FAST ($15/host + extras)', 'Want OpenTelemetry portability — Datadog converts to proprietary format', 'Startup with <10 services — Grafana Cloud free tier is enough'],
    consider_instead: ['grafana-labs', 'new-relic', 'signoz'],
  },
  'grafana-labs': {
    when_to_use: ['Want open-source observability (Grafana + Loki + Tempo + Mimir)', 'OpenTelemetry-native monitoring', 'Need dashboards with full customization'],
    when_not_to_use: ['Want zero-setup — Datadog is more turnkey', 'Non-technical team — Grafana has a learning curve', 'Need built-in APM without configuration'],
    consider_instead: ['datadog', 'new-relic'],
  },
  'sentry': {
    when_to_use: ['Error tracking and crash reporting for any platform', 'Want open-source with self-hosted option', 'Need performance monitoring + profiling'],
    when_not_to_use: ['Need full APM with infrastructure monitoring — use Datadog', 'Need log aggregation — Sentry is errors, not logs', 'Mobile-only crash reporting — Crashlytics is free'],
    consider_instead: ['bugsnag', 'datadog'],
  },
  'vercel': {
    when_to_use: ['Next.js deployment with zero config', 'Frontend teams wanting preview deployments', 'Edge functions and serverless'],
    when_not_to_use: ['Non-Next.js frameworks — Cloudflare Pages or Netlify may be better', 'Need full backend hosting — Vercel is frontend-focused', 'Cost-sensitive at scale — bills can spike'],
    consider_instead: ['netlify', 'cloudflare'],
  },
  'cloudflare': {
    when_to_use: ['CDN + edge compute + DNS + security in one', 'Static site hosting for free (Pages)', 'DDoS protection and WAF'],
    when_not_to_use: ['Need full PaaS for backend apps — use Railway/Render', 'Workers have cold start and memory limits', 'Need managed databases beyond D1 (early stage)'],
    consider_instead: ['fastly', 'vercel', 'netlify'],
  },
  'algolia': {
    when_to_use: ['E-commerce needing sub-50ms search', 'Documentation sites with instant search', 'Need AI-powered recommendations'],
    when_not_to_use: ['Budget-conscious — Algolia is expensive at scale', 'Simple search on small dataset — use Pagefind or Fuse.js', 'Need self-hosted — use Meilisearch or Typesense'],
    consider_instead: ['meilisearch', 'typesense'],
  },
  'twilio': {
    when_to_use: ['Multi-channel messaging (SMS + voice + WhatsApp)', 'Programmable voice/video', 'Need phone number provisioning globally'],
    when_not_to_use: ['Email only — SendGrid/Resend are simpler', 'Just need push notifications — use OneSignal', 'Cost-sensitive on SMS — Plivo/Telnyx are cheaper'],
    consider_instead: ['vonage', 'sinch', 'plivo'],
  },
  'posthog': {
    when_to_use: ['Want analytics + feature flags + session replay in one', 'Open-source with self-hosted option', 'Developer-friendly with SQL access to raw data'],
    when_not_to_use: ['Enterprise needing dedicated support — Amplitude is more enterprise', 'Mobile-first app — Mixpanel has better mobile SDKs', 'Need just session replay — Hotjar/FullStory are more focused'],
    consider_instead: ['amplitude', 'mixpanel'],
  },
  'amplitude': {
    when_to_use: ['Enterprise product analytics with advanced cohorts', 'Need warehouse-native mode (Snowflake/BigQuery)', 'Dedicated customer success team'],
    when_not_to_use: ['Startup with <1K users — PostHog free tier is more generous', 'Want self-hosted — PostHog or Countly', 'Just need basic event tracking — Mixpanel is simpler'],
    consider_instead: ['posthog', 'mixpanel'],
  },
  'launchdarkly': {
    when_to_use: ['Enterprise feature management at scale', 'Need targeting by user context (plan, region, etc.)', '35+ SDK support across all platforms'],
    when_not_to_use: ['Budget-sensitive — starts at $10/seat/month', 'Want open-source — use Flagsmith or Unleash', 'Just need basic toggles — Statsig free tier is generous'],
    consider_instead: ['flagsmith', 'statsig', 'unleash'],
  },
  'openai': {
    when_to_use: ['Best-in-class LLM capabilities (GPT-4+)', 'Broadest ecosystem and tooling support', 'Need vision, audio, and embeddings in one API'],
    when_not_to_use: ['Cost-sensitive inference — DeepSeek is 10-50x cheaper', 'Need on-premise deployment — use Ollama or vLLM', 'Data privacy concerns — consider Anthropic or self-hosted'],
    consider_instead: ['anthropic', 'google-gemini-api'],
  },
  'anthropic': {
    when_to_use: ['Need strong reasoning and long context (200K tokens)', 'Safety-focused applications', 'Complex coding and analysis tasks (Claude)'],
    when_not_to_use: ['Need cheapest inference — DeepSeek is cheaper', 'Need image generation — OpenAI DALL-E or Stability', 'Need broadest model variety — OpenAI has more options'],
    consider_instead: ['openai', 'google-gemini-api'],
  },
  'cursor': {
    when_to_use: ['VS Code user wanting AI-first editor', 'Need multi-file context and codebase understanding', 'Want AI-assisted refactoring and generation'],
    when_not_to_use: ['Happy with GitHub Copilot in existing editor', 'JetBrains user — JetBrains AI is integrated', 'Need free solution — Continue.dev is open-source'],
    consider_instead: ['github-copilot', 'windsurf-acquired-by-cognition-ai-google-licensed-ip-2-4b'],
  },
  'revenuecat': {
    when_to_use: ['Mobile app with in-app subscriptions (iOS + Android)', 'Need cross-platform entitlement management', 'Want paywall A/B testing and analytics'],
    when_not_to_use: ['Web-only SaaS — use Stripe/Paddle', 'One-time purchases only — too complex', 'Very low revenue (<$2.5K MTR) — free but limited'],
    consider_instead: ['adapty', 'qonversion'],
  },
  'snyk': {
    when_to_use: ['Developer-first security scanning in CI/CD', 'Open-source dependency vulnerability checking', 'Container and IaC security scanning'],
    when_not_to_use: ['Just need basic dependency audit — npm audit is free', 'Enterprise SAST — Checkmarx is more comprehensive', 'Budget-sensitive team — SonarQube is free OSS'],
    consider_instead: ['sonarqube', 'checkmarx'],
  },
  'vanta': {
    when_to_use: ['SOC 2 Type II preparation and maintenance', 'Continuous compliance monitoring', 'Need 300+ integrations for evidence collection'],
    when_not_to_use: ['Not targeting enterprise customers yet — SOC 2 is premature', 'Need ISO 27001 only — Drata may be cheaper', 'DIY compliance is sufficient for now'],
    consider_instead: ['drata', 'sprinto'],
  },
};

// --- Pricing at scale calculator ---
function generatePricingAtScale(company: any): any[] | undefined {
  const p = company.pricing;
  if (!p || !p.entry_price) return undefined;

  const scales = [
    { label: '1K users/mo', multiplier: 1000 },
    { label: '10K users/mo', multiplier: 10000 },
    { label: '100K users/mo', multiplier: 100000 },
  ];

  // Only generate for known pricing patterns
  const price = p.entry_price.toLowerCase();

  if (price.includes('%') && price.includes('transaction')) {
    return scales.map(s => ({
      scale: s.label.replace('users', 'transactions'),
      estimate: `~${s.multiplier} transactions at ${p.entry_price}`,
    }));
  }

  if (price.includes('/мес') || price.includes('/mo') || price.includes('$')) {
    return [{ scale: 'Entry', estimate: p.entry_price }];
  }

  return undefined;
}

// --- Migration cheatsheet from lock-in data ---
function generateMigrationCheatsheet(company: any): any | undefined {
  const lockIn = company.scores?.lock_in;
  if (!lockIn) return undefined;

  return {
    difficulty: lockIn.migration_complexity || lockIn.level,
    data_you_keep: lockIn.data_portability || 'Contact vendor for export options',
    api_standard: lockIn.api_compatibility || 'Proprietary',
    risk_notes: lockIn.explanation || undefined,
    tip: lockIn.level === 'low'
      ? 'Standard protocols make switching straightforward'
      : lockIn.level === 'high'
        ? 'Plan 2-4 weeks minimum. Consider running parallel during migration'
        : 'Moderate effort required. Export data before canceling',
  };
}

// --- Works well with (from category co-occurrence) ---
function generateWorksWellWith(company: any, allCompanies: any[]): string[] | undefined {
  const catSlug = company.categories?.primary?.slug;
  if (!catSlug) return undefined;

  // Common stack pairings by category
  const STACK_PAIRINGS: Record<string, string[]> = {
    'payment-gateway': ['identity-auth', 'subscription-billing', 'fraud-risk-management'],
    'subscription-billing': ['payment-gateway', 'product-analytics', 'invoicing-taxes'],
    'identity-auth': ['backend-as-a-service', 'payment-gateway', 'feature-flags'],
    'backend-as-a-service': ['identity-auth', 'cdn-edge', 'product-analytics'],
    'dbaas': ['cdn-edge', 'identity-auth', 'observability'],
    'cdn-edge': ['dbaas', 'backend-as-a-service', 'security-scanning'],
    'product-analytics': ['feature-flags', 'ab-testing', 'session-replay'],
    'crash-reporting': ['apm', 'product-analytics', 'ci-cd'],
    'apm': ['observability', 'crash-reporting', 'ci-cd'],
    'observability': ['apm', 'ci-cd', 'security-scanning'],
    'feature-flags': ['ab-testing', 'product-analytics', 'ci-cd'],
    'ci-cd': ['test-automation', 'security-scanning', 'feature-flags'],
    'messaging-api': ['identity-auth', 'crm-lifecycle', 'product-analytics'],
    'ai-api-sdk': ['observability', 'product-analytics', 'backend-as-a-service'],
    'search-recommendations': ['backend-as-a-service', 'cdn-edge', 'product-analytics'],
    'iap-optimization': ['product-analytics', 'mobile-attribution', 'push-in-app-messaging'],
  };

  const pairCategories = STACK_PAIRINGS[catSlug];
  if (!pairCategories) return undefined;

  // Find top companies in paired categories
  const suggestions: string[] = [];
  for (const pairCat of pairCategories) {
    const match = allCompanies.find(c =>
      c.categories?.primary?.slug === pairCat && c.pricing
    );
    if (match) suggestions.push(match.slug);
  }

  return suggestions.length > 0 ? suggestions : undefined;
}

// --- Main ---
function main() {
  const files = readdirSync(COMPANIES_DIR).filter(f => f.endsWith('.json'));
  const allCompanies = files.map(f => JSON.parse(readFileSync(join(COMPANIES_DIR, f), 'utf-8')));

  let enriched = 0;

  for (const file of files) {
    const path = join(COMPANIES_DIR, file);
    const company = JSON.parse(readFileSync(path, 'utf-8'));
    const catSlug = company.categories?.primary?.slug;

    let changed = false;

    // 1. When to use / When not to use
    const override = COMPANY_OVERRIDES[company.slug];
    const catUseCases = catSlug ? CATEGORY_USE_CASES[catSlug] : undefined;

    if (override) {
      company.content = company.content || {};
      company.content.when_to_use = override.when_to_use;
      company.content.when_not_to_use = override.when_not_to_use;
      company.content.consider_instead = override.consider_instead;
      changed = true;
    } else if (catUseCases) {
      company.content = company.content || {};
      company.content.when_to_use = catUseCases.good_for;
      company.content.when_not_to_use = catUseCases.not_for;
      company.content.consider_instead = catUseCases.consider_instead;
      changed = true;
    }

    // 2. Pricing at scale
    const pricingScale = generatePricingAtScale(company);
    if (pricingScale) {
      company.content = company.content || {};
      company.content.pricing_at_scale = pricingScale;
      changed = true;
    }

    // 3. Migration cheatsheet
    const migration = generateMigrationCheatsheet(company);
    if (migration) {
      company.content = company.content || {};
      company.content.migration_cheatsheet = migration;
      changed = true;
    }

    // 4. Works well with
    const stackPairs = generateWorksWellWith(company, allCompanies);
    if (stackPairs) {
      company.content = company.content || {};
      company.content.works_well_with = stackPairs;
      changed = true;
    }

    if (changed) {
      writeFileSync(path, JSON.stringify(company, null, 2) + '\n');
      enriched++;
    }
  }

  console.log(`Enriched ${enriched} / ${files.length} companies with content blocks.`);
}

main();
