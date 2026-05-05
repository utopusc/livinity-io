-- Phase 85 V32-AGENT-03 — 5 specialized v32 system agents (Wave 1 schema slice).
--
-- This file is a documentation artifact mirroring the canonical TypeScript
-- runner at livos/packages/livinityd/source/modules/database/seeds/agents.ts.
-- The TS runner is invoked from initDatabase() (idempotent, safe-on-failure).
-- This SQL is reviewable / hand-runnable on a stuck Mini PC.
--
-- Idempotency: each INSERT is keyed on a fixed UUID literal. ON CONFLICT (id)
-- DO NOTHING ensures re-running the seed (or boot loop) does not duplicate
-- rows. The 5 UUIDs are stable forever — UI tRPC consumers (Wave 2 P85-UI)
-- may reference them by id for "Reset to Default" or curated marketplace
-- featured-list features.
--
-- All 5 seeds: user_id=NULL (system-wide, not user-scoped), is_public=TRUE,
-- is_default=FALSE, marketplace_published_at=NOW().

-- 5 stable UUIDs (referenced by the TS seed runner — keep in sync):
--   Liv Default       11111111-1111-4111-8111-111111111111
--   Researcher        22222222-2222-4222-8222-222222222222
--   Coder             33333333-3333-4333-8333-333333333333
--   Computer Operator 44444444-4444-4444-8444-444444444444
--   Data Analyst      55555555-5555-4555-8555-555555555555

INSERT INTO agents (
  id, user_id, name, description, system_prompt, model_tier,
  configured_mcps, agentpress_tools, avatar, avatar_color,
  is_default, is_public, marketplace_published_at, tags
) VALUES
(
  '11111111-1111-4111-8111-111111111111',
  NULL,
  '🤖 Liv Default',
  'General-purpose AI assistant with full tool access. Best for everyday tasks, research, and exploration.',
  'You are Liv, a helpful AI assistant running on the user''s home server. You have access to terminal, files, web search, browser tools, and MCP servers. Be concise, accurate, and proactive.',
  'sonnet',
  '[]'::jsonb,
  '{"terminal": true, "files": true, "web_search": true, "web_scrape": true, "browser_devtools": true, "git": true, "computer_use": false, "csv_preview": false}'::jsonb,
  '🤖',
  '#3b82f6',
  FALSE, TRUE, NOW(),
  ARRAY['general', 'assistant']
),
(
  '22222222-2222-4222-8222-222222222222',
  NULL,
  '🔬 Researcher',
  'Web research specialist. Searches, scrapes, summarizes, and cites sources.',
  'You are a research specialist. Always cite sources with URLs. When asked to research a topic, use web_search broadly first, then web_scrape on the most relevant results. Synthesize findings into structured reports with citations.',
  'sonnet',
  '[]'::jsonb,
  '{"web_search": true, "web_scrape": true, "browser_devtools": true, "files": true, "terminal": false, "git": false, "computer_use": false, "csv_preview": false}'::jsonb,
  '🔬',
  '#10b981',
  FALSE, TRUE, NOW(),
  ARRAY['research', 'web']
),
(
  '33333333-3333-4333-8333-333333333333',
  NULL,
  '💻 Coder',
  'Software engineering specialist. Writes, reviews, refactors, and ships code.',
  'You are a senior software engineer. Read existing code before making changes. Follow the project''s conventions. Run tests before marking work complete. Use git for version control. Prefer editing existing files over creating new ones.',
  'opus',
  '[]'::jsonb,
  '{"terminal": true, "files": true, "browser_devtools": true, "git": true, "web_search": true, "web_scrape": false, "computer_use": false, "csv_preview": false}'::jsonb,
  '💻',
  '#8b5cf6',
  FALSE, TRUE, NOW(),
  ARRAY['coding', 'engineering']
),
(
  '44444444-4444-4444-8444-444444444444',
  NULL,
  '🖥️ Computer Operator',
  'Operates the desktop directly via screenshots and mouse/keyboard control. Best for GUI automation.',
  'You operate the user''s desktop via the bytebot MCP. Take screenshots first to see the current state. Click coordinates explicitly. Verify each action by taking another screenshot. Be deliberate — each click is consequential.',
  'sonnet',
  '[{"name": "bytebot", "enabledTools": ["screenshot", "click", "type", "key", "scroll"]}]'::jsonb,
  '{"computer_use": true, "files": true, "terminal": false, "web_search": false, "web_scrape": false, "browser_devtools": false, "git": false, "csv_preview": false}'::jsonb,
  '🖥️',
  '#f59e0b',
  FALSE, TRUE, NOW(),
  ARRAY['gui', 'automation', 'computer-use']
),
(
  '55555555-5555-4555-8555-555555555555',
  NULL,
  '📊 Data Analyst',
  'Loads CSVs, runs analysis, generates visualizations and summary statistics.',
  'You analyze data. Always inspect schema and head/tail of datasets first. Compute summary statistics. Generate clear, labeled visualizations when helpful. Explain findings in plain language with key numbers highlighted.',
  'sonnet',
  '[]'::jsonb,
  '{"files": true, "csv_preview": true, "terminal": true, "web_search": false, "web_scrape": false, "browser_devtools": false, "git": false, "computer_use": false}'::jsonb,
  '📊',
  '#ec4899',
  FALSE, TRUE, NOW(),
  ARRAY['data', 'analysis']
)
ON CONFLICT (id) DO NOTHING;
