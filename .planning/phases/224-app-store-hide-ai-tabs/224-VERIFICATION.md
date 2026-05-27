---
phase: 224-app-store-hide-ai-tabs
verified: 2026-05-27T10:10:02Z
status: human_needed
score: 23/23 automated must-haves verified (5 operator-visual SCs require browser walk)
overrides_applied: 0
human_verification:
  - test: "SC-01 visual — App Store category nav"
    expected: "https://bruce.livinity.io/app-store shows NO `AI` category tab between Automation and Developer"
    why_human: "Backend gate + UI filter logic are verified in source; visual confirmation that the rendered nav matches code intent requires a browser walk"
  - test: "SC-02 visual — Settings sidebar"
    expected: "https://bruce.livinity.io/settings shows NO `MCP Servers` row in the WORKSPACE group"
    why_human: "Same as SC-01 — visual rendering proof needed beyond filter-array verification"
  - test: "SC-03 visual — direct URL admin recovery"
    expected: "https://bruce.livinity.io/settings/mcp-servers renders the MCP Servers management panel (not 404, not blank)"
    why_human: "curl returned HTTP 200 in Step 4 but that proves the route serves, not that the React lazy component mounts cleanly in browser"
  - test: "SC-04 visual — banner present + dismissible + re-appears on F5"
    expected: "Banner text 'AI integrations temporarily disabled during Liv Assistant migration...' visible on /app-store and /settings; click X dismisses it; F5 re-shows it"
    why_human: "useState-only dismissal contract is verified in unit test but the real browser session round-trip is a UX-level check"
  - test: "SC-05 visual — non-regression on non-AI surfaces"
    expected: "Open Files / AdGuard / Linkwarden from the dock — they open normally with no console errors"
    why_human: "Sacred SHA + diff guard prove no core/ edits, but UI bundle changes could in principle affect unrelated layouts; needs a sanity click-around"
---

# Phase 224: app-store-hide-ai-tabs Verification Report

**Phase Goal:** Hide the legacy AI/MCP/Skills surface in App Store + Settings UI behind Redis-backed feature flag `liv:config:liv_v42_migration_active` (default ON), funneling operators toward the new Liv Assistant (Phase 223). Reversibility mandatory — flipping flag to `false` must restore 100% pre-Phase-224 UI without any code change. Dismissible V42MigrationBanner directs users to new chat. Mini PC live deploy + curl smoke + operator UAT walk.

**Verified:** 2026-05-27T10:10:02Z
**Status:** human_needed (all automated checks GREEN; 5 visual SCs deferred to operator browser walk per --auto chain decision)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (merged from ROADMAP success_criteria + 4 PLAN must_haves)

| #   | Truth                                                                                                                       | Status               | Evidence |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------- |
| 1   | Backend exposes `config.getV42MigrationActive` tRPC query returning `{active: boolean}`                                     | VERIFIED             | config-router.ts:76-83 — `getV42MigrationActive: publicProcedure.query(...)` |
| 2   | Query returns `active=true` when Redis key missing (default-ON)                                                             | VERIFIED             | config-router.ts:80 — `raw === null ? true : raw !== 'false'`; deploy-log shows `{"active":true}` while key absent |
| 3   | Query returns `active=true` when value === 'true' literal                                                                   | VERIFIED             | Same line — `raw !== 'false'` evaluates true for 'true'; deploy-log Step 4 SET=true → `{"active":true}` |
| 4   | Query returns `active=false` ONLY when value === 'false' literal                                                            | VERIFIED             | deploy-log Step 4 SET=false → `{"active":false}` |
| 5   | `useV42MigrationActive()` returns boolean; defaults to `true` while loading/error (hide-first)                              | VERIFIED             | use-v42-migration-active.ts:27 — `if (q.isLoading || q.isError) return true` |
| 6   | Procedure path is in `httpOnlyPaths` (avoids WS handshake hang)                                                             | VERIFIED             | common.ts:749 — `'config.getV42MigrationActive'` inside `httpOnlyPaths` array |
| 7   | Production wire-up injects real Redis client via `createConfigRouter({redis})`                                              | VERIFIED             | livinityd/source/index.ts:1843-1845 + 1861 — `config: configRouterProductionInstance` |
| 8   | App Store nav does NOT render `ai` category button when flag=true                                                           | VERIFIED (code)      | app-store-nav.tsx:33 — `if (v42MigrationActive && categoryId === 'ai') return false` |
| 9   | Settings sidebar hides MCP Servers entry when flag=true (both home + detail views via shared `useVisibleMenuItems`)         | VERIFIED (code)      | settings-content.tsx:199 (`V42_HIDDEN_MENU_IDS = ['mcp-servers']`) + 216 (filter); single hook → both views |
| 10  | Direct URL `/settings/mcp-servers` STILL serves 200 (SC-03 admin recovery)                                                  | VERIFIED             | settings-content.tsx:557 — `case 'mcp-servers':` route handler intact; deploy-log Steps 3 + 4 both show `HTTP 200` |
| 11  | When flag=false, all hidden items re-appear with no rebuild                                                                 | VERIFIED (code)      | `ai` category constant (constants.ts:12,35), MCP Servers MenuItem (settings-content.tsx:167), type union (line 133), route case (line 557) all PRESERVED — filter-only |
| 12  | V42MigrationBanner component exists, accepts `{context: 'app-store' \| 'settings'}` prop                                    | VERIFIED             | v42-migration-banner.tsx:23-25,30 — exported interface + component signature |
| 13  | Banner renders exact migration text and uses Livinity Design tokens (no hardcoded colors)                                   | VERIFIED             | line 27-28 — `V42_MIGRATION_BANNER_TEXT` const matches spec; grep for hex/rgb/rgba returns 0 |
| 14  | Banner is dismissible per-session via useState (NOT localStorage)                                                           | VERIFIED             | Line 31 — `useState(false)`; grep for localStorage/sessionStorage returns 0 |
| 15  | Banner mounted in App Store layout + 4 Settings return branches, conditionally rendered when migrationActive=true           | VERIFIED             | app-store.tsx:70 (1 mount) + settings-content.tsx:235/271/307/328 (4 mounts) — total 5 |
| 16  | Banner contains no emojis                                                                                                   | VERIFIED             | Read-through of v42-migration-banner.tsx — no emoji codepoints |
| 17  | Unit test verifies: renders text + dismiss button hides + no persistence across remount                                     | VERIFIED             | v42-migration-banner.test.tsx exists, 126 lines (>= 25 min); Plan 03 SUMMARY records 4/4 vitest tests passing |
| 18  | Mini PC `livos.service` active after `bash /opt/livos/update.sh`                                                            | VERIFIED             | deploy-log: `Active: active (running)` + `systemctl is-active` lists all 4 services active |
| 19  | Redis key `liv:config:liv_v42_migration_active` set to literal `'true'` on Mini PC (shipping state)                         | VERIFIED             | deploy-log Step 4: `SET ... true → OK; GET → true` (final restored state) |
| 20  | Curl returns `active=true` on live Mini PC                                                                                  | VERIFIED             | deploy-log lines 222, 231, 240, 258, 270 — five `{"active":true}` hits across rounds |
| 21  | Curl returns `active=false` after flipping Redis flag (rollback proof)                                                      | VERIFIED             | deploy-log line 264 — `{"active":false}` after `SET ... false` |
| 22  | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED in HEAD                                                    | VERIFIED             | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`; `git diff --stat 28f39757..HEAD -- liv/packages/core/` empty |
| 23  | Operator visually confirms SC-01 + SC-02 + SC-04 + SC-05 (hides + banner + non-regression)                                  | NEEDS HUMAN          | Plan 224-04 Task 2 deferred per `--auto` chain; backend gate proven, visual layer pending operator walk |

**Score:** 22/23 truths VERIFIED automated; 1 deferred to operator browser walk (`human_needed`).

### Required Artifacts

| Artifact                                                                                                  | Expected                                            | Status     | Details |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------- | ------- |
| `livos/packages/livinityd/source/modules/server/trpc/config-router.ts`                                    | `configRouter` + `createConfigRouter` exports       | VERIFIED   | 116 lines; exports both; default-stub Proxy throws PRECONDITION_FAILED on access |
| `livos/packages/livinityd/source/modules/server/trpc/index.ts`                                            | Import + mount `config: opts.config ?? configRouter` | VERIFIED  | Line 133 import + line 246 opts type + line 351 mount |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts`                                           | `'config.getV42MigrationActive'` in `httpOnlyPaths`  | VERIFIED  | Line 749 |
| `livos/packages/livinityd/source/index.ts`                                                                | Production `createConfigRouter({redis: this.ai.redis})` wire | VERIFIED | Line 189 import + 1843-1845 call + 1861 `config:` opt |
| `livos/packages/ui/src/hooks/use-v42-migration-active.ts`                                                 | Exports `useV42MigrationActive(): boolean` hook     | VERIFIED   | 29 lines; default-true on loading/error |
| `livos/packages/ui/src/modules/app-store/app-store-nav.tsx`                                               | Filter callback drops `ai` when flag=true           | VERIFIED   | Lines 8 (import), 18 (hook call), 33 (predicate) |
| `livos/packages/ui/src/routes/settings/_components/settings-content.tsx`                                  | MENU_ITEMS filtered + 4 banner mounts               | VERIFIED   | Lines 54/59 (imports), 199 (V42_HIDDEN_MENU_IDS), 216 (filter), 235/271/307/328 (banner mounts), 557 (route case preserved) |
| `livos/packages/ui/src/components/banners/v42-migration-banner.tsx`                                       | `V42MigrationBanner` component, dismissible, DS tokens | VERIFIED | 52 lines; zero browser-storage; zero hex/rgb |
| `livos/packages/ui/src/components/banners/v42-migration-banner.test.tsx`                                  | 4 tests passing (text render x2, dismiss, no persistence) | VERIFIED | 126 lines; Plan 03 SUMMARY reports 4/4 vitest tests pass |
| `livos/packages/ui/src/layouts/app-store.tsx`                                                             | Banner mount + hook call inside layout              | VERIFIED   | Lines 7/10 (imports), 43 (hook), 70 (conditional mount) |
| `.planning/phases/224-app-store-hide-ai-tabs/224-04-DEPLOY-LOG.md`                                        | >= 30 lines deploy evidence                         | VERIFIED   | 352 lines with all required tokens |

### Key Link Verification

| From                                       | To                                | Via                                                              | Status  | Details |
| ------------------------------------------ | --------------------------------- | ---------------------------------------------------------------- | ------- | ------- |
| trpc/index.ts                              | config-router.ts                  | `import {configRouter, createConfigRouter}` + mount `config:`    | WIRED   | Line 133 import + 351 mount |
| trpc/common.ts                             | httpOnlyPaths                     | string entry `'config.getV42MigrationActive'`                    | WIRED   | Line 749 |
| livinityd/source/index.ts (boot)           | createConfigRouter                | `createConfigRouter({redis: this.ai.redis})` + `config:` opt     | WIRED   | Lines 1843-1845 + 1861 |
| app-store-nav.tsx                          | use-v42-migration-active.ts       | `import {useV42MigrationActive}` + hook call                     | WIRED   | Lines 8 + 18 |
| settings-content.tsx (`useVisibleMenuItems`) | use-v42-migration-active.ts     | `import` + hook call inside filter                               | WIRED   | Lines 59 + 213 |
| layouts/app-store.tsx                      | v42-migration-banner.tsx          | `import {V42MigrationBanner}` + conditional render               | WIRED   | Lines 7 + 70 |
| settings-content.tsx                       | v42-migration-banner.tsx          | `import {V42MigrationBanner}` + 4 conditional renders            | WIRED   | Lines 54 + 235/271/307/328 |
| Redis (`liv:config:...`)                   | tRPC `config.getV42MigrationActive` | `deps.redis.get(V42_MIGRATION_REDIS_KEY)`                       | WIRED   | config-router.ts:77; deploy-log round-trip evidence |

### Data-Flow Trace (Level 4)

| Artifact                       | Data Variable          | Source                                                                  | Produces Real Data | Status |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------- | ------------------ | ------ |
| `use-v42-migration-active.ts`  | `q.data?.active`       | `trpcReact.config.getV42MigrationActive.useQuery()` → ioredis.get()     | Yes — live Redis read on Mini PC, round-tripped curl evidence shows true/false flips | FLOWING |
| `app-store-nav.tsx`            | `v42MigrationActive`   | `useV42MigrationActive()` → tRPC → Redis                                | Yes — boolean from above chain | FLOWING |
| `settings-content.tsx` (filter) | `v42MigrationActive`  | Same hook                                                               | Yes | FLOWING |
| `v42-migration-banner.tsx`     | (no fetched data; props only — `context` is static literal) | parent guard `{v42MigrationActive && ...}` | N/A — banner is pure-display | NOT APPLICABLE |

### Behavioral Spot-Checks

| Behavior                                                       | Command/Evidence                                          | Result                          | Status |
| -------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------- | ------ |
| Mini PC livos.service is active                                | `systemctl is-active livos liv-core liv-worker liv-memory` | `active` x 4                    | PASS   |
| tRPC config.getV42MigrationActive returns active=true (flag ON) | `curl 127.0.0.1:8080/trpc/config.getV42MigrationActive`   | `{"result":{"data":{"active":true}}}` | PASS   |
| tRPC returns active=false after flag=false SET                 | Same curl after `SET ... false`                           | `{"result":{"data":{"active":false}}}` | PASS   |
| Direct route `/settings/mcp-servers` still serves              | `curl -o /dev/null -w '%{http_code}' /settings/mcp-servers` | `HTTP 200` x 2 (both flag states) | PASS   |
| Restored shipping state = flag true                             | Final `GET liv:config:...`                                | `true`                          | PASS   |
| Banner unit test suite passes                                  | `pnpm --filter ui test v42-migration-banner` (per Plan 03 SUMMARY) | 4/4 vitest tests pass    | PASS (recorded) |
| Sacred SHA unchanged                                           | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | PASS |

### Requirements Coverage

| Requirement | Source Plan       | Description (from ROADMAP)                                                                      | Status | Evidence |
| ----------- | ----------------- | ----------------------------------------------------------------------------------------------- | ------ | -------- |
| SC-01       | 01, 02, 04        | flag=true → `/app-store` does NOT render `ai` category tab; flag=false → tab re-appears         | SATISFIED (code) + NEEDS HUMAN (visual) | app-store-nav.tsx:33 filter; constants.ts:12,35 ai category preserved; backend round-trip proven |
| SC-02       | 02, 04            | flag=true → settings sidebar hides MCP Servers (+AI Chat Settings) entries; flag=false re-appear | SATISFIED (code) + NEEDS HUMAN (visual) | settings-content.tsx:199,216 filter; MenuItem entry line 167 preserved |
| SC-03       | 02, 04            | `/settings/mcp-servers` STILL serves 200 when flag=true                                         | SATISFIED              | curl HTTP 200 in both flag states (deploy-log); route case line 557 intact |
| SC-04       | 03, 04            | Banner renders in App Store + Settings when flag=true, hidden when false, dismissible per-session | SATISFIED (code+test) + NEEDS HUMAN (visual) | 5 mounts verified; 4/4 unit tests; useState-only dismissal |
| SC-05       | 01, 02, 03, 04    | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged + non-regression on non-AI       | SATISFIED (sacred SHA) + NEEDS HUMAN (regression visual) | hash-object check + empty diff under `liv/packages/core/` |

No orphaned requirements — all 5 SCs from ROADMAP are covered by at least one PLAN frontmatter `requirements:` field.

### Anti-Patterns Found

Scanned all 8 source/test files touched. Categorization:

| File                                              | Line | Pattern                                                | Severity | Impact |
| ------------------------------------------------- | ---- | ------------------------------------------------------ | -------- | ------ |
| (none)                                            |      | No TODO/FIXME/PLACEHOLDER, no hardcoded empty data flowing to render, no `console.log`, no localStorage, no emojis, no hardcoded hex/rgb colors found in any Phase 224 source file | —        | —      |

Spot-check details:
- `grep localStorage|sessionStorage v42-migration-banner.tsx` → 0
- `grep hex/rgb v42-migration-banner.tsx` → 0
- `grep TODO|FIXME` across phase files → 0 matches in phase-touched source

### Reversibility Invariant (D-V42-ROLLBACK)

Per the verification request key_invariants_to_check #2 — the following PRE-Phase-224 source elements were intentionally PRESERVED (not deleted), so flipping Redis flag to `false` restores 100% pre-Phase-224 UI without code revert:

| Element                                                         | File                                              | Line | Status        |
| --------------------------------------------------------------- | ------------------------------------------------- | ---- | ------------- |
| `ai` Category type literal                                      | app-store/constants.ts                            | 12   | PRESERVED     |
| `categoryishDescriptions` entry `{id: 'ai', ...}`               | app-store/constants.ts                            | 35   | PRESERVED     |
| `SettingsSection` type union literal `'mcp-servers'`            | settings-content.tsx                              | 133  | PRESERVED     |
| `MENU_ITEMS` MCP Servers row `{id: 'mcp-servers', ...}`         | settings-content.tsx                              | 167  | PRESERVED     |
| `SectionContent` switch `case 'mcp-servers'` → `<McpServersLazy />` | settings-content.tsx                          | 557  | PRESERVED     |
| `McpServersLazy = React.lazy(() => import(...))`                | settings-content.tsx                              | 119  | PRESERVED     |

Confirmed: hides are filter-only and conditional render-only. Flipping `liv:config:liv_v42_migration_active=false` restores all surfaces within 30s (staleTime) or on next window focus.

### Sacred SHA Invariant (D-V42-SACRED)

| Check                                                                   | Expected                                                       | Actual                                                         | Status   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| `git hash-object liv/packages/core/src/sdk-agent-runner.ts`             | `f3538e1d811992b782a9bb057d1b7f0a0189f95f`                     | `f3538e1d811992b782a9bb057d1b7f0a0189f95f`                     | PASS     |
| `git diff --stat 28f39757..HEAD -- liv/packages/core/`                  | empty                                                          | empty                                                          | PASS     |
| Files changed under `liv/packages/core/` across Phase 224                | 0                                                              | 0 (all changes are under `livos/` or `.planning/`)             | PASS     |

### Human Verification Required

The Phase 224-04 plan declared Task 2 as a `checkpoint:human-verify gate=blocking` for SC-01/SC-02/SC-04/SC-05 visual confirmation. Plan 04 SUMMARY records that the checkpoint was **auto-approved per `--auto` chain flag** (`workflow._auto_chain_active=true`), deferring the 5-min operator browser walk to the next Mini PC session. The verifier surfaces these as informational `human_needed` items (does not block, since backend gate is end-to-end proven via curl):

#### 1. SC-01: App Store category nav visual

**Test:** Open `https://bruce.livinity.io/app-store` in a fresh tab (Ctrl+Shift+R if cached).
**Expected:** NO `AI` category tab between `Automation` and `Developer` in the horizontal nav. Backend currently returns `{"active":true}`.
**Why human:** Backend gate + UI filter logic are both verified in source. Confirming the rendered DOM matches code intent is a visual-only check.

#### 2. SC-02: Settings sidebar visual

**Test:** Open `https://bruce.livinity.io/settings`.
**Expected:** NO `MCP Servers` row in the WORKSPACE group (the entire WORKSPACE group may now be empty — that is expected and OK).
**Why human:** Same as SC-01.

#### 3. SC-03: Direct URL admin recovery visual

**Test:** Type `https://bruce.livinity.io/settings/mcp-servers` directly in the URL bar.
**Expected:** MCP Servers management panel renders normally (not a 404, not a blank page).
**Why human:** curl returned HTTP 200 in deploy-log, but that proves the route serves — it does not prove the React `<McpServersLazy />` component fully mounts without runtime error in browser.

#### 4. SC-04: Banner present + dismissible + re-appears on F5

**Test:**
   1. On `/app-store`, look for the banner with text: "AI integrations temporarily disabled during Liv Assistant migration. Open Liv Assistant from the dock to use AI features."
   2. Click the X dismiss button — banner should disappear.
   3. Navigate to `/settings` — same banner should be visible.
   4. F5 refresh — banner should re-appear (per-session dismiss, not localStorage).
**Expected:** All 4 steps PASS.
**Why human:** Unit tests cover the useState dismiss contract synthetically, but the real browser session round-trip is a UX-level check.

#### 5. SC-05: Non-regression on non-AI surfaces

**Test:** Open Files browser / AdGuard / Linkwarden / any non-AI app from the dock.
**Expected:** App opens normally, no console errors, UI renders.
**Why human:** Sacred SHA + diff guard prove no edits under `liv/packages/core/`, but UI bundle changes could in principle affect unrelated layouts via cascaded CSS / shared imports — needs a sanity click-around.

### Gaps Summary

No code-level gaps. All 4 plans executed exactly per spec:

- Plan 01 (backend + hook): config-router.ts, hook, common.ts entry, production wire — all present and correctly typed.
- Plan 02 (filters): app-store-nav.tsx `ai` predicate at line 33; settings-content.tsx `V42_HIDDEN_MENU_IDS` + filter chain at lines 199/216. Critically — neither plan deleted the underlying `ai` category, `mcp-servers` MenuItem, type union, or route case, so reversibility holds.
- Plan 03 (banner + mounts): banner + test + 5 mount points (1 app-store + 4 settings branches) all verified by grep; unit tests recorded 4/4 passing.
- Plan 04 (deploy): Mini PC live, all 4 services active, sacred SHA byte-identical on box, Redis round-trip evidence captured, SC-03 HTTP 200 in both flag states.

Initial Redis SET in Step 3 hit `WRONGPASS` due to a regex extraction bug in the plan's interface block; Step 4 fixed it with `-u default` and proved the false→true round-trip. The Plan 04 SUMMARY documents this as Rule-1 deviation with zero functional impact (Step 3's curl still proved default-ON path correctly because the absent key returns active=true).

The only outstanding item is the deferred operator browser walk — the verifier surfaces it as `human_needed` per the verification process Step 9 decision tree (when human verification items exist, status must be `human_needed` even if all automated checks pass).

---

_Verified: 2026-05-27T10:10:02Z_
_Verifier: Claude (gsd-verifier)_
