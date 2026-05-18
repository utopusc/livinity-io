# Phase 152 — AI Section (MCP + Agents + GSD) — 🟡 WAVE A SHIPPED 2026-05-18

**Milestone:** v37.0
**Status:** Wave A (catalog seed) ✅; Wave B (install handler that wires MCP servers into mcpConfigManager + clones agent templates + installs GSD skills) deferred to follow-up
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

## Wave A — Catalog seed

Applied Supabase migration `phase_152_seed_ai_tools`. 14 rows with `section='ai'`:

- **10 MCP servers** (kind: `mcp`): filesystem, github, postgres, brave-search, puppeteer, slack, gdrive, memory, fetch, everything
- **3 agent templates** (kind: `agent`): Code Reviewer, Bug Triager, Daily Standup
- **1 GSD** (kind: `gsd`): GSD Planning Skills

Each row's manifest follows SPEC §2.4 discriminated union — `kind: 'mcp' | 'agent' | 'gsd'`.

`/api/apps?section=ai` → 14 rows verified.

## Wave B (deferred)

- livinityd `ai-installer.ts` per SPEC §4 — dispatches on `manifest.kind`
  - `mcp` → adds entry to `mcpConfigManager.installServer({ name, transport, command, args, env })` (Phase 77 wiring exists)
  - `agent` → clones template into user's `agent_templates` row (table exists from Phase 32)
  - `gsd` → installs the gsd skill set onto the LivOS's Claude Agent SDK config (mechanism TBD — needs design)
- envSchema modal at install time (collects GITHUB_TOKEN / BRAVE_API_KEY / SLACK_BOT_TOKEN etc.)
- AI Chat "Add MCP" link → `/store?section=ai` (replace existing dialog)
- Per-section detail page customization (MCP servers show transport + tools list; agents show system prompt preview; GSD shows skill list)

See also: [[148-SPEC]], [[151-webapp-section]].
