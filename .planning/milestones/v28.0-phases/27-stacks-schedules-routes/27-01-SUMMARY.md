---
phase: 27
plan: 01
subsystem: ui
tags: [docker-app, stacks, gitops, ai-compose, deep-link, doc-11, doc-20-partial]
requires: [phase-24, phase-21, phase-23, phase-26]
provides: [stack-section, useSelectedStack-slot]
affects: [routes/docker/sections/stacks.tsx, routes/docker/resource-store.ts]
tech-stack:
  added: []
  patterns: [zustand-multi-slot-store, verbatim-port-preserve-features, search-on-resource-list, cross-import-during-transition]
key-files:
  created:
    - livos/packages/ui/src/routes/docker/stacks/ai-compose-tab.tsx
    - livos/packages/ui/src/routes/docker/stacks/add-git-credential-dialog.tsx
    - livos/packages/ui/src/routes/docker/stacks/stack-dialogs.tsx
    - livos/packages/ui/src/routes/docker/stacks/deploy-stack-form.tsx
    - livos/packages/ui/src/routes/docker/stacks/stack-section.tsx
  modified:
    - livos/packages/ui/src/routes/docker/resource-store.ts
    - livos/packages/ui/src/routes/docker/resource-store.unit.test.ts
    - livos/packages/ui/src/routes/docker/sections/stacks.tsx
decisions:
  - selectedStack hoisted to useDockerResource (5th slot) — single store, single re-render scope, no separate persist middleware (matches 4-slot pattern from 26-01)
  - Per-stack Logs/Files surfaced via constituent-container click-through to existing ContainerDetailSheet (Phase 17/18/19 preserved without new backend) — Open Item flagged for ROADMAP success criterion 2 reinterpretation
  - Cross-import of ComposeGraphViewer and ContainerDetailSheet from routes/server-control/* is correct for transition; Plan 27-02 will relocate
  - Edit mode kept YAML-only (legacy v1 behavior); switching YAML↔Git mid-edit is out of scope
  - Search added at this layer (legacy lacked it) using filterByQuery primitive from Plan 26-01 with maxLength=200 defensive bound (T-27-01)
metrics:
  duration_minutes: 6
  tasks_completed: 2
  tasks_total: 2
  checkpoints_auto_approved: 1
  files_created: 5
  files_modified: 3
  commits: 2
  vitest_total: 84
  vitest_added: 3
completed: 2026-04-25
---

# Phase 27 Plan 01: Stacks Section Migration (DOC-11) Summary

**One-liner:** Live Stacks section ported from `routes/server-control/index.tsx` into `routes/docker/stacks/` — preserves YAML/Git/AI deploy modes, AddGitCredentialDialog, RemoveStackDialog, RedeployStackDialog, ComposeGraphViewer Graph tab, and constituent-container click-through to ContainerDetailSheet; adds search input and `selectedStack` deep-link slot.

## Outcome

Phase 24 Stacks placeholder fully replaced. Sidebar > Stacks now renders the live Stacks section — same status badges, per-row controls (start/stop/restart/redeploy/edit/remove), expandable rows with Containers + Graph tabs, full Deploy Stack overlay with three deploy modes (YAML / Git / AI), AddGitCredentialDialog for HTTPS PAT and SSH key credentials, webhook URL + secret panel after successful git deploy, RemoveStackDialog with "also remove volumes" checkbox, and RedeployStackDialog for pull-and-up.

`useDockerResource` extended from 4 slots to 5: `selectedContainer / selectedImage / selectedVolume / selectedNetwork / selectedStack`. The DOC-20 programmatic deep-link half is now closed for ALL FIVE resource types. URL-bar deep-link form remains Phase 29.

## Files

**Created (5):**
- `livos/packages/ui/src/routes/docker/stacks/ai-compose-tab.tsx` (124 lines) — Phase 23 AID-03 verbatim port (legacy 2680-2796).
- `livos/packages/ui/src/routes/docker/stacks/add-git-credential-dialog.tsx` (152 lines) — Phase 21 GitOps credential dialog (legacy 3314-3448).
- `livos/packages/ui/src/routes/docker/stacks/stack-dialogs.tsx` (109 lines) — RemoveStackDialog + RedeployStackDialog paired (legacy 3451-3539).
- `livos/packages/ui/src/routes/docker/stacks/deploy-stack-form.tsx` (445 lines) — full-page overlay with YAML/Git/AI tabs (legacy 2799-3307).
- `livos/packages/ui/src/routes/docker/stacks/stack-section.tsx` (407 lines) — main section body (legacy 3542-3856) with search + selectedStack store + clickable constituent rows.

**Modified (3):**
- `livos/packages/ui/src/routes/docker/resource-store.ts` — added 5th slot, setter, and selector hook.
- `livos/packages/ui/src/routes/docker/resource-store.unit.test.ts` — added 3 cases (write / no-clobber / null-clear); total 10 tests.
- `livos/packages/ui/src/routes/docker/sections/stacks.tsx` — replaced Phase 24 placeholder with 1-line re-export of `StackSection as Stacks`.

## Commits

| Hash | Message |
|------|---------|
| 0887eac4 | feat(27-01): add selectedStack slot to useDockerResource (DOC-11) |
| 52fb23ae | feat(27-01): port live Stacks section to Docker app (DOC-11) |

## Decisions Made

1. **5th slot in useDockerResource, not a new mini-store.** Single store, single re-render scope. Selector hook (`useSelectedStack`) bounds subscriptions so StackSection won't re-render when selectedContainer changes. Mirrors the Plan 26-01 4-slot pattern exactly.

2. **Per-stack Logs/Files surfaced via per-container click-through, not stack-level aggregation.** Legacy v27.0 StacksTab had only Containers + Graph tabs in the expanded row — Phase 17 (real-time logs xterm) and Phase 18 (file browser) were per-container features. This plan ports that exact shape and makes the constituent-container rows clickable to open the existing `ContainerDetailSheet`, where Logs and Files tabs already live. Stack-level aggregated logs/files would be NEW backend + UI work not present in v27.0. **See Open Item below.**

3. **Cross-imports from routes/server-control/* during transition.** Per Plan 26-01 D-06 + Plan 24-02 D-09 precedent: importing `ComposeGraphViewer` and `ContainerDetailSheet` from `routes/server-control/` is correct while the directory is on disk; Plan 27-02 owns the relocation + delete. No new cross-imports beyond the five already inventoried.

4. **Search at section layer with maxLength=200 (T-27-01 mitigate).** Legacy StacksTab lacked search. Added using `filterByQuery` primitive from Plan 26-01 (same pattern as ContainerSection / ImageSection / VolumesSection / NetworksSection). 200-char defensive bound matches the existing T-26-03 mitigation.

5. **Edit mode kept YAML-only.** Plan 21-02 v1 behavior preserved — switching a stack between YAML and Git mid-edit would require backend support in `editStack` (out of scope).

6. **`hasValue` env-var UI flag preserved verbatim.** Server returns `value=''` for redacted stored secrets; UI treats `value blank + hasValue=true` as "keep existing" on submit. Critical for Plan 21-02 secret-rotation semantics.

## Deviations from Plan

**None.** Plan executed exactly as written. No Rule 1/2/3 auto-fixes triggered, no architectural pivots, no auth gates encountered.

## Threat-Model Status

| Threat ID | Disposition | Resolution |
|-----------|-------------|------------|
| T-27-01 | mitigate | `<Input maxLength={200}>` applied to search input in `stack-section.tsx`. |
| T-27-02 | accept | Same in-memory zustand trust as T-26-01. |
| T-27-03 | accept | Filter is purely client-side display; tRPC-layer env scoping unchanged. |
| T-27-04 | accept | Webhook secret panel ports verbatim — `type='password'` input + copy button + form-stays-open-until-Done semantics preserved. |
| T-27-05 | n/a | Zero new tRPC routes — re-uses existing `docker.*` mutations. |
| T-27-06 | accept | AI-generated YAML rendered read-only with explicit "Use this YAML" gate before deploy. |
| T-27-07 | accept | Cross-import path is static, no user input flows in. |

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter @livos/config build` | green |
| `pnpm --filter ui build` | green (31.62s, no TS errors) |
| `pnpm --filter ui exec vitest run src/routes/docker/ --environment jsdom` | 84/84 passed (10 in resource-store.unit.test.ts: 7 pre-existing + 3 new for selectedStack) |
| Phase 24 placeholder string removed from `sections/stacks.tsx` | confirmed (grep returns no match) |
| Cross-imports from `routes/server-control/*` audited | 5 references — exactly the inventoried set: ContainerCreateForm + ContainerDetailSheet (container-section), ContainerDetailSheet + ComposeGraphViewer (stack-section), AlertsBell + EnvironmentSelector (status-bar) |

## Checkpoint Auto-Approval

`⚡ Auto-approved checkpoint` (post-Task-2 human-verify) per orchestrator workflow (autonomous orchestration → user_response = 'approved'). Functional verification will be re-confirmed by the Phase 27 verifier and the user on the next manual run; build + tests + cross-import sanity all pass automated checks.

## Open Item — ROADMAP Success Criterion 2 Interpretation

ROADMAP's Phase 27 success criterion 2 reads: "Stack detail panel preserves Graph / Logs / Files tabs (Phase 19 + Phase 17 + Phase 18)". The legacy v27.0 server-control StacksTab actually has only **Containers + Graph** tabs in the expanded row — Phase 17 (real-time container logs xterm) and Phase 18 (container file browser) were always **per-container** features delivered via `ContainerDetailSheet`, never per-stack.

This plan preserves Phase 17 + 18 features by making constituent-container rows in the stack's expanded row clickable, which opens `ContainerDetailSheet` (already containing Logs + Files + vuln-scan tabs). That's the closest no-new-backend interpretation of the criterion.

**If reviewers determine the criterion intended dedicated stack-level Logs/Files tabs** (aggregating logs/files across constituent containers — e.g., a multiplexed `docker compose logs -f` xterm, or a virtual file tree across all containers), that would be NEW backend + UI work absent from v27.0 source. Flag for Phase 28 follow-up or roadmap re-scope.

## Phase 27-02 Readiness

Cross-imports from `routes/server-control/*` remaining at end of 27-01 — Plan 27-02 must relocate ALL FIVE before deleting the legacy directory:

1. `ComposeGraphViewer` from `compose-graph-viewer.tsx` (consumed by stack-section.tsx)
2. `ContainerDetailSheet` from `container-detail-sheet.tsx` (consumed by container-section.tsx + stack-section.tsx)
3. `ContainerCreateForm` from `container-create-form.tsx` (consumed by container-section.tsx)
4. `AlertsBell` from `ai-alerts-bell.tsx` (consumed by status-bar.tsx)
5. `EnvironmentSelector` from `environment-selector.tsx` (consumed by status-bar.tsx)

After 27-02 relocates these and migrates Schedules, the legacy `routes/server-control/` directory should be import-free and safe to delete (DOC-03 final cleanup).

## Self-Check: PASSED

Files exist:
- FOUND: livos/packages/ui/src/routes/docker/stacks/ai-compose-tab.tsx
- FOUND: livos/packages/ui/src/routes/docker/stacks/add-git-credential-dialog.tsx
- FOUND: livos/packages/ui/src/routes/docker/stacks/stack-dialogs.tsx
- FOUND: livos/packages/ui/src/routes/docker/stacks/deploy-stack-form.tsx
- FOUND: livos/packages/ui/src/routes/docker/stacks/stack-section.tsx

Commits exist:
- FOUND: 0887eac4
- FOUND: 52fb23ae
