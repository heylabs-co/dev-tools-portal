# Migration Guides Hallucination Report

_Generated 2026-04-27 from 500 guides in `data/migrations/`._


## Summary

- **Guides reviewed:** 500
- **Guides flagged:** 40
- **Total flags:** 48
  - High: 14
  - Medium: 14
  - Low: 20


## Methodology

Each batch of 50 guides was reviewed by a separate agent looking for:
1. Invented API endpoints (paths asserted without "consult docs" hedge)
2. Invented prices (specific $ amounts/tiers stated as fact)
3. Invented feature names (capitalized names that sound made up)
4. Invented deprecation/sunset dates
5. Specific quotas/limits stated without source

Public concepts (DKIM, OAuth, JWT, S3, REST, etc.) were NOT flagged.


## High severity (14)

### `adyen-to-2checkout.json` — adyen → 2checkout
- **Field:** gotchas
- **Quote:** "2Checkout's GitHub SDKs show stale activity (last commit 1000+ days ago); validate SDK currency directly with 2Checkout support"
- **Issue:** Very specific 'last commit 1000+ days ago' claim about a third-party vendor's GitHub repository activity, asserted as fact — likely hallucinated since this would require live repo inspection

### `adyen-to-square.json` — adyen → square
- **Field:** why_switch
- **Quote:** "Predictable subscription tier from $30/mo"
- **Issue:** Square is primarily a transaction-fee-based PSP, not subscription-based at $30/mo — this specific subscription tier appears fabricated; Square has no widely-known $30/mo flat subscription tier for pay

### `aider-to-bolt-new.json` — aider → bolt-new
- **Field:** gotchas
- **Quote:** "The Bolt.new repo health signals show low recent activity, so monitor product direction"
- **Issue:** Bolt.new is a hosted product by StackBlitz, not primarily a public repo; claim about 'repo health signals' showing 'low recent activity' is asserted as fact and contradicts the platform's known active

### `alloy-to-kount.json` — alloy → kount
- **Field:** why_switch
- **Quote:** "Kount has public pricing starting at $0.07 per event"
- **Issue:** Specific dollar amount stated as fact. Kount pricing is typically enterprise/sales-led and not publicly listed at a per-event rate; this looks like an invented price.

### `appsflyer-to-airbridge.json` — appsflyer → airbridge
- **Field:** why_switch
- **Quote:** "More predictable cost via subscription vs. $0.05-0.07/install metering"
- **Issue:** Specific per-install price range for AppsFlyer stated as fact without source — AppsFlyer pricing is custom/opaque, this looks fabricated.

### `appsflyer-to-airbridge.json` — appsflyer → airbridge
- **Field:** why_switch
- **Quote:** "Airbridge publishes pricing from $199/month with a 15K-install free tier"
- **Issue:** Specific monthly price and free-tier install quota for Airbridge stated confidently — these are exact numbers that would need verification against current public pricing and could easily be invented.

### `branch-to-airbridge.json` — branch → airbridge
- **Field:** why_switch
- **Quote:** "Branch pricing is opaque; Airbridge publishes from $199/month"
- **Issue:** Specific Airbridge monthly price stated as fact — same suspicious figure as in appsflyer-to-airbridge; likely hallucinated.

### `branch-to-airbridge.json` — branch → airbridge
- **Field:** why_switch
- **Quote:** "Includes 15K attributed installs free for early-stage testing"
- **Issue:** Specific free-tier quota (15K installs) stated as fact without source or hedge — pricing tiers like this often change and reading like an invented detail.

### `castle-io-to-kount.json` — castle-io → kount
- **Field:** why_switch
- **Quote:** "Public entry pricing at $0.07 per event"
- **Issue:** Specific dollar-per-event price stated as fact. Kount pricing is generally not publicly documented at this granularity; this looks fabricated. Reinforced later by 'Pricing tiers above the entry rate a

### `convert-to-togglz.json` — convert → togglz
- **Field:** why_switch
- **Quote:** "Eliminate the $599/mo Convert subscription for teams that only need feature flags"
- **Issue:** Specific Convert subscription price stated as fact. Convert.com pricing is not publicly $599/mo at a single tier and varies; this looks invented.

### `courier-to-clevertap.json` — courier → clevertap
- **Field:** gotchas
- **Quote:** "Pricing jumps from freemium to subscription starting at $75 — re-budget early"
- **Issue:** Specific dollar amount ($75) for CleverTap pricing stated as fact without source or hedge

### `fingerprintjs-to-kount.json` — fingerprintjs → kount
- **Field:** why_switch
- **Quote:** "Public entry pricing at $0.07 per event"
- **Issue:** Specific Kount price ($0.07 per event) stated as fact without source or hedge

### `seon-to-kount.json` — seon → kount
- **Field:** why_switch
- **Quote:** "Public entry pricing at $0.07 per event"
- **Issue:** Invented specific price ($0.07/event) stated as fact without hedge. Kount does not publicly publish per-event pricing at this number; this looks fabricated.

### `vatstack-to-fonoa.json` — vatstack → fonoa
- **Field:** concept_mapping
- **Quote:** "Paid subscription from $5"
- **Issue:** Specific dollar amount stated as fact for Fonoa pricing. Fonoa is enterprise-sales-led with no public $5 plan; this looks like an invented price. The same entry hedges with 'Validate current pricing o


## Medium severity (14)

### `100ms-to-daily.json` — 100ms → daily
- **Field:** why_switch
- **Quote:** "Lower entry pricing on Daily for small workloads compared to 100ms's $500/mo starting tier"
- **Issue:** Specific $500/mo starting tier for 100ms stated as fact without 'verify on official pricing page' hedge — pricing tiers change and could be fabricated

### `100ms-to-dyte.json` — 100ms → dyte
- **Field:** why_switch
- **Quote:** "Dyte offers a freemium tier that lowers the floor compared to 100ms's $500/mo entry price"
- **Issue:** Specific $500/mo entry price for 100ms asserted as fact; same suspect figure as 100ms-to-daily, no source or hedge

### `ably-to-daily.json` — ably → daily
- **Field:** why_switch
- **Quote:** "Lower entry pricing relative to Ably's $29/mo tier"
- **Issue:** Specific $29/mo tier for Ably stated as fact without hedge — Ably's actual entry pricing varies and may not match this exact figure

### `ably-to-dyte.json` — ably → dyte
- **Field:** why_switch
- **Quote:** "Freemium entry tier lowers cost floor versus Ably's $29/mo"
- **Issue:** Same Ably $29/mo claim as fact across multiple files; no source/hedge — likely invented

### `alloy-to-kount.json` — alloy → kount
- **Field:** why_switch
- **Quote:** "Free tier available for getting started"
- **Issue:** Kount is an enterprise fraud-prevention product without a documented self-serve free tier; this claim sounds invented and contradicts the gotcha about negotiating volume.

### `auth0-to-clerk.json` — auth0 → clerk
- **Field:** why_switch
- **Quote:** "Generous free tier up to 50K MAU"
- **Issue:** Specific MAU quota for Clerk's free tier stated as fact — Clerk's free tier limits are subject to change; should be hedged with 'verify current limits'.

### `baremetrics-to-avo.json` — baremetrics → avo
- **Field:** why_switch
- **Quote:** "Avo has a freemium tier vs. Baremetrics' $129/mo entry price"
- **Issue:** Specific dollar amount for Baremetrics' entry price stated as fact without 'as of date' or 'consult docs' hedge — vendor pricing tiers change and this could be inaccurate.

### `buildkite-to-github-actions.json` — buildkite → github-actions
- **Field:** why_switch
- **Quote:** "2,000 free minutes/month on private repos"
- **Issue:** Specific quota stated confidently without a source or hedge. GitHub Actions quotas have changed over time and depend on plan tier; this should reference docs.

### `castle-io-to-kount.json` — castle-io → kount
- **Field:** gotchas
- **Quote:** "Pricing tiers above the entry rate are not public; negotiate volume"
- **Issue:** Restates the suspect $0.07 'entry rate' as if confirmed; together they fabricate a pricing structure.

### `cockroachdb-to-neon-acquired-by-databricks.json` — cockroachdb → neon-acquired-by-databricks
- **Field:** concept_mapping
- **Quote:** "Usage-based with $5/mo minimum (Launch)"
- **Issue:** Specific Neon plan name 'Launch' and $5/mo minimum stated as fact without 'consult docs' hedge. Neon's plan tiers and prices are not stable enough to assert without source.

### `elasticsearch-to-pinecone.json` — elasticsearch → pinecone
- **Field:** why_switch
- **Quote:** "Sub-50ms ANN queries at scale without tuning Lucene"
- **Issue:** Specific latency quota (sub-50ms) stated as fact without source

### `feather-icons-to-sketch.json` — feather-icons → sketch
- **Field:** gotchas
- **Quote:** "Feather has only ~280 icons; expect to supplement with another set inside Sketch"
- **Issue:** Specific icon count (~280) stated as fact; Feather's actual count differs

### `react-native-iap-to-flutter-inapp-purchase.json` — react-native-iap → flutter-inapp-purchase
- **Field:** why_switch
- **Quote:** "Active maintenance on the Flutter library aligns with current StoreKit 2 and Play Billing 8"
- **Issue:** Specific Play Billing major version '8' asserted as fact without hedge. Should be verified against current docs rather than stated confidently.

### `seon-to-kount.json` — seon → kount
- **Field:** why_switch
- **Quote:** "Free tier for getting started"
- **Issue:** Kount does not publicly advertise a free tier for fraud scoring; appears invented as a confident bullet.


## Low severity (20)

### `bitrise-to-codemagic.json` — bitrise → codemagic
- **Field:** why_switch
- **Quote:** "Public subscription pricing from $0/month"
- **Issue:** Specific dollar figure ($0/month) framed as a public subscription tier — borderline; Codemagic does offer a free tier but the framing could mislead and lacks a 'verify current pricing' hedge.

### `bucket-to-ff4j.json` — bucket → ff4j
- **Field:** gotchas
- **Quote:** "FF4J 2.0.0 was released in early 2023; release cadence is slower than SaaS competitors — verify current activity before committing"
- **Issue:** Specific version number and release-date claim stated as fact without a 'verify in docs' hedge — version/date is the kind of detail an LLM is likely to invent or get wrong.

### `composio-to-mindsdb.json` — composio → mindsdb
- **Field:** tldr
- **Quote:** "MindsDB is an open-source federated data engine that lets you query 200+ data sources via SQL and natural language"
- **Issue:** Specific quota '200+ data sources' stated as fact without hedge or source citation.

### `convert-to-ff4j.json` — convert → ff4j
- **Field:** why_switch
- **Quote:** "Choose from 20+ database backends for flag persistence"
- **Issue:** Specific quota '20+ database backends' stated without source. FF4J supports several stores but the exact number is uncertain.

### `convert-to-go-feature-flag.json` — convert → go-feature-flag
- **Field:** why_switch
- **Quote:** "15+ language SDKs via the relay proxy for polyglot stacks"
- **Issue:** Specific quota '15+ language SDKs' stated as fact without consulting current docs.

### `convert-to-vercel-flags-sdk.json` — convert → vercel-flags-sdk
- **Field:** import_method
- **Quote:** "choose an adapter for the provider that will actually evaluate flags (LaunchDarkly, Statsig, Optimizely, ConfigCat, DevCycle, Hypertune, or Flipt)"
- **Issue:** Specific list of supported Flags SDK adapter providers asserted as fact. The actual Flags SDK adapter list may differ; should be hedged with 'consult docs'.

### `freee-to-fonoa.json` — freee → fonoa
- **Field:** why_switch
- **Quote:** "Selling into 40+ countries and need global VAT/GST coverage"
- **Issue:** Specific country count for Fonoa coverage stated as fact without a source hedge; Fonoa marketing varies on this number.

### `freee-to-fonoa.json` — freee → fonoa
- **Field:** email.body
- **Quote:** "Fonoa, which covers VAT/GST and e-invoice flows in 40+ countries"
- **Issue:** Specific quota/country count repeated as fact. Should be hedged with 'consult Fonoa docs'.

### `iconify-to-feather-icons.json` — iconify → feather-icons
- **Field:** tldr
- **Quote:** "Iconify is a multi-set icon framework with 200k+ icons and an on-demand API; Feather Icons is a small, opinionated 280-icon SVG set."
- **Issue:** Specific icon counts (200k+, 280) stated without source hedge; Feather actually has ~287, Iconify count is approximate.

### `iconify-to-feather-icons.json` — iconify → feather-icons
- **Field:** gotchas
- **Quote:** "Feather only has ~280 icons; many Iconify usages will not have a direct equivalent."
- **Issue:** Specific icon count repeated as fact.

### `keep-alerting-to-anteon.json` — keep-alerting → anteon
- **Field:** concept_mapping
- **Quote:** "Keep providers (50+ tools)"
- **Issue:** Specific provider count stated as fact without a source hedge.

### `keep-alerting-to-anteon.json` — keep-alerting → anteon
- **Field:** gotchas
- **Quote:** "If Keep's 50+ provider catalog matters, verify each integration exists in Anteon."
- **Issue:** Specific provider count repeated as fact.

### `keep-alerting-to-openlit.json` — keep-alerting → openlit
- **Field:** concept_mapping
- **Quote:** "Alert ingestion from 50+ tools"
- **Issue:** Specific provider count stated as fact without source.

### `meilisearch-to-pinecone.json` — meilisearch → pinecone
- **Field:** why_switch
- **Quote:** "Sub-50ms similarity search across high-dimensional embeddings"
- **Issue:** Specific latency claim stated as fact without source or hedge — sounds like marketing copy invented as a verifiable benefit

### `openlit-to-sensu-go.json` — openlit → sensu-go
- **Field:** gotchas
- **Quote:** "Release cadence on Sensu Go is slower (release_frequency_days ~201)"
- **Issue:** Highly specific numeric stat presented without source; the field name 'release_frequency_days' looks like an internal dataset key leaked into prose, suggesting the number may not reflect a verifiable 

### `primer-to-portone.json` — primer → portone
- **Field:** why_switch
- **Quote:** "Single SDK across 20+ Korean and global PGs reduces integration burden in-region"
- **Issue:** Specific quota '20+' for PortOne PG count stated as fact without source or hedge.

### `private-ai-to-sonarqube.json` — private-ai → sonarqube
- **Field:** why_switch
- **Quote:** "Mature 30+ language SAST and code-smell coverage"
- **Issue:** Specific quota '30+ language' stated as fact without source — confidently asserted number that should be hedged.

### `radar-to-opencage.json` — radar → opencage
- **Field:** concept_mapping
- **Quote:** "GET /geocode/v1/json?q={address}"
- **Issue:** Specific API endpoint path stated in concept mapping. Path itself is partially mitigated by the hedge 'Verify exact endpoint in OpenCage docs' attached as a note, but the path is asserted alongside it

### `rollbar-to-crashpad.json` — rollbar → crashpad
- **Field:** concept_mapping
- **Quote:** "Rollbar SDKs (30+ languages)"
- **Issue:** Specific quota '30+ languages' for Rollbar SDK coverage stated without source.

### `togglz-to-ff4j.json` — togglz → ff4j
- **Field:** why_switch
- **Quote:** "You prefer FF4J's broader catalog of database backends (20+)"
- **Issue:** Specific count '20+' stated as a quota without source. FF4J supports several backends but the exact '20+' figure looks rounded/asserted rather than verified.
