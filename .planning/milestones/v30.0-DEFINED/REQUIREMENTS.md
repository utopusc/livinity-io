# Milestone v30.0 Requirements — Backup & Restore

**Milestone:** v30.0 — Backup & Restore
**Status:** Defined (pre-roadmap)
**Last updated:** 2026-04-28
**Source documents:** PROJECT.md, research/SUMMARY.md (HIGH confidence synthesis of STACK/FEATURES/ARCHITECTURE/PITFALLS)

## v1 Requirements (this milestone)

Goal: Korumalı, otomatize ve test-edilebilir backup/restore — kullanıcı LivOS'tan gönül rahatlığıyla self-host edebilsin, data kaybı korkusu olmasın.

Phase numbering: continues from v29.0 last phase 35 → v30.0 starts at Phase 36.

### Category: Foundation (BAK-CORE)

- [ ] **BAK-CORE-01**: Reuse-audit spike documents Phase 20 capabilities that DO and DO NOT scale to v30.0 multi-source multi-hour workloads (livinityd restart resilience, in-memory mutex limits, JWT-key blast-radius, back-pressure under network drops). Output: actionable decision matrix consumed by BAK-CORE-02.
- [ ] **BAK-CORE-02**: Three new PG tables — `backup_destinations`, `backup_history`, `backup_keys` — landed in `livos/packages/livinityd/source/modules/database/schema.sql`. Multi-destination, BAK-VERSION (manifest schema version), BAK-TZ (per-job timezone), `heartbeat_at` on `scheduled_jobs` from day 1 — schema changes are permanent.
- [ ] **BAK-CORE-03**: `system-backup/orchestrator.ts` runs the lifecycle state machine (pending → running → uploading → verifying → complete/failed/cancelled). Writes to `backup_history` BEFORE every transition (crash-resilient). Pending-rename atomicity at destination layer (`<runId>-pending/` → `<runId>-success/`) mirrors v29.0 Phase 33.
- [ ] **BAK-CORE-04**: Orchestrator pre-flight enforces: free-space `statvfs` check, destination reachability probe, key-vault unlock, no-running-update sentinel. Backup refuses to start if any precondition fails; reasons surfaced in run record + UI toast.
- [ ] **BAK-CORE-05**: Crash-reaper at livinityd startup marks orphaned `running` rows (no recent `heartbeat_at`) as `failed` with reason "livinityd restarted mid-run." Replaces Phase 20's in-memory `inFlight: Set` with PG-backed registry.

### Category: Sources (BAK-SRC)

- [ ] **BAK-SRC-01**: `pg-dump` source — `pg_dump --format=custom --compress=zstd:3` of `livos` DB; streams via Readable; cross-version-restorable; LSN recorded in manifest.
- [ ] **BAK-SRC-02**: `redis-dump` source — `redis-cli BGSAVE` + LASTSAVE poll + RDB copy; `lastsave` epoch recorded in manifest. No AOF.
- [ ] **BAK-SRC-03**: `filesystem-tar` source — zstd-compressed tar of selected `/opt/livos/data/` subdirs with hard-coded exclude allowlist (NEVER backs up `/`, `/proc`, `/sys`, `/dev`).
- [ ] **BAK-SRC-04**: `secrets` source — sealed `.env` + `/opt/livos/data/secrets/jwt` + Caddyfile streamed as encrypted bundle.
- [ ] **BAK-SRC-05**: `docker-volumes` source — enumerates `user_app_instances`, delegates to Phase 20's existing `streamVolumeAsTarGz()` helper. Per-app `docker pause` during tar (ms-scale freeze) for consistency.
- [ ] **BAK-SRC-06**: Application-level quiesce protocol via Redis pub/sub (`backup:quiesce` → subscribers finish writes, `backup:resume` releases). PG → Redis → FS snapshot ordering. Manifest records `quiesce_started_at` / `quiesce_ended_at`.
- [ ] **BAK-SRC-07**: `manifest.json` schema — per-source SHA-256, sizes, schema_version, livos_sha, key_id, wrapped_data_key, Argon2id params, quiesce timestamps, source-list. HMAC-signed with master key. Uploaded LAST after all sources land in `<runId>-pending/`.
- [ ] **BAK-SRC-08**: L1 verification — per-source SHA-256 hashed mid-stream during write; mismatch fails the run with reason in `backup_history.error`.

### Category: Destinations (BAK-DEST)

- [ ] **BAK-DEST-01**: Three destination types supported — local disk, S3-compatible (S3/B2/Wasabi/MinIO/R2), SFTP. `backup_destinations` CRUD via tRPC + UI.
- [ ] **BAK-DEST-02**: Destination uploaders re-export `uploadToS3` / `uploadToSftp` / `uploadToLocal` from existing Phase 20 `scheduler/backup.ts` verbatim — zero forking, one bug fix lands everywhere.
- [ ] **BAK-DEST-03**: Multi-destination per backup run (1 to 5 destinations); per-destination retry on partial fail; one destination succeeded → run is "partial success"; all failed → run is "failed". 3-2-1 enforcement: single-destination configs flagged red in UI.
- [ ] **BAK-DEST-04**: Append-only credentials by default — UI guides user to create application keys WITHOUT delete permissions (S3: no `s3:DeleteObject`; B2: no `deleteFiles`). Test-connection probes for delete permission and warns yellow if creds CAN delete.
- [ ] **BAK-DEST-05**: Retention policies — `keep_last N` + GFS daily/weekly/monthly. Server-side lifecycle preferred over client-side prune. Prune verifies `count <= keep_last + 1` post-execution; failure flagged.
- [ ] **BAK-DEST-06**: L2 verification — post-upload HEAD/ETag check on each destination after `Upload.done()`; mismatch fails the destination with reason in run record.
- [ ] **BAK-DEST-07**: Network-drop resilience — try/finally wrapping `Upload`; abort multipart on stream error (Pitfall 8). Whole-run failure on network drop, next scheduled run picks up. Chunked-upload mid-stream resume deferred to v30.1.

### Category: Encryption (BAK-CRYPT)

- [ ] **BAK-CRYPT-01**: 32-byte master key generated on first run, wrapped with KEK from separate file `/opt/livos/data/secrets/backup-key` (NOT JWT-derived). Factory reset rotating JWT MUST NOT silently brick existing backups.
- [ ] **BAK-CRYPT-02**: Per-run envelope encryption — random data-key wrapped under master key; embedded in manifest; per-archive DEK enables key rotation without re-encrypting old archives.
- [ ] **BAK-CRYPT-03**: `age-encryption` (typage) ^0.2.4 used as stream filter for non-kopia destinations + sealed secrets archives. Existing kopia path keeps its built-in encryption. Master key passed to age via stdin.
- [ ] **BAK-CRYPT-04**: Argon2id passphrase-wrapped escrow as second recovery line — user-set passphrase derives KEK that wraps master key independent of JWT-KEK path. Used by `livos-restore.sh` standalone.
- [ ] **BAK-CRYPT-05**: BIP39 24-word recovery code generated alongside passphrase setup. Recovery-kit modal at plan creation MUST show passphrase + BIP39 mnemonic + "We cannot recover this — save it now" warning. Modal cannot be dismissed without typing 3-of-24 verification words.
- [ ] **BAK-CRYPT-06**: Pre-flight key check on every Backup Now — orchestrator decrypts last archive's manifest header before starting; if decrypt fails, run is aborted with reason "key vault unlock failed."

### Category: Scheduling & Integration (BAK-SCHED)

- [ ] **BAK-SCHED-01**: `BUILT_IN_HANDLERS['system-backup']` registered with Phase 20 Scheduler. Default seed: `{name: 'system-backup-daily', schedule: '0 3 * * *', enabled: false, type: 'system-backup'}`. User opts in via UI.
- [ ] **BAK-SCHED-02**: Manual "Backup Now" trigger via tRPC `systemBackup.runNow({plan, tags})` wired through `Scheduler.runNow(jobId)`. Tags array stored on `backup_history` for provenance.
- [ ] **BAK-SCHED-03**: Pre-update auto-snapshot — `update.sh` calls `systemBackup.runNow({plan: 'pre-update', tags: ['pre-update', sha]})` BEFORE Phase 30/31 update steps. Update blocks until snapshot completes (or skips with warning if backup not configured). Turns Phase 32 binary rollback into full data rollback.
- [ ] **BAK-SCHED-04**: Backup ↔ update mutex — Redis lock `nexus:system-backup:lock` + `/opt/livos/data/backup-in-progress.flag` filesystem sentinel. update.sh pre-flight sleeps 5min if flag present, max 3 retries, then aborts update with explicit error. UI Install Update button disabled while backup running.
- [ ] **BAK-SCHED-05**: Schedule presets in UI — Daily 3am, Weekly Sunday 3am, Custom (cron expression). Cron-with-preview UI deferred to v30.1.

### Category: User Interface (BAK-UI)

- [ ] **BAK-UI-01**: Settings > Backup section — entry point. Subsections: Plan, Destinations, History, Recovery Kit, Drill. Tabbed layout matches Settings pattern.
- [ ] **BAK-UI-02**: Backup history table — reuses v29.0 Phase 33 LogViewer pattern verbatim. Columns: Timestamp, Status, Sources, Destinations, Size, Duration, Tags, Actions (View Log, Restore from this snapshot). Click row opens log viewer.
- [ ] **BAK-UI-03**: Destination CRUD UI — per-type form (local/S3/SFTP), test-connection button with delete-permission warning, append-only-credentials guidance text per-provider.
- [ ] **BAK-UI-04**: "Backup Now" button with type-to-confirm if user has unsaved work. Live progress (state-machine state + per-source progress) via tRPC subscription.
- [ ] **BAK-UI-05**: Recovery Kit setup — BIP39 generation flow (passphrase → mnemonic → printable PDF download → 3-of-24 verification → "I saved it" hard-confirm). Modal cannot be dismissed.
- [ ] **BAK-UI-06**: Sidebar status badge — green/yellow/red dot mirrors v29.0 Phase 34 pattern. Yellow if last successful drill > 14 days. Red if last 3 backups failed OR no encryption configured.
- [ ] **BAK-UI-07**: Failure notifications — in-UI toast on backup failure; optional email + webhook URL fields per plan. v30.1 ships PWA Web Push.
- [ ] **BAK-UI-08**: Long-running backup mutations added to `httpOnlyPaths` in `common.ts` (mirror `system.update` precedent).

### Category: Restore (BAK-RESTORE)

- [ ] **BAK-RESTORE-01**: `livos-restore.sh` standalone shell script — pure shell + openssl + psql + redis-cli + docker + tar. Zero Node dependency. Reads manifest, Argon2id KDF on passphrase, unwraps master key, decrypts each source, restores PG/Redis/FS/secrets/volumes, git clones at `manifest.livos_sha`, rsyncs to `/opt/livos`, runs builds, `systemctl restart`.
- [ ] **BAK-RESTORE-02**: `install.sh --from-backup <destination> <runId>` flag wires fresh-install bootstrap to `livos-restore.sh`. Solves chicken-and-egg disaster recovery (livinityd cannot bootstrap itself when /opt/livos is gone).
- [ ] **BAK-RESTORE-03**: Restore-pending recovery — livinityd boot-time check refuses to come up cleanly with maintenance page if previous restore was interrupted (`/opt/livos/data/restore-pending.json` exists). Half-shipped restore is worse than no restore.
- [ ] **BAK-RESTORE-04**: In-UI restore wizard — selective single-file restore (browse manifest tree), single-app restore (filtered by user_app_instances username), full-system restore (execa→livos-restore.sh). Type-to-confirm modal for in-place restore + automatic pre-restore snapshot insurance.
- [ ] **BAK-RESTORE-05**: Multi-user RBAC enforced on restore — admin sees all backups + can restore anything (logged to `device_audit_log` per Phase 15 immutability); user sees only backups containing their data + can only restore their own apps. Cross-user delegation token deferred to v30.1.
- [ ] **BAK-RESTORE-06**: Drill mode — `livos-restore.sh --drill --target-prefix livos-drill-` restores into ephemeral `livos_drill_<runId>` PG DB + scratch Docker volumes + tmpfs FS, runs `pg_isready` + sanity queries, tears down. Default-disabled scheduled monthly cron; admin opts in.
- [ ] **BAK-RESTORE-07**: L3 drill verification surfaces "Last successful drill: X days ago" UI metric. >14 days → yellow status badge. Drill failure → red badge + ai_alerts entry.
- [ ] **BAK-RESTORE-08**: Schema migration on restore — `manifest.livos_version` + `manifest.pg_schema_version` checked against current; restore proceeds if same major version, blocked with explicit error if cross-major. v30.0 supports same-minor-version restore only; cross-version migration deferred to v30.5+.

## Future Requirements (deferred)

Deferred to v30.1 (planned hotpatch milestone):

- Full AI-assisted restore guidance agent (Phase 23 `docker_diagnostics`-level integration) — v30.0 ships data plumbing only via BAK-UI-02 history surfacing
- Cgroup-escape for long-running backups via `systemd-run --scope --collect` (mirror v29.1 update.sh hot-patch timing)
- Object Lock full UX (S3 COMPLIANCE mode toggle) — v30.0 ships append-only credentials by default
- Bandwidth throttling / scheduled run windows
- Encryption key rotation UX (architecture supports it via wrap-key, but rotation UI deferred)
- Pre-/post-backup hooks (Borgmatic-style)
- Snapshot tagging UI + search
- "What changed" diff view between snapshots
- Cross-user delegation token flow (admin restore on behalf of departed user)
- PWA Web Push notifications on backup failure
- Cron-with-preview tab (presets-only at v30.0)
- Chunked SFTP mid-stream resume (whole-run-failure rule at v30.0)

Deferred to v31+:

- PITR for Postgres (WAL archiving) — too heavy for self-hosted single-host
- TPM-backed encryption / YubiKey hardware key
- P2P backup to friends' LivOS instances
- Hourly local snapshot tier (Time Machine model — needs ZFS/btrfs detection)
- Cross-environment backup (multi-host Docker per Phase 22 environments)
- Per-user encryption boundaries (current decision: one master key per LivOS install)

## Out of Scope

- **Proprietary backup format** — uses open formats (kopia, restic-compatible, zstd, age) so backups remain restorable even if LivOS dies
- **Vendor key escrow** ("we'll handle keys for you") — defeats Zero Trust model; user holds keys, BIP39 recovery code is the single source of truth
- **No-passphrase / "set up later" backups** — Kopia stance: refuse unencrypted. Encryption is mandatory at plan creation
- **Cloud-only managed default destination** — defeats self-hosted value proposition; user provides credentials or runs MinIO locally
- **Backup of `/` root filesystem** — unbounded, corrupts /proc /sys /dev. Hard-coded source allowlist
- **Real-time CDP / continuous replication** — wrong layer for homelab; backup = scheduled snapshots, not streaming
- **"Auto-detect what to back up" magic** — always wrong eventually. User explicitly selects sources per plan
- **Cross-tenant deduplication** — per-user data leakage risk; isolation per Phase 26 takes precedence
- **Email-based passphrase reset** — encryption theater; passphrase loss is final, BIP39 is the only path
- **Browser-based decryption** — key in JS context = exfiltration vector; restore happens server-side or via shell

## Traceability

| Requirement | Phase | Phase Name | Status |
|-------------|-------|------------|--------|
| BAK-CORE-01 | Phase 36 | Reuse-Audit Spike | Pending |
| BAK-CORE-02 | Phase 37 | Schema Foundation + Key Vault | Pending |
| BAK-CORE-03 | Phase 38 | Orchestrator + State Machine + PG Dump | Pending |
| BAK-CORE-04 | Phase 38 | Orchestrator + State Machine + PG Dump | Pending |
| BAK-CORE-05 | Phase 38 | Orchestrator + State Machine + PG Dump | Pending |
| BAK-SRC-01 | Phase 38 | Orchestrator + State Machine + PG Dump | Pending |
| BAK-SRC-02 | Phase 39 | Remaining Sources + Manifest + L1 Verify | Pending |
| BAK-SRC-03 | Phase 39 | Remaining Sources + Manifest + L1 Verify | Pending |
| BAK-SRC-04 | Phase 39 | Remaining Sources + Manifest + L1 Verify | Pending |
| BAK-SRC-05 | Phase 39 | Remaining Sources + Manifest + L1 Verify | Pending |
| BAK-SRC-06 | Phase 39 | Remaining Sources + Manifest + L1 Verify | Pending |
| BAK-SRC-07 | Phase 39 | Remaining Sources + Manifest + L1 Verify | Pending |
| BAK-SRC-08 | Phase 39 | Remaining Sources + Manifest + L1 Verify | Pending |
| BAK-DEST-01 | Phase 40 | Destinations + Retention + L2 Verify | Pending |
| BAK-DEST-02 | Phase 40 | Destinations + Retention + L2 Verify | Pending |
| BAK-DEST-03 | Phase 40 | Destinations + Retention + L2 Verify | Pending |
| BAK-DEST-04 | Phase 40 | Destinations + Retention + L2 Verify | Pending |
| BAK-DEST-05 | Phase 40 | Destinations + Retention + L2 Verify | Pending |
| BAK-DEST-06 | Phase 40 | Destinations + Retention + L2 Verify | Pending |
| BAK-DEST-07 | Phase 40 | Destinations + Retention + L2 Verify | Pending |
| BAK-CRYPT-01 | Phase 37 | Schema Foundation + Key Vault | Pending |
| BAK-CRYPT-02 | Phase 37 | Schema Foundation + Key Vault | Pending |
| BAK-CRYPT-03 | Phase 37 | Schema Foundation + Key Vault | Pending |
| BAK-CRYPT-04 | Phase 42 | UI - Recovery-Kit Modal (Argon2id passphrase escrow is UI-driven) | Pending |
| BAK-CRYPT-05 | Phase 42 | UI - Recovery-Kit Modal (BIP39 mnemonic flow + 3-of-24 verification) | Pending |
| BAK-CRYPT-06 | Phase 38 | Orchestrator pre-flight gates (key-vault unlock check) | Pending |
| BAK-SCHED-01 | Phase 41 | Scheduler + Pre-Update Auto-Snapshot + Update Mutex | Pending |
| BAK-SCHED-02 | Phase 41 | Scheduler + Pre-Update Auto-Snapshot + Update Mutex | Pending |
| BAK-SCHED-03 | Phase 41 | Scheduler + Pre-Update Auto-Snapshot + Update Mutex | Pending |
| BAK-SCHED-04 | Phase 41 | Scheduler + Pre-Update Auto-Snapshot + Update Mutex | Pending |
| BAK-SCHED-05 | Phase 41 | Scheduler + Pre-Update Auto-Snapshot + Update Mutex | Pending |
| BAK-UI-01 | Phase 42 | UI - History + Run-Now + Destinations + Recovery-Kit Modal | Pending |
| BAK-UI-02 | Phase 42 | UI - History + Run-Now + Destinations + Recovery-Kit Modal | Pending |
| BAK-UI-03 | Phase 42 | UI - History + Run-Now + Destinations + Recovery-Kit Modal | Pending |
| BAK-UI-04 | Phase 42 | UI - History + Run-Now + Destinations + Recovery-Kit Modal | Pending |
| BAK-UI-05 | Phase 42 | UI - History + Run-Now + Destinations + Recovery-Kit Modal | Pending |
| BAK-UI-06 | Phase 42 | UI - History + Run-Now + Destinations + Recovery-Kit Modal | Pending |
| BAK-UI-07 | Phase 42 | UI - History + Run-Now + Destinations + Recovery-Kit Modal | Pending |
| BAK-UI-08 | Phase 42 | UI - History + Run-Now + Destinations + Recovery-Kit Modal | Pending |
| BAK-RESTORE-01 | Phase 43 | Standalone Restore + Drill Mode + RBAC | Pending |
| BAK-RESTORE-02 | Phase 43 | Standalone Restore + Drill Mode + RBAC | Pending |
| BAK-RESTORE-03 | Phase 43 | Standalone Restore + Drill Mode + RBAC | Pending |
| BAK-RESTORE-04 | Phase 43 | Standalone Restore + Drill Mode + RBAC | Pending |
| BAK-RESTORE-05 | Phase 43 | Standalone Restore + Drill Mode + RBAC | Pending |
| BAK-RESTORE-06 | Phase 43 | Standalone Restore + Drill Mode + RBAC | Pending |
| BAK-RESTORE-07 | Phase 43 | Standalone Restore + Drill Mode + RBAC | Pending |
| BAK-RESTORE-08 | Phase 43 | Standalone Restore + Drill Mode + RBAC | Pending |

**Coverage summary:** 47/47 v30.0 requirements mapped to Phases 36-43. Zero orphans, zero duplicates.

**Category counts:**
- BAK-CORE: 5 (Phase 36 x1, Phase 37 x1, Phase 38 x3)
- BAK-SRC: 8 (Phase 38 x1, Phase 39 x7)
- BAK-DEST: 7 (Phase 40 x7)
- BAK-CRYPT: 6 (Phase 37 x3, Phase 38 x1, Phase 42 x2)
- BAK-SCHED: 5 (Phase 41 x5)
- BAK-UI: 8 (Phase 42 x8)
- BAK-RESTORE: 8 (Phase 43 x8)

**Phase counts:**
- Phase 36: 1 requirement (BAK-CORE-01)
- Phase 37: 4 requirements (BAK-CORE-02, BAK-CRYPT-01/02/03)
- Phase 38: 5 requirements (BAK-CORE-03/04/05, BAK-SRC-01, BAK-CRYPT-06)
- Phase 39: 7 requirements (BAK-SRC-02..08)
- Phase 40: 7 requirements (BAK-DEST-01..07)
- Phase 41: 5 requirements (BAK-SCHED-01..05)
- Phase 42: 10 requirements (BAK-CRYPT-04/05, BAK-UI-01..08)
- Phase 43: 8 requirements (BAK-RESTORE-01..08)

## Status

Defined. Ready for roadmapper.
