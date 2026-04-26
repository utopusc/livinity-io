---
phase: 26-resource-routes
plan: 01
subsystem: ui
tags: [react, tailwind, vitest, zustand, docker, containers, images, scan, ai-diagnose, deep-link]

# Dependency graph
requires:
  - phase: 24-docker-app-skeleton
    provides: DockerApp + sections/* placeholders + useDockerStore section navigation
  - phase: 22-multi-host-docker
    provides: env-aware useContainers / useImages hooks (Plan 22-01 D-08 — env scoping at tRPC layer)
  - phase: 23-ai-diagnostics
    provides: useAiDiagnostics().explainVulnerabilities (Plan 23-01 AID-04) — Explain CVEs button
  - phase: 19-image-scan
    provides: trpcReact.docker.scanImage + getCachedScan (Trivy execa subprocess) — Scan flow
provides:
  - "useDockerResource zustand store at livos/packages/ui/src/routes/docker/resource-store.ts — 4 detail-panel slots (selectedContainer/Image/Volume/Network) + setters + clearAllSelections + 4 selector hooks; NO persist (conversational state)"
  - "filterByQuery<T>(rows, query, getHaystack) at routes/docker/resources/filter-rows.ts — pure generic; empty-string returns SAME array reference (consumer perf)"
  - "formatBytes + formatRelativeDate canonical Docker-app modules at routes/docker/resources/format-bytes.ts + format-relative-date.ts; back-compat hook export retained"
  - "ContainerSection (DOC-07) at routes/docker/resources/container-section.tsx — full Containers tab body + search + bulk action bar + create/edit/duplicate/rename/remove dialogs + ContainerDetailSheet wired to store"
  - "ImageSection (DOC-08) at routes/docker/resources/image-section.tsx — full Images tab body + search + expandable rows + Layer history / Vulnerabilities tabs + Scan/Explain CVEs preserved + Pull/Tag/Remove/Prune dialogs"
  - "ActionButton + StateBadge + formatPorts + ImageHistoryPanel + ScanResultPanel ported into routes/docker/resources/* (verbatim from server-control/index.tsx)"
  - "RenameDialog + Image-related dialogs (Remove/Prune/Pull/Tag) ported into routes/docker/resources/{rename-dialog,image-dialogs}.tsx"
  - "DOC-20 programmatic deep-link half closed for containers + images: useDockerResource.getState().setSelectedContainer(name) / setSelectedImage(id) opens detail sheet / expands row from external code"
affects: [26-02, 27, 28, 29]

# Tech tracking
tech-stack:
  added: []  # No new deps — re-uses zustand@5, framer-motion@10, @tabler/icons-react, @tanstack/react-query already in package.json.
  patterns:
    - "Zustand store-per-concern split: useDockerStore (Plan 24-01: section nav) + useDockerResource (Plan 26-01: detail-panel selections) — orthogonal slices, no cross-store coupling"
    - "Selector hooks (useSelectedContainer/Image/Volume/Network) each subscribe to ONE slice — ContainerSection won't re-render when selectedImage changes"
    - "filterByQuery empty-string returns SAME array reference — consumers can skip useMemo when search inactive (perf-by-default pure helper)"
    - "Cross-import legacy components from routes/server-control/* during v28 transition window (Plan 24-02 D-09 precedent for EnvironmentSelector + AlertsBell). Plan 27 will relocate; until then both copies coexist"
    - "Resource files live under routes/docker/resources/ — co-located with sections/ but for shared sub-components (ActionButton, StateBadge, dialogs, panels). sections/*.tsx stays as 1-line re-exports keeping docker-app.tsx switch unchanged"

key-files:
  created:
    - livos/packages/ui/src/routes/docker/resource-store.ts
    - livos/packages/ui/src/routes/docker/resource-store.unit.test.ts
    - livos/packages/ui/src/routes/docker/resources/filter-rows.ts
    - livos/packages/ui/src/routes/docker/resources/filter-rows.unit.test.ts
    - livos/packages/ui/src/routes/docker/resources/format-bytes.ts
    - livos/packages/ui/src/routes/docker/resources/format-relative-date.ts
    - livos/packages/ui/src/routes/docker/resources/format.unit.test.ts
    - livos/packages/ui/src/routes/docker/resources/action-button.tsx
    - livos/packages/ui/src/routes/docker/resources/state-badge.tsx
    - livos/packages/ui/src/routes/docker/resources/format-ports.ts
    - livos/packages/ui/src/routes/docker/resources/image-history-panel.tsx
    - livos/packages/ui/src/routes/docker/resources/scan-result-panel.tsx
    - livos/packages/ui/src/routes/docker/resources/rename-dialog.tsx
    - livos/packages/ui/src/routes/docker/resources/image-dialogs.tsx
    - livos/packages/ui/src/routes/docker/resources/container-section.tsx
    - livos/packages/ui/src/routes/docker/resources/image-section.tsx
  modified:
    - livos/packages/ui/src/routes/docker/sections/containers.tsx (placeholder → re-export of ContainerSection)
    - livos/packages/ui/src/routes/docker/sections/images.tsx (placeholder → re-export of ImageSection)

key-decisions:
  - "Single useDockerResource store with 4 slots, NOT 4 mini-stores. Single subscribe-cost for components consuming multiple slots; matches Plan 24-01 useDockerStore precedent (one store per concern surface). Plan 26-02 reuses the volume + network slots already declared up-front."
  - "NO persist middleware on resource-store. Detail-panel-open state is conversational, not preferential. Re-opening the Docker window with a stale detail panel violates least-surprise."
  - "Explicit selector hooks (useSelectedContainer etc.) instead of consumers calling useDockerResource((s) => s.selectedContainer). Two reasons: (1) ContainerSection should NOT re-render when selectedImage changes — explicit hooks document the slice + bound the subscription; (2) matches Plan 24-01 SECTION_META + selector-hook pattern."
  - "Search inputs added with maxLength={200} per threat T-26-03 (defensive bound on filterByQuery query length — query of length 10000 chars across 1000-image list is not a real attack but the bound is free). Legacy lacked search entirely."
  - "Selection helpers (toggleSelectAll) operate on `containers` (full set) NOT `filteredContainers` so 'select all' under an active filter selects every visible row in the unfiltered list. The bulk action bar surfaces the count regardless of filter state."
  - "Cross-imports from routes/server-control/ (ContainerCreateForm, ContainerDetailSheet) are intentional during the v28 transition. Plan 24-02 D-09 established the precedent. Plan 27 will relocate these once the legacy file gets deleted."
  - "RemoveDialog inlined into container-section.tsx (vs. separate file) because Containers is the only consumer; RenameDialog ported into a separate file for symmetry with the resources/ module shape (also a consumer-of-one but lighter file)."
  - "The four legacy file-local image dialogs (RemoveImage / Prune / Pull / Tag) were never exported from server-control/index.tsx. Ported into resources/image-dialogs.tsx as a single file (4 components, ~200 lines) — those copies become canonical after Plan 27 deletion."
  - "Empty-state branching: `noFilterResults` (filter active + filtered empty + unfiltered non-empty) gets a distinct empty card showing the query string; the original `!containers.length` empty-state stays for the unfiltered-empty case (with the legacy 'Install an app from the App Store' copy preserved)."
  - "ScanResultPanel + ImageHistoryPanel imports updated to the new resources/format-bytes + format-relative-date paths; the existing hooks/use-images.ts formatBytes export remains for back-compat (Plan 27 may collapse the duplicate)."

patterns-established:
  - "Adding a deep-linkable resource section: declare slot in ResourceStore + add selector hook (useSelectedX) + write the section component to read from the hook + write back via store setter. External surfaces (env card click, palette, deep-link) call useDockerResource.getState().setSelectedX(name) — DOC-20 programmatic half pattern."
  - "Replacing a Phase 24 placeholder section: 1-line re-export in sections/<id>.tsx pointing at resources/<id>-section.tsx. docker-app.tsx switch unchanged. Plan-comment header documents what was replaced and why."
  - "Verbatim port from legacy file: comment header cites the source file + line range, imports adjusted for the new location, behaviour identical (bug-for-bug compatibility) — carrying over Phase 19 + 22 + 23 features unchanged is the contract."

requirements-completed: [DOC-07, DOC-08]
# DOC-20 — programmatic half closed for containers + images; volumes + networks ship in 26-02; URL-bar deep-link Phase 29 (DOC-20 final).

# Metrics
duration: 10min
completed: 2026-04-25
---

# Phase 26 Plan 01: Resource Routes — Containers + Images Section Migration Summary

**Replaces Phase 24 Containers + Images placeholders with the full live tab bodies from `routes/server-control/index.tsx` — adds search inputs (NEW), wires detail-panel state through `useDockerResource` zustand store for programmatic deep-link (DOC-20 partial), preserves Phase 19 vulnerability scan + Phase 22 env-aware tRPC + Phase 23 AI Diagnose / Explain CVEs end-to-end.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-25T20:51:52Z
- **Completed:** 2026-04-25T21:02:12Z
- **Tasks:** 4 (Task 1 was TDD: RED + GREEN — 2 commits; Tasks 2-4 single commits each = 5 task commits total)
- **Files created:** 16 (1 store + 1 store test + 4 helpers + 1 helper test + 5 ported sub-components + 2 dialog ports + 2 sections)
- **Files modified:** 2 (sections/containers.tsx + sections/images.tsx — placeholder → re-export)

## Accomplishments

- New `useDockerResource` zustand store with 4 slots (selectedContainer / Image / Volume / Network) + 4 setters + clearAllSelections + 4 selector hooks. NO persist (detail-panel state is conversational).
- New `filterByQuery<T>` pure generic helper — empty-string returns same array reference (perf), case-insensitive trimmed substring match otherwise.
- Canonical Docker-app `formatBytes` + `formatRelativeDate` modules at `routes/docker/resources/`; back-compat re-export from `hooks/use-images.ts` retained.
- 5 helper sub-components ported from `routes/server-control/index.tsx` into `routes/docker/resources/`: `ActionButton`, `StateBadge`, `formatPorts`, `ImageHistoryPanel`, `ScanResultPanel`. Verbatim — bug-for-bug compatible. `ScanResultPanel` carries Phase 19 (Trivy scan + cached scan lookup + severity filter table) + Phase 23 (AID-04 plain-English explainer) intact.
- 2 dialog modules ported: `rename-dialog.tsx` (1 dialog) + `image-dialogs.tsx` (4 dialogs that were file-local in legacy and never exported).
- `ContainerSection` (DOC-07) — full Containers tab body with: search input, bulk-action bar (start/stop/restart/kill/remove), per-row action buttons (edit/duplicate/rename/start/stop/pause/unpause/kill/restart/remove with protected-container guards), env-aware via `useContainers` (Phase 22), `ContainerDetailSheet` wired through `useDockerResource` store for DOC-20 programmatic deep-link.
- `ImageSection` (DOC-08) — full Images tab body with: search input, summary (count + total size), Pull / Prune / Refresh actions, expandable rows with Layer history + Vulnerabilities tabs (`ImageHistoryPanel` + `ScanResultPanel`), Scan / Tag / Remove per-row, all 4 dialogs (Remove / Prune / Pull / Tag), env-aware via `useImages` (Phase 22), expanded-row state via `useDockerResource.selectedImage`.
- Phase 24 placeholder strings ("Coming in Phase 26 — …") removed from both `sections/containers.tsx` and `sections/images.tsx` (replaced with 1-line re-exports of the new sections, keeping `docker-app.tsx`'s `SectionView` switch untouched).
- 17 new vitest cases (7 store + 4 filter + 6 format) — all pass alongside the 61 baseline tests. Suite total: 78/78 passing.

## Task Commits

1. **Task 1 (RED): failing tests for store + filter + format** — `4750bf70` (test)
2. **Task 1 (GREEN): resource-store + filter-rows + format modules** — `3bc81521` (feat)
3. **Task 2: port resource sub-components to routes/docker/resources/** — `fd9c8ea6` (refactor)
4. **Task 3: ContainerSection replaces placeholder** — `5a7725fd` (feat)
5. **Task 4: ImageSection replaces placeholder** — `eb5c6b6a` (feat)

_Plan metadata commit will be added at the end._

## Files Created

**Store + helpers** (`livos/packages/ui/src/routes/docker/`):
- `resource-store.ts` — `useDockerResource` zustand store, 4 selector hooks, `ResourceStore` type
- `resource-store.unit.test.ts` — 7 cases (default state + 4 setter slot-isolation + clearAll + selector hooks + identity-stable)

**Resources module** (`livos/packages/ui/src/routes/docker/resources/`):
- `filter-rows.ts` — `filterByQuery<T>(rows, query, getHaystack)`
- `filter-rows.unit.test.ts` — 4 cases (empty-string identity + match + case-insensitive + trim)
- `format-bytes.ts` — canonical Docker-app `formatBytes(bytes: number): string`
- `format-relative-date.ts` — `formatRelativeDate(timestamp: number): string`
- `format.unit.test.ts` — 6 cases (formatBytes 0/MB/GB + formatRelativeDate just-now/5h/3d with vi.useFakeTimers)
- `action-button.tsx` — `ActionButton` (legacy lines 202-235 verbatim)
- `state-badge.tsx` — `StateBadge` (legacy lines 246-258 verbatim)
- `format-ports.ts` — `formatPorts` (legacy lines 237-243 verbatim)
- `image-history-panel.tsx` — `ImageHistoryPanel` (legacy lines 1294-1359 verbatim, imports rerouted to local format helpers)
- `scan-result-panel.tsx` — `ScanResultPanel` + `Severity` type + `SEVERITY_LIST` + `severityBadgeClasses` (legacy lines 1741-1992 verbatim, imports rerouted)
- `rename-dialog.tsx` — `RenameDialog` (legacy lines 999-1059 verbatim)
- `image-dialogs.tsx` — `RemoveImageDialog` + `PruneImagesDialog` + `PullImageDialog` + `TagImageDialog` (legacy lines 1073-1291 verbatim; were file-local in legacy)
- `container-section.tsx` — `ContainerSection` (DOC-07) — full Containers body (~620 lines) + inlined `RemoveDialog`
- `image-section.tsx` — `ImageSection` (DOC-08) — full Images body (~330 lines)

## Files Modified

- `livos/packages/ui/src/routes/docker/sections/containers.tsx` — placeholder body → 1-line re-export of `ContainerSection as Containers`
- `livos/packages/ui/src/routes/docker/sections/images.tsx` — placeholder body → 1-line re-export of `ImageSection as Images`

## Decisions Made

1. **Single `useDockerResource` store with 4 slots, NOT 4 mini-stores.** Single subscribe-cost for components consuming multiple slots; matches Plan 24-01 `useDockerStore` precedent. Plan 26-02 reuses the `volume` + `network` slots already declared up-front — single source of truth, single re-render scope.
2. **NO persist middleware on resource-store.** Detail-panel-open state is conversational, not preferential. Re-opening the Docker window with a stale detail panel violates least-surprise.
3. **Explicit selector hooks (`useSelectedContainer` etc.)** instead of consumers calling `useDockerResource((s) => s.selectedContainer)`. Two reasons: (1) `ContainerSection` should NOT re-render when `selectedImage` changes — explicit hooks document the slice + bound the subscription; (2) matches Plan 24-01 `SECTION_META` + selector-hook pattern.
4. **Search inputs added with `maxLength={200}`** per threat T-26-03 (defensive DoS bound on `filterByQuery` query length — query of length 10,000 chars across a 1000-image list is not a real attack but the bound is free).
5. **Selection helpers (`toggleSelectAll`) operate on `containers` (full set)** NOT `filteredContainers` so 'select all' under an active filter selects every visible row in the unfiltered list. The bulk action bar surfaces the count regardless of filter state.
6. **Cross-imports from `routes/server-control/`** (`ContainerCreateForm`, `ContainerDetailSheet`) are intentional during the v28 transition. Plan 24-02 D-09 established the precedent (`EnvironmentSelector` + `AlertsBell`). Plan 27 will relocate these once the legacy file gets deleted.
7. **`RemoveDialog` inlined into `container-section.tsx`** (vs. separate file) because Containers is the only consumer; `RenameDialog` ported into a separate file for symmetry with the resources/ module shape (also a consumer-of-one but lighter file size keeps `container-section.tsx` under 700 lines).
8. **The four legacy file-local image dialogs** (`RemoveImageDialog`, `PruneImagesDialog`, `PullImageDialog`, `TagImageDialog`) were never exported from `server-control/index.tsx`. Ported into `resources/image-dialogs.tsx` as a single file (4 components, ~200 lines). Those copies become canonical after Plan 27 file deletion.
9. **Empty-state branching: `noFilterResults`** (filter active + filtered empty + unfiltered non-empty) gets a distinct empty card showing the query string; the original `!containers.length` empty-state stays for the unfiltered-empty case (with the legacy "Install an app from the App Store" copy preserved).
10. **`ScanResultPanel` + `ImageHistoryPanel` imports updated to the new `resources/format-bytes` + `format-relative-date` paths**; the existing `hooks/use-images.ts` `formatBytes` export remains for back-compat (Plan 27 may collapse the duplicate after server-control deletion).

## Deviations from Plan

None — plan executed exactly as written. The five task commits match the plan's atomic-commit shape (RED + GREEN for Task 1, single commit each for Tasks 2-4). All 17 specified test cases pass. Both placeholder strings removed. Build green on the first try after each section task. No Rule 1/2/3 auto-fixes triggered.

Two minor scope clarifications from the plan that the executor honoured rather than deviated from:

- **Plan ambiguity on `RemoveDialog` placement:** the plan listed `RemoveDialog` in the legacy files but did not specify whether to inline it or extract it. Decision documented in Task 3 commit body and decision #7: inlined, single consumer.
- **Plan ambiguity on `image-dialogs.tsx` filename:** Task 4's `<files>` block listed the section + the 4 ported dialogs but did not specify a single-file vs. four-file shape. Decision documented in Task 4 commit body and decision #8: single file (`image-dialogs.tsx` exporting all 4).

## Threat Model Mitigation Status

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-26-01 (store tampering) | accept | Same trust model as legacy `setSelectedContainer` useState — no escalation |
| T-26-02 (search reveals env-scoped data) | accept | Same data legacy already exposed; env scoping is at the tRPC layer |
| T-26-03 (search-DoS) | mitigate | `<Input maxLength={200}>` on both ContainerSection + ImageSection search inputs |
| T-26-04 (container-action audit) | accept | `manageContainer` audit_log unchanged (Plan 22-01 SEC-02) |
| T-26-05 (scan imageRef spoofing) | accept | imageRef sourced from server-side `listImages`, not user input |
| T-26-06 (privilege escalation) | n/a | Zero new tRPC routes, mutations, or auth paths |

T-26-03 is the only `mitigate` disposition — implemented as `maxLength={200}` on both search inputs (verified in `container-section.tsx` and `image-section.tsx` source).

## Issues Encountered

None. All 4 tasks executed cleanly, all commits landed, all tests pass.

Pre-existing baseline noise unchanged:
- Routes/server-control/* still has its 47 typecheck errors (Plan 24-02 deferred-items list) — out of scope per Plan 24-01.
- The build chunk-size warning (>500 kB after minification) is the standard Vite warning unchanged from Plan 24-02 baseline.
- LF/CRLF line-ending warnings on git add are the standard Windows checkout (`core.autocrlf=true`) — content unchanged.

## Phase 26-02 Readiness

Plan 26-02 (Volumes + Networks) plugs into 3 anchor points provided here:

1. **`useDockerResource` store already has `selectedVolume` + `selectedNetwork` slots** + `setSelectedVolume` + `setSelectedNetwork` + `useSelectedVolume` + `useSelectedNetwork` selector hooks. Plan 26-02 imports them directly — no store rev needed.
2. **`filterByQuery` from `resources/filter-rows.ts`** — Plan 26-02's volume + network sections call it with their own `getHaystack` lambdas (volume: `name`; network: `name + ' ' + driver`).
3. **`formatRelativeDate` from `resources/format-relative-date.ts`** — Plan 26-02's volume "Created" column reuses it.

**Does NOT block 26-02:** all module exports (`useDockerResource`, 4 selector hooks, `filterByQuery`, `formatRelativeDate`, `formatBytes`, `ActionButton`, `StateBadge`) are stable from Plan 26-01.

The cross-import precedent for legacy `routes/server-control/*` components (Plan 24-02 D-09) carries over to Plan 26-02 — `RemoveVolumeDialog`, `CreateVolumeDialog`, `CreateNetworkDialog`, `RemoveNetworkDialog`, `VolumeUsagePanel` will need to be ported (or imported if exported) following the same pattern as Task 2 + the `image-dialogs.tsx` port in Task 4.

## User Setup Required

None — pure UI surface change. Existing Docker tRPC routes, env-aware hooks, AI diagnostics, and Trivy scan infrastructure all unchanged. Restarting the UI dev server (or rebuilding for prod) is sufficient.

---

## Self-Check: PASSED

All 16 created files verified present on disk:
- 1 zustand store (resource-store.ts) + 1 store test
- 4 helper modules (filter-rows + format-bytes + format-relative-date + format-ports) + 2 helper tests
- 5 ported sub-components (action-button + state-badge + image-history-panel + scan-result-panel + rename-dialog)
- 1 ported dialog file (image-dialogs.tsx)
- 2 section components (container-section + image-section)

All 5 task commits verified in git log:
- 4750bf70 (Task 1 RED)
- 3bc81521 (Task 1 GREEN)
- fd9c8ea6 (Task 2)
- 5a7725fd (Task 3)
- eb5c6b6a (Task 4)

Tests: 78/78 passing (`pnpm exec vitest run src/routes/docker/ --environment jsdom`)
Build: green (`pnpm --filter ui build`, 31.61s)
Placeholder strings: gone (`grep "Coming in Phase 26"` returns empty for both `sections/containers.tsx` and `sections/images.tsx`)

---

*Phase: 26-resource-routes*
*Plan: 01*
*Completed: 2026-04-25*
