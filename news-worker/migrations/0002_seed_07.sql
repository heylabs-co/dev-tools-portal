INSERT OR IGNORE INTO events (id, source, source_handle, url, created_at, ingested_at, title, text, lang, like_count, reply_count, retweet_count, view_count, score, score_reason, drafts_json, posted, pushed_at, tg_message_id, approved_variant) VALUES
    ('2047063088445415903', 'twitter', 'github', 'https://x.com/github/status/2047063088445415903', 'Wed Apr 22 21:20:47 +0000 2026', '2026-04-23 13:10:53', NULL, 'Happy Earth Day! 🌍

When was the last time someone in your standup asked, "How could we build this more sustainably?"

For most dev teams, green software rarely makes the roadmap. But the next generation of AI tooling is about to change that. 👇 🧵', 'en', 142, 17, 14, 21619, 5, 'parse-fail', NULL, 0, NULL, NULL, NULL),
    ('2047041129326194882', 'twitter', 'jerryjliu0', 'https://x.com/jerryjliu0/status/2047041129326194882', 'Wed Apr 22 19:53:32 +0000 2026', '2026-04-23 13:10:53', NULL, 'LiteParse, our OSS document parser, is really good at parsing complex PDF layouts, text, and tables into a clean spatial grid. 

The best part is it doesn''t use VLMs or any ML models at all. It''s entirely heuristics based and super fast ⚡️ 

The secret lies in our sophisticated grid projection algorithm. This blog post by @LoganMarkewich gives a comprehensive walkthrough on how it works: 
1️⃣ Sort lines based on similar Y coordinates
2️⃣ Extract left, right, and center anchors
3️⃣ Classify every text item into one of these anchors
4️⃣ Project every text item into a grid column (the exception is any paragraph of flowing text, which is rendered separately) 
5️⃣ For any item projected into a grid column, that item is the forward anchor for all subsequent text items with the same anchor 
6️⃣ Postprocess the final outputs to remove extraneous spaces and margins

As an example, take a look at the results below. You can see text in the left column, with a nicely overlaid table on the right.

LiteParse is fully free and open-source, you can use it today! Either directly through the CLI or integrated into your coding agent. 

Blog: https://t.co/OnMZtLTzGT

LiteParse repo: https://t.co/JNER0mVcB8', 'en', 243, 10, 31, 27045, 6, 'Notable OSS release for PDF parsing', NULL, 0, NULL, NULL, NULL),
    ('2047009804221128892', 'twitter', 'github', 'https://x.com/github/status/2047009804221128892', 'Wed Apr 22 17:49:03 +0000 2026', '2026-04-23 13:10:53', NULL, 'The global developer event of the year is around the corner. 👀 

If you’ve been thinking about taking the stage at #GitHubUniverse, this is your moment. Our call for sessions is open now through Friday, May 1. ⭐️
https://t.co/45yw3GUeKX', 'en', 74, 10, 8, 18714, 3, 'Conference talk announcement for GitHub Universe', NULL, 0, NULL, NULL, NULL),
    ('2047100147864129763', 'twitter', 'kentcdodds', 'https://x.com/kentcdodds/status/2047100147864129763', 'Wed Apr 22 23:48:03 +0000 2026', '2026-04-23 13:11:02', NULL, 'Dinner with friends at @ReactMiamiConf 🥩 https://t.co/491xBLeXGu', 'en', 118, 14, 3, 7044, 5, 'parse-fail', NULL, 0, NULL, NULL, NULL),
    ('2047088418442633583', 'twitter', 'kentcdodds', 'https://x.com/kentcdodds/status/2047088418442633583', 'Wed Apr 22 23:01:26 +0000 2026', '2026-04-23 13:11:02', NULL, 'Thanks @thdxr for the warm up party and bus', 'en', 8, 1, 0, 2574, 1, 'Personal social event mention', NULL, 0, NULL, NULL, NULL),
    ('2047080422920847741', 'twitter', 'notionhq', 'https://x.com/notionhq/status/2047080422920847741', 'Wed Apr 22 22:29:40 +0000 2026', '2026-04-23 13:11:10', NULL, 'The backstory on how Think Together came about. https://t.co/6GvMQQJamP', 'en', 60, 2, 3, 13132, 5, 'parse-fail', NULL, 0, NULL, NULL, NULL),
    ('2047043688208236928', 'twitter', 'notionhq', 'https://x.com/notionhq/status/2047043688208236928', 'Wed Apr 22 20:03:42 +0000 2026', '2026-04-23 13:11:10', NULL, '🔧 Product / … / 🌱 Improvement /  🍞 Breadcrumb browser

Breadcrumbs now show sibling pages when you hover. Should make it easier to explore related pages and navigate your workspace. https://t.co/m47H8vESCS', 'en', 256, 9, 11, 28075, 5, 'parse-fail', NULL, 0, NULL, NULL, NULL),
    ('2047041338106159484', 'twitter', 'nikitabier', 'https://x.com/nikitabier/status/2047041338106159484', 'Wed Apr 22 19:54:21 +0000 2026', '2026-04-23 13:11:10', NULL, 'Today we''re announcing two product changes for organizing communities on X:

1. XChat now supports joinable links for groupchats. Create a public link & share direct to Timeline. With support for 350 members per chat (and growing), Groupchat Links are the fastest way to bring people together on X.

2. Due to declining usage, we''re deprecating X Communities on May 6.

To migrate your Community''s members, pin your groupchat link so people can join it over the next 2 weeks.

This is part of our broader effort to simplify the experience on X. Make no mistake: we are investing heavily in niche communities with the launch of Custom Timelines—and much more to come.', 'en', 10899, 3839, 1824, 6411958, 6, 'Product update for XChat and Communities deprecation', NULL, 0, NULL, NULL, NULL),
    ('2047238304043856121', 'twitter', 'prisma', 'https://x.com/prisma/status/2047238304043856121', 'Thu Apr 23 08:57:02 +0000 2026', '2026-04-23 13:11:19', NULL, 'If your team already uses Terraform for infra, you can manage Prisma Postgres the same way.

Declare projects, databases, and connections in .tf files → review the plan → apply changes.

No more clicking through UIs 👀

https://t.co/3ygTfqVaKP', 'en', 2, 0, 1, 673, 5, 'Prisma Terraform integration announcement', NULL, 0, NULL, NULL, NULL),
    ('2047212660807159981', 'twitter', 'producthunt', 'https://x.com/producthunt/status/2047212660807159981', 'Thu Apr 23 07:15:08 +0000 2026', '2026-04-23 13:11:19', NULL, 'gentle reminder: https://t.co/8Qw0ekQMxv', 'en', 23, 1, 1, 5759, 1, 'Link-only tweet without context', NULL, 0, NULL, NULL, NULL);

INSERT OR IGNORE INTO events (id, source, source_handle, url, created_at, ingested_at, title, text, lang, like_count, reply_count, retweet_count, view_count, score, score_reason, drafts_json, posted, pushed_at, tg_message_id, approved_variant) VALUES
    ('2047150411170320808', 'twitter', 'rauchg', 'https://x.com/rauchg/status/2047150411170320808', 'Thu Apr 23 03:07:46 +0000 2026', '2026-04-23 13:11:19', NULL, 'I want to keep everyone updated on the details of the security investigation.

The team performed an in-depth analysis to search for root causes and to better understand the behavior of the threat actor.

We cast a very wide net, pulling and processing nearly a petabyte of logs of the entire Vercel Network and API, extending well beyond the initial Context[.]ai compromise.

We now understand that the threat actor has been active beyond that startup''s compromise. Threat intel points to the distribution of malware to computers in search of valuable tokens like keys to Vercel accounts and other providers.

Once the attacker gets ahold of those keys, our logs show a repeated pattern: rapid and comprehensive API usage, with a focus on enumeration of non-sensitive environment variables.

As a result:
◾We''ve deepened and widened our collaboration with partners across the industry, like Microsoft, AWS and Wiz, to further protect the broader internet.
◾ We''ve notified other suspected victims of this threat actor, independent of this event, encouraging them to rotate credentials and adopt best practices.

We''ve also shipped a bunch more product enhancements. I''m extremely thankful to our team and industry partners for working around the clock. For more details on the ongoing investigation, refer to our security bulletin:
https://t.co/BLVnic9fJC', 'en', 1071, 67, 137, 137538, 7, 'Substantive security update from Vercel', NULL, 0, NULL, NULL, NULL),
    ('2047145172337836139', 'twitter', 'perplexity_ai', 'https://x.com/perplexity_ai/status/2047145172337836139', 'Thu Apr 23 02:46:57 +0000 2026', '2026-04-23 13:11:19', NULL, 'Kimi K2.6, the new state-of-the-art open-weight model from Moonshot, is now available for Pro and Max subscribers. https://t.co/Cn2mRh8525', 'en', 991, 54, 44, 53448, 7, 'New state-of-the-art open-weight model release', NULL, 0, NULL, NULL, NULL),
    ('2047025400753385690', 'twitter', 'replicate', 'https://x.com/replicate/status/2047025400753385690', 'Wed Apr 22 18:51:02 +0000 2026', '2026-04-23 13:11:19', NULL, 'Kimi K2.6 is live on Replicate.

@Kimi_Moonshot ''s new 1T-parameter open model ran autonomously for 13 hours to refactor an 8-year-old trading engine — 4,000+ lines, 1,000+ tool calls, 185% throughput gain.

Open weights. Agentic coding that actually finishes.

https://t.co/sBkNgD7FZK', 'en', 36, 1, 5, 2539, 7, 'Substantive technical release of Kimi K2.6 open model', '{"rank":1,"rank_reason":"1T-parameter open model (Kimi K2.6) live; 13hr autonomous refactor demo","quick_take":"Kimi K2.6 autonomously refactored an 8-year-old trading engine, showcasing AI''s potential for complex coding tasks.","drafts":{"straight":"Replicate just launched Kimi K2.6, a 1T-parameter open model that autonomously refactored an 8-year-old trading engine with 4,000+ lines of code and 185% throughput gain.","hot_take":"Kimi K2.6''s 13-hour autonomous refactor of a legacy trading engine shows how AI can tackle complex, real-world coding tasks — not just toy examples.","thread":"What does it mean for AI to ''actually finish'' a coding task? Kimi K2.6''s refactor of an 8-year-old trading engine offers a glimpse into agentic coding''s potential. Let’s break it down:"},"drafted_at":"2026-04-23T16:24:23.389Z"}', 0, '2026-04-23T16:26:09.581Z', 5, NULL),
    ('2047016400292839808', 'twitter', 'perplexity_ai', 'https://x.com/perplexity_ai/status/2047016400292839808', 'Wed Apr 22 18:15:16 +0000 2026', '2026-04-23 13:11:19', NULL, 'We''ve published new research on how we post-train models for accurate search-augmented answers.

Our SFT + RL pipeline improves search, citation quality, instruction following, and efficiency.

With Qwen models, we match or beat GPT models on factuality at a lower cost. https://t.co/0w0Jmc9xlS', 'en', 1558, 58, 133, 287180, 7, 'Substantive research on model training for search accuracy', '{"rank":2,"rank_reason":"Perplexity publishes post-training research: SFT+RL pipeline for search","quick_take":"Perplexity''s new SFT + RL pipeline improves search accuracy and matches GPT factuality at lower cost.","drafts":{"straight":"Perplexity just released new research on post-training models for accurate search-augmented answers using SFT + RL pipelines.","hot_take":"Perplexity''s SFT + RL pipeline boosts search accuracy and citation quality — matching GPT models on factuality at lower cost with Qwen models.","thread":"How does Perplexity achieve GPT-level factuality at lower cost? 🧵 Their new SFT + RL pipeline enhances search, citations, and efficiency. Let''s break it down:"},"drafted_at":"2026-04-23T16:24:19.815Z"}', 0, '2026-04-23T16:26:09.191Z', 4, NULL),
    ('2047002434984354290', 'twitter', 'replicate', 'https://x.com/replicate/status/2047002434984354290', 'Wed Apr 22 17:19:46 +0000 2026', '2026-04-23 13:11:19', NULL, 'V6 from @PixVerse_ is now live on Replicate.

Precise Camera Movement Control — pans, tilts, zooms, tracking shots, seamless perspective shifts.

Rich Character Emotional Expression — nuanced facial expressions and body language.

Dynamic Scene Performance — motion + real-world physics + collision feedback + spatial relationships.

Text Generation Capability — Chinese/English/multilingual text in-frame with sharp typography.

First-Person High-Speed Motion — immersive POV with smooth camera tracking.

One-Click Promo/Ad Generation — multi-shot short films, e-commerce, product showcases.

We asked PixVerse V6 for a luxury watch commercial.

It gave us five shots, original score, and a brand name.', 'en', 27, 7, 10, 3918, 7, 'Substantive technical release of PixVerse V6 with advanced video features', NULL, 0, NULL, NULL, NULL),
    ('2046989162088186220', 'twitter', 'planetscale', 'https://x.com/planetscale/status/2046989162088186220', 'Wed Apr 22 16:27:02 +0000 2026', '2026-04-23 13:11:19', NULL, 'One bad query shouldn''t be able to take down your whole database.

PlanetScale Traffic Control lets you set and enforce resource budgets on all your query traffic.

Keep your database healthy, even when clients send unexpected load. https://t.co/sDl9p5DrKV', 'en', 30, 1, 1, 5587, 7, 'PlanetScale Traffic Control launch for query resource budgets', '{"rank":5,"rank_reason":"PlanetScale Traffic Control: resource budgets to prevent query overload","quick_take":"PlanetScale''s Traffic Control prevents rogue queries from overwhelming databases by enforcing resource budgets.","drafts":{"straight":"PlanetScale just released Traffic Control, letting you set and enforce resource budgets on database queries to prevent overload.","hot_take":"PlanetScale''s Traffic Control introduces query resource budgets—a smart move for DBAs tired of rogue queries tanking performance.","thread":"🚨 PlanetScale''s Traffic Control could change how we handle database load. Let''s break down why query resource budgets matter and how they prevent cascading failures."},"drafted_at":"2026-04-23T16:24:14.526Z"}', 0, '2026-04-23T16:25:33.298Z', 3, NULL),
    ('2047254150954491958', 'twitter', 'stratechery', 'https://x.com/stratechery/status/2047254150954491958', 'Thu Apr 23 10:00:00 +0000 2026', '2026-04-23 13:11:28', NULL, '4-23-2026

An Interview with Google Cloud CEO Thomas Kurian About the Agentic Moment

https://t.co/wVnjzeDtk1', 'en', 7, 0, 3, 2568, 3, 'Interview with Google Cloud CEO about industry trends', NULL, 0, NULL, NULL, NULL),
    ('2047073273121247744', 'twitter', 'replit', 'https://x.com/replit/status/2047073273121247744', 'Wed Apr 22 22:01:15 +0000 2026', '2026-04-23 13:11:28', NULL, 'What used to take a 9-month build cycle now ships in 3 days with Replit. https://t.co/yfeioc6dab', 'en', 44, 2, 5, 4858, 5, 'parse-fail', NULL, 0, NULL, NULL, NULL),
    ('2047071736823238727', 'twitter', 'sarahcat21', 'https://x.com/sarahcat21/status/2047071736823238727', 'Wed Apr 22 21:55:09 +0000 2026', '2026-04-23 13:11:28', NULL, 'Hoping to nerd snipe someone: if I test-time trained two identical models on the same exact tokens in the same exact order, should I expect them to forget the same things? How might I measure this?', 'en', 30, 13, 0, 15127, 5, 'parse-fail', NULL, 0, NULL, NULL, NULL),
    ('2047068587190542831', 'twitter', 'simonw', 'https://x.com/simonw/status/2047068587190542831', 'Wed Apr 22 21:42:38 +0000 2026', '2026-04-23 13:11:28', NULL, 'Not the first time either - they shut down a bunch of of their original proprietary hosted embedding models in this announcement back in April 2024 https://t.co/v764AHwXom', 'en', 119, 16, 4, 32958, 5, 'parse-fail', NULL, 0, NULL, NULL, NULL);

INSERT OR IGNORE INTO events (id, source, source_handle, url, created_at, ingested_at, title, text, lang, like_count, reply_count, retweet_count, view_count, score, score_reason, drafts_json, posted, pushed_at, tg_message_id, approved_variant) VALUES
    ('2047027786842345840', 'twitter', 'replit', 'https://x.com/replit/status/2047027786842345840', 'Wed Apr 22 19:00:30 +0000 2026', '2026-04-23 13:11:28', NULL, 'Introducing Race to Revenue.

Follow real founders around the world for a once-in-a-lifetime opportunity to build and launch products live on camera. But whose app will prove itself with cold, hard revenue?

Out now. Let''s race. ⠕ https://t.co/RzGsD6eV2T', 'en', 195, 14, 14, 34680, 5, 'Replit launches Race to Revenue show', NULL, 0, NULL, NULL, NULL),
    ('2047020966598078863', 'twitter', 'replit', 'https://x.com/replit/status/2047020966598078863', 'Wed Apr 22 18:33:24 +0000 2026', '2026-04-23 13:11:28', NULL, 'Keeping your apps secure has always required constant oversight from you.

Replit Auto-Protect now keeps watch over your apps 24x7.

We''ll monitor threats, proactively prepare fixes and notify you to apply those fixes, even when you are away.', 'en', 127, 6, 11, 55160, 7, 'Replit Auto-Protect launch for app security', NULL, 0, NULL, NULL, NULL),
    ('2047017964105597009', 'twitter', 'sama', 'https://x.com/sama/status/2047017964105597009', 'Wed Apr 22 18:21:29 +0000 2026', '2026-04-23 13:11:28', NULL, 'These are cool! I think most companies will want to use them.', 'en', 4415, 400, 185, 888955, 3, 'Vague endorsement without specific tech reference', NULL, 0, NULL, NULL, NULL),
    ('2047299355887988847', 'twitter', 'tobi', 'https://x.com/tobi/status/2047299355887988847', 'Thu Apr 23 12:59:38 +0000 2026', '2026-04-23 13:11:35', NULL, 'Self recommending must-read for Canadians. 

“The path Canada is on, economically and culturally, is no longer sufficient to make us a flourishing world class nation.”', 'en', 19, 4, 3, 1775, 1, 'Personal opinion tweet about Canada', NULL, 0, NULL, NULL, NULL),
    ('2047217611880984935', 'twitter', 'swyx', 'https://x.com/swyx/status/2047217611880984935', 'Thu Apr 23 07:34:48 +0000 2026', '2026-04-23 13:11:35', NULL, 'https://t.co/k3XbbNGw5s', 'zxx', 403, 71, 18, 21019, 3, 'Link without context or description', NULL, 0, NULL, NULL, NULL),
    ('2047140362771132544', 'twitter', 'swyx', 'https://x.com/swyx/status/2047140362771132544', 'Thu Apr 23 02:27:51 +0000 2026', '2026-04-23 13:11:35', NULL, 'btw in talking to friends the best framing for how to discuss GPT-Image-2-Thinking taking multiple tens of mins for generation and being able to oneshot QR codes and diagrams and logos and foods and faces..

...is that Image-2 is a new Image model, Image-2-Thinking is a new Image AGENT that basically has search and photoshop as a tool to use in an agent loop that can search and composite and review its own work.

the same way Gemini Flash Vision destroyed benchmarks by introducing an agentic loop for image-to-text, now Image-2-Thinking is doing it for text-to-image.', 'en', 89, 14, 4, 13791, 7, 'Substantive technical analysis of GPT-Image-2-Thinking', NULL, 0, NULL, NULL, NULL),
    ('2047137849539956862', 'twitter', 'swyx', 'https://x.com/swyx/status/2047137849539956862', 'Thu Apr 23 02:17:51 +0000 2026', '2026-04-23 13:11:35', NULL, 'GPT 5.5 tomorrow would be the best damn birthday gift I could ever ask for', 'en', 301, 13, 3, 25059, 1, 'Personal wish for GPT-5 5', NULL, 0, NULL, NULL, NULL),
    ('2047133338150842676', 'twitter', 'tobi', 'https://x.com/tobi/status/2047133338150842676', 'Thu Apr 23 01:59:56 +0000 2026', '2026-04-23 13:11:35', NULL, 'This is the beginning of something really big', 'en', 2479, 42, 97, 311306, 3, 'Vague announcement without specific details', NULL, 0, NULL, NULL, NULL),
    ('2047077765581816105', 'twitter', 'swyx', 'https://x.com/swyx/status/2047077765581816105', 'Wed Apr 22 22:19:06 +0000 2026', '2026-04-23 13:11:35', NULL, 'Team @Shopify brought some fire to this one; add this to the growing list of “WTF happened in Dec 2025” charts

(this plots token usage across all the technical staff of shopify - the whole time they had unlimited token budget, but something cracked recently and the slope is both changing and percentile deltas are widening a concerning amount!!)', 'en', 24, 9, 0, 6180, 5, 'Shopify token usage analysis', NULL, 0, NULL, NULL, NULL),
    ('2046990638348947925', 'twitter', 'tan_stack', 'https://x.com/tan_stack/status/2046990638348947925', 'Wed Apr 22 16:32:54 +0000 2026', '2026-04-23 13:11:35', NULL, 'Your AI stream is a black box. 🕳️

One flag in TanStack AI and every chunk, middleware hook, and tool call prints itself for easy debugging. 🔥

No OpenTelemetry. 
No dashboard. 
No platform.

chat({ ..., debug: true }) 🚀

Blog 👇 https://t.co/1tsIE7rZ0a', 'en', 299, 13, 12, 25947, 5, 'TanStack AI debug feature announcement', NULL, 0, NULL, NULL, NULL);

INSERT OR IGNORE INTO events (id, source, source_handle, url, created_at, ingested_at, title, text, lang, like_count, reply_count, retweet_count, view_count, score, score_reason, drafts_json, posted, pushed_at, tg_message_id, approved_variant) VALUES
    ('2046969418601709757', 'twitter', 'vite_js', 'https://x.com/vite_js/status/2046969418601709757', 'Wed Apr 22 15:08:34 +0000 2026', '2026-04-23 13:11:43', NULL, 'Vite has reached 80_000 @github Stars! ⭐

Thanks to every stargazer and contributor https://t.co/vi3KxgMcR5', 'en', 596, 7, 17, 44998, 3, 'Vite GitHub stars milestone announcement', NULL, 0, NULL, NULL, NULL);

