---
phase: 41-anthropic-messages-broker
plan: 41-04
status: complete-locally
completed: 2026-04-30
type: feature
---

# Plan 41-04 Summary — AI Chat Carry-Forward (X-LivOS-User-Id → homeOverride)

## Files Modified (2 edits)

### 1. `livos/packages/livinityd/source/modules/ai/index.ts`

- **Import added** (line 10): `import {isMultiUserMode} from './per-user-claude.js'`
- **Headers refactored** (around line 470 of pre-edit, now lines 470-489): Inline header object hoisted into `proxyHeaders` variable. Conditional `X-LivOS-User-Id` header added when both `userId` is defined AND `isMultiUserMode(this.livinityd)` returns true.

### 2. `nexus/packages/core/src/api.ts`

- **`/api/agent/stream` handler** (line 2399+):
  - After existing `extractUserIdFromRequest(req)` call (~line 2407), added `headerUserId` reader with regex validation (`/^[a-zA-Z0-9_-]+$/`) and a comment block documenting the trust model.
  - Added `homeOverride` computation: `path.join(LIVOS_DATA_DIR, 'users', headerUserId, '.claude')` (defaulting to `/opt/livos/data`), with info log for traceability.
  - Modified `agentConfig` block (~line 2480): added `...(homeOverride ? {homeOverride} : {})` spread-conditional so the field is genuinely absent in single-user mode.
  - Added comment to `webJid` line clarifying that `webJid` continues to use JWT-derived `userId` only (NOT header-derived).

## Sacred File Verification

- Pre-commit hash: `623a65b9a50a89887d36f770dcd015b691793a7f`
- Post-commit hash: `623a65b9a50a89887d36f770dcd015b691793a7f` (unchanged)
- `git diff nexus/packages/core/src/sdk-agent-runner.ts` → empty (the broker / api.ts wire changes never touched the sacred file body)

## Test Results

- `cd nexus/packages/core && npm run build` → exits 0, zero TypeScript errors (clean compile)
- `cd nexus/packages/core && npm run test:phase40` → 9/9 PASS (4 home-override + 5 chained Phase 39)
- `npx tsx --eval "import('./source/modules/ai/index.js')..."` → loads cleanly

## Wire-Format Diff Summary

| Mode | Pre-Plan-41-04 wire | Post-Plan-41-04 wire | Notes |
|------|--------------------|--------------------|-------|
| Single-user mode (`isMultiUserMode === false`) | Headers: `{Content-Type, X-API-Key}` | Headers: `{Content-Type, X-API-Key}` | **Byte-identical — preserves Phase 40's regression guarantee** |
| Multi-user mode (`isMultiUserMode === true`, `userId` defined) | Headers: `{Content-Type, X-API-Key}` | Headers: `{Content-Type, X-API-Key, X-LivOS-User-Id: <userId>}` | One additional header sent |
| Body | `{task, max_turns: 30, conversationId, userPersonalization}` | unchanged | No body changes |

On the nexus side:
- When header absent → `headerUserId === undefined` → `homeOverride === undefined` → spread-conditional makes `agentConfig` shape identical to pre-Plan-41-04. SdkAgentRunner's `safeEnv.HOME` falls back to `process.env.HOME` (line 266).
- When header present + valid → `agentConfig.homeOverride = '/opt/livos/data/users/<userId>/.claude'` → SdkAgentRunner's `safeEnv.HOME` uses that path → spawned `claude` CLI subprocess sees the per-user `.claude/` dir.

## Phase 40 Carry-Forward Closure

Phase 40's `40-SUMMARY.md` "Honest Deferred Work" item #1 ("`/api/agent/stream` HOME wiring for AI Chat is Phase 41 scope") is **now closed**. Every multi-user-mode AI Chat request **AND** every Plan 41-03 broker request spawns `SdkAgentRunner` with the right per-user HOME.

ROADMAP Phase 40 success criterion #3 (the AI Chat portion) becomes verifiable on the next deploy: as User A in multi-user mode, an AI Chat message → `ps -ef` → `cat /proc/<pid>/environ` should show `HOME=/opt/livos/data/users/<userA-id>/.claude`. (Plan 41-05 41-UAT.md Section G covers this.)

## Pointer

Next plan: `41-05-PLAN.md` (33 tests + `test:phase41` npm script + 41-UAT.md manual checklist).
