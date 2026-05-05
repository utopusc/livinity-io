---
gsd_state_version: 1.0
milestone: v32.0
milestone_name: AI Chat Ground-up Rewrite + Hermes Background Runtime
status: Wave 4 SHIPPED 2026-05-06 — P88 (WS→SSE migration via useLivAgentStream + status_detail consumption + AgentSelector) + P89 (ThemeToggle + keyboard shortcuts + a11y polish). Sacred SHA f3538e1d preserved. WCAG flag: --liv-muted-foreground 3.12:1 fails AA 4.5:1 (P91 UAT to address). Wave 5 next: P90 cutover → P91 UAT sequential.
last_updated: "2026-05-06T03:00:00.000Z"
last_activity: 2026-05-06 — Wave 4 of v32 shipped (commits 50156555 P89 + 464eba3b P88). 11/12 phases complete. Autonomous orchestration continuing.
progress:
  total_phases: 12
  completed_phases: 11
  total_plans: 12
  completed_plans: 11
  percent: 92
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime — Suna-faithful UI rewrite + Hermes runtime patterns + light theme; routed via `/gsd-autonomous`
**Last shipped milestone:** v31.0 Liv Agent Reborn — closed 2026-05-05 (P64-P79 all complete; P77+P78+P79 hot-fix wave shipped 2026-05-05; bytebot MCP working end-to-end via host GNOME desktop)
**Next action:** Wave 2 dispatch (P81 + P82 + P83 + P85-UI + P86) — 5 paralel agents in their own subdirectories of `livos/packages/ui/src/routes/`

## Current Position

Milestone: v32.0 (active) — 8/12 phases complete
Wave 1: ✅ COMPLETE — `759ef597` P80, `9a276a11` P85-schema, `628ed1ca` P87, `12aa473f` summaries
Wave 2: ✅ COMPLETE — `4379ea89` P81, `6f758067` P82, `0df7475b` P83, `49d79510` P86, `52944d16` P85-UI
Wave 3: ✅ COMPLETE — `d719a175` P84 (MCP SoT + Smithery secondary + legacy mcp-panel deprecated)
Wave 4: ✅ COMPLETE — `50156555` P89 (ThemeToggle + Cmd-key shortcuts + a11y), `464eba3b` P88 (WS→SSE + status_detail UI + AgentSelector)
Wave 5: ◆ NEXT — P90 cutover (set Redis flag liv:config:new_chat_enabled=true; switch /ai-chat default to v32; redirect /agent-marketplace → /marketplace; mount ThemeToggle in v32 chat header [P89 deferred]; wire localStorage liv-last-assistant in SSE handler [P89 deferred]) → P91 UAT (full smoke + WCAG fix for --liv-muted-foreground)

## Wave 1 Deliverables (shipped)

- **P80 Foundation** (`759ef597`) — OKLCH design tokens, Geist Sans/Mono fonts, ThemeProvider+useTheme, `/playground/v32-theme` preview route. UI build clean (35.86s, 422 precache entries).
- **P85-schema** (`9a276a11`) — `agents` table (`id` UUID PK + nullable `user_id`), agents-repo with full CRUD/clone/publish, 5 stable seed UUIDs (Liv Default `1111…`, Researcher `2222…`, Coder `3333…`, Computer Operator `4444…`, Data Analyst `5555…`), `agent_templates` backfilled readonly. 23/23 + 86/86 tests pass.
- **P87 Hermes runtime** (`628ed1ca`) — 5 Hermes patterns ported (status_detail chunk, IterationBudget=90, steer injection, batchId per turn, JSON repair chain). `lib/hermes-phrases.ts` with 15 THINKING_VERBS + 3 WAITING_VERBS. Sacred sdk-agent-runner.ts SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED.

## Sacred Constraints (v32-wide)

- `liv/packages/core/src/sdk-agent-runner.ts` SHA MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at all times. Verified before/after every wave.
- D-NO-BYOK: subscription-only path (`@anthropic-ai/claude-agent-sdk`). No raw `@anthropic-ai/sdk` fallback.
- D-NO-SERVER4: Server4 is NOT ours. Mini PC (`bruce@10.69.31.68`) is the only deploy target. (Live deploy is user's job — orchestrator only ships to GitHub.)
- D-LIV-STYLED: Hermes runtime patterns adopted, KAWAII emoticons + ASCII frames NOT adopted.

## Blockers / Concerns

None — Wave 1 fully verified. Sacred SHA preserved. Builds green across 3 packages.

## Reference

- Milestone master plan: `.planning/v32-DRAFT.md`
- Roadmap: `.planning/ROADMAP.md` v32 section (lines 55-104)
- v31 archive note: see commit `37a82557` (which marked v31 complete in ROADMAP)
- Wave 1 SUMMARYs:
  - `.planning/phases/80-foundation-tokens-fonts-theme/80-SUMMARY.md`
  - `.planning/phases/85-agent-management/85-SCHEMA-SUMMARY.md`
  - `.planning/phases/87-hermes-background-runtime/87-SUMMARY.md`
