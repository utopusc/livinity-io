---
phase: 40-per-user-claude-oauth-home-isolation
plan: 01
status: complete
completed: 2026-04-30
requirements:
  - FR-AUTH-01
  - FR-AUTH-02
  - FR-AUTH-03
sacred-file-sha: 2b3b005bf1594821be6353268ffbbdddea5f9a3a
sacred-file-touched: false
---

# Plan 40-01 Summary — Codebase Audit

## Result

`.planning/phases/40-per-user-claude-oauth-home-isolation/40-AUDIT.md` produced (4 sections covering Plans 02-05). Zero source files modified; read-only investigation only.

## Key findings

- **Sacred file SHA verification: PASS.** `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` = `2b3b005bf1594821be6353268ffbbdddea5f9a3a` — byte-identical to Phase 39 baseline.
- **HOME line confirmed at line 266** (matches CONTEXT.md prediction). Single match.
- **AgentConfig interface at lines 19-70** in `nexus/packages/core/src/agent.ts`. Recommended insertion: after `nexusConfig?` (line 23), before `maxTurns?` (line 24).
- **Backend insertion point** for new tRPC routes: `livos/packages/livinityd/source/modules/ai/routes.ts` between line 371 (`claudeLogout` close) and line 373 (`// ── Provider Management ──` divider).
- **Multi-user gate canonical pattern:** `await <livinityd-ref>.ai.redis.get('livos:system:multi_user') === 'true'`. 5 existing call sites in livinityd source.
- **`observable` from `@trpc/server/observable` already imported** at line 2 of routes.ts — Plan 03 does NOT need to add this import.
- **UI Claude card boundaries:** `livos/packages/ui/src/routes/settings/ai-config.tsx` lines 311-478. ai-config.tsx is the SOLE consumer of `claudeStartLogin` in the UI.
- **Recommended new tRPC route names:** `claudePerUserStatus` (query), `claudePerUserStartLogin` (subscription), `claudePerUserLogout` (mutation).
- **Test conventions:** `node:assert/strict` + `tsx`. No vitest, no jest. BASELINE_SHA constant lives at line 31 of `sdk-agent-runner-integrity.test.ts`.

## Plans 02-05 unblocked

Every downstream plan now has the exact file paths, line numbers, function names, and patterns it needs. No further codebase exploration required.

## Self-Check: PASSED

- [x] AUDIT.md exists at the prescribed path.
- [x] All 4 sections present (Sections 1-4).
- [x] Sacred file SHA recorded + matches Phase 39 baseline.
- [x] No source files modified.
