/**
 * Fix miscategorized companies that were incorrectly assigned to "ci-cd".
 * Usage: npx tsx scripts/fix-categories.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = join(process.cwd(), 'data/companies');
const CATEGORIES_DIR = join(process.cwd(), 'data/categories');

// Full category map: slug → { id, name }
const CATEGORY_MAP: Record<string, { id: string; name: string }> = {
  'ab-testing':             { id: 'CAT-24', name: 'A/B Testing / Experimentation' },
  'ad-monetization':        { id: 'CAT-38', name: 'Ad Monetization / Mediation' },
  'ai-api-sdk':             { id: 'CAT-36', name: 'AI API / SDK for Developers' },
  'api-management':         { id: 'CAT-35', name: 'Developer Portals / API Management' },
  'apm':                    { id: 'CAT-21', name: 'Performance Monitoring / APM' },
  'app-growth-aso':         { id: 'CAT-40', name: 'App Growth Tooling (ASO)' },
  'backend-as-a-service':   { id: 'CAT-09', name: 'Backend-as-a-Service' },
  'cdn-edge':               { id: 'CAT-12', name: 'CDN / Edge / Acceleration' },
  'ci-cd':                  { id: 'CAT-25', name: 'CI/CD for Applications' },
  'code-assistants':        { id: 'CAT-37', name: 'Code Assistants / Agent Tooling' },
  'compliance-automation':  { id: 'CAT-33', name: 'Compliance Automation' },
  'content-moderation':     { id: 'CAT-31', name: 'Content Moderation API' },
  'crash-reporting':        { id: 'CAT-20', name: 'Crash Reporting' },
  'crm-lifecycle':          { id: 'CAT-29', name: 'CRM / Lifecycle Automation' },
  'customer-support-sdk':   { id: 'CAT-28', name: 'Customer Support SDK / In-app Helpdesk' },
  'data-integration-etl':   { id: 'CAT-34', name: 'Data Integration / ETL / Reverse ETL' },
  'dbaas':                  { id: 'CAT-10', name: 'DBaaS / Serverless Databases' },
  'feature-flags':          { id: 'CAT-23', name: 'Feature Flags / Remote Config' },
  'fraud-risk-management':  { id: 'CAT-05', name: 'Fraud & Risk Management' },
  'iap-optimization':       { id: 'CAT-39', name: 'In-app Purchase Optimization' },
  'identity-auth':          { id: 'CAT-06', name: 'Identity / Auth / User Management' },
  'invoicing-taxes':        { id: 'CAT-04', name: 'Invoicing / Taxes / Sales Tax' },
  'kyc-kyb-aml':            { id: 'CAT-07', name: 'KYC / KYB / AML API' },
  'localization':           { id: 'CAT-30', name: 'Localization / Translation API' },
  'maps-geolocation':       { id: 'CAT-13', name: 'Maps / Geolocation / Routing' },
  'messaging-api':          { id: 'CAT-15', name: 'Messaging API (Email / SMS / Voice)' },
  'mobile-attribution':     { id: 'CAT-18', name: 'Mobile Attribution / MMP' },
  'no-code-low-code':       { id: 'CAT-42', name: 'No-code / Low-code App Builders' },
  'object-storage-media':   { id: 'CAT-11', name: 'Object Storage / Media API' },
  'observability':          { id: 'CAT-22', name: 'Observability / Logging / Tracing' },
  'payment-gateway':        { id: 'CAT-02', name: 'Payment Gateway / PSP' },
  'payments-orchestration': { id: 'CAT-01', name: 'Payments Orchestration' },
  'product-analytics':      { id: 'CAT-17', name: 'Product Analytics' },
  'push-in-app-messaging':  { id: 'CAT-16', name: 'Push / In-app Messaging SDK' },
  'realtime-websocket':     { id: 'CAT-41', name: 'Real-time / WebSocket Infrastructure' },
  'release-app-store':      { id: 'CAT-27', name: 'Release / App Store Operations' },
  'search-recommendations': { id: 'CAT-14', name: 'Search / Recommendations API' },
  'secrets-management':     { id: 'CAT-08', name: 'Secrets Management' },
  'security-scanning':      { id: 'CAT-32', name: 'Security Scanning / Mobile App Sec' },
  'session-replay':         { id: 'CAT-19', name: 'Session Replay / UX Analytics' },
  'subscription-billing':   { id: 'CAT-03', name: 'Subscription Billing' },
  'test-automation':        { id: 'CAT-26', name: 'Test Automation / Device Cloud' },
};

// These "Specializes in" keywords map to category slugs
// More specific matches come first to avoid false positives
const SPECIALIZATION_MAP: Array<[RegExp, string]> = [
  // --- Exact/prefix matches for known tricky specializations (no \b boundaries) ---
  [/feature flags?/i, 'feature-flags'],
  [/postgres/i, 'dbaas'],       // matches PostgreSQL, postgres, etc.
  [/secrets? management/i, 'secrets-management'],
  [/multi.?purpose api/i, 'api-management'],
  [/managed postgresql/i, 'dbaas'],
  [/git diff/i, 'code-assistants'],
  [/topic model/i, 'ai-api-sdk'],
  [/search.{1,5}analytics/i, 'search-recommendations'],
  [/dev environments?/i, 'cdn-edge'],
  [/configuration language/i, 'cdn-edge'],
  [/durable workflow/i, 'realtime-websocket'],
  [/e.?signatures?/i, 'api-management'],
  [/statistical visualization/i, 'product-analytics'],
  [/dashboard.{1,10}analytics/i, 'product-analytics'],
  [/analytics spreadsheet/i, 'product-analytics'],
  [/collaborative api/i, 'realtime-websocket'],
  [/message streams?/i, 'realtime-websocket'],
  [/tor client/i, 'security-scanning'],
  [/columnar data/i, 'data-integration-etl'],
  [/jvm runtime/i, 'cdn-edge'],
  [/jdk distribution/i, 'cdn-edge'],
  [/html parser/i, 'api-management'],
  [/web scraping/i, 'api-management'],
  [/web archiving/i, 'object-storage-media'],
  [/file synchron/i, 'object-storage-media'],
  [/virtual clusters?/i, 'cdn-edge'],
  [/linux containers?/i, 'cdn-edge'],
  [/dependency updates?/i, 'cdn-edge'],
  [/python dependency/i, 'cdn-edge'],
  [/npm private registry/i, 'cdn-edge'],
  [/package registry/i, 'cdn-edge'],
  [/container registry/i, 'cdn-edge'],
  [/frontend build/i, 'code-assistants'],
  [/javascript (bundler|compiler)/i, 'code-assistants'],
  [/css framework/i, 'no-code-low-code'],
  [/style checker/i, 'code-assistants'],
  [/static type checker/i, 'code-assistants'],
  [/code analysis/i, 'code-assistants'],
  [/reinforcement learning/i, 'ai-api-sdk'],
  [/ml experiment/i, 'ai-api-sdk'],
  [/feature store/i, 'ai-api-sdk'],
  [/ml demo/i, 'ai-api-sdk'],
  [/ai (testing|productivity)/i, 'ai-api-sdk'],
  [/siem/i, 'security-scanning'],
  [/application security/i, 'security-scanning'],
  [/security api/i, 'security-scanning'],
  [/iac automation/i, 'security-scanning'],
  [/supply chain security/i, 'security-scanning'],
  [/artifact security/i, 'security-scanning'],
  [/license standard/i, 'compliance-automation'],
  [/game engine/i, 'no-code-low-code'],
  [/animation (tool|library)/i, 'no-code-low-code'],
  [/svg rendering/i, 'no-code-low-code'],
  [/component (platform|intelligence)/i, 'no-code-low-code'],
  [/browser engine/i, 'no-code-low-code'],
  [/mobile.?gui framework/i, 'no-code-low-code'],
  [/static site generator/i, 'cdn-edge'],
  [/private mesh network/i, 'cdn-edge'],
  [/remote desktop/i, 'cdn-edge'],
  [/experimental os/i, 'cdn-edge'],
  [/embedded os/i, 'cdn-edge'],
  [/knowledge management/i, 'crm-lifecycle'],
  [/project management/i, 'crm-lifecycle'],
  [/kanban/i, 'crm-lifecycle'],
  [/runbooks?/i, 'crm-lifecycle'],
  [/customer feedback/i, 'crm-lifecycle'],
  [/lead enrichment/i, 'crm-lifecycle'],
  [/meeting transcription/i, 'crm-lifecycle'],
  [/developer analytics/i, 'product-analytics'],
  [/developer news/i, 'crm-lifecycle'],
  [/technical debt/i, 'observability'],
  [/slo (tracking|management)/i, 'observability'],
  [/sre platform/i, 'observability'],
  [/cron monitor/i, 'observability'],
  [/ebpf/i, 'observability'],
  [/ai (monitor|observ)/i, 'observability'],
  [/http (debugging|load test)/i, 'test-automation'],
  [/e2e test/i, 'test-automation'],
  [/gui test/i, 'test-automation'],
  [/enterprise test/i, 'test-automation'],
  [/kobiton|perfecto|browserstack|mobitru|headspin|lambdatest|appium|detox|sauce labs|maestro|autify|aws device farm/i, 'test-automation'],
  [/pdf (tools|automation|conversion)/i, 'api-management'],
  [/document conversion/i, 'api-management'],
  [/document sharing/i, 'api-management'],
  [/grpc client/i, 'api-management'],
  [/gRPC/i, 'api-management'],
  [/ssh library/i, 'api-management'],
  [/webhook/i, 'realtime-websocket'],
  [/video (conferencing|sdk)/i, 'realtime-websocket'],
  [/social media (management|growth)/i, 'crm-lifecycle'],
  [/linkedin growth/i, 'crm-lifecycle'],
  [/e.?commerce/i, 'no-code-low-code'],
  [/newsletter/i, 'messaging-api'],
  [/file (sharing|management)/i, 'object-storage-media'],
  [/video recording/i, 'object-storage-media'],
  [/microservices framework/i, 'backend-as-a-service'],
  [/full.?stack reactive/i, 'backend-as-a-service'],
  [/script platform/i, 'backend-as-a-service'],
  [/instant backend/i, 'backend-as-a-service'],
  [/web.{1,5}rpc framework/i, 'backend-as-a-service'],
  [/polyglot framework/i, 'backend-as-a-service'],
  [/asgi (server|framework)/i, 'backend-as-a-service'],
  [/wsgi server/i, 'backend-as-a-service'],
  [/async runtime/i, 'backend-as-a-service'],
  [/background jobs?/i, 'backend-as-a-service'],
  [/task (queue|scheduler|orchestration)/i, 'backend-as-a-service'],
  [/event.driven/i, 'backend-as-a-service'],
  [/reactive data store/i, 'backend-as-a-service'],
  [/data (fetching|analysis) library/i, 'data-integration-etl'],
  [/dataframe library/i, 'data-integration-etl'],
  [/numerical computing/i, 'data-integration-etl'],
  [/scientific computing/i, 'data-integration-etl'],
  [/parallel computing/i, 'data-integration-etl'],
  [/distributed computing/i, 'data-integration-etl'],
  [/headless bi/i, 'data-integration-etl'],
  [/data (exploration|management)/i, 'data-integration-etl'],
  [/change data capture/i, 'data-integration-etl'],
  [/data validation/i, 'data-integration-etl'],
  [/cryptography/i, 'secrets-management'],
  [/vpn/i, 'security-scanning'],
  [/https? proxy/i, 'security-scanning'],
  [/data gateway/i, 'api-management'],
  [/policy enforcement/i, 'compliance-automation'],
  [/validation library/i, 'backend-as-a-service'],
  [/property testing/i, 'test-automation'],
  [/cloud operations/i, 'observability'],
  [/cloud cost/i, 'observability'],
  [/fuzzy finder/i, 'code-assistants'],
  [/fast find/i, 'code-assistants'],
  [/command runner/i, 'code-assistants'],
  [/tui framework/i, 'code-assistants'],
  [/terminal (emulator|multiplexer|formatting|tool)/i, 'code-assistants'],
  [/shell prompt/i, 'code-assistants'],
  [/cat clone/i, 'code-assistants'],
  [/directory navigator/i, 'code-assistants'],
  [/file watcher/i, 'code-assistants'],
  [/line counter/i, 'code-assistants'],
  [/text expander/i, 'code-assistants'],
  [/git (terminal|diff|gui|tui)/i, 'code-assistants'],
  [/qt bindings/i, 'no-code-low-code'],
  [/3d design/i, 'no-code-low-code'],
  [/gpu graphics/i, 'no-code-low-code'],
  [/web visualization/i, 'product-analytics'],
  [/bi (tool|platform)/i, 'data-integration-etl'],
  [/analytics platform/i, 'product-analytics'],
  [/platform engineering/i, 'cdn-edge'],
  [/internal developer platform/i, 'cdn-edge'],
  [/chaos engineering/i, 'test-automation'],
  [/dev tool manager/i, 'cdn-edge'],
  [/environment (switcher|management)/i, 'cdn-edge'],
  [/version manager/i, 'cdn-edge'],
  [/serverless (function|platform|gpu)/i, 'cdn-edge'],
  [/edge hosting/i, 'cdn-edge'],
  [/cloud (native networking|build)/i, 'cdn-edge'],
  [/solana development/i, 'backend-as-a-service'],
  [/blockchain development/i, 'backend-as-a-service'],
  [/ethereum client/i, 'backend-as-a-service'],
  [/smart contract/i, 'backend-as-a-service'],
  [/python app installer/i, 'cdn-edge'],
  [/package manager/i, 'cdn-edge'],
  [/engineering analytics/i, 'observability'],
  [/mlops/i, 'ai-api-sdk'],
  [/nlp library/i, 'ai-api-sdk'],
  [/deep learning (framework|platform)?/i, 'ai-api-sdk'],
  [/machine learning/i, 'ai-api-sdk'],
  [/ai conversation/i, 'ai-api-sdk'],
  [/conversational/i, 'backend-as-a-service'],
  [/web sql interface/i, 'dbaas'],
  [/sql (editor|query engine)/i, 'dbaas'],
  [/postgresql (client|monitoring|web client|backup)/i, 'dbaas'],
  [/embedded postgresql/i, 'dbaas'],
  [/type.safe sql/i, 'dbaas'],

  // Databases
  [/\b(database|serverless database|nosql database|sql database|vector database|time[\s-]series|graph database|mongodb odm|mysql|sqlite|redis|cassandra|cockroach|dynamodb|firebase|supabase db|planetscale|neon|turso|dbaas|rdbms|orm|prisma|drizzle|query analysis|query builder|query optimization|data modeling|data warehouse|olap|clickhouse|bigquery|snowflake|dbt|data transformation)\b/i, 'dbaas'],
  // Auth / Identity
  [/\b(auth|authentication|authorization|sso|saml|oauth|openid|identity|user management|access control|rbac|passwordless|mfa|2fa|jwt|session management|login|signup|iam)\b/i, 'identity-auth'],
  // Secrets
  [/\b(secret|vault|key management|key rotation|env var|credential|certificate management|hsm|token management)\b/i, 'secrets-management'],
  // Security scanning
  [/\b(security scan|sast|dast|pentest|vulnerability|cve|snyk|devsecops|waf|appsec|mobile app sec|dependency audit|code scan|supply chain security|sbom|compliance scan)\b/i, 'security-scanning'],
  // Compliance
  [/\b(compliance|soc2|gdpr|hipaa|pci[\s-]dss|audit trail|policy engine|governance|iso 27001|regulatory)\b/i, 'compliance-automation'],
  // KYC/KYB/AML
  [/\b(kyc|kyb|aml|identity verification|document verification|liveness|fraud id|sanctions|watchlist)\b/i, 'kyc-kyb-aml'],
  // Fraud
  [/\b(fraud|chargeback|risk scoring|risk management|bot detection|device fingerprint|account takeover|3ds|dispute)\b/i, 'fraud-risk-management'],
  // Payments
  [/\b(payment gateway|payment processing|psp|payment api|card processing|acquiring|merchant account|checkout sdk)\b/i, 'payment-gateway'],
  [/\b(subscription billing|recurring billing|dunning|plan management|usage billing|metered billing|stripe billing|chargebee|recurly|paddle billing)\b/i, 'subscription-billing'],
  [/\b(invoicing|invoice|tax calculation|sales tax|vat|gst|tax compliance|e-invoicing)\b/i, 'invoicing-taxes'],
  [/\b(payments orchestration|payment routing|multi-psp)\b/i, 'payments-orchestration'],
  [/\b(in-app purchase|iap optimization|app store billing|google play billing)\b/i, 'iap-optimization'],
  // Observability / APM
  [/\b(apm|application performance|distributed tracing|opentelemetry|jaeger|zipkin|performance monitoring|profiler|flame graph)\b/i, 'apm'],
  [/\b(observab|logging|log management|log aggreg|log analysis|tracing|metrics|uptime monitor|synthetic monitor|status page|infrastructure monitor|server monitor|network monitor)\b/i, 'observability'],
  // Crash reporting
  [/\b(crash report|error tracking|exception tracking|error monitoring|bug tracking|rollbar|bugsnag)\b/i, 'crash-reporting'],
  // Session replay
  [/\b(session replay|heatmap|ux analytics|click map|scroll map|user recording|fullstory|hotjar)\b/i, 'session-replay'],
  // Product analytics
  [/\b(product analytics|user analytics|event analytics|funnel|cohort|retention analysis|web analytics|behavior analytics|mixpanel|amplitude|posthog analytics)\b/i, 'product-analytics'],
  // A/B testing
  [/\b(a\/b test|ab test|experimentation|split test|multivariate test|feature experiment)\b/i, 'ab-testing'],
  // Feature flags
  [/feature flags?/i, 'feature-flags'],
  [/\b(feature toggle|remote config|launchdarkly|split\.io|feature rollout|progressive delivery)\b/i, 'feature-flags'],
  // Test automation
  [/\b(test automation|automated testing|e2e test|selenium|cypress|playwright|webdriver|device cloud|mobile testing|qa tool|load test|performance test|api test|unit test|integration test|testing platform|testingbot)\b/i, 'test-automation'],
  // Messaging / email
  [/\b(email delivery|email api|smtp|transactional email|email marketing|sendgrid|mailgun|ses|mailchimp|campaign monitor|sms api|whatsapp api|voice api|push notification api|messaging api|otp delivery)\b/i, 'messaging-api'],
  // Push / in-app
  [/\b(push notification|in-app message|in-app notification|mobile push|web push|notification sdk|notification service|intercom push|customer engage)\b/i, 'push-in-app-messaging'],
  // CRM / lifecycle
  [/\b(crm|customer relationship|lifecycle automation|marketing automation|email campaign|drip campaign|customer engagement platform|customer success|hubspot|salesforce crm|scheduling|calendar)\b/i, 'crm-lifecycle'],
  // Customer support
  [/\b(customer support|help desk|helpdesk|live chat sdk|in-app helpdesk|support widget|ticketing sdk|zendesk sdk|intercom support)\b/i, 'customer-support-sdk'],
  // CDN / Edge / infra
  [/\b(cdn|content delivery|edge network|edge compute|ddos|load balancer|reverse proxy|web hosting|cloud hosting|static hosting|serverless hosting|kubernetes|k8s|container|docker|managed kubernetes|helm|service mesh|istio|envoy|ingress|infrastructure)\b/i, 'cdn-edge'],
  // Object storage / media
  [/\b(object storage|file storage|blob storage|s3|media api|image processing|video processing|image upscaling|image optimization|media cdn|digital asset|dam|file upload|video hosting|audio storage)\b/i, 'object-storage-media'],
  // Search / recommendations
  [/\b(search engine|full.text search|search api|faceted search|recommendation|personali|elastic search|solr|algolia|typesense|meilisearch|search database|vector search)\b/i, 'search-recommendations'],
  // Real-time / WebSocket
  [/\b(realtime|real.time|websocket|pub.sub|message queue|event stream|kafka|rabbitmq|activemq|nats|mqtt|pubsub|event bus|socket\.io|ably|pusher|socket|streaming api)\b/i, 'realtime-websocket'],
  // Data integration / ETL
  [/\b(etl|elt|data integration|data pipeline|reverse etl|data sync|data ingestion|data connector|data migration|airbyte|fivetran|stitch|meltano|data transformation)\b/i, 'data-integration-etl'],
  // AI / ML
  [/\b(ai api|ml api|llm|large language model|inference api|model serving|embedding|vector embed|ai sdk|genai|generative ai|ai platform|ml platform|ai tool|nlp api|computer vision api|speech api|openai|anthropic sdk|llm cli tool|ai chat)\b/i, 'ai-api-sdk'],
  // Code assistants
  [/\b(code assist|copilot|code completion|code generation|code review|ide plugin|editor plugin|coding assistant|ai coding|code intelligence|code search|code nav|static analysis|linter|formatter|code quality|code gen)\b/i, 'code-assistants'],
  // No-code / Low-code
  [/\b(no.code|low.code|visual builder|drag.and.drop|crud app generator|app generator|workflow automation|workflow builder|automation platform|zapier|make\.com|n8n|retool|bubble|webflow|cms|headless cms|content management)\b/i, 'no-code-low-code'],
  // API management
  [/\b(api management|api gateway|graphql|rest api|api portal|developer portal|api doc|swagger|openapi|api catalog|api proxy|postman|insomnia|api client|api mock|api design|readme|wiki|documentation)\b/i, 'api-management'],
  // BaaS
  [/\b(backend.as.a.service|baas|firebase|supabase|appwrite|parse server|backend framework|web framework|java framework|go framework|node framework|api framework|server framework)\b/i, 'backend-as-a-service'],
  // Localization
  [/\b(locali|translat|i18n|l10n|internali|multilingual|language management)\b/i, 'localization'],
  // Maps / geo
  [/\b(map|geocod|routing|geofence|geospatial|location api|gps|navigation|latitude|longitude|address validation)\b/i, 'maps-geolocation'],
  // Mobile attribution
  [/\b(mobile attribution|mmp|install attribution|app tracking|deep link|branch\.io|adjust|appsflyer|singular attribution)\b/i, 'mobile-attribution'],
  // Ad monetization
  [/\b(ad monetization|mediation|ad sdk|admob|applovin|ironSource|ad network|ad revenue)\b/i, 'ad-monetization'],
  // App growth
  [/\b(aso|app store optim|app growth|app ranking|keyword optim|app marketing|app store analytics)\b/i, 'app-growth-aso'],
  // Content moderation
  [/\b(content moderation|text moderation|image moderation|toxicity|hate speech|nsfw|spam detection|moderation api)\b/i, 'content-moderation'],
  // Release / app store
  [/\b(release management|app store|google play|fastlane|app distribution|ota update|release pipeline|deploy app)\b/i, 'release-app-store'],

  // --- Additional patterns for unmatched specializations ---
  // Observability / APM extensions
  [/\b(slo tracking|aiops|uptime|incident management|log processing|java profiling|jvm analysis|engineering analytics|data observability|ai observability|cron monitor|cron job monitor|status page)\b/i, 'observability'],
  // Data integration / ETL extensions
  [/\b(integration platform|data platform|data notebook|dataframe|data catalog|data quality|data labeling|data discovery|bi tool|bi platform|analytics platform|unified analytics|business dashboard|data visualization|stream processing|workflow orchestration|workload orchestration|sql query engine|big data)\b/i, 'data-integration-etl'],
  // AI / ML extensions
  [/\b(mlops|machine learning|deep learning|nlp library|gradient boosting|hyperparameter|feature platform|ai agent|model eval|llm eval|aiops platform|computer vision|audio analysis|benchmarking)\b/i, 'ai-api-sdk'],
  // Security extensions
  [/\b(security automat|cloud security|security analytics|security data lake|network security|iac scanner|soar|supply chain security|software supply chain|ldap)\b/i, 'security-scanning'],
  // Code assistants extensions
  [/\b(code coverage|code style|code editor|code generator|code generation|static analysis|linter|formatter|code quality|ide|code style checker|testing framework|test framework|test reporting|branch testing|trace.based testing|software testing|test management)\b/i, 'code-assistants'],
  // CDN / Edge / infra extensions
  [/\b(paas|platform engineering|dev environment|cloud dev|serverless|serverless function|serverless gpu|serverless platform|edge hosting|internal developer platform|self.hosted paas|configuration management|environment management|version manager|version management|terraform|infrastructure.as.code|cloud cost|cloud native|webassembly|web assembly|package manager|package management|monorepo|build system|build tool|frontend build|module bundler|task runner|task queue|task scheduler|chaos engineering)\b/i, 'cdn-edge'],
  // Backend-as-a-service extensions
  [/\b(asgi framework|asgi server|async runtime|high performance framework|http library|http client)\b/i, 'backend-as-a-service'],
  // Real-time / WebSocket extensions
  [/\b(event streaming|workflow framework|distributed storage|file synchron|sync framework|local.first|local first)\b/i, 'realtime-websocket'],
  // API management extensions
  [/\b(pdf generation|document conversion|aws sdk|collaborative api|currency|holiday api|ip data|multi.purpose api|protobuf|headless browser)\b/i, 'api-management'],
  // Messaging / email extensions
  [/\b(newsletter|email privacy|notifications)\b/i, 'messaging-api'],
  // Product analytics extensions
  [/\b(web analytics|privacy analytics|mobile analytics|product discovery|session analytics|unified analytics)\b/i, 'product-analytics'],
  // Object storage / media extensions
  [/\b(image upscal|video editing|file manager|3d design|postgresql backup)\b/i, 'object-storage-media'],
  // Search extensions
  [/\b(seo|seo research|seo tools|link management)\b/i, 'search-recommendations'],
  // CRM / lifecycle extensions
  [/\b(team chat|kanban|issue tracking|runbook|internal tools|subscription management|accounting|erp|git hosting|self hosted git|git client|git gui|git tui|salesforce devops|gitops|gitops tool|gitops platform|gitops cd|deployment automation|deployment|release automation|continuous delivery|artifact management)\b/i, 'crm-lifecycle'],
  // No-code / low-code extensions
  [/\b(ui component|component library|design tool|figma|workspace|3d design|dynamic pages)\b/i, 'no-code-low-code'],
  // DBaaS extensions
  [/\b(sql editor|postgresql client|postgresql monitoring|postgresql web client|embedded postgresql|distributed storage|type safe sql|headless bi|data fetching|dataframe|numerical computing|scientific computing|parallel computing)\b/i, 'dbaas'],
  // Test automation extensions
  [/\b(gui testing|enterprise testing|api testing|software testing|test management|trace.based testing|espresso|xctest|lambdatest|headspin|mobitru|sauce labs|appium|maestro)\b/i, 'test-automation'],
  // Backend-as-a-service / framework extensions
  [/\b(web server|wsgi server|asgi server|instant backend|reactive data store|serialization|state management|background jobs|event.driven|cli framework|cli generator|cli utility|concurrent|web.rpc framework)\b/i, 'backend-as-a-service'],
  // CDN / Edge / infra extensions
  [/\b(dev environment|cloud dev|dev tool manager|environment switcher|environment management|version manager|version management|linux container|container|vpn|embedded os|terminal emulator|terminal multiplexer|terminal|shell prompt|shell|fuzzy finder|directory navigator|file watcher|cat clone|cli|decentralized hosting|machine image)\b/i, 'cdn-edge'],
  // Security extensions extra
  [/\b(policy enforcement|software trust|supply chain security|ebpf|iac scan|security automation|vpn|https proxy|data gateway)\b/i, 'security-scanning'],
  // Real-time extensions
  [/\b(video conferencing|video sdk|animation library|web visualization)\b/i, 'realtime-websocket'],
  // API management extensions extra
  [/\b(multi.purpose api|collaborative api|website data api|pdf automation|document conversion|forms|conversational app|social media|social media management|social media growth|linkedin growth|e.commerce|ecommerce)\b/i, 'api-management'],
  // Observability extensions extra
  [/\b(slo management|sre platform|cron monitor|eBPF|ai monitoring|ai observability)\b/i, 'observability'],
  // AI/ML extensions extra
  [/\b(mlops|ml app builder|ml framework|machine learning|deep learning|topic model|nlp|conversational|ai monitoring|ai observability|ai conversation)\b/i, 'ai-api-sdk'],
  // No-code extensions extra
  [/\b(project management|forms|e.commerce|component platform)\b/i, 'no-code-low-code'],
  // Messaging extra
  [/\b(newsletter|notifications|file sharing)\b/i, 'messaging-api'],
  // Object storage extensions
  [/\b(web archiving|file synchron|file sharing)\b/i, 'object-storage-media'],
  // Blockchain / special (→ backend-as-a-service as closest)
  [/\b(blockchain|solana|ethereum|smart contract|web3|crypto|decentralized)\b/i, 'backend-as-a-service'],
  // Search extra
  [/\b(seo|seo tools|seo research|link management|fast search|fast find|search.analytics)\b/i, 'search-recommendations'],
  // Data integration extra
  [/\b(change data capture|data validation|data analysis|data exploration|data management|data quality|analytics spreadsheet|query engine|columnar data|distributed computing|durable workflow|task orchestration|workflow orchestration|orchestration|ml experiment tracking|feature store|reinforcement learning|data analysis library)\b/i, 'data-integration-etl'],
  // Observability extra
  [/\b(cron monitor|observability platform|developer analytics|slo management|sre|http debugging|http load test|log processor|technical debt|cloud operations|developer news)\b/i, 'observability'],
  // API management extra
  [/\b(multi.purpose api|collaborative api|api connectivity|webhook|template language|grpc|ssh library|cryptography|document sharing|pdf conversion|pdf tools|validation library|property testing|static type checker)\b/i, 'api-management'],
  // Code assistants extra
  [/\b(code analysis|static type checker|style checker|javascript compiler|javascript bundler|frontend build|css framework|polyglot framework|tui framework|component intelligence|property testing|line counter|text expander)\b/i, 'code-assistants'],
  // Backend-as-a-service extra
  [/\b(microservices framework|full.stack.reactive|durable workflow|script platform|instant backend|web.rpc framework|polyglot framework)\b/i, 'backend-as-a-service'],
  // CDN / Edge extra
  [/\b(dev environment|cloud dev|private mesh network|remote desktop|container registry|linux container|virtual cluster|experimental os|static site generator)\b/i, 'cdn-edge'],
  // Security extra
  [/\b(application security|siem|security api|artifact security|iac automation|supply chain security|software trust)\b/i, 'security-scanning'],
  // Messaging extra
  [/\b(meeting transcription|customer feedback|knowledge management|document sharing|e.signature)\b/i, 'messaging-api'],
  // Product analytics extra
  [/\b(dashboard analytics|dashboard tool|lead enrichment|developer analytics|customer feedback|idea validation|technical debt)\b/i, 'product-analytics'],
  // No-code extra
  [/\b(animation tool|animation library|svg rendering|gpu graphics|game engine|browser engine|mobile.gui framework|qt bindings|forms|e.commerce|ecommerce)\b/i, 'no-code-low-code'],
  // Object storage extra
  [/\b(file management|file synchron|video recording|web archiving|pdf tools|pdf conversion|document)\b/i, 'object-storage-media'],
  // Real-time extra
  [/\b(message stream|webhook service|webhooks service|durable workflow)\b/i, 'realtime-websocket'],
  // CRM extra
  [/\b(lead enrichment|crm|customer feedback|meeting transcription|knowledge management|project management|runbook|idea validation|ai productivity|developer news)\b/i, 'crm-lifecycle'],
  // Test automation extra
  [/\b(e2e testing|gui testing|kobiton|perfecto|browserstack|detox|appium|ai testing|property testing|http load test)\b/i, 'test-automation'],
  // AI extra
  [/\b(ml experiment|feature store|reinforcement learning|ml framework|ml demo|ai testing|ai productivity|ml app)\b/i, 'ai-api-sdk'],
  // Web scraping → api-management
  [/\b(web scraping|web crawling|html parser|beautiful soup|colly)\b/i, 'api-management'],
];

// Keywords to extract "Specializes in X" from description
function extractSpecialization(description: string): string {
  const match = description.match(/Specializes in (.+?)\.?\s*$/i);
  return match ? match[1].trim() : '';
}

function detectCategory(name: string, description: string): string | null {
  const specialization = extractSpecialization(description);
  // Only use name + specialization for matching (not full description which has template text)
  const text = `${name} ${specialization} ${specialization}`.toLowerCase();

  for (const [pattern, slug] of SPECIALIZATION_MAP) {
    if (pattern.test(text)) {
      return slug;
    }
  }
  return null;
}

// Truly CI/CD companies that should stay
const REAL_CICD_KEYWORDS = /\b(continuous integration|continuous delivery|continuous deployment|ci\/cd|ci cd platform|ci cd pipeline|ci cd|ci cd engine|build pipeline|jenkins|github actions|gitlab ci|circleci|travis ci|teamcity|buildkite|drone ci|argo cd|tekton|spinnaker|woodpecker|semaphore|bitrise|azure pipelines|build system|build tool|build toolkit|monorepo build|deployment pipeline|release pipeline|artifact management|artifact registry|artifact repository|artifact security|package registry|npm private registry|dependency management|dependency updates|python dependency manager|devops platform|salesforce devops|gitops|gitops tool|gitops platform|gitops cd|kubernetes ci.?cd|terraform ci.?cd|go build tool|go live reload|infrastructure ci.?cd|serverless ci.?cd|containerized builds?|machine image builder|remote execution|dev tool manager|merge queue|merge automation|stacking prs|application delivery|deploy.{1,3}ci.?cd|dev automation|version control|virtual clusters|bazel|aspect build|bazel ci|cloud build|jvm runtime|jdk distribution)\b/i;

function isTrulyCiCd(name: string, description: string): boolean {
  // Only check name + specialization, NOT the full description
  // (all ci-cd companies have "CI/CD for Applications" in the description template text)
  const specialization = extractSpecialization(description);
  const text = `${name} ${specialization}`.toLowerCase();
  return REAL_CICD_KEYWORDS.test(text);
}

interface CompanyData {
  slug: string;
  name: string;
  description: string;
  categories: {
    primary: {
      id: string;
      slug: string;
      name: string;
    };
    secondary: string[];
  };
  [key: string]: unknown;
}

interface CategoryData {
  id: string;
  slug: string;
  name: string;
  company_count: number;
  companies: string[];
  [key: string]: unknown;
}

function loadCategory(slug: string): CategoryData {
  const path = join(CATEGORIES_DIR, `${slug}.json`);
  return JSON.parse(readFileSync(path, 'utf-8')) as CategoryData;
}

function saveCategory(slug: string, data: CategoryData): void {
  const path = join(CATEGORIES_DIR, `${slug}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function loadCompany(filePath: string): CompanyData {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as CompanyData;
}

function saveCompany(filePath: string, data: CompanyData): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function main() {
  const files = readdirSync(COMPANIES_DIR).filter(f => f.endsWith('.json'));

  // Find all ci-cd companies
  const ciCdCompanies: Array<{ filePath: string; data: CompanyData }> = [];

  for (const file of files) {
    const filePath = join(COMPANIES_DIR, file);
    const data = loadCompany(filePath);
    if (data.categories?.primary?.slug === 'ci-cd') {
      ciCdCompanies.push({ filePath, data });
    }
  }

  console.log(`Found ${ciCdCompanies.length} companies with ci-cd as primary category`);

  // Load all category data upfront
  const categoryCache: Record<string, CategoryData> = {};
  for (const slug of Object.keys(CATEGORY_MAP)) {
    try {
      categoryCache[slug] = loadCategory(slug);
    } catch {
      // skip if file doesn't exist
    }
  }

  let fixed = 0;
  let stayed = 0;
  let unmatched = 0;
  const unmatchedList: string[] = [];
  const fixLog: Array<{ slug: string; from: string; to: string; desc: string }> = [];

  for (const { filePath, data } of ciCdCompanies) {
    const { name, description, slug } = data;
    const specialization = extractSpecialization(description);

    // If it's truly CI/CD, keep it
    if (isTrulyCiCd(name, description)) {
      stayed++;
      continue;
    }

    // Detect correct category
    const newSlug = detectCategory(name, description);

    if (!newSlug || newSlug === 'ci-cd') {
      unmatched++;
      unmatchedList.push(`${slug}: ${specialization || description.slice(0, 80)}`);
      continue;
    }

    const newCat = CATEGORY_MAP[newSlug];
    if (!newCat) {
      unmatched++;
      unmatchedList.push(`${slug}: unknown target slug ${newSlug}`);
      continue;
    }

    // Update company JSON
    data.categories.primary = {
      id: newCat.id,
      slug: newSlug,
      name: newCat.name,
    };
    saveCompany(filePath, data);

    // Update category caches
    const ciCdCat = categoryCache['ci-cd'];
    if (ciCdCat) {
      ciCdCat.companies = ciCdCat.companies.filter(s => s !== slug);
    }

    const targetCat = categoryCache[newSlug];
    if (targetCat && !targetCat.companies.includes(slug)) {
      targetCat.companies.push(slug);
    }

    fixLog.push({ slug, from: 'ci-cd', to: newSlug, desc: specialization });
    fixed++;
  }

  // Sort companies lists alphabetically and update counts
  for (const [catSlug, catData] of Object.entries(categoryCache)) {
    catData.companies.sort();
    catData.company_count = catData.companies.length;
    saveCategory(catSlug, catData);
  }

  console.log(`\n=== Results ===`);
  console.log(`Total ci-cd companies processed: ${ciCdCompanies.length}`);
  console.log(`Fixed (moved to correct category): ${fixed}`);
  console.log(`Stayed in ci-cd (truly CI/CD): ${stayed}`);
  console.log(`Unmatched (kept in ci-cd): ${unmatched}`);

  console.log(`\n=== Category distribution of fixed companies ===`);
  const dist: Record<string, number> = {};
  for (const { to } of fixLog) {
    dist[to] = (dist[to] || 0) + 1;
  }
  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`  ${cat}: ${count}`);
  }

  if (unmatchedList.length > 0) {
    console.log(`\n=== Unmatched companies (first 20) ===`);
    unmatchedList.slice(0, 20).forEach(u => console.log(`  ${u}`));
  }

  console.log(`\nDone!`);
}

main().catch(console.error);
