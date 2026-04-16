import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const githubSchema = z.object({
  repo: z.string().optional(),
  stars: z.number().optional(),
  last_release: z.object({
    version: z.string(),
    date: z.string(),
    summary: z.string().optional(),
    url: z.string().optional(),
  }).optional(),
  release_frequency_days: z.number().optional(),
  open_issues: z.number().optional(),
  contributors: z.number().optional(),
}).optional();

const npmSchema = z.object({
  package: z.string().optional(),
  weekly_downloads: z.number().optional(),
  latest_version: z.string().optional(),
}).optional();

const pricingSchema = z.object({
  model: z.enum(['usage', 'subscription', 'freemium', 'seat', 'hybrid', 'credit', 'per-connection', 'mau', 'event', 'unknown']).optional(),
  has_free_tier: z.boolean().optional(),
  free_tier_limits: z.string().optional(),
  entry_price: z.string().optional(),
  enterprise_available: z.boolean().optional(),
  billing_complexity: z.enum(['low', 'medium', 'high']).optional(),
  pricing_url: z.string().optional(),
  transparency_score: z.number().min(1).max(5).optional(),
  last_checked: z.string().optional(),
}).optional();

const scaleSchema = z.object({
  customers: z.string().optional(),
  revenue: z.string().optional(),
  employees: z.string().optional(),
  valuation: z.string().optional(),
  data_status: z.enum(['confirmed', 'estimated', 'partial']).optional(),
}).optional();

const lockInSchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
  score: z.number().min(0).max(5),
  migration_complexity: z.enum(['low', 'medium', 'high']).optional(),
  data_portability: z.string().optional(),
  api_compatibility: z.string().optional(),
  explanation: z.string().optional(),
}).optional();

const companies = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './data/companies',
    generateId: ({ entry }) => entry.replace(/\.json$/, ''),
  }),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().optional(),
    website: z.string(),
    logo: z.string().optional(),
    founded: z.number().optional(),
    hq_country: z.string().optional(),
    status: z.enum(['active', 'inactive']).default('active'),

    categories: z.object({
      primary: z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
      }),
      secondary: z.array(z.string()).optional(),
    }),

    github: githubSchema,
    npm: npmSchema,
    pricing: pricingSchema,
    scale: scaleSchema,

    scores: z.object({
      lock_in: lockInSchema,
      time_to_first_value_minutes: z.number().optional(),
      developer_experience: z.number().min(0).max(5).optional(),
    }).optional(),

    community: z.object({
      stackoverflow_questions: z.number().optional(),
      hn_mentions_30d: z.number().optional(),
      reddit_sentiment: z.enum(['positive', 'neutral', 'negative', 'unknown']).optional(),
    }).optional(),

    alternatives: z.array(z.string()).optional(),

    content: z.object({
      when_to_use: z.array(z.string()).optional(),
      when_not_to_use: z.array(z.string()).optional(),
      consider_instead: z.array(z.string()).optional(),
      pricing_at_scale: z.array(z.object({
        scale: z.string(),
        estimate: z.string(),
      })).optional(),
      migration_cheatsheet: z.object({
        difficulty: z.string().optional(),
        data_you_keep: z.string().optional(),
        api_standard: z.string().optional(),
        risk_notes: z.string().optional(),
        tip: z.string().optional(),
      }).optional(),
      works_well_with: z.array(z.string()).optional(),
    }).optional(),

    seo: z.object({
      title: z.string(),
      meta_description: z.string(),
      keywords: z.array(z.string()).optional(),
    }).optional(),

    updated_at: z.string().optional(),
    created_at: z.string().optional(),
  }),
});

const categories = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './data/categories',
    generateId: ({ entry }) => entry.replace(/\.json$/, ''),
  }),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    section: z.string().optional(),
    description: z.string().optional(),
    ai_native: z.boolean().default(false),
    company_count: z.number().default(0),
    companies: z.array(z.string()).default([]),

    seo: z.object({
      title: z.string(),
      meta_description: z.string(),
      h1: z.string().optional(),
    }).optional(),
  }),
});

const mcpServers = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './data/mcp-servers',
    generateId: ({ entry }) => entry.replace(/\.json$/, ''),
  }),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    github_repo: z.string().optional(),
    npm_package: z.string().optional(),
    author: z.string().optional(),
    category: z.string().optional(),
    tools_count: z.number().optional(),
    install_command: z.string().optional(),
    official: z.boolean().default(false),
    seo: z.object({
      title: z.string(),
      meta_description: z.string(),
    }).optional(),
  }),
});

const skills = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './data/ai-skills-catalog',
    generateId: ({ entry }) => entry.replace(/\.json$/, ''),
  }),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    source_url: z.string().optional(),
    author: z.string().optional(),
    category: z.string().optional(),
    framework: z.string().optional(),
    format: z.string().optional(),
    stars: z.number().optional(),
  }),
});

const extensions = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './data/vscode-catalog',
    generateId: ({ entry }) => entry.replace(/\.json$/, ''),
  }),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    publisher: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    installs: z.string().optional(),
    vscode_id: z.string().optional(),
    seo: z.object({
      title: z.string(),
      meta_description: z.string(),
    }).optional(),
  }),
});

export const collections = { companies, categories, mcpServers, skills, extensions };
