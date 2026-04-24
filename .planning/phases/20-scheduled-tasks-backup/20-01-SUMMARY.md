---
phase: 20-scheduled-tasks-backup
plan: 01
subsystem: infra
tags: [scheduler, node-cron, postgresql, docker, jobs, cron, image-prune, container-update-check]

# Dependency graph
requires:
  - phase: 17-docker-quick-wins
    provides: pruneImages() / listContainers() / isProtectedContainer() — used by image-prune & container-update-check handlers
  - phase: 11-multi-user
    provides: PostgreSQL pool via getPool() and idempotent schema.sql apply on boot
provides:
  - PostgreSQL `scheduled_jobs` table (13 cols, 2 indexes) — persistent job definitions across livinityd restarts
  - `Scheduler` class wired into Livinityd lifecycle (start/stop/reload/runNow) with node-cron task registry + in-flight Set mutex
  - 3 default jobs seeded on first boot: image-prune (Sun 3am, enabled), container-update-check (daily 6am, enabled), git-stack-sync (hourly, disabled placeholder)
  - `BUILT_IN_HANDLERS` registry — Plan 20-02 will swap the volume-backup stub for the real handler
  - Public Scheduler.runNow() and Scheduler.reload() reserved for Plan 20-02 admin tRPC routes
affects: [20-02-backup, 21-gitops]

# Tech tracking
tech-stack:
  added: [node-cron@3.0.3, "@types/node-cron@3.0.11"]
  patterns:
    - "Job persistence: PG row is source of truth; node-cron tasks are stateless registrations rebuilt on every Scheduler.start()"
    - "Idempotent default seed via INSERT … ON CONFLICT (name) DO NOTHING — manually-disabled defaults survive restarts"
    - "In-flight Set mutex per jobId — concurrent cron firings are dropped (logged), not queued, mirroring the 'no overlapping prune' contract"
    - "Per-call getPool() — never cache pool at module load, mirrors database/index.ts module pattern"
    - "Built-in handler registry decoupled from runner — Plan 20-02 backup handler plugs into BUILT_IN_HANDLERS['volume-backup'] without touching scheduler/index.ts"

key-files:
  created:
    - livos/packages/livinityd/source/modules/scheduler/types.ts
    - livos/packages/livinityd/source/modules/scheduler/store.ts
    - livos/packages/livinityd/source/modules/scheduler/jobs.ts
    - livos/packages/livinityd/source/modules/scheduler/index.ts
  modified:
    - livos/packages/livinityd/source/modules/database/schema.sql
    - livos/packages/livinityd/source/index.ts
    - livos/packages/livinityd/package.json
    - livos/pnpm-lock.yaml

key-decisions:
  - "Picked node-cron 3.x over 4.x — 3.x is the long-stable line shipping ESM-compatible CommonJS for our `\"type\": \"module\"` package; 4.x has breaking API changes around schedule() options"
  - "Mutex via in-flight Set<jobId> — concurrent firings of the same job are dropped+logged rather than queued. Matches the 'idempotent maintenance' nature of these jobs (a 2nd image-prune mid-run is wasted work)"
  - "container-update-check shells out to `docker buildx imagetools inspect <ref> --format '{{json .Manifest}}'` (preferred) with `docker manifest inspect --verbose` fallback — avoids hand-rolling registry HTTP auth, gets multi-arch index digests for free, 15s timeout per call so a slow registry can't hang the job"
  - "Per-container failures in containerUpdateCheckHandler degrade gracefully — the entry gets `updateAvailable: null` + `error` string, the job overall stays 'success'. One unreachable registry must not blank-out the whole report"
  - "Digest-pinned refs (`sha256:…`) and `<none>` tags get `pinned: true` and skip remote lookup — comparison would be meaningless"
  - "git-stack-sync handler is shipped as a `status: 'skipped'` placeholder so Phase 21 can simply replace BUILT_IN_HANDLERS['git-stack-sync'] without DB migration. Default row is enabled=false so it doesn't spam logs hourly until Phase 21 turns it on"
  - "BUILT_IN_HANDLERS['volume-backup'] throws explicitly — a user who creates a volume-backup job in the UI before Plan 20-02 ships gets a clear error instead of a silent no-op"
  - "Scheduler.start() failures are caught and logged (non-fatal). Livinityd boots with scheduler=null behavior rather than crashing if PG is down — matches the existing initDatabase() fallback pattern"
  - "registerTask() validates cron expressions via cron.validate() before scheduling — invalid schedules log + skip rather than throw, preventing one bad row from killing the boot"
  - "Re-fetch fresh row inside runJob() before invoking handler — config or enabled flag may have changed since registration; if !enabled at fire time, the run is silently dropped"
  - "store.ts importing DEFAULT_JOB_DEFINITIONS from jobs.ts is a one-way runtime dependency (no cycle) — both files compile cleanly because jobs.ts has no imports from store.ts"

patterns-established:
  - "Scheduled job module shape (types.ts + store.ts + jobs.ts + index.ts) — Plan 20-02 backup module will mirror this layout (types/store/destinations/index)"
  - "JSONB output column for handler-specific results — image-prune writes {spaceReclaimed, deletedCount}; container-update-check writes {checked, updates, results: [...]}; backup will write {bytesUploaded, destination, checksum}"
  - "execa+timeout for shelling out to docker CLI — 15s per registry call is the upper bound; reject:false lets us inspect exitCode + stderr without try/catch noise"

requirements-completed: [SCH-01, SCH-02]

# Metrics
duration: 5min
completed: 2026-04-24
---

# Phase 20 Plan 01: Scheduler core + built-in jobs Summary

**node-cron-driven persistent scheduler with PG-backed `scheduled_jobs` table, in-flight Set mutex, and three built-in handlers (image-prune, container-update-check, git-stack-sync placeholder) wired into Livinityd lifecycle.**

## Performance

- **Duration:** 5 min
- **Tasks:** 3
- **Files modified:** 4 created + 4 modified = 8 total

## Accomplishments

- `scheduled_jobs` PG table (13 columns: id, name, schedule, type, config_json, enabled, last_run, last_run_status, last_run_error, last_run_output, next_run, created_at, updated_at) + 2 indexes (idx_scheduled_jobs_enabled, idx_scheduled_jobs_type), idempotent CREATE TABLE IF NOT EXISTS appended to existing schema.sql
- `Scheduler` class with start/stop/reload/runNow lifecycle, node-cron task registry, in-flight Set<jobId> mutex, cron.validate()-gated registration, and per-job re-fetch-before-run protection against stale config
- Three built-in job handlers: imagePruneHandler wraps existing pruneImages(); containerUpdateCheckHandler does buildx-imagetools-inspect / manifest-inspect digest comparison per non-protected container with 15s timeout; gitStackSyncHandler is a clean 'skipped' placeholder for Phase 21
- BUILT_IN_HANDLERS registry covers all 4 JobType values (volume-backup throws — Plan 20-02 will replace)
- DEFAULT_JOB_DEFINITIONS seeded on first boot via ON CONFLICT (name) DO NOTHING — image-prune (Sun 3am, on), container-update-check (daily 6am, on), git-stack-sync (hourly, off)
- node-cron@3.0.3 + @types/node-cron@3.0.11 added to livinityd package.json + pnpm-lock.yaml resolved
- Livinityd lifecycle integration: `this.scheduler = new Scheduler({logger: this.logger})` in ctor; `await this.scheduler.start()` in start() after TunnelClient/DeviceBridge init; `this.scheduler.stop()` added to the parallel-stop Promise.all in stop(). Scheduler.start() failure is caught and logged (non-fatal)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add scheduled_jobs table to schema and create scheduler types** — `0ac62751` (feat)
2. **Task 2: Implement store (PG CRUD + seed defaults) and built-in job handlers** — `d54b9e3c` (feat)
3. **Task 3: Implement Scheduler runner, install deps, and wire into Livinityd boot** — `9f3301ad` (feat)

## Files Created/Modified

**Created:**
- `livos/packages/livinityd/source/modules/scheduler/types.ts` — Shared types: ScheduledJobRow (DB shape), ScheduledJob (domain shape), JobType union, JobRunStatus, JobRunResult, BuiltInJobHandler signature, SchedulerLogger, rowToJob() converter
- `livos/packages/livinityd/source/modules/scheduler/store.ts` — PG CRUD: listJobs, getJob, getJobByName, listEnabledJobs, insertJob, updateJob (dynamic UPDATE with parameterized column allowlist), deleteJob, recordRunResult, seedDefaults (idempotent ON CONFLICT (name) DO NOTHING)
- `livos/packages/livinityd/source/modules/scheduler/jobs.ts` — Built-in handlers: imagePruneHandler (wraps pruneImages()), containerUpdateCheckHandler (buildx imagetools inspect + manifest inspect fallback, per-container error tolerance, pinned-ref handling), gitStackSyncHandler (skipped placeholder); BUILT_IN_HANDLERS registry; DEFAULT_JOB_DEFINITIONS array
- `livos/packages/livinityd/source/modules/scheduler/index.ts` — Scheduler class: constructor(logger), start() (seedDefaults + listEnabledJobs + registerTask per row), stop() (drain & clear task map), reload() (stop+start), runNow(jobId) (bypass cron, feed runJob directly), private registerTask() (cron.validate guard), private runJob() (mutex + fresh-row re-fetch + handler invoke + recordRunResult)

**Modified:**
- `livos/packages/livinityd/source/modules/database/schema.sql` — appended `CREATE TABLE IF NOT EXISTS scheduled_jobs (...)` + 2 indexes after device_audit_log block
- `livos/packages/livinityd/source/index.ts` — added `import Scheduler from './modules/scheduler/index.js'`; added `scheduler: Scheduler` field; instantiated in ctor; awaited start() in lifecycle (non-fatal try/catch); added stop() to parallel-stop Promise.all
- `livos/packages/livinityd/package.json` — added node-cron@^3.0.3 to dependencies, @types/node-cron@^3.0.11 to devDependencies
- `livos/pnpm-lock.yaml` — node-cron resolved (added 1 + updated lock entries)

## Decisions Made

See `key-decisions` in frontmatter. Key strategic choices:

- **node-cron 3.x over 4.x** — 4.x's reworked ScheduleOptions API would have required either a feature flag or a breaking dep upgrade later; 3.x is long-stable.
- **In-flight Set mutex over a queue** — these are idempotent maintenance jobs (image-prune, update-check); a queued 2nd run mid-run is wasted work, not lost work. Logged-and-dropped is the simpler, more predictable contract.
- **buildx imagetools inspect for remote digest** — the cleanest way to read multi-arch manifest indexes without writing OAuth flows for every registry. Falls back to `docker manifest inspect --verbose` for environments without buildx (older Docker installs).
- **Per-container error isolation in containerUpdateCheckHandler** — a single unreachable registry should not turn the whole daily report into a failure. Each entry carries its own error/digest/updateAvailable=null state.
- **volume-backup stub throws** — explicit failure if a user creates a volume-backup row before Plan 20-02 wires the real handler, vs silently no-oping which would be confusing.
- **git-stack-sync ships disabled** — Phase 21 will flip enabled=true via store.updateJob() once GitOps stack iteration logic exists. Until then, hourly logs would just be noise.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **pnpm install postinstall noise**: The repo-wide `pnpm install` at the start of Task 3 succeeded for all dependency resolution (node-cron + @types/node-cron added to lockfile and node_modules) but the existing `@livos/ui` postinstall script `mkdir -p ... && cp -r ...` failed because Windows `cmd` doesn't understand the Unix syntax. This is a pre-existing repo quirk documented in STATE.md (Plan 19-01 decision: "`pnpm --filter ui add ... --ignore-scripts` is required on Windows"). The package install itself completed correctly — verified node-cron is present in `livos/packages/livinityd/node_modules/node-cron` and `@types/node-cron/index.d.ts` resolves cleanly. Out-of-scope per scope-boundary rule.
- **Pre-existing typecheck noise**: `npx tsc --noEmit -p tsconfig.json` produces 324 errors repo-wide, all in pre-existing files (express types, jsonwebtoken, multiple @types/node duplicates from version skew). Zero errors in any of our new files (`scheduler/types.ts`, `store.ts`, `jobs.ts`, `index.ts`) or in our edits to `livinityd/source/index.ts`. Documented in STATE.md Plan 19-02 decisions as "deferred to v28". Out-of-scope per scope-boundary rule — livinityd runs via tsx (no compilation gate); the build hot path is `pnpm --filter @livos/config build && pnpm --filter ui build` which is orthogonal to livinityd source files.

## User Setup Required

None — no external service configuration required. The scheduled_jobs table is auto-applied on boot via the existing `initDatabase()` schema-replay path. All three default jobs are auto-seeded on first boot via `seedDefaults()`.

## Next Phase Readiness

**Ready for Plan 20-02 (Backup module + destinations + Settings UI):**
- Plan 20-02 will register a real volume-backup handler by replacing `BUILT_IN_HANDLERS['volume-backup']` (or extending via a `registerHandler(type, handler)` helper if scheduler grows). Pattern: backup module exports the handler from `backups/scheduled-handler.ts`, scheduler ImportS and overwrites the entry at module load.
- Plan 20-02 will add tRPC mutation routes `scheduler.list / upsert / delete / runNow` that delegate to `scheduler.reload()` and `scheduler.runNow()` — both methods are already public on the Scheduler class.
- Plan 20-02 admin UI (Settings > Scheduler) needs the runtime list — `store.listJobs()` is the source.

**Ready for Phase 21 (GitOps Stack Deployment):**
- Phase 21 will replace `BUILT_IN_HANDLERS['git-stack-sync']` with a real handler that iterates git-backed stacks, runs `git pull`, compares HEAD, and triggers `controlStack('pull-and-up')` (from Plan 17-02) when HEAD changed.
- Phase 21 must flip the seeded `git-stack-sync` row from enabled=false to enabled=true once the handler is shipped — either via a one-shot migration in 21's first plan or via the admin UI.

**No blockers.**

## Self-Check: PASSED

All 8 files exist on disk, all 3 task commits present in `git log`:

- FOUND: livos/packages/livinityd/source/modules/scheduler/types.ts
- FOUND: livos/packages/livinityd/source/modules/scheduler/store.ts
- FOUND: livos/packages/livinityd/source/modules/scheduler/jobs.ts
- FOUND: livos/packages/livinityd/source/modules/scheduler/index.ts
- FOUND: livos/packages/livinityd/source/modules/database/schema.sql
- FOUND: livos/packages/livinityd/source/index.ts
- FOUND: livos/packages/livinityd/package.json
- FOUND: livos/pnpm-lock.yaml
- FOUND: commit 0ac62751 (Task 1)
- FOUND: commit d54b9e3c (Task 2)
- FOUND: commit 9f3301ad (Task 3)

---
*Phase: 20-scheduled-tasks-backup*
*Completed: 2026-04-24*
