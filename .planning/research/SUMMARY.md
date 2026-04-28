# Project Research Summary — v30.0 Backup & Restore

**Project:** Livinity (LivOS) — v30.0 Backup & Restore milestone
**Domain:** Self-hosted multi-component disaster recovery (PostgreSQL + Redis + filesystem + per-user Docker volumes + secrets) for a multi-user residential AI server OS
**Researched:** 2026-04-28
**Confidence:** HIGH (all four research dimensions grounded in 2025-26 web sources, post-mortems, and direct LivOS source inspection of Phase 20 + v29.0 Phase 33)

---

## Executive Summary

LivOS v30.0 ships **system-level backup & restore** for a single-host (Mini PC) multi-user residential AI server OS. Industry consensus across 2026 references (restic + Backrest, Kopia, Borgmatic, Synology, Time Machine, Veeam, pgBackRest, PBS, Home Assistant 2026.4) is unambiguous: a credible backup product **must** ship encryption-at-rest with a recovery code, scheduled automated backups, multi-destination support, retention policies, integrity verification, and a tested disaster-recovery path. The dominant 2026 architectural shape is **logical PG dump (`pg_dump -Fc`) + Redis BGSAVE + filesystem snapshot, encrypted with `age` (typage)**, scheduled via existing cron infrastructure, with restore as a **standalone shell tool that does NOT depend on the daemon being healthy**. The single biggest moat available — the one no competing self-hosted backup product currently offers — is **AI-assisted restore guidance + pre-update auto-snapshot integration**, where the backup system reads recent failed updates (v29.0 Phase 33 history) and proposes "roll back to before today's failed deploy."

The recommended approach is to **reuse Phase 20's existing infrastructure** (`scheduled_jobs` PG table, `Scheduler` + `inFlight` mutex, S3/SFTP/local destination uploaders, AES-256-GCM credential vault, alpine-tar Docker volume streaming) but **explicitly build a NEW sibling `system-backup` handler** rather than extending the per-volume `volume-backup` handler — the two have different shapes (single-volume → tar.gz vs multi-source → manifest+sources). A new module `modules/system-backup/` orchestrates the run lifecycle (state machine: pending → running → uploading → verifying → complete), each source is a `Readable`-stream factory, and a shell `livos-restore.sh` solves the chicken-and-egg DR scenario. **Critically, before any v30.0 implementation work begins, a Phase 0 Reuse-Audit Spike must benchmark Phase 20 against v30.0-scale workloads** — Phase 20's in-memory `inFlight: Set` and JWT-derived vault key were sized for short, app-volume jobs and have known failure modes (mid-flight orphans, factory-reset bricks all backups) that would silently break at v30.0 scale.

The biggest risks come from three families: (1) **Schrödinger's backup** — green dashboards lie because the only test that matters is a real restore, so verification + drill must ship in the same phase as the writer, never later; (2) **encryption-key catastrophe** — lost passphrase = total data loss with no exceptions, so a mandatory BIP39 recovery-kit modal blocks plan creation, and the master key must NOT be derived from the JWT secret (factory reset rotates JWT and would silently brick every backup); (3) **livinityd-coupled backup process** — like v29.0's update.sh, long-running backups must survive livinityd restart via cgroup-escape (`systemd-run --scope`), and a Redis-coordinated mutex must prevent backup-during-update collisions that would corrupt both. Everything else (ransomware path-to-backups, multi-destination consistency, restore-while-running, multi-user data leakage, schema drift across versions) is well-understood and addressable with documented patterns.

---

## Key Findings

### Recommended Stack

The stack is **predominantly reuse + targeted additions**. Phase 20 already provides the destination uploaders (S3 via `@aws-sdk/lib-storage`, SFTP via `ssh2-sftp-client`, local via `fs`), the AES-256-GCM credential vault, the `Scheduler` with `inFlight` mutex, and the alpine-tar Docker volume streaming. The new dependencies are minimal: one npm package (`age-encryption@^0.2.4`) for stream encryption inside livinityd, plus three system binaries already partially present (`pg_dump 16` from postgresql-client-16, `kopia 0.18.x` already vendored, `rclone 1.73.x` for B2/Wasabi/MinIO/R2 multi-cloud transport). See `.planning/research/STACK.md` for full version compatibility matrix.

**Core technologies:**

- **`pg_dump --format=custom --compress=zstd:3`** — logical PG snapshot of the single `livos` DB. Cross-version-restorable (survives a future PG 17 upgrade), parallel-restore via `pg_restore -j N`. `pg_basebackup`/pgBackRest are enterprise-overkill at LivOS scale.
- **`redis-cli BGSAVE` + RDB copy (no AOF)** — second-of-loss tolerable for ephemeral session/conversation state. Never use blocking `SAVE`.
- **`age-encryption` (typage) ^0.2.4** — pure-TS X25519+ChaCha20-Poly1305 stream cipher by Filippo Valsorda, ESM-only, no native deps. Modern PGP replacement. Used as a stream filter on top of kopia (for non-kopia destinations) AND for sealed `.env`/secrets/standalone archives.
- **Existing `kopia` (already vendored)** — content-defined chunking, dedup across snapshots, encryption, restore-resume, S3/SFTP/B2/rclone backends. Reused for `/opt/livos/data` filesystem snapshots; do NOT switch to restic/borg.
- **Existing Phase 20 alpine-tar Docker volume streaming** — proven working, kept verbatim; new code adds optional age-encryption stream filter.
- **`rclone 1.73.x`** — universal transport for kopia repos to B2/Wasabi/MinIO/R2 (70+ providers, native B2 avoids S3-compat 1000-req cap). Direct `@aws-sdk/lib-storage` is preferred for raw streaming uploads (Phase 20 path) because it has Node-native abort + progress events.
- **Existing `node-cron` Scheduler + `inFlight: Set` mutex** — DO NOT introduce BullMQ. LivOS is single-process; in-process mutex is correct. Add a `heartbeat_at` column on `scheduled_jobs` for crash-survivability of long-running jobs.
- **`zstd:3` compression everywhere we control format** — 5-10× faster than gzip at near-equal ratio, ~4× faster decompression (matters more for restore than backup). Keep gzip available as lowest-common-denominator fallback.
- **Standalone `livos-restore.sh`** — pure shell + `openssl enc -aes-256-gcm` + `psql` + `redis-cli` + `docker` + `tar`. Zero Node dependency. Solves the chicken-and-egg: livinityd cannot bootstrap itself when `/opt/livos` is gone.

### Expected Features

**Must have (table stakes — none optional):**

- Scheduled automatic backups (cron-style); manual "Backup Now" trigger
- Mandatory encryption-at-rest with passphrase + BIP39 recovery code (Kopia-style refuse-unencrypted; Home Assistant 2026.4 Argon2id pattern)
- PostgreSQL `pg_dump` (NOT file-copy of `/var/lib/postgresql`); Redis BGSAVE-based RDB snapshot
- Multi-destination support (1+, up to 5 per plan; 3-2-1 capable)
- Retention policies (`keep_last` + GFS daily/weekly/monthly)
- Backup history UI (per-run JSON record + log file, copy v29.0 Phase 33 pattern verbatim)
- Failure notifications (in-UI badge mirror Phase 34, optional email + webhook)
- Integrity verification (light per-run + scheduled full)
- In-place restore with type-to-confirm + pre-restore auto-snapshot insurance
- Selective/granular restore (browse manifest tree, single-file recovery — covers 80% of real restores)
- Disaster recovery: restore-to-fresh-install via `install.sh --restore-from`
- Backup ↔ update mutex (Redis lock, prevents Phase 33-style collision)
- Per-plan source selection (PostgreSQL, Redis, /opt/livos/data, Docker volumes, .env, Caddyfile)

**Should have (differentiators — top 4 to ship in v30.0):**

1. **Pre-update auto-snapshot integration with v29.0 Phase 32/33** — the killer feature; turns existing rollback into full data rollback. Hard dependency on `update.sh` calling `backup.runNow({plan: 'pre-update', tags: ['pre-update', sha]})` BEFORE Phase 30/31 update steps. Free user value.
2. **Restore drill (test-restore that doesn't touch production)** — PBS recommends monthly drill cadence. Differentiator because most homelab tools require manual orchestration. Restores into ephemeral `livos_drill` PG DB + tmpfs FS + scratch Docker network, runs sanity queries, tears down.
3. **BIP39 recovery code + mandatory recovery-kit modal at plan creation** — small effort, prevents the #1 backup horror story. Modeled on Home Assistant 2026.4 emergency-kit pattern.
4. **AI-assisted restore guidance (MVP version)** — THE moat in the "AI + Self-Hosting" gap. Even an MVP "show me snapshots near the failed update" version differentiates. Wires Phase 33 update history + new `backup_history` into a `diagnostic_restore` MCP tool.

**Defer to v30.1:**

- Full AI-driven restore agent (Phase 23 `docker_diagnostics`-level integration)
- "What changed" diff view between snapshots
- Cron-with-preview tab (presets only at v30.0)
- Bandwidth throttling / scheduled run windows
- Encryption key rotation
- Pre-/post-backup hooks (Borgmatic-style)
- Snapshot tagging + search
- Immutable destination toggle (S3 Object Lock — basic append-only credentials ship in v30.0)
- Cross-user delegation token flow (admin restore on behalf of departed user)
- PWA Web Push notifications
- Cgroup-escape for long-running backups (mirror v29.1 update.sh hot-patch timing)

**Defer to v31+:**

- PITR for Postgres (WAL archiving) — too heavy
- TPM-backed encryption / YubiKey hardware key
- P2P backup to friends' LivOS instances
- Hourly local snapshot tier (Time Machine model — needs ZFS/btrfs detection)
- Cross-environment backup (multi-host Docker per Phase 22)

**Anti-features (do NOT build):**

- Proprietary backup format (use restic/kopia open formats — survives LivOS dying)
- Vendor key escrow ("we'll handle keys for you" — defeats Zero Trust)
- No-passphrase / "set up later" backups (Kopia's stance is correct: refuse)
- Cloud-only managed default destination (defeats self-hosted value prop)
- Backup of `/` root filesystem (unbounded, corrupts /proc /sys /dev)
- Real-time CDP / continuous replication (wrong layer for homelab)
- "Auto-detect what to back up" magic (always wrong eventually)
- Cross-tenant deduplication (multi-user data-leak risk)
- Email-based passphrase reset (encryption theater)
- Browser-based decryption (key in JS context = exfiltration)

### Architecture Approach

**Verdict: new sibling `system-backup` module, NOT extension of Phase 20's `volume-backup`.** The two have fundamentally different shapes (single-volume tar vs multi-source manifest), and extending would risk regressions for operators relying on existing per-volume jobs. The orchestrator lives IN-PROCESS in livinityd, driven by the existing Phase 20 scheduler with a new `BUILT_IN_HANDLERS['system-backup']` entry. Three new PG tables (`backup_destinations`, `backup_history`, `backup_keys`) plus reuse of `scheduled_jobs.type='system-backup'` for the schedule itself. Bootstrap restore is a **standalone shell script** (`livos-restore.sh`) at repo root, NOT a livinityd flag — livinityd cannot bootstrap itself when `/opt/livos` is gone. See `.planning/research/ARCHITECTURE.md` for full schema, state machine, data flow, and integration points.

**Major components:**

1. **`system-backup/orchestrator.ts` + `state-machine.ts`** — owns the run lifecycle; acquires Redis lock; drives state transitions; writes to `backup_history` BEFORE every transition (crash-resilient); mirrors v29.0 Phase 33 pending-rename atomicity.
2. **`system-backup/sources/{pg-dump,redis-dump,filesystem-tar,secrets,docker-volumes}.ts`** — each is a `Readable`-stream factory matching a `BackupSource` interface. Orchestrator pipes stream → SHA-256 hasher → AES-256-GCM cipher → file.
3. **`system-backup/key-vault.ts`** — generates 32-byte master key on first run, wraps with KEK from `/opt/livos/data/secrets/backup-key` (separate file, NOT JWT-derived). Per-run envelope encryption: random data-key wrapped under master key.
4. **`system-backup/manifest.ts`** — builds + verifies the unencrypted `manifest.json` (per-source SHA-256, sizes, schema_version, livos_sha, key_id, wrapped_data_key, Argon2id params).
5. **`system-backup/destination.ts`** — thin shim that re-exports `uploadToS3 / uploadToSftp / uploadToLocal` from Phase 20's `scheduler/backup.ts` verbatim.
6. **`livos-restore.sh` (standalone shell)** — disaster-recovery linchpin. Pure shell + `openssl` + `psql` + `redis-cli` + `docker` + `tar`. Zero Node dependency.
7. **UI: `features/system-backup/` (Settings > Backup section)** — history table, destination CRUD with test-connection probe, run-now button, drill-mode banner, restore wizard, master-passphrase setup. Long-running mutations in `httpOnlyPaths`.

**Decision: one master key per LivOS install, NOT per-user.** Rationale: `pg_dump` of the `livos` DB is global and crosses user boundaries (it has every user's password hash, sessions, app instances); Docker volumes are owned by dockerd at the OS layer; per-user passphrases mean a user forgetting theirs is unrecoverable; LivOS already runs everything as root in `livinityd`. The per-user UI filters `backup_history.manifest_json` by username and lets users trigger partial restores of their own apps; admin restore for offboarding flows is logged via `device_audit_log` (Phase 15 immutability triggers).

### Critical Pitfalls

13 pitfalls were identified across 6 dimensions. The top five — those that cause silent data loss, irrecoverable backups, or data leakage and CANNOT be patched in later — are:

1. **Schrödinger's backup (green dashboard, dead archive)** — Daily backups report success for 4 months; restore reveals truncated tar, invalid SQL, or a rotated key. **Avoid:** verify-on-write ships in the SAME phase as the writer. Mandatory L1 (per-source SHA mid-run) + L2 (post-upload HEAD/ETag) + L3 (weekly drill, restore into ephemeral `livos_drill` DB and run sanity queries). UI surfaces "Last successful drill: X days ago" — red if >14 days.
2. **Encryption-key catastrophe (data fine, key gone)** — restic/borg/Kopia/CrashPlan all explicitly say "lost passphrase = permanent data loss." **Avoid:** mandatory Emergency Kit modal at plan creation (Home Assistant 2026.4 pattern); printable PDF or password-manager save; modal cannot be dismissed. Master key in separate `/opt/livos/data/secrets/backup-key` file, NOT JWT-derived. Wrap-key architecture for rotation; pre-flight key check on every Backup Now.
3. **Inconsistent snapshot (PG mid-transaction, Redis mid-write, FS mid-rename)** — Without coordinated quiesce, three point-in-time snapshots from three different times produce torn restores. **Avoid:** application-level quiesce protocol via Redis pub/sub (`backup:quiesce` → subscribers finish writes, `backup:resume` releases). Snapshot ordering: PG first, Redis second, filesystem last. Manifest records `quiesce_started_at`/`pg_dump_lsn`. For per-app Docker volumes: `docker pause` during tar.
4. **Ransomware path to backups (attacker wipes archives too)** — Standard 2024-26 playbook: compromise livinityd, read S3 creds, `DeleteObjectsV2`, then encrypt live data. **Avoid:** append-only credentials by default; UI guides user to create application key WITHOUT `s3:DeleteObject`; auto-detect at destination-test time and warn yellow if creds CAN delete. Server-side retention via lifecycle, NOT client-side prune. 3-2-1 enforcement.
5. **Self-update + backup interaction (update.sh kills backup mid-write)** — Backup runs as livinityd child process; `systemctl restart livos.service` during update kills it. v29.0 already needed cgroup-escape hot-patches; same pattern applies. **Avoid:** persistent in-flight registry in PG (`backup_runs(id, status='running', started_at, pid)`) replaces in-memory `inFlight: Set`. update.sh pre-flight check sleeps if `/opt/livos/data/backup-in-progress.flag` exists. UI Install Update button disabled when backup running. Cgroup-escape via `systemd-run --scope --collect` deferred to v30.1 (mirror v29.1 timing).

See `.planning/research/PITFALLS.md` for the full set including: (6) restore-while-running PG corruption, (7) multi-user backup data leakage, (8) network partition + orphan multipart uploads, (9) Phase 20 reuse blast-radius, (10) multi-destination consistency, (11) restore version drift / schema migrations, (12) DST and time-skew, (13) disk-fill from retention failure.

### Pitfall → Phase Coverage Mapping

| # | Pitfall | Prevention Phase | Defer-OK? |
|---|---------|------------------|-----------|
| 1 | Schrödinger's backup | P3 (manifest+verify L1+L2) + P7 (drill L3) | **NO** — verify-on-write SAME phase as writer |
| 2 | Encryption-key catastrophe | P1 (key vault) + P6 (recovery escrow + modal) | **NO** — recovery kit ships with encryption |
| 3 | Inconsistent snapshot | P2 (orchestrator + quiesce design) + P3 (per-source) | **NO** — quiesce design before any source |
| 4 | Ransomware path | P4 (destinations append-only by default) | v30.1 OK for full Object Lock UX |
| 5 | Disk-fill | P2 (pre-flight statvfs) + P4 (retention verify) | **NO** — pre-flight is one statvfs call |
| 6 | Restore-while-running | P7 (livos-restore.sh stops services + restore-pending recovery) | **NO** — half-shipped restore is worse than none |
| 7 | Multi-user data leakage | P1 (single master key + admin escrow decision) + P6 (RBAC routes) | **NO** — encryption boundary is architectural |
| 8 | Network partition / orphan multipart | P4 (try/finally + Upload.abort) | **NO** — abort-on-error is one line |
| 9 | Update + backup collision | P5 (PG-backed inFlight + update.sh guard) + v30.1 hotpatch (cgroup-escape) | cgroup-escape OK for v30.1 |
| 10 | Phase 20 reuse blast-radius | **P0 (REUSE-AUDIT SPIKE)** + P1 (separate vault key) | **NO** — must spike before committing |
| 11 | Multi-destination consistency | P1 (multi-dest schema from day 1) + P4 (per-dest retry) | **NO** — schema decision is permanent |
| 12 | Restore version drift | P1 (BAK-VERSION in manifest) + P7 (restore migration) | **NO** — version stamp is free if done day 1 |
| 13 | Time skew / DST | P1 (BAK-TZ column on scheduled_jobs) | **NO** — schema decision is permanent |

---

## Implications for Roadmap

### Phase Summary (8 phases total — Phase 36 through Phase 43)

**Phase 36 — Reuse-Audit Spike (NON-NEGOTIABLE)** — benchmark Phase 20 against v30.0 scale before freezing schema.

**Phase 37 — Schema Foundation + Key Vault** — three new PG tables, separate `/opt/livos/data/secrets/backup-key` (NOT JWT-derived), multi-destination + version + timezone schema permanent on day 1.

**Phase 38 — Orchestrator + State Machine + PG Dump** — first end-to-end source, crash-reaper, pre-flight statvfs, pending-rename atomicity, quiesce protocol.

**Phase 39 — Redis + Filesystem + Secrets + Docker Volumes + Manifest** — remaining sources + integrity contract.

**Phase 40 — Destinations + Append-Only + Multi-Destination + Retention + L2 Verify** — Phase 20 uploader reuse, ransomware-resistant defaults, post-upload HEAD verify.

**Phase 41 — Scheduler + Pre-Update Auto-Snapshot + Backup↔Update Mutex** — the killer v29.0 integration; update.sh guard.

**Phase 42 — UI: History + Run-Now + Destinations + Recovery-Kit Modal** — mandatory BIP39 modal that blocks plan creation, sidebar status badge.

**Phase 43 — `livos-restore.sh` + install.sh `--from-backup` + Restore-Pending Recovery + Drill Mode** — disaster-recovery linchpin; pure shell; drill mode (default-disabled); selective + full-system restore wizards in UI.

### Research Flags

- **Needs research:** Phase 36 (the spike IS the research), Phase 43 (livos-restore.sh requires 1-day prototype spike on fresh Ubuntu 24.04 VM)
- **Standard patterns:** Phases 37-42 (all build on Phase 20 + Phase 33 + well-documented external libraries)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | All primary recommendations validated against Phase 20 code AND independent 2025-26 sources. |
| Features | **HIGH** | Table stakes drawn from 8+ reference products with universal cross-confirmation. Anti-features cited from documented community pain. |
| Architecture | **HIGH** | Schema design, orchestrator pattern, source-plugin pattern, Phase 20 reuse all grounded in read source. State-machine + pending-rename atomicity lifted directly from v29.0 Phase 33. |
| Pitfalls | **HIGH** | Verified via official PG/restic/borg/Kopia docs, real-world post-mortems, AND direct LivOS source inspection. |

**Overall confidence:** **HIGH.** v30.0 is primarily integration + targeted additions, not greenfield design.

### Gaps to Address

1. **Phase 36 spike output is a hard input to Phase 37 schema.** Allocate one full day.
2. **Network-resilience strategy under Mini PC tunnel reality.** v30.0 MVP rule = whole-run failure on network drop, next scheduled run picks up. v30.1 chunked-upload work is separate.
3. **AI-assisted restore guidance MVP scope.** Phase 42 ships data plumbing; full agent integration is v30.1.
4. **Master-passphrase-loss policy enforcement at the UI layer.** Phase 42 recovery-kit modal copy must frame "no recovery, period" front and center.
5. **Drill mode operational cost.** L3 monthly drill restores into ephemeral PG/Redis/Docker — consumes disk + IO. Default-disabled in Phase 43.

---

## Sources

### Primary (HIGH confidence)

**Stack:** age-encryption.org spec; npm `age-encryption` (typage) by Filippo Valsorda; Crunchy Data Intro to Postgres Backups; PostgreSQL 18 official docs; Microsoft Learn pg_dump best practices; Redis docs Persistence; Kopia.io docs; rclone.org changelog/S3-providers.

**Features:** Backrest README + backrest.org; Kopia features + encryption docs; Borgmatic README; Synology Hyper Backup integrity docs; pgBackRest user guide; Home Assistant 2026.4 modernization blog; Veeam Instant Recovery; Proxmox Backup 2026 cloud-pbs.com; AWS Restore Testing dev guide; WorkOS multi-tenant RBAC; Azure Backup MUA docs.

**Pitfalls:** pgforensics.com (Schrödinger's Backup); PostgreSQL 18 backup-dump chapter; Helge Klein restic+B2 ransomware writeup; TrendMicro S3 ransomware Nov 2025; Kopia ransomware-protection docs; BorgBackup issue #4236; Home Assistant issue #134162 + emergency-kit feature.

**LivOS-internal (HIGH — direct source inspection):** `livos/packages/livinityd/source/modules/scheduler/{backup.ts,backup-secrets.ts,index.ts}`; `livos/packages/livinityd/source/modules/backups/`; `livos/packages/livinityd/source/modules/database/schema.sql`; v29.0 Phase 33 update.sh + system/update.ts.

---

*Research completed: 2026-04-28*
*Synthesized from: STACK.md (HIGH), FEATURES.md (HIGH), ARCHITECTURE.md (HIGH), PITFALLS.md (HIGH)*
*Ready for roadmap: Phase 36 spike is the recommended starting work item.*
