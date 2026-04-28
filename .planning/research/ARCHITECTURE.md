# Architecture Research — Backup & Restore (v30.0)

**Domain:** Full-system backup orchestration for self-hosted multi-user OS (PG + Redis + filesystem + secrets + per-app Docker volumes)
**Researched:** 2026-04-28
**Confidence:** HIGH (grounded in existing v27.0 Phase 20 + v29.0 Phase 33 patterns and read source)

---

## TL;DR — Architectural Verdict

1. **Orchestrator lives IN-PROCESS in livinityd**, in a NEW module `modules/system-backup/`, driven by the **existing Phase 20 scheduler**. Not a new daemon. Not a fork of the Phase 20 `volume-backup` handler.
2. **Phase 20 stays app-volume-scoped**, a new sibling handler `'system-backup'` joins `BUILT_IN_HANDLERS`. Cleaner separation: per-volume Docker streaming vs full-system snapshot are different problem shapes (PG dump needs `pg_dump`, Redis dump needs BGSAVE wait, neither maps to alpine-tar).
3. **Three new PG tables** (`backup_destinations`, `backup_history`, `backup_keys`) + reuse of `scheduled_jobs` for the schedule itself. No new "backup_jobs" table — that role is filled by `scheduled_jobs.type='system-backup'`.
4. **Bootstrap restore is a STANDALONE shell script** (`livos-restore.sh`) shipped in repo root, NOT a livinityd flag. livinityd cannot bootstrap itself when `/opt/livos` is gone.
5. **One master backup key per LivOS install** (not per-user), encrypted by the Phase 20-style JWT-derived KEK, with a recovery passphrase escrow file. Per-user encryption is misleading complexity — the OS owns all data and `pg_dump` of `livos` DB crosses user boundaries anyway.
6. **Build order: schema → key management → orchestrator skeleton + state machine → PG dump → Redis dump → filesystem → integrity manifest → destinations → scheduler integration → UI history → standalone restore CLI → install.sh integration → in-UI restore wizard → drill mode → escrow UX → AI alert integration**. UI lands AFTER backend is end-to-end testable, not first.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       UI LAYER (React 18 SPA)                         │
│  ┌──────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ Settings >       │  │ Schedules tab   │  │ "Backup Now" toast +│  │
│  │  Backup section  │  │  (Docker app)   │  │  progress overlay   │  │
│  └────────┬─────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │  tRPC (HTTP, in httpOnlyPaths)             │              │
└───────────┼──────────────────────┼─────────────────────┼──────────────┘
            │                      │                     │
┌───────────┴──────────────────────┴─────────────────────┴──────────────┐
│                    livinityd (Node 22, tsx, port 8080)                 │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  modules/system-backup/  ← NEW (this milestone)                │   │
│  │  ┌─────────────┐  ┌───────────────┐  ┌──────────────────────┐  │   │
│  │  │ orchestra-  │  │  state-machine │ │ sources/             │  │   │
│  │  │ tor.ts      │──│  (pending→     │ │   pg-dump.ts         │  │   │
│  │  │             │  │   running→     │ │   redis-dump.ts      │  │   │
│  │  │             │  │   uploading→   │ │   filesystem-tar.ts  │  │   │
│  │  │             │  │   verifying→   │ │   secrets.ts         │  │   │
│  │  │             │  │   complete)    │ │   docker-volumes.ts  │  │   │
│  │  └──────┬──────┘  └───────────────┘ └──────────┬───────────┘  │   │
│  │         │                                       │               │   │
│  │  ┌──────┴───────┐  ┌──────────────┐  ┌─────────┴────────────┐  │   │
│  │  │ key-vault.ts │  │ manifest.ts  │  │ destination.ts       │  │   │
│  │  │ (master key, │  │ (SHA-256 +   │  │ (REUSES Phase 20     │  │   │
│  │  │  escrow,     │  │  per-source  │  │  scheduler/backup.ts │  │   │
│  │  │  AES-256-GCM)│  │  size/hash)  │  │  uploaders verbatim) │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                         ▲                                              │
│  ┌──────────────────────┴───────────────────────────────────────────┐ │
│  │  modules/scheduler/  (existing, Phase 20)                        │ │
│  │  jobs.ts → BUILT_IN_HANDLERS['system-backup'] = systemBackupHandler│ │
│  │  store.ts → CRUD on scheduled_jobs (existing PG table reused)    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  modules/backups/  (existing kopia-based — UNTOUCHED, deprecated path) │
│  modules/database/ schema.sql ← +3 new tables                          │
└────────────────────────────────────────────────────────────────────────┘
                                 │
            ┌────────────────────┼────────────────────────┐
            ▼                    ▼                        ▼
   ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
   │ PostgreSQL     │  │ Redis            │  │ Filesystem            │
   │ (system, NOT   │  │ (passworded,     │  │ /opt/livos/data/      │
   │  Dockerized)   │  │  port 6379)      │  │   ├ secrets/          │
   │  livos DB      │  │   ↳ BGSAVE       │  │   ├ stacks/           │
   │  ↳ pg_dump     │  │   ↳ dump.rdb     │  │   ├ scheduled_jobs/   │
   └────────────────┘  └──────────────────┘  │   ├ update-history/   │
                                              │   └ backups/staging/* │
                                              │ /opt/nexus/.env       │
                                              │ /opt/livos/.env       │
                                              │ Docker volumes (per-  │
                                              │  user, enumerated)    │
                                              └──────────────────────┘
                                 │
                                 ▼  (encrypt → upload via Phase 20 uploaders)
                  ┌──────────────────────────────────┐
                  │ Destinations (S3 / SFTP / local) │
                  │ each backup = 1 manifest + N     │
                  │ source artifacts + 1 sentinel    │
                  └──────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Path | Responsibility | New / Modified |
|-----------|------|----------------|----------------|
| `system-backup/orchestrator.ts` | `livos/packages/livinityd/source/modules/system-backup/orchestrator.ts` | Owns the run lifecycle (acquire lock, drive state machine, emit progress events, finalize) | **NEW** |
| `system-backup/state-machine.ts` | same dir | Explicit state transitions + DB writes per transition (pending→running→uploading→verifying→complete\|failed) | **NEW** |
| `system-backup/sources/pg-dump.ts` | same dir | `pg_dump --format=custom` of `livos` DB to a passthrough stream | **NEW** |
| `system-backup/sources/redis-dump.ts` | same dir | `BGSAVE` + poll `LASTSAVE` + read `dump.rdb` | **NEW** |
| `system-backup/sources/filesystem-tar.ts` | same dir | tar of `/opt/livos/data/{stacks,secrets,scheduled_jobs,update-history}` (excludes `staging/` and `backup-mounts/`) | **NEW** |
| `system-backup/sources/secrets.ts` | same dir | Captures `/opt/livos/.env`, `/opt/nexus/.env`, `/opt/livos/data/secrets/jwt`, sealed under master key | **NEW** |
| `system-backup/sources/docker-volumes.ts` | same dir | Enumerates per-user containers via `user_app_instances` + extracts each volume via the **existing Phase 20 alpine-tar streaming** (delegates to `scheduler/backup.ts:streamVolumeAsTarGz`) | **NEW**, calls existing |
| `system-backup/key-vault.ts` | same dir | Master key generation, AES-256-GCM wrap with JWT-derived KEK, recovery escrow file | **NEW** |
| `system-backup/manifest.ts` | same dir | Builds + verifies the manifest.json (per-source SHA-256, sizes, schema version, LivOS git SHA) | **NEW** |
| `system-backup/destination.ts` | same dir | Thin shim that re-exports `uploadToS3 / uploadToSftp / uploadToLocal` from `scheduler/backup.ts` (DRY — no fork) | **NEW** |
| `system-backup/routes.ts` | same dir | tRPC: `systemBackup.listHistory`, `runNow`, `getRunStatus`, `setSchedule`, `addDestination`, `removeDestination`, `restoreDryRun`, `setMasterPassphrase`, `escrowDownload` | **NEW** |
| `scheduler/jobs.ts` | existing | Add `'system-backup'` to `JobType` union; register `systemBackupHandler` in `BUILT_IN_HANDLERS` | **MODIFIED** |
| `scheduler/types.ts` | existing | Extend `JobType` union with `'system-backup'` | **MODIFIED** |
| `database/schema.sql` | existing | Add `backup_destinations`, `backup_history`, `backup_keys` (idempotent `CREATE TABLE IF NOT EXISTS`) | **MODIFIED** |
| `server/trpc/index.ts` | existing | Mount `systemBackup` sub-router | **MODIFIED** |
| `server/trpc/common.ts` | existing | Add `systemBackup.runNow`, `systemBackup.getRunStatus`, `systemBackup.listHistory`, `systemBackup.restoreFull`, `systemBackup.runDrill` to `httpOnlyPaths` (long-running mutation pattern, identical to `system.update`) | **MODIFIED** |
| `index.ts` (livinityd entry) | existing | Construct `this.systemBackup = new SystemBackup(this)` next to `this.backups` and `this.scheduler` (lines 141-142). Wire `start()`/`stop()` into the lifecycle (lines 241-269) | **MODIFIED** |
| `livos-restore.sh` | repo root | Standalone bootstrap restore CLI: pulls backup → decrypts → restores PG/Redis/FS → restarts services | **NEW** |
| `install.sh` | repo root | Optional `--from-backup <url>` flag that detects the missing-LivOS bootstrap path and invokes `livos-restore.sh` after fresh install | **MODIFIED** |
| `ui/src/features/system-backup/` | UI tree | New feature dir: history list, destinations CRUD, run-now button, drill mode, restore wizard, master passphrase setup | **NEW** |
| `modules/backups/*` (kopia) | existing | UNTOUCHED. The kopia-based per-user file backup stays alongside as a separate concern. v30.0 supersedes its role for disaster recovery but does not delete it. | UNCHANGED |

---

## Recommended Project Structure (additive)

```
livos/packages/livinityd/source/modules/
├── system-backup/                  ← NEW (this milestone)
│   ├── orchestrator.ts             ← run lifecycle, lock, event bus
│   ├── state-machine.ts            ← state transitions + PG writes
│   ├── key-vault.ts                ← master key + JWT-KEK + escrow
│   ├── manifest.ts                 ← manifest.json generation/verification
│   ├── destination.ts              ← re-exports from scheduler/backup.ts
│   ├── sources/
│   │   ├── pg-dump.ts
│   │   ├── redis-dump.ts
│   │   ├── filesystem-tar.ts
│   │   ├── secrets.ts
│   │   └── docker-volumes.ts
│   ├── store.ts                    ← CRUD on backup_destinations / backup_history
│   ├── routes.ts                   ← tRPC router
│   ├── types.ts                    ← shared interfaces (BackupRun, ManifestV1, BackupSource)
│   └── system-backup.integration.test.ts
│
├── scheduler/                      ← existing
│   ├── jobs.ts                     ← MOD: register 'system-backup' handler
│   └── types.ts                    ← MOD: extend JobType union
│
└── database/
    └── schema.sql                  ← MOD: +3 tables

livos/packages/ui/src/features/
└── system-backup/                  ← NEW
    ├── index.tsx                   ← Settings > Backup section route
    ├── components/
    │   ├── history-table.tsx       ← reads systemBackup.listHistory
    │   ├── destination-form.tsx    ← S3/SFTP/local with test-connection
    │   ├── run-now-button.tsx
    │   ├── drill-mode-banner.tsx
    │   ├── restore-wizard.tsx
    │   └── master-passphrase-setup.tsx
    └── hooks/
        └── use-backup-progress.ts  ← polls getRunStatus every 1s during run

(repo root)
├── livos-restore.sh                ← NEW — standalone bootstrap restore
├── install.sh                      ← MOD: --from-backup flag
└── update.sh                       ← UNCHANGED
```

### Structure Rationale

- **Sibling to `scheduler/`, not nested inside it:** the orchestrator owns its own lifecycle (multi-source coordination, manifest, key vault). The scheduler only OWNS the cron firing — same pattern Phase 20's `volume-backup` already follows (handler in scheduler, but uploaders are independent destinations).
- **Sibling to `backups/`, not replacing it:** kopia module is per-user file-tree backups using kopia repositories at `/Backups` virtual path. v30.0 is full-system disaster recovery. Different consumers, different invariants — leave kopia alone, ship system-backup beside it.
- **`sources/` subdir:** each source is a self-contained Readable-stream factory (mirrors Phase 20 `streamVolumeAsTarGz` shape). Easy to test in isolation, easy to add `mongodb-dump.ts` later if some app installs Mongo.
- **UI lives in `features/system-backup/` (not folded into `backups/`):** the kopia UI uses its own wizard flow + tiles (`features/backups/` already has `setup-wizard`, `restore-wizard`, `tiles`). v30.0 is system-admin-scoped, lives under Settings, presents history-table-first not setup-wizard-first.

---

## PG Schema Additions (minimal, additive only)

```sql
-- =========================================================================
-- System Backup — v30.0
-- Three NEW tables. scheduled_jobs is REUSED (one row per backup schedule).
-- =========================================================================

CREATE TABLE IF NOT EXISTS backup_destinations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,             -- "off-site B2", "nas-sftp"
  type            TEXT NOT NULL CHECK (type IN ('s3','sftp','local')),
  config_json     JSONB NOT NULL DEFAULT '{}',      -- non-secret cfg (region, host, bucket, path...)
  -- Credentials (s3 secretAccessKey, sftp password/privateKey/passphrase) live
  -- in Redis under nexus:scheduler:backup-creds:{destinationId} via the
  -- existing backup-secrets.ts vault. Lifted-and-shifted: same vault works for
  -- destinations as it works for jobs (the vault is just keyed differently).
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backup_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID,                             -- nullable (manual run from UI has no scheduled_jobs row)
  destination_id  UUID NOT NULL REFERENCES backup_destinations(id) ON DELETE RESTRICT,
  trigger         TEXT NOT NULL CHECK (trigger IN ('scheduled','manual','drill')),
  triggered_by    UUID REFERENCES users(id) ON DELETE SET NULL,  -- null when scheduled
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  state           TEXT NOT NULL CHECK (state IN
                    ('pending','running','uploading','verifying','complete','failed','cancelled')),
  current_step    TEXT,                             -- "pg-dump" | "redis-dump" | "fs-tar" | "secrets" | "volumes" | "manifest" | "verify"
  bytes_total     BIGINT,                           -- sum of source bytes (post-encryption)
  duration_ms     INTEGER,
  error           TEXT,
  manifest_json   JSONB,                            -- the full manifest for restore (also uploaded to dest)
  remote_path     TEXT,                             -- e.g. "s3://bucket/livinity-backup-9f8e.../"
  schema_version  INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_history_state    ON backup_history(state);
CREATE INDEX IF NOT EXISTS idx_backup_history_started  ON backup_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_history_dest     ON backup_history(destination_id);

CREATE TABLE IF NOT EXISTS backup_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  active            BOOLEAN NOT NULL DEFAULT TRUE,           -- only one row should be active
  -- The 32-byte master key wrapped under JWT-derived KEK (same scheme as
  -- backup-secrets.ts → AES-256-GCM(iv12||tag16||ct)). NEVER readable in plaintext
  -- without the JWT secret PLUS this row.
  wrapped_master    TEXT NOT NULL,
  -- The same master key wrapped under a passphrase-derived KDF (Argon2id),
  -- offered as the user's "recovery escrow" — they download a JSON blob with
  -- this + the passphrase HINT (not the passphrase itself). If they lose the
  -- JWT (full disk loss), this is the only path to decrypt old backups.
  passphrase_wrapped TEXT,
  passphrase_hint   TEXT,
  argon2_params     JSONB,                                  -- {memory, iterations, parallelism, salt_b64}
  rotated_at        TIMESTAMPTZ,                             -- last rotation; old keys stay non-active for legacy backup decryption
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_keys_active ON backup_keys(active) WHERE active = TRUE;
```

**Why no `backup_jobs` table?** `scheduled_jobs.type='system-backup'` already covers it. One job row = one schedule + one destination via `config_json.destinationId`. Adding a separate `backup_jobs` would duplicate `name / schedule / config_json / enabled` columns. The `config_json` for a `'system-backup'` row carries `{destinationId, retention, sources?: [...]}` — sources defaults to "everything" but allows future per-source toggles.

**Why `destination_id` is `ON DELETE RESTRICT`:** orphan history rows would lose the ability to identify where the backup actually lives. The UI's "Delete destination" path forces the user to either delete its history first, or migrate history rows to a tombstone destination (kept separate from a hard delete).

**Why `passphrase_wrapped` is nullable:** First boot has no passphrase — admin sets it in the UI later (a banner persists in Settings until they do). The `wrapped_master` column always exists (auto-generated on first system-backup run), so admin can do JWT-only-wrapped backups even before setting a passphrase. The escrow path is the SECOND line of defense; it's not the only path.

---

## On-Disk Backup Layout

### Staging directory

```
/opt/livos/data/backups/
  staging/                                       ← per-run scratch dir
    <runId>/                                      (UUID matching backup_history.id)
      pg.dump.enc                                ← AES-256-GCM(pg_dump custom format)
      redis.rdb.enc
      fs.tar.gz.enc                              (selected /opt/livos/data subdirs)
      secrets.tar.enc                            (.env files + jwt secret)
      volumes/
        <username>-<appId>.tar.gz.enc            (per-user-per-app from Phase 20 streaming)
      manifest.json                              (UNENCRYPTED — see below)
      _SUCCESS                                   ← sentinel, written last
  history/                                       ← optional local archive of manifest+pointer
    <runId>.json                                 (manifest only, for quick local browsing)
```

### Manifest (the heart of the backup)

```json
{
  "schema_version": 1,
  "run_id": "9f8e...",
  "livos_version": "v29.1",
  "livos_sha": "91de77ff",
  "started_at": "2026-04-28T03:15:00Z",
  "finished_at": "2026-04-28T03:18:42Z",
  "key_id": "uuid-of-backup_keys-row",
  "wrapped_data_key": "base64...",   // per-run data key wrapped under master key
  "embedded_passphrase_wrapped": "base64...",  // copy of backup_keys.passphrase_wrapped at run-time
  "argon2_params": {"memory": 65536, "iterations": 3, "parallelism": 1, "salt_b64": "..."},
  "sources": [
    {"kind": "pg",         "filename": "pg.dump.enc",         "bytes": 12345678, "sha256": "..."},
    {"kind": "redis",      "filename": "redis.rdb.enc",       "bytes":   234567, "sha256": "..."},
    {"kind": "filesystem", "filename": "fs.tar.gz.enc",       "bytes":  4567890, "sha256": "...",
     "included_paths": ["/opt/livos/data/stacks", "/opt/livos/data/scheduled_jobs", "..."]},
    {"kind": "secrets",    "filename": "secrets.tar.enc",     "bytes":     2048, "sha256": "..."},
    {"kind": "volume",     "filename": "volumes/bruce-immich.tar.gz.enc",
     "user_id": "uuid", "username": "bruce", "app_id": "immich",
     "bytes": 123456789, "sha256": "..."}
  ],
  "destination": {"type": "s3", "bucket": "livinity-backups", "prefix": "9f8e.../"}
}
```

The manifest is **uploaded UNENCRYPTED**. It must be readable by `livos-restore.sh` BEFORE decryption — to identify the wrapped data key, list expected files, verify checksums during download, and feed Argon2 params into the passphrase-only restore path. The manifest contains zero plaintext secrets (the wrapped data key + wrapped master key are useless without either the JWT secret or the passphrase).

### Retention policy

- **Local staging:** keep until upload succeeds; delete-on-success unless `keepLocalCopy` flag set on destination.
- **Local destination type:** retention is a strict `keepLast: N` enforced at end-of-run (oldest run dirs deleted).
- **S3 / SFTP destinations:** retention is enforced by listing remote objects with `<prefix>/manifest.json`, parsing `started_at`, sorting, deleting oldest-first beyond `keepLast`. NEVER use S3 lifecycle rules — too easy to misconfigure and silently delete your only backup.

### Naming convention

`<runId>/` (UUID) — NOT timestamps. Why: prevents collisions on clock-skew, makes manual-vs-scheduled identical shape, makes drill-mode backups identifiable by querying `backup_history.trigger='drill'` rather than parsing filenames.

---

## Multi-User Permission Model

### Rules (enforced via `adminProcedure` middleware in `system-backup/routes.ts`)

| Action | admin | member | guest |
|--------|-------|--------|-------|
| `systemBackup.listDestinations` | ✓ | ✗ | ✗ |
| `systemBackup.addDestination` | ✓ | ✗ | ✗ |
| `systemBackup.runNow` | ✓ | ✗ | ✗ |
| `systemBackup.listHistory` (full system runs) | ✓ | ✗ | ✗ |
| `systemBackup.listMyAppBackups` (just `volumes/<myUsername>-*` rows) | ✓ | ✓ | ✗ |
| `systemBackup.restoreSingleApp` (only their own apps) | ✓ for any user, ✓ for self | ✓ for self only | ✗ |
| `systemBackup.restoreFull` (full system disaster recovery) | ✓ | ✗ | ✗ |
| `systemBackup.setMasterPassphrase` | ✓ | ✗ | ✗ |
| `systemBackup.downloadEscrow` | ✓ | ✗ | ✗ |

### One master key, NOT per-user

**Decision: single LivOS-wide master key.** Rationale:
1. **The PG `livos` DB and `pg_dump` are global.** They contain every user's password hashes, sessions, app instances. Per-user keys would either require splitting the dump (impractical — refs cross user boundaries) or still need an admin key for the cross-user portion.
2. **Per-app Docker volumes are owned by the OS, not the user.** Even though `user_app_instances.user_id` exists, the volume is at the Docker layer — only root/dockerd can read it. The user's UI password doesn't grant filesystem access.
3. **User passphrase loss = locked-out user.** Per-user passphrases mean a user forgetting theirs is unrecoverable; admin can't help. With one master key + admin escrow, admin can always recover.
4. **Trust model:** LivOS already runs everything as root in `livinityd`. The user does not have a privacy boundary against the OS itself. They have one against OTHER users (which the existing `is-authenticated.ts` middleware enforces) — but not against root. Pretending the backup system gives them a stronger boundary would be theater.

**Cross-user restore (admin scenario):** admin restoring after deleting user "alice" — UI presents "Restore alice's home directory + apps?" with a confirmation dialog. Audit-logged via the existing `device_audit_log` extension pattern (or a new `system_backup_audit_log` table mirroring its append-only trigger). Admin is the only role allowed to do this; the action is logged with `triggered_by` in `backup_history` and a new `audit_event` row.

### User-scoped UI ("My App Backups")

A separate UI panel (`SystemBackup > My Apps`) shows ONLY rows from `backup_history` whose manifest contains a volume for `currentUser.username`. This requires a JSONB query: `WHERE manifest_json @> '{"sources":[{"kind":"volume","username":"<u>"}]}'`. The user can trigger a partial restore of their own app data without admin involvement (calls `restoreSingleApp` with `appId` they own, validated via `user_app_instances.user_id = ctx.currentUser.id`).

---

## Restore-When-LivOS-Is-Broken (Bootstrap)

This is the chicken-and-egg problem. **Solved with a 100% standalone shell script** — no Node, no livinityd, no PG required at start.

### `livos-restore.sh` — standalone bootstrap restore CLI

Lives at repo root (committed alongside `install.sh` and `update.sh`). Workflow:

```
SCENARIO: User's hardware died. New machine. /opt/livos doesn't exist.

1. User runs: curl https://livinity.io/install.sh | bash -s -- --from-backup
2. install.sh detects --from-backup, prompts:
     - Destination URL or local path
     - S3 access key (or SFTP password)
     - Master passphrase (the recovery passphrase from escrow)
3. install.sh installs node + system PG + Redis + caddy + docker as usual
4. install.sh invokes livos-restore.sh with credentials
5. livos-restore.sh:
     a. List remote destination → find newest manifest.json
     b. Download manifest.json
     c. Prompt user to confirm runId, livos_version, started_at
     d. Derive KEK from passphrase via Argon2id (params from manifest)
     e. Unwrap masterKey from manifest.embedded_passphrase_wrapped
     f. Unwrap dataKey from manifest.wrapped_data_key
     g. Stream-download each source artifact, verify SHA-256, decrypt
     h. Restore PG: createdb livos, pg_restore < pg.dump
     i. Restore Redis: redis-cli FLUSHALL, copy dump.rdb to /var/lib/redis,
        systemctl restart redis
     j. Restore filesystem: tar -xzf fs.tar.gz -C /opt/livos/data
     k. Restore secrets: tar -xf secrets.tar -C / (puts back .env + jwt)
     l. For each volume in manifest:
          docker volume create --name=<volname>
          decrypt+pipe → docker run -i alpine tar xzf - -C /data
              -v <volname>:/data
     m. git clone utopusc/livinity-io @ manifest.livos_sha → /tmp/livos-src
     n. rsync /tmp/livos-src → /opt/livos (matches update.sh layout)
     o. pnpm install + npm install + builds (matches update.sh)
     p. echo manifest.livos_sha > /opt/livos/.deployed-sha
     q. systemctl restart livos liv-core liv-worker liv-memory
     r. Sentinel: write /opt/livos/data/.restore-completed-<runId>
6. livinityd boots, reads .restore-completed-*, surfaces "Restored from backup
   <runId> at <ts>" toast on login.
```

### Why a separate script (not a `livinityd` flag)

- **livinityd CAN'T boot when /opt/livos is gone.** It needs `node_modules/`, `.env`, JWT secret. These come FROM the restore. The script must be self-contained.
- **install.sh already exists** and already does fresh install. Adding a `--from-backup` flag that calls `livos-restore.sh` is the minimal seam.
- **Operational simplicity:** a sysadmin doing manual disaster recovery can run `bash livos-restore.sh --destination <url> --passphrase ...` directly. No "first install LivOS, then click in the UI to restore" dance.
- **No npm dependency:** `livos-restore.sh` uses only `curl`, `aws-cli` (or `s5cmd`), `openssl`, `tar`, `psql`, `redis-cli`, `docker`. All available before LivOS exists. Encryption uses `openssl enc -aes-256-gcm` — the same byte format the orchestrator writes (IV12 || tag16 || ciphertext, base64-decoded).

### `install.sh` integration

```bash
# install.sh additions (illustrative)
if [[ "$1" == "--from-backup" ]]; then
  # ... run normal install steps for system deps, NOT for /opt/livos source ...
  # then:
  bash "$(dirname "$0")/livos-restore.sh" --interactive
  exit $?
fi
```

The restore script is the AUTHORITATIVE post-install step in this mode — it writes `/opt/livos` rather than git-cloning fresh.

### Drill mode (test-restore that doesn't break production)

`livos-restore.sh --drill --target-prefix livos-drill-` mounts everything under `/opt/livos-drill-<runId>/`, restores PG into a SEPARATE database (`livos_drill_<runId>`), restores Redis into a fresh on-disk RDB but does NOT FLUSHALL the running Redis, restores Docker volumes with a `drill-` name prefix. After drill, `--cleanup-drill` tears it all down. Can be triggered from livinityd as `systemBackup.runDrill` — invokes the script over `execa`.

---

## Encryption Key Lifecycle

### Generation (first time)

```
On first system-backup run:
  1. Read /opt/livos/data/secrets/jwt → derive KEK = SHA-256(jwt)
     (matches existing scheduler/backup-secrets.ts pattern, lines 25-31)
  2. Generate masterKey = randomBytes(32)
  3. wrapped_master = AES-256-GCM-encrypt(masterKey, KEK)
  4. INSERT INTO backup_keys (wrapped_master, active=true, ...)
  5. UI banner: "Set your recovery passphrase" — until set, passphrase_wrapped is NULL
```

### Per-run data key (envelope encryption)

```
Per backup run:
  1. Generate dataKey = randomBytes(32)
  2. wrapped_data_key = AES-256-GCM-encrypt(dataKey, masterKey)
  3. Embed wrapped_data_key in manifest.json
  4. Each source artifact encrypted with dataKey
  5. dataKey discarded after run (zero out Buffer)
```

**Why envelope encryption:** per-run keys mean a single compromised artifact does not expose all backups. Restore needs only `masterKey + manifest.json`.

### Storage

- `wrapped_master` lives in PG `backup_keys` table. Lost with PG = lost without escrow.
- `passphrase_wrapped` lives in PG `backup_keys` table AND is offered as a JSON download (`escrow.json`) — admin SHOULD save this off-LivOS (USB stick, password manager).
- Master key in plaintext NEVER written to disk. Only held in Node memory during a backup or restore (clear after each run).

### Rotation

`systemBackup.rotateKey` mutation:
1. Generate `newMasterKey`.
2. New row in `backup_keys` with `active=TRUE`. Old row goes `active=FALSE`.
3. **Old backups are NOT re-encrypted.** Restore code reads `manifest.json.key_id` and unwraps with the matching key (or errors with "this backup needs the legacy key, run rotateKey --recover-old <id>").
4. UI shows a warning: "Backups taken before <ts> need the previous key — keep your old escrow file safe."

Re-encrypting all old backups is impractical (they live in S3 — 100GB re-pull-decrypt-encrypt-push is hours). The sane semantic is "key history": every key-id that was ever active stays in `backup_keys` (active=false), and restore picks the right one via manifest pointer.

### Recovery

- **JWT lost (full disk loss):** unwrap via passphrase escrow. Argon2id KDF on the recovery passphrase → KEK → unwraps `passphrase_wrapped` → masterKey. Embedded in `livos-restore.sh`.
- **Passphrase lost AND JWT lost:** backups are **unrecoverable**. UI is explicit about this when the user sets the passphrase: "If you lose this AND the LivOS install, your backups cannot be decrypted. Save the escrow file off-server."
- **Passphrase change:** doesn't re-encrypt old backups; sets new `passphrase_wrapped` for the SAME masterKey. Old escrow files keep working until masterKey rotates.

---

## State Machine

### States and transitions

```
                          ┌──────────┐
   tRPC runNow / cron ───▶│ pending  │
                          └────┬─────┘
                               │ (acquire lock; mutex check on
                               │  scheduler.inFlight + Redis lock
                               │  nexus:system-backup:lock)
                          ┌────▼─────┐
                          │ running  │  ── current_step = "pg-dump"
                          │          │  ── current_step = "redis-dump"
                          │          │  ── current_step = "fs-tar"
                          │          │  ── current_step = "secrets"
                          │          │  ── current_step = "volumes"
                          │          │  ── current_step = "manifest"
                          └────┬─────┘
                               │ (all sources written to staging,
                               │  manifest finalized)
                          ┌────▼─────┐
                          │uploading │  ── streams source files to destination
                          └────┬─────┘
                               │
                          ┌────▼─────┐
                          │verifying │  ── re-fetches manifest from dest, checks
                          │          │     each artifact's SHA-256 (HEAD or sample)
                          └────┬─────┘
                               │
                          ┌────▼─────┐         ┌────────┐
                          │ complete │         │ failed │ ◀── error at any step
                          └──────────┘         └────────┘
                                                    │
                                              ┌─────▼─────┐
                                              │cancelled  │ ◀── user clicks Cancel
                                              └───────────┘
```

### Transition implementation

Mirror the **v29.0 Phase 33 pending-rename pattern** for the destination side:
- Upload writes to `<remoteRoot>/<runId>-pending/` (S3: write objects with `-pending` prefix).
- After `verifying` succeeds: rename/move to `<runId>-success/` (S3: copy + delete; SFTP: rename dir).
- On failure: rename to `<runId>-failed/`. Pruner can sweep `*-failed` older than 7d.

This guarantees a partial upload is never visible to the listing — the manifest pointer in `backup_history` is set to the FINAL `*-success/` path only at end-of-run.

### Per-step DB writes

Each transition writes `backup_history.state` + `current_step` BEFORE attempting the step. This mirrors `scheduled_jobs.last_run_status='running'` writeback pattern from Phase 20 `scheduler/index.ts:runJob()` (line 106). If livinityd crashes mid-run, the row is left in `state='running'` and a startup hook in `system-backup/orchestrator.ts:start()` reaps it as `failed` with `error='livinityd restarted mid-run'`. (This is the kind of crash-reaper pattern Phase 20 doesn't have — adding it for v30.0 because backup runs are long enough to hit a real-world crash window.)

---

## Data Flow

### Backup write path (happy path)

```
[cron fires "system-backup-daily" job]
   ↓
[scheduler.runJob() → BUILT_IN_HANDLERS['system-backup'](job, ctx)]
   ↓
[systemBackupHandler → orchestrator.run({trigger: 'scheduled', destinationId, jobId})]
   ↓
[acquire Redis lock nexus:system-backup:lock NX EX 7200]
   ↓
[INSERT backup_history row, state='pending']
   ↓
[load masterKey via key-vault.unwrapMaster()]
   ↓
[generate dataKey, prep manifest skeleton]
   ↓
[mkdir /opt/livos/data/backups/staging/<runId>/]
   ↓ ───────── for each source ─────────
   │  [state='running', current_step='pg-dump']
   │      pg_dump --format=custom livos
   │        | crypto.createCipheriv(aes-256-gcm, dataKey)
   │        | createWriteStream(staging/pg.dump.enc)
   │      compute SHA-256 piggyback in transform stream
   │      write entry to manifest.sources
   │  ... same for redis-dump, fs-tar, secrets, each volume
   ↓ ────────────────────────────────────
[finalize manifest.json (UNENCRYPTED) in staging dir]
   ↓
[state='uploading']
   ↓
[for each file: destination.upload(stream, '<runId>-pending/<filename>')]
   ↓ (REUSES Phase 20 uploadToS3 / uploadToSftp / uploadToLocal verbatim)
   ↓
[state='verifying']
   ↓
[for each file: HEAD object → ETag/length check, fetch manifest back → byte-compare]
   ↓
[atomic rename: <runId>-pending/ → <runId>-success/]
   ↓
[UPDATE backup_history SET state='complete', finished_at=NOW(), remote_path=...]
   ↓
[apply retention: list <runId>-success/, prune oldest beyond keepLast]
   ↓
[delete /opt/livos/data/backups/staging/<runId>/]
   ↓
[release Redis lock]
   ↓
[notifications.add('backup-success-<runId>')]
```

### Restore read path (full disaster recovery, livinityd absent)

```
[user runs: bash install.sh --from-backup]
   ↓
[install.sh: install node + PG + Redis + caddy + docker]
   ↓
[install.sh: prompt for destination URL, credentials, recovery passphrase]
   ↓
[livos-restore.sh launches]
   ↓
[ls remote → find newest manifest.json]
   ↓
[download manifest.json (unencrypted)]
   ↓
[Argon2id(passphrase, salt from manifest) → KEK]
   ↓
[unwrap masterKey from manifest.embedded_passphrase_wrapped]
   ↓
[unwrap dataKey from manifest.wrapped_data_key]
   ↓ ───────── for each source in manifest.sources ─────────
   │  download <runId>-success/<filename>
   │  verify SHA-256 against manifest.source.sha256
   │  openssl enc -d -aes-256-gcm -K <dataKey> < file > /tmp/restore-<runId>/<plain>
   ↓ ─────────────────────────────────────────────────────
[restore PG: createdb livos, pg_restore -d livos < pg.dump]
   ↓
[restore Redis: stop redis, copy dump.rdb to /var/lib/redis/, start redis]
   ↓
[restore FS: tar xzf fs.tar.gz -C /opt/livos/data]
   ↓
[restore secrets: tar xf secrets.tar -C / (writes /opt/livos/.env, /opt/nexus/.env, /opt/livos/data/secrets/jwt)]
   ↓
[for each volume:
    docker volume create <name>
    docker run --rm -i -v <name>:/data alpine tar xzf - -C / < volume.tar.gz]
   ↓
[git clone utopusc/livinity-io @ manifest.livos_sha → /tmp/livos-src]
   ↓
[rsync /tmp/livos-src → /opt/livos (matches update.sh layout)]
   ↓
[pnpm install + npm install + builds (matches update.sh)]
   ↓
[echo manifest.livos_sha > /opt/livos/.deployed-sha]
   ↓
[systemctl enable + start livos liv-core liv-worker liv-memory]
   ↓
[touch /opt/livos/data/.restore-completed-<runId>]
   ↓
[user opens UI → login → toast: "Restored from backup <runId>"]
```

### Bootstrap diagram (the chicken-and-egg solved)

```
       ┌───────────────────┐
       │  Empty hardware   │
       │  (or wiped disk)  │
       └─────────┬─────────┘
                 │ user has: destination URL + creds + passphrase + escrow.json
                 ▼
       ┌─────────────────────┐
       │   curl install.sh   │
       │   --from-backup     │
       └─────────┬───────────┘
                 │
        ┌────────┴────────┐
        │ install system  │  ← node, pg, redis, caddy, docker
        │ deps (NO LivOS) │     (this much works without backup)
        └────────┬────────┘
                 │
                 ▼
       ┌──────────────────────┐
       │ livos-restore.sh     │  ← shell script, zero LivOS deps
       │ ── decrypt           │
       │ ── restore PG/Redis  │
       │ ── restore FS+secrets│
       │ ── restore volumes   │
       │ ── git clone @sha    │
       │ ── build + systemctl │
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │  livinityd up,       │
       │  reconciles state    │
       │  with restored DB    │
       └──────────────────────┘
```

---

## Concurrent Backup Safety

### Lock hierarchy

1. **Scheduler `inFlight` Set** (in-process, Phase 20 existing in `scheduler/index.ts:99`) — drops concurrent cron firings of the same `jobId`. ✓ Already works.
2. **Redis lock `nexus:system-backup:lock`** (cross-process, NEW) — `SET key 1 NX EX 7200` (2hr TTL safety). Held for the entire run. Prevents two SEPARATE livinityd processes (rare but possible during update.sh restart window) from running concurrent backups.
3. **PG advisory lock on the destination** (NEW) — `SELECT pg_try_advisory_lock(hashtext('backup-dest:' || destinationId::text))`. Prevents two DIFFERENT scheduled jobs targeting the same destination from clobbering each other's manifests.

### "Backup Now" + scheduled run collision

UX rule: **the first one wins, second one is rejected with a toast** "Backup already running, started <ts>." The Redis lock is the mechanism. NEVER queue (queueing means the second backup runs much later than user expected; users will assume their click "did nothing" and re-click). NEVER merge (different `runId`s, different histories — merging would create an incoherent manifest).

---

## Verification & Integrity

### Levels

| Level | When | What | Where surfaced |
|-------|------|------|----------------|
| **L1: per-source SHA** | Every backup, mid-run | Each source artifact's stream is hashed during write; manifest stores hash | manifest.json |
| **L2: post-upload HEAD** | Every backup, end-of-run | Verify each remote file's size + ETag (S3) or stat (SFTP/local) matches manifest | `backup_history.state='verifying'` |
| **L3: full read-back drill** | On-demand or scheduled monthly | Download every artifact, decrypt, verify SHA-256, restore into drill DB, run `pg_isready` + `redis-cli ping` against drill instances | `backup_history.trigger='drill'`, separate UI page "Drill History" |
| **L4: full restore test** | Manual, in-UI, admin-triggered | Run drill mode end-to-end, assert manifest is internally consistent | Drill report |

L3 is the only level that catches **storage rot** (S3 returning the right ETag but corrupted bytes — rare but real for cold storage like Glacier). Schedule it monthly by default, off-hours.

### Where surfaced

- **Backup history table** (`backup_history`): every run has a `state` column. UI shows green/red dot.
- **Settings > Backup > Drill page**: dedicated page for L3 results, with "Run drill now" button.
- **AI alert** (reuse `ai_alerts` table from Phase 23): on any L1/L2/L3 failure, insert a `severity='critical', kind='other'` row with `message='Backup verification failed: <details>'`. Existing AI alert UI surfaces it.
- **Notification** (reuse existing `notifications.add()`): toast on next admin login.

---

## Network Resilience

### Phase 20's existing behavior

Phase 20's `uploadToS3` uses `@aws-sdk/lib-storage Upload` which **already handles multipart and resumability for S3**. SFTP doesn't — `sftp.put(stream, ...)` is one-shot.

### v30.0 strategy

| Destination | Strategy |
|-------------|----------|
| **S3** | Trust lib-storage's multipart + retry. Configure `Upload({ client, params, queueSize: 4, partSize: 8MB, leavePartsOnError: false })`. On stream error, lib-storage aborts the multipart upload and the `<runId>-pending/` directory contains a 0-byte object — pruner sweeps it. |
| **SFTP** | NO mid-stream resume. On disconnect, abort. The `<runId>-pending/` partial file gets `rm`'d by the pruner OR by the next successful run. **Future mitigation:** chunked upload (split each source into 64MB parts named `<filename>.part-NNNN`), upload sequentially, manifest lists parts. On retry, list-existing-parts and skip uploaded ones. NOT in MVP — defer to Phase 2 of milestone. |
| **Local** | No resume needed. |

**MVP rule:** if the upload fails partway, the WHOLE run is marked `failed`. The next scheduled run starts fresh. Acceptable for v30.0 because:
- Backup duration is bounded (sub-hour for typical home server).
- Tunnel relay is the user's primary network path; if it's down, the next daily run works.
- Engineering chunked-resume is a 2-week project on its own — defer.

---

## Build Order (the answer to your last question)

### Phase ordering (each phase ships an independently-validatable slice)

**Phase 1 — Schema + Key Vault foundation**
- `database/schema.sql`: add 3 tables.
- `system-backup/key-vault.ts`: master key gen + JWT-KEK wrap + Argon2id passphrase wrap.
- `system-backup/types.ts`: shared interfaces.
- Tests: round-trip wrap/unwrap, escrow generation, rotation creates new active row.
- **Why first:** every other phase needs a place to write rows + a key. Foundational.

**Phase 2 — Orchestrator skeleton + state machine + lock**
- `system-backup/orchestrator.ts`, `state-machine.ts`, `store.ts`.
- Empty source list — orchestrator runs through all states with no-op sources.
- Crash-reaper at startup (`backup_history.state='running' AND started_at < NOW()-1h` → mark failed).
- Tests: state transitions write to DB, lock is acquired/released, reaper cleans up.
- **Why second:** this is the integration backbone. Sources plug into it via a stable interface.

**Phase 3 — PG dump source**
- `system-backup/sources/pg-dump.ts`: `pg_dump --format=custom` to encrypted stream.
- First end-to-end run: orchestrator + key vault + pg-dump + LOCAL destination (no scheduler integration yet — invoke via test script or temporary tRPC).
- Tests: dump+restore round-trip into a drill DB.
- **Why third:** PG is the highest-stakes source (every user, every config, every audit row). Get it RIGHT first, then the rest is similar shape.

**Phase 4 — Redis dump source**
- `system-backup/sources/redis-dump.ts`: `BGSAVE`, poll until `lastsave` timestamp updates, copy `dump.rdb`.
- Tests: round-trip into a drill Redis on a different port.
- **Why fourth:** simpler than FS, builds confidence in source-plugin pattern.

**Phase 5 — Filesystem + secrets sources**
- `system-backup/sources/filesystem-tar.ts`, `secrets.ts`.
- Excludes are critical (don't backup `staging/`, don't backup `backup-mounts/`, don't backup any `node_modules/` if anyone ever moves them under `data/`).
- Tests: round-trip into a tmpdir.

**Phase 6 — Per-app Docker volumes source**
- `system-backup/sources/docker-volumes.ts`: enumerate `user_app_instances`, call existing Phase 20 `streamVolumeAsTarGz` for each.
- Tests: backup multi-user-installed app, restore into a fresh volume, container starts.

**Phase 7 — Manifest + integrity verification (L1 + L2)**
- `system-backup/manifest.ts`: build, sign (HMAC over manifest with masterKey), verify.
- L2 post-upload HEAD checks.
- Pending→success rename pattern.
- Tests: corruption-detection, missing-file detection, ETag mismatch detection.

**Phase 8 — S3 + SFTP + local destinations (lift from Phase 20)**
- `system-backup/destination.ts`: re-export Phase 20 uploaders.
- `backup_destinations` CRUD via `system-backup/store.ts` and `routes.ts`.
- Test-connection probe (reuse `testDestination` from Phase 20).
- Tests: 3 destination types, retention pruning.

**Phase 9 — Scheduler integration**
- Register `'system-backup'` in `BUILT_IN_HANDLERS`.
- Default seed: `{name: 'system-backup-daily', schedule: '0 3 * * *', type: 'system-backup', enabled: false}` (default OFF — admin must configure destination first).
- `runNow` wired through `Scheduler.runNow(jobId)`.
- Tests: cron fires, lock works, retention works.

**Phase 10 — UI history + run-now + destinations CRUD**
- `features/system-backup/index.tsx` + components.
- New tRPC routes wired through `httpOnlyPaths` in common.ts.
- Tests: e2e backup → history shows green; failure → red.

**Phase 11 — Standalone restore script (`livos-restore.sh`)**
- Pure shell + openssl + psql + redis-cli + docker.
- Tests: SCRIPTED — install fresh Ubuntu VM, restore from S3, verify livinityd boots and DB content matches.

**Phase 12 — install.sh `--from-backup` integration**
- Wire `livos-restore.sh` into install flow.
- "Restored from backup" toast on first login post-restore.

**Phase 13 — In-UI restore wizard (single-app + full-system)**
- "Restore single app" — admin picks a backup + an app, runs partial restore.
- "Restore full system" — admin gets a confirmation modal, runs script via execa.

**Phase 14 — Drill mode (L3 + L4)**
- `livos-restore.sh --drill` mode.
- `systemBackup.runDrill` tRPC route.
- Drill history page in UI.
- Default-disabled monthly cron (admin opts in).

**Phase 15 — Recovery escrow + master passphrase UX**
- "Set master passphrase" wizard.
- "Download escrow file" button.
- Banner persisting until set.
- Tests: passphrase-only restore (no JWT) round-trip in drill mode.

**Phase 16 — Verification UX + AI alert integration**
- Surface failures via `ai_alerts` (Phase 23) + notifications.
- "Last successful backup" widget on dashboard.

### Why this order

- **Schema before code, code before UI** (universal LivOS pattern).
- **Key vault before sources** (sources need encryption to write).
- **Orchestrator before sources** (sources plug into orchestrator interface).
- **Sources in risk order** (PG = highest stakes → tested first).
- **Manifest before destinations** (manifest is the integrity contract; destinations are just bytes-out).
- **Scheduler integration after one source works** (don't tie cron timing to half-built sources).
- **UI after orchestrator** (UI is a thin tRPC consumer; no point styling buttons that have no backend).
- **Standalone restore script after backup works** (you can't test restore without a real backup to restore FROM).
- **Drill last** (drill exercises every previous phase — perfect smoke test for the milestone).

---

## Architectural Patterns

### Pattern 1: Reuse Phase 20 destination uploaders, NOT fork

**What:** `system-backup/destination.ts` literally `export {uploadToS3, uploadToSftp, uploadToLocal} from '../scheduler/backup.js'`.

**When to use:** wherever an existing module already speaks your I/O protocol.

**Trade-offs:**
- ✅ DRY: one bug fix lands everywhere.
- ✅ Same credential vault works (Phase 20's `backup-secrets.ts` keyed by `jobId` — system-backup keys by `destinationId`, identical mechanism).
- ⚠️ Coupling: a future Phase 20 refactor that breaks the export shape will break system-backup. Mitigation: the exports are already named-and-exported; tests on both sides catch shape drift.

### Pattern 2: Source-plugin architecture (Readable stream factories)

**What:** every source exports `async function dumpFoo(): Promise<{stream: Readable, sizeHint?: number}>`. Orchestrator pipes stream → cipher → hasher → file. Adding a new source (e.g., MongoDB) means writing one more file matching that signature.

**When to use:** any pipeline with N sources and 1 sink shape.

**Trade-offs:**
- ✅ Testable in isolation.
- ✅ Cipher/hasher logic centralized — security review concentrates there.
- ⚠️ Lazy stream errors are subtle (the error fires on the first `read()` call, not at `await dumpFoo()` time). Mitigation: orchestrator wraps every pipe in try/catch and propagates as `current_step` failure.

**Example (sketch):**

```typescript
export interface BackupSource {
  kind: 'pg' | 'redis' | 'filesystem' | 'secrets' | 'volume'
  name: string  // unique per-run, e.g. "volume:bruce-immich"
  filename: string  // staging filename
  produce(): Promise<{stream: Readable, sizeHint?: number, metadata?: Record<string,unknown>}>
}

// orchestrator.ts (sketch)
for (const source of sources) {
  await stateMachine.setStep(runId, source.name)
  const {stream} = await source.produce()
  const hasher = crypto.createHash('sha256')
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv)
  let bytes = 0
  stream.on('data', (b) => { bytes += b.length })
  const out = createWriteStream(stagingPath(runId, source.filename))
  await pipeline(stream, hasher, cipher, out)
  manifest.sources.push({
    kind: source.kind, filename: source.filename, bytes, sha256: hasher.digest('hex'),
  })
}
```

### Pattern 3: Pending-rename atomicity (lifted from v29.0 Phase 33)

**What:** writes go to `<runId>-pending/`, success renames to `<runId>-success/`, failure to `<runId>-failed/`. Listing tooling and pruners ignore non-`*-success` directories.

**When to use:** any multi-file atomic publish to a non-transactional store (S3, SFTP, filesystem).

**Trade-offs:**
- ✅ No half-published backups visible.
- ✅ Pruner can sweep `*-failed`/`*-pending` older than retention window.
- ⚠️ S3 doesn't support directory rename — must do `CopyObject` for each file then `DeleteObject` (race window if interrupted). Mitigation: copy ALL files first, then delete from pending (idempotent).
- ⚠️ Pruner must be careful: a `<runId>-pending` dir from a CURRENTLY-RUNNING backup must not be swept. Mitigation: pending-age threshold (only sweep `*-pending` older than 24h).

### Pattern 4: PG row as durable state, in-memory as ephemeral cache

**What:** every state transition WRITES to `backup_history` BEFORE the action. In-process state is just a cache for streaming progress events.

**When to use:** any long-running operation that must survive process crashes.

**Trade-offs:**
- ✅ Crash-resilient: livinityd dies mid-run, restart picks up the row in `running` state and the reaper marks it failed (rather than orphaning silently).
- ✅ UI re-renders correctly after refresh — state is in DB, not memory.
- ⚠️ Write amplification: ~10 PG writes per backup run. At hundreds-of-runs-per-day scale this would matter; at tens-per-day for v30.0 it's noise.

---

## Anti-Patterns

### Anti-Pattern 1: Extending Phase 20's `volume-backup` handler to be the "system-backup"

**What people do:** "We already have `volume-backup`, just teach it to also dump PG and Redis."

**Why it's wrong:**
1. Phase 20's `volume-backup` is purpose-built for a SINGLE volume → tar.gz → upload. Single source, single destination, single artifact. Shoehorning multi-source orchestration into it requires rewriting `volumeBackupHandler` from the inside out.
2. The Phase 20 schema (`scheduled_jobs.config_json` carrying `volumeName`) doesn't fit "system" (no single volume — many sources).
3. A v30.0 bug in extended `volume-backup` could break the existing per-volume scheduled jobs that operators rely on.

**Do this instead:** new `'system-backup'` handler in `BUILT_IN_HANDLERS`. Coexist with `'volume-backup'`. Reuse the destination uploaders + credential vault, NOT the handler.

### Anti-Pattern 2: Per-user encryption passphrases

**What people do:** "Each user enters their own passphrase, their backups are encrypted with their key."

**Why it's wrong:**
- The PG dump is global. You can't per-user-encrypt the rows that belong to user A separately from rows that belong to user B — they share tables, FKs, etc.
- Users forget passphrases. Admin can't help. Their data is gone forever.
- Adds 5x complexity to the key model with zero security benefit (livinityd already runs as root and reads all user data anyway).

**Do this instead:** one OS master key with admin-controlled escrow. User-facing UI talks about "your data is backed up" without exposing the encryption layer.

### Anti-Pattern 3: Re-implementing pg_dump streaming yourself

**What people do:** "We'll use the `pg` driver to stream `COPY` from every table and serialize it ourselves."

**Why it's wrong:**
- pg_dump handles ordering, dependencies, sequences, extensions, stored procedures, indexes, constraints, large objects, foreign keys correctly. You will NOT get this right by hand.
- pg_restore is the matching tool — it handles parallel restore, dependency resolution, conflict modes (append vs replace).
- Custom format (`-Fc`) is compressed, manifested, parallel-restorable.

**Do this instead:** spawn `pg_dump --format=custom --no-owner --no-acl --dbname=livos`, pipe stdout to encryption stream. Restore via `pg_restore --clean --if-exists -d livos`. Leverage decades of PG engineering.

### Anti-Pattern 4: Trusting filesystem mtime/ctime as proof of backup freshness

**What people do:** "Our `last_run` column shows when the backup ran, that's freshness."

**Why it's wrong:**
- A run can succeed locally but the upload to S3 silently failed.
- An S3 object can be deleted after upload (lifecycle rule, malicious actor, accidental rm).
- Freshness is "the latest backup is RECOVERABLE" — not "we tried recently."

**Do this instead:** L2 post-upload verification (HEAD/stat) is REQUIRED for `state='complete'`. Optionally schedule monthly L3 drill. Surface "Last successful drill: <ts>" alongside "Last successful backup: <ts>" in the UI.

### Anti-Pattern 5: Live-restoring into the running PG database

**What people do:** drop the live `livos` DB, run `pg_restore` over it.

**Why it's wrong:**
- livinityd has open connections — DROP DATABASE will fail with "database is being accessed by other users."
- Even if it worked, mid-restore livinityd queries see partial data → undefined behavior, possible cascade DELETEs from FK violations.

**Do this instead:** restore via the standalone script that STOPS livinityd first, then DROP+RECREATE+pg_restore, then START. For partial in-UI restores (single app data), restore into a temp DB and SELECT INTO the live tables in a single transaction with proper FK ordering.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **Single-user, <10GB total** | Default config works. Daily full backup, 7-day retention, single destination. ~minutes per run. |
| **Multi-user, 10-100GB** | Same design. Bumps run time to tens-of-minutes. Consider increasing `keepLast` cap because S3 storage is cheap. |
| **Heavy app installs (DB-backed apps with 100GB+ Docker volumes — e.g., immich, nextcloud)** | The per-app volume backup dominates. Consider per-source frequency overrides: PG/Redis/FS daily; large volumes weekly. Implementable via `config_json.sources` per `'system-backup'` job. |
| **Multi-host (Phase 22 environments)** | Out of scope for v30.0. Volume backup currently runs on the local socket. Cross-environment backup needs a fleet-wide orchestrator — defer. |

### Scaling priorities (what breaks first)

1. **First bottleneck:** Docker volume tar streaming — large volumes (>100GB) can take >1hr and saturate the network during upload. Mitigation: per-source schedule overrides (weekly volumes, daily everything else).
2. **Second bottleneck:** PG write amplification on `backup_history` if N concurrent backup destinations are configured (multi-fanout). Mitigation: cap max concurrent backups at 1 via the global Redis lock.
3. **Third bottleneck:** Local staging dir disk usage. Default `/opt/livos/data/backups/staging/<runId>/` can balloon to 2x the largest volume. Mitigation: stream-not-stage where possible — pipe `pg_dump | encrypt | upload` directly without staging-to-disk for sources where rewindability isn't needed. (Tradeoff: lose the crash-recovery property where a failed upload can be re-uploaded from staging.)

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **PostgreSQL** | spawn `pg_dump` via execa, pipe stdout. spawn `pg_restore` via execa for restore. | NOT Dockerized on Mini PC — direct binary. Connection via `DATABASE_URL` from `/opt/livos/.env`. |
| **Redis** | `BGSAVE` via ioredis client + poll `LASTSAVE`. Read `dump.rdb` from `/var/lib/redis/`. | Password from `REDIS_URL`. Restore needs filesystem write access to `/var/lib/redis/`. |
| **Docker** | `dockerode` (already in livinityd) for volume enumeration. Reuse Phase 20 `streamVolumeAsTarGz` helper. | Per-user volume names from `user_app_instances.container_name` + per-app compose. |
| **S3 / B2 / R2 / Wasabi / MinIO** | `@aws-sdk/lib-storage Upload` (Phase 20 pattern). | Multipart auto-handles >5MB. Endpoint override for non-AWS. |
| **SFTP** | `ssh2-sftp-client` (Phase 20 pattern). | No mid-stream resume — partial uploads = run failure. |
| **systemd** | restore script invokes `systemctl restart livos liv-core liv-worker liv-memory`. | Matches `update.sh` restart pattern. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **system-backup ↔ scheduler** | system-backup REGISTERS a handler in `scheduler/jobs.ts` `BUILT_IN_HANDLERS`. Scheduler INVOKES it on cron fire. One-way: scheduler is dumb pipe. | Direct module import; no events/queues. |
| **system-backup ↔ database** | Direct `pg.Pool` queries via `getPool()` (matches scheduler/store.ts pattern). | No ORM — same convention as v29.0 Phase 33. |
| **system-backup ↔ key-vault** | In-process function calls. Master key held in module-level Buffer with timed clearing post-run. | Key NEVER serialized to event bus or logs. |
| **system-backup ↔ Phase 20 backup-secrets** | LIFT-AND-SHIFT: same `createBackupSecretStore(redis)`, keyed by `destinationId` instead of `jobId`. | Either share the existing helper with a key-prefix parameter, or add a sibling `backup-destination-secrets.ts`. Recommend the former (one less file). |
| **system-backup → notifications** | `livinityd.notifications.add('backup-success-<runId>')` and `'backup-failed-<runId>'`. Existing LivOS notifications. | Same pattern as kopia backup uses. |
| **system-backup → ai_alerts** | INSERT into `ai_alerts` on verification failure with `kind='other', severity='critical'`. Surfaces in Phase 23 AI alerts UI. | Reuse without modification. |
| **system-backup ↔ tRPC** | New router mounted in `server/trpc/index.ts`. Long-running mutations in `httpOnlyPaths`. | Mirror `system.update` pattern verbatim. |
| **install.sh ↔ livos-restore.sh** | `bash livos-restore.sh --interactive` from install.sh. Exit code propagated. | Same shell-CLI handoff pattern as install.sh ↔ Caddy config setup. |
| **livinityd ↔ livos-restore.sh** | livinityd reads `/opt/livos/data/.restore-completed-<runId>` on startup, surfaces toast, then deletes the marker. | Sentinel-file pattern; Phase 33 already uses similar pattern for update completion. |

---

## Decision Matrix: Extend Phase 20 vs New Handler

| Dimension | Extend `volume-backup` | New `system-backup` handler |
|-----------|------------------------|------------------------------|
| **Lines of changed code** | ~600 (rewrite handler internals) | ~200 in scheduler (one entry to `BUILT_IN_HANDLERS`); all logic in new module |
| **Risk to existing v27.0 ops** | HIGH — operators with active per-volume jobs might see regressions | NONE — new code path |
| **Schema changes** | scheduled_jobs.config_json grows a new variant | scheduled_jobs.config_json gets one new `type` enum value + 3 new tables |
| **Testability** | Coupled — `volume-backup` tests now have to cover system-scope too | Independent test surface |
| **Code clarity** | One handler doing two very different jobs (single-volume vs full-system) | Each handler one-purpose |
| **Reuse of Phase 20 IO** | Yes (already inside the file) | Yes (re-export from `scheduler/backup.ts`) |
| **Multi-host story (Phase 22)** | Tangled — `volume-backup` is local-only by design | Clean — `system-backup` defines its own envId scope |
| **Future extensibility (e.g., per-source-frequency, drill mode)** | Hostile — must keep `volume-backup` simple | Native — designed for it |

**Verdict: NEW handler.** The "extend" path saves nothing tangible (Phase 20 IO is already reusable via direct import) and pays a real cost in coupling and risk.

---

## Sources

- **Phase 20 implementation:** `livos/packages/livinityd/source/modules/scheduler/backup.ts`, `backup-secrets.ts`, `jobs.ts`, `store.ts`, `index.ts`, `types.ts` (read 2026-04-28)
- **Phase 20 schema:** `livos/packages/livinityd/source/modules/database/schema.sql` (`scheduled_jobs` table, lines 149-166)
- **v29.0 Phase 33 pending-rename:** `livos/packages/livinityd/source/modules/system/update.ts` + repo-root `update.sh` (the `-pending → -success` write-then-rename pattern)
- **Existing kopia-based backup module:** `livos/packages/livinityd/source/modules/backups/{backups.ts,routes.ts}` (read for understanding, NOT modified by v30.0)
- **Multi-user schema:** `livos/packages/livinityd/source/modules/database/schema.sql` (users, sessions, user_app_instances, user_app_access — read 2026-04-28)
- **tRPC HTTP-only path convention:** `livos/packages/livinityd/source/modules/server/trpc/common.ts` (mirror `system.update` pattern for long-running mutations)
- **livinityd lifecycle wiring:** `livos/packages/livinityd/source/index.ts` lines 141-269 (where `Backups` and `Scheduler` are constructed and started — system-backup mounts here as `this.systemBackup = new SystemBackup(this)`)
- **PROJECT.md v30.0 milestone scope:** `.planning/PROJECT.md` lines 151-176 (read 2026-04-28)
- **HARD RULE — only Mini PC matters; Server4/Server5 off-limits for v30.0 deploy targets** (per CLAUDE.md memory, 2026-04-27)

### Confidence

- **HIGH** on: schema design, orchestrator pattern, source-plugin pattern, reuse of Phase 20 (all grounded in read source).
- **HIGH** on: state machine + pending-rename atomicity (lifted directly from Phase 33).
- **MEDIUM** on: SFTP resume strategy (deferred to post-MVP — needs validation under real network drops on Mini PC tunnel).
- **MEDIUM** on: master key vs per-user (decision is opinionated; alternatives possible but tradeoffs documented).
- **LOW** on: drill mode L3/L4 details (depends on operational experience with first runs — first phase delivery may iterate the spec).

---
*Architecture research for: Backup & Restore (v30.0)*
*Researched: 2026-04-28*
