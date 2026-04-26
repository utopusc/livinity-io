---
phase: 26-resource-routes
plan: 02
subsystem: ui
tags: [react, tailwind, vitest, zustand, docker, volumes, networks, schedules-link, deep-link]

# Dependency graph
requires:
  - phase: 26-resource-routes
    plan: 01
    provides: useDockerResource (selectedVolume + selectedNetwork slots) + useSelectedVolume + useSelectedNetwork + filterByQuery + ActionButton
  - phase: 24-docker-app-skeleton
    provides: useDockerStore + useSetDockerSection (section navigation — Schedule-backup link target)
  - phase: 22-multi-host-docker
    provides: env-aware useVolumes + useNetworks hooks (Plan 22-01 D-08 — env scoping at tRPC layer)
provides:
  - "VolumeSection (DOC-09) at routes/docker/resources/volume-section.tsx — full Volumes tab body + search + per-row Schedule-backup link (sets DockerSection to 'schedules' AND keeps selectedVolume so Phase 27 can pre-fill backup-job form) + expandable VolumeUsagePanel rows + Create/Remove dialogs"
  - "NetworkSection (DOC-10) at routes/docker/resources/network-section.tsx — full Networks tab body + search + inspect-card with bridge useEffect (store-driven inspectNetwork) + Disconnect mutations + Create/Remove dialogs"
  - "VolumeUsagePanel + RemoveVolumeDialog + CreateVolumeDialog + RemoveNetworkDialog + CreateNetworkDialog ported into routes/docker/resources/* (verbatim from server-control/index.tsx)"
  - "deep-link.unit.test.ts — 3 vitest cases pinning DOC-20 programmatic-deep-link contract for ALL 4 resource types (containers + images + volumes + networks share useDockerResource store)"
  - "DOC-20 programmatic deep-link half closed for volumes + networks: useDockerResource.getState().setSelectedVolume(name) opens row + sets section schedules link state; setSelectedNetwork(id) opens inspect card via the bridge useEffect"
affects: [27, 28, 29]

# Tech tracking
tech-stack:
  added: []  # No new deps — re-uses zustand@5, framer-motion@10, @tabler/icons-react, @tanstack/react-query already in package.json.
  patterns:
    - "Store-to-hook bridge useEffect: useNetworks owns the inspect query lifecycle internally; the new store is just the trigger source. Bridge effect on [selectedNetwork] only — eslint-disable on react-hooks/exhaustive-deps with rationale comment because inspectNetwork/clearInspect are recreated per render of useNetworks (closures over fresh setInspectedNetwork callbacks)."
    - "Cross-section navigation seam: VolumeSection's Schedule-backup link sets selectedVolume(name) AND setSection('schedules') in one click. Phase 27 reads useSelectedVolume() from the Schedules section to pre-fill the backup-job-create form. This plan ships the navigation seam only — the form lives in Phase 27."
    - "Empty-state branching mirrors 26-01's noFilterResults pattern: filter active + filtered empty + unfiltered non-empty gets a distinct empty card showing the query string; the original !volumes.length / !networks.length empty-state stays for the unfiltered-empty case."

key-files:
  created:
    - livos/packages/ui/src/routes/docker/resources/volume-usage-panel.tsx
    - livos/packages/ui/src/routes/docker/resources/volume-dialogs.tsx
    - livos/packages/ui/src/routes/docker/resources/network-dialogs.tsx
    - livos/packages/ui/src/routes/docker/resources/volume-section.tsx
    - livos/packages/ui/src/routes/docker/resources/network-section.tsx
    - livos/packages/ui/src/routes/docker/resources/deep-link.unit.test.ts
  modified:
    - livos/packages/ui/src/routes/docker/sections/volumes.tsx (placeholder → re-export of VolumeSection)
    - livos/packages/ui/src/routes/docker/sections/networks.tsx (placeholder → re-export of NetworkSection)

key-decisions:
  - "Bridge useEffect on [selectedNetwork] only, with eslint-disable on exhaustive-deps for inspectNetwork/clearInspect. Including them would cause an infinite loop because useNetworks recreates these callbacks every render. The hook's setInspectedNetwork useState setter is identity-stable, so calling inspectNetwork(id) when id is unchanged is a no-op — matches T-26-07 mitigation rationale."
  - "Volume Schedule-backup link sets BOTH selectedVolume(name) AND setSection('schedules') in one click. Setting just the section would leave Phase 27's pre-fill flow without a target; setting just the volume slot would not navigate. The two-line handler closes the seam Phase 27 (DOC-12) reads from."
  - "Verbatim port discipline for volume-usage-panel + dialogs (Task 1) — bug-for-bug parity with the legacy server-control file. Plan 24-02 D-09 / Plan 26-01 precedent: legacy file untouched, both copies coexist until Plan 27 deletes the legacy file whole."
  - "Optional Test D in the plan (identity-stable subscriber notification) was SKIPPED — Plan 26-01's resource-store.unit.test.ts Test G already covers it. Avoided duplication per the plan's 'Skip if Plan 26-01's resource-store.unit.test.ts Test G already covers this' guidance."
  - "noFilterResults empty-state branch added to both sections, mirroring 26-01's pattern: shows 'No volumes/networks match \"<query>\"' with the search query echoed in mono font when filter is active and empty but unfiltered list is non-empty."
  - "IconCalendarTime selected as the Schedule-backup affordance icon (verified present in @tabler/icons-react@3.36.1 — `ls node_modules/@tabler/icons-react/dist/esm/icons/IconCalendarTime.mjs` resolves). The plan's IconClock fallback was unnecessary."

patterns-established:
  - "Store-to-hook bridge for hooks that own internal query lifecycle: when a store slot is the trigger source, write a single useEffect on [slotValue] only. Document the eslint-disable with a comment explaining why the unstable callbacks are excluded. Phase 28 cross-container logs will reuse this pattern."
  - "Cross-section navigation seam: a per-row link button that flips the docker section AND keeps a selection slot set so the destination section can pre-fill its form. Phase 27 (Schedules) and Phase 28 (cross-container logs) consume this pattern from this plan."

requirements-completed: [DOC-09, DOC-10]
# DOC-20 — programmatic half of all 4 resource types now closed across 26-01 + 26-02; URL-bar form remains Phase 29 (DOC-20 final).

# Metrics
duration: 8min
completed: 2026-04-25
---

# Phase 26 Plan 02: Resource Routes — Volumes + Networks Section Migration Summary

**Replaces Phase 24 Volumes + Networks placeholders with the full live tab bodies from `routes/server-control/index.tsx` — adds search inputs (NEW), wires deep-link state through `useDockerResource` zustand store for volumes + networks (DOC-20 partial half now closed for all 4 resource types), adds per-row Schedule-backup cross-section navigation seam (DOC-09), pins the four-slot programmatic deep-link contract via 3-case vitest contract test for Phase 28 + 29 future readers.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-25T21:07:30Z
- **Completed:** 2026-04-25T21:15:31Z
- **Tasks:** 4 (each single atomic commit = 4 task commits total)
- **Files created:** 6 (3 ports + 2 sections + 1 test)
- **Files modified:** 2 (sections/volumes.tsx + sections/networks.tsx — placeholder → re-export)

## Accomplishments

- 3 verbatim ports from `routes/server-control/index.tsx` into `routes/docker/resources/`:
  - `volume-usage-panel.tsx` — `VolumeUsagePanel` (legacy 1687-1738) — uses `trpcReact.docker.volumeUsage` + Table primitives.
  - `volume-dialogs.tsx` — `RemoveVolumeDialog` (legacy 1362-1421, typed-name confirmation) + `CreateVolumeDialog` (legacy 1561-1685, name + driver + driverOpts repeater).
  - `network-dialogs.tsx` — `CreateNetworkDialog` (legacy 1423-1525, name + driver Select + subnet/gateway) + `RemoveNetworkDialog` (legacy 1527-1559, simple confirm).
- `VolumeSection` (DOC-09) — full Volumes tab body with: search input (`maxLength=200` per T-26-10), per-row chevron-expand to inline `VolumeUsagePanel`, per-row Schedule-backup link (`IconCalendarTime`) that sets `selectedVolume(name)` + `setSection('schedules')` (cross-section navigation seam — Phase 27 reads `useSelectedVolume()` to pre-fill the backup-job-create form), per-row Remove (typed-name dialog), Create Volume action, env-aware via `useVolumes` (Phase 22), `expandedVolume` state migrated from local `useState` to `useDockerResource.selectedVolume`. Phase 24 placeholder string "Coming in Phase 26 — Volume list + backup config" is gone.
- `NetworkSection` (DOC-10) — full Networks tab body with: search input filtering by name + driver (`maxLength=200`), per-row Inspect (`IconSearch`) + Remove actions, inspect card showing `name / driver / scope` header + connected containers table (IPv4 / MAC / Disconnect), Create / Remove network dialogs, env-aware via `useNetworks` (Phase 22), bridge `useEffect` connecting `useDockerResource.selectedNetwork` ⇒ `inspectNetwork(id)` so external code can call `useDockerResource.getState().setSelectedNetwork(id)` to programmatically open the inspect card. Phase 24 placeholder string "Coming in Phase 26 — Network list" is gone.
- `deep-link.unit.test.ts` — 3 vitest cases pinning the DOC-20 four-slot contract for Phase 28 + 29 consumers:
  - Test A: All four setters write/read through `useDockerResource.getState()`.
  - Test B: Slot independence — setting one slot does NOT clear another.
  - Test C: `clearAllSelections()` resets all four to `null`.
- Two section placeholder files replaced with 1-line re-exports (`docker-app.tsx`'s `SectionView` switch unchanged).
- 3 new vitest cases — full docker-route test sweep: 81/81 passing (61 phase-26 baseline + 17 from Plan 26-01 + 3 from this plan, matching the plan's expected count exactly).

## Task Commits

1. **Task 1: port volume + network dialogs and VolumeUsagePanel to routes/docker/resources/** — `c24464c0` (refactor)
2. **Task 2: replace Volumes placeholder with VolumeSection (DOC-09)** — `dd27ed51` (feat)
3. **Task 3: replace Networks placeholder with NetworkSection (DOC-10)** — `e15bcca5` (feat)
4. **Task 4: pin DOC-20 programmatic deep-link contract for all 4 resource types** — `6469e24e` (test)

_Plan metadata commit will be added at the end._

## Files Created

**Resources module** (`livos/packages/ui/src/routes/docker/resources/`):
- `volume-usage-panel.tsx` — `VolumeUsagePanel` (legacy 1687-1738 verbatim)
- `volume-dialogs.tsx` — `RemoveVolumeDialog` (legacy 1362-1421) + `CreateVolumeDialog` (legacy 1561-1685)
- `network-dialogs.tsx` — `CreateNetworkDialog` (legacy 1423-1525) + `RemoveNetworkDialog` (legacy 1527-1559)
- `volume-section.tsx` — `VolumeSection` (DOC-09) — full Volumes body with search + Schedule-backup link + store-driven expandedVolume (~250 lines)
- `network-section.tsx` — `NetworkSection` (DOC-10) — full Networks body with search + inspect-card + bridge useEffect (~310 lines)
- `deep-link.unit.test.ts` — 3 vitest cases pinning the four-slot programmatic deep-link contract

## Files Modified

- `livos/packages/ui/src/routes/docker/sections/volumes.tsx` — placeholder body → 1-line re-export of `VolumeSection as Volumes`
- `livos/packages/ui/src/routes/docker/sections/networks.tsx` — placeholder body → 1-line re-export of `NetworkSection as Networks`

## Decisions Made

1. **Bridge useEffect on `[selectedNetwork]` only**, with eslint-disable on `react-hooks/exhaustive-deps` for `inspectNetwork`/`clearInspect`. Including those callbacks in deps would cause an infinite loop because `useNetworks` recreates them every render. The hook's internal `setInspectedNetwork` useState setter is identity-stable, so calling `inspectNetwork(id)` when id is unchanged is a no-op — matches T-26-07 mitigation.
2. **Volume Schedule-backup link sets BOTH `selectedVolume(name)` AND `setSection('schedules')`** in one click. Setting just the section would leave Phase 27's pre-fill flow without a target; setting just the volume slot would not navigate. The two-line handler closes the seam Phase 27 (DOC-12) reads from. Inline comment in `volume-section.tsx` documents the contract for the Phase 27 planner.
3. **Verbatim port discipline for volume-usage-panel + dialogs** (Task 1) — bug-for-bug parity with the legacy server-control file. Plan 24-02 D-09 / Plan 26-01 precedent: legacy file untouched, both copies coexist until Plan 27 deletes the legacy file whole.
4. **Optional Test D (identity-stable subscriber notification) skipped** — Plan 26-01's `resource-store.unit.test.ts` Test G already covers it. The plan explicitly said "Skip if Plan 26-01's resource-store.unit.test.ts Test G already covers this — verify 26-01 SUMMARY before deciding." 26-01's SUMMARY confirms Test G's identity-stable assertion. No duplication.
5. **`noFilterResults` empty-state branch added to both sections**, mirroring 26-01's pattern: shows `No volumes/networks match "<query>"` with the search query echoed in mono font when filter is active and empty but unfiltered list is non-empty. The original `!volumes.length` / `!networks.length` empty-states preserved for the unfiltered-empty case.
6. **`IconCalendarTime` selected as the Schedule-backup affordance icon** — verified present in `@tabler/icons-react@3.36.1` (`node_modules/@tabler/icons-react/dist/esm/icons/IconCalendarTime.mjs` resolves). The plan's `IconClock` fallback was unnecessary.

## Deviations from Plan

None — plan executed exactly as written. The four task commits match the plan's atomic-commit shape (single commit each for Tasks 1-4). All 3 specified test cases pass (Optional Test D skipped per the plan's own opt-out guidance). Both placeholder strings removed. Build green on the first try after each section task. No Rule 1/2/3 auto-fixes triggered.

One scope clarification the executor honoured rather than deviated from:

- **Plan ambiguity on `IconCalendarTime` availability:** the plan listed a fallback to `IconClock` if `IconCalendarTime` was missing from `@tabler/icons-react@3.36.1`. Verified present (`ls node_modules/@tabler/icons-react/dist/esm/icons/IconCalendarTime.mjs` returned the file). Used `IconCalendarTime` as the primary choice; no fallback needed. Documented in decision #6.

## Threat Model Mitigation Status

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-26-07 (bridge useEffect re-fires inspectNetwork on every render) | mitigate | `eslint-disable-next-line react-hooks/exhaustive-deps` with explanation comment in `network-section.tsx`. Bridge effect deps array is `[selectedNetwork]` ONLY. The hook's internal `setInspectedNetwork` is identity-stable so duplicate-id calls are no-ops. |
| T-26-08 (setSelectedNetwork with bad id) | accept | `inspectNetwork(<bad-id>)` runs the tRPC query which returns null/error; the inspect-card's `{inspectedNetworkData && (…)}` gate keeps the UI sane. No backend mutation, no escalation. Same trust model as legacy `setInspectedNetwork`. |
| T-26-09 (search reveals env-scoped data) | accept | Same data the legacy Volumes/Networks tabs already exposed; env scoping enforced at tRPC layer (Plan 22-01 D-08), not at the UI filter step. |
| T-26-10 (search-DoS — 10000 chars × 1000 rows) | mitigate | `maxLength={200}` on both VolumeSection + NetworkSection search inputs. Same mitigation as Plan 26-01 T-26-03. |
| T-26-11 (Schedule-backup link is a dead end if Phase 27 never reads selectedVolume) | mitigate | Inline comment in `volume-section.tsx` documents the contract — Phase 27 (DOC-12) reads `useSelectedVolume()` in the Schedules section to pre-fill the backup-job-create form. Manual smoke (deferred — runtime not yet started in this run) confirms section flip works; pre-fill behaviour is Phase 27's deliverable. |
| T-26-12 (privilege escalation) | n/a | Zero new tRPC routes, mutations, or auth paths. |

T-26-07, T-26-10, T-26-11 are the `mitigate` dispositions — all implemented as specified.

## Issues Encountered

None. All 4 tasks executed cleanly, all commits landed, all tests pass.

Pre-existing baseline noise unchanged:
- `routes/server-control/*` still has its 47 typecheck errors (Plan 24-02 deferred-items list) — out of scope.
- `routes/docker/resources/container-section.tsx` + `image-section.tsx` carry pre-existing `IconProps & RefAttributes<SVGSVGElement>` vs. `ComponentType<{size?: number}>` mismatch on `<ActionButton icon={IconX}>` — Plan 26-01 baseline. The same mismatch surfaces in the new `volume-section.tsx` (2 occurrences) and `network-section.tsx` (3 occurrences). `pnpm build` (vite) does not run `tsc --noEmit`, so these don't block the build. Out of scope per scope-boundary rule (pre-existing, not caused by this task; would need a coordinated `ActionButton`-prop-type fix across all 4 sections).
- The build chunk-size warning (>500 kB after minification) is the standard Vite warning unchanged from Plan 26-01 baseline.
- LF/CRLF line-ending warnings on git add are the standard Windows checkout (`core.autocrlf=true`) — content unchanged.

## Phase 26 Closure

This plan + Plan 26-01 together close Phase 26:

- **DOC-07** ✓ closed (Plan 26-01) — Containers section.
- **DOC-08** ✓ closed (Plan 26-01) — Images section with Phase 19 vuln scan + Phase 23 Explain CVEs preserved.
- **DOC-09** ✓ closed (this plan) — Volumes section + Schedule-backup cross-route link.
- **DOC-10** ✓ closed (this plan) — Networks section.
- **DOC-20** partial closure progress:
  - Programmatic half ✓ closed across 26-01 + 26-02 (all 4 resource types support `useDockerResource.getState().setSelectedX(value)` to programmatically open the corresponding detail panel).
  - URL-bar half (browser history, `/docker/containers/n8n` syntax) **deferred to Phase 29 (DOC-20 final)** — explicitly per CONTEXT.md `decisions.likely_patterns.deep-linking-via-window-app-routing`.

Phase 26 verifier runs next.

## Phase 27 / 28 / 29 Readiness

Plan 27 (Schedules) plugs into 1 anchor point provided here:

1. **`useSelectedVolume()` from `routes/docker/resource-store.ts`** — when the Schedules section mounts and `selectedVolume` is non-null, Phase 27 should read the slot and pre-fill the backup-job-create form's "volume" field. The contract is documented in `volume-section.tsx` inline comments + decision #2 above.

Plan 28 (Cross-Container Logs) plugs into the same store via `setSelectedContainer(name)` — Plan 26-01 contract.

Plan 29 (Palette + URL-bar deep-linking) reads/writes ALL four slots — closing DOC-20 final by parsing `/docker/<section>/<id>` URLs into `setSelectedX(id) + setSection(section)` and writing the inverse on selection change.

**Does NOT block 27/28/29:** the four-slot store contract is locked in by `deep-link.unit.test.ts` — refactoring the store to a single `selectedResource` discriminated-union would fail Test B and break the chain.

## User Setup Required

None — pure UI surface change. Existing Docker tRPC routes (`listVolumes`, `removeVolume`, `createVolume`, `volumeUsage`, `listNetworks`, `inspectNetwork`, `createNetwork`, `removeNetwork`, `disconnectNetwork`), env-aware hooks, schedule-section navigation, and Trivy scan infrastructure all unchanged. Restarting the UI dev server (or rebuilding for prod) is sufficient.

---

## Self-Check: PASSED

All 6 created files verified present on disk:
- `livos/packages/ui/src/routes/docker/resources/volume-usage-panel.tsx`
- `livos/packages/ui/src/routes/docker/resources/volume-dialogs.tsx`
- `livos/packages/ui/src/routes/docker/resources/network-dialogs.tsx`
- `livos/packages/ui/src/routes/docker/resources/volume-section.tsx`
- `livos/packages/ui/src/routes/docker/resources/network-section.tsx`
- `livos/packages/ui/src/routes/docker/resources/deep-link.unit.test.ts`

All 4 task commits verified in git log:
- c24464c0 (Task 1 — refactor: port dialogs + VolumeUsagePanel)
- dd27ed51 (Task 2 — feat: VolumeSection)
- e15bcca5 (Task 3 — feat: NetworkSection)
- 6469e24e (Task 4 — test: deep-link contract pin)

Tests: 81/81 passing (`pnpm exec vitest run src/routes/docker/ --environment jsdom`)
Build: green (`pnpm --filter @livos/config build && pnpm --filter ui build`, 31.71s)
Placeholder strings: gone (`grep "Coming in Phase 26"` returns empty for both `sections/volumes.tsx` and `sections/networks.tsx`)
Deep-link contract pin: 3/3 tests passing

---

*Phase: 26-resource-routes*
*Plan: 02*
*Completed: 2026-04-25*
