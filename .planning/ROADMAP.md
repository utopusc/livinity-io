# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward.

## Milestones

- ✅ **v19.0 Custom Domain Management** — Phases 07-10.1 (shipped 2026-03-27)
- ✅ **v20.0 Live Agent UI** — Phases 11-18 (shipped 2026-03-27)
- ✅ **v21.0 Autonomous Agent Platform** — Phases 19-28 (shipped 2026-03-28)
- ✅ **v22.0 Livinity AGI Platform** — Phases 29-36 (shipped 2026-03-29)
- ✅ **v23.0 Mobile PWA** — Phases 37-40 (shipped 2026-04-01)
- ✅ **v24.0 Mobile Responsive UI** — Phases 1-5 (shipped 2026-04-01)
- ✅ **v25.0 Memory & WhatsApp Integration** — Phases 6-10 (shipped 2026-04-03)
- ✅ **v26.0 Device Security & User Isolation** — Phases 11-16 (shipped 2026-04-24)
- ✅ **v27.0 Docker Management Upgrade** — Phases 17-23 (shipped 2026-04-25)
- ✅ **v28.0 Docker Management UI (Dockhand-Style)** — Phases 24-30 (shipped 2026-04-26)
- ✅ **v29.0 Deploy & Update Stability** — Phases 31-35 (shipped 2026-04-27)
- ⏳ **v30.0 Backup & Restore** — Phases 36-43 (in progress)

## Phases

**Active milestone: v30.0 Backup & Restore (Phases 36-43)**

- [ ] **Phase 36: Reuse-Audit Spike** — Benchmark Phase 20 codepath against v30.0 multi-source multi-hour workloads; produce decision matrix that gates schema design
- [ ] **Phase 37: Schema Foundation + Key Vault** — Permanent PG schema (3 new tables), separate `/opt/livos/data/secrets/backup-key` (NOT JWT-derived), envelope encryption foundation
- [ ] **Phase 38: Orchestrator + State Machine + PG Dump** — Crash-resilient run lifecycle, pre-flight gates, quiesce protocol, first end-to-end source (`pg_dump`)
- [ ] **Phase 39: Remaining Sources + Manifest + L1 Verify** — Redis/FS/secrets/docker-volume sources + HMAC-signed manifest + per-source SHA-256 mid-stream
- [ ] **Phase 40: Destinations + Retention + L2 Verify** — Multi-destination uploads (local/S3/SFTP), append-only credentials by default, post-upload HEAD/ETag verification
- [ ] **Phase 41: Scheduler + Pre-Update Auto-Snapshot + Update Mutex** — node-cron registration, the killer v29.0 update.sh integration, Redis-coordinated mutex
- [ ] **Phase 42: UI: History + Run-Now + Destinations + Recovery-Kit Modal** — Settings > Backup section, mandatory BIP39 modal blocking plan creation, sidebar status badge
- [ ] **Phase 43: Standalone Restore + Drill Mode + RBAC** — `livos-restore.sh` shell tool, `install.sh --from-backup`, restore-pending recovery, drill mode, multi-user RBAC

## Phase Details

### Phase 36: Reuse-Audit Spike
**Goal**: Decision matrix that documents which Phase 20 capabilities scale to v30.0 multi-source multi-hour workloads and which require replacement, gating Phase 37 schema design
**Depends on**: Nothing (entry point of v30.0; reads existing Phase 20 + v29.0 Phase 33 source)
**Requirements**: BAK-CORE-01
**Success Criteria** (what must be TRUE):
  1. User can read a single decision-matrix artifact (`.planning/phases/36-reuse-audit-spike/SPIKE-FINDINGS.md`) that names every Phase 20 component and marks it KEEP / FORK / REPLACE with reason
  2. The spike produces an explicit verdict on the four flagged failure modes — livinityd-restart resilience of in-flight jobs, in-memory `inFlight: Set` mutex limits, JWT-derived vault key blast-radius on factory reset, back-pressure under network drops
  3. Schema impact list is enumerated — every column / table that Phase 37 must add or change to support multi-destination, BAK-VERSION, BAK-TZ, heartbeat is named, with the source data flow that drove the requirement
  4. Phase 37 planner can read the artifact alone and start schema work without re-reading Phase 20 source
**Plans**: TBD
**Research flag**: this phase IS research; no separate phase research file required

### Phase 37: Schema Foundation + Key Vault
**Goal**: Permanent v30.0 data model and encryption foundation in place, allowing every downstream phase to write rows and bytes against contracts that will not change
**Depends on**: Phase 36 (consumes spike's decision matrix)
**Requirements**: BAK-CORE-02, BAK-CRYPT-01, BAK-CRYPT-02, BAK-CRYPT-03
**Success Criteria** (what must be TRUE):
  1. Three new PG tables (`backup_destinations`, `backup_history`, `backup_keys`) live in `livos/packages/livinityd/source/modules/database/schema.sql` with multi-destination, BAK-VERSION (manifest schema version), BAK-TZ (per-job timezone), and `heartbeat_at` column on `scheduled_jobs` — schema changes are permanent and idempotent on Mini PC restart
  2. A 32-byte master key is generated on first livinityd boot and persisted at `/opt/livos/data/secrets/backup-key` (mode 0600, NOT JWT-derived); rotating the JWT secret leaves backups decryptable
  3. `system-backup/key-vault.ts` exposes `wrapDataKey(masterKey)` and `unwrapDataKey(envelope)` and is consumable by `system-backup/sources/*.ts` in Phase 38 — proven by a unit test that round-trips a random data-key through wrap/unwrap and matches input bytes
  4. `age-encryption@^0.2.4` (typage) is installed and integrated as a stream filter that any `Readable` source can pipe through; an integration test encrypts a 10MB stream and decrypts it back to byte-identical output
**Plans**: TBD

### Phase 38: Orchestrator + State Machine + PG Dump
**Goal**: One source (PostgreSQL — the highest-stakes data) flows end-to-end through a crash-resilient orchestrator, proving the run lifecycle, quiesce protocol, and pre-flight gates before any other source plugs in
**Depends on**: Phase 37 (needs schema for run records and key vault for encryption)
**Requirements**: BAK-CORE-03, BAK-CORE-04, BAK-CORE-05, BAK-SRC-01, BAK-CRYPT-06
**Success Criteria** (what must be TRUE):
  1. User can trigger a PG-only backup on the Mini PC and observe the run move through `pending → running → uploading → verifying → complete` in `backup_history`, with a row-write BEFORE every transition (verifiable by killing livinityd mid-run and confirming the row reflects last-written state, not last-attempted state)
  2. Pre-flight refuses to start the run when free disk is below threshold, destination is unreachable, key vault unlock fails, or an update is in progress — each refusal lands as a distinct `error` reason in `backup_history` AND surfaces in the next phase's UI toast
  3. Crash-reaper at livinityd startup converts orphaned `running` rows (no recent `heartbeat_at`) to `failed` with reason "livinityd restarted mid-run" — verified by killing livinityd mid-run, restarting, and observing the row transition without manual intervention
  4. Pending-rename atomicity holds at destination layer: `<runId>-pending/` directory exists during the run, rename to `<runId>-success/` happens only after manifest upload completes (mirrors v29.0 Phase 33 pattern)
  5. PG dump output uses `pg_dump --format=custom --compress=zstd:3`, writes through a SHA-256 hash + age-encryption stream, and the resulting LSN is recorded in the manifest for the run
**Plans**: TBD

### Phase 39: Remaining Sources + Manifest + L1 Verify
**Goal**: Every source LivOS knows how to back up plugs into the orchestrator interface; the manifest is the integrity contract that ties them together; per-source SHA-256 hashing fails the run on corruption
**Depends on**: Phase 38 (sources implement the orchestrator's `BackupSource` interface and register through it)
**Requirements**: BAK-SRC-02, BAK-SRC-03, BAK-SRC-04, BAK-SRC-05, BAK-SRC-06, BAK-SRC-07, BAK-SRC-08
**Success Criteria** (what must be TRUE):
  1. User can configure a backup plan that selects PostgreSQL + Redis + filesystem + secrets + per-app Docker volumes, run it, and see all five sources land as separate encrypted artifacts inside the run directory with sizes and per-source SHA-256s
  2. The application-level quiesce protocol fires before any source captures data: subscribers receive `backup:quiesce` on Redis pub/sub, finish in-flight writes, the orchestrator captures sources in PG → Redis → FS order, then `backup:resume` releases — `quiesce_started_at` and `quiesce_ended_at` are recorded in the manifest
  3. `manifest.json` includes per-source SHA-256, sizes, schema_version, livos_sha, key_id, wrapped_data_key, Argon2id params, quiesce timestamps, and source-list; the manifest is HMAC-signed with the master key and uploaded LAST after all sources land in `<runId>-pending/`
  4. Mid-stream corruption of any source (simulated by interrupting one source's pipe) causes the run to fail with reason "L1 SHA-256 mismatch" in `backup_history.error` and the `<runId>-pending/` directory does NOT get renamed to `-success/`
  5. The `filesystem-tar` source NEVER writes outside its hard-coded allowlist — verified by attempting to add `/proc` or `/` to the source config and observing rejection at config-validation time, not run-time
**Plans**: TBD

### Phase 40: Destinations + Retention + L2 Verify
**Goal**: Backups can be written to one or more destinations, ransomware-resistant by default, with retention policies and post-upload integrity verification — the bytes leave the host with proof of arrival
**Depends on**: Phase 39 (destinations move the manifest + sources produced upstream)
**Requirements**: BAK-DEST-01, BAK-DEST-02, BAK-DEST-03, BAK-DEST-04, BAK-DEST-05, BAK-DEST-06, BAK-DEST-07
**Success Criteria** (what must be TRUE):
  1. User can configure local-disk, S3-compatible, AND SFTP destinations via tRPC + UI; the underlying uploaders are re-exported verbatim from Phase 20's `scheduler/backup.ts` (zero forking — one bug fix lands everywhere)
  2. A backup plan can target 1-to-5 destinations; partial-fail produces a "partial success" run record (one destination uploaded, one failed); all-fail produces a "failed" run; single-destination plans are flagged red in the next phase's UI as 3-2-1-violating
  3. Test-connection probes append-only credential safety: when an S3 access key has `s3:DeleteObject` permission, the destination shows a yellow warning before save; the UI guides the user toward delete-less application keys per provider (S3 / B2 / Wasabi / MinIO / R2)
  4. After every successful upload, an L2 HEAD/ETag check verifies the destination object matches the source SHA — mismatch fails the destination with reason in the run record; verified by mutating a local-destination file post-upload and observing the next run's L2 step flag the corruption
  5. Retention policy `keep_last N` plus GFS daily/weekly/monthly executes server-side via lifecycle rules where supported, falls back to client-side prune; post-prune count is verified `<= keep_last + 1` and prune failures surface in the run record
  6. Network-drop mid-upload aborts the multipart upload via try/finally + `Upload.abort()`; the run is marked failed; the next scheduled run picks up cleanly without orphaned multipart fragments lingering at the destination
**Plans**: TBD
**UI hint**: yes

### Phase 41: Scheduler + Pre-Update Auto-Snapshot + Update Mutex
**Goal**: Backups happen automatically on a cron schedule, manually via "Backup Now," AND — the killer integration with v29.0 — automatically before every update.sh run, turning Phase 32 binary rollback into full data rollback
**Depends on**: Phase 40 (cron firing requires a working source-to-destination pipeline; pre-update auto-snapshot writes real bytes)
**Requirements**: BAK-SCHED-01, BAK-SCHED-02, BAK-SCHED-03, BAK-SCHED-04, BAK-SCHED-05
**Success Criteria** (what must be TRUE):
  1. `BUILT_IN_HANDLERS['system-backup']` is registered with Phase 20's Scheduler; a default-disabled `system-backup-daily` job (cron `0 3 * * *`) is seeded into `scheduled_jobs` and surfaces in Settings > Schedules; user can opt in via UI
  2. Manual "Backup Now" via tRPC `systemBackup.runNow({plan, tags})` triggers a real run end-to-end and stores the tags array on `backup_history` for provenance — verified by running with `tags: ['manual', 'pre-experiment']` and observing the row
  3. `update.sh` calls `systemBackup.runNow({plan: 'pre-update', tags: ['pre-update', sha]})` BEFORE Phase 30/31 update steps; the update blocks until snapshot completes (or skips with a visible warning if no backup plan is configured) — verified by running an update on the Mini PC and observing a `pre-update`-tagged run lands before code rsync
  4. The backup ↔ update mutex prevents collisions: while a backup runs, the Redis lock `nexus:system-backup:lock` plus filesystem sentinel `/opt/livos/data/backup-in-progress.flag` cause `update.sh` pre-flight to sleep 5 minutes (max 3 retries) before aborting with explicit error; the UI Install Update button is disabled while a backup is running
  5. Schedule presets (Daily 3am, Weekly Sunday 3am, Custom cron) are exposed in the UI; the pipeline accepts user-supplied cron expressions and refuses invalid ones at save time
**Plans**: TBD
**UI hint**: yes

### Phase 42: UI — History + Run-Now + Destinations + Recovery-Kit Modal
**Goal**: Users can configure, run, monitor, and recover backups entirely from the LivOS Settings UI; the mandatory BIP39 recovery-kit modal blocks plan creation until the user proves they captured the secret
**Depends on**: Phase 41 (UI surfaces real cron jobs, manual triggers, and the Install Update integration must be testable)
**Requirements**: BAK-CRYPT-04, BAK-CRYPT-05, BAK-UI-01, BAK-UI-02, BAK-UI-03, BAK-UI-04, BAK-UI-05, BAK-UI-06, BAK-UI-07, BAK-UI-08
**Success Criteria** (what must be TRUE):
  1. User can navigate to Settings > Backup and find five tabbed subsections (Plan, Destinations, History, Recovery Kit, Drill); the layout matches existing Settings UI conventions
  2. The first time a user creates a backup plan, the Recovery Kit modal appears showing passphrase + BIP39 24-word mnemonic + "We cannot recover this — save it now" warning; the modal cannot be dismissed without typing 3-of-24 verification words; a printable PDF download is offered; an Argon2id-derived KEK independently wraps the master key for `livos-restore.sh` use
  3. Backup history table reuses v29.0 Phase 33 LogViewer pattern verbatim — columns Timestamp / Status / Sources / Destinations / Size / Duration / Tags / Actions; clicking a row opens the full log; clicking "Restore from this snapshot" deep-links into the restore wizard (Phase 43)
  4. "Backup Now" button kicks off a manual run with type-to-confirm if user has unsaved work; live progress (state-machine state + per-source progress) streams via tRPC subscription registered in `httpOnlyPaths` in `common.ts` (mirrors `system.update` precedent — long-running mutations cannot ride the WebSocket)
  5. Destination CRUD UI supports per-type forms (local / S3 / SFTP) with test-connection button surfacing the Phase 40 delete-permission warning; provider-specific append-only-credentials guidance text is visible
  6. Sidebar status badge shows green / yellow / red mirroring v29.0 Phase 34 pattern: yellow if last successful drill > 14 days, red if last 3 backups failed OR no encryption configured; in-UI failure toasts fire on backup failure; optional email + webhook URL fields per plan
**Plans**: TBD
**UI hint**: yes

### Phase 43: Standalone Restore + Drill Mode + RBAC
**Goal**: A user whose `/opt/livos` is gone — corrupted disk, ransomware, hardware failure — can restore from any configured destination using a pure shell script with zero Node dependency; the same machinery exercised monthly via drill mode proves the backups are restorable, not just present
**Depends on**: Phase 42 (drill UI + restore wizard depend on history table; restore needs a real backup to restore FROM; standalone shell needs the manifest format finalized through Phase 39)
**Requirements**: BAK-RESTORE-01, BAK-RESTORE-02, BAK-RESTORE-03, BAK-RESTORE-04, BAK-RESTORE-05, BAK-RESTORE-06, BAK-RESTORE-07, BAK-RESTORE-08
**Success Criteria** (what must be TRUE):
  1. User can run `livos-restore.sh <destination> <runId>` on a fresh Ubuntu 24.04 VM with `/opt/livos` empty, supply the BIP39-derived passphrase, and end up with a fully working LivOS install at `manifest.livos_sha` — PG restored, Redis restored, `/opt/livos/data` restored, secrets restored, per-user Docker volumes restored, services running. Pure shell + openssl + psql + redis-cli + docker + tar; zero Node binary at restore time
  2. `install.sh --from-backup <destination> <runId>` wires fresh-install bootstrap directly to `livos-restore.sh`, solving the chicken-and-egg disaster recovery scenario where livinityd cannot bootstrap itself
  3. If a previous restore was interrupted (`/opt/livos/data/restore-pending.json` present), livinityd refuses to come up cleanly and serves a maintenance page with explicit recovery instructions — half-shipped restores cannot silently corrupt a running install
  4. In-UI restore wizard supports three modes: (a) selective single-file restore via manifest tree browsing, (b) single-app restore filtered by `user_app_instances.username`, (c) full-system restore via `execa → livos-restore.sh`; in-place restore requires type-to-confirm and triggers an automatic pre-restore snapshot for insurance
  5. Multi-user RBAC is enforced: admins see all backups and can restore anything (logged to `device_audit_log` per Phase 15 immutability); non-admin users see only backups containing their own data and can only restore their own apps — verified by attempting cross-user restore as non-admin and observing the rejection
  6. Drill mode (`livos-restore.sh --drill --target-prefix livos-drill-`) restores into ephemeral `livos_drill_<runId>` PG DB + scratch Docker volumes + tmpfs FS, runs `pg_isready` plus sanity queries, tears down on success; default-disabled monthly cron; admin opts in. UI shows "Last successful drill: X days ago" — yellow at >14 days, red on drill failure with `ai_alerts` entry
  7. Schema migration on restore enforces version compatibility: `manifest.livos_version` and `manifest.pg_schema_version` are checked against current; same-minor-version restores proceed, cross-major-version restores are blocked with explicit error (cross-version migration deferred to v30.5+)
**Plans**: TBD
**UI hint**: yes
**Research flag**: needs phase research before planning — `livos-restore.sh` is the disaster-recovery linchpin and the highest-risk single deliverable in v30.0; recommend 1-day prototype spike on a fresh Ubuntu 24.04 VM before plan-phase

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 36. Reuse-Audit Spike | 0/? | Not started | - |
| 37. Schema Foundation + Key Vault | 0/? | Not started | - |
| 38. Orchestrator + State Machine + PG Dump | 0/? | Not started | - |
| 39. Remaining Sources + Manifest + L1 Verify | 0/? | Not started | - |
| 40. Destinations + Retention + L2 Verify | 0/? | Not started | - |
| 41. Scheduler + Pre-Update Auto-Snapshot + Update Mutex | 0/? | Not started | - |
| 42. UI — History + Run-Now + Destinations + Recovery-Kit Modal | 0/? | Not started | - |
| 43. Standalone Restore + Drill Mode + RBAC | 0/? | Not started | - |

## Coverage Summary

**Total v30.0 requirements:** 47
**Mapped:** 47
**Orphaned:** 0
**Duplicated:** 0

| Category | Count | Phase(s) |
|----------|-------|----------|
| BAK-CORE | 5 | 36 (×1), 37 (×1), 38 (×3) |
| BAK-SRC | 8 | 38 (×1), 39 (×7) |
| BAK-DEST | 7 | 40 (×7) |
| BAK-CRYPT | 6 | 37 (×3), 38 (×1), 42 (×2) |
| BAK-SCHED | 5 | 41 (×5) |
| BAK-UI | 8 | 42 (×8) |
| BAK-RESTORE | 8 | 43 (×8) |

### Past Milestones

<details>
<summary>v29.0 Deploy & Update Stability (Phases 31-35) — SHIPPED 2026-04-27 — archived per-phase details</summary>

See `.planning/milestones/v29.0-ROADMAP.md` for full archive of Phases 31-35.

**Milestone Goal:** Make `update.sh` deploy pipeline self-healing and observable — fail-loud build guards (Phase 31), pre-flight + auto-rollback (Phase 32), Past Deploys UI + log viewer (Phase 33), mutation onError surface (Phase 34), CI smoke test (Phase 35). Production validated live on Mini PC (deploy `1d44d610` Apr 27).

- [x] **Phase 31: update.sh Build Pipeline Integrity** (3/3 plans) — completed 2026-04-26 (BUILD-01..03)
- [x] **Phase 32: Pre-Update Sanity & Auto-Rollback** (3/3 plans) — completed 2026-04-27 (REL-01/02; Mini PC live, 17/17 must-haves)
- [x] **Phase 33: Update Observability Surface** (3/3 plans) — completed 2026-04-27 (OBS-01..03 + UX-04; Mini PC live deploy validated, browser-confirmed UI)
- [x] **Phase 34: Update UX Hardening** (1/1 plans) — completed 2026-04-27 (UX-01..03; emergency fix reconciled + BACKLOG 999.6 regression test)
- [x] **Phase 35: GitHub Actions update.sh Smoke Test** (1/1 plans) — completed 2026-04-27 (BUILD-04; build-smoke v1, boot-smoke v2 deferred)

</details>

<details>
<summary>v19.0 Custom Domain Management (Phases 07-10.1) — SHIPPED 2026-03-27</summary>

- [x] Phase 07: Platform Domain CRUD + DNS Verification (2/2 plans) — completed 2026-03-26
- [x] Phase 08: Relay Integration + Custom Domain Routing (2/2 plans) — completed 2026-03-26
- [x] Phase 09: Tunnel Sync + LivOS Domain Receiver (3/3 plans) — completed 2026-03-26
- [x] Phase 10: LivOS Domains UI + Dashboard Polish (2/2 plans) — completed 2026-03-26
- [x] Phase 10.1: Settings My Domains (1/1 plan) — completed 2026-03-27

</details>

<details>
<summary>v20.0 Live Agent UI (Phases 11-18) — SHIPPED 2026-03-27</summary>

- [x] Phase 11: Agent SDK Backend Integration (1/1 plans) — completed 2026-03-27
- [x] Phase 12: MCP Tool Bridge (1/1 plans) — completed 2026-03-27
- [x] Phase 13: WebSocket Streaming Transport (2/2 plans) — completed 2026-03-27
- [x] Phase 14: Chat UI Foundation (2/2 plans) — completed 2026-03-27
- [x] Phase 15: Live Tool Call Visualization (3/3 plans) — completed 2026-03-27
- [x] Phase 16: Mid-Conversation Interaction (1/1 plans) — completed 2026-03-27
- [x] Phase 17: Session Management + History (2/2 plans) — completed 2026-03-27
- [x] Phase 18: Cost Control + Settings Cleanup (1/1 plans) — completed 2026-03-27

</details>

<details>
<summary>v21.0 Autonomous Agent Platform (Phases 19-28) — SHIPPED 2026-03-28</summary>

- [x] Phase 19: AI Chat Streaming Visibility (1/1 plans) — completed 2026-03-28
- [x] Phase 20: Conversation Persistence & History (1/1 plans) — completed 2026-03-28
- [x] Phase 21: Sidebar Agents Tab (2/2 plans) — completed 2026-03-28
- [x] Phase 22: Agent Interaction & Management (2/2 plans) — completed 2026-03-28
- [x] Phase 23: Slash Command Menu (2/2 plans) — completed 2026-03-28
- [x] Phase 24: Tool Conditional Registration (1/1 plans) — completed 2026-03-28
- [x] Phase 25: Autonomous Skill & Tool Creation (1/1 plans) — completed 2026-03-28
- [x] Phase 26: Autonomous Schedule & Tier Management (1/1 plans) — completed 2026-03-28
- [x] Phase 27: Self-Evaluation & Improvement Loop (1/1 plans) — completed 2026-03-28
- [x] Phase 28: System Prompt Optimization (1/1 plans) — completed 2026-03-28

</details>

<details>
<summary>v22.0 Livinity AGI Platform (Phases 29-36) — SHIPPED 2026-03-29</summary>

- [x] Phase 29: Unified Capability Registry (2/2 plans) — completed 2026-03-29
- [x] Phase 30: Agents Panel Redesign (1/1 plans) — completed 2026-03-29
- [x] Phase 31: Intent Router v2 (1/1 plans) — completed 2026-03-29
- [x] Phase 32: Auto-Provisioning Engine (1/1 plans) — completed 2026-03-29
- [x] Phase 33: Livinity Marketplace MCP (1/1 plans) — completed 2026-03-29
- [x] Phase 34: AI Self-Modification (1/1 plans) — completed 2026-03-29
- [x] Phase 35: Marketplace UI & Auto-Install (2/2 plans) — completed 2026-03-29
- [x] Phase 36: Learning Loop (3/3 plans) — completed 2026-03-29

</details>

<details>
<summary>v23.0 Mobile PWA (Phases 37-40) — SHIPPED 2026-04-01</summary>

- [x] Phase 37: PWA Foundation (2/2 plans) — completed 2026-04-01
- [x] Phase 38: Mobile Navigation Infrastructure (2/2 plans) — completed 2026-04-01
- [x] Phase 39: Mobile Home Screen + App Access (2/2 plans) — completed 2026-04-01
- [x] Phase 40: Polish + iOS Hardening (2/2 plans) — completed 2026-04-01

</details>

<details>
<summary>v24.0 Mobile Responsive UI (Phases 1-5) — SHIPPED 2026-04-01</summary>

- [x] Phase 1: AI Chat Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 2: Settings Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 3: Server Control Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 4: Files Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 5: Terminal Mobile (1/1 plans) — completed 2026-04-01

</details>

<details>
<summary>v25.0 Memory & WhatsApp Integration (Phases 6-10) — SHIPPED 2026-04-03</summary>

See `.planning/milestones/v25.0-phases/` for archived per-phase details.

</details>

<details>
<summary>v26.0 Device Security & User Isolation (Phases 11-16) — SHIPPED 2026-04-24</summary>

See `.planning/milestones/v26.0-phases/` for archived per-phase details.

</details>

<details>
<summary>v27.0 Docker Management Upgrade (Phases 17-23) — SHIPPED 2026-04-25</summary>

See `.planning/milestones/v27.0-ROADMAP.md` for archived details (33/33 requirements satisfied).

</details>

<details>
<summary>v28.0 Docker Management UI (Phases 24-30) — SHIPPED 2026-04-26</summary>

See `.planning/milestones/v28.0-ROADMAP.md` for archived details (20/20 requirements satisfied).

</details>
