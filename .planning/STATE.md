---
gsd_state_version: 1.0
milestone: v32.0
milestone_name: AI Chat Ground-up Rewrite + Hermes Background Runtime
status: Wave 2 SHIPPED 2026-05-05 — P81 (chat UI) + P82 (tool panel) + P83 (per-tool views) + P85-UI (agent management) + P86 (marketplace) all green, sacred SHA f3538e1d preserved. UI build 36.28s clean. Wave 3 next: P84 MCP Single Source of Truth (depends on Wave 2 deliverables).
last_updated: "2026-05-05T23:55:00.000Z"
last_activity: 2026-05-05 — Wave 2 of v32 shipped (5 atomic commits 4379ea89→52944d16). 8/12 phases complete. Autonomous orchestration continuing.
progress:
  total_phases: 12
  completed_phases: 8
  total_plans: 12
  completed_plans: 8
  percent: 67
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
Wave 3: ◆ NEXT — P84 (MCP Single Source of Truth) — depends on Wave 2 deliverables (BrowseDialog/ConfigDialog/ConfiguredMcpList; replaces legacy mcp-panel sidebar tab)
Wave 4: P88 + P89 (WS→SSE migration + a11y/keyboard) — depends on Wave 3
Wave 5: P90 → P91 (cutover + UAT) — sequential

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
