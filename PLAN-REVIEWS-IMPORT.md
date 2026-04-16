# Plan: Import Reviews & Ratings from External Sources

## Tier 1: Easy (free API, no auth or simple auth)

| Source | What we get | API | Auth | Batch size |
|--------|-------------|-----|------|-----------|
| **GitHub Issues** | Complaints, feature requests, sentiment | REST API | GH_TOKEN | 100/batch |
| **GitHub Discussions** | User opinions, Q&A | GraphQL API | GH_TOKEN | 100/batch |
| **GitHub Stars history** | Adoption trend over time | REST API | GH_TOKEN | 100/batch |
| **npm downloads** | Weekly/monthly trends | registry API | None | 500/batch |
| **Hacker News** | Mentions, sentiment, discussions | Algolia API | None | All at once |
| **Stack Overflow** | Question count, tag popularity | SO API | None | 200/batch |
| **PyPI downloads** | Python package popularity | BigQuery/API | None | 200/batch |

### Batch plan for Tier 1:
- Batch 1: GitHub Issues sentiment for top 100 (need GH_TOKEN)
- Batch 2: GitHub Issues for next 200
- Batch 3: GitHub Discussions for top 100
- Batch 4: Stack Overflow question counts for top 500
- Batch 5: npm download trends (weekly history) for all with npm.package
- Batch 6: HN deep sentiment (not just count, but positive/negative)

---

## Tier 2: Medium (free but needs scraping or rate-limited)

| Source | What we get | Method | Difficulty |
|--------|-------------|--------|-----------|
| **Reddit** | Developer opinions, complaints | Reddit JSON API (rate limited) | Medium |
| **Dev.to** | Articles mentioning tools | RSS/API | Medium |
| **Twitter/X** | Developer mentions | Scraping (API $100/mo) | Medium |
| **Product Hunt** | Launch ratings, reviews | Scraping (no free API) | Medium |
| **AlternativeTo** | User ratings, alternatives | Scraping | Medium |
| **Trustpilot** | B2B reviews | Scraping | Medium |

### Batch plan for Tier 2:
- Batch 1: Reddit r/webdev, r/devops, r/node mentions for top 200 tools
- Batch 2: Dev.to articles mentioning top 100 tools
- Batch 3: Product Hunt ratings for tools that launched there
- Batch 4: AlternativeTo ratings scraping

---

## Tier 3: Hard (paid, auth-heavy, or anti-scraping)

| Source | What we get | Method | Difficulty |
|--------|-------------|--------|-----------|
| **G2** | Star ratings, review count, pros/cons | Scraping (heavy anti-bot) | Hard |
| **Capterra** | Ratings, review snippets | Scraping (Cloudflare protected) | Hard |
| **TrustRadius** | Enterprise reviews | API (paid) | Hard |
| **Gartner Peer Insights** | Enterprise ratings | Scraping | Hard |
| **Glassdoor** | Company health signal | Scraping | Hard |

### Approach for Tier 3:
- Use Apify/ScrapingBee ($50-100/mo) for G2/Capterra
- Or: aggregrate G2 scores from meta tags (simpler than full scrape)
- Or: use third-party datasets (some available on Kaggle)
- Defer to v2 unless ROI justifies cost

---

## Data schema for imported reviews

```json
"external_reviews": {
  "github": {
    "issue_sentiment": "positive",  // positive/mixed/negative
    "common_complaints": ["pricing changed", "breaking API"],
    "common_praise": ["great docs", "fast support"],
    "response_time_hours": 4,
    "issues_last_30d": 15,
    "discussions_count": 230
  },
  "stackoverflow": {
    "questions_count": 45000,
    "questions_trend": "growing"  // growing/stable/declining
  },
  "hackernews": {
    "mentions_30d": 12,
    "sentiment": "positive",
    "top_comment": "Best payment API by far"
  },
  "reddit": {
    "mentions_30d": 8,
    "sentiment": "mixed",
    "subreddits": ["r/webdev", "r/node"]
  },
  "g2": {
    "rating": 4.5,
    "review_count": 1200,
    "top_pro": "Easy to integrate",
    "top_con": "Expensive at scale"
  },
  "npm": {
    "weekly_downloads": 2500000,
    "download_trend": "growing"  // +15% MoM
  }
}
```

---

## Priority order

1. **GitHub Issues + Discussions** → most valuable, free, easy
2. **Stack Overflow counts** → free, easy, great SEO signal
3. **npm/PyPI trends** → free, easy, adoption metric
4. **Reddit mentions** → free-ish, medium effort
5. **G2 ratings** → high value but hard to get
6. **Product Hunt ratings** → medium value, medium effort

## Execution

Start with Tier 1 in batches of 100-200 companies.
Need GH_TOKEN for GitHub data.
Scripts: scripts/import-github-reviews.ts, scripts/import-stackoverflow.ts, etc.
Each script should be idempotent (skip already-processed).
Run via GitHub Actions weekly: .github/workflows/import-reviews.yml
