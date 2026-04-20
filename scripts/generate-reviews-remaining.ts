/**
 * Generate review fields for ALL companies that don't already have a "review" field.
 * Uses category-based templates + available pricing/content data.
 *
 * Usage: npx tsx scripts/generate-reviews-remaining.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(process.cwd(), 'data/companies');

interface CompanyData {
  slug: string;
  name: string;
  categories?: {
    primary?: { slug: string; name: string };
  };
  pricing?: {
    model?: string;
    entry_price?: string;
    has_free_tier?: boolean;
    free_tier_limits?: string;
    billing_complexity?: string;
    transparency_score?: number;
  };
  scores?: {
    lock_in?: {
      level?: string;
      explanation?: string;
    };
  };
  scale?: {
    customers?: string;
    revenue?: string;
    valuation?: string;
  };
  content?: {
    when_to_use?: string[];
    when_not_to_use?: string[];
    consider_instead?: string[];
    migration_cheatsheet?: {
      difficulty?: string;
    };
  };
  community?: {
    hn_mentions_30d?: number;
  };
  review?: Record<string, unknown>;
  [key: string]: unknown;
}

// --- Category templates for all 42 categories ---
interface CategoryTemplate {
  pro: string;
  con: string;
  best_for: string;
  not_for: string;
}

const CATEGORY_TEMPLATES: Record<string, CategoryTemplate> = {
  'payment-gateway': {
    pro: 'Handles online transactions with robust SDK support',
    con: 'Transaction fees add up at high volume',
    best_for: 'E-commerce, SaaS, marketplaces',
    not_for: 'Offline-only or cash-based businesses',
  },
  'identity-auth': {
    pro: 'Simplifies authentication and user management',
    con: 'Auth migration is complex and risky',
    best_for: 'Apps needing user login, SSO, or MFA',
    not_for: 'Static sites or apps with no user accounts',
  },
  'dbaas': {
    pro: 'Managed database removes operational overhead',
    con: 'Vendor-specific features increase lock-in',
    best_for: 'Teams without a dedicated DBA',
    not_for: 'On-premise or air-gapped requirements',
  },
  'observability': {
    pro: 'Unified monitoring across logs, metrics, and traces',
    con: 'Costs scale steeply with data ingestion volume',
    best_for: 'Distributed systems and microservices teams',
    not_for: 'Simple single-server or hobby apps',
  },
  'ai-api-sdk': {
    pro: 'Easy AI integration via REST API or SDK',
    con: 'Token costs are unpredictable at scale',
    best_for: 'AI-powered apps and developer tooling',
    not_for: 'Apps with no AI or ML requirements',
  },
  'ab-testing': {
    pro: 'Data-driven experimentation without deploy cycles',
    con: 'Statistical significance requires sufficient traffic',
    best_for: 'Growth teams running continuous experiments',
    not_for: 'Low-traffic sites or pre-launch products',
  },
  'ad-monetization': {
    pro: 'Monetizes apps with minimal integration effort',
    con: 'Revenue share and fill rates vary by market',
    best_for: 'Consumer apps and mobile games',
    not_for: 'B2B SaaS or subscription-based products',
  },
  'api-management': {
    pro: 'Centralizes API governance, docs, and rate limiting',
    con: 'Adds an extra network hop and operational layer',
    best_for: 'Enterprises exposing APIs to partners or public',
    not_for: 'Internal-only microservices without external consumers',
  },
  'apm': {
    pro: 'Pinpoints performance bottlenecks with distributed tracing',
    con: 'Per-host or per-seat pricing grows quickly with team size',
    best_for: 'Teams debugging latency and reliability issues',
    not_for: 'Simple scripts or batch jobs with no latency SLA',
  },
  'app-growth-aso': {
    pro: 'Improves app store discoverability and conversion',
    con: 'Results depend on app store algorithm changes',
    best_for: 'Consumer apps competing in crowded categories',
    not_for: 'B2B apps primarily distributed via direct sales',
  },
  'backend-as-a-service': {
    pro: 'Speeds up development with pre-built backend primitives',
    con: 'Limited customization for complex business logic',
    best_for: 'Startups and indie developers building MVPs',
    not_for: 'Teams with strict data residency requirements',
  },
  'cdn-edge': {
    pro: 'Global edge network delivers low-latency content',
    con: 'Proprietary edge functions create platform dependency',
    best_for: 'High-traffic websites and media-heavy apps',
    not_for: 'Apps serving a single geographic region',
  },
  'ci-cd': {
    pro: 'Automates build, test, and deploy pipelines',
    con: 'Compute minutes add up for large monorepos',
    best_for: 'Development teams shipping code frequently',
    not_for: 'Projects with infrequent or manual releases',
  },
  'code-assistants': {
    pro: 'Accelerates development with AI-powered code suggestions',
    con: 'Generated code requires human review for correctness',
    best_for: 'Developers looking to boost productivity',
    not_for: 'Teams with strict compliance against AI-generated code',
  },
  'compliance-automation': {
    pro: 'Continuous evidence collection saves audit preparation time',
    con: 'Initial control mapping requires significant setup effort',
    best_for: 'SaaS companies pursuing SOC 2, ISO 27001, or HIPAA',
    not_for: 'Projects not subject to compliance frameworks',
  },
  'content-moderation': {
    pro: 'Automated screening reduces manual review burden',
    con: 'False positive rates require tuning and human fallback',
    best_for: 'User-generated content platforms and social apps',
    not_for: 'Apps with no user-generated or third-party content',
  },
  'crash-reporting': {
    pro: 'Real-time error alerts with full stack traces',
    con: 'Event-volume pricing can surprise at scale',
    best_for: 'Mobile and web teams monitoring production stability',
    not_for: 'Internal tools or scripts without SLA requirements',
  },
  'crm-lifecycle': {
    pro: 'Centralizes customer data and automates lifecycle messaging',
    con: 'Contact-based pricing scales steeply with list growth',
    best_for: 'SaaS and e-commerce teams managing user journeys',
    not_for: 'Single-product apps with no ongoing user engagement',
  },
  'customer-support-sdk': {
    pro: 'Embeds support directly in the app for faster resolution',
    con: 'Per-agent or per-conversation pricing adds up',
    best_for: 'Mobile apps and SaaS needing in-product help',
    not_for: 'B2B enterprises with dedicated support portals',
  },
  'data-integration-etl': {
    pro: 'Pre-built connectors eliminate custom pipeline work',
    con: 'Row or event-based pricing grows with data volume',
    best_for: 'Data teams centralizing sources into a warehouse',
    not_for: 'Projects with a single data source and no analytics needs',
  },
  'feature-flags': {
    pro: 'Gradual rollouts reduce deployment risk',
    con: 'Technical debt accumulates if flags are not cleaned up',
    best_for: 'Engineering teams doing trunk-based development',
    not_for: 'Small teams with infrequent or simple releases',
  },
  'fraud-risk-management': {
    pro: 'ML-based detection catches fraud patterns in real time',
    con: 'Overly aggressive rules can block legitimate users',
    best_for: 'Fintech, e-commerce, and marketplace platforms',
    not_for: 'Internal tools or low-risk B2B SaaS',
  },
  'iap-optimization': {
    pro: 'Cross-platform entitlement management out of the box',
    con: 'Revenue share or platform fees reduce margins',
    best_for: 'Mobile apps monetizing with in-app purchases',
    not_for: 'Web-only products or subscription SaaS',
  },
  'invoicing-taxes': {
    pro: 'Automates tax calculation and invoice generation',
    con: 'Complex multi-jurisdiction tax rules need ongoing updates',
    best_for: 'SaaS and e-commerce businesses with global customers',
    not_for: 'Purely domestic businesses with simple tax obligations',
  },
  'kyc-kyb-aml': {
    pro: 'Automated identity verification speeds up onboarding',
    con: 'Verification costs scale with user volume',
    best_for: 'Fintech, crypto, and regulated financial services',
    not_for: 'Consumer apps without regulatory KYC requirements',
  },
  'localization': {
    pro: 'Streamlines translation workflow across formats',
    con: 'Machine translation quality varies by language pair',
    best_for: 'Global products launching in multiple markets',
    not_for: 'Single-language apps or internal tools',
  },
  'maps-geolocation': {
    pro: 'Rich mapping and geocoding APIs with global coverage',
    con: 'API call costs grow quickly with high map usage',
    best_for: 'Apps with location search, routing, or delivery features',
    not_for: 'Apps with no geographic or location requirements',
  },
  'messaging-api': {
    pro: 'Multi-channel delivery (email, SMS, voice) from one API',
    con: 'Per-message pricing adds up at high send volumes',
    best_for: 'Apps sending transactional notifications at scale',
    not_for: 'Small projects with minimal communication needs',
  },
  'mobile-attribution': {
    pro: 'Accurate campaign attribution across ad networks',
    con: 'Attribution windows and privacy changes add complexity',
    best_for: 'Mobile apps running paid user acquisition campaigns',
    not_for: 'Organic-only or web-first products',
  },
  'no-code-low-code': {
    pro: 'Ships products faster without full engineering resources',
    con: 'Customization ceiling limits complex business logic',
    best_for: 'Non-technical founders and rapid prototyping',
    not_for: 'Enterprise products requiring deep customization',
  },
  'object-storage-media': {
    pro: 'Scalable, cost-effective storage for files and media',
    con: 'Egress fees can dominate costs at high traffic',
    best_for: 'Apps storing user uploads, images, or video',
    not_for: 'Apps with no file storage or media processing needs',
  },
  'payments-orchestration': {
    pro: 'Routes payments across processors to maximize success rates',
    con: 'Adds integration complexity for smaller teams',
    best_for: 'High-volume merchants optimizing authorization rates',
    not_for: 'Early-stage startups with simple payment needs',
  },
  'product-analytics': {
    pro: 'Deep funnel and cohort analysis for product decisions',
    con: 'Steeper learning curve for non-technical stakeholders',
    best_for: 'Product teams tracking user behavior and retention',
    not_for: 'Marketing-only analytics or pure content sites',
  },
  'push-in-app-messaging': {
    pro: 'Drives re-engagement with targeted push and in-app messages',
    con: 'Overuse leads to notification fatigue and opt-outs',
    best_for: 'Mobile apps focused on retention and re-engagement',
    not_for: 'B2B tools where push notifications are irrelevant',
  },
  'realtime-websocket': {
    pro: 'Managed pub/sub infrastructure removes server ops burden',
    con: 'Connection-based pricing can be unpredictable',
    best_for: 'Apps with live features: chat, collaboration, gaming',
    not_for: 'Purely request-response apps with no real-time needs',
  },
  'release-app-store': {
    pro: 'Automates app store submissions and release management',
    con: 'Tight coupling to app store review process timelines',
    best_for: 'Mobile teams shipping frequent app updates',
    not_for: 'Web-only products without native app distribution',
  },
  'search-recommendations': {
    pro: 'Sub-50ms search with managed indexing and relevance tuning',
    con: 'Pricing jumps sharply above free tier record limits',
    best_for: 'E-commerce and content platforms needing fast search',
    not_for: 'Simple CRUD apps with basic filtering needs',
  },
  'secrets-management': {
    pro: 'Centralizes secrets with audit logs and rotation policies',
    con: 'Adds a runtime dependency that can become a bottleneck',
    best_for: 'Teams managing credentials across multiple environments',
    not_for: 'Single-developer projects with minimal secrets',
  },
  'security-scanning': {
    pro: 'Integrates into CI/CD for developer-friendly security checks',
    con: 'False positives require ongoing developer triage time',
    best_for: 'Dev teams needing SAST, DAST, or SCA in the pipeline',
    not_for: 'Projects with no regulatory or security compliance needs',
  },
  'session-replay': {
    pro: 'Reveals exactly how users interact with your product',
    con: 'Privacy compliance (GDPR/CCPA) requires careful configuration',
    best_for: 'Product and UX teams diagnosing conversion drop-offs',
    not_for: 'Backend services or APIs with no user interface',
  },
  'subscription-billing': {
    pro: 'Handles recurring billing, dunning, and revenue recognition',
    con: 'Revenue-based or per-seat pricing grows with scale',
    best_for: 'SaaS products with complex subscription plans',
    not_for: 'One-time purchase or usage-only billing models',
  },
  'test-automation': {
    pro: 'Parallel test execution across real devices reduces flakiness',
    con: 'Device cloud minutes add up for large test suites',
    best_for: 'Mobile and web teams needing cross-device coverage',
    not_for: 'Projects with minimal UI or no regression testing needs',
  },
};

// Default fallback template
const DEFAULT_TEMPLATE: CategoryTemplate = {
  pro: 'Streamlines development workflows',
  con: 'Pricing can grow with usage',
  best_for: 'Development teams',
  not_for: 'Projects that do not require this category of tooling',
};

// --- Pricing note helper ---
function pricingNote(c: CompanyData): string {
  const p = c.pricing;
  if (!p) return '';
  const model = p.model ?? '';
  const entry = p.entry_price;
  const freeTier = p.has_free_tier;

  if (model === 'free' || model === 'open-source') return 'It is free and open-source';
  if (model === 'freemium' && entry) return `It offers a free tier with paid plans from ${entry}`;
  if (model === 'freemium') return 'It offers a free tier with paid plans available';
  if (model === 'usage' && entry) return `It uses usage-based pricing starting at ${entry}`;
  if (model === 'flat' && entry) return `It offers flat-rate pricing from ${entry}`;
  if (model === 'subscription' && entry) return `It starts at ${entry} per month`;
  if (entry) return `Pricing starts at ${entry}`;
  if (freeTier) return 'It offers a free tier to get started';
  return '';
}

// --- Verdict builder ---
function buildVerdict(c: CompanyData): string {
  const catName = c.categories?.primary?.name ?? 'developer tool';
  const name = c.name;
  const note = pricingNote(c);

  if (note) {
    return `${name} is a ${catName} tool. ${note}.`;
  }
  return `${name} is a ${catName} tool.`;
}

// --- Main ---
function main() {
  const files = readdirSync(COMPANIES_DIR).filter(f => f.endsWith('.json'));
  console.log(`Total company files: ${files.length}`);

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const filePath = join(COMPANIES_DIR, file);
    let company: CompanyData;

    try {
      company = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      console.error(`  ERROR reading ${file}`);
      errors++;
      continue;
    }

    // Skip if already has a review
    if (company.review) {
      skipped++;
      continue;
    }

    const catSlug = company.categories?.primary?.slug ?? '';
    const template = CATEGORY_TEMPLATES[catSlug] ?? DEFAULT_TEMPLATE;

    const review = {
      verdict: buildVerdict(company),
      pros: [template.pro],
      cons: [template.con],
      best_for: template.best_for,
      not_for: template.not_for,
    };

    company.review = review;

    try {
      writeFileSync(filePath, JSON.stringify(company, null, 2) + '\n');
      generated++;
    } catch {
      console.error(`  ERROR writing ${filePath}`);
      errors++;
    }
  }

  // Final tally
  const totalWithReviews = files.length - errors; // all successfully processed
  console.log(`\nDone.`);
  console.log(`  Generated: ${generated} new reviews`);
  console.log(`  Already had review (skipped): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total companies with reviews now: ${generated + skipped}`);
}

main();
