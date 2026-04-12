# Dev Tools Portal — Project Rules

## Stack

- **Framework:** Astro 5.x (Content Collections, Islands Architecture)
- **Styling:** Tailwind CSS 4.x (utility-first, no custom CSS unless unavoidable)
- **Language:** TypeScript (strict mode)
- **Data:** JSON files in `data/` directory (no CMS, no database)
- **Search:** Pagefind (static, client-side)
- **Hosting:** Cloudflare Pages
- **Bot:** GitHub Actions cron (every 6 hours)
- **AI:** DeepSeek via OpenRouter SDK (OpenAI-compatible)

## Directory Structure

- `src/pages/` — Astro pages (routes)
- `src/components/` — Astro components (.astro files)
- `src/layouts/` — Layout wrappers
- `src/utils/` — TypeScript helpers
- `src/styles/` — Global CSS (Tailwind)
- `data/companies/` — 630 JSON files (one per company)
- `data/categories/` — 42 JSON files (one per category)
- `data/comparisons/` — Comparison pairs data
- `data/meta/` — Registry index, timestamps
- `scripts/` — Node.js scripts for data pipeline (seed, fetch, summarize)
- `public/logos/` — Company logos (PNG, 128x128)

## Code Conventions

- **Language:** English for code, variables, functions, filenames
- **Comments:** Only where logic is non-obvious. No JSDoc for simple functions
- **Naming:** camelCase for variables/functions, PascalCase for components, kebab-case for files/slugs
- **Imports:** Use Astro's built-in `import.meta.glob` for data loading where appropriate
- **Types:** Define in `src/types/` if shared across 3+ files, inline otherwise
- **Components:** One component per file. Props interface at top of file

## Data Rules

- JSON files are the source of truth — never hardcode company data in templates
- Slugs are derived from company names: lowercase, hyphens, no special chars (e.g. "auth0" not "Auth0")
- All dates in ISO 8601 format: `2026-04-12T06:00:00Z`
- Scores are integers 0-5 (lock_in, transparency, developer_experience)
- Prices stay as strings (e.g. "2.9% + $0.30") — don't parse into numbers

## SEO Rules

- Every page MUST have unique `<title>` and `<meta name="description">`
- Every company/category/comparison page MUST have JSON-LD structured data
- Use `<link rel="canonical">` on every page
- No JavaScript-rendered content for critical SEO text (Astro handles this by default)
- Sitemap auto-generated via `@astrojs/sitemap`

## What NOT To Do

- Do NOT add a CMS, database, or backend server
- Do NOT use React/Vue/Svelte islands unless interactive widget requires it
- Do NOT fetch external APIs at build time for pages (data comes from pre-fetched JSON)
- Do NOT commit node_modules, .env files, or API keys
- Do NOT create README.md or documentation files unless asked
- Do NOT add analytics/tracking scripts in v1
- Do NOT over-engineer: no abstractions for single-use patterns

## Git

- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `data:`)
- `data:` prefix for bot-generated data updates
- Branch strategy: `main` only for MVP (no feature branches needed for solo dev)

## Performance Targets

- Build time: < 20 seconds for 850+ pages
- Page weight: < 50KB per page (no JS by default)
- Lighthouse: 95+ on all metrics
- Zero client-side JS except for Pagefind search
