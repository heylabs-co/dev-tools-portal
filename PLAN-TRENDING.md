# Plan: GitHub Trending & Repository Indexing at Scale

## Цель

Автоматически индексировать тысячи developer tool репозиториев с GitHub,
показывать trending на сайте, и использовать данные для AI-рекомендатора.

---

## Архитектура

```
GitHub API (Topics + Trending + Search)
        │
        ▼
┌───────────────────┐
│  Daily Indexer     │  GitHub Actions (ежедневно)
│  (discover + rank) │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  data/repos/       │  JSON файлы (по категориям)
│  ├── trending.json │  Топ-50 trending за неделю
│  ├── new.json      │  Новые за последние 7 дней
│  └── index/        │  Полный индекс по категориям
│      ├── auth.json │
│      ├── db.json   │
│      └── ...       │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  Astro Pages       │  /trending/ — страница trending
│  + JSON endpoint   │  /api/repos.json — для рекомендатора
└───────────────────┘
```

---

## Источники данных (все бесплатные)

### 1. GitHub Topics API
```
GET /search/repositories?q=topic:developer-tools&sort=stars&per_page=100
GET /search/repositories?q=topic:sdk&sort=updated&per_page=100
GET /search/repositories?q=topic:api&sort=stars&per_page=100
GET /search/repositories?q=topic:cli-tool&sort=stars&per_page=100
```
Топики для мониторинга:
- developer-tools, sdk, api, cli, framework
- authentication, database, analytics, monitoring
- payment, search, messaging, testing, ci-cd
- machine-learning, ai, llm, vector-database

Rate limit: 30 req/мин (unauth), 5000/час (auth). Достаточно для 1000+ репо/день.

### 2. GitHub Trending (scraping)
```
https://github.com/trending?since=daily
https://github.com/trending?since=weekly
https://github.com/trending/typescript?since=weekly
https://github.com/trending/go?since=weekly
```
Фильтр: только repos matching наших категорий.

### 3. GitHub Events API (опционально, v2)
```
GET /events?per_page=100
```
Real-time поток: watch, star, fork events. Можно определять "набирающие скорость".

---

## Схема данных

### Repo JSON (data/repos/index/{slug}.json)
```json
{
  "full_name": "supabase/supabase",
  "name": "supabase",
  "description": "The open source Firebase alternative",
  "url": "https://github.com/supabase/supabase",
  "homepage": "https://supabase.com",
  "stars": 78000,
  "forks": 7200,
  "open_issues": 350,
  "language": "TypeScript",
  "topics": ["database", "postgresql", "firebase-alternative"],
  "license": "Apache-2.0",
  "created_at": "2020-01-01",
  "updated_at": "2026-04-15",
  "pushed_at": "2026-04-15",
  "stars_growth_7d": 450,
  "stars_growth_30d": 1800,
  "category_slug": "backend-as-a-service",
  "company_slug": "supabase",  // link to our company if exists
  "trending_score": 85,
  "indexed_at": "2026-04-15"
}
```

### Trending JSON (data/repos/trending.json)
```json
{
  "updated_at": "2026-04-15",
  "daily": [...top 20 repos],
  "weekly": [...top 50 repos],
  "rising": [...repos with highest stars_growth_7d]
}
```

---

## Масштабирование

### Phase 1: 1,000 repos (MVP)
- GitHub Topics API: 10 topics × 100 repos = 1,000
- JSON файлы в git (~500KB)
- Страница /trending/ со статическим build

### Phase 2: 5,000 repos
- 50 topics мониторинг
- Split JSON по категориям (~2MB total)
- Cloudflare KV для быстрого доступа (опционально)

### Phase 3: 10,000+ repos
- Cloudflare D1 для хранения вместо JSON файлов
- API endpoint через Worker для запросов
- Full-text search через D1 FTS5
- Не хранить в git — слишком много файлов

### Phase 4: Real-time
- GitHub Webhooks для star events
- Cloudflare Worker принимает webhook → обновляет D1
- /trending/ обновляется каждый час, не раз в день

---

## AI Рекомендатор — как использует repo data

```
User: "I need a fast database for my SaaS"
        │
        ▼
Рекомендатор (DeepSeek/OpenRouter):
1. Ищет в company data (803+ companies): pricing, lock-in, features
2. Ищет в repo index (1000+ repos): stars, growth, activity
3. Комбинирует: "Neon (trending ↑450 stars/week, low lock-in, $5/mo)"
4. Отдаёт персонализированный ответ с ссылками
```

Repo data обогащает рекомендации:
- "Trending this week" = social proof
- Stars growth = adoption velocity
- Recent push = actively maintained
- Open issues ratio = quality signal
- License = important for enterprise

---

## GitHub Actions Workflows

### daily-index.yml (ежедневно, 6am UTC)
1. Fetch GitHub Topics API (10 topics × 100)
2. Fetch Trending page (daily + weekly)
3. Calculate trending_score = stars_growth_7d × 2 + forks_7d
4. Match repos to our categories
5. Update data/repos/trending.json
6. Update data/repos/index/*.json
7. Commit + push

### weekly-deep-scan.yml (воскресенье, 3am UTC)
1. Full scan: 50 topics × 100 repos = 5,000
2. Update stars_growth_30d для всех
3. Пометить "dead" repos (no push > 6 months)
4. Обновить company links (match repo → company by domain)
5. Commit + push

---

## Страницы на сайте

### /trending/ (новая)
- "Trending Developer Tools This Week"
- Top 20 daily trending с stars growth
- Top 50 weekly
- "Rising Stars" — fastest growing
- Filter by category
- Card: repo name, description, stars, growth ↑, language, category

### /tools/[slug]/ (обновление)
- Добавить секцию "GitHub Activity":
  - Stars: 78,000 (↑450 this week)
  - Last commit: 2 hours ago
  - Open issues: 350
  - License: Apache-2.0

---

## Стоимость
- GitHub API: бесплатно (с GH_PAT = 5000 req/час)
- Storage: JSON в git (Phase 1-2), D1 free tier (Phase 3+)
- Compute: GitHub Actions free (public repo)
- Total: $0/мес

---

## Приоритет реализации

1. [ ] Script: `scripts/index-github-repos.ts` — fetch + categorize
2. [ ] Workflow: `daily-index.yml`
3. [ ] Data: `data/repos/trending.json`
4. [ ] Page: `/trending/` с карточками
5. [ ] Update tool pages с GitHub activity section
6. [ ] JSON endpoint для рекомендатора: `public/api/repos.json`
7. [ ] Интеграция с AI рекомендатором
