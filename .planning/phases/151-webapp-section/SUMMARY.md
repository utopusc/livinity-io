# Phase 151 — WebApp Section + Custom URL — 🟡 WAVE A SHIPPED 2026-05-18

**Milestone:** v37.0
**Status:** Wave A (catalog seed) ✅; Wave B (Custom URL form UI + livinityd `webapp.create` wiring) deferred to follow-up
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

## Wave A — Catalog seed

Applied Supabase migration `phase_151_seed_webapps`. 10 curated WebApp rows with `section='webapp'` and SPEC §2.2 manifests (`{ url, defaultTitle }`).

| Slug | Name | URL |
|---|---|---|
| notion | Notion | notion.so |
| linear | Linear | linear.app |
| slack-web | Slack | app.slack.com |
| discord-web | Discord | discord.com/app |
| github-web | GitHub | github.com |
| figma-web | Figma | figma.com |
| vercel-web | Vercel Dashboard | vercel.com/dashboard |
| cloudflare-web | Cloudflare Dashboard | dash.cloudflare.com |
| chatgpt-web | ChatGPT (featured) | chatgpt.com |
| claude-web | Claude (featured) | claude.ai |

`/api/apps?section=webapp` → 10 rows verified. localhost:3001 Web Apps tab now renders the 10 cards.

## Wave B (deferred)

- Custom URL form UI on the WebApp section page (input → preview → "Add to Dock")
- livinityd-side OpenGraph + favicon scrape (10s timeout) — already exists in `webapps/metadata-extractor.ts` (Phase 94), needs `/api/webapp/preview` wrapper route on Vercel
- Wire to existing `webapp.create` tRPC procedure (Phase 94)
- CSP allowlist + X-Frame-Options handling per v37-DRAFT.md risk table

See also: [[148-SPEC]], [[150-native-apps-section]].
