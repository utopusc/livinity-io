# Feature Research — Backup & Restore (v30.0)

**Domain:** System-level backup & restore for self-hosted multi-user OS (LivOS)
**Researched:** 2026-04-28
**Confidence:** HIGH (table stakes drawn from 8 reference products with cross-confirmation; differentiators MEDIUM since they're forward-looking; anti-features HIGH from documented community pain)

> **Scope guard:** This research is for **system-level** backup (PostgreSQL `livos` DB + Redis state + `/opt/livos/data` + per-user Docker volumes + `.env` secrets + Caddy config). It explicitly does NOT re-research per-app volume backup — v27.0 Phase 20 already shipped that and it must be **reused, not reinvented**.

## Reference Products Studied

| Product | Why It's a Reference | What We Steal |
|---------|---------------------|---------------|
| **restic + Backrest** | Best-in-class self-hosted web UI for restic (cron plans, multi-repo, browse) | Plan model (sources + schedule + retention as one object), web-UI snapshot browser, cron expressions WITH human-readable preview |
| **Kopia** | Modern competitor with built-in web UI, policy model, error correction | Policy hierarchy (global → per-source override), Reed-Solomon awareness, mandatory encryption |
| **Borgmatic** | Config-driven Borg wrapper, dominant in homelab | YAML-as-source-of-truth pattern, integrated DB dump hooks, pre/post-backup hooks |
| **Synology Hyper Backup** | Consumer UX baseline; what non-technical users expect | "Check Backup Integrity" toggle on schedule, simple destination wizard, success/failure email |
| **Time Machine** | The gold standard for "set and forget" | Hourly local snapshots + offsite tier, automatic pruning, never-ask-the-user model |
| **Veeam B&R** | Enterprise feature parity ceiling | Instant Recovery (run from backup before restore completes), four-eyes approvals, immutability |
| **pgBackRest** | DBA-grade Postgres backup; the "DB-native" bar | WAL archiving, PITR, full+differential+incremental, parallel compression, per-file checksum verify-on-restore |
| **UrBackup** | Homelab-friendly client/server with image+file mode | Image+file dual mode, web admin UI, SHA-512 file dedupe |
| **Duplicacy** | Cross-machine dedupe, lock-free | Lock-free coordination model (multiple LivOS nodes can share a destination eventually) |
| **Proxmox Backup Server** | "Realistic 2026 entry threshold = 5-2-1, monthly recovery drill" | Recovery drill cadence, snapshot catalog browse, fast GUI restore |
| **Home Assistant 2026.4** | Newest open-source player; just shipped Argon2id + XChaCha20 | Modern crypto stack reference, "regenerate encryption key" pattern |

---

## Feature Landscape

### Table Stakes (Users Will RAGE If Missing)

These are non-negotiable. Every reference product above ships all of them. Missing any one of these makes LivOS feel like a toy.

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| **Scheduled automatic backups** | Time Machine, Backrest, Borgmatic, Synology — all schedule by default. "Backup Now only" = not a backup product. | **S** | **Reuse Phase 20 `scheduled_jobs` PG table + node-cron**. Add new handler `system-backup` alongside existing `volume-backup`. No new infrastructure. |
| **Retention policies (keep N + GFS)** | restic `--keep-daily 7 --keep-weekly 4 --keep-monthly 12`, Borgmatic, Kopia, Veeam GFS — universal. Without this disk fills → backup fails → disaster. | **M** | New per-plan retention: `keep_last`, `keep_daily`, `keep_weekly`, `keep_monthly`. Apply via `forget` step after each successful backup. Phase 20 has no retention UI yet — this extends it. |
| **Encryption at rest, mandatory** | Kopia refuses to create unencrypted backups. Duplicacy, restic, Borg all encrypt by default. PBS dedicated paperkey docs. Missing this in 2026 = product is unusable for anything sensitive. | **M** | **Reuse Phase 20 AES-256-GCM credential vault pattern**. Per-plan passphrase → derive key (Argon2id, per HA 2026.4 pattern). Store wrapped DEK in PG. Never store passphrase. |
| **Multiple destinations (3-2-1 capable)** | The 3-2-1 rule is the de facto standard. All reference tools support local + cloud + SFTP. Single destination = single point of failure = not a real backup. | **S** | **Reuse Phase 20 destinations** (local / S3-compatible / SFTP). Allow N destinations per plan, replicate after primary success. |
| **Manual "Backup Now" trigger** | Backrest, Synology, Time Machine, Veeam — every product has this. Users need to backup before risky changes. | **S** | **Already in Phase 20** for volumes. Extend pattern to system-level plan. tRPC mutation `backup.runNow(planId)`. |
| **Backup history with status/size/duration/log** | Backrest "operations history", Synology task history, Veeam reports — all reference products surface this. Phase 33 update history is a perfect template — list of runs, click-into log, status pill. | **S** | **Reuse Phase 33 `update-<ts>-<sha>.log` + `<ts>-success\|failed.json` pattern.** Replace with `backup-<ts>-<planId>.log` + JSON record per run. Wire Settings > Backup history list to read these. |
| **Failure notifications (in-UI badge minimum)** | Healthchecks.io and ntfy are entire products around this. Synology emails. Backrest has notification hooks. Silent failures = users discover when restoring = catastrophe. | **S** | UI badge on Settings sidebar (mirror Phase 34 update badge). Email via existing SMTP if configured. Webhook URL field per plan (free for users to wire to ntfy/Healthchecks). |
| **Integrity verification** | pgBackRest verifies checksums on restore. Kopia has built-in `verify`. Synology "Check Backup Integrity" runs on schedule. Backrest health checks. Untested backups = Schrödinger's data. | **M** | New `backup.verify(snapshotId)` mutation: re-read manifest, recompute hashes, compare. Default schedule: weekly verify of latest snapshot per destination. |
| **Restore to original location (in-place)** | Every reference product. Without this it's not a backup product, it's a download tool. | **M** | New `backup.restore(snapshotId, mode='in-place')` flow. Stops affected services, restores files, runs DB import, restarts. Refuse if disk space < snapshot size × 1.2. |
| **Selective/granular restore (single file or single app)** | Veeam instant file recovery, Time Machine browse-and-restore, Backrest browse-snapshot. Most restores are single-file accidents, not disasters. | **M** | Browse snapshot manifest in UI (tree view). Checkbox files/dirs to restore to alternate path. For DB: per-table restore optional but heavy — defer if needed. |
| **Disaster recovery: restore to fresh install** | Proxmox PBS bootstrap, Time Machine "restore from backup" on new Mac, Veeam bare-metal recovery. The whole point of backups. | **L** | New `livos restore` CLI in `update.sh` neighborhood: prompts destination + passphrase, downloads snapshot, lays down PG dump + Redis dump + `/opt/livos/data` + Docker volumes + `.env`, then restarts services. Documented as "DR procedure". |
| **Pre-restore confirmation (destructive action gate)** | Every product makes you confirm. Veeam has four-eyes for enterprise. Accidental in-place restore = data loss worse than what you backed up from. | **S** | Modal: "This will overwrite current data created since [snapshot timestamp]. Type the snapshot ID to confirm." Same pattern as Phase 32 rollback confirmation. |
| **PostgreSQL-native dump (not file copy of `/var/lib/postgresql`)** | pgBackRest exists because file-level Postgres backup is unsafe (torn pages, in-flight WAL). Universal DBA wisdom. Mini PC has system PostgreSQL → must `pg_dump`, not tarball the data dir. | **M** | Use `pg_dump --format=custom` for `livos` DB. Store dump file inside snapshot. Restore via `pg_restore`. Document this is logical backup (PITR is differentiator below). |
| **Redis BGSAVE-based snapshot** | Same reason as Postgres — RDB file copy without `BGSAVE` corrupts. | **S** | Run `redis-cli BGSAVE`, wait for `LASTSAVE` to advance, copy `dump.rdb`. |
| **Encryption passphrase storage (with explicit warning)** | Duplicacy: "do not lose it, no recovery mechanism." Universal. Users MUST be told the implications before they shoot themselves in the foot. | **S** | First-time wizard: passphrase entry → strength meter → "We cannot recover this. We'll show you a recovery code now — print it." Modal blocks until acknowledged. |
| **Per-plan source selection (what to back up)** | Backrest plan = sources + schedule. Borgmatic config = `source_directories`. Standard model. | **S** | Plan editor with checkboxes: PostgreSQL, Redis, `/opt/livos/data`, Docker volumes (per-user list), `.env`, Caddyfile. Sensible defaults checked. |
| **Backup-during-update safety** | Veeam, PBS, all backup products lock during overlap. v29.0 update is destructive — running backup mid-update = corrupted snapshot. | **S** | **Hard dependency on Phase 33 update history**: refuse to start backup if update in progress; refuse to start update if backup running. Mutex via Redis key, same pattern as Phase 20 in-flight Set. |

**Table Stakes Total: 16 features. None are optional.**

---

### Differentiators (What Makes LivOS Premium)

These are where the moat lives. Users won't penalize their absence the way they penalize missing scheduled backups, but presence creates "wow this is a real product" moments and aligns with the Strategic Direction "AI + Self-Hosting" gap from PROJECT.md.

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| **AI-assisted restore guidance** | The unique "AI + Self-Hosting" moat. User's site is broken — they pick "Restore" and the LivOS agent reads recent error logs, asks "Do you want to roll back to before the failed update at 14:32 today?", picks the right snapshot, narrates progress. Nobody else does this. | **L** | Wire **Phase 33 update history** + new `backup_history` table into a `diagnostic_restore` MCP tool. Agent reads recent failed updates + available snapshots + suggests target. v22.0 Capability Registry already supports MCP tool registration. Builds on Phase 23 (`docker_diagnostics`) precedent. |
| **Restore drill (test-restore that doesn't overwrite production)** | PBS recommends monthly recovery drill. AWS Backup has it. Ahsay markets it as headline feature. Every disaster recovery framework demands it. Differentiator because most homelab tools require manual orchestration. | **M** | New `backup.restoreDrill(snapshotId)` runs restore into temporary Postgres DB (`livos_drill_$ts`), Redis port +1, scratch dir under `/tmp/livos-drill`, scratch Docker network. Compares row counts, file checksums. Emits drill report. Tear down on completion. |
| **Bootstrap-from-backup wizard (fresh OS install)** | Time Machine, PBS — the "I bought a new computer" experience. For LivOS this is "I'm migrating to a bigger Mini PC" or "ransomware hit, fresh Ubuntu install". Differentiator because most self-hosted tools require multi-step manual import. | **M** | `install.sh --restore-from <s3-url>` flag. Downloads + decrypts snapshot, recreates PG/Redis/Docker volumes, runs first-boot migrations. Reuses regular `install.sh` infrastructure. |
| **"What changed" diff view between snapshots** | Snapper diff, ZFS diff, Backrest snapshot browse — all support it but typically as raw output. A pretty file-tree diff in UI is differentiator. Lets users answer "what was deleted between Tuesday and now?" without restoring. | **M** | Compare two snapshot manifests, render tree with +/-/~ markers. Phase 18 (container file browser) already proves the tree-component pattern. |
| **Immutable / append-only destinations** | 2026 ransomware reality. The 3-2-1 has evolved to 3-2-1-1-0 (one immutable). Backblaze B2 + S3 Object Lock make this trivial to expose. Castle Rock Sky 2026 article explicitly cites this as "what changed" in the rule. | **M** | When destination is S3-compatible, expose "Enable Object Lock retention" toggle. Pass through `--object-lock-mode COMPLIANCE --object-lock-retain-until-date` on PUT. Document Wasabi / B2 support. |
| **Encryption recovery code (paperkey-style)** | PBS docs explicitly recommend `paperkey`. Forgotten passphrase is the #1 backup horror story. Differentiator because most homelab tools have nothing — Duplicacy literally says "no recovery mechanism." | **S** | At plan creation, generate human-readable 24-word recovery code (BIP39 mnemonic) that wraps the DEK. Show ONCE in modal with print button. Verify by making user re-type a random 3 of the 24 words. Never stored unencrypted server-side. |
| **Per-user backup ownership + admin override audit log** | Multi-tenant RBAC reality (v7.0 multi-user). Azure Backup MUA, K8s namespace RBAC, WorkOS multi-tenant patterns all enforce isolation. User sees only their backups; admin sees all but cross-user restore is audit-logged with reason. | **M** | `backup_plans.owner_user_id` FK to `users.id`. `is-authenticated.ts` middleware filter. Admin-only `cross_user_restore` route writes to `device_audit_log` (Phase 15 pattern) with required `reason` field. |
| **Schedule presets (not just cron)** | Synology presets, Time Machine "every hour", Backrest cron-with-preview. Cron is power-user gatekeeping; presets are friction killer. | **S** | UI: 4 preset buttons (Hourly, Daily 3am, Weekly Sun 3am, Monthly 1st 3am) + "Custom (cron)" tab with human-readable preview ("Runs every day at 3:00 AM"). cronstrue lib for the preview. |
| **Bandwidth throttling / scheduled run windows** | Backrest, restic `--limit-upload`, UrBackup. Mini PC users on residential connections need this. Otherwise the first cloud upload saturates the link for hours. | **S** | Per-destination KB/s cap. Optional "only run between 02:00-06:00" window. Pass through to restic / rsync flags. |
| **Backup encryption key rotation** | HA 2026.4 just shipped this. PBS supports it. Lets users change passphrase without re-uploading TBs. | **M** | Change passphrase = decrypt DEK with old passphrase, re-encrypt with new. Snapshots themselves keep old DEK reference. New snapshots use new wrapped DEK. |
| **PITR (point-in-time recovery) for Postgres** | pgBackRest's headline feature. WAL archiving + base backup = "restore to 14:23:07.453 last Tuesday." DBA-grade. Differentiator because most homelab tools do logical dumps only. | **L** | Configure Postgres `archive_command` to push WAL to backup destination. Restore flow takes target timestamp, replays WAL up to it. Heavy — likely defer to v30.1. |
| **Pre-/post-backup hooks** | Borgmatic's killer feature. Run `mysqldump`, run `docker pause`, etc. before snapshot. Lets users extend backup to custom apps. | **S** | Per-plan optional shell command fields: `before_backup`, `after_backup`. Run as livinityd user with timeout. Same risk profile as Phase 17 stack secrets. |
| **Backup status as system-tray-style global indicator** | macOS menu bar Time Machine icon, Synology DSM widget. Always-visible health signal. Phase 34 sidebar update badge is the local precedent. | **S** | Sidebar Settings > Backup row gets colored dot: green (last backup < retention SLA), yellow (overdue), red (last failed). Mirrors Phase 34 update badge implementation. |
| **Mobile push on backup status (PWA)** | ntfy is an entire product around this. v23.0 PWA is the enabler. Differentiator because most self-hosted backup tools have email-only. | **M** | Webhook out → user-configured ntfy topic OR (better) integrate Web Push API via existing PWA service worker. v23.0 already registered SW. |
| **Backup deduplication (cross-snapshot)** | restic, Borg, Duplicacy, Kopia all do this. UrBackup uses SHA-512 file dedupe. Without it, 30 daily snapshots = 30× the storage. | **S** | **Free if we use restic as backend** for system backup. restic dedupes natively at chunk level. This is why restic is recommended over raw `tar`. |
| **Snapshot tagging + search** | restic tags, Backrest plan tags, Veeam search. "Find me the backup right before I deleted that user" use case. | **S** | `backup_runs.tags TEXT[]` PG column. Auto-tags: `pre-update`, `manual`, `scheduled`. UI tag chips for filtering. |
| **Pre-update auto-snapshot integration** | This is the killer integration with v29.0. Before `update.sh` runs, automatically take a `pre-update` snapshot. Users get free rollback insurance for every update. Phase 32 rollback exists for binaries but not for data. | **M** | **Hard dependency on v29.0 Phase 32 (`livos-rollback.sh`) + Phase 33 history**. New `update.sh` step before Phase 30/31: call `backup.runNow({plan: 'pre-update', tags: ['pre-update', sha]})`. Rollback flow optionally restores it. |

**Differentiator Total: 17 features. Pick 4-6 for v30.0; defer rest to v30.1+.**

**Top 4 to ship in v30.0:**
1. Restore drill (#2) — concrete, finite, sets the trust foundation
2. Encryption recovery code (#6) — small effort, prevents horror story
3. Pre-update auto-snapshot (#17) — free integration with v29.0, immediate user value
4. AI-assisted restore guidance (#1) — THE moat. Even MVP version is enough to differentiate.

---

### Anti-Features (What NOT to Build)

These are real, not strawmen. Each cited from documented community pain or vendor lock-in patterns.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Proprietary backup format** | "Faster, more efficient than tar/zip!" Vendors love it. | Lock-in. If LivOS dies, users can't recover with anything else. PBS uses plain `.chunk` files specifically to avoid this. Synology Hyper Backup files are notoriously hard to restore without Synology — homelabs cite this as #1 pain. | **Use restic as the on-disk format.** It's open-source, the CLI works without LivOS, snapshots are recoverable from raw destination forever. |
| **"We'll handle keys for you" / vendor key escrow** | "I might forget my passphrase!" — users always ask. | Defeats the security model. If LivOS holds the key, a server compromise = all backups decrypted. Violates Zero Trust principles. Selfhosted users picked self-hosting specifically to avoid this. | **Recovery code (BIP39 mnemonic)** — user-held, paper-printable, generated client-side or in-memory only. PBS `paperkey` pattern. |
| **No-passphrase / "set up later" backups** | "Friction-free first run!" | Silent insecurity. Users forget to add a passphrase, run backups for months, breach happens, all data leaks plaintext. Kopia's stance is correct: refuse to create unencrypted backups. | **Mandatory passphrase at plan creation.** Wizard cannot be skipped. Auto-generate strong default if user wants "easy mode" — still encrypted, recovery code shown. |
| **Cloud-only / "managed cloud" destination as default** | "Simpler! No setup!" | Defeats self-hosted value prop. Users picked LivOS specifically to own their data. Pushing them onto livinity.io-managed S3 = same vendor risk they fled. | **Local destination as default first run** (`/var/backups/livos`). Cloud requires explicit user-provided credentials. Document "we don't see your data" prominently. |
| **Backup of `/` (root filesystem) / full-disk image** | "Why not just back up everything?!" | Unbounded size, mostly useless (Ubuntu can be reinstalled in 5 min), terrible RTO, and worse: backing up `/proc`, `/sys`, `/dev` corrupts things. UrBackup image mode is for VM backup, not bare metal Linux. | **Strict allowlist of paths** (PostgreSQL dump, Redis dump, `/opt/livos/data`, declared Docker volumes, `.env`, Caddyfile). Document what's NOT backed up so users know. |
| **Real-time / continuous file-system replication** | "Zero RPO!" Marketing-friendly. | Massive complexity (kernel-level fanotify, conflict resolution, network amplification on every write). Wrong layer for a self-hosted homelab. Veeam CDP is enterprise-only for a reason. | **Hourly local snapshot tier** (Time Machine model) — captures 99% of "oh no I deleted a file" cases without inotify hell. |
| **"Auto-detect what to back up" magic** | "Just figure it out!" | Always wrong eventually. New apps spawn volumes silently. AI heuristic = false confidence. Users discover gaps during recovery = the worst possible time. | **Explicit declared sources** in plan editor. Per-app integration: when an app adds a volume, registry surfaces a "Add to backup?" toast (additive, opt-in). |
| **Backup data deduplicated *across users*** | "Save space! Multiple users have the same Docker images!" | Cross-tenant data leak risk. If userA's encryption key compromised, userB's blocks decryptable too if they shared chunks. Multi-tenant RBAC research (Aserto, WorkOS) explicitly warns against this. | **Per-user repositories** (separate restic repos per user). Dedup happens within a user's snapshots only. Cross-user dedup violates v7.0 isolation guarantees. |
| **Email password-reset for backup encryption** | "Like every other login!" | Backup encryption isn't an account credential; it's a data encryption key. If email reset can recover it, the encryption is theater. Worse: email accounts get compromised constantly. | **No reset, ever.** Recovery code or nothing. UI prominently warns at creation. This is non-negotiable in 2026. |
| **Sync/replicate "live" between LivOS instances peer-to-peer** | "P2P backup to a friend's LivOS!" | Cool sounding, complex (NAT traversal, key management between strangers, retention coordination, abuse vectors). Distracts from getting the core right. | **Defer to v31+**. Standard cloud destination + B2/Wasabi gets us 90% of the offsite story. P2P is a v2 feature. |
| **Inline antivirus / malware scanning of backup contents** | "Make sure we don't back up ransomware!" | Adds heavy dependency (ClamAV update cycles, false positives), substantial CPU on backup, and the actual defense is immutable destinations + restore drills, not AV scanning. | **Immutable destination support** (already a differentiator). Restore drill catches functional issues. |
| **"Smart" / AI-driven retention (auto-decide what to keep)** | "AI knows what's important!" | Black-box deletion of user data is terrifying. AI hallucinations during retention pruning = irrecoverable loss. Veeam, restic, Kopia all use deterministic GFS specifically because users need to predict what they'll have. | **Deterministic GFS** (`keep_last`/`keep_daily`/`keep_weekly`/`keep_monthly`). AI may *suggest* tweaks via chat but never executes pruning autonomously. |
| **Browser-based decryption (download + decrypt in JS)** | "View backup contents from any browser!" | Forces shipping the encryption key to the browser = key in memory + JS context = exfiltration risk via XSS. Defeats the threat model. | **Decrypt on the server** during restore/browse, stream cleartext over the existing JWT-authed tRPC tunnel. Same trust boundary as the rest of the app. |

**Anti-Feature Total: 13 documented anti-features. Five+ requirement met with margin.**

---

## Specific Feature Question Answers

The milestone prompt asked nine specific questions. Direct answers based on research:

### Q1. Backup scope granularity: per-user, per-app, full-system?

**Answer: All three, layered.**

- **Default plan** = full-system (PG + Redis + `/opt/livos/data` + `.env` + Caddyfile + all per-user Docker volumes). Admin-owned, runs daily at 3am.
- **Per-user plans** = each user can opt-in to back up their own files + their owned containers. Owner = the user. Admin can see counts but not contents (encryption per-user).
- **Per-app plans** = **already shipped in v27.0 Phase 20**. Reuse as-is. Add cross-link from Settings > Backup → "App-specific schedules in Docker → Schedules".

Synology / TrueNAS use the same multi-tier model. Backrest's "plan" abstraction supports this naturally.

### Q2. Schedule UX: cron / presets / natural language?

**Answer: Presets primary, cron secondary, no NL.**

- 4 preset buttons cover 95% of cases: **Hourly / Daily 3am / Weekly Sun 3am / Monthly 1st 3am**.
- "Custom (cron)" tab for power users with **cronstrue-rendered preview** ("Runs every day at 3:00 AM"). Same pattern as Backrest.
- Skip natural language. LLM-parsed schedules are a footgun (hallucinated cadence) and add LLM dependency to a feature that must work offline.

### Q3. Destination management: how many concurrent?

**Answer: Up to 5 per plan. Default of 1 (local).**

- 3-2-1 rule says minimum 3 copies, 2 media, 1 offsite. Realistic 2026 minimum per PBS guide is **5-2-1**.
- Implementation: primary destination is uploaded to first; secondaries get the same uploaded blob (replicated, not re-encrypted). Restic supports this via `copy` command.
- 5 cap is sanity not technical limit — beyond 5 the UI gets ugly and the value drops off.

### Q4. Encryption UX: passphrase prompt / unlock-on-boot / hardware key?

**Answer: Passphrase entered once at plan creation, stored as wrapped DEK, recovery code mandatory.**

- **Passphrase prompt every backup run = unusable for unattended schedules.** Borgmatic, restic all support `BORG_PASSPHRASE` env / repo password files specifically because of this.
- **Unlock-on-boot = best balance.** Passphrase entered at plan creation derives DEK (Argon2id), wraps it with Argon2id-derived KEK, stores wrapped blob in PG. livinityd loads on boot. Restart requires nothing extra (KEK is auto-recreated from a server-side keyfile that's in the encrypted disk anyway, OR from a TPM if available — defer TPM to v31+).
- **Hardware key = differentiator, defer.** YubiKey support is real but adds significant complexity and very few homelab users will use it.
- **Forgot-passphrase recovery: BIP39 mnemonic recovery code** generated at plan creation, shown once, never stored server-side. User prints it.

### Q5. Restore flows: in-place / side-by-side / full rebuild?

**Answer: All three, with safety gradient.**

1. **Selective restore (single file)** → easiest, low-risk, covers 80% of real restores. Default first.
2. **In-place restore (overwrite)** → confirmation gate (type snapshot ID), pre-restore auto-snapshot taken first as insurance.
3. **Restore drill (side-by-side, doesn't touch prod)** → for testing. Differentiator feature.
4. **Full rebuild (`install.sh --restore-from`)** → DR scenario. Documented procedure + CLI flag.

This matches Veeam's recovery hierarchy (file → instant → full).

### Q6. History view: Phase 33 reference?

**Answer: Yes, copy Phase 33 pattern verbatim.**

- Per-run JSON record: `{ timestamp, planId, durationSec, sizeBytes, status, snapshotId, destination, log_path }`.
- Per-run log file: `backup-<ts>-<planId>.log` in `/opt/livos/data/backup-history/`.
- Settings > Backup > "Past Runs" panel = list view with status pills, click → log viewer modal (reuse Phase 33's `LogViewer` component).
- Add "Restore from this snapshot" button per row → routes to confirmation modal.

### Q7. Notifications: where to?

**Answer: 4 channels, user-configurable, redundant by design.**

1. **In-UI badge** (always on) — sidebar dot, mirrors Phase 34 update badge.
2. **Email** (if SMTP configured) — to admin and/or backup owner.
3. **Webhook URL** (per plan) — POST JSON, lets users wire ntfy/Healthchecks.io/Slack/Discord.
4. **PWA Web Push** (mobile) — v23.0 already registered SW; reuse for backup notifications.

Healthchecks.io best-practice cited: redundant channels for reliability.

### Q8. Integrity verification: how often?

**Answer: Two tiers.**

- **Lightweight (mandatory, every backup):** restic `check --read-data-subset=1%`. ~1 minute, catches obvious corruption. Default on.
- **Full verify (scheduled, weekly):** restic `check --read-data` + restore drill once a month per Proxmox 2026 guidance. Configurable per plan.
- Manual "Verify Now" button for ad-hoc.

### Q9. Multi-user permissions?

**Answer: Owner-scoped with audited admin override.**

- `backup_plans.owner_user_id` FK to `users.id`. Default: each user sees only their own plans.
- Admin role: can list all plans (`adminProcedure` in tRPC, v7.0 pattern). Can view metadata (size, status, timestamps). **Cannot decrypt other users' backups by default** (each user has own passphrase).
- **Cross-user restore for admin = explicit consent path:** user offboarding flow generates time-limited "delegation token" (admin enters, user receives email/notification). Without delegation, admin restore fails crypto. Without crypto, admin sees only "encrypted blob, owner inaccessible".
- Every cross-user action logged to `device_audit_log` (Phase 15 pattern) with required `reason` field. Same audit immutability triggers (BEFORE UPDATE/DELETE).

This matches Azure Backup MUA pattern + WorkOS multi-tenant guidance.

---

## Feature Dependencies

```
[Pre-update auto-snapshot]
    ├──depends-on──> [v29.0 Phase 32 livos-rollback.sh]
    ├──depends-on──> [v29.0 Phase 33 update history pattern]
    └──depends-on──> [Manual Backup Now]
                          └──reuses──> [Phase 20 scheduled_jobs + node-cron]

[Restore drill]
    ├──depends-on──> [In-place restore (logic)]
    └──depends-on──> [PostgreSQL pg_dump + pg_restore]

[AI-assisted restore guidance]
    ├──depends-on──> [Backup history (data source)]
    ├──depends-on──> [Phase 33 update history (data source)]
    ├──depends-on──> [v22.0 Capability Registry (MCP tool registration)]
    └──depends-on──> [Phase 23 docker_diagnostics pattern]

[Multi-user backup ownership]
    ├──depends-on──> [v7.0 users PG table + JWT]
    └──depends-on──> [Phase 15 device_audit_log immutability pattern]

[Encryption + recovery code]
    ├──reuses──────> [Phase 20 AES-256-GCM credential vault]
    ├──reuses──────> [Phase 17 stack secrets injection pattern]
    └──new─────────> [Argon2id KDF + BIP39 mnemonic generation]

[Backup history UI]
    ├──reuses──────> [Phase 33 update history UI pattern]
    └──reuses──────> [Phase 33 LogViewer component]

[Backup status badge]
    └──reuses──────> [Phase 34 sidebar update badge pattern]

[Cross-user audit]
    └──reuses──────> [Phase 15 device_audit_log table + triggers]

[Multiple destinations]
    └──reuses──────> [Phase 20 destinations table (S3/SFTP/local)]
                          └──reuses──> [Phase 17 AES-GCM credential vault]
```

### Critical Dependency Notes

- **Backup mutex with update flow**: Pre-update auto-snapshot REQUIRES backup completes before update starts; conversely, update REQUIRES no backup running. Implement Redis-key mutex (`livos:lock:system-state`) shared by both `update.sh` and backup handler. Without this, **Phase 33's `.deployed-sha` write race** (v29.1 hotpatch) re-emerges in a new shape.
- **Phase 20 reuse is non-negotiable**: v27.0 already has volume backup + destinations + credential vault + scheduler. Building parallel system-backup infrastructure violates "reuse, don't reinvent" from PROJECT.md milestone context.
- **PostgreSQL is system-installed (NOT Dockerized) per memory**: backup handler runs `pg_dump` directly via `pg_dump -U livos -d livos -F c -f $snapshot_dir/livos.pgdump`. NOT `docker exec`. Restore uses `pg_restore` direct.

---

## MVP Definition

### Launch With (v30.0)

The minimum to ship a credible backup product. Everything below is non-negotiable; the product is incomplete without it.

- [ ] **System backup plan model** (sources + schedule + destinations + retention + encryption) — extends Phase 20 plan concept
- [ ] **Scheduled automatic backups** via existing `scheduled_jobs` + node-cron — new `system-backup` handler
- [ ] **PostgreSQL `pg_dump` integration** — logical backup, NOT file-level
- [ ] **Redis BGSAVE-based snapshot**
- [ ] **`/opt/livos/data` + per-user Docker volumes + `.env` + Caddyfile capture** via restic
- [ ] **AES-256 encryption mandatory**, Argon2id KDF, wrapped DEK pattern
- [ ] **BIP39 recovery code** shown once at plan creation
- [ ] **Multiple destinations** (1+, up to 5) — reuse Phase 20 destinations
- [ ] **Retention policy** (`keep_last` + GFS daily/weekly/monthly)
- [ ] **Manual "Backup Now" button**
- [ ] **Backup history UI** (Phase 33 pattern)
- [ ] **In-UI badge** on Settings sidebar (Phase 34 pattern)
- [ ] **Lightweight integrity check on every run** (restic `--read-data-subset=1%`)
- [ ] **Selective restore** (browse snapshot → checkbox files → restore to alt path)
- [ ] **In-place restore** with confirmation gate + pre-restore auto-snapshot
- [ ] **Disaster recovery CLI** (`install.sh --restore-from`) for fresh-install path
- [ ] **Multi-user ownership** (owner_user_id FK, isAuthenticated middleware filter)
- [ ] **Backup ↔ update mutex** (Redis lock, prevents Phase 33-style race)
- [ ] **Pre-update auto-snapshot** (v29.0 integration — the killer integration feature)
- [ ] **Restore drill** (the trust foundation feature — non-negotiable for "AI + Self-Hosting" trust positioning)
- [ ] **Email/webhook notifications** for failure (in-UI badge alone is insufficient)

### Add After Validation (v30.1)

Defer until v30.0 is stable and we have user signal on real usage patterns.

- [ ] **AI-assisted restore guidance** (full agent integration — MVP version is just "show me snapshots near the failed update")
- [ ] **PWA Web Push notifications** (mobile)
- [ ] **"What changed" diff view between snapshots**
- [ ] **Schedule cron-with-preview tab** (presets only at v30.0)
- [ ] **Bandwidth throttling**
- [ ] **Encryption key rotation**
- [ ] **Pre-/post-backup hooks**
- [ ] **Snapshot tagging + search**
- [ ] **Immutable destination toggle (S3 Object Lock)**
- [ ] **Cross-user delegation token flow** (admin restore on behalf of departed user)

### Future Consideration (v31+)

Real but deferred. Either too heavy, too niche, or requires v30 production data to design well.

- [ ] **PITR for Postgres** (WAL archiving) — heavy, only matters at higher data tiers
- [ ] **TPM-backed encryption** — niche hardware, narrow user base
- [ ] **YubiKey hardware key option** — same
- [ ] **P2P backup to friends' LivOS** — user-requested but anti-feature for MVP
- [ ] **Hourly local snapshot tier** (Time Machine model) — needs ZFS/btrfs detection, defer
- [ ] **Backup deduplication metrics dashboard** — vanity feature
- [ ] **Cross-environment backup** (multi-host Docker per Phase 22) — wait for multi-Mini-PC user reality

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Scheduled automatic backups | HIGH | LOW (reuse Phase 20) | **P1** |
| Encryption mandatory + recovery code | HIGH | MEDIUM | **P1** |
| Multi-destination | HIGH | LOW (reuse Phase 20) | **P1** |
| Manual Backup Now | HIGH | LOW | **P1** |
| Retention (keep_last + GFS) | HIGH | MEDIUM | **P1** |
| PostgreSQL pg_dump | HIGH (data integrity) | MEDIUM | **P1** |
| Redis BGSAVE | HIGH | LOW | **P1** |
| Backup history UI | HIGH | LOW (reuse Phase 33) | **P1** |
| Selective restore | HIGH | MEDIUM | **P1** |
| In-place restore | HIGH | MEDIUM | **P1** |
| Disaster recovery CLI | HIGH | MEDIUM | **P1** |
| Backup-update mutex | HIGH (data safety) | LOW | **P1** |
| Pre-update auto-snapshot | HIGH (kills update fear) | LOW (integrate) | **P1** |
| Restore drill | HIGH (trust foundation) | MEDIUM | **P1** |
| Multi-user ownership + audit | HIGH (multi-user reality) | MEDIUM | **P1** |
| Integrity verification (light) | HIGH | LOW (restic flag) | **P1** |
| Email/webhook notifications | HIGH | LOW | **P1** |
| In-UI status badge | MEDIUM | LOW | **P1** |
| AI-assisted restore guidance | HIGH (THE moat) | HIGH | **P2** (MVP version P1) |
| Schedule presets vs cron | MEDIUM | LOW | **P1** (presets only at v30.0) |
| "What changed" diff view | MEDIUM | MEDIUM | **P2** |
| Immutable destinations (Object Lock) | MEDIUM | MEDIUM | **P2** |
| Encryption key rotation | LOW (rare op) | MEDIUM | **P2** |
| Pre-/post-backup hooks | MEDIUM (power users) | LOW | **P2** |
| PWA Web Push | MEDIUM | MEDIUM | **P2** |
| Snapshot tagging | LOW | LOW | **P2** |
| Bandwidth throttling | MEDIUM (residential users) | LOW | **P2** |
| PITR Postgres | LOW (over-engineered for homelab) | HIGH | **P3** |
| TPM / hardware keys | LOW | HIGH | **P3** |
| P2P backup | LOW (anti-feature for MVP) | HIGH | **P3** |
| Continuous replication | LOW (wrong layer) | HIGH | **P3** |

---

## Competitor Feature Analysis

| Feature | restic + Backrest | Kopia | Borgmatic | Synology HB | Time Machine | Veeam | pgBackRest | LivOS Approach |
|---------|------------------|-------|-----------|-------------|--------------|-------|------------|----------------|
| **Web UI** | Yes (Backrest) | Yes (built-in) | No | Yes (DSM) | Yes (Mac app) | Yes (heavy) | No | Yes — extends Settings panel |
| **Mandatory encryption** | Optional | **Yes** | Yes | Yes | No | Yes | Optional | **Yes — refuse unencrypted** |
| **Recovery code (paperkey-style)** | Manual | No | Manual | No (lock-in) | iCloud-recovery | No (corp keys) | Manual paperkey | **Yes — BIP39 at creation** |
| **GFS retention** | Yes | Yes | Yes | Yes | N/A | Yes | Yes | **Yes — keep_last + daily/weekly/monthly** |
| **Multi-destination** | Multi-repo | Multi | Multi-repo | Yes | iCloud + disk | Yes | Multi-repo | **Yes — up to 5/plan** |
| **Integrity verification** | Yes (`check`) | Yes (Reed-Solomon) | Yes (`check`) | Yes (toggle) | Auto | Yes | Yes (checksums) | **Yes — light/full tiers** |
| **Selective restore (browse)** | Yes | Yes | Yes (mount) | Yes | Yes | Yes | File-level | **Yes — tree picker UI** |
| **In-place restore** | Yes | Yes | Yes | Yes | Yes | Yes (Instant) | Yes | **Yes — confirmation gate** |
| **Disaster recovery wizard** | Manual | Manual | Manual | Manual | "Restore from backup" | Bare-metal | Manual | **Yes — `install.sh --restore-from`** |
| **Restore drill** | Manual | Manual | Manual | No | No | Yes (SureBackup) | Manual | **Yes — built-in `restoreDrill()`** |
| **Pre-update auto-snapshot** | No | No | Manual | No | No | App-aware | No | **Yes — v29.0 integration** ← differentiator |
| **AI-assisted restore** | No | No | No | No | No | No | No | **Yes (v30.0 MVP, full v30.1+)** ← MOAT |
| **PostgreSQL native** | tar of dump | tar of dump | dump hooks | No | N/A | App plugin | **Native pg_dump+WAL** | **pg_dump (PITR v31+)** |
| **Multi-user / RBAC** | No | No | No | DSM users | macOS users | Yes (RBAC + 4-eyes) | No | **Yes — owner_user_id + audit** |
| **Immutable destination** | Via S3 Object Lock | Via S3 OL | Via S3 OL | Via locks | No | Yes (built-in) | Via S3 OL | **Yes — pass-through OL toggle (v30.1)** |
| **Schedule UX** | Cron + preview | Policies | Cron | Presets | "every hour" | Wizard | Cron | **Presets primary, cron secondary** |
| **Notifications** | Plugin hooks | Plugin | Healthchecks/ntfy | Email/SMS | macOS native | Full SMTP+SNMP | Email | **In-UI + email + webhook + PWA push** |

**LivOS unique combination:** AI-assisted restore + Multi-user audit + Pre-update auto-snapshot + Disaster recovery CLI + Restore drill — no single competitor has all five. This is the moat.

---

## Sources

### Primary references (HIGH confidence)
- [Backrest README + Documentation](https://github.com/garethgeorge/backrest) — restic Web UI features
- [Backrest official site](https://backrest.org/) — plan model, scheduled snapshots, multi-repo
- [Kopia Features](https://kopia.io/docs/features/) — encryption, policies, repository concept
- [Kopia Encryption](https://kopia.io/docs/advanced/encryption/) — AES-256-GCM-HMAC-SHA256, ChaCha20-Poly1305, Reed-Solomon
- [Borgmatic Configuration](https://github.com/borgmatic-collective/borgmatic) — YAML config, retention, DB hooks
- [Synology Hyper Backup Integrity](https://mariushosting.com/synology-hyper-backup-what-is-backup-integrity/) — scheduled integrity checks
- [Time Machine Local Snapshots](https://support.apple.com/en-us/102154) — set-and-forget hourly snapshots, 24h retention
- [Veeam Instant Recovery](https://www.veeam.com/products/veeam-data-platform/capability/instant-recovery.html) — instant recovery, granular file recovery, immutability
- [pgBackRest User Guide](https://pgbackrest.org/user-guide.html) — PITR, WAL archiving, full/diff/incremental, parallel compression, checksum verification
- [pgBackRest Site](https://pgbackrest.org/) — repository design
- [UrBackup Features](https://www.urbackup.org/features.html) — file+image dual mode, SHA-512 dedup, AES-GCM
- [Duplicacy Self-Hosting](https://selfhosting.sh/apps/duplicacy/) — AES-256-GCM, no key recovery
- [Proxmox Backup 2026 Guide (Cloud-PBS)](https://cloud-pbs.com/resources/proxmox-backup-2026/) — 5-2-1 minimum, monthly recovery drill
- [3-2-1 Self-Hosted 2026 (ZeonEdge)](https://zeonedge.com/sr/blog/backup-strategy-self-hosted-applications-2026-automated-encrypted) — practical implementation
- [3-2-1-1-0 Evolution (AvePoint)](https://www.avepoint.com/blog/backup/what-is-the-3-2-1-backup-rule) — immutability evolution
- [Castle Rock Sky 2026: 3-2-1 Isn't Enough](https://www.castlerocksky.com/the-3-2-1-backup-rule-isnt-enough-in-2026-heres-what-changed/) — immutable + verified + tested
- [Home Assistant 2026.4 Encryption Modernization](https://www.home-assistant.io/blog/2026/03/26/modernizing-encryption-of-home-assistant-backups/) — Argon2id + XChaCha20-Poly1305 + libsodium secretstream
- [GFS Retention Policy (Nakivo)](https://www.nakivo.com/blog/gfs-retention-policy-explained/) — daily/weekly/monthly mechanics
- [Veeam GFS Long-Term Retention](https://helpcenter.veeam.com/docs/vbr/userguide/backup_copy_gfs.html) — implementation reference
- [AWS Restore Testing](https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing.html) — automated restore drill patterns
- [DoHost Recovery Drill 2026](https://dohost.us/index.php/2026/04/01/ransomware-recovery-drills-practicing-restoration-from-immutable-backups/) — drill cadence + ransomware context
- [Healthchecks.io Notifications](https://healthchecks.io/docs/configuring_notifications/) — multi-channel redundancy
- [ntfy Integrations](https://docs.ntfy.sh/integrations/) — backup notification patterns
- [Azure Backup Multi-User Authorization](https://learn.microsoft.com/en-us/azure/backup/multi-user-authorization-concept) — gatekeeper / 4-eyes pattern
- [WorkOS Multi-Tenant RBAC](https://workos.com/blog/how-to-design-multi-tenant-rbac-saas) — tenant isolation as security property
- [PBS Client-Side Encryption (remote-backups.com)](https://remote-backups.com/blog/pbs-client-side-encryption) — paperkey, no key escrow

### LivOS-internal references (HIGH confidence — code-verified via PROJECT.md)
- `.planning/PROJECT.md` — v30.0 milestone goals + key context
- v27.0 Phase 20 — `scheduled_jobs`, AES-256-GCM credential vault, S3/SFTP/local destinations
- v29.0 Phase 32 — `livos-rollback.sh`, `livos-precheck.sh`, JSON history records
- v29.0 Phase 33 — `update-<ts>-<sha>.log` + `<ts>-success|failed.json`, Settings update history UI
- v29.0 Phase 34 — sidebar update badge UX
- v26.0 Phase 15 — `device_audit_log` PG table with immutability triggers
- v22.0 Capability Registry — MCP tool registration model
- Phase 23 `docker_diagnostics` — AI tool integration precedent

### Secondary references (MEDIUM confidence)
- [Slashdot Duplicati vs UrBackup 2026](https://slashdot.org/software/comparison/Duplicati-vs-UrBackup.org/)
- [N2W AI Disaster Recovery](https://n2ws.com/blog/how-ai-is-changing-disaster-recovery) — AI-assisted DR limits, "human in loop" framing
- [TechTarget AI in DR](https://www.techtarget.com/searchdisasterrecovery/tip/Ways-to-use-AI-in-IT-disaster-recovery)
- [Restic vs Borg (DEV)](https://dev.to/selfhostingsh/restic-vs-borgbackup-which-backup-tool-to-use-4cmn)

---

*Feature research for: System-level backup & restore (LivOS v30.0)*
*Researched: 2026-04-28*
*Confidence: HIGH on table stakes + anti-features; MEDIUM on differentiator prioritization (forward-looking)*
