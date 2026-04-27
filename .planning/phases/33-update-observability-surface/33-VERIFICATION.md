---
phase: 33-update-observability-surface
verified: 2026-04-27T12:00:00Z
status: passed
human_verification_resolved: 2026-04-27 (live Mini PC deploy 1d44d610 + browser approval)
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open Settings > Software Update in the browser after the next Mini PC deploy has run"
    expected: "Past Deploys table shows at least one row; clicking a row opens the log viewer modal with monospace log content; 'Download full log' button triggers a browser file download; sidebar badge dot appears on the Software Update menu row when a new GitHub version is available (visible in both light and dark themes); badge disappears when the user opens the Software Update page"
    why_human: "Live deploy on Mini PC was explicitly deferred by user (steps D-H of Plan 33-02 Task 3). The trap block is patched and bash-n-clean on the production host, but no update.sh run has fired the trap post-patch. UI component rendering, badge visibility, and download behavior cannot be verified programmatically without a browser + live livinityd connection."
---

# Phase 33: Update Observability Surface — Verification Report

**Phase Goal:** A user diagnoses any update outcome (success / fail / rolled-back) entirely from Settings > Software Update without ever opening SSH — structured per-deploy logs feed a Past Deploys table with click-through full-log viewer; sidebar Software Update row shows a badge when an update is available.

**Verified:** 2026-04-27T12:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Every `update.sh` invocation writes a structured log file at `/opt/livos/data/update-history/update-<ISO-ts>-<7sha>.log` with per-step lines, exit code, and duration | VERIFIED (with deferral) | `phase33-update-sh-logging-patch.sh` applied to Mini PC with both `PATCH-OK (LOG_TEE)` + `PATCH-OK (SHA_CAPTURE)` markers. `bash -n` clean. 21/21 bash assertions in log-format.sh confirm all 4 trap scenarios (success, failed, precheck-fail-skip, no-clone-yet). Live-trap-firing deferred to organic first deploy per user opt — acceptable because trap test coverage is comprehensive. |
| SC-2 | Settings > Software Update displays a "Past Deploys" table with SHA + timestamp + status + duration, sorted newest-first, last 50 entries, no SSH | VERIFIED | `PastDeploysTable` component exists at `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` (173 lines). Calls `trpcReact.system.listUpdateHistory.useQuery({limit: 50})`. Empty/loading/error states handled. Wired into `SoftwareUpdateSection` via h3 + `<PastDeploysTable />` at settings-content.tsx line 1842-1843. |
| SC-3 | Clicking a Past Deploys row opens a log viewer modal showing last 500 lines + a "Download full log" button | VERIFIED | `UpdateLogViewerDialog` at `livos/packages/ui/src/components/update-log-viewer-dialog.tsx` (96 lines). Renders tail in `<pre>` with monospace. Download uses `trpcClient.system.readUpdateLog.query({filename, full: true})` → `new Blob([...], {type: 'text/plain'})` → anchor click. Row click triggers `setOpenLog(basenameFromLogPath(row.log_path))` in PastDeploysTable. |
| SC-4 | Settings sidebar "Software Update" row displays a badge when update is available; disappears on page open or install | VERIFIED (dot form) | `MenuItemBadge` at `livos/packages/ui/src/routes/settings/_components/menu-item-badge.tsx`. Renders a `bg-brand` dot (not a numeric count — ROADMAP SC says "e.g., '1'" but plan frontmatter and CONTEXT explicitly specify dot/badge either form; plan must_have says "brand-color dot badge"). Three-condition guard: itemId, state, activeSection. Injected in 3 sidebar render sites (desktop home, detail, mobile home). |
| SC-5 | `system.listUpdateHistory` and `system.readUpdateLog` ship with adminProcedure RBAC + filename validation (no `..` traversal); reads from `/opt/livos/data/update-history/` only | VERIFIED | Both routes use `adminProcedure` (confirmed in routes.ts lines 121, 163). 3-layer filename guard: basename equality + alnum-leading regex `/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(log|json)$/` + resolved-path containment against `HISTORY_DIR_RESOLVED`. R7 spy test asserts `fs.readFile` never called for any of 6 traversal vectors. httpOnlyPaths entries present for both routes. |

**Score: 5/5 truths verified**

---

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

*(None — all deferred items within this phase are forward-resolved by organic first-deploy, not pushed to future phases.)*

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/system/routes.ts` | listUpdateHistory + readUpdateLog handlers | VERIFIED | adminProcedure import added. `fsStat` for 50MB cap. FILENAME_RE guard. HISTORY_DIR_RESOLVED cross-platform containment. All present. |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | httpOnlyPaths entries for both routes | VERIFIED | Lines 41-43: `'system.listUpdateHistory'` and `'system.readUpdateLog'` present with Phase 33 comment block. Phase 30/31 existing entries (system.update, updateStatus, checkUpdate) still present — no regression. |
| `livos/packages/livinityd/source/modules/system/system.unit.test.ts` | 5+ traversal tests + happy path + httpOnlyPaths | VERIFIED | 20 occurrences of listUpdateHistory/readUpdateLog. Describe blocks for listUpdateHistory (L1-L5), filename validation (6 traversal vectors via test.each + R7 spy), happy path (H1-H4), httpOnlyPaths (HOP1), plus SC1+SC2 size-cap tests. Total 27 tests passing. |
| `.planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh` | Idempotent SSH-applyable patch, bash -n clean, phase33_finalize trap | VERIFIED | File exists. MARKER_LOG_TEE + MARKER_SHA_CAPTURE present. `trap phase33_finalize EXIT` present. Backup line present. CR-01+WR-02 fix applied: `tr -d '"\\'  | tr -d '\n' | LC_ALL=C cut -c1-200`. Applied to Mini PC; both PATCH-OK markers fired; idempotency confirmed (ALREADY-PATCHED on re-run). |
| `.planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh` | 4 scenarios, 21 assertions, bash -n clean | VERIFIED | File exists. All 4 scenario functions present. WR-03 fix applied: unsafe-path guard at top of run_scenario(). 21/21 assertions pass. |
| `.planning/phases/33-update-observability-surface/artifacts/tests/phase33-trap-block.sh.tmpl` | Standalone sourceable trap template | VERIFIED | File exists. Same CR-01+WR-02 fix at line 122 (`tr -d '"\\'  | tr -d '\n' | LC_ALL=C cut -c1-200`). `trap phase33_finalize EXIT` present. |
| `livos/packages/ui/src/components/update-log-viewer-dialog.tsx` | Modal with tail-500, Download button, trpcClient | VERIFIED | 96 lines. `trpcReact.system.readUpdateLog.useQuery` for tail. `trpcClient.system.readUpdateLog.query({full:true})` for download. `new Blob`. `Download full log` string present. |
| `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` | Table with basenameFromLogPath, 4 columns, loading/error/empty | VERIFIED | 173 lines. `trpcReact.system.listUpdateHistory.useQuery`. `basenameFromLogPath`. STATUS_VARIANT. UpdateLogViewerDialog used. 4 columns: SHA, When, Status, Duration. |
| `livos/packages/ui/src/routes/settings/_components/menu-item-badge.tsx` | 3-condition guard, bg-brand dot, aria-label | VERIFIED | 49 lines. `useSoftwareUpdate` imported. 3 null guards in correct order. `bg-brand` class present. `aria-label='Update available'` present. |
| `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` | 2 imports + 3 MenuItemBadge sites + PastDeploysTable | VERIFIED | Imports at lines 88-89 (moved to top import block per WR-01 fix — above React.lazy() declarations). `PastDeploysTable` count >= 2. `MenuItemBadge` count = 4 (import + 3 injection sites). `Past Deploys` h3 present at line 1842. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `system.readUpdateLog input.filename` | `fs.readFile call` | 3-layer guard (basename + regex + resolved-path) | WIRED | Confirmed in routes.ts: Layer 1 (path.basename), Layer 2 (FILENAME_RE test), Layer 3 (HISTORY_DIR_RESOLVED startsWith). R7 spy asserts fs.readFile never called for any traversal vector. |
| `trpc splitLink router` | HTTP transport | httpOnlyPaths array contains both route names | WIRED | Both `'system.listUpdateHistory'` and `'system.readUpdateLog'` confirmed in common.ts lines 41-43. |
| `PastDeploysTable row click` | `UpdateLogViewerDialog open + filename` | `row.log_path → split('/').pop() → setOpenLog` | WIRED | `basenameFromLogPath(row.log_path)` at line 72-77 of past-deploys-table.tsx. `setOpenLog(logName)` triggers `UpdateLogViewerDialog` render with `filename={openLog}`. |
| `MenuItemBadge` | `useSoftwareUpdate().state` | render only when state === 'update-available' AND activeSection !== 'software-update' | WIRED | Three-condition guard verified in menu-item-badge.tsx lines 40-42. Injected in 3 render sites in settings-content.tsx. |
| `UpdateLogViewerDialog Download button` | `trpcClient.system.readUpdateLog.query({filename, full: true})` | vanilla trpc client → Blob → anchor.click() | WIRED | Lines 45-56 of update-log-viewer-dialog.tsx. trpcClient (vanilla) used for download; blob + anchor construction present. |
| `phase33_finalize trap` | `/opt/livos/data/update-history/<ts>-(success|failed).log + .json` | EXIT trap fires, renames .pending log, writes JSON | WIRED | Trap block applied to Mini PC update.sh. log-format.sh tests confirm rename logic, JSON write, precheck-fail-skip, and no-clone-yet paths all work correctly. |
| `phase33-update-sh-logging-patch.sh` | `/opt/livos/update.sh` | awk-splice with MARKER_LOG_TEE + MARKER_SHA_CAPTURE idempotency guards | WIRED | PATCH-OK (LOG_TEE) + PATCH-OK (SHA_CAPTURE) confirmed on Mini PC first-apply. Idempotency confirmed on re-apply. bash -n clean. |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `PastDeploysTable` | `historyQ.data` | `trpcReact.system.listUpdateHistory.useQuery({limit:50})` | Yes — reads real JSON files from HISTORY_DIR via fs.readdir + fs.readFile in routes.ts | FLOWING (conditionally) — will be empty until first deploy fires the trap post-patch |
| `UpdateLogViewerDialog` | `tailQ.data.content` | `trpcReact.system.readUpdateLog.useQuery({filename, full:false})` | Yes — reads real .log file content via fsStat + fs.readFile in routes.ts | FLOWING (conditionally) — requires a row with log_path in the Past Deploys table |
| `MenuItemBadge` | `state` | `useSoftwareUpdate().state` derived from GitHub API check | Yes — existing Phase 30 hook; production use already confirmed | FLOWING |

**Note on conditionality:** PastDeploysTable and UpdateLogViewerDialog will show real data only after the first update.sh run on the patched Mini PC. This is an expected bootstrapping condition documented in the Phase 33 plan, not a wiring gap. The routes return `[]` on ENOENT (verified by test L2), which is handled gracefully by the "No deploys yet." empty state.

---

## Behavioral Spot-Checks

Step 7b SKIPPED — cannot test UI components or SSH-connected tRPC routes without a running server + browser. Backend routes require a running livinityd instance; UI requires a browser. The vitest smoke tests serve as the automated proxy.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OBS-01 | 33-02 | update.sh writes structured log + JSON on every run | SATISFIED | Patch applied to Mini PC. 21/21 bash unit test assertions pass across 4 trap scenarios. Live deploy deferred per user — forward-resolved organically. |
| OBS-02 | 33-01, 33-03 | Past Deploys table in Settings > Software Update | SATISFIED | Backend: `system.listUpdateHistory` adminProcedure in routes.ts. Frontend: `PastDeploysTable` in settings-content.tsx SoftwareUpdateSection. |
| OBS-03 | 33-01, 33-03 | Log viewer modal + Download button + filename traversal guard | SATISFIED | Backend: `system.readUpdateLog` with 3-layer guard + 50MB cap. Frontend: `UpdateLogViewerDialog` with monospace pre + Blob download. |
| UX-04 | 33-03 | Settings sidebar badge when update available | SATISFIED | `MenuItemBadge` with 3-condition guard wired in 3 sidebar render sites (desktop home, detail, mobile home) in settings-content.tsx. |

**Requirement traceability:** All 4 requirements mapped in REQUIREMENTS.md under Phase 33. No orphaned requirements.

---

## Cross-Phase Contract Verification

| Contract | Status | Evidence |
|----------|--------|----------|
| Phase 32 schema reuse (success.json mirrors rollback.json: timestamp, status, from_sha, to_sha, duration_ms, log_path) | HONORED | routes.ts `listUpdateHistory` returns all 4 JSON types via a single reader. Trap's `cat > "$json_path" <<JSON` block mirrors livos-rollback.sh byte-for-byte per 33-02-SUMMARY. |
| 3-layer filename guard (basename + regex + resolved-path) with all 6 traversal vectors throwing BAD_REQUEST + spy assertion | HONORED | Layer 1: `path.basename(input.filename) !== input.filename`. Layer 2: `FILENAME_RE.test`. Layer 3: `resolved.startsWith(HISTORY_DIR_RESOLVED + path.sep)`. R7 `vi.spyOn(fsPromises, 'readFile')` asserts never-called for all 6 vectors. |
| httpOnlyPaths registration for both routes | HONORED | Both entries confirmed in common.ts with Phase 33 comment block. Existing Phase 30 entries (system.update, updateStatus, checkUpdate) unchanged — no regression. |
| adminProcedure RBAC on both routes | HONORED | Both `listUpdateHistory` and `readUpdateLog` use `adminProcedure` import from trpc.js. |
| 50MB size cap on readUpdateLog (WR-04 fix) | HONORED | `fsStat(resolved)` before readFile. Throws `PAYLOAD_TOO_LARGE` if `stat.size > 50 * 1024 * 1024`. SC1 + SC2 vitest tests cover boundary. |

---

## Patch-Script Pattern Inheritance (Phase 31/32 Architecture)

| Pattern | Status | Evidence |
|---------|--------|----------|
| Single idempotent patch script | HONORED | One file: `phase33-update-sh-logging-patch.sh` |
| grep -qF marker guards | HONORED | MARKER_LOG_TEE + MARKER_SHA_CAPTURE constants; per-patch `if grep -qF "$MARKER" ...` guards |
| awk-splice (not sed -i) | HONORED | `awk -v line=... -v patchfile=... ... "$UPDATE_SH" > "$UPDATE_SH.new" && mv ...` |
| Backup + bash-n + restore safety net | HONORED | `cp "$UPDATE_SH" "$UPDATE_SH.pre-phase33"` (idempotent: skip if exists). `bash -n "$UPDATE_SH" || (cp .pre-phase33 backup; restore; exit 1)` |
| Mini PC SSH-apply verified | HONORED | Orchestrator applied via `sudo bash -s`. Both PATCH-OK markers fired. Idempotency confirmed on re-run (ALREADY-PATCHED). bash -n exit 0. |
| Backup chain integrity | HONORED | pre-phase32 (13737 bytes) + pre-phase33 (17841 bytes) coexist on Mini PC. |

---

## Code Review Status

| Finding | Severity | Status | Fix Commit |
|---------|----------|--------|------------|
| CR-01: JSON injection via backslash in reason_field | Critical | FIXED | b974b98f |
| WR-01: Static imports after React.lazy() declarations | Warning | FIXED | 67de2f4d |
| WR-02: Mid-UTF-8 cut truncation in reason_field | Warning | FIXED | b974b98f (combined with CR-01) |
| WR-03: eval on sandbox paths in log-format.sh | Warning | FIXED | 5df1db53 |
| WR-04: Missing 50MB size cap in readUpdateLog | Warning | FIXED | 19e200bb |
| IN-01: @ts-nocheck blanket suppression in system.unit.test.ts | Info | DEFERRED | Pre-existing debt; out of scope for Phase 33 per --auto scope |
| IN-02: adminProcedure role-rejection tests missing | Info | DEFERRED | Roles work in prod; test coverage gap is pre-existing pattern |
| IN-03: basenameFromLogPath uses split('/') only | Info | DEFERRED | Production server is Linux; acceptable for current scope |

**5/5 critical+warning findings fixed. 3 info findings deferred per --auto scope. All 27 vitest tests (backend) + 21 bash assertions + 3 UI smoke tests pass post-fix.**

---

## Server4 Hard-Rule Status

One residual Server4 reference exists in the patch script at line 65:

```
# Anchor on `set -euo pipefail` (line ~8 of update.sh; both Mini PC and Server4)
```

This is a **comment only** — an inline annotation describing the expected anchor line number in update.sh. It does not instruct the script to SSH to Server4, does not apply the patch to Server4, and has no operational effect. The patch is applied only when the operator explicitly runs it against a host. The actual apply step (Task 3) was run exclusively on Mini PC (`bruce@10.69.31.68`). This is a documentation artifact, not a violation of the Server4 hard rule.

**Server4 hard-rule status: HONORED** — no operational changes were applied to Server4 in Phase 33.

---

## Live Deploy Deferral Analysis

**Decision recorded in 33-02-SUMMARY.md:** User explicitly approved skipping live deploy steps D-H ("Approved — canlı deploy yapma yok, devam edelim") after steps A-C (apply + idempotency + syntax) passed.

**Acceptability assessment:**

Arguments for acceptability:
1. bash unit test coverage is comprehensive: 4 distinct exit paths × ~5 assertions each = 21 assertions covering all material trap behaviors (success, failed, precheck-fail-skip, no-clone-yet).
2. The patch is applied, idempotent, and bash-n-clean on the production host — it will fire automatically on the next organic deploy.
3. The deferred steps D-H (log file landing, JSON shape, [PHASE33-SUMMARY] line, livinityd health) are all covered by the 21 bash assertions in log-format.sh, which test the same trap logic that runs on the Mini PC.
4. Forward-resolved: no follow-up task required; the next user-initiated update.sh run via the UI closes the loop.

Arguments against:
1. End-to-end smoke (trap fires → JSON written → listUpdateHistory returns it → PastDeploysTable renders a row) has not been verified in the actual production environment.
2. A subtle environment difference (e.g., bash version, date format, path quoting) on the Mini PC could cause the trap to behave differently than in the test sandbox.

**Verdict:** The deferral is acceptable given the comprehensive bash test coverage and that the trap is already live on the production host. The outstanding verification requirement is noted as the sole human verification item.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `system.unit.test.ts` | 1-4 | `// @ts-nocheck` blanket suppression | Info | Pre-existing debt; Phase 33 tests inherit it. No runtime impact. |
| `past-deploys-table.tsx` | 74 | `logPath.split('/')` POSIX-only | Info | Would mis-derive basename on Windows-produced log_path. Backend 3-layer guard catches it anyway with BAD_REQUEST. No production risk. |

No blockers. No stubs. All components are real implementations.

---

## Human Verification Required

### 1. End-to-End Past Deploys Flow (post first organic deploy)

**Test:** After the next `sudo bash /opt/livos/update.sh` run on Mini PC (whether via the UI Install Update button or SSH), navigate to Settings > Software Update in the browser.

**Expected:**
- Past Deploys table shows at least one row (the most recent deploy)
- Row contains SHA (7-char), relative timestamp, status badge (success/failed), duration
- Clicking the row opens UpdateLogViewerDialog with monospace log content
- Log content ends with a `[PHASE33-SUMMARY] status=success exit_code=0 duration_seconds=NN` line
- "Download full log" button triggers a browser file download with `.log` extension
- "Showing last 500 of N lines" banner appears if the log exceeded 500 lines

**Why human:** Live trap-firing was deferred by user decision. The trap is patched and tested, but no actual update.sh run has occurred post-patch to verify the full data path from trap → JSON write → listUpdateHistory → browser table render.

### 2. Sidebar Badge Visibility (both themes)

**Test:** While logged in as admin, navigate to a non-Software-Update settings page. Trigger an "update available" state (or wait for the checkLatest polling to detect one). Check the Settings sidebar.

**Expected:**
- A small brand-color dot appears on the "Software Update" sidebar row
- Dot is visible in both light and dark themes (bg-brand auto-flips via CSS variable)
- Clicking "Software Update" causes the dot to disappear immediately (activeSection === 'software-update')
- After a successful install (state becomes 'at-latest'), the dot stays gone on next page load

**Why human:** Badge visibility requires a running browser + useSoftwareUpdate() returning 'update-available'. Cannot verify programmatically without a full stack.

---

## Gaps Summary

No material gaps found. All 5 roadmap success criteria are satisfied at the code level. The 2 human verification items cover end-to-end browser behavior that requires a live deploy to trigger — they are not gaps in the implementation but environmental verification steps that are forward-resolved by the next organic update.sh execution.

---

_Verified: 2026-04-27T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
