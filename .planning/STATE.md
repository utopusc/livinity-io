---
gsd_state_version: 1.0
milestone: v28.0
milestone_name: Docker Management UI
current_plan: Not started
status: verifying
stopped_at: Completed 28-01-PLAN.md — Cross-container Logs section live (DOC-13). Multiplexed WS + grep + severity + live-tail; WS handler env-aware via getDockerClient. Plan 28-02 unblocked.
last_updated: "2026-04-25T22:32:39.839Z"
last_activity: 2026-04-25
progress:
  total_phases: 13
  completed_phases: 4
  total_plans: 10
  completed_plans: 9
  percent: 90
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-25)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v28.0 — Docker Management UI (Dockhand-Style)
**Current focus:** Phase 28-01 COMPLETE — Cross-container Logs section live (DOC-13). Multiplexed WS pattern (one socket per checked container) against env-aware /ws/docker/logs handler. Deterministic per-container color stripes + [name] prefixes + regex grep + ERROR/WARN/INFO/DEBUG severity filter + live-tail toggle. Bare-bones virtualizer (no react-window dep). 4 pure helpers + 26 unit tests. Plan 28-02 (Activity Timeline) consumes patterns established here.

## Current Position

Phase: 28
Plan: 2 of 2 complete
Current Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-04-25

**Progress:** [█████████░] 90%

## v28.0 Phase Structure

| Phase | Name | Requirements | Depends On |
|-------|------|--------------|------------|
| 24 | Docker App Skeleton | DOC-01, DOC-02, DOC-03 | — (foundation) |
| 25 | Multi-Environment Dashboard | DOC-04, DOC-05, DOC-06 | Phase 24, v27 Phase 22 |
| 26 | Resource Routes (Containers/Images/Volumes/Networks) | DOC-07/08/09/10, DOC-20 partial | Phase 24 |
| 27 | Stacks + Schedules Routes | DOC-11, DOC-12 | Phase 24, v27 Phase 20+21 |
| 28 | Cross-Container Logs + Activity Timeline | DOC-13, DOC-14 | Phase 24, v27 Phase 17+20+23 |
| 29 | Shell + Registry + Palette + Docker Settings | DOC-15..DOC-20 | Phase 24, v27 Phase 17+21 |

Coverage: 20/20 v28.0 requirements mapped ✓
Backend: 0 new modules (consumes v27.0 tRPC routes); v28.0 is UI restructure only.

## Performance Metrics

| Phase-Plan | Duration | Tasks | Files | Completed |
|------------|----------|-------|-------|-----------|
| 17-01 | 7 min | 4 | 9 | 2026-04-24 |
| 17-02 | 8 min | 4 | 7 | 2026-04-24 |
| 18-01 | 6 min | 3 (+1 fixup) | 4 | 2026-04-24 |
| 18-02 | 6 min | 2 (+1 deviation) | 3 | 2026-04-24 |
| 19-01 | 5 min | 2 | 4 | 2026-04-24 |
| 19-02 | 7 min | 2 | 6 | 2026-04-24 |
| 20-01 | 5 min | 3 | 8 | 2026-04-24 |
| 20-02 | 12 min | 3 | 10 | 2026-04-24 |
| 21-01 | 6 min | 4 | 9 | 2026-04-24 |
| 21-02 | 4 min | 2 | 3 | 2026-04-25 |
| 22-01 | 16 min | 3 | 11 | 2026-04-25 |
| 22-02 | 14 min | 3 | 13 | 2026-04-25 |

| 22-03 | 20 min | 3 | 25 | 2026-04-25 |
| 23-01 | 10 min | 5 (+1 TDD) | 8 | 2026-04-25 |
| 23-02 | 11 min | 4 (+1 TDD) | 12 | 2026-04-25 |
| 24-01 | 11 min | 3 (+1 TDD) | 22 created + 10 modified | 2026-04-25 |
| 24-02 | 10 min | 4 (+1 TDD) | 8 created + 3 modified | 2026-04-25 |
| 25-01 | 7 min | 3 (5 commits, 2× TDD) | 5 created + 6 modified | 2026-04-25 |
| 25-02 | 9 min | 3 (5 commits, 2× TDD) | 7 created + 4 modified | 2026-04-25 |
| 26-01 | 10 min | 4 (5 commits, 1× TDD) | 16 created + 2 modified | 2026-04-25 |

**Prior milestone (v26.0 — Device Security & User Isolation):**
| Phase 11-16 | 6 phases | 11 plans | 15/15 requirements satisfied |
| Audit: passed (42/42 must-haves, 4 attack vectors blocked, auto-approve constraint preserved) |
| Phase 26 P01 | 10min | 4 tasks | 16 created + 2 modified files |
| Phase 26 P02 | 8min | 4 (4 commits) tasks | 6 created + 2 modified files |
| Phase 27 P01 | 6 | 2 tasks | 8 files |
| Phase 27 P02 | 10 | 4 tasks | 10 files |
| Phase 28 P01 | 14 | 3 tasks | 16 files |

## Accumulated Context

### Plan 24-01 Decisions (2026-04-25)

- Theme scoped to /routes/docker via useDockerTheme(rootRef) — NOT promoted to document.documentElement. Other LivOS components keep rendering in light mode unchanged. Promote when v29.0 rolls dark mode app-wide. Hook signature: `useDockerTheme(rootRef?: RefObject<HTMLElement>)` — applies dark/light class to rootRef.current OR document.documentElement when ref omitted; useEffect cleanup REMOVES the class on unmount.
- Section navigation = zustand store (NOT URL routing). Deep-linking is the explicit deliverable of Plan 26-01 (DOC-20). The `'/docker'` string passed to openWindow is just an `initialRoute` prop — never consumed by react-router. window-app pattern (router.tsx line 47-48: "AI pages... are window-only").
- vitest@2.1.2 + jsdom@25 added to UI devDeps. UI had no test runner; livinityd uses vitest for *.unit.test.ts files. Carries the convention forward. `--ignore-scripts` flag required on Windows due to pre-existing postinstall using Unix mkdir -p / cp -r (Plan 19-01 documented the same quirk).
- SectionId union + SECTION_IDS array + SECTION_META record + exhaustive SectionView switch in DockerApp — adding/removing a section is a 4-place compile-enforced change (union, array, meta, switch). Pattern reusable for any future window-app with sidebar navigation.
- ServerControlWindowContent import retained behind eslint-disable-next-line for one-phase rollback safety. Routes/server-control directory stays on disk for content migration in Phases 25-29. Final delete is Plan 27 SUMMARY action (DOC-03 partial closure here, full closure in 27).
- Persistence keys: `livos:docker:theme` (theme mode) + `livos:docker:sidebar-collapsed` (zustand partialize persists BOTH section and sidebarCollapsed in one entry). Naming follows Phase 22-02 D-01 precedent (`livos:selectedEnvironmentId`).
- Custom Sidebar primitive (Tailwind + Radix Tooltip), NOT shadcn Sidebar — verified shadcn-components/ui has no sidebar.tsx. Building one would be larger scope than required for Phase 24 skeleton.
- Cross-check grep uncovered 4 additional pre-existing LIVINITY_server-control references beyond the plan's listed 6 files: window-manager.tsx (DEFAULT_WINDOW_SIZES key — affects window size), dock-item.tsx (DOCK_LABELS + DOCK_ICONS map — affects dock tooltip+icon), apple-spotlight.tsx (Spotlight 'Server' launcher — would crash openWindow on click). All renamed to LIVINITY_docker per Rule 3 auto-fix.
- darkMode: 'class' triggers TS2352 message change in stories/tailwind.tsx. The `as Config` cast error was pre-existing (without darkMode); adding the field changes the message wording only. Out of scope per scope-boundary rule (livos/packages/ui stories tree not in production bundle).
- Plan 24-02 integration surface: (1) StatusBar mounts as FIRST child of <main> in DockerApp (above the SectionView wrapper); (2) useDockerTheme exposes setMode for the StatusBar's light/dark/system cycle button; (3) Sidebar header height h-12 (48px) — StatusBar should match for visual alignment.

### Plan 24-02 Decisions (2026-04-25)

- WS connection state: 1s polling of `wsClient.getConnection()?.readyState` over `addEventListener('open'/'close')`. tRPC v11's TRPCWebSocketClient recreates the underlying WebSocket on reconnect, so addEventListener references registered against the initial WS go stale after the first reconnect. Polling readyState always reads the current instance and is the simpler correct approach for v1; Phase 29 polish task can swap for a proper observable once tRPC v12 ships `.getConnection()` on the public type. `(wsClient as unknown as {getConnection?: () => WebSocket | undefined})` cast required because tRPC v11 keeps the method off the public type — JSDoc documents removal on v12 upgrade.
- Refactored `useDockerTheme(rootRef?)` so the no-arg path is read-only (no DOM mutation) AND added cross-instance sync via `storage` event (cross-tab) + custom `livos:docker:theme-changed` window event (same-tab). Plan 24-01 always-mutated `document.documentElement` when no rootRef was supplied, but Plan 24-02's ThemeToggle calls useDockerTheme() to read mode + write setMode WITHOUT mutating the DOM (DockerApp's own rootRef-bound hook owns DOM mutation). `setMode` writes localStorage AND dispatches the custom event so ALL hook instances re-read. Reconciliation per Plan 24-02 Task 2 NOTE ("If Plan 24-01 implemented it differently, the executor reconciles by editing theme.ts here AND noting in commit body").
- Free disk + uptime sourced from existing `system.systemDiskUsage` + `system.uptime` tRPC routes — zero `docker.engineInfo` extension needed. Routes existed at `livinityd/source/modules/system/routes.ts:47, 107`. Status bar refetch interval: 30s for both (uptime/disk are slow-moving), 1s for time/Live indicator (clock + WS state).
- EnvironmentSelector + AlertsBell cross-imported VERBATIM from `routes/server-control/` into the new Docker StatusBar. Cross-route imports during the v28.0 transition are correct — Plan 27 will relocate both files into `routes/docker/` once the legacy server-control directory is fully decommissioned. Same-tree alternative (duplicate-and-rename) would cause divergence; cross-import is the lower-risk choice.
- IconHardDrive doesn't exist in `@tabler/icons-react@3.36.1`; substituted IconDeviceSdCard for the free-disk pill (storage-themed). Pill icon prop typed as `Icon` (the tabler ForwardRefExoticComponent alias) instead of bare `React.ComponentType<{size?, className?}>` — same fix Plan 24-01 sidebar.tsx applied.
- Time pill via dedicated `useNow()` hook so 1s re-renders are scoped to the StatusBar — Sidebar / SectionView don't import this hook so they don't re-render on every tick. `useTrpcConnection()` follows the same scoping principle.
- StatusBar layout: sticky `top-0 z-10 h-12` (matches Sidebar header `h-12` for visual alignment with the sidebar/main divide). Inner pill row uses `flex min-w-0 flex-1 overflow-x-auto` so pills overflow horizontally on narrow screens; the right-side controls (Search/AlertsBell/ThemeToggle) stay visible thanks to `shrink-0`.
- Smoke chain test for layout files: when render-level testing requires heavy mocking (tRPC + WS + zustand), instead lock down the strings the layout file consumes via formatter-chain assertions. The behavioural module's own tests guard against regressions. Pattern reusable for future Phase 25-29 chrome additions.
- DOC-01 + DOC-02 + DOC-03 fully closed at end of Phase 24. Legacy Server Control file kept on disk for piecemeal content migration in Phases 25-29; in-component header replaced with deprecation banner; full file delete deferred to Plan 27 once Stacks migration consumes the last reusable code chunks (ContainerCreateForm, ContainerDetailSheet, ComposeGraphViewer, DomainsTab still imported lazily). Phase 25 (Multi-Environment Dashboard) is unblocked.

### Plan 25-01 Decisions (2026-04-25)

- Polling cadence per Plan 25-01 constraints, NOT a flat 5s: containers 5s (most dynamic), events 10s (recent activity), images/stacks/volumes/networks 30s (static counts). listImages on a 357-image env is too expensive at 5s (Plan 22-01 D-06 / Dockhand precedent). staleTime is half each interval so React Query doesn't fire dup-fetches on focus.
- No new tRPC route — UI composes 6 per-env tRPC hooks client-side via useEnvCardData(envId). CONTEXT.md `decisions` permitted a single docker.dashboardSnapshot route if multi-env fanout (5+ envs × 6 polls each) showed strain; for v1 (typical 1-3 envs) per-resource queries are sufficient AND the existing v22.x routes are already env-aware. T-25-04 register entry tracks the re-eval threshold.
- CPU/memory aggregate pill DEFERRED to Plan 25-02 (or later). Requires per-container stats fanout (docker stats stream) which the polling loop doesn't yet do. CONTEXT.md `specifics` blesses text-only metrics for Phase 25. EnvCard's 2x2 stats grid contains only Images/Stacks/Volumes/Networks — Plan 25-02 may add a 3-column row above OR extend to 2x3, both pure-addition layouts.
- Event verb mapping: 22 docker actions in EVENT_VERB_MAP, unmapped actions echo verbatim via `formatEventVerb`. Defensive against future Docker minor releases that might emit new actions ('oom_kill', 'attach', etc.) — better to show raw than crash the card.
- Card click writes BOTH useEnvironmentStore AND useDockerStore in a single handler tick (imperative .getState().setX()) — scopes the rest of the app to the clicked env AND auto-jumps to the containers section. Single store write would leave user staring at same card highlighted; double write matches Dockhand UX where clicking a card "enters" that env.
- Tags column DEFAULT '{}' (empty PG array literal) NOT NULL — Environment.tags type is `string[]` (never undefined post-bootstrap). rowToEnvironment maps `row.tags ?? []` defensively even though PG guarantees an array (mirrors 22-01 D-04 alias-resolution defensiveness).
- Tags Zod schema: `z.array(z.string().min(1).max(50)).max(20).optional()` — bounds total tag count to 20 and per-tag length to 50 chars. T-25-01 mitigation: prevents DoS via 10k-element arrays AND bounds row size.
- Health derivation: 'paused' + 'restarting' count toward 'unhealthy' banner; 'exited'/'dead'/'created' do NOT (operators routinely keep stopped containers around — flagging them red would create false alarms). 'isError' (containers query failed) → red 'Unreachable' banner. Empty container list → neutral zinc 'No containers' banner.
- Type inference for Environment in UI: derived via `RouterOutput['docker']['listEnvironments'][number]` (added Environment type export to use-environments.ts). Single source of truth — avoids duplicating the Environment shape between UI and livinityd. Pattern carried forward from features/backups types.
- Schema migration via wrapped DO block: `DO $$ BEGIN ALTER TABLE … ADD COLUMN IF NOT EXISTS … END$$;` — matches the existing device_audit_log_no_modify trigger pattern. No separate migration runner needed (livinityd reads schema.sql at boot and pool.query() executes the entire file). Pattern reusable for any future column addition.
- TDD execution: Tasks 1+2 split into RED (test commits 4f5b7027, a0ffb73b) + GREEN (feat commits ee16d187, 07a2d5d6); Task 3 (layout files) ships as a single feat commit 9c210d26 per Plan 25-01 Task 3 `<behavior>` waiver (matches Plan 24-02 D-12 'smoke chain test for layout files' precedent — heavy mocking required for render tests; behaviour lives in extracted modules covered by Tasks 1+2). 5 task commits total + metadata commit.
- Pattern carried forward to Plan 25-02 + Phase 26: per-env query composition (useEnvCardData(envId)) accepts an explicit envId override; reusable for any panel that should display ITS OWN env's metrics regardless of the global selection (Phase 26 detail pages, Phase 28 cross-env logs aggregator, Plan 25-02 Top-CPU panel union across all envs).

### Plan 26-01 Decisions (2026-04-25)

- useDockerResource zustand store with 4 slots (selectedContainer/Image/Volume/Network) — single store, NOT 4 mini-stores. Single subscribe-cost for components consuming multiple slots; matches Plan 24-01 useDockerStore pattern. Plan 26-02 reuses volume + network slots already declared up-front — single source of truth, no store rev needed for 26-02.
- NO persist middleware on resource-store. Detail-panel-open state is conversational, not preferential. Re-opening the Docker window with a stale detail panel violates least-surprise (vs. useDockerStore which DOES persist section nav, since that IS preferential).
- Explicit selector hooks (useSelectedContainer/Image/Volume/Network) instead of consumers calling useDockerResource((s) => s.X). Reasons: (1) ContainerSection should NOT re-render when selectedImage changes — explicit hooks document the slice + bound the subscription scope; (2) matches Plan 24-01 SECTION_META + selector-hook pattern.
- filterByQuery<T> empty-string returns SAME array reference (perf win — consumers can skip useMemo when search inactive). Case-insensitive trimmed substring match for non-empty queries. Pure generic — no React, runs cleanly under jsdom-or-node.
- Search inputs maxLength={200} per threat T-26-03 — defensive DoS bound on filterByQuery query length. Legacy Containers + Images tabs had no search input at all; Plan 26-01 adds them per phase success criterion 6 + CONTEXT.md decisions.likely_patterns.search.
- Selection helpers (toggleSelectAll) operate on `containers` (full set) NOT `filteredContainers` so 'select all' under an active filter selects every visible row in the unfiltered list. The bulk action bar surfaces the count regardless of filter state — keeps bulk semantics predictable across filter toggles.
- Cross-imports from routes/server-control/* (ContainerCreateForm, ContainerDetailSheet) intentional during v28 transition — Plan 24-02 D-09 precedent for EnvironmentSelector + AlertsBell. Helpers (ActionButton/StateBadge/ImageHistoryPanel/ScanResultPanel) duplicated to routes/docker/resources/ — Plan 27 will collapse the duplication after legacy file delete.
- Four legacy file-local image dialogs (RemoveImage/Prune/Pull/Tag) were never exported from server-control/index.tsx. Ported into resources/image-dialogs.tsx as a single file (4 components, ~200 lines). Those copies become canonical after Plan 27 file deletion. RenameDialog ported into its own file for symmetry; RemoveDialog inlined into container-section.tsx since Containers is the only consumer.
- formatBytes canonical Docker-app location at resources/format-bytes.ts; back-compat re-export from hooks/use-images.ts retained — existing legacy + Plan 25 dashboard imports keep working. Plan 27 may collapse the duplicate after server-control deletion when no consumer imports from hooks/ anymore.
- DOC-20 programmatic deep-link half closed for containers + images via useDockerResource.getState().setSelectedContainer(name) / setSelectedImage(id). URL-bar form deferred to Phase 29 (DOC-20 final). Plan 28 cross-container logs deep-link will use this same store API. Volumes + Networks slots already exposed for Plan 26-02 + future Phase 28/29 consumers.
- TDD execution: Task 1 split into RED (test commit 4750bf70 — 17 failing-import tests) + GREEN (feat commit 3bc81521 — 4 source files). Tasks 2-4 single commits per Plan 26-01 task `<action>` blocks (verbatim ports + section composition; testable logic lives in Task 1's helpers). 5 task commits total.

### Plan 28-01 Decisions (2026-04-25)

- WS handler envId extension via per-request `getDockerClient(envId)` instead of module-scope `new Dockerode()`. Empty/missing envId → local socket fallback. Phase 17 ContainerDetailSheet LogsTab back-compat preserved without code changes (it doesn't pass envId, parseLogsParams returns null, `getDockerClient(null)` returns local). Agent envs return `1011 'Agent envs not yet supported for logs'` close — honest failure mode beats silent fallback. `[env-not-found]` → 1008 close. Other infrastructural errors propagate as generic 1011, NOT a silent fallback to local (would hide the misconfiguration).
- Multiplex cap = 25 sockets in `useMultiplexedLogs` (T-28-02 mitigation). `includedNames.slice(0, 25)` + `truncated: boolean` returned from the hook + amber banner in LogsViewer when truncated. Hard cap chosen over soft warning per the threat register entry.
- Bare-bones virtualizer (~80 lines) instead of adding `react-window`. ResizeObserver-driven `viewportHeight` + `requestAnimationFrame` live-tail snap-to-bottom + 4px scroll-up tolerance for Dockhand UX parity (manual scroll up auto-disables live-tail). Reusable pattern for any future large-list surface where adding a dep feels heavy.
- NO ANSI parsing in cross-container LogsViewer. Plain-text rendering only. The xterm-based per-container LogsTab in ContainerDetailSheet (Phase 17 QW-01) stays the canonical drilldown for ANSI-colored single-container logs. ANSI escape codes here render as visible garbage — acceptable v1 trade-off, documented in `logs-viewer.tsx` header comment AND in 28-CONTEXT.md decisions. Phase 28-02 + Phase 29 inherit the same plain-text-aggregator-vs-xterm-drilldown split.
- 100ms `setLines` throttle window in `useMultiplexedLogs` — coalesces all chunks within the window into one `setState` call. `setTimeout` (NOT `requestAnimationFrame`) so background tabs still flush. Critical for streams >20 lines/sec (without throttling, every chunk would re-render the React tree). Pattern reusable for any high-frequency WS-driven setState in Phase 28-02 (dockerEvents subscription) or Phase 29 (multi-container exec).
- Severity classifier uses single regex per level anchored to `\b` word boundaries; ERROR-first precedence so multi-keyword lines classify as the more severe one. Returns null for unrecognized lines (intentional — false positives are worse than false negatives in a UI filter user can toggle off). Patterns: `\b(error|err|fatal|panic|exception|failed|critical|crit)\b/i` etc.
- `pushBounded(buf, item, cap)` returns a NEW array (immutable shape so React detects setState via reference equality). At-or-over capacity drops oldest enough to fit. Defensive: handles upstream callers handing an over-cap buffer without growing the leak.
- `selectedNames` is local component state in `LogsSection` (NOT zustand). Conversational, like the resource-store pattern. Reset on env change (so checkboxes don't reference containers from previous env). Drops stale selections when a checked container stops running (mirrors container-section.tsx pattern).
- `useMultiplexedLogs` uses TWO separate effects: a deps-driven reconcile effect (open new sockets, close removed sockets, preserve still-included buffers — the diff loop) + an empty-deps unmount-only cleanup effect (closes ALL sockets at true unmount). Without this split, React StrictMode dev double-invocation would tear down sockets the diff loop just opened. Pattern reusable for any WS lifecycle hook in Phase 28-02 / Phase 29.
- gitignore Rule 3 auto-fix: added `!livos/packages/ui/src/routes/docker/logs/` negation in all three gitignore files (root, livos/, livos/packages/ui/). The original `logs/` rule meant for runtime log directories was matching the new SOURCE dir, blocking the entire Phase 28 surface from being committed. Inline comments document the reason in each file.
- TDD execution: Tasks 1+2 split into RED (test commits 7647e2fb, e392730b) + GREEN (feat commits 69fd6226, 76c023a1). Task 3 (React glue files) ships as a single feat commit b1cbd722 per Plan 28-01 Task 3 having no `tdd="true"` flag — testable logic lives in Tasks 1+2 extracted modules. 5 task commits total + metadata commit.
- Pattern established for Phase 28-02: `colorForContainer` deterministic hash usable for activity-row source colors; `pushBounded` ring-buffer for activity event list; multiplex WS lifecycle pattern (deps-driven reconcile + empty-deps unmount cleanup) carries forward to dockerEvents WS subscription. Pattern established for Phase 29: WS handler envId extension is also available for `docker-exec-socket.ts` (DOC-15 cross-container shell will likely need the same `getDockerClient(envId)` refactor).

### Plan 26-02 Decisions (2026-04-25)

- Bridge useEffect on [selectedNetwork] only — eslint-disable on react-hooks/exhaustive-deps for inspectNetwork/clearInspect because useNetworks recreates these callbacks every render (closures over fresh setInspectedNetwork). Including them in deps would cause an infinite loop. The hook's setInspectedNetwork is identity-stable, so calling inspectNetwork(id) when id is unchanged is a no-op (T-26-07 mitigation). Pattern reusable for any store-to-hook bridge in Phase 28+ where the hook owns its own internal query lifecycle.
- Volume Schedule-backup link sets BOTH selectedVolume(name) AND setSection('schedules') in one click — closes the DOC-09 cross-section navigation seam. Setting just the section would leave Phase 27 without a target; setting just the volume slot would not navigate. Inline comment in volume-section.tsx documents the contract for the Phase 27 (DOC-12) planner: read useSelectedVolume() in the Schedules section to pre-fill the backup-job-create form (T-26-11 mitigation).
- deep-link.unit.test.ts pins the four-slot programmatic deep-link contract (containers + images + volumes + networks share useDockerResource with FOUR independent slots — NOT a single discriminated-union 'selectedResource' field). Test B catches the regression. Phase 28 (cross-container logs) + Phase 29 (palette + URL-bar deep-link) read this contract.
- Optional Test D (identity-stable subscriber notification) skipped — Plan 26-01's resource-store.unit.test.ts Test G already covers it. The plan explicitly opted out: "Skip if Plan 26-01's resource-store.unit.test.ts Test G already covers this." 26-01 SUMMARY confirmed Test G's identity-stable assertion. No duplication.
- noFilterResults empty-state branch added to both VolumeSection + NetworkSection, mirroring 26-01's pattern: shows "No volumes/networks match \"<query>\"" with the search query echoed in mono font when filter is active and empty but unfiltered list is non-empty. The original !volumes.length / !networks.length empty-states preserved for the unfiltered-empty case.
- IconCalendarTime selected as the Schedule-backup affordance icon — verified present in @tabler/icons-react@3.36.1 (node_modules/@tabler/icons-react/dist/esm/icons/IconCalendarTime.mjs resolves). The plan's IconClock fallback was unnecessary.
- Verbatim port discipline for VolumeUsagePanel + Volume/Network dialogs (Task 1) — bug-for-bug parity with the legacy server-control file. Plan 24-02 D-09 / Plan 26-01 precedent: legacy file untouched, both copies coexist until Plan 27 deletes the legacy file whole.
- DOC-20 programmatic half closed for ALL 4 resource types now (across 26-01 + 26-02). URL-bar form still Phase 29 (DOC-20 final). Plan 26-02 task commits: 4 atomic (1 refactor port + 2 feat sections + 1 test contract pin) — no TDD split needed since contract was already shipped in Plan 26-01 Task 1.

### Plan 25-02 Decisions (2026-04-25)

- localStorage + plain useState for tag filter (NOT zustand): selection scope is a single-component-tree concern (only the dashboard chip row + EnvCardGrid consume it). Adding a third zustand store for one chip-row would be disproportionate vs. existing useDockerStore (cross-route section nav) and useEnvironmentStore (cross-route env scope). Persistence key 'livos:docker:dashboard:selected-tag' follows Plan 24-01 D-01 + Plan 24-02 D-03 prefix convention.
- Bounded per-env candidate fanout in useTopCpu (PER_ENV_CANDIDATES=5): for each env, take only the top 5 running containers by `created` desc (recency proxy for 'likely-busy'), then fan out containerStats only on those candidates. Caps stats calls at envCount × 5 per 5s — with 5 envs that's 5/sec, well within Docker daemon load. True global Top-10-by-CPU would scale linearly with cluster size (could be hundreds). v29 polish task may add a docker.allEnvCpuTop tRPC aggregator (single round-trip per tick) when env+container counts grow.
- Logs/Shell quick-action chips set env scope only — no deep-link by container name. Phase 28 (DOC-13 cross-container logs) and Phase 29 (DOC-15 shell route) own the container-name deep-link. Inline code comments document the intentional seam so Phase 28/29 planners know exactly what to extend.
- Restart chip disables proactively on protected containers: backend `manageContainer` ALSO enforces the check via `isProtectedContainer()` (Plan 22-01 SEC-02 — defense in depth), but disabling avoids the round-trip + error toast. Tooltip 'Protected container' makes the affordance discoverable.
- Hooks-in-loops gating pattern: useTopCpu maps env list into N useQuery calls + maps candidates into M useQuery calls. React's hooks rule forbids hooks in CONDITIONAL branches, NOT loops over a STABLE array. We early-return-equivalent (envList = envs ?? []) so the hook count is 0 while envs is loading; once hydrated the count is stable across renders (envs only mutates on discrete admin CRUD which itself triggers a full remount via the React Query identity-stable refetch in the env list query).
- Pure helpers at module scope (deriveAllTags + filterEnvs + readPersistedTag + writePersistedTag + sortTopCpu) for unit testing without React rendering: avoids pulling in @testing-library/react (not in deps). The hooks become thin shells over these helpers. Plan 24-02 D-12 documented this pattern; Plan 25-02 carries it forward for both useTagFilter and the sort-top-cpu/use-top-cpu split.
- Stats queryKey includes BOTH name AND environmentId: cross-env containers with same name (e.g. 'redis' running on prod and staging) don't collide in the React Query cache. Plan 22-02 D-02 documented for env-scoped queries; Plan 25-02 carries it forward for the multi-candidate fanout.
- Per-card Retry on Unreachable banner refetches the SINGLE card's 6 queries (containers + images + stacks + volumes + networks + events). Calling all 6 in parallel via React Query's refetch() is fire-and-forget — errors on one query don't block others, and the banner state derives from containers.isError specifically. Other envs keep polling normally during the retry. e.stopPropagation prevents firing the card's outer onClick (which would scope+jump sections).
- Skeleton loaders only show on first paint (isLoading && entries.length === 0). React Query keeps isLoading=false on background refetches once data is hydrated, so the 5s polling tick does NOT swap to skeleton — preserves visual stability per Plan 25-02 success criteria 'no render flicker on poll'.
- TopCpuPanel uses sonner for restart toasts (matches the existing UI convention in container-files-tab, scheduler-section, use-app-install). Phase 25 doesn't introduce a new toast library or wrapper.
- TDD execution: Tasks 1+2 split into RED (test commits 4cfebf7b, be661a0e) + GREEN (feat commits e5d33252, 128206f6); Task 3 (panel + dashboard wiring) ships as a single feat commit dad89657 per Plan 25-02 Task 3 having no `tdd="true"` flag (testable logic lives in Tasks 1+2 extracted modules; same waiver Plan 25-01 Task 3 used). 5 task commits total.
- Patterns established for Phase 26+: bounded cross-env fanout pattern (per-env cheap-call → top-N candidates → expensive-call fanout-on-candidates) reusable for memory-pressure / network-throughput aggregator panels in v29; localStorage-backed UI selection with auto-fallback reusable for any 'remember the user's last X' UX where X is derived from a query result that can mutate.

### v27.0 Roadmap Decisions

- Phase 17 is foundation (real-time logs, secret env, redeploy button, AI tool expansion) — unblocks UI polish downstream
- Phases 18/19/20/22 parallelizable (only depend on Phase 17)
- Phase 21 (GitOps) depends on Phase 20's scheduler for auto-sync
- Phase 23 (AI diagnostics) depends on Phase 19's vulnerability scanning for AID-04
- Dockhand-inspired features: file browser, graph viewer, vuln scan, GitOps stacks, multi-host — all catching up to competitor parity
- AI-powered diagnostics (Phase 23) = Livinity's unique moat, no competing Docker manager has this

### Plan 17-01 Decisions (2026-04-24)

- Reused `stripDockerStreamHeaders` by exporting it unchanged from `docker.ts` (single source of truth for Docker frame parsing)
- `editStack` uses incremental delete-missing + set-non-empty (NOT `deleteAll`) — allows UI to submit blank-value secret rows to preserve stored values on edit
- `controlStack('up')` also injects secret envOverrides (otherwise stop→up cycles would lose secret env)
- `removeStack` purges Redis secret hash best-effort (`.catch(() => {})`) — a Redis outage cannot block stack teardown
- LogsTab search input is visible v1 placeholder; xterm search addon deferred to v28 per plan guidance
- `JWT_SECRET_PATH` hardcoded to `/opt/livos/data/secrets/jwt` — lift to env var only if dev environment needs a different location
- Pattern establishment: WebSocket streaming handler factory is the reference for Phase 18 (file browser) and Phase 20 (scheduler tail); AES-256-GCM-with-JWT-key is the reference for Phase 21 GIT-01 (git credential encryption)

### Plan 17-02 Decisions (2026-04-24)

- AI `docker_manage` stays on local Docker socket + host `docker compose` CLI (via `child_process.exec`) — NOT livinityd tRPC. Matches existing start/stop/restart/inspect/logs ops; no JWT plumbing needed. Compose files under `/opt/livos/data/stacks/<name>/` are shared with livinityd so AI-created stacks appear in the UI immediately.
- `PROTECTED_STACK_PREFIXES = ['livos', 'nexus-infrastructure', 'caddy']` guards `DockerManager.removeStack` — mirrors livinityd's container-level protection at stack level since `isProtectedContainer` isn't cross-process reachable.
- `controlStack('pull-and-up')` re-injects secret env overrides (same path as `'up'`) — upgrading a secret-bearing stack via the Redeploy button keeps its encrypted env vars intact.
- Renamed inner `exec` local to `execInstance` in `DockerManager.exec()` to avoid shadowing the module-scoped `promisify(cpExec)` — zero behavioral change, required by TypeScript.
- Redeploy ActionButton reuses `color='blue'` (no new `'violet'` variant) per plan explicit guidance; distinguishes via title "Redeploy (pull latest images)".
- AI `stack-deploy` does NOT expose `secret: true` flag on envVars — the secret store is a livinityd-owned concern. Deferred to v28: either route AI stack-deploy through livinityd tRPC with an internal JWT, or grant nexus DockerManager read access to the same Redis key.

### Plan 19-02 Decisions (2026-04-24)

- Picked execa-driven `docker run --rm aquasec/trivy:latest …` over `dockerode.run()` — simpler stdout capture, native timeout (5min) and maxBuffer (64MB for large CVE JSON), `reject:false` lets us inspect exitCode + stderr together. No dockerode multiplexed-stream demuxing required.
- `--quiet --format json` combination on Trivy → guarantees pure-JSON stdout (Trivy progress messages route to stderr). Combined with `--severity CRITICAL,HIGH,MEDIUM,LOW` we never receive UNKNOWN entries from Trivy itself; defense-in-depth `SEVERITY_SET.has()` check still drops UNKNOWN at parse time per CGV-02.
- Description trimmed to 500 chars in CveEntry — Trivy descriptions can run multiple paragraphs; UI uses them as tooltip text only. Saves Redis bytes.
- Best-of-vendor CVSS via `Math.max(nvd.V3, redhat.V3, ghsa.V3, nvd.V2, redhat.V2)` — single sortable score across heterogeneous Trivy output. Sort key: severity ASC by SEVERITY_ORDER → cvss DESC → id ASC (stable tie-break).
- Cache key strips `sha256:` prefix → `nexus:vuln:<hex>` per 19-CONTEXT.md spec. Same digest under different tags shares the cache entry — `getCachedScan('alpine:3.19')` returns the entry created by `scanImage('mytag:foo')` if both pulled the same digest.
- Persisted result has `cached: false`; `getCachedScan` and the cache-hit fast-path in `scanImage` flip the flag in-memory. Storage stays canonical.
- Lazy `ensureTrivyImage` — only invoked from `scanImage`, never on module import. Avoids 250MB pull at boot. First-scan UX is the only place users wait.
- `getCachedScan` is a query (not mutation): read-only, idempotent, latency-tolerant → stays on WebSocket. `scanImage` is a mutation that can take 30-90s → added to httpOnlyPaths so it cannot silently hang on a disconnected WS client (the Phase 18 gotcha).
- ImageHistoryRow → ImageHistoryPanel refactor: original returned bare `<TableRow>` siblings, which is invalid inside a `<TabsContent>`. Rewrote to render its own `<Table>` inside the panel.
- Per-image active-tab state stored as `Record<id, 'history'|'scan'>` in ImagesTab; Scan button writes 'scan' so click auto-flips the tab without losing manual selections on other rows.
- Bracketed-error-code mapping: `[image-not-found]` → NOT_FOUND, `[trivy-timeout]` → TIMEOUT, `[trivy-failed]` / `[trivy-parse]` / `[trivy-unavailable]` → INTERNAL_SERVER_ERROR. Frontend toast shows the unprefixed message.
- Pre-existing typecheck noise (~338 errors in livinityd unrelated modules + ~38 ActionButton-icon type errors in server-control across pre-existing usages) logged to `.planning/phases/19-compose-graph-vuln-scan/deferred-items.md` per scope-boundary rule. Build is the gating signal (livinityd runs via tsx; UI build passed).
- Pattern established for v28 SBOM/license/grype: ephemeral-container CLI tool wrapped in execa with bracketed-error mapping + digest-keyed Redis cache. CGV-04 explicitly forbids any auto-scheduling (`docker.scanImage` is mutation-only, no cron, no event listener, no auto-trigger on `pullImage`).

### Plan 23-01 Decisions (2026-04-25)

- One-shot `POST /api/kimi/chat` endpoint on nexus wraps `brain.chat()` directly with no tools / no streaming / no agent loop. 60s wall-clock via Promise.race against `setTimeout` so a stuck Kimi call cannot pin the express handler. Inherits LIV_API_KEY auth from `app.use('/api', requireApiKey)` middleware applied earlier in api.ts (line 229).
- callKimi() in livinityd ai-diagnostics.ts uses `fetch` with `X-API-Key: process.env.LIV_API_KEY` and `AbortSignal.timeout(90_000)` — pattern identical to ai/routes.ts:getKimiStatus. Bracketed errors `[ai-unavailable]/[ai-bad-response]/[ai-error]/[ai-timeout]` propagate up through the 3 driver functions.
- Two-regex secret redaction: env-style `KEY=value` (`/(^|\s|^["'])([A-Z][A-Z0-9_]*)=([^\r\n]*)/g`) + JSON-shaped `"key":"value"` (`/"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g`), both gated by shared `SECRET_KEY_PATTERN` (PASSWORD/SECRET/TOKEN/API_KEY/CREDENTIAL/PRIVATE_KEY/PWD/PASSWD/KEY/ACCESS_KEY). Idempotent because [REDACTED] contains no chars that re-trigger either regex. 9 redaction tests + 5 parser tests + 1 idempotence test all pass.
- Cache keys: diagnose uses `nexus:ai:diag:<containerId>:<sha256(redactedLogs.slice(-2000)).slice(0,16)>` — invalidates on any new log lines accumulated since last call. CVE-explain uses `nexus:ai:diag:cve:<sha256(imageRef|sortedTop5Ids).slice(0,16)>` — keyed on the actual CVE set, not just digest, so different fix data invalidates separately. Compose-from-prompt has NO cache (every prompt is unique by intent — caching would store-and-never-hit). All cache writes use 300s TTL via `redis.set(key, json, 'EX', 300)`.
- `explainVulnerabilities` short-circuits when no CRITICAL/HIGH CVEs exist — synthetic `{explanation: 'No critical or high…', upgradeSuggestion: 'No upgrade required.'}` returned without hitting Kimi. The UI also gates the `Explain CVEs` button on `CRITICAL + HIGH > 0` so users never even see it for clean scans (zero-token waste guarantee).
- All 3 mutations registered in httpOnlyPaths under `// Phase 23 — AI diagnostics mutations (long-running, can take 30-60s)` comment block. Documented Phase 18 gotcha: WS-routed mutations silently hang on disconnected clients during 30-60s Kimi turns.
- Bracketed-error → TRPCError mapping: `[ai-timeout]` → TIMEOUT, `[ai-unavailable]/[ai-error]/[ai-bad-response]` → INTERNAL_SERVER_ERROR, `[no-scan-result]` → PRECONDITION_FAILED (more semantic than NOT_FOUND for "must scan first"), `[not-found]/[env-not-found]/[image-not-found]` → NOT_FOUND, `[agent-not-implemented]` → NOT_IMPLEMENTED.
- AI compose tab extends existing Tabs primitive (yaml | git | ai) — same source-of-stack pattern Plan 21-02 established. AiComposeTab + DiagnosticPanel sub-components co-located in parent files alongside existing ScanResultPanel/RedeployStackDialog precedent. tab state union widened from `'yaml'|'git'` to `'yaml'|'git'|'ai'`; aiPrompt local state initialized to '' and reset on form close.
- Hook uses `trpcReact.useUtils()` idiom (tRPC v11 + React Query v5) — codebase consensus across hooks/use-environments.ts, use-language.ts, use-notifications.ts. Plan spec mentioned `useContext` (deprecated alias); the hook actually doesn't need utils for these 3 stateless mutations so the import is omitted entirely. Behavioural impact: zero.
- Re-run/Re-try buttons reset mutation state via `resetDiagnosis()` / `resetExplanation()` / `resetCompose()` before firing again — required because React Query v5 mutations cache the last result; without reset, the panel would briefly show stale data while the new request flies.
- TDD execution: Task 2 split into RED (test commit `2d96d1df`) + GREEN (feat commit `34fbf563`) per execute-plan TDD protocol; other 4 tasks were single-commit feat tasks. Total 6 commits for the plan.
- Pattern carried forward to Plan 23-02 (AID-02 + AID-05): `callKimi()` and `redactSecrets()` are exported and reusable for proactive resource-watch handler in scheduler/ + AI Chat container-diagnostics tool. `diagnoseContainer()` itself is reusable as the autonomous "why is my X container slow/failing" tool — needs only an MCP/tool wrapper that the existing chat agent can invoke. Cache prefix `nexus:ai:diag:` is shared across plans for cross-feature dedupe.

### Plan 23-02 Decisions (2026-04-25)

- ai-resource-watch ships default-disabled (`enabled:false` in DEFAULT_JOB_DEFINITIONS). seedDefaults() ON CONFLICT (name) DO NOTHING means existing v27.0 PG installs keep their seeded value — fresh installs only. Operators flip enabled=true via Settings > Scheduler once they've validated Kimi projections in their environment. Same default-flip pattern Plan 21-02 documented for git-stack-sync.
- Threshold priority order: critical-memory (>=95%) > warning-memory (>=80%) > restart-loop (>=3) > cpu-throttle (delta>0). NO critical-cpu tier — Docker doesn't expose enough signal in a 5-min window to differentiate "occasional throttling" from "constant throttling" reliably without history; we elevate to critical only when memory is the issue. Pure `isThresholdExceeded` function unit-testable in isolation from handler (6 boundary tests + 1 priority test verifies ordering).
- Throttle delta is `current - last` clamped to 0 on container restart. `cpu_stats.throttling_data.throttled_time` is cumulative since container start; on restart it resets to 0, raw delta would go negative and could be misread as throttling absent. Clamp ensures restart != throttling alarm. Module-scoped `_throttledTimeCache: Map<containerId, lastNanoseconds>` keyed on container Id (stable across renames); test-only `_resetThrottleCacheForTests()` exported for handler-shape tests.
- 60-min dedupe via partial composite index `(container_name, kind, created_at DESC) WHERE dismissed_at IS NULL`. Single-index seek for `findRecentAlertByKind`. Two partial indexes total: `idx_ai_alerts_undismissed` (for the bell-list query) + `idx_ai_alerts_dedupe` (for the watcher's lookup). Partial indexes keep them small — dismissed alert volume can grow indefinitely without bloating index size. Dismissing an alert resets the dedupe (filter excludes dismissed rows) so users can force re-evaluation by dismissing then waiting for next 5-min tick.
- Kimi-unavailable mid-loop aborts the run with `status: 'failure'` rather than retrying every container. Next 5-min cron tick will retry — no alert spam if Kimi is down for 30 min. Per-container errors are isolated (one stuck container can't fail the whole job); errorCount surfaces in run-history output JSON.
- Handler runs against LOCAL socket only (`listContainers(null)`). Multi-host watching deferred to v28 per Plan 22-01 D-06 — the docker compose CLI host-only constraint also applies to the cumulative throttled_time delta cache (each host has its own counter; can't merge across envs without per-env caches and per-env Kimi spend).
- 4096-char message cap in `insertAiAlert` — defensive against runaway Kimi output. System prompt asks for 60 words but model is non-deterministic; cap prevents PG row bloat.
- listAiAlerts stays on WS (read-only query polled 30s; WS reconnect handles disconnect). Both dismiss mutations registered in httpOnlyPaths under `// Phase 23 AID-02 — AI Alerts dismissal mutations` comment block — Phase 18 gotcha avoided (disconnected WS mutations silently hang).
- AlertsBell uses existing shadcn DropdownMenu primitive (Radix-backed, already in `packages/ui/src/shadcn-components/ui/dropdown-menu.tsx`). Zero-dep addition. useAiAlerts onSuccess hooks invalidate `listAiAlerts` via `trpcReact.useUtils().docker.listAiAlerts.invalidate()` — same idiom Plan 22-02 established (tRPC v11 + React Query v5).
- docker_diagnostics tool routes through `brain.chat()` directly inside nexus-core (same-process). NO HTTP roundtrip to `/api/kimi/chat` needed — that endpoint is itself a thin wrapper around `brain.chat()`. Saves ~10ms latency per call and avoids LIV_API_KEY plumbing inside the tool. Same in-process pattern Plan 17-02 used for `docker_manage`.
- docker_diagnostics duplicates the redaction regex + DIAGNOSE_SYSTEM_PROMPT from livinityd's `ai-diagnostics.ts` (~30 lines). Intentional per Plan 17-02 precedent: nexus DockerManager does NOT cross-call into livinityd; cross-package imports would require either a shared package or HTTP roundtrip — both worse than the duplication. When/if the prompt drifts between proactive (livinityd) and reactive (nexus) surfaces, that's a feature: each surface tunes independently.
- Tool input schema is just `{containerName: string}` — no envId. Multi-host diagnose is a v28 follow-up. Tool description IS the LLM router: "Use this tool whenever the user asks why a specific container is slow, failing, OOMing, restarting, crashing, or otherwise misbehaving — even if the user does not explicitly mention logs or stats. Prefer this over docker_manage operation='logs' for diagnostic questions because the output is interpreted, not raw." Zero regex intent matching; Kimi decides based on description alone.
- `brain` destructured from `this.config` alongside `toolRegistry`/`dockerManager`/`shell` at line 1313 of `registerTools()` — adds 'brain' to the existing destructure rather than reaching for `this.config.brain` inside the closure (closures over destructured locals match the existing pattern).
- Two commits for Task 2 (RED `2e8eae4d` + GREEN `614ba117`) per execute-plan TDD protocol. Other 3 tasks single-commit feat. Total 5 task commits + 1 metadata commit. 8 unit tests pass on first GREEN (6 isThresholdExceeded boundary + priority + 2 handler-shape tests covering dedupe and throttle delta cache).
- Phase 23 closeout: all 5 AID requirements satisfied (AID-01/03/04 from Plan 23-01, AID-02/05 from Plan 23-02). v27.0 ready for `/gsd:audit-milestone v27.0` — 33/33 must-haves should pass on server4 deployment.

### Plan 22-02 Decisions (2026-04-25)

- D-01: zustand persist (not URL param) — selection survives navigation across all routes; localStorage key 'livos:selectedEnvironmentId'; URL-shareable env links is a v28.0 follow-up. Each tab has its own React state but localStorage is shared, so a new tab adopts the last-set selection.
- D-02: React Query queryKey IS the env-change refetch mechanism — every docker hook reads useSelectedEnvironmentId() and passes the id into the trpc input; changing environmentId produces a new queryKey and triggers automatic refetch. No manual `utils.docker.*.invalidate()` on env switch — old key is abandoned and gc'd. Significantly simpler than the alternative (subscribe + manual invalidate everywhere).
- D-03: Selected id is always a string (never null) at the consumer layer — useSelectedEnvironmentId() returns string with LOCAL_ENV_ID fallback; docker hooks pass `{environmentId}` directly into trpc inputs without nullable handling at every site. Backend's getEnvironment() resolves LOCAL_ENV_ID and null/'local' to the same row, so passing the UUID is byte-for-byte equivalent to passing null.
- D-04: scanImage / controlStack / editStack / removeStack / deployStack stay envId-less — Plan 22-01 D-06/D-07 documented the host-local CLI / Trivy constraint; the UI hooks omit environmentId from these specific mutations even when a remote env is selected. Affected views display data scoped to selected env BUT mutations target the host. Documented in code comments (use-stacks.ts line 33-35). v28.0 will rework with compose-file replication and remote/proxied Trivy.
- D-05: 'Manage Environments…' dropdown link routes to /settings, NOT /settings/environments — settings sections live in component state, not the router. apple-spotlight.tsx style /settings/wallpaper navigates to dialogs, not section content. Out of scope to add `?section=environments` query-param routing this plan; user clicks Environments from sidebar after landing on /settings.
- D-06: GenerateAgentTokenDialog auto-fires mutation on open — the mutation is the only thing the dialog does (no form, no confirm); auto-firing matches the Plan 21-02 webhook-secret panel shape. Closing drops token from React state forever.
- D-07: Edit dialog type is immutable — switching type would require deleting all transport-specific fields then re-validating against new type's required-set + handling Dockerode cache invalidation; cleaner UX is delete-and-recreate via Remove + Add. The plan's spec ("type cannot change") matched.
- D-08: useGenerateAgentToken stub baked into hook seam (not UI) — defensive `route?.useMutation` check at hook time returns either the real useMutation result OR a stub object with same shape. Dialog component is unaware of whether 22-03 has shipped. When 22-03 lands, stub branch is never taken — no UI changes required. Pattern reusable for any "future tRPC route" the UI wants to ship behind a flag.
- Defensive selector: useEffect watches environments + selectedEnvironmentId — if persisted id is missing from the env list (deleted in another tab), reset to LOCAL_ENV_ID. Prevents stranded users.
- 'local' Edit/Remove protection lives in EnvironmentCard via Tooltip-wrapped disabled buttons — backend already throws [cannot-modify-local] / [cannot-delete-local], the UI affordance just makes that visible upfront.
- Add dialog defaults to type='tcp-tls' (not 'socket') — most common case for non-local envs; socket on a remote host requires NFS-mounted /var/run/docker.sock which is uncommon.
- useGenerateAgentToken stub returns `isPending` not `isLoading` — matches tRPC v11+ React Query v5 mutation API. Dialog uses isPending throughout.
- Pattern carried forward to Plan 22-03: replace useGenerateAgentToken stub with real `trpc.docker.generateAgentToken` mutation route. The route should accept `{environmentId}` and return `{token: string, agentId: string}`. The agent installer at `/install-agent.sh` (referenced in install snippet) needs to be served by livinityd or Caddy. The Add dialog's `type='agent'` flow needs the backend to accept agent-type creation without an agentId (or generate one server-side as part of createEnvironment).

### Plan 22-01 Decisions (2026-04-25)

- environments table shape: id (UUID PK gen_random_uuid), name (UNIQUE), type ('socket'|'tcp-tls'|'agent') CHECK, transport-specific cols (socket_path / tcp_host+port / tls_*_pem / agent_id), agent_status ('online'|'offline') default 'offline', last_seen, created_by (FK users ON DELETE SET NULL), created_at. Index on type. Mirrors the Phase 21 stacks/git_credentials pattern.
- LOCAL_ENV_ID = '00000000-0000-0000-0000-000000000000' fixed sentinel UUID for the auto-seeded built-in 'local' row. Idempotent INSERT … ON CONFLICT (name) DO NOTHING runs on every boot after migrateFromYaml. Alias resolution (null / undefined / 'local' → LOCAL_ENV_ID) lives in `getEnvironment(idOrAlias)` so the factory and every route's error handling sees a single canonical id.
- agent_id has NO foreign-key constraint yet (deferred to Plan 22-03). Adding the FK now would force a circular dependency since docker_agents doesn't exist until 22-03. The 22-03 planner decides between adding `ALTER TABLE … FOREIGN KEY (agent_id) REFERENCES docker_agents(id) ON DELETE SET NULL` or leaving it unenforced.
- `getDockerClient(envId)` factory pattern: `Map<envId, Dockerode>` in-memory cache; `invalidateClient(envId)` evicts after env-row update/delete so next call rebuilds with new connection fields; `clearAllClients()` for tests only. Cache key is canonicalised env.id (alias resolution happens before cache lookup).
- buildClient routes by env.type: 'socket' → new Dockerode({socketPath}); 'tcp-tls' → new Dockerode({host, port, protocol:'https', ca, cert, key}); 'agent' → throws [agent-not-implemented] until Plan 22-03 wires `new AgentDockerClient(env.agentId, …)`. The throw is intentional — half-built agent client must surface as a clear error.
- Module-level Dockerode singletons removed from docker.ts, stacks.ts, container-files.ts. Every helper accepts `environmentId?: string | null` as its LAST argument and resolves the client via `await getDockerClient(envId ?? null)` as its first statement. Backwards compatible — existing callers without envId resolve to the auto-seeded 'local' env (byte-for-byte identical to the pre-Phase-22 behaviour).
- docker compose CLI calls in stacks.ts (deployStack/editStack/controlStack/removeStack) stay host-local for v27.0. They shell out to the host docker CLI which always talks to the local daemon. Multi-host compose deploy requires either compose-file replication or rewriting against Dockerode — both deferred to v28. listStacks does accept envId since it uses Dockerode.listContainers.
- Trivy / vuln-scan.ts stays host-only (`scanImage` and `getCachedScan` skipped when adding envIdField). Trivy needs the host docker daemon + image cache mount. Routing to remote envs requires either pulling images into the remote env or proxying Trivy stdout — out of scope for v27.0.
- docker-exec-socket.ts / docker-logs-socket.ts stay local-only — real-time WS streaming over remote tcp-tls or agent envs deferred to v28. The one-shot `docker.containerLogs` (non-streaming) does accept envId.
- Every existing docker.* route Zod input gains `environmentId: z.string().uuid().nullable().optional()` via shared `envIdField` const at top of routes.ts. 30+ routes updated. Per-route error mappings extended: `[env-not-found]` → NOT_FOUND, `[agent-not-implemented]` → NOT_IMPLEMENTED, `[env-misconfigured]` → INTERNAL_SERVER_ERROR.
- New `docker.environments.*` CRUD router: listEnvironments stays on WebSocket (query); createEnvironment / updateEnvironment / deleteEnvironment go through HTTP per the documented WS-mutation hang issue (added to httpOnlyPaths). updateEnvironment + deleteEnvironment also call `invalidateClient(id)` so the cache reflects the change immediately.
- Test convention: existing repo uses `*.unit.test.ts` (per system.unit.test.ts); new test files follow that suffix (environments.unit.test.ts, docker-clients.unit.test.ts). 27 tests total — 19 + 8.
- Pattern carried forward to Plan 22-02: UI environment selector binds to `docker.listEnvironments` query + filters all docker.* calls by `environmentId`. The selector lives in Server Control header. Plan 22-03: replace the `[agent-not-implemented]` branch in buildClient with `new AgentDockerClient(env.agentId, /* WS proxy */)`. Cache + invalidation hook work unchanged because AgentDockerClient is Dockerode-shaped.

### Plan 21-02 Decisions (2026-04-25)

- `git-stack-sync` default flip is seed-only. `DEFAULT_JOB_DEFINITIONS` change from `enabled: false` to `enabled: true` only affects fresh PG installs because `seedDefaults` uses `INSERT … ON CONFLICT (name) DO NOTHING`. Existing v27.0 installs (server4 already booted Phase 20) keep their previous disabled row — operators must run `UPDATE scheduled_jobs SET enabled=true WHERE name='git-stack-sync';` or flip via the Settings > Scheduler UI shipped in Plan 20-02.
- Form stays open after a successful git deploy until the user clicks Done — webhook secret is shown only once at deploy time and is never retrievable via list/get APIs (encrypted_data isn't exposed). Auto-closing would lose it. The Done button is the explicit "I've copied it" handoff.
- Edit mode stays YAML-only in v1. Plan 21-01's `editStack` was not extended for git. The Tabs structure is conditionally rendered only when `!isEditMode` — edit mode shows the original single-textarea layout. v28.0 follow-up: extend `editStack` to accept either `composeYaml` or `git` (or allow toggling) so users can switch a stack between modes without remove+redeploy.
- Per-stack failures isolated in scheduler. A single repo with a stale credential or transient network error must not stop the hourly cron from processing the other 9 stacks. Per-stack `try/catch` + `action: 'failed'` + continue to next is the right shape; catastrophic failures (DB down) bubble up as `status: 'failure'` so operators distinguish infrastructure problems from per-target issues in the run-history UI.
- Plain `<select>` for credential picker, not Combobox. Credential lists are short (most users will have 1-2). The inline "Add credential" button next to the select handles the creation flow without a separate command-palette pattern. Switch to Combobox once average user credential count exceeds 5 (v28.0 instrumentation TBD).
- `DeployStackInput.composeYaml` made optional in the hook. Required for the git path (where `composeYaml` is undefined and `git` is provided). Runtime check is at handleSubmit (`!gitUrl.trim()` for git, `!composeYaml.trim()` for YAML); the type system reflects "exactly one of composeYaml / git is required" via the discriminator at the call site.
- Hook-level `lastDeployResult` state slot — useStacks stores the response so a follow-on UI panel can render the webhook URL/secret asynchronously without forcing the form to use the mutation directly. Generalizable pattern for any post-mutation success-display UX.
- Tabs primitive wrapping divergent input modes (YAML vs git) inside a shared form is the new pattern for "multiple ways to specify the same resource" — stack name + env vars stay outside the tabs since they apply to both paths. Reusable for future container-create-from-image vs container-build-from-Dockerfile.

### Plan 21-01 Decisions (2026-04-24)

- PG row only for git-backed stacks. YAML-only stacks stay filesystem-only at `/opt/livos/data/stacks/<name>/docker-compose.yml` — zero migration risk on upgrade, zero DB load for users who never use GitOps. The new `stacks` table is additive metadata; YAML deploy path is byte-for-byte unchanged.
- Webhook is unauthenticated at the cookie/JWT layer — security model IS the per-stack 32-byte (64-hex) HMAC secret returned in `deployStack` response. Verification: `crypto.createHmac('sha256', stack.webhookSecret).update(rawBody).digest('hex')` then length-check + `crypto.timingSafeEqual` (length-check first to avoid different-length crash).
- Webhook responds 202 immediately and runs the redeploy in a fire-and-forget background Promise — image pulls + compose up can take 10-60s and would exceed GitHub's 10s webhook timeout, triggering retries. Background errors logged-only (never thrown back to GitHub).
- Blobless clone (`--filter=blob:none --depth=1 --single-branch --branch <X>`) over isomorphic-git's full clone. simple-git wraps the system git binary which supports partial clone cleanly; isomorphic-git is already in deps but doesn't handle the partial-clone protocol well. Minimal disk + bandwidth for sample stacks; objects fetched on-demand if rev-parse needs older commits.
- Auth credentials live in tmpdir() temp files cleaned up in `finally{}`. HTTPS uses a `GIT_ASKPASS` shell script (mode 0o700) that echos username/PAT keyed on the prompt arg `$1`; SSH uses a temp keyfile (mode 0o600) referenced via `GIT_SSH_COMMAND="ssh -i <path> -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes"`. No plaintext credential persists to disk after the operation completes.
- AES-256-GCM crypto for `git_credentials.encrypted_data` is identical to `stack-secrets.ts` (Phase 17): SHA-256 of `/opt/livos/data/secrets/jwt` -> 32-byte key, output is `base64(iv12 || tag16 || ciphertext)`. `decryptCredentialData` is internal-only — `encrypted_data` NEVER returned by list/get/CRUD APIs.
- `git_credentials.user_id` is `UUID REFERENCES users(id) ON DELETE SET NULL` — admin user deletion shouldn't orphan-cascade away credentials that other admins might still need. `UNIQUE(user_id, name)` prevents duplicate names per user (and per global scope when user_id is NULL).
- 3 new tRPC routes (`docker.listGitCredentials`, `docker.createGitCredential`, `docker.deleteGitCredential`) added to `httpOnlyPaths` to avoid the documented WS-mutation hang issue. Pattern: every new admin-only credential/stack mutation goes through HTTP, never WebSocket.
- Pre-existing typecheck noise in `ai/routes.ts` (`ctx.livinityd is possibly undefined`) and `server/index.ts` (lines 66/167/634/772/1570 — asyncHandler / Apps types — pre-date this plan) noted as out-of-scope per scope-boundary rule. None of the Phase 21 touched files (git-credentials.ts, git-deploy.ts, the new code in stacks.ts/routes.ts/server index.ts) introduce new errors. livinityd runs via tsx so build is not gated on tsc.
- Pattern carried forward to Plan 21-02: `listGitStacks()` + `syncRepo()` + `copyComposeToStackDir()` + `controlStack('pull-and-up')` is the exact 4-step recipe Plan 20's `git_stack_sync` placeholder needs to become real. Plan 21-02 wires this into `BUILT_IN_HANDLERS['git-stack-sync']`.

### Plan 20-02 Decisions (2026-04-24)

- AES-256-GCM credential vault keyed off the JWT secret (mirrors Phase 17 stack-secrets) — Redis hash at `nexus:scheduler:backup-creds:{jobId}` with `{field -> base64(iv(12)||tag(16)||ciphertext)}`. No second master-key to manage; rotating JWT forces re-entry of backup creds (acceptable). config_json (PG) NEVER stores secrets — strict accessKeyId-public / secretAccessKey-vault split.
- Streaming tar via ephemeral `alpine:latest` container with `Cmd ['tar','czf','-','-C','/','data']` + `Binds:['<vol>:/data:ro']` + `AutoRemove:true`. Dockerode `attach({hijack:true})` + `modem.demuxStream(mux, stdout, stderr)` splits the 8-byte multiplexed frames; `container.wait()` promise destroys stdout PassThrough on non-zero exit so the upload reject-propagates with captured stderr (truncated to 500 chars). O(1) host-disk usage regardless of volume size.
- `@aws-sdk/lib-storage` `Upload` over manual `PutObjectCommand` — auto-multipart for >5MB streams (we don't know volume size in advance) + correct backpressure between tar producer and S3 consumer. Endpoint override + forcePathStyle support R2/B2/MinIO.
- `ssh2-sftp-client` `connect → put(stream, remoteFile) → end` wrapped in try/finally so the SFTP socket is always cleaned up even on tar failure mid-upload. Password OR privateKey+passphrase via `authMethod` discriminator.
- Discriminated-union Zod schema (`z.discriminatedUnion('type', [s3, sftp, local])`) — strong runtime validation + correct TS narrowing in handler. PG unique-violation (`code: '23505'`) maps to `CONFLICT` TRPCError; missing id → `NOT_FOUND`.
- `upsertJob` mutation splits creds from config: writes encrypted blob to Redis vault (`getBackupSecretStore.setCreds`), persists only non-sensitive config to `scheduled_jobs.config_json`, then calls `ctx.livinityd.scheduler.reload()` so cron picks up new/edited rows without restart. `deleteJob` cascades cred deletion via `deleteAll(jobId)`.
- 5 tRPC routes (`listJobs` query + `upsertJob`/`deleteJob`/`runNow`/`testBackupDestination` mutations); all 4 mutations registered in `httpOnlyPaths` (queries stay on WS). `testDestination` uploads a 22-byte probe + best-effort delete, returning `{success, latencyMs, bytesUploaded}` for the UI Test Destination button.
- Settings > Scheduler section: 10s poll on `listJobs` surfaces Last Run flips live; AddBackupDialog `Test Destination` and `Save` share the same `buildPayload()` to eliminate "test passed, save failed" surprises from drifted serialization. Built-in jobs (image-prune, container-update-check, git-stack-sync) cannot be deleted from UI — they're seeded by 20-01's `seedDefaults` and would respawn on next boot anyway.
- No default `volume-backup` row in `DEFAULT_JOB_DEFINITIONS` — backups are always user-configured (no sensible default volume + destination). The `BUILT_IN_HANDLERS['volume-backup']` slot now points to `volumeBackupHandler` (replaces 20-01's throwing stub).
- Pattern established for Phase 21 GIT-01 git-credentials encryption: lift-and-shift `backup-secrets.ts` (rename Redis prefix to `nexus:git:credentials:{stackId}` + field names to `username/password/token/sshPrivateKey`); identical AES-256-GCM crypto + Redis-hash layout. Streaming-source-through-ephemeral-container pattern reusable for `alpine/git:latest git pull` runs in Phase 21.
- Pre-existing typecheck noise: `'ctx.livinityd' is possibly 'undefined'` matches the identical pattern across `ai/routes.ts` (10+) and `widgets/routes.ts` (3+) — Context-merge produces optional `livinityd` field but every existing route assumes it's present at runtime (always true — set by Express/WS context creators). Out-of-scope per scope-boundary rule; livinityd runs via tsx with no compilation gate.

### Plan 20-01 Decisions (2026-04-24)

- Picked node-cron 3.x over 4.x — 3.x is the long-stable line shipping ESM-compatible CommonJS for our `"type": "module"` package; 4.x has breaking API changes around schedule() options. Single dep choice — no Bull/Agenda — node-cron is sufficient for the 3-handler maintenance workload and adds zero infra (no Redis queue).
- Mutex via in-flight `Set<jobId>` — concurrent firings of the same job are dropped+logged rather than queued. Matches the "idempotent maintenance" nature of these jobs (a 2nd image-prune mid-run is wasted work, not lost work). Logged-and-dropped is the simpler, more predictable contract than a queue.
- container-update-check shells out to `docker buildx imagetools inspect <ref> --format '{{json .Manifest}}'` (preferred — multi-arch index aware, no hand-rolled registry HTTP auth) with `docker manifest inspect --verbose` fallback for environments without buildx (older Docker). Per-container failures degrade gracefully: the entry gets `updateAvailable: null` + `error` string, the job overall stays `'success'`. One unreachable registry must not blank-out the whole report. 15s timeout per registry call. Digest-pinned refs (`sha256:…`) and `<none>` tags get `pinned: true` and skip remote lookup.
- git-stack-sync ships as a `status: 'skipped'` placeholder so Phase 21 can simply replace `BUILT_IN_HANDLERS['git-stack-sync']` without DB migration. Default row is `enabled=false` so it doesn't spam logs hourly until Phase 21 turns it on. Pattern: handler registry decoupled from runner — Plan 20-02 backup handler plugs into `BUILT_IN_HANDLERS['volume-backup']` without touching `scheduler/index.ts`.
- BUILT_IN_HANDLERS['volume-backup'] throws explicitly — a user who creates a volume-backup job in the UI before Plan 20-02 ships gets a clear error instead of a silent no-op.
- Scheduler.start() failures are caught and logged (non-fatal). Livinityd boots with scheduler-disabled behavior rather than crashing if PG is down — matches the existing `initDatabase()` fallback pattern. `registerTask()` validates cron expressions via `cron.validate()` before scheduling — invalid schedules log + skip rather than throw.
- Re-fetch fresh row inside `runJob()` before invoking handler — config or enabled flag may have changed since cron registration; if `!enabled` at fire time, the run is silently dropped.
- Idempotent default seed via `INSERT … ON CONFLICT (name) DO NOTHING` — manually-disabled defaults survive restarts. Pattern: PG row is source of truth; node-cron tasks are stateless registrations rebuilt on every `Scheduler.start()`. `Scheduler.runNow()` and `Scheduler.reload()` are already public for Plan 20-02 admin tRPC routes.
- Pre-existing pnpm UI postinstall fail on Windows (mkdir -p / cp -r in cmd) is documented in STATE; pnpm install still resolved node-cron correctly. Pre-existing 324 livinityd typecheck errors are unrelated to scheduler files (zero new errors from this plan); per scope-boundary rule, livinityd runs via tsx and gates on UI build, not livinityd tsc.

### Plan 19-01 Decisions (2026-04-24)

- Picked `reactflow@^11.11.4` over `@xyflow/react@^12` — v12 mandates React 19; @livos/ui pins React 18.2, so 11.x is the highest stable line we can adopt without a React major.
- Topological grid layout (Kahn's algorithm + per-column row counter) instead of dagre/elkjs — adds zero KB; sufficient for ≤ 10-service home-server stacks. Future large-stack support can layer dagre behind a flag.
- `nodeTypes` registered at module scope (NOT inside the component) per documented React Flow gotcha — avoids per-render remount and the "It looks like you've created a new nodeTypes object" warning.
- Compose-spec parsing fallbacks: services with no `networks:` key get `['default']` to match docker compose's actual behaviour; both array and object forms supported for `depends_on`/`networks`/`ports`.
- Lazy mount via Radix Tabs default (inactive `<TabsContent>` panes unmount) — `getStackCompose` query fires only when the user clicks the Graph tab; zero extra API load for users who never click.
- `pnpm --filter ui add ... --ignore-scripts` is required on Windows because the existing `postinstall: copy-tabler-icons` uses Unix `mkdir -p` / `cp -r .` which fails under cmd. Pre-existing repo quirk; safe to skip when adding deps because the icon copy already ran on a prior successful install.
- Pattern established for future stack-detail tabs (Resource Usage, Logs, Vuln overlay): `Tabs(...)` block lives directly inside the existing `<TableRow><TableCell>` expanded-row container.
- Tile rendering combines Plan-spec basics (image, port pills) with per-service network pills inside each node — gives users two simultaneous reads (legend below + per-node colours), no extra data fetch.

### Plan 18-02 Decisions (2026-04-24)

- Inferred `ContainerFileEntry` from `RouterOutput['docker']['containerListDir']` rather than duplicating the interface client-side — single source of truth in `container-files.ts`.
- Plain styled `<textarea>` for the edit modal (not Monaco — Monaco is NOT installed; verified by grepping package.json). Styling matches the existing compose YAML editor at `server-control/index.tsx` line 2509 — keeps bundle flat.
- Imperative `utils.docker.containerReadFile.fetch()` for read-on-edit-open instead of conditional `useQuery` — modal data is one-shot, doesn't need React-Query caching.
- POSIX path helpers (`posixJoin`, `posixDirname`, `segmentsOf`) are private-module-local — never use `node:path` because it resolves to win32 on Windows hosts and container paths are POSIX.
- Edit button is rendered DISABLED (not hidden) for non-text or large files so the affordance is discoverable; click on disabled writes inline error rather than opening modal.
- Recursive-delete checkbox is the ONLY enabler for the directory delete button — file deletes get a single confirm button with no checkbox, mirroring `removeContainer` UX.
- Drop zone uses `useDropzone` with `noClick: false` so users can drag-drop AND click-to-browse; uploads are sequential to avoid hammering the multipart endpoint.
- Download is a same-origin `<a download>` anchor (not fetch+blob) — auth cookie rides automatically; tRPC can't carry tar streams anyway.
- **Rule 3 deviation:** `docker.containerWriteFile` and `docker.containerDeleteFile` were missing from `httpOnlyPaths` in Plan 18-01 — added in this plan. Without it, mutations would silently hang on disconnected WS clients per CLAUDE.md known-pitfall.
- Pattern carried forward to future v28 expansions (file preview, chmod UI, chunked upload): the component's `currentPath` is the single source of truth for both display and uploads — adding modes is pure addition, no restructuring.

### Plan 18-01 Decisions (2026-04-24)

- Module-local Dockerode in `container-files.ts` — mirrors docker-exec-socket / docker-logs-socket; the connection is just `/var/run/docker.sock` so per-module instantiation is essentially free.
- Custom `demuxDockerStream` (vs reusing `stripDockerStreamHeaders`) so non-TTY exec can separate stdout from stderr — needed to surface accurate context on `[ls-failed]` / `[read-failed]` / `[delete-failed]`.
- `writeFile` uses `archiver` tar + `container.putArchive` (binary/multiline-safe). No `echo > file` shell-out.
- REST endpoints (not tRPC) for download + upload because tRPC is JSON-only — `/api/docker/container/:name/file` GET (tar stream) and POST (multipart). Both gated by `LIVINITY_SESSION` cookie via `verifyToken`, mirroring `/api/desktop/resize`.
- `busboy@1.6.0` chosen over `multer` — smaller dep, streaming parse, no tmp files. 110MB cap with explicit truncation→HTTP 413.
- Filename slashes stripped server-side (`replace(/[\\/]/g, '_')`) — defense against path-traversal even though the path is interpreted inside the container.
- Buffer/Stream casts (`as unknown as Uint8Array[]` / `NodeJS.WritableStream`) accepted as a one-line concession to stricter `@types/node` 22+ — Buffer extends Uint8Array, Busboy/PassThrough are Writables; runtime unchanged.
- Pattern carried forward to Plan 18-02: tRPC for JSON paths + REST for binary/multipart, all session-cookie-gated. `ContainerFileEntry` type drives both backend and UI.

### Carried from v26.0

- Deployment warning: REDIS_URL must be set on platform/web for SESS-03 instant teardown
- Stale comment at server/index.ts:984 refers to old recordAuthFailure name
- v25.0 tech debt: wa_outbox dead code, chunkForWhatsApp unused, Integrations menu label, linkIdentity() never called

### Pending Todos

None

### Blockers/Concerns

- Mini PC SSH direct IP (10.69.31.68) currently unreachable — deploys to bruce will need tunnel-based access or network reconnection

## Deferred Items

Items acknowledged and deferred at v27.0 milestone close on 2026-04-25:

| Category | Phase | Item | Status |
|----------|-------|------|--------|
| uat | 22-multi-host-docker | Remote TCP/TLS daemon connectivity | partial |
| uat | 22-multi-host-docker | Agent end-to-end connection + handshake | partial |
| uat | 22-multi-host-docker | Token revocation 5s SLA | partial |
| uat | 22-multi-host-docker | Agent round-trip latency < 100ms | partial |
| uat | 23-ai-powered-docker-diagnostics | AI Diagnose end-to-end (AID-01) | partial |
| uat | 23-ai-powered-docker-diagnostics | Generate from prompt end-to-end (AID-03) | partial |
| uat | 23-ai-powered-docker-diagnostics | Explain CVEs end-to-end (AID-04) | partial |
| uat | 23-ai-powered-docker-diagnostics | Proactive resource-watch alert generation (AID-02) | partial |
| uat | 23-ai-powered-docker-diagnostics | Resource-watch dedupe regression (AID-02) | partial |
| uat | 23-ai-powered-docker-diagnostics | AI Chat autonomous tool invocation (AID-05) | partial |
| uat | 23-ai-powered-docker-diagnostics | httpOnlyPaths runtime check (cross-cutting) | partial |
| verification | 22-multi-host-docker | 22-VERIFICATION.md status | human_needed |

All UAT items are deployment-time runtime tests — code paths are fully wired, only live-LLM round-trips and remote-host infrastructure tests remain. See `.planning/phases/22-multi-host-docker/22-HUMAN-UAT.md` and `.planning/phases/23-ai-powered-docker-diagnostics/23-HUMAN-UAT.md` for reproduction steps.

## Session Continuity

Last session: 2026-04-25T22:32:26.110Z
Stopped at: Completed 28-01-PLAN.md — Cross-container Logs section live (DOC-13). Multiplexed WS + grep + severity + live-tail; WS handler env-aware via getDockerClient. Plan 28-02 unblocked.
Resume with: `/gsd:plan-phase 26` to author Plan 26-01 (Resource Routes — Containers/Images/Volumes/Networks). Plan 25-02 shipped 5 task commits (4cfebf7b RED useTagFilter + e5d33252 GREEN tag chips + per-card Retry + be661a0e RED sortTopCpu + 128206f6 GREEN sort-top-cpu + use-top-cpu fanout + dad89657 TopCpuPanel + dashboard wiring) — Dashboard section now renders TagFilterChips ABOVE EnvCardGrid (single-select localStorage-persisted; auto-fallback on missing tag; hidden when no env has tags) + TopCpuPanel BELOW EnvCardGrid (top-10 cross-env containers by CPU% via bounded per-env candidate fanout; Logs/Shell/Restart quick-action chips per row; restart proactively disabled on protected containers; sonner toast on mutation). EnvCard's Unreachable banner now ships a Retry button (refetches single card's 6 queries via use-env-card-data's new refetch() callback). 33/33 dashboard tests pass + 61/61 UI docker route tests pass + UI build green + zero new typecheck errors in plan-touched files. v28.0 progress: Phase 24 + Phase 25 done; Phases 26-29 pending. Reusable patterns: bounded cross-env fanout (per-env cheap-call → top-N candidates → expensive-call fanout-on-candidates); localStorage-backed UI selection with auto-fallback; pure helpers at module scope for unit testing without @testing-library/react.
