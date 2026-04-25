---
phase: 28
plan: 02
subsystem: ui
tags: [docker-app, activity-timeline, framer-motion, doc-14, unified-feed, filter-chips, click-through-routing]
requires:
  - phase: 22
    provides: dockerEvents tRPC route + env-aware getDockerClient(envId)
  - phase: 20
    provides: scheduler.listJobs + lastRun/lastRunStatus/lastRunError columns on scheduled_jobs
  - phase: 23
    provides: docker.listAiAlerts + AiAlert shape (severity collapse target)
  - phase: 24
    provides: DockerApp section switch + Phase 24 sections/activity.tsx placeholder
  - phase: 26
    provides: useDockerResource setSelectedContainer/Image/Volume/Network for click-through
  - phase: 28
    plan: 01
    provides: severity classifier + color-hash patterns (DOC-13 reusable patterns)
provides:
  - activity-timeline-section
  - unified-ActivityEvent-shape
  - dockerEvent-scheduledJob-aiAlert-mappers
  - useActivityFeed-hook-3-poll-composition
  - cross-env-aiAlert-client-filter
affects:
  - routes/docker/sections/activity.tsx
  - routes/docker/activity/
  - phase-29 (DOC-15 cross-container shell — reuses store-routing pattern, may extend palette to Activity events)
  - phase-30 (server-side env scoping for listAiAlerts will deprecate the client filter here)
tech-stack:
  added: []
  patterns:
    - "Pure mapper extraction for testability (mapDockerEvent / mapScheduledJob / mapAiAlert) — keeps the orchestration hook a thin shell"
    - "Const-array driven type unions (ACTIVITY_SOURCES + ACTIVITY_SEVERITIES) so adding a new source becomes a 2-place compile-enforced change (array + chip render code)"
    - "Severity collapse via small lookup helper — heterogeneous server severity vocabularies → single UI vocabulary at the mapper boundary"
    - "Three-query orchestration hook with shared poll cadence (5s refetch / 2.5s staleTime) returning aggregate isLoading/isError/errorMessages"
    - "AnimatePresence motion.li wrapping for fade-in-from-top on poll-driven list inserts; deterministic mapper ids enable stable React keys → diff inserts only the new top row"
    - "Cross-env client-side filter as defensive layer over a server route that returns global data (T-28-09 mitigation pending Phase 30 server-side scoping)"
    - "1-line re-export from sections/<id>.tsx → ../activity/<id>-section so DockerApp's SectionView switch stays untouched (mirrors Plan 28-01 sections/logs.tsx pattern)"
key-files:
  created:
    - livos/packages/ui/src/routes/docker/activity/activity-types.ts
    - livos/packages/ui/src/routes/docker/activity/activity-types.unit.test.ts
    - livos/packages/ui/src/routes/docker/activity/event-mappers.ts
    - livos/packages/ui/src/routes/docker/activity/event-mappers.unit.test.ts
    - livos/packages/ui/src/routes/docker/activity/use-activity-feed.ts
    - livos/packages/ui/src/routes/docker/activity/activity-filters.tsx
    - livos/packages/ui/src/routes/docker/activity/activity-row.tsx
    - livos/packages/ui/src/routes/docker/activity/activity-section.tsx
  modified:
    - livos/packages/ui/src/routes/docker/sections/activity.tsx
key-decisions:
  - "Severity collapse mapping: AiAlert 'critical' → ActivityEvent 'error', 'warning' → 'warn', 'info' → 'info'. The plan's interfaces specified the mapping; the collapse lives in mapAiAlert. Single severity vocabulary across all three sources keeps filter chips simple."
  - "Scheduler honest representation: lastRun is the LATEST run only (no separate run-history table per scheduler/types.ts). mapScheduledJob surfaces ONE event per job from its last_run column. lastRun=null → no event. lastRunStatus='running' → no event (not a 'completed' event)."
  - "Cross-env AI alert client filter: listAiAlerts is NOT env-scoped server-side (Phase 23 returns all alerts to admin). useActivityFeed filters client-side: keep alerts where environmentId === selectedEnvId || environmentId === null. This is the T-28-09 mitigation; server-side scoping is a Phase 30+ enhancement."
  - "5s poll cadence with 2.5s staleTime (half-interval) — matches Plan 25-01 D-01 precedent and CONTEXT.md decision. dockerEvents (≤200 events/req) is the heaviest call; alerts (≤200) and scheduler (≤50 jobs typical) are smaller. <1MB total per tick over a single env."
  - "AnimatePresence + motion.li wrapping for fade-in-from-top: deterministic mapper ids (id format documented in each mapper) provide stable React keys, so the diff inserts only the new top row when poll data changes. AnimatePresence handles 500 children fine (TopCpuPanel precedent in Plan 25-02)."
  - "No virtualization needed at the 500-row cap. mergeAndSort caps the unified feed at ACTIVITY_FEED_MAX=500 (older history lives in per-resource views). 500 row count is well within React's render budget; adding react-window/react-virtual would be premature."
  - "ScheduledJobInput.lastRun typed as Date | string | null — tRPC serializes Date → ISO string over the wire, but unit tests pass Date directly. The mapper normalizes either form via instanceof check. Documented inline."
  - "formatRelativeDate expects UNIX SECONDS (legacy port from server-control), NOT ms. The plan's note that the helper expects ms was wrong; verified against routes/docker/resources/format-relative-date.ts. ActivityRow converts via Math.floor(timestamp/1000)."
  - "Click-through routing centralized in ActivitySection's handleClick: docker container/ai-alert sourceId → setSelectedContainer + 'containers'; scheduler → 'schedules'; image/volume/network → matching section + select; daemon → 'dashboard'. Each branch is one if-block; no clever indirection."
  - "Const-array drives chip render order: ACTIVITY_SOURCES = ['docker', 'scheduler', 'ai'] and ACTIVITY_SEVERITIES = ['info', 'warn', 'error']. Order matters; documented in activity-types.ts that reordering requires coordination with chip render code."
patterns-established:
  - "Pure mapper layer: server shape → ActivityEvent. One mapper per source, each unit-tested independently. Hook becomes a thin orchestrator (Plan 24-02 D-12 / 25-01 / 28-01 waiver pattern: presentation/composition files don't get their own tests)."
  - "Const-array driven type unions: ACTIVITY_SOURCES / ACTIVITY_SEVERITIES double as both runtime chip render order AND TS union basis via `(typeof X)[number]`. Adding a member becomes a 2-place compile-enforced change."
  - "Three-query orchestration hook: same refetchInterval + staleTime across queries; aggregate isLoading/isError/errorMessages collected; useMemo wraps the merge so the feed only recomputes on data/envId change."
  - "Cross-env client-side filter: defensive layer when a backend route returns global data. Document the threat-model link (T-28-09) and the future server-side scoping plan inline."
  - "Single-select chip rows with explicit 'All' reset: one button row per filter, 'All' chip is the explicit reset (clicking the active chip is a no-op, NOT a toggle). Mirrors Plan 25-02 TagFilterChips."
requirements-completed: [DOC-14]
threat-mitigations:
  - id: T-28-08
    status: accepted
    note: "Client-side mappers operate on server-validated data. Misclassification (e.g. wrong severity) is UI noise, not a security boundary."
  - id: T-28-09
    status: mitigated
    note: "Client-side filter `a.environmentId === envId || a.environmentId === null` in useActivityFeed prevents alerts from a different env surfacing in the current env's timeline. Server-side scoping is a Phase 30+ enhancement."
  - id: T-28-10
    status: accepted
    note: "5s × 3-query polling; smaller payloads than dashboard's already-in-prod 5s polling (Plan 25-01 D-01). dockerEvents ≤200/req, scheduler ≤50 jobs, alerts ≤200 → <1MB/tick over a single env."
  - id: T-28-11
    status: accepted
    note: "No mutations on this surface — navigation only. Detail-panel actions (start/stop/restart) keep their existing audit trail (Phase 22 SEC-04)."
  - id: T-28-12
    status: not-applicable
    note: "No regex filter on this surface — only categorical chips. T-28-03 (logs grep) does not apply."
metrics:
  duration_minutes: 11
  tasks_completed: 3
  tasks_total: 3
  red_green_commits: 2
  feature_commits: 2
  total_commits: 4
  files_created: 8
  files_modified: 1
  vitest_added: 29
completed: 2026-04-25
---

# Phase 28 Plan 02: Activity Timeline Section Summary

**One-liner:** `/docker` Activity section replaces the Phase 24 placeholder — three existing tRPC sources (docker.dockerEvents env-aware + scheduler.listJobs + docker.listAiAlerts) merge through pure per-source mappers into a unified ActivityEvent feed with source/severity filter chips, deterministic React keys for AnimatePresence fade-in-from-top on 5s polls, and click-through routing into ContainerDetailSheet / SchedulesSection / matching resource detail panels. DOC-14 closed; Phase 28 complete.

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-25T22:35:47Z
- **Completed:** 2026-04-25T22:47:00Z
- **Tasks:** 3 (1× TDD split into RED + GREEN, 2× single feat commit)
- **Files created:** 8
- **Files modified:** 1
- **Total commits:** 4 task commits

## Accomplishments

1. **DOC-14 surface live.** ActivitySection renders the unified timeline inside DockerApp's Activity section. Phase 24 placeholder ("Coming in Phase 28 — Global event timeline") is gone (`grep -r` returns empty).
2. **Unified ActivityEvent shape + 3 pure mappers** with 29 unit tests (5 types + 24 mapper cases). Each mapper translates one server shape (DockerEvent / ScheduledJob / AiAlert) into ActivityEvent. mergeAndSort dedups by deterministic id, sorts DESC by timestamp, caps at 500.
3. **useActivityFeed hook** composes three tRPC `useQuery` calls (5s refetchInterval / 2.5s staleTime) and runs the mappers inside a single `useMemo`. Cross-env client filter on AI alerts (T-28-09 mitigation: keep alerts where `environmentId === envId || environmentId === null`).
4. **Filter chips + click-through routing.** ActivityFilters: two single-select chip rows (source All/docker/scheduler/ai with tabler icons; severity All/info/warn/error with tone-colored active state). ActivitySection's handleClick routes to setSelectedContainer/Image/Volume/Network + setSection per source/sourceType.
5. **AnimatePresence fade-in.** motion.li wraps each ActivityRow with `initial={y:-8, opacity:0} animate={y:0, opacity:1}` so new rows from the 5s poll fade in at the top. Deterministic mapper ids → stable React keys → diff inserts only the new row.
6. **No new tRPC routes; no new tables.** The plan's CONTEXT.md decision was honored: three existing queries (docker.dockerEvents env-aware from Phase 22, scheduler.listJobs from Phase 20, docker.listAiAlerts from Phase 23) are sufficient.

## Task Commits

1. **Task 1 RED: failing tests for activity-types + event-mappers** — `b84025b6` (test)
2. **Task 1 GREEN: activity types + 3 mappers + mergeAndSort** — `f96f6173` (feat)
3. **Task 2: useActivityFeed — 3 tRPC polls into unified stream** — `a2278a86` (feat)
4. **Task 3: ActivityFilters + ActivityRow + ActivitySection + sections/activity.tsx** — `a0a07860` (feat)

(Phase metadata commit follows this SUMMARY.)

## Files Created/Modified

### Created (8)

**Pure helpers (with paired unit tests, 29 cases total):**
- `livos/packages/ui/src/routes/docker/activity/activity-types.ts` — ACTIVITY_SOURCES + ACTIVITY_SEVERITIES const arrays, ActivitySource/ActivitySeverity/ActivitySourceType unions, ActivityEvent interface
- `livos/packages/ui/src/routes/docker/activity/activity-types.unit.test.ts` — 5 cases (const-array order, shape sanity per source)
- `livos/packages/ui/src/routes/docker/activity/event-mappers.ts` — mapDockerEvent / mapScheduledJob / mapAiAlert / mergeAndSort + ACTIVITY_FEED_MAX=500
- `livos/packages/ui/src/routes/docker/activity/event-mappers.unit.test.ts` — 24 cases (severity buckets, friendly titles, deterministic ids, dedup, stable sort)

**UI hook + components:**
- `livos/packages/ui/src/routes/docker/activity/use-activity-feed.ts` — three useQuery composition; cross-env AI alert client filter; aggregate isLoading/isError/errorMessages
- `livos/packages/ui/src/routes/docker/activity/activity-filters.tsx` — two single-select chip rows (source + severity); tone-colored active state; tabler icons per source
- `livos/packages/ui/src/routes/docker/activity/activity-row.tsx` — left severity stripe + source icon + truncated title/body + subtype badge + relative timestamp; whole row is `<button>` for kbd a11y
- `livos/packages/ui/src/routes/docker/activity/activity-section.tsx` — composition: useActivityFeed + filters + AnimatePresence-wrapped rows; sticky header with "Showing N of M"; skeleton/empty/error states; click-through router

### Modified (1)

- `livos/packages/ui/src/routes/docker/sections/activity.tsx` — replaced placeholder body with 1-line re-export `export {ActivitySection as Activity} from '../activity/activity-section'` (mirrors Plan 28-01 sections/logs.tsx pattern)

## Decisions Made

(Captured in detail in frontmatter `key-decisions`. Key ones inline:)

1. **Severity collapse** in mapAiAlert: 'critical' → 'error', 'warning' → 'warn', 'info' → 'info'. Single severity vocabulary across all three sources keeps the filter chip set simple.
2. **Scheduler honest representation:** scheduler has no separate run-history table; ScheduledJob.lastRun is the LATEST run only. mapScheduledJob surfaces ONE event per job from last_run; lastRun=null → no event; lastRunStatus='running' → no event.
3. **Cross-env AI alert client filter** (T-28-09 mitigation): listAiAlerts is global server-side; useActivityFeed filters client-side to `environmentId === envId || environmentId === null`. Documented inline + in threat register.
4. **5s poll cadence + 2.5s staleTime** (half-interval) across all three queries — matches Plan 25-01 D-01 precedent.
5. **AnimatePresence fade-in-from-top.** Deterministic mapper ids → stable React keys → diff inserts only the new row. No virtualization at the 500-row cap.
6. **formatRelativeDate expects UNIX SECONDS, not ms.** The plan's note was wrong — verified against routes/docker/resources/format-relative-date.ts. ActivityRow converts `Math.floor(event.timestamp / 1000)`. Documented in inline comment so future maintainers see the gotcha.
7. **ScheduledJobInput.lastRun typed as Date | string | null** — tRPC serializes Date over the wire as ISO string but unit tests pass Date directly. Mapper normalizes via `instanceof Date` check. Inline JSDoc explains the duality.
8. **Click-through routing centralized in handleClick** — one if-block per branch; no router-table indirection. Mirrors the explicit list in CONTEXT.md decisions.routing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] formatRelativeDate timestamp unit mismatch**

- **Found during:** Task 3 (ActivityRow timestamp display)
- **Issue:** Plan note said "helper expects ms; ActivityEvent.timestamp is ms — confirmed compatible". Verified against `routes/docker/resources/format-relative-date.ts` — the helper actually expects UNIX SECONDS (verbatim port from legacy server-control/index.tsx). Passing ms would yield wildly wrong relative times ("2456 days ago" for current events).
- **Fix:** Convert at the call site: `formatRelativeDate(Math.floor(event.timestamp / 1000))` in activity-row.tsx. Inline comment documents the gotcha so future maintainers don't trip over it again.
- **Files modified:** `livos/packages/ui/src/routes/docker/activity/activity-row.tsx`
- **Verification:** Build green; manual unit-conversion math sanity-checked.
- **Committed in:** `a0a07860` (Task 3 commit)

**2. [Rule 3 - Blocking] Tabler icon Record<S, ComponentType> typecheck error**

- **Found during:** Task 3 typecheck
- **Issue:** `Record<ActivitySource, React.ComponentType<{size?: number; className?: string}>>` failed to assign Tabler icons because `@tabler/icons-react` exports `ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>`. Tighter ref type than `ComponentType` accepts.
- **Fix:** Used the canonical `Icon` type re-exported by `@tabler/icons-react` (precedent: `routes/docker/theme-toggle.tsx:10` does the same — `import {type Icon, IconDeviceLaptop, ...}`). Updated both `activity-filters.tsx` and `activity-row.tsx`.
- **Files modified:** `livos/packages/ui/src/routes/docker/activity/activity-filters.tsx`, `livos/packages/ui/src/routes/docker/activity/activity-row.tsx`
- **Verification:** `pnpm typecheck` reports no errors in `routes/docker/activity/`; build green.
- **Committed in:** `a0a07860` (Task 3 commit, alongside the source files)

**3. [Rule 3 - Blocking] ScheduledJobInput type mismatch with tRPC-deserialized Date | string**

- **Found during:** Task 2 typecheck
- **Issue:** Initial `ScheduledJobInput.lastRun: Date | null` failed typecheck against the actual tRPC return type `{ ... lastRun: string | null, ... }` because tRPC serializes Date → ISO string over the wire. The unit tests pass Date objects (because they construct ScheduledJob shapes directly), but the hook receives strings.
- **Fix:** Widened the input type to `Date | string | null` for lastRun/nextRun/createdAt/updatedAt. Added an `instanceof Date` normalizer at the use site in mapScheduledJob: `const ts = job.lastRun instanceof Date ? job.lastRun.getTime() : Date.parse(job.lastRun)`. Inline JSDoc explains the duality.
- **Files modified:** `livos/packages/ui/src/routes/docker/activity/event-mappers.ts`
- **Verification:** Both unit tests (Date input) and the hook's tRPC consumption (string input) typecheck cleanly. All 29 tests still pass.
- **Committed in:** `a2278a86` (Task 2 commit, alongside the hook)

---

**Total deviations:** 3 auto-fixes (1 Rule 1 - Bug, 2 Rule 3 - Blocking)
**Impact on plan:** All three were necessary to unblock execution and produce correct output. The formatRelativeDate fix is essential for correctness (users would have seen nonsense relative times); the two Rule 3 fixes were typecheck blockers. No scope creep — the plan's behavioural contract is unchanged.

## Issues Encountered

None during planned work. The three deviations above are documented + auto-fixed as documented.

## Self-Check: PASSED

**Files on disk (8 created, 1 modified — all confirmed present):**

- [x] `livos/packages/ui/src/routes/docker/activity/activity-types.ts`
- [x] `livos/packages/ui/src/routes/docker/activity/activity-types.unit.test.ts`
- [x] `livos/packages/ui/src/routes/docker/activity/event-mappers.ts`
- [x] `livos/packages/ui/src/routes/docker/activity/event-mappers.unit.test.ts`
- [x] `livos/packages/ui/src/routes/docker/activity/use-activity-feed.ts`
- [x] `livos/packages/ui/src/routes/docker/activity/activity-filters.tsx`
- [x] `livos/packages/ui/src/routes/docker/activity/activity-row.tsx`
- [x] `livos/packages/ui/src/routes/docker/activity/activity-section.tsx`
- [x] `livos/packages/ui/src/routes/docker/sections/activity.tsx` (modified — 1-line re-export)

**Commits in git log (verified via `git log --oneline -5`):**

- [x] `b84025b6` test(28-02): add failing tests for activity-types + event-mappers
- [x] `f96f6173` feat(28-02): activity types + DockerEvent/ScheduledJob/AiAlert mappers
- [x] `a2278a86` feat(28-02): useActivityFeed — compose 3 tRPC polls into unified ActivityEvent stream
- [x] `a0a07860` feat(28-02): Activity Timeline section — unified feed + filter chips + click-through (DOC-14)

**Tests passing:**

- [x] UI vitest: 29/29 in `src/routes/docker/activity/` (5 activity-types + 24 event-mappers)

**Build green:**

- [x] `pnpm --filter ui build` — green (vite + workbox PWA SW generated, 32s)
- [x] `pnpm --filter ui typecheck` — no new errors in `routes/docker/activity/` (pre-existing stories/widgets errors out of scope per scope-boundary rule)

**Placeholder gone:**

- [x] `grep -r "Coming in Phase 28 — Global event timeline" livos/packages/ui/src` returns empty (exit code 1)

## TDD Gate Compliance

- Task 1: RED commit `b84025b6` (test) → GREEN commit `f96f6173` (feat). Sequence verified.
- Task 2: Single feat commit `a2278a86` per plan `<action>` block (orchestration hook; testable mapping logic lives in Task 1 helpers — Plan 24-02 D-12 / 25-01 / 28-01 precedent for layout-files-as-smoke-test waiver).
- Task 3: Single feat commit `a0a07860` per plan `<action>` block (presentation/composition files; mapping + hook logic already covered by Tasks 1+2).

## Phase 28 Close-out

Both DOC-13 (Plan 28-01: Cross-Container Logs) and DOC-14 (Plan 28-02: Activity Timeline) are now satisfied. Phase 28 is complete.

Phase 29 (Shell + Registry + Palette + Settings — DOC-15..DOC-20) is unblocked. Patterns established here that Phase 29 can reuse:

- **3-query orchestration hook** with shared poll cadence + aggregate error reporting — applicable to any Phase 29 surface that needs to merge multiple polled tRPC queries (e.g., palette command index that pulls containers + stacks + jobs).
- **Click-through routing via store setters** — Phase 29 palette deep-links into resource detail panels can use the same pattern: `useDockerResource.getState().setSelectedX + useSetDockerSection()(section)`.
- **Cross-env client-filter as defensive layer** — applicable to any Phase 29 surface where the underlying route returns global data while the UI is env-scoped.
- **Const-array + chip-row pattern from ActivityFilters** — Phase 29 settings UI may use the same single-select chip rows for categorical filters.
- **AnimatePresence + deterministic mapper ids** — Phase 29 palette result list with live-update could use the same pattern for incoming/outgoing items.

## Next Phase Readiness

Phase 28 complete. Phase 29 (Shell + Registry + Palette + Docker Settings — DOC-15..DOC-20) can start. No blockers identified.

Carry-forward note for Phase 30+ planner: T-28-09 (cross-env AI alert leakage) is currently mitigated client-side. A backend listAiAlerts route extension (`environmentId` input filter) would be a small, isolated change that lets the client filter retire — file for Phase 30 backlog.

---

*Phase: 28-cross-container-logs-activity*
*Completed: 2026-04-25*
