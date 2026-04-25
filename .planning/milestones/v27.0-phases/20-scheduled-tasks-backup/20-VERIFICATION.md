---
phase: 20-scheduled-tasks-backup
verified: 2026-04-24T00:00:00Z
status: passed
score: 11/11 must-haves verified
---

# Phase 20: Scheduled Tasks + Container Backup Verification Report

**Phase Goal:** node-cron-based scheduler for routine Docker maintenance (image prune, update check, git sync) + volume backup to S3/SFTP/local with encryption at rest.
**Verified:** 2026-04-24
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PostgreSQL `scheduled_jobs` table exists with 13 columns + 2 indexes, survives restart | VERIFIED | `schema.sql` lines 149-166: `CREATE TABLE IF NOT EXISTS scheduled_jobs` with all 13 columns (id, name, schedule, type, config_json, enabled, last_run, last_run_status, last_run_error, last_run_output, next_run, created_at, updated_at) + `idx_scheduled_jobs_enabled` + `idx_scheduled_jobs_type` |
| 2 | On livinityd boot, scheduler.start() seeds defaults + registers enabled jobs with node-cron + writes run results back | VERIFIED | `scheduler/index.ts`: `start()` calls `seedDefaults()` then `listEnabledJobs()` then `registerTask(job)` per row; `runJob()` calls `recordRunResult()` with status before + after handler invocation |
| 3 | Three default jobs seeded idempotently on first boot: image-prune (Sun 3am, enabled), container-update-check (daily 6am, enabled), git-stack-sync (hourly, disabled) | VERIFIED | `scheduler/jobs.ts` lines 191-201: `DEFAULT_JOB_DEFINITIONS` array with exact schedules and `enabled` values; `store.ts` `seedDefaults()` uses `ON CONFLICT (name) DO NOTHING` |
| 4 | Re-seed on second boot is no-op; manually-disabled defaults stay disabled | VERIFIED | `store.ts` `seedDefaults()` uses `ON CONFLICT (name) DO NOTHING`; existing rows untouched |
| 5 | image-prune handler calls pruneImages() and stores `{spaceReclaimed, deletedCount}`; container-update-check queries registry digests; git-stack-sync returns status='skipped' | VERIFIED | `jobs.ts`: `imagePruneHandler` wraps `pruneImages()` and returns `{spaceReclaimed, deletedCount}`; `containerUpdateCheckHandler` uses `docker buildx imagetools inspect` + `docker manifest inspect` fallback with 15s timeout; `gitStackSyncHandler` returns `{status: 'skipped', output: {reason: 'pending-phase-21'}}` |
| 6 | Job execution is mutex-safe: concurrent cron firings while a run is in-flight are dropped | VERIFIED | `scheduler/index.ts` `runJob()` checks `this.inFlight.has(job.id)` at entry; drops with log if already running; `finally` block removes from inFlight |
| 7 | All cron expressions are validated via node-cron's `validate()` before scheduling | VERIFIED | `scheduler/index.ts` `registerTask()`: `if (!cron.validate(job.schedule))` logs error and returns without scheduling; `routes.ts` Zod `cronSchedule` refine also validates on insert |
| 8 | Volume backup uses ephemeral alpine:latest container with volume mounted read-only at /data, streaming tar to destination without host staging | VERIFIED | `backup.ts` `streamVolumeAsTarGz()`: `createContainer` with `Binds: [{volumeName}:/data:ro]` + `AutoRemove:true` + `Cmd: ['tar','czf','-','-C','/','data']`; uses `demuxStream` to pipe stdout into `PassThrough` |
| 9 | Backup credentials (s3 secretAccessKey, sftp password/privateKey) encrypted via AES-256-GCM keyed off JWT secret, stored in Redis at `nexus:scheduler:backup-creds:{jobId}`, never in PG | VERIFIED | `backup-secrets.ts`: AES-256-GCM with `sha256(readFile(JWT_SECRET_PATH))` key; `REDIS_KEY = (jobId) => nexus:scheduler:backup-creds:${jobId}`; `routes.ts` upsertJob strips creds before `insertJob`/`updateJob`, routes them through `getBackupSecretStore().setCreds()` |
| 10 | 5 tRPC routes registered under adminProcedure: listJobs, upsertJob, deleteJob, runNow, testBackupDestination; 4 mutations in httpOnlyPaths | VERIFIED | `routes.ts` exports all 5 routes; `trpc/index.ts` mounts `scheduler` router; `common.ts` lines 90-93 list all 4 mutations under "Phase 20 — Scheduler mutations" comment |
| 11 | Settings > Scheduler UI section renders job list + Add Backup dialog with volume picker, destination form, Test Destination + Save wired to tRPC | VERIFIED | `scheduler-section.tsx` 792 lines; `SchedulerSection` export at line 185; `trpcReact.scheduler.listJobs/runNow/deleteJob/upsertJob/testBackupDestination` all wired; `settings-content.tsx` has `'scheduler'` in union, MENU_ITEMS entry with TbServerCog, `case 'scheduler'` in switch, `SchedulerSectionLazy` React.lazy import at line 1405 |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `livos/packages/livinityd/source/modules/database/schema.sql` | VERIFIED | `CREATE TABLE IF NOT EXISTS scheduled_jobs` appended at lines 149-166 with all 13 columns + 2 indexes |
| `livos/packages/livinityd/source/modules/scheduler/types.ts` | VERIFIED | Exports `ScheduledJobRow`, `ScheduledJob`, `JobType`, `JobRunStatus`, `JobRunResult`, `BuiltInJobHandler`, `SchedulerLogger`, `rowToJob` |
| `livos/packages/livinityd/source/modules/scheduler/store.ts` | VERIFIED | 204 lines; exports `listJobs`, `getJob`, `getJobByName`, `insertJob`, `updateJob`, `deleteJob`, `recordRunResult`, `listEnabledJobs`, `seedDefaults` |
| `livos/packages/livinityd/source/modules/scheduler/jobs.ts` | VERIFIED | 201 lines; exports `BUILT_IN_HANDLERS` (all 4 JobType keys including real `volumeBackupHandler`), `DEFAULT_JOB_DEFINITIONS` (3 entries) |
| `livos/packages/livinityd/source/modules/scheduler/index.ts` | VERIFIED | 136 lines; `Scheduler` class with `start()`, `stop()`, `reload()`, `runNow()`, mutex via `inFlight Set` |
| `livos/packages/livinityd/source/index.ts` | VERIFIED | Imports `Scheduler`, `scheduler: Scheduler` field, `new Scheduler({logger})` in ctor, `await this.scheduler.start()` after initDatabase, `this.scheduler.stop()` in Promise.all |
| `livos/packages/livinityd/source/modules/scheduler/backup-secrets.ts` | VERIFIED | 105 lines; exports `createBackupSecretStore`, `BackupSecretStore`, `getBackupSecretStore`; AES-256-GCM with JWT-derived key; `nexus:scheduler:backup-creds:{jobId}` Redis keys |
| `livos/packages/livinityd/source/modules/scheduler/backup.ts` | VERIFIED | 322 lines; exports `volumeBackupHandler`, `testDestination`, `BackupDestination`, `S3DestinationConfig`, `SftpDestinationConfig`, `LocalDestinationConfig`; all 3 destination uploaders implemented |
| `livos/packages/livinityd/source/modules/scheduler/routes.ts` | VERIFIED | 188 lines; 5 routes; Zod discriminated union for destination; `cron.validate` refine; creds stripped from PG config |
| `livos/packages/livinityd/source/modules/server/trpc/index.ts` | VERIFIED | `import scheduler from '../../scheduler/routes.js'` + `scheduler` in appRouter |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | VERIFIED | `scheduler.upsertJob`, `scheduler.deleteJob`, `scheduler.runNow`, `scheduler.testBackupDestination` in `httpOnlyPaths` |
| `livos/packages/ui/src/routes/settings/_components/scheduler-section.tsx` | VERIFIED | 792 lines; `SchedulerSection` export; job list table; AddBackupDialog with volume picker (docker.listVolumes), destination form (S3/SFTP/local), Test Destination + Save wired to tRPC |
| `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` | VERIFIED | `'scheduler'` in SettingsSection union; MENU_ITEMS entry; `case 'scheduler'` in switch; React.lazy import |
| `livos/packages/livinityd/package.json` | VERIFIED | `node-cron@^3.0.3` dep; `@types/node-cron@^3.0.11` devDep; `@aws-sdk/client-s3@^3.700.0`; `@aws-sdk/lib-storage@^3.700.0`; `ssh2-sftp-client@^11.0.0`; `@types/ssh2-sftp-client@^9.0.4` |

---

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `index.ts (Livinityd.start)` | `scheduler.start()` after initDatabase + apps | `this.scheduler.start()` at line 231, after TunnelClient/DeviceBridge block | WIRED |
| `scheduler/index.ts (Scheduler.start)` | `seedDefaults() + listEnabledJobs() + cron.schedule per row` | `for (const job of jobs) this.registerTask(job)` + `cron.schedule(job.schedule, callback)` in `registerTask()` | WIRED |
| `scheduler/jobs.ts (imagePruneHandler)` | `pruneImages()` from docker.ts | `import {pruneImages} from '../docker/docker.js'`; called directly in handler | WIRED |
| `scheduler/jobs.ts (containerUpdateCheckHandler)` | Docker registry digest lookup | `execa('docker', ['buildx','imagetools','inspect',...])` + manifest inspect fallback with 15s timeout | WIRED |
| `scheduler/backup.ts (volumeBackupHandler)` | alpine:latest container + tar stream | `docker.createContainer({Image:'alpine:latest', Cmd:['tar','czf','-','-C','/','data'], Binds:[...], AutoRemove:true})` + `demuxStream` | WIRED |
| `scheduler/backup.ts (uploadToS3)` | `@aws-sdk/lib-storage` Upload | `new Upload({client, params:{Bucket,Key,Body:stream}}).done()` | WIRED |
| `scheduler/backup.ts (uploadToSftp)` | `ssh2-sftp-client` put | `new SFTPClient(); sftp.connect(...); sftp.put(stream, remoteFile)` | WIRED |
| `backup-secrets.ts (createBackupSecretStore)` | Redis HSET `nexus:scheduler:backup-creds:{jobId}` | `REDIS_KEY = (jobId) => nexus:scheduler:backup-creds:${jobId}`; `redis.hset(REDIS_KEY(jobId), encrypted)` | WIRED |
| `routes.ts (upsertJob)` | `Scheduler.reload()` after insert/update | `await ctx.livinityd.scheduler.reload()` after insertJob/updateJob | WIRED |
| `scheduler-section.tsx (form submit)` | `trpc.scheduler.upsertJob` mutation | `trpcReact.scheduler.upsertJob.useMutation` at line 432 | WIRED |
| `settings-content.tsx (SectionContent)` | `<SchedulerSection />` for section='scheduler' | `case 'scheduler': return <Suspense...><SchedulerSectionLazy /></Suspense>` at line 456; `React.lazy(() => import('./scheduler-section').then(m => ({default: m.SchedulerSection})))` at line 1405 | WIRED |

---

### Requirements Coverage

| Requirement | Plan | Description | Status |
|-------------|------|-------------|--------|
| SCH-01 | 20-01 | Scheduler module uses node-cron with persistent job definitions in PostgreSQL | SATISFIED — `scheduled_jobs` table in PG, node-cron@3.0.3 registered, Scheduler wired to Livinityd lifecycle |
| SCH-02 | 20-01 | Built-in scheduled tasks: image prune (weekly), container update check (daily), git stack sync (hourly) | SATISFIED — DEFAULT_JOB_DEFINITIONS with exact schedules; git-stack-sync ships disabled (placeholder for Phase 21) |
| SCH-03 | 20-02 | Container/volume backup scheduler with destinations: S3-compatible, SFTP, local filesystem | SATISFIED — `backup.ts` implements all 3 uploaders; `routes.ts` upsertJob creates volume-backup jobs |
| SCH-04 | 20-02 | Backups use ephemeral `alpine tar czf - /data` helper container piped to destination | SATISFIED — `streamVolumeAsTarGz()` in `backup.ts` creates alpine container with `Binds:volume:/data:ro` + `AutoRemove:true`, stdout streamed to uploader |
| SCH-05 | 20-02 | Settings UI has Scheduler section for enabling/disabling tasks and configuring destinations | SATISFIED — `scheduler-section.tsx` (792 lines) renders job list + Add Backup dialog; wired to all 5 tRPC routes; `settings-content.tsx` adds 'scheduler' menu item (admin-only, TbServerCog) |

---

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `scheduler/jobs.ts` (volume-backup was a stub in 20-01) | Previously throwing stub now replaced | N/A | Plan 20-02 correctly wired `volumeBackupHandler`; stub is gone |
| `scheduler/index.ts` | `runJob()` does not inFlight-delete on early returns (disabled job path) | Info | Line 103-105: `return` without `inFlight.delete` on disabled check — the `finally` block at line 130 ensures `inFlight.delete` always runs. No bug. |

No blocker or warning anti-patterns found. All implementations are substantive. No placeholder returns, no hardcoded empty data flows to rendering.

---

### Human Verification Required

#### 1. End-to-End Cron Execution

**Test:** Create a volume (`docker volume create test-vol`), open Settings > Scheduler, click Add Backup, pick test-vol, set destination=local path=/tmp/livinity-backup-test, schedule=`* * * * *`, save. Wait 60s.
**Expected:** Row shows Last Run < 60s ago, Status = Success; `ls /tmp/livinity-backup-test/test-vol-*.tar.gz` returns a non-zero file.
**Why human:** Requires a live livinityd process with Docker socket and PostgreSQL running.

#### 2. Test Destination Button

**Test:** Open Add Backup dialog, fill local path=/tmp/test-probe, click "Test Destination" button.
**Expected:** Toast shows "Connected (Xms, 22 bytes)"; probe file created and deleted.
**Why human:** Requires live backend and browser session.

#### 3. Credentials Not in PG

**Test:** Create an S3 backup job with dummy `secretAccessKey=mysecret`. Query `psql livos -c "SELECT config_json FROM scheduled_jobs WHERE name='<job>';"`. Then `redis-cli HGETALL nexus:scheduler:backup-creds:<id>`.
**Expected:** PG config_json has `accessKeyId` but NOT `secretAccessKey`. Redis hash contains an encrypted blob for `secretAccessKey`.
**Why human:** Requires live server with psql + redis-cli access.

#### 4. Scheduler.reload() Without Restart

**Test:** Create a backup job, change its schedule via tRPC upsertJob, wait for new schedule to fire.
**Expected:** Job runs on new schedule without livinityd restart.
**Why human:** Requires timed observation of cron behavior.

---

### Gaps Summary

No gaps. All automated verification checks passed.

---

_Verified: 2026-04-24_
_Verifier: Claude (gsd-verifier)_
