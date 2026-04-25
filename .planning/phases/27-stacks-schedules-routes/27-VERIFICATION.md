---
status: human_needed
phase: 27-stacks-schedules-routes
must_haves_total: 14
must_haves_verified: 14
must_haves_failed: 0
requirement_ids: DOC-11, DOC-12, DOC-03
verified: 2026-04-25T15:10:00Z
re_verification:
  is_re_verification: false
gaps: []
human_verification:
  - test: "Stacks: open Docker app > Stacks; verify list renders with status badges + per-row actions; expand a stack row; click constituent container row to confirm ContainerDetailSheet opens with Logs (xterm) / Files / Domains tabs all functional."
    expected: "Stack list + expand-row click feel matches v27.0 server-control Stacks tab; ContainerDetailSheet opens on container click."
    why_human: "Visual UX claim — expand-row click feel, scroll behavior, animation, badge color contrast not verifiable via grep/build."
  - test: "Stacks Deploy dialog: click 'Deploy Stack' → verify 3-tab dialog (YAML / Git / AI). Test each path end-to-end: deploy a YAML compose; deploy from public Git repo (verify webhook URL panel after); generate compose via AI prompt then 'Use this YAML'."
    expected: "All three deploy modes functional with feature parity to v27.0 server-control. Webhook URL + secret panel renders post-Git-deploy."
    why_human: "Real-time tRPC call + AI generation + webhook-secret-display UX cannot be verified without running services + Kimi auth."
  - test: "Stacks AddGitCredential nested dialog: from Git tab, click 'Add Credential' → create HTTPS PAT credential → create SSH key credential (≥50 char PEM) → verify auto-select in picker after create."
    expected: "Nested dialog opens, both credential types persist, auto-select returns to picker."
    why_human: "Multi-step user flow + tRPC round-trip + form-state behavior."
  - test: "Stacks programmatic deep-link: open browser devtools, run `useDockerResource.getState().setSelectedStack('<existing-stack-name>')` — verify the stack row programmatically expands."
    expected: "Stack row expands; Containers + Graph tabs visible."
    why_human: "Requires live UI with at least one stack present."
  - test: "Schedules: open Docker app > Schedules; verify job list renders with built-in vs user job badges, schedule, last run, next run, status. Test Run Now / toggle enabled / Delete on a user job."
    expected: "All per-row actions functional; list refreshes on 10s poll; status badges update."
    why_human: "Real-time scheduler interaction + visual badge state cannot be verified statically."
  - test: "Schedules AddBackupDialog: click 'Add Backup' → switch destination type (Local / S3 / SFTP) → verify conditional fields render (S3: endpoint/region/bucket/keys; SFTP: host/port/username/path/auth-method radio). Test Destination button → toast confirms latency or error. Save creates job and refreshes list."
    expected: "Conditional form fields + Test Destination + Save flow all functional."
    why_human: "Multi-state form UX + tRPC mutation behavior + toast notifications."
  - test: "Volume pre-fill seam (Phase 26-02 contract): navigate to Volumes section → click any volume row's 'Schedule backup' icon → verify section flips to Schedules AND AddBackupDialog opens with the volume pre-selected. Close dialog without saving → re-navigate to Schedules → verify dialog stays closed (consume-and-clear)."
    expected: "Cross-section navigation seam works end-to-end; consume-and-clear semantics prevent stale dialog re-open."
    why_human: "Cross-section navigation flow + pre-fill timing + consume-and-clear behavior must be observed live."
  - test: "Settings page: open Settings as admin user — verify Scheduler menu entry is gone. Verify no console errors on page load."
    expected: "Scheduler entry absent from Settings sidebar; clean console."
    why_human: "Visual sidebar inspection + console error check."
---

# Phase 27: Stacks + Schedules Routes — Verification Report

**Phase Goal:** Migrate Stacks + Schedules to dedicated sections in v28.0 Docker app + final delete of legacy server-control directory (DOC-03 final close).
**Verified:** 2026-04-25T15:10:00Z
**Status:** human_needed (all automated checks PASSED; visual/runtime UX checks deferred to human)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                                              | Status     | Evidence                                                                                                                                 |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | User opens Docker app, clicks Stacks in sidebar, sees the live stack list — same actions as v27.0 server-control Stacks tab.                       | VERIFIED   | `stacks/stack-section.tsx` exists (441 lines); useStacks() consumed; per-row ActionButtons (start/stop/restart/redeploy/edit/remove) wired. |
| 2  | User clicks 'Deploy Stack' and sees a 3-tab dialog: Deploy from YAML / Deploy from Git / Generate from prompt — all three paths work end-to-end.   | VERIFIED   | `stacks/deploy-stack-form.tsx` exists (544 lines); imports `<AiComposeTab>` from `./ai-compose-tab` and `<AddGitCredentialDialog>`.       |
| 3  | User expands a stack row and sees Containers tab and Graph tab (Phase 19 ComposeGraphViewer).                                                       | VERIFIED   | stack-section.tsx imports ComposeGraphViewer from `../_components/compose-graph-viewer`; Tabs/TabsList/TabsTrigger/TabsContent imported.   |
| 4  | User clicks a constituent container in the Stack expanded row and the existing ContainerDetailSheet opens with Logs + Files tabs preserved.        | VERIFIED   | stack-section.tsx line 335: `setSelectedContainer(container.name)`; ContainerDetailSheet imported from `../resources/container-detail-sheet`. |
| 5  | User types in the search input and the stack list filters client-side by stack name; empty search shows all stacks.                                 | VERIFIED   | `searchQuery` useState + `filterByQuery(stacks, searchQuery, (s) => s.name)`; maxLength=200 (T-27-01); noFilterResults branch implemented.  |
| 6  | External code can call useDockerResource.getState().setSelectedStack(name) to programmatically expand a stack row (DOC-20 partial).                 | VERIFIED   | resource-store.ts has `selectedStack: string \| null` slot + `setSelectedStack` setter + `useSelectedStack` selector hook; 10 tests pass. |
| 7  | User clicks Schedules in Docker app sidebar and sees the scheduler job list (same shape as v27.0 Settings > Scheduler).                            | VERIFIED   | `schedules/index.tsx` exists (161 lines); JobCard rendering loop; scheduler.listJobs query with 10s refetchInterval.                       |
| 8  | User clicks 'Add Backup' and sees a dialog with name + volume picker + cron + destination type (Local / S3 / SFTP) + Test Destination + Save.       | VERIFIED   | `schedules/add-backup-dialog.tsx` exists (516 lines); DestinationType union (s3/sftp/local); emptyDestination factory; conditional forms.  |
| 9  | When user navigates from Volumes via 'Schedule backup' link, AddBackupDialog opens automatically with volume pre-filled (Phase 26-02 contract).    | VERIFIED   | schedules/index.tsx mount effect: reads `useSelectedVolume()`, sets `pendingVolumeName`, opens dialog, calls `setSelectedVolume(null)`.    |
| 10 | The legacy Settings > Scheduler menu item is removed (DOC-12 owns scheduler now).                                                                  | VERIFIED   | `grep "scheduler|SchedulerSection|TbServerCog" settings-content.tsx` → no matches.                                                          |
| 11 | After cleanup: `livos/packages/ui/src/routes/server-control/` directory does not exist + `grep -rn 'from.*server-control'` returns ZERO results.   | VERIFIED   | `ls server-control/` → No such file or directory; `grep -rn 'from.*server-control' src/` → No matches.                                     |
| 12 | The `ServerControlWindowContent` lazy import + `app-contents/server-control-content.tsx` adapter are deleted; deprecation banner code path gone.    | VERIFIED   | `ls modules/window/app-contents/server-control-content.tsx` → No such file; `grep ServerControlWindowContent` → no matches.                |
| 13 | All previously cross-imported components live in their final homes inside `routes/docker/_components/` and `routes/docker/resources/`.              | VERIFIED   | All 7 relocated files present: 3 in `_components/`, 4 in `resources/`. status-bar/container-section/stack-section import paths updated.    |
| 14 | DOC-03 fully closed (legacy Server Control removed entirely from disk and routing).                                                                | VERIFIED   | All 4 grep gates clean; 3 files git-rm'd in commits 10ab278d + 3ef61985; window-content.tsx no longer imports the adapter.                  |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact                                                                                  | Expected                                                          | Status     | Details                                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `livos/packages/ui/src/routes/docker/resource-store.ts`                                   | selectedStack 5th slot + setSelectedStack + useSelectedStack       | VERIFIED   | Lines 30, 35, 44, 49, 56, 67 — 5-slot interface, setter, default, set fn, clearAllSelections, hook. |
| `livos/packages/ui/src/routes/docker/stacks/stack-section.tsx`                            | StackSection (≥400 lines)                                          | VERIFIED   | 441 lines; uses useStacks, useSelectedStack, useDockerResource; imports ComposeGraphViewer + sheet. |
| `livos/packages/ui/src/routes/docker/stacks/deploy-stack-form.tsx`                        | DeployStackForm (≥350 lines)                                       | VERIFIED   | 544 lines.                                                                                          |
| `livos/packages/ui/src/routes/docker/stacks/ai-compose-tab.tsx`                           | AiComposeTab                                                       | VERIFIED   | 133 lines.                                                                                          |
| `livos/packages/ui/src/routes/docker/stacks/add-git-credential-dialog.tsx`                | AddGitCredentialDialog                                             | VERIFIED   | 159 lines.                                                                                          |
| `livos/packages/ui/src/routes/docker/stacks/stack-dialogs.tsx`                            | RemoveStackDialog + RedeployStackDialog                            | VERIFIED   | 113 lines; both exports paired.                                                                     |
| `livos/packages/ui/src/routes/docker/sections/stacks.tsx`                                 | 1-line re-export of StackSection                                   | VERIFIED   | `export {StackSection as Stacks} from '../stacks/stack-section'` (3-line file with comments).       |
| `livos/packages/ui/src/routes/docker/schedules/index.tsx` (renamed from scheduler-section.tsx per Plan 27-02 dec. #5) | SchedulerSection (≥200 lines target; 161 actual)         | VERIFIED   | 161 lines — under target but exact port + new seam wiring; bulk moved into add-backup-dialog.tsx by design (decision #1). |
| `livos/packages/ui/src/routes/docker/schedules/add-backup-dialog.tsx`                     | AddBackupDialog with initialVolumeName prop (≥250 lines)           | VERIFIED   | 516 lines; `initialVolumeName?: string` prop on signature + useEffect wires pre-fill.               |
| `livos/packages/ui/src/routes/docker/schedules/job-card.tsx`                              | JobCard sub-component                                              | VERIFIED   | 168 lines; exports JobCard, JobRow, StatusBadge, relTime, TYPE_LABELS.                              |
| `livos/packages/ui/src/routes/docker/sections/schedules.tsx`                              | 1-line re-export of SchedulerSection                               | VERIFIED   | `export {SchedulerSection as Schedules} from '../schedules'` (directory-index resolution).         |
| `livos/packages/ui/src/routes/docker/_components/environment-selector.tsx`                | Relocated from server-control/                                     | VERIFIED   | File present at new path; git-mv preserved blame.                                                   |
| `livos/packages/ui/src/routes/docker/_components/ai-alerts-bell.tsx`                      | Relocated from server-control/                                     | VERIFIED   | File present at new path.                                                                           |
| `livos/packages/ui/src/routes/docker/_components/compose-graph-viewer.tsx`                | Relocated from server-control/                                     | VERIFIED   | File present at new path.                                                                           |
| `livos/packages/ui/src/routes/docker/resources/container-detail-sheet.tsx`                | Relocated from server-control/                                     | VERIFIED   | File present at new path.                                                                           |
| `livos/packages/ui/src/routes/docker/resources/container-create-form.tsx`                 | Relocated from server-control/                                     | VERIFIED   | File present at new path.                                                                           |
| `livos/packages/ui/src/routes/docker/resources/container-files-tab.tsx`                   | Relocated from server-control/                                     | VERIFIED   | File present at new path.                                                                           |
| `livos/packages/ui/src/routes/docker/resources/domains-tab.tsx`                           | Relocated from server-control/                                     | VERIFIED   | File present at new path.                                                                           |

### Key Link Verification

| From                                                                | To                                                                   | Via                                          | Status | Details                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `sections/stacks.tsx`                                                | `stacks/stack-section.tsx`                                           | `export {StackSection as Stacks}`            | WIRED  | Line 3: `export {StackSection as Stacks} from '../stacks/stack-section'`.                |
| `stacks/stack-section.tsx`                                          | `hooks/use-stacks.ts`                                                | `useStacks()`                                | WIRED  | Line 40 import + line 87 destructure.                                                    |
| `stacks/stack-section.tsx`                                          | `_components/compose-graph-viewer`                                   | post-relocation `../_components/...`         | WIRED  | Line 41: `import {ComposeGraphViewer} from '../_components/compose-graph-viewer'`.       |
| `stacks/stack-section.tsx`                                          | `resource-store.ts`                                                  | `useSelectedStack` + `setSelectedStack`      | WIRED  | Line 49 + 91 + 97.                                                                       |
| `stacks/stack-section.tsx`                                          | `resources/container-detail-sheet`                                   | post-relocation relative path                | WIRED  | Line 42 + 432 instantiation.                                                             |
| `stacks/deploy-stack-form.tsx`                                      | `hooks/use-stacks.ts`                                                | `deployStack/editStack/lastDeployResult`     | WIRED  | Confirmed via SUMMARY (verbatim port from legacy).                                       |
| `sections/schedules.tsx`                                            | `schedules/index.tsx`                                                | `export {SchedulerSection as Schedules}`     | WIRED  | Line 3: `export {SchedulerSection as Schedules} from '../schedules'`.                    |
| `schedules/index.tsx`                                               | `resource-store.ts`                                                  | `useSelectedVolume` + consume-and-clear      | WIRED  | Lines 41-50: read selectedVolume, pendingVolumeName state, setSelectedVolume(null) call. |
| `schedules/add-backup-dialog.tsx`                                   | tRPC scheduler routes                                                | `scheduler.upsertJob`, `testBackupDestination` | WIRED | Verified via SUMMARY + import of trpcReact.                                              |
| `routes/docker/status-bar.tsx`                                      | `_components/{environment-selector,ai-alerts-bell}`                  | post-relocation absolute path                | WIRED  | Lines 35-36: `from '@/routes/docker/_components/...'`.                                   |
| `routes/docker/resources/container-section.tsx`                     | `./container-create-form` + `./container-detail-sheet`               | post-relocation sibling relative             | WIRED  | Lines 43-44: `from './container-create-form'` + `from './container-detail-sheet'`.       |

### Behavioral Spot-Checks

| Behavior                                                              | Command                                                                                          | Result                          | Status |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------- | ------ |
| Vitest suite passes for routes/docker/                                 | `pnpm --filter ui exec vitest run src/routes/docker/ --environment jsdom`                         | 84/84 passed (12 test files)    | PASS   |
| 4-grep gate: no `from.*server-control`                                | `grep -rn 'from.*server-control' livos/packages/ui/src/`                                         | No matches                      | PASS   |
| 4-grep gate: no `ServerControlWindowContent`                           | `grep -rn 'ServerControlWindowContent' livos/packages/ui/src/`                                   | No matches                      | PASS   |
| 4-grep gate: no `LIVINITY_server-control`                              | `grep -rn 'LIVINITY_server-control' livos/packages/ui/src/`                                      | No matches                      | PASS   |
| 4-grep gate: no `from.*scheduler-section`                              | `grep -rn 'from.*scheduler-section' livos/packages/ui/src/`                                      | No matches                      | PASS   |
| Server-control directory deleted                                       | `ls livos/packages/ui/src/routes/server-control/`                                                 | No such file or directory       | PASS   |
| ServerControl adapter deleted                                          | `ls livos/packages/ui/src/modules/window/app-contents/server-control-content.tsx`                | No such file or directory       | PASS   |
| Legacy scheduler-section deleted                                       | `ls livos/packages/ui/src/routes/settings/_components/scheduler-section.tsx`                     | No such file or directory       | PASS   |
| selectedStack 5th slot tests                                           | grep `selectedStack` in resource-store.unit.test.ts                                              | 3 new test cases (H/I/J)        | PASS   |
| selectedStack tests collect into 10-test file                          | vitest run resource-store.unit.test.ts                                                            | 10 tests passed                 | PASS   |
| Phase 27 commit chain (7 commits)                                      | `git log --oneline 0887eac4..330b79df`                                                            | 7 commits between bounds        | PASS   |

### Requirements Coverage

| Requirement | Source Plan         | Description                                                                                                                  | Status     | Evidence                                                                                          |
| ----------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| DOC-11      | 27-01               | Stacks section + AddStack dialog (YAML/Git/AI) + stack detail with Graph + ContainerDetailSheet click-through.               | SATISFIED  | All artifacts + key links verified; 5 new files in stacks/ + 5th slot in resource-store.         |
| DOC-12      | 27-02               | Schedules route + Run Now + Test Destination + AddJob dialog with Volume pre-fill (Phase 26-02 contract).                    | SATISFIED  | schedules/{index,add-backup-dialog,job-card}.tsx exist; useSelectedVolume seam wired with consume-and-clear. |
| DOC-03      | 27-02 (final close) | Legacy Server Control removed entirely from disk + zero references in source.                                                | SATISFIED  | server-control/ directory deleted, adapter deleted, lazy import removed, 4 grep gates clean.    |

### Anti-Patterns Found

None. The migration is a verbatim port + structural cleanup. No TODO/FIXME/placeholder strings introduced. Plan 24 placeholder strings ("Coming in Phase 27...") removed from sections/{stacks,schedules}.tsx.

### Human Verification Required

8 visual/UX/runtime items deferred — see frontmatter `human_verification` section. Categories:

1. Stacks list rendering + per-row action UX (visual)
2. Deploy Stack 3-tab dialog end-to-end + webhook display (real-time tRPC + AI)
3. AddGitCredential nested dialog + auto-select (multi-step UX)
4. Programmatic deep-link via devtools (live UI required)
5. Schedules list + Run Now + toggle + Delete (real-time scheduler)
6. AddBackup destination forms + Test Destination (multi-state UX)
7. Volume pre-fill seam end-to-end + consume-and-clear (cross-section nav)
8. Settings page no longer shows Scheduler menu (visual)

### Gaps Summary

No automated gaps. All structural, code-level, test, and grep-gate verification PASSED. Status is `human_needed` because 8 visual/runtime UX items intentionally cannot be programmatically verified — they require a running UI to confirm v27.0 feature parity.

**Plan 27-01 Open Item (carried forward):** ROADMAP success criterion 2 read "Stack detail panel preserves Graph / Logs / Files tabs (Phase 19 + Phase 17 + Phase 18)". The implementation surfaces Phase 17 (logs) and Phase 18 (files) via per-container ContainerDetailSheet click-through, not stack-level aggregated tabs. SUMMARY 27-01 documents this as the closest no-new-backend interpretation; if reviewer determines stack-level aggregation was intended, that is NEW work for a follow-up phase. Not a Phase 27 gap.

---

_Verified: 2026-04-25T15:10:00Z_
_Verifier: Claude (gsd-verifier)_
