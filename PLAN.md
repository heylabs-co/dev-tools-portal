# Dev Tools Portal — Implementation Plan

> Автоматический каталог 630+ developer tools с уникальными мета-метриками.
> Solo developer, MVP за 2 недели, $0/мес на старте.

---

## 1. Архитектурные решения

| Компонент | Решение | Почему |
|-----------|---------|--------|
| Framework | **Astro 5.x** | Cloudflare купил Astro; build 1,400 страниц за 10-15 сек; Content Collections для JSON |
| Data | **JSON-файлы в Git** | Нет CMS, нет БД, версионирование через Git, бот пишет напрямую |
| Хостинг | **Cloudflare Pages** | Бесплатный, безлимитный bandwidth, 500 builds/мес, 300+ PoP |
| Бот | **GitHub Actions cron** | Бесплатно для public repos, 2,000 мин/мес для private |
| AI-саммари | **DeepSeek через OpenRouter** | $0.14/1M tokens, ~$1.60/мес на 50 обновлений/день |
| Поиск | **Pagefind** | Static client-side search, 0 зависимостей, работает offline |
| Стоимость | **$0/мес** | Всё на бесплатных тирах |

---

## 2. Структура проекта

```
dev-tools-portal/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── PLAN.md
├── CLAUDE.md
│
├── public/
│   ├── robots.txt
│   ├── favicon.svg
│   └── logos/                    # Логотипы: Clearbit Logo API → fallback favicon
│       └── {slug}.png
│
├── src/
│   ├── content/
│   │   └── config.ts             # Astro Content Collections schema
│   │
│   ├── layouts/
│   │   ├── BaseLayout.astro      # HTML head, meta, footer
│   │   └── CompanyLayout.astro   # Layout для карточки компании
│   │
│   ├── components/
│   │   ├── Header.astro          # Навигация + поиск
│   │   ├── Footer.astro
│   │   ├── CompanyCard.astro     # Карточка в списке (категория)
│   │   ├── PricingTable.astro    # Таблица тарифов
│   │   ├── LockInBadge.astro     # Бейдж Lock-in Score (Low/Med/High)
│   │   ├── MetricBar.astro       # Визуализация метрик (шкала 0-5)
│   │   ├── ComparisonTable.astro # Таблица X vs Y
│   │   ├── CategoryGrid.astro   # Сетка карточек категории
│   │   ├── SearchBar.astro       # Pagefind wrapper
│   │   ├── Breadcrumbs.astro
│   │   └── SchemaOrg.astro       # JSON-LD structured data
│   │
│   ├── pages/
│   │   ├── index.astro           # Главная: категории + featured tools
│   │   ├── search.astro          # Страница поиска
│   │   ├── about.astro
│   │   │
│   │   ├── tools/
│   │   │   ├── index.astro       # Все 630 tools (фильтры, сортировка)
│   │   │   └── [slug].astro      # Карточка компании (динамическая)
│   │   │
│   │   ├── categories/
│   │   │   ├── index.astro       # Все 42 категории
│   │   │   └── [slug].astro      # Категория с компаниями
│   │   │
│   │   ├── compare/
│   │   │   └── [pair].astro              # Comparison page (pair = "stripe-vs-adyen")
│   │   │
│   │   └── pricing/
│   │       └── [slug].astro      # Детальная страница pricing
│   │
│   ├── utils/
│   │   ├── data.ts               # Хелперы для загрузки JSON
│   │   ├── seo.ts                # Генерация meta tags, OG
│   │   ├── scores.ts             # Расчёт Lock-in Score, TCO
│   │   └── comparisons.ts        # Генерация пар для compare pages
│   │
│   └── styles/
│       └── global.css            # Tailwind или vanilla CSS
│
├── data/
│   ├── companies/
│   │   ├── stripe.json           # 630 файлов — по одному на компанию
│   │   ├── supabase.json
│   │   └── ...
│   │
│   ├── categories/
│   │   ├── payment-gateway.json  # 42 файла — по одному на категорию
│   │   └── ...
│   │
│   ├── comparisons/
│   │   └── top-pairs.json        # Топ-100 пар для "X vs Y" страниц
│   │
│   └── meta/
│       ├── registry.json         # Индекс: slug → company_id mapping
│       └── last-updated.json     # Timestamp последнего обновления
│
├── scripts/
│   ├── seed-from-csv.ts          # Конвертация master_registry.csv → JSON
│   ├── fetch-github.ts           # GitHub Releases API crawler
│   ├── fetch-npm.ts              # npm registry versions
│   ├── fetch-hn.ts               # Hacker News mentions
│   ├── generate-comparisons.ts   # Генерация top-100 пар
│   ├── generate-sitemap.ts       # XML sitemap
│   └── summarize-releases.ts     # AI-саммари через OpenRouter
│
└── .github/
    └── workflows/
        ├── update-data.yml       # Cron каждые 6 часов
        └── deploy.yml            # Build + deploy на Cloudflare Pages
```

---

## 3. JSON-схема карточки компании

Файл: `data/companies/{slug}.json`

```json
{
  "id": "COMP-0001",
  "slug": "stripe",
  "name": "Stripe",
  "description": "Payment processing platform for internet businesses",
  "website": "https://stripe.com",
  "logo": "/logos/stripe.png",
  "founded": 2010,
  "hq_country": "US",
  "status": "active",

  "categories": {
    "primary": {
      "id": "CAT-02",
      "slug": "payment-gateway",
      "name": "Payment Gateway / PSP"
    },
    "secondary": ["CAT-03", "CAT-04", "CAT-38"]
  },

  "github": {
    "repo": "stripe/stripe-node",
    "stars": 3800,
    "last_release": {
      "version": "17.5.0",
      "date": "2026-04-10",
      "summary": "Added support for Terminal readers in EU regions",
      "url": "https://github.com/stripe/stripe-node/releases/tag/v17.5.0"
    },
    "release_frequency_days": 7,
    "open_issues": 42,
    "contributors": 180
  },

  "npm": {
    "package": "stripe",
    "weekly_downloads": 2500000,
    "latest_version": "17.5.0"
  },

  "pricing": {
    "model": "usage",
    "has_free_tier": true,
    "free_tier_limits": "No monthly fee, pay per transaction",
    "entry_price": "2.9% + $0.30/transaction",
    "enterprise_available": true,
    "billing_complexity": "low",
    "pricing_url": "https://stripe.com/pricing",
    "transparency_score": 5,
    "last_checked": "2026-04-12"
  },

  "scale": {
    "customers": "5M+ businesses",
    "revenue": "$19.4B (2025)",
    "employees": "8000+",
    "valuation": "$159B (2025, R40 confirmed)",
    "data_status": "confirmed"
  },

  "scores": {
    "lock_in": {
      "level": "medium",
      "score": 3,
      "migration_complexity": "medium",
      "data_portability": "PCI data export, CSV, limited token migration",
      "api_compatibility": "proprietary",
      "explanation": "Token migration causes 15-30% churn; deep integration with Stripe-specific features"
    },
    "time_to_first_value_minutes": 30,
    "developer_experience": 5
  },

  "community": {
    "stackoverflow_questions": 45000,
    "hn_mentions_30d": 12,
    "reddit_sentiment": "positive"
  },

  "alternatives": ["adyen", "braintree", "paddle", "lemonsqueezy"],

  "seo": {
    "title": "Stripe Review 2026: Pricing, Alternatives & Lock-in Score",
    "meta_description": "Complete Stripe analysis: pricing calculator, lock-in risk (3/5), migration difficulty, and comparison with Adyen, Braintree, Paddle.",
    "keywords": ["stripe pricing", "stripe alternatives", "stripe vs adyen", "stripe review"]
  },

  "updated_at": "2026-04-12T06:00:00Z",
  "created_at": "2026-04-01T00:00:00Z"
}
```

### JSON-схема категории

Файл: `data/categories/{slug}.json`

```json
{
  "id": "CAT-02",
  "slug": "payment-gateway",
  "name": "Payment Gateway / PSP",
  "section": "A. Payments",
  "description": "Payment processing services that handle online transactions",
  "ai_native": false,
  "company_count": 28,
  "companies": ["stripe", "adyen", "braintree", "paddle", "..."],

  "seo": {
    "title": "Best Payment Gateway Tools 2026 — Compare 28 Solutions",
    "meta_description": "Compare 28 payment gateways: pricing, lock-in scores, migration difficulty. Stripe vs Adyen vs Paddle side-by-side.",
    "h1": "Payment Gateway / PSP Tools"
  }
}
```

### JSON-схема comparison

Файл: `data/comparisons/top-pairs.json`

```json
[
  {
    "slug_a": "stripe",
    "slug_b": "adyen",
    "category": "payment-gateway",
    "search_volume": 5400,
    "seo": {
      "title": "Stripe vs Adyen 2026: Pricing, Lock-in & Migration Compared",
      "meta_description": "Side-by-side comparison of Stripe and Adyen: pricing models, lock-in risk, developer experience, and total cost of ownership."
    }
  }
]
```

---

## 4. Список страниц

| Тип | Кол-во | URL-паттерн | Пример |
|-----|--------|-------------|--------|
| Главная | 1 | `/` | — |
| Все tools | 1 | `/tools/` | — |
| Карточка компании | 630 | `/tools/{slug}/` | `/tools/stripe/` |
| Все категории | 1 | `/categories/` | — |
| Страница категории | 42 | `/categories/{slug}/` | `/categories/payment-gateway/` |
| Pricing deep-dive (v1: top-80) | 80 (v1) / 630 (v2) | `/pricing/{slug}/` | `/pricing/stripe/` |
| Comparison (X vs Y) | 100 | `/compare/{pair}/` | `/compare/stripe-vs-adyen/` |
| Поиск | 1 | `/search/` | — |
| About | 1 | `/about/` | — |
| **Итого (v1)** | **~857** | | |

### MVP (v1) — что включаем:

- 630 карточек компаний (базовые данные из CSV + GitHub)
- 42 страницы категорий
- 100 comparison pages (топ пары по search volume)
- **80 pricing deep-dive pages** (top-80 компаний, данные из R10 — главный SEO-магнит)
- Главная + поиск + about
- **Итого: ~855 страниц**

### v2 — что добавляем позже:

- Оставшиеся 550 pricing pages (скрапинг pricing pages)
- Email digest
- Keystatic CMS для ручного редактирования
- User reviews/ratings
- API access

---

## 5. Data Pipeline архитектура

### 5.1 Seed Pipeline (однократно, при запуске)

```
master_registry.csv (630 строк)
        │
        ▼
  seed-from-csv.ts
        │
  Обогащение из research-файлов:
  ├── R09_scale_metrics.md  → scale {}
  ├── R10_pricing_matrix.md → pricing {}
  └── R17_lockin_portability.md → scores.lock_in {}
        │
        ▼
  data/companies/*.json (630 файлов)
  data/categories/*.json (42 файла)
  data/meta/registry.json
```

### 5.2 Bot Pipeline (каждые 6 часов через GitHub Actions)

```
┌─────────────────────────────────────────────┐
│         GitHub Actions Cron (*/6 hours)      │
└─────────┬───────────┬───────────┬───────────┘
          │           │           │
     ┌────▼────┐ ┌────▼────┐ ┌───▼─────┐
     │ GitHub  │ │   npm   │ │   HN    │
     │Releases │ │Registry │ │   API   │
     │  API    │ │  API    │ │         │
     └────┬────┘ └────┬────┘ └───┬─────┘
          │           │           │
          └─────┬─────┘───────────┘
                │
         ┌──────▼──────┐
         │  Aggregator  │  Мержит новые данные в существующие JSON
         │  (Node.js)   │
         └──────┬──────┘
                │
         ┌──────▼──────┐
         │  AI Summary  │  DeepSeek через OpenRouter
         │  (optional)  │  Только для новых releases
         └──────┬──────┘
                │
         ┌──────▼──────┐
         │  Git Commit  │  Автокоммит изменённых JSON
         │  + Push      │
         └──────┬──────┘
                │
         ┌──────▼──────┐
         │  Cloudflare  │  Auto-deploy on push
         │  Pages Build │  (Astro build ~15 сек)
         └─────────────┘
```

### 5.3 API endpoints и rate limits

| API | Rate Limit | Запросов/цикл | Стоимость |
|-----|-----------|---------------|-----------|
| GitHub Releases | 5,000/час (auth) | ~1,890 (630×3) | Бесплатно |
| npm Registry | 5,000/час | ~630 | Бесплатно |
| Hacker News | Без лимита | ~50 | Бесплатно |
| Stack Overflow | 10,000/день | ~630 (1×/день) | Бесплатно |
| OpenRouter (DeepSeek) | 200 req/day (free) | ~50 | $0-1.60/мес |

### 5.4 GitHub Actions workflow

```yaml
# .github/workflows/update-data.yml
name: Update Tool Data
on:
  schedule:
    - cron: '0 */6 * * *'   # Каждые 6 часов
  workflow_dispatch: {}       # Ручной запуск

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: node scripts/fetch-github.ts
        env:
          GITHUB_TOKEN: ${{ secrets.GH_PAT }}
      - run: node scripts/fetch-npm.ts
      - run: node scripts/fetch-hn.ts
      - run: node scripts/summarize-releases.ts
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_KEY }}
      - name: Commit & Push
        run: |
          git config user.name "devtools-bot"
          git config user.email "bot@devtools-portal.com"
          git add data/
          git diff --cached --quiet || git commit -m "chore: update tool data $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          git push
```

---

## 6. SEO-стратегия

### 6.1 Meta Tags (в BaseLayout.astro)

```html
<!-- Каждая страница получает уникальные: -->
<title>{seo.title}</title>
<meta name="description" content="{seo.meta_description}" />
<link rel="canonical" href="https://devtools.example.com{pathname}" />

<!-- Open Graph -->
<meta property="og:title" content="{seo.title}" />
<meta property="og:description" content="{seo.meta_description}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="{canonical}" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
```

### 6.2 Structured Data (JSON-LD)

**Карточка компании → SoftwareApplication:**
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Stripe",
  "url": "https://stripe.com",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "description": "Free tier available, usage-based pricing"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "bestRating": "5",
    "worstRating": "1",
    "ratingCount": "45000"
  }
}
```

**Comparison page → WebPage с ComparisonTable:**
```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Stripe vs Adyen 2026",
  "description": "...",
  "mainEntity": {
    "@type": "ItemList",
    "numberOfItems": 2,
    "itemListElement": [
      { "@type": "SoftwareApplication", "name": "Stripe" },
      { "@type": "SoftwareApplication", "name": "Adyen" }
    ]
  }
}
```

**Категория → CollectionPage + ItemList:**
```json
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Best Payment Gateway Tools 2026",
  "mainEntity": {
    "@type": "ItemList",
    "numberOfItems": 28,
    "itemListElement": [...]
  }
}
```

### 6.3 Sitemap

Генерируется автоматически при каждом build (Astro `@astrojs/sitemap`).

```xml
<!-- Приоритеты: -->
<!-- Comparison pages: priority 0.9, changefreq weekly -->
<!-- Category pages: priority 0.8, changefreq weekly -->
<!-- Company pages: priority 0.7, changefreq daily -->
<!-- Pricing pages: priority 0.7, changefreq weekly -->
```

### 6.4 robots.txt

```
User-agent: *
Allow: /
Sitemap: https://devtools.example.com/sitemap-index.xml

# Block search/filter pages with params
Disallow: /search?*
```

### 6.5 Целевые ключевые фразы

| Тип запроса | Пример | KD | Volume | Страница |
|-------------|--------|-----|--------|----------|
| X pricing | "stripe pricing" | Easy | 5-10K/мес | `/pricing/stripe/` |
| X vs Y | "stripe vs adyen" | Easy-Med | 1-5K/мес | `/compare/stripe-vs-adyen/` |
| X alternatives | "firebase alternatives" | Easy | 2-10K/мес | `/tools/firebase/` (секция alternatives) |
| best X tools | "best payment gateway 2026" | Med | 500-3K/мес | `/categories/payment-gateway/` |
| X review | "supabase review 2026" | Easy | 1-3K/мес | `/tools/supabase/` |

---

## 7. Уникальные мета-метрики (дифференциаторы)

Ни у одного конкурента этих метрик нет:

### 7.1 Lock-in Score (0-5)

| Score | Label | Значение |
|-------|-------|----------|
| 0-1 | **Low** (зелёный) | Стандартные протоколы, OSS альтернативы, легко уйти |
| 2-3 | **Medium** (жёлтый) | Proprietary расширения, но данные exportable |
| 4-5 | **High** (красный) | Глубокая интеграция, proprietary формат, дорогой switch |

Источник: данные из R17_lockin_portability.md (уже есть для 630 компаний).

### 7.2 Migration Difficulty

Текстовое описание + badge (Низкая/Средняя/Высокая).
Включает: data portability, API compatibility, estimated migration time.

### 7.3 Pricing Transparency Score (1-5)

| Score | Значение |
|-------|----------|
| 5 | Все цены на сайте, калькулятор |
| 4 | Основные тарифы видны, enterprise = contact sales |
| 3 | Только entry price видна |
| 2 | "Starting at $X", детали скрыты |
| 1 | Полностью "Contact Sales" |

### 7.4 Time-to-First-Value (минуты)

Сколько времени от signup до первого работающего API call.
v1: заполняем вручную для top-50, остальные — "N/A".

---

## 8. Стратегия логотипов

630 логотипов вручную скачивать нереально. Автоматический pipeline:

### Приоритет 1: Clearbit Logo API (бесплатный)

```
https://logo.clearbit.com/{domain}?size=128&format=png
```

Пример: `https://logo.clearbit.com/stripe.com?size=128&format=png`

- Бесплатный, без API key
- Покрывает ~90% компаний (все крупные SaaS)
- Размер: 128×128 PNG

### Приоритет 2: Favicon fallback

```
https://www.google.com/s2/favicons?domain={domain}&sz=128
```

- Google Favicon API, бесплатный
- Для компаний без Clearbit логотипа

### Приоритет 3: Placeholder

Генерация SVG-placeholder с инициалами компании и цветом категории.

### Реализация в seed script:

```
seed-from-csv.ts:
  1. Для каждой компании → fetch Clearbit logo
  2. Если 404 → fetch Google Favicon
  3. Если 404 → генерируем placeholder SVG
  4. Сохраняем в public/logos/{slug}.png
```

В боте логотипы обновляются 1 раз в неделю (не каждые 6 часов).

---

## 9. Comparison Pages — генерация топ-100 пар

### Алгоритм выбора пар:

1. Взять все компании внутри одной категории
2. Отсортировать по `scale.revenue` или `github.stars` (descending)
3. Для каждой категории взять top-5 компаний
4. Сгенерировать все пары: C(5,2) = 10 пар на категорию
5. Из 42 категорий × 10 = 420 пар → выбрать top-100 по search volume

### Топ-20 пар (очевидные):

| Пара | Категория |
|------|-----------|
| Stripe vs Adyen | Payments |
| Stripe vs Paddle | Payments |
| Auth0 vs Clerk | Auth |
| Firebase vs Supabase | BaaS |
| Supabase vs Neon | DBaaS |
| Datadog vs Grafana | Observability |
| Sentry vs Datadog | Crash/APM |
| Algolia vs Meilisearch | Search |
| Twilio vs Sendgrid | Messaging |
| Amplitude vs Mixpanel | Analytics |
| PostHog vs Amplitude | Analytics |
| LaunchDarkly vs Flagsmith | Feature Flags |
| Vercel vs Netlify | CDN/Edge |
| Cloudflare vs Fastly | CDN |
| PlanetScale vs Neon | DBaaS |
| Prisma vs Drizzle | ORM (если есть) |
| CircleCI vs GitHub Actions | CI/CD |
| Snyk vs SonarQube | Security |
| Contentful vs Sanity | CMS (если есть) |
| OpenAI vs Anthropic | AI APIs |

---

## 10. MVP Scope — 2 недели

### Неделя 1: Data + Infrastructure

| День | Задача | Результат |
|------|--------|-----------|
| Пн | Astro init + Tailwind + базовый layout | Проект поднят, BaseLayout работает |
| Пн | Seed script: CSV → JSON (630 компаний) | `data/companies/*.json` готовы |
| Вт | Обогащение JSON: scale + pricing + lock-in из research | Полные карточки для top-100 |
| Вт | GitHub API скрипт + npm скрипт | `scripts/fetch-github.ts`, `fetch-npm.ts` |
| Ср | GitHub Actions workflow (cron) | Бот обновляет данные каждые 6 ч |
| Ср | Категории seed: taxonomy → JSON (42 файла) | `data/categories/*.json` |
| Чт | AI-саммари скрипт (OpenRouter) | `scripts/summarize-releases.ts` |
| Чт | Генератор comparison пар (top-100) | `data/comparisons/top-pairs.json` |
| Пт | Cloudflare Pages deploy pipeline | Auto-deploy on push работает |
| Пт | Тестирование бота end-to-end | Полный цикл: cron → fetch → commit → deploy |

### Неделя 2: UI + SEO + Polish

| День | Задача | Результат |
|------|--------|-----------|
| Пн | Главная страница + Header/Footer | `/` готова |
| Пн | Страница категории + CategoryGrid | `/categories/[slug]/` |
| Вт | Карточка компании (полная) | `/tools/[slug]/` с метриками, lock-in, pricing |
| Вт | CompanyCard компонент (для листинга) | Красивые карточки в категориях |
| Ср | Comparison page template | `/compare/[a]-vs-[b]/` |
| Ср | ComparisonTable компонент | Таблица side-by-side |
| Чт | Pagefind search integration | Поиск работает на `/search/` |
| Чт | SEO: meta tags, JSON-LD, sitemap, robots.txt | Structured data на всех страницах |
| Пт | Responsive дизайн, polish, тёмная тема | Mobile-ready |
| Пт | Финальный deploy + smoke test | Сайт live на Cloudflare Pages |

### v1 содержит:

- [x] 630 карточек компаний с базовыми данными
- [x] 42 страницы категорий
- [x] 100 comparison pages
- [x] Lock-in Score + Migration Difficulty для всех компаний
- [x] Базовая pricing info (model, free tier, entry price)
- [x] Pagefind search
- [x] JSON-LD structured data
- [x] Auto-sitemap
- [x] GitHub Actions бот (6-hour refresh)
- [x] Cloudflare Pages hosting

### v2 (после MVP, недели 3-6):

- [ ] 630 pricing deep-dive pages (скрапинг pricing pages)
- [ ] Pricing history tracking (changedetection.io)
- [ ] Stack Overflow integration (adoption metrics)
- [ ] Hacker News sentiment feed
- [ ] Email digest (weekly updates)
- [ ] Keystatic CMS UI
- [ ] Dark mode toggle
- [ ] OG image generation (per page)
- [ ] Affiliate links integration
- [ ] Sponsored listing tiers

---

## 11. Стек зависимостей

```json
{
  "dependencies": {
    "astro": "^5.x",
    "@astrojs/sitemap": "^3.x",
    "@astrojs/tailwind": "^5.x",
    "tailwindcss": "^4.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "pagefind": "^1.x",
    "@types/node": "^22.x"
  }
}
```

Scripts (Node.js, запускаются в GitHub Actions):
- `octokit` — GitHub API client
- `node-fetch` или built-in fetch — для npm/HN API
- `openai` — OpenRouter совместим с OpenAI SDK

---

## 12. Реализация — 2 последовательных фазы

Worktrees с 4 агентами → merge conflicts. Проще и надёжнее — 2 последовательных фазы:

### Фаза A: Data Foundation (сначала)

1. Astro init + конфигурация + Tailwind
2. Seed script: CSV → JSON (630 компаний + 42 категории)
3. Обогащение из R09, R10, R17 (scale, pricing, lock-in)
4. Логотипы через Clearbit API
5. GitHub Actions workflow
6. Scripts: fetch-github, fetch-npm, fetch-hn, summarize-releases
7. Генерация comparison pairs (top-100)

### Фаза B: UI + SEO (после того как data/ готова)

1. BaseLayout + Header + Footer
2. Главная страница
3. Страницы категорий (`[slug].astro`)
4. Карточка компании (`[slug].astro`)
5. Comparison pages (`[pair].astro`)
6. Pricing pages для top-80 (`[slug].astro`)
7. SEO: JSON-LD SchemaOrg, meta tags, sitemap, robots.txt
8. Pagefind search
9. Responsive + polish

Внутри каждой фазы можно распараллелить отдельные файлы через агентов, но без worktrees — все работают в одном дереве.

---

## 13. Ключевые метрики успеха

| Метрика | Target (месяц 1) | Target (месяц 3) |
|---------|-------------------|-------------------|
| Страниц в индексе Google | 200+ | 1,000+ |
| Органический трафик | 1,000/мес | 20,000/мес |
| Данные обновляются | Каждые 6 часов | Каждые 6 часов |
| Uptime | 99.9% | 99.9% |
| Build time | <20 сек | <20 сек |
| Стоимость хостинга | $0 | $0 |
