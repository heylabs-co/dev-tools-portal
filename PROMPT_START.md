# Промпт для запуска реализации Dev Tools Portal

Скопируй весь текст ниже и вставь как промпт в Claude Code в директории `/Users/ilia/Developer/Dev Tools Portal/`

---

Ты — senior full-stack developer. Твоя задача: реализовать Dev Tools Portal по утверждённому плану.

## Контекст

План утверждён: `/Users/ilia/Developer/Dev Tools Portal/PLAN.md` — прочитай полностью.
Code conventions: `/Users/ilia/Developer/Dev Tools Portal/CLAUDE.md` — следуй строго.

## Seed-данные (обязательно прочитать при seed)

- Реестр 630 компаний: `/Users/ilia/Documents/Playground/research/00_meta/master_registry.csv`
- Таксономия 42 категории: `/Users/ilia/Documents/Playground/research/01_universe/R02_taxonomy.md`
- Scale metrics (top-80): `/Users/ilia/Documents/Playground/research/02_company_profiles/R09_scale_metrics.md`
- Pricing (top-80): `/Users/ilia/Documents/Playground/research/02_company_profiles/R10_pricing_matrix.md`
- Lock-in (top-80): `/Users/ilia/Documents/Playground/research/02_company_profiles/R17_lockin_portability.md`
- Funding (top-80): `/Users/ilia/Documents/Playground/research/02_company_profiles/R08_funding_ledger.md`
- Evidence ledger: `/Users/ilia/Documents/Playground/research/05_deliverables/R40_evidence_ledger_top80.csv`
- Notebook (общая картина): `/Users/ilia/Documents/Playground/research/DevTools_Market_Research.ipynb`

## Критические правки к плану (утверждены)

1. **Comparison route**: использовать `[pair].astro` вместо `[slugA]-vs-[slugB].astro`. Парсить `stripe-vs-adyen` внутри page.
2. **Логотипы**: использовать Clearbit Logo API (`https://logo.clearbit.com/{domain}`) как primary. Fallback: первая буква названия в цветном круге. НЕ скачивать 630 файлов вручную.
3. **Pricing pages для top-80 в v1**: добавить базовые pricing pages (`/pricing/[slug]/`) для компаний, у которых данные есть в R10. Не все 630, а только ~80 с данными.
4. **Valuation в примерах**: брать актуальные данные из R40_evidence_ledger, не из примера в PLAN.md.

## Порядок выполнения

Работай последовательно. После каждого шага — коммит. Используй мульти-агентов для параллельных задач внутри шагов.

### Шаг 1: Инициализация проекта
- `npm create astro@latest` в текущей директории
- Установить зависимости: `@astrojs/sitemap`, `@astrojs/tailwind`, `tailwindcss`, `pagefind`
- Настроить `astro.config.mjs` (site URL placeholder, sitemap, tailwind)
- Создать структуру директорий из PLAN.md секция 2
- Создать `src/content/config.ts` с Zod-схемой из PLAN.md секция 3
- git init + первый коммит

### Шаг 2: Seed data pipeline
- Написать `scripts/seed-from-csv.ts`: читает master_registry.csv → создаёт 630 JSON файлов в `data/companies/`
- Обогатить JSON из R09, R10, R17, R08 для top-80 компаний (scale, pricing, lock_in, funding)
- Для остальных 550 компаний: базовые поля (name, website, category, status, country)
- Написать seed для `data/categories/` (42 файла) из R02_taxonomy.md
- Написать `scripts/generate-comparisons.ts`: top-100 пар
- Создать `data/meta/registry.json`
- Запустить seed, проверить что все JSON валидны
- Коммит

### Шаг 3: Layouts и базовые компоненты
Используй мульти-агентов параллельно:
- **Агент A**: `BaseLayout.astro` (HTML head, meta, OG, footer), `Header.astro`, `Footer.astro`, `Breadcrumbs.astro`
- **Агент B**: `CompanyCard.astro`, `LockInBadge.astro`, `MetricBar.astro`, `CategoryGrid.astro`
- **Агент C**: `ComparisonTable.astro`, `PricingTable.astro`, `SchemaOrg.astro`, `SearchBar.astro`
- Все компоненты должны принимать типизированные props
- Tailwind для стилей, тёмная тема через `prefers-color-scheme`
- Коммит

### Шаг 4: Pages
Используй мульти-агентов параллельно:
- **Агент A**: `index.astro` (главная), `about.astro`, `search.astro`
- **Агент B**: `tools/index.astro` (все 630), `tools/[slug].astro` (карточка компании)
- **Агент C**: `categories/index.astro` (все 42), `categories/[slug].astro` (листинг)
- **Агент D**: `compare/[pair].astro` (comparison), `pricing/[slug].astro` (top-80)
- Каждая страница: уникальный title, meta description, JSON-LD, canonical
- Коммит

### Шаг 5: Data bot (GitHub Actions)
- `scripts/fetch-github.ts` — GitHub Releases API для repos из JSON
- `scripts/fetch-npm.ts` — npm registry weekly downloads
- `scripts/fetch-hn.ts` — Hacker News mentions
- `scripts/summarize-releases.ts` — AI-саммари через OpenRouter
- `.github/workflows/update-data.yml` — cron workflow из PLAN.md
- `.github/workflows/deploy.yml` — Cloudflare Pages deploy
- Коммит

### Шаг 6: SEO и polish
- `src/utils/seo.ts` — генерация meta tags
- `src/components/SchemaOrg.astro` — JSON-LD для всех типов страниц
- `public/robots.txt`
- Pagefind integration в build pipeline
- Responsive проверка
- Финальный коммит

### Шаг 7: Deploy
- Cloudflare Pages setup (manual step — дай мне инструкцию)
- Smoke test: проверить 5 случайных страниц каждого типа
- Проверить sitemap, robots.txt, structured data через Google Rich Results Test

## Правила работы

- Читай CLAUDE.md перед каждым шагом
- Каждый шаг = отдельный коммит с описательным сообщением
- Не переходи к следующему шагу пока текущий не работает
- При ошибке: диагностируй → исправь → проверь → только потом дальше
- Мульти-агенты: используй для параллельных задач ВНУТРИ шага, не между шагами
- Не создавай README.md, не добавляй лишнюю документацию
- Используй данные из research файлов, не выдумывай метрики

## Начинай с Шага 1 прямо сейчас.
