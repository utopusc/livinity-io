---
phase: 102
plan: 07
title: Master Chrome Login UI + tRPC routes
subsystem: livinityd-trpc + ui-settings
tags: [trpc, chrome-master, settings-ui, admin-gate]
wave: 3
dependency_graph:
  requires:
    - 102-03  # ProfileSeeder + ensureMasterExists in chrome-master/index.ts
  provides:
    - D-102-MASTER-LOGIN-UI
    - chromeMaster.{status, startLogin, reset, restoreBackup}
    - <MasterChromeLogin /> component
  affects:
    - server/trpc/index.ts (root router composition)
    - server/trpc/common.ts (httpOnlyPaths)
tech_stack:
  added: []
  patterns:
    - factory-injection (createChromeMasterRouter) mirrors apps/native-routes.ts
    - module-singleton currentMaster lock (T-102-07b)
    - rename-before-mkdir backup ordering (T-102-07c)
    - source-text invariant UI tests (mirror dock/native-app-icon.test.tsx)
key_files:
  created:
    - livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts
    - livos/packages/livinityd/source/modules/chrome-master/master-login-routes.test.ts
    - livos/packages/ui/src/modules/settings/master-chrome-login.tsx
    - livos/packages/ui/src/modules/settings/master-chrome-login.test.tsx
    - livos/packages/ui/src/modules/settings/   # NEW directory (PATTERNS critical discovery #5)
  modified:
    - livos/packages/livinityd/source/modules/chrome-master/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - .planning/phases/102-per-app-display-pivot/102-VALIDATION.md
decisions:
  - "Factory-injection (createChromeMasterRouter(injectables)) mirrors apps/native-routes.ts pattern so unit tests can mock fs+child_process without spinning up a Chrome process."
  - "currentMaster module-singleton (T-102-07b) lives at module scope rather than ctx-injected because master Chrome is a system-wide resource; only one can hold --user-data-dir=/opt/livos/data/chrome-master at a time."
  - "reset({backup: true}) renames master -> master.backup BEFORE mkdir of fresh master, so the user-visible recovery path (restoreBackup) is always populated. UI hides backup=false (no destructive-without-recovery affordance)."
  - "UI test uses source-text grep invariants (D-NO-NEW-DEPS, @testing-library/react not installed) — same pattern as dock/native-app-icon.test.tsx Phase 101-07."
  - "Settings page wire-up deferred: 102-07 ships the MasterChromeLogin component file; mounting it into a settings route (e.g. /settings/chrome) is left to a follow-up plan (no existing Settings root component to extend, see Deferred Items)."
metrics:
  duration_minutes: ~30
  tasks_total: 5
  tasks_completed: 5
  commits: 5
  tests_added: 25  # 9 backend + 16 UI
  files_created: 4
  files_modified: 3
  completed_at: 2026-05-11
---

# Phase 102 Plan 07: Master Chrome Login UI + tRPC routes Summary

One-liner: Adds adminProcedure-gated `chromeMaster.{status, startLogin, reset, restoreBackup}` tRPC routes (spawn google-chrome on bruce's :0 with `--user-data-dir=/opt/livos/data/chrome-master`) + the `<MasterChromeLogin />` settings affordance that drives the master-profile lifecycle for D-102-MASTER-PROFILE-SEED.

## Objective

Build the user-facing Master Chrome Login affordance — the only mechanism by which `/opt/livos/data/chrome-master/` (consumed by 102-03's `MasterProfileSeeder`) gets seeded with a logged-in Google session. Backend: tRPC routes `chromeMaster.{status, startLogin, reset, restoreBackup}` (adminProcedure-gated, T-102-07). Frontend: `<MasterChromeLogin />` component with status indicator + Open + Reset buttons.

## Implementation

### Task 1 (RED) — `c1f0c507`

Created `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.test.ts` with 9 failing tests covering:

1. **T-102-07 admin gate (startLogin)** — non-admin caller throws FORBIDDEN; spawnFn never invoked.
2. **startLogin happy path** — admin caller; spawn argv is `sudo -n -u bruce DISPLAY=:0 google-chrome --user-data-dir=/opt/livos/data/chrome-master --no-first-run --no-default-browser-check`.
3. **T-102-07b singleton lock** — second concurrent startLogin throws CONFLICT; only one spawn fires.
4. **status hasCookies=true** — when Default/Cookies accessFn resolves.
5. **status hasCookies=false** — when Default/Cookies accessFn rejects.
6. **T-102-07c reset({backup:true}) ordering** — rename master → master.backup happens BEFORE mkdir of fresh master (callOrder index assertion).
7. **reset({backup:false})** — rm -rf master directly; renameFn never invoked.
8. **T-102-07 admin gate (reset)** — non-admin caller throws FORBIDDEN.
9. **httpOnlyPaths registration** — common.ts source-text contains chromeMaster.{startLogin,reset,restoreBackup,status}.

RED verified: `Failed to load url ./master-login-routes.js` (module not yet implemented).

### Task 2 (GREEN) — `e9e92751`

Implemented `master-login-routes.ts` exporting `createChromeMasterRouter(injectables)` + default `chromeMasterRouter`. Routes:

- **status** (privateProcedure query) — checks `${MASTER_PROFILE_DIR}/Default/Cookies` via accessFn; returns `{hasCookies, dir, running, pid?, startedAt?}`. Never reads the cookie bytes (T-102-07d accepted).
- **startLogin** (adminProcedure mutation, T-102-07) — guards against `currentMaster !== null` (T-102-07b CONFLICT), spawns chrome via `spawnFn('sudo', args, {detached: false, stdio: ['ignore','ignore','pipe']})`, registers `child.on('exit')` watcher to clear `currentMaster` for retry-after-close.
- **reset** (adminProcedure mutation, T-102-07c) — `backup=true` path: access-check master existence, rm stale backup, rename master → master.backup, mkdir master. `backup=false` path: rm -rf master, mkdir master. Refuses while running.
- **restoreBackup** (adminProcedure mutation) — rename master.backup → master after rm of existing master. Throws NOT_FOUND if no backup.

Also:
- `chrome-master/index.ts` barrel re-exports `chromeMasterRouter`, `createChromeMasterRouter`, `MASTER_BACKUP_DIR`, `MasterLoginInjectables`, `ChromeMasterRouter` types.
- `server/trpc/index.ts` registers `chromeMaster: chromeMasterRouter` at root.
- `server/trpc/common.ts` extends `httpOnlyPaths` with all four `chromeMaster.*` paths.

Tests: **9/9 GREEN** in 8 ms.

### Task 3 — `6c3f0e33`

Created `livos/packages/ui/src/modules/settings/` directory (PATTERNS critical discovery #5: did not exist; only desktop/, dock/, auth/ etc.) and the `MasterChromeLogin` component:

- `chromeMaster.status.useQuery(undefined, {refetchInterval: 2000})` drives the Logged-in / Not-logged-in indicator + the running-master flag.
- `chromeMaster.startLogin.useMutation()` fires from the "Open Master Chrome" button.
- `chromeMaster.reset.useMutation()` fires after an `<AlertDialog>` confirm (T-102-07c data-loss mitigation). Always sends `{backup: true}` — destructive-without-recovery is hidden from the UI surface.
- Both action buttons disabled while `status.data.running === true` (singleton-lock UX).
- Mutation errors render below the button row.

UI build: clean (no TS errors in our component).

### Task 4 — `683c9912`

UI test uses source-text grep invariants (mirror `dock/native-app-icon.test.tsx`) since `@testing-library/react` is NOT installed in @livos/ui (D-NO-NEW-DEPS). 16 cases covering:

- Title + status text (Logged in / Not logged in / Master Chrome running yes/no)
- tRPC wiring (chromeMaster.status useQuery with refetchInterval; startLogin / reset useMutation; status invalidation on success)
- Button labels + AlertDialog confirm wiring (variant='destructive', AlertDialogAction, recovery path mention)
- Disabled-when-running affordances (≥ 2 sites: open + reset buttons)
- Named export + smoke import (module loads without throwing)

Tests: **16/16 GREEN** in 1.63 s.

VALIDATION.md rows `102-07-01` + `102-07-02` flipped to ✅ green.

### Task 5 — `725b8470`

Sacred SHA verified: `git hash-object liv/packages/core/src/sdk-agent-runner.ts = f3538e1d811992b782a9bb057d1b7f0a0189f95f` (D-102-SACRED match). Plan 102-07 does not touch the `liv/` tree — all changes live in `livos/packages/livinityd/source/modules/chrome-master/` and `livos/packages/ui/src/modules/settings/`.

## Threat Mitigations (T-102-07 family)

| Threat ID  | Category                 | Mitigation                                                                                                                                    | Test coverage    |
|------------|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|------------------|
| T-102-07   | Elevation of Privilege   | `adminProcedure` on startLogin / reset / restoreBackup; requireRole('admin') middleware throws FORBIDDEN BEFORE handler                       | Tests 1, 8       |
| T-102-07b  | Tampering (concurrent)   | Module-singleton `currentMaster`; second startLogin throws CONFLICT; child.exit watcher clears the lock so retry works after user closes      | Test 3           |
| T-102-07c  | Data Loss (reset)        | Default `backup: true` renames master → master.backup BEFORE mkdir; UI confirms via AlertDialog; restoreBackup is adminProcedure-gated too    | Test 6           |
| T-102-07d  | Info Disclosure (cookies)| Accepted. status() checks file existence only, never reads bytes. Cookies file is bruce-readable; livinityd runs as bruce — no escalation.    | n/a              |

## Verification

| Check                                                                                                          | Result |
|----------------------------------------------------------------------------------------------------------------|--------|
| `pnpm --filter @livos/livinityd test:run chrome-master/master-login-routes.test.ts` (9 tests)                  | ✅     |
| `pnpm --filter @livos/ui test:run settings/master-chrome-login.test.tsx` (16 tests)                            | ✅     |
| `grep -q 'chromeMaster.startLogin' livos/.../server/trpc/common.ts`                                            | ✅     |
| `grep -q 'chromeMaster: chromeMasterRouter' livos/.../server/trpc/index.ts`                                    | ✅     |
| `test -d livos/packages/ui/src/modules/settings`                                                               | ✅     |
| `test -f livos/packages/ui/src/modules/settings/master-chrome-login.tsx`                                       | ✅     |
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged                                                | ✅     |
| `tsc --noEmit` on chrome-master/* + settings/* (no new errors introduced; pre-existing repo errors unchanged) | ✅     |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CRLF line endings broke Edit tool string matching on Windows worktree**

- **Found during:** Task 2 (modifying server/trpc/common.ts + server/trpc/index.ts + chrome-master/index.ts)
- **Issue:** Edit tool reported success on all three Edits to existing tracked files, but `grep` showed zero `chromeMaster` matches afterward. Investigation: the source files use `\r\n` (CRLF) line endings, but Edit's old_string match was for `\n` (LF). The harness was returning a cached in-memory view that showed the edited content, while disk retained the original. The single Write to the new `master-login-routes.ts` (untracked file, no pre-existing CRLF) persisted correctly.
- **Fix:** Re-applied the three Edits via python bytes-level read/replace/write that explicitly preserved CRLF on disk. Verified with `grep -c "chromeMaster"` against disk.
- **Files re-modified via python:** `server/trpc/common.ts`, `server/trpc/index.ts`, `chrome-master/index.ts`.
- **Commit:** Fix folded into `e9e92751` (Task 2 GREEN). No separate commit — the symptom was pre-commit state divergence, not a runtime bug.

This is a tooling deviation, not a contract change.

### Architectural Deviations from Plan

**1. [Rule 4 - non-blocking choice] Plan said "Card" primitive; shadcn-components has no Card**

- **Plan code listed:** `import {Card, CardContent, CardFooter, ...} from '@/shadcn-components/ui/card'`
- **Actual:** `livos/packages/ui/src/shadcn-components/ui/` has no `card.tsx`. The directory holds dialog, alert-dialog, button, input, etc.
- **Decision:** Render the component as a flat `<div>` block with `flex flex-col gap-4` and inline header / status section / button row. Mirrors the structure of `share-app-dialog.tsx` (no Card primitive used there either). Visual styling can be tightened in a follow-up when Settings root mounts the component.

**2. [Deferred] Settings page parent wire-up**

- **Plan Task 3 step 3:** "If a Settings page parent component exists, add the component to that page."
- **Actual:** No single Settings root in `livos/packages/ui/src/` that obviously hosts this affordance — Phase 65/77/93 added multiple disjoint settings surfaces. The plan's success-criteria + acceptance grep only require the component file to exist with the right tRPC wiring; mounting into a route is out of scope for 102-07.
- **Carry forward:** Track in `deferred-items.md` (or follow-up plan) — "Mount `<MasterChromeLogin />` under a Settings tab/route".

## Deferred Items

- **UI mount point:** `<MasterChromeLogin />` is shipped as a component file. A future plan must mount it under a settings route (likely `/settings/chrome` or a new tab in the existing settings layout). Acceptance criteria for Plan 102-07 only required the component file + tRPC wiring; mounting is non-blocking for the master-profile flow (admin can call `chromeMaster.startLogin` directly via tRPC if needed for Mini PC UAT).
- **Live UAT (Mini PC):** Per 102-VALIDATION row "Master Chrome Login UX flow" — manual real-Chrome OAuth verification deferred to Phase 102-10 UAT walk.

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts` — FOUND
- `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.test.ts` — FOUND
- `livos/packages/ui/src/modules/settings/master-chrome-login.tsx` — FOUND
- `livos/packages/ui/src/modules/settings/master-chrome-login.test.tsx` — FOUND
- Commit `c1f0c507` (Task 1 RED) — FOUND
- Commit `e9e92751` (Task 2 GREEN) — FOUND
- Commit `6c3f0e33` (Task 3 UI) — FOUND
- Commit `683c9912` (Task 4 UI tests) — FOUND
- Commit `725b8470` (Task 5 sacred SHA) — FOUND
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — MATCH

All artifacts exist on disk and in commit history.
