/**
 * Generate review fields for the top 100 developer tool companies.
 * "Top 100" = companies with the most complete data: pricing + lock_in + scale + content.
 *
 * Adds a "review" field to each selected company JSON:
 * {
 *   verdict: string,
 *   pros: string[],
 *   cons: string[],
 *   best_for: string,
 *   not_for: string
 * }
 *
 * Usage: npx tsx scripts/generate-reviews.ts
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
    billing_complexity?: string;
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

// --- Score each company by data completeness ---
function dataScore(c: CompanyData): number {
  let score = 0;
  if (c.pricing?.model) score += 1;
  if (c.pricing?.entry_price) score += 1;
  if (c.scores?.lock_in?.level) score += 2;
  if (c.scores?.lock_in?.explanation) score += 1;
  if (c.scale?.customers || c.scale?.revenue || c.scale?.valuation) score += 2;
  if (c.content?.when_to_use?.length) score += 3;
  if (c.content?.when_not_to_use?.length) score += 2;
  if (c.community?.hn_mentions_30d) score += 1;
  return score;
}

// --- Pricing string helpers ---
function pricingDescription(c: CompanyData): string {
  const p = c.pricing;
  if (!p) return 'custom pricing';
  const model = p.model ?? 'usage';
  const entry = p.entry_price;
  if (model === 'free' || model === 'open-source') return 'free / open-source';
  if (model === 'freemium' && entry) return `freemium, paid from ${entry}`;
  if (model === 'freemium') return 'freemium';
  if (model === 'usage' && entry) return `usage-based at ${entry}`;
  if (model === 'flat' && entry) return `flat rate at ${entry}`;
  if (model === 'subscription' && entry) return `subscription from ${entry}`;
  if (entry) return entry;
  return model;
}

function lockInSummary(c: CompanyData): string {
  const li = c.scores?.lock_in;
  if (!li) return '';
  const level = li.level ?? 'medium';
  if (level === 'low') return 'low vendor lock-in';
  if (level === 'high') return 'high vendor lock-in';
  return 'moderate vendor lock-in';
}

// --- Derive verdict (1-2 sentences) ---
function generateVerdict(c: CompanyData): string {
  const cat = c.categories?.primary?.name ?? 'developer tool';
  const pricing = pricingDescription(c);
  const lockIn = lockInSummary(c);
  const whenToUse = c.content?.when_to_use ?? [];
  const name = c.name;

  // Build context from when_to_use if available
  if (whenToUse.length >= 2) {
    const primary = whenToUse[0]
      .replace(/^(Need |Want |Use )/i, '')
      .replace(/\s+—.+$/, '')
      .trim();
    // Capitalise first letter
    const audience = primary.charAt(0).toUpperCase() + primary.slice(1).toLowerCase();

    const lockInNote = lockIn ? ` ${lockIn.charAt(0).toUpperCase() + lockIn.slice(1)}.` : '';
    return `Best for ${audience.toLowerCase()}. ${name} offers ${pricing}.${lockInNote}`;
  }

  // Fallback: name + category + pricing
  return `${name} is a leading ${cat.toLowerCase()} tool with ${pricing}. Good for teams that need reliable, well-documented ${cat.toLowerCase()} capabilities.`;
}

// --- Derive pros (2-3 items) ---
function generatePros(c: CompanyData): string[] {
  const pros: string[] = [];
  const whenToUse = c.content?.when_to_use ?? [];
  const li = c.scores?.lock_in;
  const cat = c.categories?.primary?.slug ?? '';

  // Derive from when_to_use
  for (const use of whenToUse.slice(0, 2)) {
    // Convert "SaaS with global customers needing fast integration" -> "Fast integration for global SaaS"
    const cleaned = use
      .replace(/^(Need |Want |Use )/i, '')
      .replace(/\s+—.+$/, '')
      .trim();
    if (cleaned.length > 5) pros.push(cleaned);
  }

  // Add lock-in positive note
  if (li?.level === 'low') {
    pros.push('Low lock-in — easy to migrate away');
  } else if (li?.level === 'medium' && li.explanation) {
    // Extract a positive from explanation if possible
    const exp = li.explanation;
    if (exp.includes('export')) pros.push('Data export available for migrations');
    else if (exp.includes('open-source') || exp.includes('standard SQL')) pros.push('Open-source underpinnings reduce lock-in');
  }

  // Category-specific bonus pros
  const catPros: Record<string, string> = {
    'payment-gateway': 'Excellent developer documentation and SDKs',
    'identity-auth': 'Wide range of social login and MFA options',
    'backend-as-a-service': 'Faster time-to-market vs. building from scratch',
    'apm': 'Deep integrations across the observability stack',
    'feature-flags': 'Gradual rollouts reduce deployment risk',
    'cdn-edge': 'Global edge network for low-latency delivery',
    'search-recommendations': 'Sub-50ms search with managed indexing',
    'ai-api-sdk': 'State-of-the-art models with REST API access',
    'ci-cd': 'Automated pipelines reduce manual deployment errors',
    'observability': 'Centralized logs, metrics, and traces in one place',
    'product-analytics': 'Deep funnel and cohort analysis capabilities',
    'messaging-api': 'Multi-channel delivery (SMS, email, voice) from one API',
    'security-scanning': 'Integrates into CI/CD for developer-friendly security',
    'compliance-automation': 'Continuous evidence collection saves audit prep time',
    'iap-optimization': 'Cross-platform entitlement management out of the box',
    'crash-reporting': 'Real-time error alerts with full stack traces',
    'dbaas': 'Managed infrastructure removes ops overhead',
    'realtime-websocket': 'Managed pub/sub removes server infrastructure burden',
  };

  if (pros.length < 3 && catPros[cat]) {
    pros.push(catPros[cat]);
  }

  // Ensure free tier mention if relevant
  if (pros.length < 3 && c.pricing?.has_free_tier) {
    pros.push('Generous free tier for getting started');
  }

  return pros.slice(0, 3);
}

// --- Derive cons (2-3 items) ---
function generateCons(c: CompanyData): string[] {
  const cons: string[] = [];
  const whenNotToUse = c.content?.when_not_to_use ?? [];
  const li = c.scores?.lock_in;
  const p = c.pricing;
  const cat = c.categories?.primary?.slug ?? '';

  // Derive from when_not_to_use — keep the em-dash clause as it's the informative part
  for (const not of whenNotToUse.slice(0, 2)) {
    // Strip leading "Need X — use Y" -> keep "Need X" (the problem statement)
    // Strip trailing "— consider X" recommendation, keep the concern
    let cleaned = not.trim();
    // Remove trailing " — use/consider/try ..." recommendation
    cleaned = cleaned.replace(/\s+—\s+(use|consider|try|look at)\s+.+$/i, '');
    // Shorten sentences that start with modal verbs by trimming to the concern
    cleaned = cleaned.replace(/^(Startup|Teams|Budget-conscious)\s+watching\s+/i, 'Expensive for ');
    if (cleaned.length > 5 && cleaned.length <= 120) cons.push(cleaned);
  }

  // Add lock-in negative note
  if (li?.level === 'high') {
    cons.push('High lock-in — proprietary APIs make migration difficult');
  } else if (li?.level === 'medium' && li.explanation) {
    const exp = li.explanation;
    if (exp.includes('token') || exp.includes('proprietary')) {
      cons.push('Proprietary data formats add switching costs');
    }
  }

  // Pricing-based con
  if (cons.length < 3 && p?.billing_complexity === 'high') {
    cons.push('Complex billing model — costs can be hard to predict');
  }

  // Category-specific cons
  const catCons: Record<string, string> = {
    'payment-gateway': 'Per-transaction fees add up at high volume',
    'identity-auth': 'MAU-based pricing scales steeply',
    'backend-as-a-service': 'Limited customization for complex business logic',
    'apm': 'Per-host / per-seat billing grows fast with team size',
    'feature-flags': 'Limited value for very small teams or solo developers',
    'cdn-edge': 'Proprietary edge functions create platform dependency',
    'search-recommendations': 'Pricing jumps sharply above free tier limits',
    'ai-api-sdk': 'Inference costs unpredictable at scale',
    'ci-cd': 'Compute minutes can add up for large monorepos',
    'observability': 'Data ingestion pricing can spike unexpectedly',
    'product-analytics': 'Steeper learning curve for non-technical stakeholders',
    'messaging-api': 'Per-message pricing adds up at high send volumes',
    'security-scanning': 'False positives require developer triage time',
    'compliance-automation': 'Requires initial setup effort to map controls',
    'iap-optimization': 'Revenue share or platform fees apply',
    'crash-reporting': 'Event-volume pricing can surprise at scale',
    'dbaas': 'Storage and compute costs grow with data volume',
    'realtime-websocket': 'Connection pricing can be unpredictable',
  };

  if (cons.length < 3 && catCons[cat]) {
    cons.push(catCons[cat]);
  }

  return cons.slice(0, 3);
}

// --- Derive best_for ---
function generateBestFor(c: CompanyData): string {
  const whenToUse = c.content?.when_to_use ?? [];
  const cat = c.categories?.primary?.name ?? '';

  if (whenToUse.length > 0) {
    // Extract key audiences from use cases
    const keywords: string[] = [];
    for (const use of whenToUse) {
      // Extract the context (SaaS, enterprise, startup, etc.)
      const match = use.match(/\b(SaaS|startup|enterprise|mobile|e-commerce|B2B|teams|companies|apps|developers|fintech|marketplace|global)\b/i);
      if (match) keywords.push(match[1]);
    }
    if (keywords.length > 0) {
      return [...new Set(keywords)].join(', ');
    }
    // Fall back to first use case trimmed
    return whenToUse[0].replace(/\s+—.+$/, '').slice(0, 80);
  }

  return `Teams needing ${cat.toLowerCase()} capabilities`;
}

// --- Derive not_for ---
function generateNotFor(c: CompanyData): string {
  const whenNotToUse = c.content?.when_not_to_use ?? [];

  if (whenNotToUse.length > 0) {
    // Extract key anti-patterns
    const keywords: string[] = [];
    for (const not of whenNotToUse) {
      const match = not.match(/\b(solo|offline|static|internal|budget|pre-launch|simple|non-technical|small|hobby)\b/i);
      if (match) keywords.push(match[1].toLowerCase());
    }
    if (keywords.length > 0) {
      return [...new Set(keywords)].map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(', ') + ' projects';
    }
    // Fall back to first not-for trimmed
    return whenNotToUse[0].replace(/\s+—.+$/, '').slice(0, 80);
  }

  return 'Projects that do not require this category of tooling';
}

// --- Main ---
function main() {
  const files = readdirSync(COMPANIES_DIR).filter(f => f.endsWith('.json'));
  const allCompanies: CompanyData[] = files.map(f =>
    JSON.parse(readFileSync(join(COMPANIES_DIR, f), 'utf-8'))
  );

  // Score all companies
  const scored = allCompanies.map(c => ({ company: c, score: dataScore(c) }));
  scored.sort((a, b) => b.score - a.score);

  // Top 100
  const top100 = scored.slice(0, 100);

  console.log(`\nTop 100 companies by data completeness:`);
  console.log(`Min score in top 100: ${top100[99].score}`);
  console.log(`Max score: ${top100[0].score}`);
  console.log('');

  let generated = 0;
  let skipped = 0;

  for (const { company, score } of top100) {
    const filePath = join(COMPANIES_DIR, `${company.slug}.json`);

    const review = {
      verdict: generateVerdict(company),
      pros: generatePros(company),
      cons: generateCons(company),
      best_for: generateBestFor(company),
      not_for: generateNotFor(company),
    };

    company.review = review;

    try {
      writeFileSync(filePath, JSON.stringify(company, null, 2) + '\n');
      console.log(`[${score}] ${company.name}: ${review.verdict.slice(0, 70)}...`);
      generated++;
    } catch {
      console.error(`  ERROR writing ${filePath}`);
      skipped++;
    }
  }

  console.log(`\n✓ Generated reviews for ${generated} companies (${skipped} errors).`);
  console.log(`  Files updated in data/companies/`);
}

main();
