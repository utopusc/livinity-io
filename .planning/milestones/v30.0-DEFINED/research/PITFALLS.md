# Pitfalls Research — v30.0 Backup & Restore

**Domain:** Adding backup/restore to a multi-user self-hosted system (LivOS on residential Mini PC)
**Researched:** 2026-04-28
**Confidence:** HIGH (verified via official PG/restic/borg docs, real-world post-mortems, direct LivOS source inspection of Phase 20 + v29.0 update.sh)

> **LivOS-specific framing:** these pitfalls assume the v30.0 implementation reuses Phase 20 (`livos/packages/livinityd/source/modules/scheduler/backup.ts` + `backup-secrets.ts` + `node-cron` Scheduler) and runs on the Mini PC alongside livos.service / liv-core.service / system PostgreSQL / Redis. Each "Phase to address" maps to BAK-* requirements that the upcoming v30.0 ROADMAP must include.

---

## Critical Pitfalls

Mistakes that cause silent data loss, irrecoverable backups, or data leakage. These MUST be designed around — they cannot be patched in later.

---

### Pitfall 1: Schrödinger's Backup — green dashboard, dead archive

**What goes wrong:**
Daily backups run and report success for 4 months. User's NVMe dies. They click Restore. Tar is truncated, or pg_dump SQL has invalid syntax mid-file, or the encryption key was rotated 2 months ago and old archives can't be decrypted. "We had backups" turns into "we had files we never tested restoring." This is the single most common backup failure mode — green checkmarks lie because the only test that matters is a real restore.

**Why it happens:**
- "Backup succeeded" is conflated with "upload completed" (HTTP 200 on the last byte).
- Archive integrity is verified only by checksum-of-stream, not by re-reading the destination and replaying it.
- Restore is treated as a rare emergency procedure, not a routine smoke test.
- Format/schema/encryption-key drift between backup-time and restore-time is invisible until the day you need it.

**Real-world evidence:**
- pgforensics.com "Schrödinger's Backup: Automating PostgreSQL Restore Validation (Because Green Dashboards Lie)" — a full PG-restore-validation pipeline exists precisely because users repeatedly discover bad backups only at disaster time.
- Home Assistant GitHub issue #134162 — encrypted backups unrecoverable after key rotation; user had backed up successfully for months.
- restic forum — multiple "I have backups but I can't restore" threads where the archive itself was fine but the user lost the password.

**Prevention strategy in DESIGN:**
1. **Mandatory post-backup verification job (BAK-VERIFY):** after every successful backup, immediately spawn an alpine container that streams the just-uploaded artifact back, pipes through `gunzip -t`, and (for PG dumps) replays the SQL into an ephemeral `pg_restore --schema-only --dry-run` against a throwaway DB. Failure marks the backup as `verified=false` in `backup_runs` table — UI shows red badge, NOT green check.
2. **Auto-restore drill (BAK-DRILL):** weekly cron job that picks the most recent verified backup, restores it to a `livos_drill` ephemeral PG database + a temp Docker volume mount, runs a sanity query (`SELECT count(*) FROM users WHERE id IS NOT NULL` against the drill DB), then tears down. Records `last_successful_drill_at` in `backup_jobs` table.
3. **UI surface:** Settings > Backups page MUST display "Last successful drill: X days ago" — red if >14 days, no exceptions. Past restorability, not past upload-success, is the metric.
4. **Don't trust HTTP 200:** S3 uploads can return 200 then later be marked corrupt by the destination. Issue a `HEAD` after `Upload.done()` and verify `ContentLength` matches expected.

**Warning signs:**
- `backup_runs.verified` column shows `null` for >24h after job claims success → verifier never ran.
- "Last successful drill" never advances past the day backup was first configured.
- Manual restore from UI takes >5x the duration shown in scheduler history (real restore involves IO the verifier never exercised).

**Phase to address:** **Phase 4 (BAK-VERIFY) + Phase 7 (BAK-DRILL).** Verify-on-write must ship in same phase as the backup writer (not later) — otherwise we accumulate unverified archives. Drill is its own phase because it needs ephemeral PG provisioning.

**Confidence:** HIGH

---

### Pitfall 2: Encryption-key catastrophe — data is fine, key is gone

**What goes wrong:**
User configures backup with passphrase `correcthorsebatterystaple`, backups run for 8 months. NVMe dies. User reinstalls LivOS on new Mini PC, types passphrase from memory — wrong. Or: they used the auto-generated key stored in `/opt/livos/data/secrets/jwt`, never wrote it down, and the laptop they were going to migrate from also crashed. **The archive is bit-perfect, the key is gone, the data is dead.**

A subtler variant: key rotation. User rotates encryption passphrase in v30.5; old archives encrypted under old key remain in S3. They never tested decrypting old archives with new key (it doesn't work). 6 months later they need an old archive — locked out.

**Why it happens:**
- Self-hosted users routinely conflate "I have a backup" with "I can decrypt my backup."
- LivOS already derives the Phase 20 vault key from `sha256(JWT_SECRET file contents)` — if the JWT secret file is lost (factory reset, disk failure, manual nuke), every encrypted credential AND every encrypted backup payload becomes unreadable.
- restic, borg, BorgBase, CrashPlan all explicitly document: "lost passphrase = permanent data loss, no recovery, no exceptions."
- Key rotation breaks old archives unless old keys are retained for restore-only.

**Real-world evidence:**
- BorgBackup issue #4236 "Borg Backup recovery. Key lost is lost" — closed with "no recovery possible, by design."
- restic forum "Forgotten password" — repository password cannot be recovered, even by hosting provider.
- Home Assistant emergency kit feature — explicit acknowledgment that users must print/store the key offline.
- AhsayCBS sells an "Encryption Key Recovery Service" because the problem is so frequent.

**Prevention strategy in DESIGN:**
1. **Mandatory Emergency Kit on backup creation (BAK-EKIT):** the FIRST time the user configures backup encryption, modal dialog forces them to either (a) download a printable PDF "LivOS Backup Recovery Kit" containing the passphrase + recovery codes + decryption instructions, OR (b) save it to their password manager (clipboard with "Don't show me again — I saved it" hard-confirm checkbox). Modal cannot be dismissed without one of those actions. Pattern modeled on Home Assistant's emergency kit.
2. **Don't derive backup key from JWT secret** (current Phase 20 vault pattern). Generate a separate `BACKUP_MASTER_KEY` random 32-byte value, stored in `/opt/livos/data/secrets/backup-key`, with the recovery kit being the ONLY copy outside that file. Reason: factory-reset rotates JWT secret, which would silently brick every existing backup if backup keys were derived from it.
3. **Wrap-key architecture for rotation:** every backup archive embeds a per-archive random data-encryption-key (DEK), wrapped by the user's master key. Key rotation re-wraps all archive DEKs with the new master, no need to re-encrypt the (potentially TB-sized) archive bodies. Old master key kept in a `key_history` table for restore-only access.
4. **Recovery-code escrow option:** offer (opt-in) Shamir Secret Sharing 2-of-3 split where one share goes to user's email, one to a paper code, one stays on disk. Mitigates "user wiped laptop with all kit copies."
5. **Pre-flight key check:** every backup-now click first decrypts the most recent archive's header with the current master key. If it fails, hard-block the backup ("your master key cannot decrypt your last archive — restore-without-confirming-key would silently break consistency").

**Warning signs:**
- User has never opened the "Show recovery kit" page in Settings (telemetry-able).
- `backup_jobs.last_decrypt_check_at` >7 days old.
- `key_history` empty after a rotation event (means old archives are now orphaned).

**Phase to address:** **Phase 2 (BAK-EKIT) — encryption design and recovery kit must ship in the same phase as encryption itself.** Adding the kit later means existing users have no kit. Phase 8+ for SSS recovery codes.

**Confidence:** HIGH

---

### Pitfall 3: Inconsistent snapshot — PG mid-transaction, Redis mid-write, FS mid-rename

**What goes wrong:**
Backup runs at 03:00. At 03:00:00.473, user's AI agent is mid-transaction: `INSERT INTO conversations` is committed, `INSERT INTO messages` is not. Backup tar streams `/opt/livos/data/` while a Docker container is rotating `app.log`. PostgreSQL is being snapshotted via `pg_dump` while the user's session has open WAL. **Restore produces a DB where messages reference a non-existent conversation, app data references files that aren't in the FS tar, and Redis cache is from 30 seconds before PG.**

This is the #1 cause of "backup restored but app crashes on startup" — backups across PG + Redis + filesystem are NOT atomic, and naïve concurrent reads produce a torn state that no single component flags as corrupt.

**Why it happens:**
- Phase 20's existing `streamVolumeAsTarGz()` mounts the volume read-only and tars it — fine for a static volume, but Docker apps with active writers race the tar enumeration.
- `pg_dump` is internally consistent (per PG docs, uses a snapshot), BUT only relative to PG. Files written by the app to FS that reference PG rows aren't synchronized.
- Redis `BGSAVE` produces a point-in-time RDB but its timestamp is independent of the PG dump and FS tar timestamps.
- Without a coordinated quiesce, you have THREE point-in-time snapshots from THREE different times.

**Real-world evidence:**
- PostgreSQL docs confirm `pg_dump` is consistent within PG only; cross-system consistency is the application's responsibility.
- CVE-2024-7348 — TOCTOU race in pg_dump itself.
- Datto VSS errors — Windows VSS tries to coordinate writers exactly because uncoordinated snapshots are known-broken.

**Prevention strategy in DESIGN:**
1. **Application-level quiesce protocol (BAK-QUIESCE):** before pg_dump starts, livinityd sends an internal `backup:quiesce` Redis pub/sub event. Subscribers (nexus core, AI agent loop, Docker app gateway) finish in-flight writes and pause new writes for the duration of the dump. Maximum quiesce window: 30 seconds, hard timeout. After dump, `backup:resume` event releases.
2. **Snapshot ordering convention:** PG dump FIRST (cheapest, most critical), Redis RDB SECOND (using `--no-pager` synchronous BGSAVE), filesystem volume tar LAST. All three timestamps recorded in archive manifest. On restore, replay in reverse order: FS first (slowest), then Redis, then PG (fastest, last).
3. **Manifest with consistency boundary:** archive includes `manifest.json` with `quiesce_started_at`, `quiesce_ended_at`, `pg_dump_lsn`, `redis_save_id`, `volume_freeze_token`. Restore-time validation: if any component's timestamp falls outside the quiesce window, mark restore as "torn — proceed at your own risk" and require explicit user confirmation.
4. **For per-app Docker volumes:** if the app is running, EITHER (a) `docker pause` the container during tar (ms-scale freeze, transparent to the running process), OR (b) skip and warn ("App `nextcloud` is running — skipping volume backup. Stop the app to back up its data.").
5. **WAL archiving for hot-standby option (advanced):** beyond basic pg_dump, support WAL-shipping to a destination so point-in-time recovery is possible. Defer to Phase 9+ but design schema with this in mind from Phase 1.

**Warning signs:**
- Restored DB has FK constraint violations on startup.
- Redis cache contains references to entities that don't exist in PG.
- App data volume contains file IDs that don't exist in PG `files` table.
- Quiesce window in manifest >30s — means application didn't release fast enough; investigate write storm.

**Phase to address:** **Phase 3 (BAK-QUIESCE) — must ship before any cross-system backup.** Phase 1 should design the manifest format with consistency boundary fields even if quiesce isn't wired yet.

**Confidence:** HIGH

---

### Pitfall 4: Ransomware-paths-to-backups — attacker wipes archives too

**What goes wrong:**
Attacker compromises livinityd via a 0-day in a Docker app or a stolen API token. They now have RCE on the Mini PC. They locate `/opt/livos/data/secrets/`, read the S3 credentials from the Phase 20 backup-secrets vault, and issue `DeleteObjectsV2` against the backup bucket. **All cloud backups gone in 4 seconds.** Then they encrypt the live data and demand ransom. Local-disk backups are also wiped because attacker has root.

This is the standard 2024-2026 ransomware playbook — attackers explicitly hunt for backup credentials before triggering the encrypt phase.

**Why it happens:**
- Standard S3 credentials have full Read+Write+Delete on the bucket. Compromised LivOS = compromised backups.
- Local disk backups under `/opt/livos/data/backups` share fate with the live data.
- Phase 20's `backup-secrets.ts` encrypts the credentials, but they're decrypted in memory by livinityd whenever a backup runs — RCE on livinityd defeats the encryption.

**Real-world evidence:**
- TrendMicro Nov 2025 "Breaking Down S3 Ransomware: Variants, Attack Paths and Trend Vision One Defenses" — documented S3 ransomware patterns.
- restic forum "S3 Immutable Backups for ransomware recovery" — community widely understands this attack.
- Helge Klein's "restic: Encrypted Offsite Backup With Ransomware Protection" — canonical writeup of the B2-application-key-without-delete pattern.
- Kopia ransomware-protection docs — formalizes the immutable-destination model.

**Prevention strategy in DESIGN:**
1. **Append-only credentials by default (BAK-APPEND-ONLY):** UI flow for S3/B2 destination MUST guide user to create an application key without `s3:DeleteObject` (B2: `listBuckets,listFiles,readFiles,writeFiles` — explicitly NOT `deleteFiles`). Auto-detect at destination-test time: if test creds CAN delete, show yellow warning "These credentials can delete backups. Ransomware on your LivOS could wipe your archives."
2. **Object Lock support (BAK-LOCK):** for S3-compatible destinations supporting Object Lock, set `x-amz-object-lock-mode: COMPLIANCE` + `x-amz-object-lock-retain-until-date` = (now + retention_days). Even root on the S3 account cannot delete locked objects. UI checkbox: "Make this destination ransomware-proof (Object Lock — irreversible)."
3. **Server-side retention via lifecycle (not client-side prune):** since we can't delete with append-only creds, retention happens via S3 lifecycle policy or B2 lifecycle rules — NOT by livinityd issuing deletes. UI generates the lifecycle JSON for user to paste into S3 console (or, if creds have config-write permission via a separate "admin" key, applies it once at setup).
4. **3-2-1 enforcement in UI:** require AT LEAST one immutable destination before allowing the schedule to be enabled. Local-disk-only is allowed but flagged red ("Single-point-of-failure: ransomware on your Mini PC will destroy these backups").
5. **Air-gapped local copy pattern:** support optional "external USB" destination where livinityd writes backup, then displays a notification "Disconnect USB drive now to make this copy ransomware-proof." Manual but effective for technical home users.

**Warning signs:**
- Destination test reveals delete permission → log warning.
- Backup-write user can also list other buckets / has root S3 perms (probably reused user's main S3 account).
- Single destination (no 3-2-1) configured.

**Phase to address:** **Phase 5 (BAK-APPEND-ONLY) + Phase 6 (BAK-LOCK).** Phase 5 is a UI-and-permission-test concern that gates on Phase 1 destination model. Phase 6 (Object Lock) is a separate destination capability flag.

**Confidence:** HIGH

---

### Pitfall 5: Backup blowing up the disk — silent fill

**What goes wrong:**
User configures local-disk backup to `/opt/livos/data/backups`, retention=keepLast:30. Backup runs daily, each archive 50 GB (PG + Redis + all per-user app volumes). After 30 days = 1.5 TB. Mini PC NVMe is 900 GB. **Backup #19 fails at "no space left on device" — but earlier failures filled the disk so far that PG itself can no longer write WAL → entire LivOS halts.** Or: retention pruning has a bug and never deletes, archives accumulate forever.

**Why it happens:**
- Phase 20's `volumeBackupHandler` writes destination size unbounded — no pre-flight free-space check.
- Retention is a "keepLast: N" config but if the prune logic fails (FS error, race with another job), no alarm — just silent accumulation.
- LivOS shares the NVMe between live data and local backups — full disk = system down, not "just" backup failure.
- Compression failures (incompressible data, e.g. already-encrypted user files in apps) defeat assumed compression ratios.

**Real-world evidence:**
- Commvault community "DDB backup job seem to be not pruning any data" — pruning silently fails for disk-space reasons unrelated to retention config.
- Veritas Backup Exec "Low disk space" alerts exist precisely because this is a recurring issue.
- Proxmox forum "Backup retention settings" — many users hit unbounded growth from misconfigured GFS rules.

**Prevention strategy in DESIGN:**
1. **Pre-flight free-space gate (BAK-PREFLIGHT):** before starting any backup, livinityd runs `statvfs()` on the destination path (for local) or HEAD on a test object (for S3 + estimate via `Content-Length` of last archive × 2). If free space < 1.5× last archive size, abort with `failure: insufficient_space` and emit alert. NEVER start a backup that cannot fit.
2. **Hard reservation for live system:** local-disk destination MUST be on a different mount than `/opt/livos/data/` (different volume / external drive / dedicated partition). UI rejects `/opt/livos/data/backups` as a destination — too dangerous. If user really wants same-drive, require `--I-know-this-can-brick-LivOS` flag.
3. **Retention-prune verification:** after every prune, query the destination listing and assert `count <= keepLast + 1` (1 for the just-written archive). If invariant violates, emit alert "Retention pruning is not working — backups will fill disk." Don't trust the prune SQL/API to silently succeed.
4. **Disk-usage telemetry:** publish `backup_destinations_used_bytes` to Settings UI — graph over time. Sudden spike = compression broke (probably encrypted-source data) → user can investigate before it's a crisis.
5. **Destination size budget:** UI per-destination "Max total size" config (default 500 GB). When approached, prune more aggressively even if outside retention rule. Fail-safe over fail-secure: bricked LivOS is worse than dropped old backups.

**Warning signs:**
- `backup_destinations.used_bytes` growing linearly with no plateau.
- `pg_settings.checkpoint_warning` events on the Mini PC (PG can't write).
- `df /` < 10% free on `/opt/livos/data/`.
- Last 3 backup runs have status=success but size grew 3× — silent compression failure.

**Phase to address:** **Phase 4 (BAK-PREFLIGHT) + Phase 7 (retention verification).** Pre-flight is in same phase as the backup writer (cheap to add). Retention verification needs the prune logic to exist first.

**Confidence:** HIGH

---

### Pitfall 6: Restore-while-running disaster — corrupting live PG mid-restore

**What goes wrong:**
Admin clicks "Restore from 2026-04-15 backup." LivOS is running. Restore handler calls `pg_restore` against the live `livos` database while livinityd's tRPC handlers are mid-transaction. **Conflicting writes cause partial restore: some tables overwritten, some not, FK constraints broken.** Worse: restore fails halfway, livinityd restarts, sees a half-restored DB, marks itself as broken on startup. Now the user has neither the old data nor the new data — they have a Frankenstein.

A second variant: restore stops services (good!), restore fails halfway (e.g., decrypt error), services never restart (bad!) — admin is locked out with no UI to retry, has to SSH and manually `systemctl start livos`.

**Why it happens:**
- pg_restore overwrites tables row-by-row; concurrent reads see torn state.
- Docker volume restore replaces files while a container has them open — open file handles point to deleted inodes.
- "Stop services → restore → restart" is a 3-step dance where step 3 is conditional on step 2's success — easy to skip on error path.

**Real-world evidence:**
- SQL Server backup-restore docs (Microsoft Learn) explicitly require RESTRICTED_USER mode for restore.
- PostgreSQL pg_restore docs: target DB must be empty or `--clean` used; either way, concurrent connections cause errors.
- v29.0's own update.sh experience — restart-during-active-state is the same class of problem as restore-during-active-state.

**Prevention strategy in DESIGN:**
1. **Restore is a separate cgroup-escaped script (BAK-RESTORE-CGROUP):** mirror v29.0 update.sh pattern — restore.sh is `exec systemd-run --scope` so it survives livos.service restart. Sequence: (a) record restore intent in `/opt/livos/data/restore-pending.json`, (b) `systemctl stop livos liv-core liv-worker liv-memory`, (c) restore PG via `pg_restore --clean` against stopped DB, (d) restore Redis via `SHUTDOWN NOSAVE` + replace dump.rdb + start, (e) restore volumes via tar extract, (f) `systemctl start livos liv-core liv-worker liv-memory`, (g) clear restore-pending.json.
2. **livinityd boot-time recovery check (BAK-RESTORE-RECOVERY):** on every livos.service start, livinityd reads `/opt/livos/data/restore-pending.json`. If present + status=in_progress, refuses to come up cleanly: shows "Restore was interrupted. Click Retry or Roll Back" maintenance page on port 8080. No regular UI until resolved. Mirrors Phase 32 ROLL-01 auto-rollback pattern from v29.0.
3. **Restore-to-staging by default (BAK-DRY-RESTORE):** UI's primary "Restore" button restores to a separate ephemeral PG database (`livos_restore_staging`) + temp Docker mounts. User clicks "Promote to live" only after sanity-checking the staging — at which point services stop and the staging swap-in happens atomically.
4. **No restore-while-update-running:** check `/opt/livos/data/update-pending` (from update.sh) and refuse restore. Same vice versa: refuse update if restore-pending.

**Warning signs:**
- `restore-pending.json` exists at livinityd startup → previous restore did not complete cleanly.
- pg_restore exit code 1 with "deadlock detected" → concurrent connections weren't blocked.
- Container restart loop on services that depend on restored volumes (open file handles to deleted inodes).

**Phase to address:** **Phase 8 (BAK-RESTORE) + Phase 8b (BAK-RESTORE-RECOVERY).** Cannot ship restore without recovery path — half-shipped restore is worse than no restore.

**Confidence:** HIGH

---

### Pitfall 7: Multi-user backup data leakage

**What goes wrong:**
Admin runs full system backup. Archive contains `users` table (all users + password hashes), all per-user app volumes including User A's private notes app, all conversation histories. Admin shares this archive with a contractor for "disaster recovery testing." **Contractor now has every user's data.** Or: User B (member, not admin) clicks "Restore my data" — UI accidentally lets them restore User A's data into User B's account, mixing identities.

A subtler variant: per-user encryption was promised in v7.0 multi-user docs, but backup uses a single system-level key — meaning every user's archive is decryptable by the admin (who may not own that user's data semantically, esp. in family/team settings).

**Why it happens:**
- Single-tenant backup design retrofitted onto a multi-user system without rethinking encryption boundaries.
- Phase 20 backup-secrets has ONE vault key for the whole system — no per-user separation.
- Restore UI takes a `userId` parameter that's user-controlled; missing tenant-filter on the restore handler = cross-user restore.
- Audit logs that contain references to other users' actions get included in any per-user backup.

**Real-world evidence:**
- WorkOS multi-tenant guide — "A single missed `WHERE tenant_id = ?` clause becomes a potential data leak."
- AWS multi-tenant SaaS backup blog — segregation must be designed in, not bolted on.
- ComplyDog SaaS privacy guide — backups are a documented OWASP-multi-tenancy weak point.

**Prevention strategy in DESIGN:**
1. **Per-user encryption sub-key (BAK-PER-USER-KEY):** wrap-key architecture from Pitfall 2 includes per-user DEKs derived from the user's password (or a user-set backup passphrase). Admin can backup a user's data, but can only DECRYPT it if the user provides their backup passphrase. This is a hard boundary.
2. **Restore RBAC enforcement (BAK-RESTORE-RBAC):** restore handler uses `adminProcedure` middleware; cross-user restore (`restoreUserId !== currentUser.userId`) requires `currentUser.role === 'admin'` AND records audit event with both user IDs. Member tier can only restore their own archive.
3. **Per-user backup scoping:** "Backup my data" for a member produces an archive containing ONLY rows where `user_id = currentUser.userId` from every table (filter at SQL level, not at file level). Full-system backup is admin-only.
4. **Audit-log scrubbing on per-user backup:** `audit_logs` filtered by `actor_user_id = currentUser.userId` — don't leak admin's actions on other users to the user being backed up.
5. **Pre-restore confirmation modal:** "You are about to restore User A's data into User A's account. This will overwrite User A's current data. Type `RESTORE A` to confirm." Hard-block typo'd user IDs.

**Warning signs:**
- `audit_logs.actor_user_id` doesn't match `target_user_id` in restore events without admin role.
- Member-tier user successfully decrypts an archive that wasn't theirs (telemetry: track decrypt failures vs successes per role).
- Restore UI shows another user's name in a member-tier session.

**Phase to address:** **Phase 2 (per-user keys) + Phase 8 (RBAC on restore).** Per-user keys are encryption-architectural; bolting on later means existing archives have wrong key boundary.

**Confidence:** HIGH

---

### Pitfall 8: Network partition during backup — partial S3 upload, no resume

**What goes wrong:**
50 GB backup is mid-upload to S3 via residential Mini PC. Cloudflare-Server5-Mini PC tunnel drops at 70% upload (residential ISP rerouting, common). `Upload.done()` throws `NetworkError`. Phase 20 marks the job as failed. **The 35 GB partial in S3 is now garbage taking up bucket space — no `abortMultipartUpload` was sent, so the multipart parts linger and incur cost.** Next scheduled run starts from scratch. Over weeks of flaky tunnel, S3 bill silently quintuples from abandoned multipart fragments.

**Why it happens:**
- Phase 20's `lib-storage Upload` does NOT auto-abort failed multipart uploads on stream error — abandoned parts stay around indefinitely.
- No resume support: every failure restarts from byte 0.
- No bandwidth throttling — backup competes with tunnel traffic, making the tunnel even flakier during backup.
- S3 charges for storage of incomplete multipart parts; B2 charges for upload bytes; both can rack up costs invisibly.

**Real-world evidence:**
- AWS docs explicitly recommend `S3 lifecycle rule: AbortIncompleteMultipartUpload after N days` to clean up — this is well-known.
- Residential network reliability is a known issue for self-hosted backup; tools like restic/borg specifically advertise resume-from-failure.
- Backblaze B2 charges for incomplete uploads — community has hit this.

**Prevention strategy in DESIGN:**
1. **Try/finally with explicit abort (BAK-MULTIPART-CLEAN):** wrap every `lib-storage Upload` in try/catch; on any error, call `upload.abort()` to issue `AbortMultipartUpload` request. Add to current Phase 20 `uploadToS3` immediately.
2. **Lifecycle rule on bucket setup (BAK-LIFECYCLE):** when user configures S3/B2 destination, generate a lifecycle JSON snippet that includes `AbortIncompleteMultipartUpload after 1 day`. UI provides one-click "Apply" if creds have config-write permission, else copy-paste instructions.
3. **Chunked archive with resumable uploads (BAK-CHUNKED):** for archives >5 GB, split at 1-GB chunks at the tar level (multi-volume tar). Each chunk uploads independently with retry-with-backoff (exponential, max 3 retries). Manifest lists chunks; restore concatenates. Single-chunk failure doesn't kill the whole backup. Phase 9+ work, but design schema for it from Phase 1.
4. **Bandwidth throttle (BAK-THROTTLE):** UI option "Limit backup bandwidth to X MB/s" — uses `Throttle` stream from `stream` module to cap. Default suggested: 50% of measured upstream. Prevents backup from killing the tunnel.
5. **Restore-bandwidth cost preview:** UI shows estimated egress cost per restore for cloud destinations ("Restoring 50 GB from B2 = ~$0.50, from AWS S3 = ~$4.50"). Educates users away from expensive choices for full-restore scenarios.

**Warning signs:**
- S3 list-multipart-uploads returns >10 entries → cleanup failing.
- Backup duration variance >3× between runs → network-driven retries.
- B2/S3 bill diverges from `backup_destinations.used_bytes` calculation → orphan multiparts.

**Phase to address:** **Phase 4 (BAK-MULTIPART-CLEAN) + Phase 4b (BAK-LIFECYCLE).** Both must ship with destination support — abort-on-error is a one-liner that absolutely cannot be deferred. Chunked uploads (Phase 9+) is a larger redesign.

**Confidence:** HIGH

---

### Pitfall 9: Self-update + backup interaction — update.sh kills backup mid-write

**What goes wrong:**
User starts a 50 GB backup at 10:00 (estimated 90 min). At 10:30, the v30.5 update notification banner appears. User clicks "Install Update." update.sh fires `systemctl restart livos.service` at 10:35. The backup process is owned by livinityd → killed. **The S3 upload is half-done; the local-tar partial is on disk; the cloud archive is corrupt; manifest is never written.** Worst case: the partial cloud archive has the same filename as what would be the successful archive, so it gets recorded as successful in scheduled_jobs.last_run_status = 'success' before the restart. Now there's a dead archive masquerading as alive.

**Why it happens:**
- Phase 20's backup runs in livinityd's process tree → child of livos.service cgroup → killed when service restarts.
- v29.0 update.sh does NOT check for in-flight backups before restarting livos.service.
- Scheduler's in-memory `inFlight: Set<string>` is cleared on process restart — next start of livinityd has no idea a backup was killed.
- update.sh own cgroup-escape (Phase 33) doesn't apply to livinityd's children — only to update.sh itself.

**Real-world evidence:**
- LivOS-internal: v29.0 hot-patches were necessary because update.sh restart killed update.sh — exact same pattern applies to backup.
- Direct inspection of `livos/packages/livinityd/source/modules/scheduler/index.ts:21,99,131` — `inFlight` is a Map in livinityd memory.

**Prevention strategy in DESIGN:**
1. **Persistent in-flight registry (BAK-INFLIGHT-PG):** replace in-memory `inFlight: Set` with PG table `backup_runs(id, job_id, status='running', started_at, pid, host)`. Survives livinityd restarts. On startup, livinityd reads outstanding `running` rows older than 1 hour, marks them `failed_orphan` with reason="livinityd restarted mid-backup".
2. **update.sh pre-flight check (BAK-UPDATE-GUARD):** add to update.sh, BEFORE the `systemctl restart livos` line: `if [[ -f /opt/livos/data/backup-in-progress.flag ]]; then echo "Backup in progress, deferring update by 5 min"; sleep 300; goto retry; fi`. Maximum 3 retries; after that, abort the update (do NOT force-kill backup).
3. **Backup also cgroup-escapes (BAK-INFLIGHT-CGROUP):** for backups exceeding a threshold (>10 min estimated), spawn the backup process in `systemd-run --scope --collect` so it survives livinityd / livos.service restart. Mirrors v29.0 update.sh pattern. Reports completion via writing manifest atomically + signaling livinityd via Redis pub/sub.
4. **UI "Install Update" guard:** if a backup is running, the Install Update button is disabled with tooltip "Backup in progress. Update will be available when backup completes."
5. **Atomic manifest write:** never write `manifest.json` until ALL chunks + verification + retention pass. If any phase fails, no manifest = no archive (orphaned chunks cleaned by lifecycle).

**Warning signs:**
- `backup_runs.status='running'` rows with `started_at < now() - interval '6 hours'` → orphans from killed backups.
- update.sh log shows "Backup in progress" deferral messages (expected, fine) OR shows zero such messages over weeks of usage (suspicious — either no backups or guard not wired).
- S3 bucket has objects without corresponding manifest (orphans from killed backups).

**Phase to address:** **Phase 4 (BAK-INFLIGHT-PG) + Phase 5 (BAK-UPDATE-GUARD) + Phase 9+ (BAK-INFLIGHT-CGROUP).** Phase 4 must be done with the writer; Phase 5 is a small update.sh patch that ships in same milestone; cgroup-escape is a v30.1 hotpatch candidate (mirrors v29.1 timing).

**Confidence:** HIGH

---

### Pitfall 10: Phase 20 reuse blast-radius

**What goes wrong:**
v30.0 reuses Phase 20's `streamVolumeAsTarGz()`, `backup-secrets.ts`, `Scheduler` directly. Existing assumptions (single-volume small archives, 15-min jobs, in-memory inFlight) break under v30.0 scope (multi-component archives, multi-hour jobs, system PG dump). Symptoms: livinityd OOM at 32 GB tar buffer, alpine container hits Docker's default `--memory=` limit and OOMs mid-tar, Scheduler's `inFlight` skip drops the long-running backup's retry, backup-secrets vault key is the JWT secret which factory-reset rotates.

**Why it happens:**
- Phase 20 was designed for app-volume backups (small, fast). v30.0 must back up the whole system (PG + Redis + all volumes + secrets) — different scale entirely.
- Phase 20's `tar | upload` pipe assumes upload is faster than tar; for slow tunnels + fast NVMe, tar buffers in-RAM until upload catches up.
- The current vault key derivation (`sha256(JWT_SECRET)`) silently breaks if JWT secret rotates (which it does on factory reset, per `livos/packages/livinityd/source/modules/system/factory-reset.ts`).
- `inFlight: Set` was sized for jobs that complete in seconds, not hours.

**Real-world evidence:**
- Direct source inspection: `backup.ts:117-125` demuxes stdout via PassThrough — back-pressure between tar output and S3 upload is ad-hoc.
- `backup-secrets.ts:21-31` — `JWT_SECRET_PATH = '/opt/livos/data/secrets/jwt'` is the SOLE key source. No fallback, no recovery.
- v29.0 update.sh experience — Phase 20 patterns that "worked fine" for short jobs broke at production timescales.

**Prevention strategy in DESIGN:**
1. **New vault key, separate file (BAK-VAULT-KEY):** `/opt/livos/data/secrets/backup-key` — random 32-byte file generated at first backup config, NEVER derived from JWT. Migrate Phase 20 backup-secrets to use new key (one-time migration on v30.0 upgrade — read with old JWT-derived key, re-encrypt with new key). Factory-reset SKIPS this file (or asks user explicitly).
2. **PG-backed inFlight (covered in Pitfall 9):** replace in-memory Set with table.
3. **Bounded back-pressure:** add a `Throttle({rate: 50_000_000})` (50 MB/s) stream between tar and upload. Prevents tar from out-running upload and buffering 32 GB in livinityd memory.
4. **Per-job memory limit on alpine container:** `HostConfig.Memory: 256 * 1024 * 1024` — tar doesn't need >256 MB; if it does, something's wrong (probably hard-link bomb).
5. **Reuse audit (Phase 1 spike):** before writing any v30.0 code, run a Phase 0 spike that benchmarks Phase 20 with: (a) 100 GB volume, (b) flaky network, (c) livinityd restart mid-job, (d) 24-hour run. Document failures explicitly. Only reuse what passes.

**Warning signs:**
- livinityd RSS climbs >2 GB during backup → tar-buffering not bounded.
- Alpine container restart logs show "OOMKilled" → memory limit too low or tar misbehaving.
- backup-secrets decrypt errors after factory reset → JWT-derived key missed migration.
- Job retry doesn't fire after livinityd restart → in-flight cleanup didn't run.

**Phase to address:** **Phase 1 (reuse audit spike) + Phase 2 (BAK-VAULT-KEY).** Skipping the spike is the single biggest risk to the milestone — v29.0 demonstrated that "reuse this proven module" can hide scale issues.

**Confidence:** HIGH (direct source inspection)

---

### Pitfall 11: Multi-destination consistency — what does "success" mean?

**What goes wrong:**
User configures backup to 3 destinations: local + S3 + B2. Local succeeds (200ms), S3 succeeds (8 min), B2 fails (timeout at 12 min). What's the job status? "success" — misleading, B2 is empty. "failure" — also misleading, 2 of 3 succeeded. **Phase 20 currently only supports one destination per job → users create 3 jobs, which means tar runs 3 times → 3× IO load, 3× consistency snapshots that don't match → restore from S3 archive vs B2 archive returns slightly different data.**

A subtler variant: cross-destination drift over time. After 100 backups, S3 has all 100, B2 has 95 (5 failed silently), local has 50 (retention pruned). User assumes "I have 3-2-1, I'm safe" — but B2 has gaps and they don't know which.

**Why it happens:**
- Phase 20's `BackupJobConfig.destination` is singular. Users with 3-2-1 needs create 3 jobs, breaking consistency.
- No per-destination success tracking on a single backup run.
- Failure on one destination doesn't trigger a retry on JUST that destination.

**Prevention strategy in DESIGN:**
1. **Multi-destination per job (BAK-MULTI-DEST):** schema change — `BackupJobConfig.destinations: BackupDestination[]`. Single tar stream is `tee`'d to N destinations in parallel via Node.js stream cloning (or sequentially, with the local-disk staging acting as the source for cloud uploads).
2. **Per-destination status in `backup_runs.destinations_json`:** `[{type: 's3', status: 'success', uploaded_bytes, latency_ms}, {type: 'b2', status: 'failure', error: '...'}]`. Job overall status = `partial_success` if any destination succeeded, `failure` if all failed.
3. **Configurable success criterion:** UI option "Required destinations" (default: 1, options: any/all/N-of-M). User decides if "1 of 3 succeeded" is acceptable.
4. **Per-destination retry (BAK-RETRY-DEST):** failed destinations are queued for retry on the next scheduler tick — re-uploads from local-disk staging (the local copy is implicit when multi-destination is enabled). Prevents whole-tar re-run.
5. **3-2-1 health UI:** Settings > Backups page shows a matrix: Job × Destination, with last-N-runs status icons. Drift visible at a glance.

**Warning signs:**
- `backup_runs.destinations_json` shows >5% of destinations in `failure` over last 30 days → destination is failing intermittently, ignored.
- User-perceived "all green" vs actual "1 of 3 destinations green" → UI misleading.

**Phase to address:** **Phase 1 (schema with multi-destination from day 1) + Phase 6 (per-destination retry).** Singular destination is a Phase 20 limitation v30.0 must explicitly correct in the schema, not work around.

**Confidence:** HIGH

---

### Pitfall 12: Restore version drift — schema migration on restore

**What goes wrong:**
User on LivOS v30.0 takes daily backups. v33.0 ships with a new `audit_logs` schema (column rename, new FK). User upgrades to v33.0. 6 weeks later they need to restore a v30.0 backup. **pg_restore fails with column-not-found errors. Schema migrations needed to bring the v30.0 dump up to v33.0 schema, but the migrations are EXPECTED to run against current schema, not against an old dump being restored INTO a new schema.**

A subtler variant: backup format itself (`manifest.json` schema, encryption format, tar layout) changes between versions. v30.0 archives can't be read by v33.0 restore code. Or worse: v33.0 restore code SILENTLY reads them but mis-parses, restoring corrupted data.

**Why it happens:**
- LivOS schema evolves (Phase X migrations run on every livinityd start). pg_dump captures point-in-time schema.
- Backup format is implicit — no version field in archive itself.
- Restore code is written against current code's expectations.

**Prevention strategy in DESIGN:**
1. **Version stamp in manifest (BAK-VERSION):** every archive's `manifest.json` includes `livos_version`, `pg_schema_version` (from `schema_migrations` table), `archive_format_version`, `created_at`. Restore-time compatibility check FIRST.
2. **Forward-compatible restore (BAK-FORWARD-COMPAT):** restore handler reads archive_format_version, picks the matching parser. v30.0 parser preserved in code forever (or until explicitly dropped with major-version bump). NEVER silently re-interpret old archives.
3. **Schema migration on restore (BAK-RESTORE-MIGRATE):** after pg_restore loads old data into staging DB, run forward migrations: `migrate up --from <archive_pg_schema_version> --to <current>`. Migrations must be idempotent + reversible.
4. **Refusal to restore unknown formats:** if archive_format_version > current parser supports, restore refuses with "This backup is from a newer version of LivOS than is currently installed. Upgrade LivOS first, then retry restore."
5. **Documented breaking-change policy:** any archive-format-breaking change requires a major version bump + dual-write period (write both old and new format for 1 minor version) so users can downgrade gracefully.

**Warning signs:**
- Restore from old archive succeeds but app crashes on first query (schema drift accepted silently).
- `archive_format_version` field missing from manifest → archive predates Phase 1 work; needs special-case handling.

**Phase to address:** **Phase 1 (BAK-VERSION in manifest schema) + Phase 8 (BAK-RESTORE-MIGRATE).** Stamping version is free and must be done from day 1 — adding it later means existing archives are unstamped.

**Confidence:** HIGH

---

### Pitfall 13: Time skew & DST — schedule misses or doubles

**What goes wrong:**
Mini PC is in Istanbul (`Europe/Istanbul`, UTC+3 year-round since 2016). User schedules backup `0 3 * * *` ("daily at 03:00"). DST transition happens... wait, Turkey doesn't DST. But: user travels, takes laptop with their own machine in Berlin, configures backup from laptop, the cron string is interpreted in **server timezone** (Istanbul) — runs at Istanbul 03:00 = Berlin 02:00. User thinks "03:00" means their local 03:00. Backups run at unexpected times.

A second variant: NTP drifts on Mini PC (residential network, sometimes blocks NTP). Backup timestamps drift from cloud destination timestamps. Retention "delete older than 30 days" deletes archives that are technically 28 days old per the destination clock. Or: backup runs twice in one day during a clock skew event.

**Why it happens:**
- node-cron uses server local time by default.
- Cron syntax has no timezone field (vs cron-style ICS with TZID).
- LivOS doesn't currently expose a timezone setting per user / per job.
- NTP isn't guaranteed on residential networks.

**Prevention strategy in DESIGN:**
1. **Explicit per-job timezone (BAK-TZ):** `scheduled_jobs` schema gains `timezone TEXT NOT NULL DEFAULT 'UTC'`. UI exposes timezone picker on schedule create. Cron interpreted via `cron-parser` in that TZ.
2. **All timestamps stored UTC, displayed local:** archive manifests, backup_runs, retention calculations all use UTC. UI converts at display time.
3. **NTP health monitoring:** livinityd periodically (`hourly`) compares system time to a known NTP server's time (e.g., `pool.ntp.org`). If drift >5 min, surface alert in Settings UI.
4. **Retention by archive's manifest timestamp, not server time:** "delete older than 30 days" calculates `now() - archive.created_at` from manifest, not from local time at delete-time. Robust against clock changes.
5. **Idempotency token:** backup job dedupe key = `job_id + scheduled_for_utc`. Re-firing same scheduled run (e.g., during clock-rollback) is a no-op.

**Warning signs:**
- User reports "my backup ran at 6 AM, I scheduled it for 3 AM" → timezone mismatch.
- Two `backup_runs` rows with same scheduled_for + close started_at → clock-rollback double-fire.
- `last_run_at` for a daily job shows >25h gap → clock-skip miss.

**Phase to address:** **Phase 1 (BAK-TZ in schema).** Trivially expensive to add later if schema is nailed down at Phase 1.

**Confidence:** MEDIUM (LivOS scope; common pattern but specific impact depends on user behavior)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse Phase 20 backup-secrets vault key (sha256(JWT)) | Day-1 wiring works | Factory reset silently destroys all backups | NEVER — must use separate `/data/secrets/backup-key` from Phase 2 |
| Skip post-write verification, assume HTTP 200 means success | -50% backup runtime | Schrödinger's backups; user discovers at restore time | NEVER — verify-on-write is non-negotiable |
| Single-destination per job (mirror Phase 20 schema) | Smaller schema PR | Users fan out 3 jobs for 3-2-1, breaking consistency | Only for v30.0-alpha if 3-2-1 is post-MVP — but design schema with array from day 1 |
| In-memory `inFlight: Set` (mirror Phase 20 Scheduler) | No PG schema change | Mid-flight orphans on restart, can't dedupe across processes | NEVER for v30.0 — system-scale jobs run for hours |
| Hardcoded `keepLast: N` retention with no GFS | Simple UI | Users can't do Grandfather-Father-Son rotation | OK for v30.0 MVP; add GFS in v30.5+ |
| Restore-to-live as primary flow (no staging) | Faster perceived restore | Mid-restore failure leaves inconsistent state | NEVER — staging swap-in is mandatory |
| Single encryption passphrase, no rotation | Simple UI | User can't change passphrase ever; one leak = forever leaked | Acceptable in v30.0 if rotation deferred to v30.1 — but design key-wrap from day 1 |
| Skip Object Lock support for cloud destinations | Smaller test matrix | Users cannot defend against ransomware | Acceptable for v30.0-MVP (append-only key alone gets 80% of value); Object Lock as Phase 6 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `pg_dump` against running PG | Use `--single-transaction` only (no schema lock) | `pg_dump -Fc --single-transaction --no-acl --no-owner` + acquire AccessShareLock on critical tables; rely on PG's MVCC snapshot for consistency within PG |
| Redis BGSAVE | Fire-and-forget assumption | `WAIT 0 5000` after BGSAVE to confirm; check `lastsave` timestamp; copy `dump.rdb` only after confirmation |
| Docker volume tar via alpine | `tar czf -` without `--numeric-owner` | `tar --numeric-owner --acls --xattrs czf - data` — preserves UID/GID across hosts (Mini PC bruce uid=1000 vs restore-target uid=?) |
| S3 `lib-storage Upload` | Don't catch errors → orphan multipart | `try { await upload.done() } catch (e) { await upload.abort(); throw e }` |
| B2 application keys | Use master key with full perms | Create restricted key: `listBuckets,listFiles,readFiles,writeFiles` — explicitly omit `deleteFiles` |
| ssh2-sftp-client | `put(stream, ...)` without timeout | Wrap in `Promise.race([put(...), timeout(30min)])`; sftp client doesn't have built-in timeout |
| node-cron | Server-local TZ | Pass `{timezone: job.timezone}` option from `scheduled_jobs.timezone` column |
| AES-256-GCM (Phase 20 vault) | Reuse IV across encryptions | Already correct in `backup-secrets.ts:34` (`crypto.randomBytes(12)` per call); preserve this when extending |
| systemd-run --scope from livinityd | Forget to test scope-collect interaction | Mirror update.sh pattern: `systemd-run --scope --collect --quiet --unit=livos-backup-${jobId}-${ts}` |
| Cloudflare tunnel + slow upload | Backup competes with tunnel for bandwidth, killing UI | Throttle backup to 50% upstream; surface "tunnel will be slow during backup" warning |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded tar buffering in livinityd RAM | livinityd RSS climbs to 4-8 GB during backup | Throttle stream between tar and upload; cap alpine container memory at 256 MB | Volumes >50 GB or upload <10 MB/s (residential upload) |
| pg_dump -j (parallel) on 4-core Mini PC | Mini PC CPU pinned, AI agent latency spikes | Force `pg_dump -j 1` on Mini PC; only allow `-j N` if `nproc >= 8` | Always on residential hardware |
| Unbatched Docker volume enumeration | Backup of 50 per-user apps takes hours | Parallel pool of 3 concurrent volume tars; serialize cloud uploads | >20 concurrent users with apps |
| Synchronous fsync on every PG row in restore | Restore takes 6 hours instead of 30 min | `pg_restore -1` (single transaction) + `synchronous_commit=off` during restore only | Always for >1 GB DB restores |
| Re-encrypting full archive on key rotation | TB-sized re-uploads | Wrap-key architecture: rotate master key only; archive DEK stays put | Always — prevent the wrong design from day 1 |
| Building manifest from full archive scan at restore-list time | Settings > Backups loads in 30s | Cache manifest list in `backup_archives` PG table, refresh on backup-write | Bucket has >100 archives |
| Large in-memory deletion of orphan multiparts | Hangs Settings UI | Background scheduler job, not foreground UI button | Cleanups >50 orphans |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Encrypted credentials decrypted in livinityd memory long-term | RCE on livinityd → credentials extractable from heap | Decrypt creds only at job start, use, then `Buffer.fill(0)` immediately. Never store decrypted creds in instance state. |
| Single master key for all users | Admin can decrypt every user's data without consent | Per-user DEK derived from user-set backup passphrase (NOT login password — separate concept) |
| Backup metadata leaks user existence | List of usernames visible via S3 object key listing (`backup-bruce-2026...tar`) | Hash usernames in object keys: `backup-${hash(userId)}-...`; store reverse map in PG |
| Restore endpoint accepts any userId | Cross-user restore by parameter manipulation | Restore endpoint enforces `currentUser.role === 'admin' OR currentUser.userId === restoreUserId` |
| Local-disk backup readable by all containers | Compromised app container reads `/opt/livos/data/backups` | Set perms `0700 root:root` on backup directory; bind-mount only the destination path into the alpine helper, not parent |
| Decryption key in process env | `cat /proc/$(pidof livinityd)/environ` exposes key | Read key from disk on demand, never put in env; clear from memory after use |
| No audit log of restore actions | Insider threat: admin restores user data, exfiltrates, no trace | Every restore logs `audit_logs(action='backup.restore', actor_user_id, target_user_id, archive_id, ip)` — immutable trigger like `device_audit_log` from v26.0 |
| Backup archives signed by destination, not by source | MITM substitutes attacker archive with attacker key | Sign manifest with HMAC over (archive_sha256 + master_key); verify at restore-time |
| Recovery kit downloaded over plain HTTP | Network attacker captures kit | Recovery kit only delivered via authenticated UI session over TLS; never email/SMS |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Backup" button with no preview of size/duration | User clicks, walks away, NVMe fills | Pre-flight estimate: "This backup will be ~50 GB and take ~90 min. Continue?" |
| Restore confirmation lets user click "Yes" without typing target | Accidental restore wipes live data | Type-to-confirm: "Type the word RESTORE to overwrite live data" |
| Backup status shown only when user opens Settings | User doesn't notice 30 days of failures | Persistent toast / sidebar badge if last 3 runs failed |
| Encryption passphrase prompt buried in advanced settings | User skips, backup is unencrypted, posts to Reddit | Encryption REQUIRED for cloud destinations; UI doesn't allow disabling for non-local |
| Recovery kit shown once, never findable again | User loses kit, can't get a new one | "Show recovery kit" button always available in Settings; require password re-auth before display |
| Schedule expressed in cron syntax | User can't figure out `0 3 * * 0` means weekly Sunday | Visual schedule builder ("Daily at HH:MM" / "Weekly on [day]") that compiles to cron under the hood |
| "Job succeeded" with no breakdown when 1 of 3 destinations failed | User thinks 3-2-1 working, isn't | Per-destination status pills next to job name |
| No "compare backups" view for drill | User can't tell if drill restore matches today's data | Drill report shows row-count diffs per table between drill-restore and live |
| Restore wipes preferences silently | User loses their dock layout, theme, etc. | Restore preview lists categories ("DB: 1.2 GB, Volumes: 8 GB, Settings: 4 KB — ALL will be replaced") |

---

## "Looks Done But Isn't" Checklist

- [ ] **Encryption:** Often missing recovery kit flow — verify "Show recovery kit" button works AFTER user logs out and back in.
- [ ] **Verification:** Often missing actual restore test — verify `verifier.ts` does pg_restore --schema-only against ephemeral DB, not just `gunzip -t`.
- [ ] **Drill:** Often missing teardown of drill DB — verify `livos_drill` is dropped after each drill run, no residue.
- [ ] **Multi-destination:** Often missing per-destination retry on partial fail — verify failed B2 retries while S3 succeeds, not whole-job retry.
- [ ] **Restore:** Often missing recovery from interrupted restore — verify livinityd refuses to start cleanly with `restore-pending.json` present.
- [ ] **Update guard:** Often missing the deferral path — verify update.sh sleeps when `backup-in-progress.flag` exists.
- [ ] **Append-only creds:** Often missing destination-test detection — verify "Test destination" reports yellow warning when creds CAN delete.
- [ ] **Multipart cleanup:** Often missing abort-on-error — verify failed S3 upload triggers `AbortMultipartUpload` (check S3 list-multipart after killing a backup mid-upload).
- [ ] **Per-user keys:** Often missing real isolation — verify admin CANNOT decrypt user A's archive without user A's passphrase.
- [ ] **Manifest:** Often missing forward-compat version field — verify manifest.json contains `archive_format_version` AND restore refuses unknown values.
- [ ] **Audit:** Often missing immutable enforcement — verify `audit_logs` BEFORE UPDATE/DELETE trigger blocks tampering.
- [ ] **Disk-fill prevention:** Often missing actual statvfs check — verify pre-flight fails when free space < 1.5× last archive.
- [ ] **Bandwidth throttle:** Often missing real throttle — verify upload speed actually capped (use `dd | pv | curl` smoke test).
- [ ] **Time zone:** Often missing per-job TZ — verify schedule fires at correct time when LivOS server TZ ≠ user TZ.
- [ ] **Quiesce:** Often missing real subscriber response — verify nexus core ACKs `backup:quiesce` event before pg_dump starts; doesn't just rely on timeout.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Lost encryption key, recovery kit also lost | TOTAL — no recovery | Document policy: "There is no recovery from full key+kit loss. Period." UI message must be explicit. |
| Schrödinger backup discovered at restore time | HIGH — manual archive forensics | Try older archives sequentially. Try alpine `gunzip -dc | tar t` to isolate corruption. If all corrupt, escalate to user-data-from-other-sources (e.g., re-download from livinity.io platform if applicable). |
| Mid-restore failure | MEDIUM | Boot LivOS in maintenance mode (refuse to start cleanly with restore-pending.json). UI offers "Retry" or "Roll back to pre-restore snapshot" (auto-snapshot taken before restore). |
| Ransomware wiped local + cloud (bypass append-only) | HIGH | Recover from air-gapped USB / Object-Locked S3. If no Object Lock, recover from B2 versioning lifecycle (90-day version retention). |
| Update mid-backup killed backup | LOW | Backup-runs cleanup on livinityd start marks orphan; next scheduled run picks up. User's only impact: missed one backup. |
| Cross-user restore (admin restored A into B) | HIGH | Take a snapshot before any restore (auto-snapshot is the recovery mechanism). Roll back B's data to pre-restore snapshot. |
| Disk full from retention failure | MEDIUM | Manual SSH: `find /opt/livos/data/backups -mtime +N -delete`; investigate why prune skipped; PG checkpoint may need WAL cleanup too. |
| Forgotten to check destination test before scheduling | LOW | Settings shows red badge on jobs where `last_run_status='failure'`; user notices and fixes creds. |
| Schema drift on old archive | MEDIUM | Restore archive_format_version-N parser tries forward migrations; if migrations fail, restore-to-staging only and let user manually export specific data. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Schrödinger's backup | Phase 4 (BAK-VERIFY) + Phase 7 (BAK-DRILL) | E2E test: corrupt an archive, run drill, verify drill marks job red |
| 2. Encryption catastrophe | Phase 2 (BAK-EKIT + key wrap) | E2E test: rotate key, restore old archive successfully |
| 3. Inconsistent snapshot | Phase 3 (BAK-QUIESCE) | E2E test: write to PG mid-backup, verify quiesce event blocks the write |
| 4. Ransomware path to backups | Phase 5 (BAK-APPEND-ONLY) + Phase 6 (BAK-LOCK) | E2E test: with append-only creds, attempt deleteObject → expect 403 |
| 5. Disk-fill | Phase 4 (BAK-PREFLIGHT) + Phase 7 (retention verify) | E2E test: fill disk to 90%, run backup → expect pre-flight reject |
| 6. Restore-while-running | Phase 8 (BAK-RESTORE) + Phase 8b (BAK-RESTORE-RECOVERY) | E2E test: kill -9 restore mid-flight, restart livinityd → expect maintenance page |
| 7. Multi-user data leakage | Phase 2 (per-user keys) + Phase 8 (RBAC) | E2E test: as member, attempt to restore admin's archive → expect 403 |
| 8. Network partition | Phase 4 (BAK-MULTIPART-CLEAN) + Phase 4b (BAK-LIFECYCLE) | E2E test: kill upload mid-flight, verify abortMultipartUpload sent |
| 9. Update + backup interaction | Phase 4 (BAK-INFLIGHT-PG) + Phase 5 (BAK-UPDATE-GUARD) + v30.1 hotpatch (cgroup-escape) | E2E test: trigger update during backup → expect deferral message |
| 10. Phase 20 reuse blast-radius | Phase 1 (reuse audit spike) + Phase 2 (BAK-VAULT-KEY) | Spike report explicitly documents Phase 20 limitations under v30.0 scope |
| 11. Multi-destination consistency | Phase 1 (multi-dest schema) + Phase 6 (per-dest retry) | E2E test: 3-destination job with 1 fail → expect partial_success status |
| 12. Restore version drift | Phase 1 (BAK-VERSION) + Phase 8 (BAK-RESTORE-MIGRATE) | E2E test: restore v30.0 archive into simulated v33.0 schema → migrations run |
| 13. Time skew / DST | Phase 1 (BAK-TZ) | E2E test: schedule in TZ-A, verify cron fires at correct UTC instant |

---

## Sources

- [pgforensics: Schrödinger's Backup — Automating PostgreSQL Restore Validation](https://pgforensics.com/schrodingers-backup-automating-postgresql-restore-validation-because-green-dashboards-lie/)
- [PostgreSQL 18 docs: pg_dump consistency model](https://www.postgresql.org/docs/current/app-pgdump.html)
- [PostgreSQL 18 docs: SQL Dump backup chapter](https://www.postgresql.org/docs/current/backup-dump.html)
- [Helge Klein: restic + B2 ransomware-resistant backups (canonical writeup)](https://helgeklein.com/blog/restic-encrypted-offsite-backup-with-ransomware-protection-for-your-homeserver/)
- [Computingforgeeks: Immutable backups Linux MinIO Restic Borg (Apr 2026)](https://computingforgeeks.com/immutable-backups-ransomware-proof-linux-minio-restic-borg/)
- [Kopia docs: Ransomware Protection](https://kopia.io/docs/advanced/ransomware-protection/)
- [TrendMicro: S3 Ransomware Variants and Attack Paths (Nov 2025)](https://www.trendmicro.com/en_us/research/25/k/s3-ransomware.html)
- [BorgBackup issue #4236: Lost key = no recovery](https://github.com/borgbackup/borg/issues/4236)
- [restic forum: Forgotten password thread](https://forum.restic.net/t/forgotten-password/2990)
- [Home Assistant: Backup emergency kit feature](https://www.home-assistant.io/more-info/backup-emergency-kit/)
- [Home Assistant issue #134162: Encryption key rotation breaks old backups](https://github.com/home-assistant/core/issues/134162)
- [WorkOS: Multi-tenant SaaS architecture guide](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
- [AWS: Managed database backup and recovery in multi-tenant SaaS](https://aws.amazon.com/blogs/database/managed-database-backup-and-recovery-in-a-multi-tenant-saas-application/)
- [Google Cloud: Using chaos engineering to test DR plans](https://cloud.google.com/blog/products/devops-sre/using-chaos-engineering-to-test-dr-plans)
- [OneUptime: Automated backups Ubuntu restic/borg (Jan 2026)](https://oneuptime.com/blog/post/2026-01-07-ubuntu-automated-backups-restic-borg/view)
- LivOS source inspection: `livos/packages/livinityd/source/modules/scheduler/backup.ts` (Phase 20 reuse target)
- LivOS source inspection: `livos/packages/livinityd/source/modules/scheduler/backup-secrets.ts` (vault key derivation)
- LivOS source inspection: `livos/packages/livinityd/source/modules/scheduler/index.ts:21,99,131` (in-flight Set)
- LivOS source inspection: `update.sh:15-45,170-171,545-556` (cgroup-escape pattern from v29.0)
- LivOS context: v29.0 milestone audit + v29.1 hot-patches (cgroup-escape, SIGPIPE survival, completion sentinel)

---
*Pitfalls research for: v30.0 Backup & Restore — multi-user self-hosted on Mini PC*
*Researched: 2026-04-28*
*Confidence: HIGH (verified via official docs, real-world post-mortems, direct LivOS source inspection)*
