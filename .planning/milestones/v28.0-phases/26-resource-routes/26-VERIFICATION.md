---
status: human_needed
phase: 26-resource-routes
must_haves_total: 20
must_haves_verified: 20
must_haves_failed: 0
requirement_ids: DOC-07, DOC-08, DOC-09, DOC-10, DOC-20
verified: 2026-04-25T14:25:00Z
human_verification:
  - test: "Detail sheet animation — slide-in from right"
    expected: "ContainerDetailSheet slides smoothly from the right edge when a container row is clicked; closes back to the right when dismissed."
    why_human: "Visual / framer-motion animation behaviour cannot be asserted via static analysis or unit tests."
  - test: "Search responsiveness on large lists"
    expected: "Typing in the Containers/Images/Volumes/Networks search input filters live with no perceptible lag (1000+ row stress)."
    why_human: "Perceived performance under realistic data volume requires runtime + browser observation."
  - test: "Schedule-backup link UX"
    expected: "Clicking IconCalendarTime on a volume row flips the Docker section to Schedules and the Schedules placeholder is shown without flash/jank."
    why_human: "Cross-section navigation feel and Phase 27 pre-fill seam (selectedVolume slot still set on arrival) need eyeball verification post-deploy."
  - test: "AI Diagnose button produces real Phase 23 diagnostic output"
    expected: "Clicking AI Diagnose inside ContainerDetailSheet calls Kimi and renders the diagnostic panel with non-stub content."
    why_human: "Live Kimi API call + rendered diagnostic content must be observed; cannot be unit-tested without mocking the entire flow."
  - test: "Explain CVEs button (Phase 23 carry-over)"
    expected: "After a Trivy scan with HIGH/CRITICAL CVEs, the Explain CVEs button renders an explanation + upgrade-path panel."
    why_human: "Requires live scan data and Kimi response; visual + flow behaviour."
  - test: "Network inspect-card Disconnect mutation"
    expected: "Clicking Disconnect on a connected container in the inspect card fires disconnectNetwork and the inspect card refetches."
    why_human: "Live mutation + refetch flow against running Docker daemon."
  - test: "Programmatic deep-link end-to-end"
    expected: "Browser console: useDockerResource.getState().setSelectedContainer('n8n_server_1') opens detail sheet; same for setSelectedImage / setSelectedVolume / setSelectedNetwork."
    why_human: "Contract is unit-test-pinned (deep-link.unit.test.ts) but the section-level rendering side-effect requires runtime observation."
---

# Phase 26: Resource Routes Verification Report

**Phase Goal:** Migrate the four most-used resource lists (Containers / Images / Volumes / Networks) from horizontal tabs in legacy Server Control to dedicated sections in the v28.0 Docker app, with programmatic deep-linking state.
**Verified:** 2026-04-25T14:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                       | Status     | Evidence                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Containers entry shows live container list                                                                                  | VERIFIED   | container-section.tsx L145 `useContainers()` + filtered table; sections/containers.tsx re-exports as `Containers`                                  |
| 2   | Search filters Containers list client-side                                                                                  | VERIFIED   | container-section.tsx L150 `searchQuery` state + L224 `filterByQuery(containers, searchQuery, c => c.name + ' ' + c.image)`                        |
| 3   | Container row click opens ContainerDetailSheet sliding right                                                                | VERIFIED   | container-section.tsx L325/L433 onClick → `setSelectedContainer(name)`; L722 `<ContainerDetailSheet>` open driven by store                         |
| 4   | AI Diagnose button works on detail sheet (Phase 23 carry-over)                                                              | VERIFIED   | container-detail-sheet.tsx L24 `useAiDiagnostics`, L322 `diagnoseContainer({name})`, L326 "AI Diagnose" label — unchanged                          |
| 5   | Container actions (start/stop/restart/pause/unpause/kill/remove) execute via useContainers + refetch                        | VERIFIED   | container-section.tsx imports `manage`, `bulkManage`, `refetch` from useContainers (Phase 22 hook); legacy action-row port verbatim                |
| 6   | Env switch causes Containers list refetch                                                                                   | VERIFIED   | useContainers is env-aware (Phase 22 D-08, env-scoped at tRPC layer per Plan 22-01)                                                                |
| 7   | Images entry shows live image list                                                                                          | VERIFIED   | image-section.tsx L62-67 `useImages()` destructure + filtered table; sections/images.tsx re-exports as `Images`                                    |
| 8   | Search filters Images list by repo:tag                                                                                      | VERIFIED   | image-section.tsx L72 searchQuery + L82 `filterByQuery(images, searchQuery, img => img.repoTags.join(' '))`                                        |
| 9   | Image row expands inline panels (Layer history + Vulnerabilities; Scan + Explain CVEs preserved)                            | VERIFIED   | image-section.tsx L271 `<ImageHistoryPanel>`, L274 `<ScanResultPanel>`; scan-result-panel.tsx L48 `explainVulnerabilities`, L160 "Explain CVEs"     |
| 10  | Programmatic deep-link: setSelectedContainer opens detail sheet                                                             | VERIFIED   | resource-store.ts L33-49 store + setter; deep-link.unit.test.ts Test A locks contract; container-section.tsx L147 reads useSelectedContainer       |
| 11  | Programmatic deep-link: setSelectedImage expands image row                                                                  | VERIFIED   | resource-store.ts L39 setter; image-section.tsx L69 `expandedImage = useSelectedImage()`; L70 setExpandedImage                                     |
| 12  | Volumes entry shows live volume list                                                                                        | VERIFIED   | volume-section.tsx L56 `useVolumes()`; sections/volumes.tsx re-exports as `Volumes`                                                                |
| 13  | Search filters Volumes list by name                                                                                         | VERIFIED   | volume-section.tsx L62 searchQuery + L66 `filterByQuery(volumes, searchQuery, v => v.name)`                                                        |
| 14  | Volume chevron expands inline VolumeUsagePanel                                                                              | VERIFIED   | volume-section.tsx L217 `<VolumeUsagePanel volumeName={volume.name}>`; volume-usage-panel.tsx ports legacy 1687-1738                                |
| 15  | Volume rows have "Schedule backup" link that flips Docker section to schedules                                              | VERIFIED   | volume-section.tsx L60 useSetDockerSection; L70-77 onScheduleBackup sets selectedVolume + setSection('schedules'); L200 ActionButton onClick wired |
| 16  | Networks entry shows live network list                                                                                      | VERIFIED   | network-section.tsx L25 useNetworks + L56 destructure; sections/networks.tsx re-exports as `Networks`                                              |
| 17  | Search filters Networks list by name + driver                                                                               | VERIFIED   | network-section.tsx L84 `filterByQuery(networks, searchQuery, n => \`${n.name} ${n.driver}\`)`                                                     |
| 18  | Network inspect icon opens inspect card with connected containers + Disconnect button                                       | VERIFIED   | network-section.tsx L199 onClick → setSelectedNetwork(network.id); L223 `{inspectedNetworkData && ...}`; L273 disconnectNetwork wired              |
| 19  | Programmatic deep-link: setSelectedVolume auto-expands volume row                                                           | VERIFIED   | resource-store.ts L40 setter; volume-section.tsx L58 useSelectedVolume reads slot; deep-link.unit.test.ts Test A pins contract                     |
| 20  | Programmatic deep-link: setSelectedNetwork opens inspect card via bridge useEffect                                          | VERIFIED   | network-section.tsx L79-82 bridge `useEffect(() => { if(sel) inspectNetwork(sel) else clearInspect() }, [selectedNetwork])`                        |

**Score:** 20/20 truths verified

### Required Artifacts

| Artifact                                                                       | Expected                                                       | Status   | Details                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `livos/packages/ui/src/routes/docker/resource-store.ts`                        | useDockerResource zustand + 4 slots + setters + 4 selectors    | VERIFIED | 57 lines; exports useDockerResource + 4 selector hooks + ResourceStore type + clearAllSelections |
| `livos/packages/ui/src/routes/docker/resources/container-section.tsx`          | Full Containers body + search + detail sheet wiring            | VERIFIED | 739 lines; full body extracted, search added, store wired                                     |
| `livos/packages/ui/src/routes/docker/resources/image-section.tsx`              | Full Images body + search + Scan/Explain CVEs                  | VERIFIED | 345 lines; search + expand-row + dialogs + ImageHistoryPanel + ScanResultPanel                |
| `livos/packages/ui/src/routes/docker/resources/image-history-panel.tsx`       | Ported ImageHistoryPanel                                       | VERIFIED | 84 lines; verbatim port from legacy 1294-1359                                                  |
| `livos/packages/ui/src/routes/docker/resources/scan-result-panel.tsx`         | Ported ScanResultPanel with Phase 19 + 23                      | VERIFIED | 275 lines; useImages.scanImage + useAiDiagnostics.explainVulnerabilities preserved             |
| `livos/packages/ui/src/routes/docker/resources/volume-section.tsx`            | Full Volumes body + search + Schedule-backup                   | VERIFIED | 255 lines; search + chevron-expand + onScheduleBackup wired                                    |
| `livos/packages/ui/src/routes/docker/resources/network-section.tsx`           | Full Networks body + search + inspect-card + bridge useEffect  | VERIFIED | 313 lines; bridge useEffect wires store → inspectNetwork                                       |
| `livos/packages/ui/src/routes/docker/resources/volume-usage-panel.tsx`        | Ported VolumeUsagePanel                                        | VERIFIED | 63 lines; verbatim port from legacy 1687-1738                                                   |
| `livos/packages/ui/src/routes/docker/resources/deep-link.unit.test.ts`        | 3 vitest cases pinning DOC-20 contract                          | VERIFIED | 101 lines; 3/3 tests passing (A: writes, B: independence, C: clearAll)                         |
| `livos/packages/ui/src/routes/docker/sections/containers.tsx`                  | Re-export of ContainerSection                                   | VERIFIED | 6 lines; `export {ContainerSection as Containers}` from resources                              |
| `livos/packages/ui/src/routes/docker/sections/images.tsx`                      | Re-export of ImageSection                                       | VERIFIED | 6 lines                                                                                       |
| `livos/packages/ui/src/routes/docker/sections/volumes.tsx`                     | Re-export of VolumeSection                                      | VERIFIED | 6 lines                                                                                       |
| `livos/packages/ui/src/routes/docker/sections/networks.tsx`                    | Re-export of NetworkSection                                     | VERIFIED | 6 lines                                                                                       |

### Key Link Verification

| From                       | To                                | Via                                            | Status | Details                                                              |
| -------------------------- | --------------------------------- | ---------------------------------------------- | ------ | -------------------------------------------------------------------- |
| container-section          | resource-store.ts                 | useSelectedContainer + setSelectedContainer    | WIRED  | Lines 60, 147, 148                                                   |
| container-section          | container-detail-sheet.tsx        | <ContainerDetailSheet> import                  | WIRED  | Line 44 import + L722 JSX                                            |
| container-section          | use-containers.ts                 | useContainers() (env-aware)                    | WIRED  | Line 42 import + L145 destructure                                    |
| image-section              | use-images.ts                     | useImages() (env-aware)                        | WIRED  | Line 31 import + L62-67 destructure                                  |
| scan-result-panel          | use-ai-diagnostics.ts             | useAiDiagnostics().explainVulnerabilities      | WIRED  | Line 15 import + L48 destructure + L148 invocation                   |
| volume-section             | resource-store.ts                 | useSelectedVolume + setSelectedVolume          | WIRED  | Line 35 import + L58, L59                                            |
| volume-section             | docker/store.ts                   | useSetDockerSection                            | WIRED  | Line 60 + L76 `setSection('schedules')`                              |
| volume-section             | use-volumes.ts                    | useVolumes() (env-aware)                       | WIRED  | Line 29 import + L56 destructure                                     |
| network-section            | resource-store.ts                 | useSelectedNetwork + setSelectedNetwork        | WIRED  | Line 31 import + L58, L59                                            |
| network-section            | use-networks.ts                   | useNetworks() (env-aware) + bridge effect      | WIRED  | Line 25 import + L56 destructure + L79-82 bridge useEffect           |
| sections/{c,i,v,n}.tsx     | resources/{c,i,v,n}-section.tsx   | re-export                                      | WIRED  | All four sections are 6-line re-export files pointing at ../resources/ |

### Data-Flow Trace (Level 4)

| Artifact                  | Data Variable             | Source                                                | Produces Real Data | Status   |
| ------------------------- | ------------------------- | ----------------------------------------------------- | ------------------ | -------- |
| container-section.tsx     | filteredContainers        | useContainers() → tRPC docker.listContainers          | Yes (env-scoped)   | FLOWING  |
| image-section.tsx         | filteredImages            | useImages() → tRPC docker.listImages                  | Yes (env-scoped)   | FLOWING  |
| volume-section.tsx        | filteredVolumes           | useVolumes() → tRPC docker.listVolumes                | Yes (env-scoped)   | FLOWING  |
| network-section.tsx       | filteredNetworks          | useNetworks() → tRPC docker.listNetworks              | Yes (env-scoped)   | FLOWING  |
| network-section.tsx       | inspectedNetworkData      | bridge useEffect → inspectNetwork → tRPC inspectNetwork | Yes              | FLOWING  |
| scan-result-panel.tsx     | scanResult                | useImages().scanImage → tRPC docker.scanImage (Trivy) | Yes (Phase 19)     | FLOWING  |
| container-detail-sheet    | diagnose result           | useAiDiagnostics().diagnoseContainer → Kimi (Phase 23) | Yes              | FLOWING  |

### Behavioral Spot-Checks

| Behavior                          | Command                                                                       | Result                                                       | Status |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| Phase 26 vitest suite passes      | `pnpm exec vitest run src/routes/docker/ --environment jsdom`                 | 12 test files, 81 tests passed                              | PASS   |
| UI build green                    | `pnpm --filter ui build`                                                      | "built in 31.63s", PWA precache 193 entries                  | PASS   |
| Placeholder strings removed       | `grep -r "Coming in Phase 26" src/routes/docker/sections/`                    | No files found                                              | PASS   |
| Legacy server-control untouched   | `git diff 4750bf70^..465662f8 -- routes/server-control/index.tsx --stat`      | Empty output (no diff)                                      | PASS   |
| 11 commits in expected range      | `git log --oneline 4750bf70^..465662f8`                                       | 11 commits from RED through plan-metadata                    | PASS   |
| Deep-link test pins 4-slot contract | `pnpm exec vitest run src/routes/docker/resources/deep-link.unit.test.ts`   | 3/3 tests passing (Tests A, B, C)                            | PASS   |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                                                 | Status    | Evidence                                                                                                                            |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| DOC-07      | 26-01       | `/docker/containers` — full container list as own route; detail sheet slides from right                                                     | SATISFIED | container-section.tsx + sections/containers.tsx + ContainerDetailSheet wired through store                                          |
| DOC-08      | 26-01       | `/docker/images` — full image list with Scan + Explain CVEs                                                                                 | SATISFIED | image-section.tsx + ScanResultPanel preserves Phase 19 scan + Phase 23 explainVulnerabilities                                       |
| DOC-09      | 26-02       | `/docker/volumes` — full volume list as own route; backup config link to Schedules                                                          | SATISFIED | volume-section.tsx + onScheduleBackup → useSetDockerSection('schedules') with selectedVolume slot retained for Phase 27 pre-fill    |
| DOC-10      | 26-02       | `/docker/networks` — full network list as own route                                                                                         | SATISFIED | network-section.tsx + inspect card + Disconnect mutation + bridge useEffect                                                         |
| DOC-20      | 26-01 + 26-02 | All resource routes support deep-linking (programmatic half this phase; URL-bar form Phase 29)                                            | SATISFIED | resource-store.ts 4-slot + 4 setters + deep-link.unit.test.ts pins contract; consumed by all 4 sections; URL-bar deferred to P29   |

### Anti-Patterns Found

| File                  | Line | Pattern | Severity | Impact |
| --------------------- | ---- | ------- | -------- | ------ |

None found — code review and grep across phase 26 modified files surfaced no TODO/FIXME/PLACEHOLDER, no `return null` stubs, no hardcoded empty data feeding render output. The pre-existing typecheck noise in routes/server-control/* is documented in 26-02 SUMMARY as out-of-scope baseline (Plan 24-02 deferred-items list).

### Human Verification Required

The following claims are coded correctly (wiring + data flow + tests pass) but require runtime observation post-deploy to confirm visual UX quality and live API integrations:

1. **Detail sheet animation** — slide-in from right when row clicked, slide-out on close (framer-motion behaviour cannot be statically asserted).
2. **Search responsiveness** — perceived lag on 1000+ row stress test (perceived performance is environmental).
3. **Schedule-backup link UX** — section flip to Schedules without flash/jank, plus Phase 27 pre-fill seam works on arrival.
4. **AI Diagnose live output** — Kimi API call from container detail sheet renders non-stub diagnostic content.
5. **Explain CVEs live output** — Kimi explanation panel after Trivy scan returns HIGH/CRITICAL CVEs.
6. **Network inspect-card Disconnect mutation** — fires disconnectNetwork tRPC and inspect card refetches with updated container list.
7. **Programmatic deep-link end-to-end** — `useDockerResource.getState().setSelectedX(value)` from browser console actually triggers the section-level rendering side-effect (contract is unit-test-pinned, but section observation requires runtime).

### Gaps Summary

No gaps. All 20 observable truths verified, all 13 artifacts exist with substantive content (≥57 lines for the smallest non-section file), all 11 key links wired, all 7 data-flow traces flowing, all 6 behavioural spot-checks pass.

Phase 26 ships the programmatic half of DOC-20 with a unit-test-pinned 4-slot contract that Phase 28 (cross-container logs deep-link) and Phase 29 (palette + URL-bar form) will consume. Legacy `routes/server-control/index.tsx` remains untouched in Phase 26 commit range — Phase 27 owns the file delete after Stacks migration.

Status `human_needed` reflects 7 visual/runtime claims that warrant eyeball verification post-deploy. The coded contract is verified-passing.

---

_Verified: 2026-04-25T14:25:00Z_
_Verifier: Claude (gsd-verifier)_
