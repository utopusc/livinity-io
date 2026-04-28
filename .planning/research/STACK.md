# Stack Research — v30.0 Backup & Restore

**Domain:** Self-hosted backup/restore for multi-component AI server OS
**Researched:** 2026-04-28
**Confidence:** HIGH (most choices verified against existing Phase 20 patterns + 2025-26 web sources)

---

## TL;DR — Recommended Stack

| Concern | Pick | One-liner |
|---|---|---|
| PostgreSQL | `pg_dump -Fc -Z zstd` (custom format, zstd compression) | Logical, portable, parallel restore, fits 1× livos DB on Mini PC |
| Redis | `BGSAVE` + copy `dump.rdb` (no AOF) | Settings/conversations are coarse; second-of-loss tolerable |
| Filesystem / per-app volumes | **Reuse existing kopia** + extend Phase 20 alpine-tar pipe with **age-encryption** stream filter | Don't add a 3rd backup engine; kopia already handles dedup/encrypt/incremental/restore-resume |
| Cloud destinations | Keep `@aws-sdk/lib-storage` for streaming, **add `rclone` binary** for kopia repo + multi-cloud paths | rclone gives B2-native + 70+ providers without code changes |
| Encryption (config files / secrets / .env) | **`age`** via `age-encryption` (typage) npm pkg, passphrase-derived | Passphrase-only UX, X25519+ChaCha20-Poly1305, FilippoSottile design |
| Job orchestration | **Keep existing `Scheduler` + `inFlight` Set mutex** — DO NOT introduce BullMQ | Job count is small (<20), in-process mutex sufficient; adds heartbeat field for long jobs |
| Compression | **zstd** level 3 (where format permits) | 5-10x faster than gzip at near-equal ratio, fastest decompression |
| Restore tooling | Standalone `livos-restore` shell script + tsx-runnable `restore.ts` for full DR | Bootstrap when livinityd is broken — no daemon dependency |

---

## Recommended Stack

### Core Technologies (NEW for v30.0)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `age` (CLI) | 1.2.x | Encrypt/decrypt small files (.env, secrets, archive blobs) | Modern PGP replacement, single passphrase mode, X25519+ChaCha20-Poly1305, ~250 KB single binary. Designed by Filippo Valsorda; no legacy crypto, no signing scope. ([age-encryption.org](https://age-encryption.org), [Filippo Sottile](https://github.com/FiloSottile/age)) |
| `age-encryption` (npm `typage`) | ^0.2.4 | Stream-encrypt tar.gz output in livinityd without spawning age binary | Pure TypeScript impl by age author. Works in node/deno/bun/browser. Supports passphrase + X25519 + WebAuthn passkey recipients. Single dep, no native bindings. ([npm](https://www.npmjs.com/package/age-encryption), [github.com/FiloSottile/typage](https://github.com/FiloSottile/typage)) |
| `pg_dump` (system) | 16.x (matches Mini PC PG) | Logical PG snapshots | Industry default for portable, restorable, version-flexible PG backups. `-Fc` (custom) supports parallel restore (`pg_restore -j`). Single livos DB <1 GB → no need for pgBackRest's complexity. |
| `rclone` (CLI) | 1.73.5 (Apr 2026) | Universal S3/B2/Wasabi/SFTP/MinIO/WebDAV transport for kopia repos + raw archives | One binary handles 70+ backends. Resumable transfers, server-side checksums, bandwidth limiting, native B2 (avoids B2's S3-compat 1000-req limits). Kopia integrates via `--repository=rclone`. ([rclone changelog](https://rclone.org/changelog/)) |
| `kopia` (CLI — already installed) | 0.18.2+ | Encrypted, deduplicated, incremental snapshots of /opt/livos/data + per-app volumes | **Already in livinityd** (`backups.ts` uses kopia for /Backups). Reuse and extend rather than add restic. Built-in scrypt password derivation, content-addressable dedup, snapshot policies, restore-resume, repo on filesystem/S3/SFTP/B2/rclone. ([kopia.io](https://kopia.io/docs/installation/)) |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@aws-sdk/lib-storage` | ^3.700.0 (already in deps) | Streaming multipart S3 upload | Reuse from Phase 20 `scheduler/backup.ts` for direct S3 path (no rclone needed for simple S3) |
| `ssh2-sftp-client` | ^11.0.0 (already in deps) | Streaming SFTP destination | Reuse from Phase 20 |
| `execa` | ^7.1.1 (already in deps) | Spawn `pg_dump`, `redis-cli BGSAVE`, `kopia`, `rclone`, `age` | Existing pattern — already used for kopia/docker shell-outs |
| `node-cron` | ^3.0.3 (already in deps) | Schedule daily/weekly/custom backups | Reuse Phase 20 `Scheduler` class — register new `pg-backup`, `redis-backup`, `livos-full-backup` job types |
| `ioredis` | ^5.4.0 (already in deps) | Backup-secret vault (passphrase, S3 keys, SSH keys) | Reuse Phase 20 `backup-secrets.ts` pattern (AES-256-GCM, key=sha256(JWT)) |
| `pg` | ^8.20.0 (already in deps) | `scheduled_jobs` row CRUD for new backup job types | Reuse Phase 20 `scheduler/store.ts` |
| `dockerode` | ^4.0.2 (already in deps) | Per-user volume enumeration + alpine-tar streaming | Reuse Phase 20 `streamVolumeAsTarGz()` |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest` (already in deps) | Test backup integrity (encrypt → decrypt round-trip, restore drill) | Add `backups/restore.integration.test.ts` covering the disaster recovery path |
| `pgbench` (PG bundle) | Generate test PG data for restore-drill validation | Optional but recommended for size-realistic tests |

---

## Installation

```bash
# Mini PC host packages (apt)
sudo apt install -y postgresql-client-16 zstd
# kopia: already installed (verify with `kopia --version`)

# rclone (latest stable, single binary)
curl https://rclone.org/install.sh | sudo bash
# Or pin: wget https://downloads.rclone.org/v1.73.5/rclone-v1.73.5-linux-amd64.deb && sudo dpkg -i rclone-v1.73.5-linux-amd64.deb

# age (single Go binary)
sudo apt install -y age   # Ubuntu 24.04 ships age 1.1.x
# OR pin to 1.2.x:
curl -L https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-linux-amd64.tar.gz | sudo tar -xz -C /usr/local/bin --strip-components=1

# livinityd npm dependencies (NEW — add to packages/livinityd/package.json)
cd /opt/livos/livos
pnpm add age-encryption@^0.2.4 --filter livinityd
# Existing deps (no changes): @aws-sdk/lib-storage, @aws-sdk/client-s3, ssh2-sftp-client,
#                              dockerode, execa, node-cron, ioredis, pg, p-queue
```

---

## Key Decisions With Rationale

### 1. PostgreSQL: `pg_dump -Fc` over `pg_basebackup`

**Decision:** `pg_dump --format=custom --compress=zstd:3` for the `livos` DB.

**Why:**
- LivOS has **one** PG database (`livos`) of small/moderate size (multi-user state, conversations, scheduled_jobs, environments, registry creds, ~hundreds of MB). pg_dump's overhead (sequential SELECT through buffer cache) is irrelevant at this scale.
- `pg_dump -Fc` produces a single restorable file with built-in compression and supports **parallel restore** via `pg_restore -j N`. ([Microsoft Learn — pg_dump best practices](https://learn.microsoft.com/en-us/azure/postgresql/troubleshoot/how-to-pgdump-restore))
- **Cross-version-restorable** — survives a future PG 17 upgrade. `pg_basebackup` cannot.
- `pg_basebackup` is for full-cluster physical recovery / standby provisioning / PITR — overkill, requires WAL archiving infrastructure, and the Mini PC has only one PG cluster shared across nothing else. ([Crunchy Data — Intro to Postgres Backups](https://www.crunchydata.com/blog/introduction-to-postgres-backups))
- pgBackRest / Barman are enterprise-grade for multi-TB clusters with PITR — wrong scope. ([Top 5 PostgreSQL backup tools 2025](https://medium.com/@rostislavdugin/top-5-postgresql-backup-tools-in-2025-82da772c89e5))
- `-Z zstd` available in PG 16+. Per [Cybertec's PG-16 compression piece](https://www.cybertec-postgresql.com/en/pg_dump-compression-specifications-postgresql-16/), zstd:3 hits near-gzip-9 ratio at gzip-1 speed.

**Implementation note:** Run `pg_dump` from the livinityd PG user (already has `DATABASE_URL` in `/opt/livos/.env`). Stream stdout into the kopia snapshot OR pipe through age and upload — never stage to disk.

```bash
# Direct streaming pattern (no on-disk intermediate)
PGPASSWORD=... pg_dump -h localhost -U livos -d livos -Fc -Z zstd:3 \
  | age -p -o livos-pg-${TS}.dump.age
# Or fold into kopia snapshot:
PGPASSWORD=... pg_dump ... | kopia snapshot create --stdin-file=livos-pg.dump -
```

### 2. Redis: `BGSAVE` + copy RDB, skip AOF

**Decision:** Trigger `BGSAVE` via `redis-cli`, wait for `LASTSAVE` to bump, then copy `dump.rdb`.

**Why:**
- LivOS Redis stores **ephemeral session/cache state + nexus conversation history** — losing the last few seconds is acceptable; LivOS is not a financial-transaction system.
- BGSAVE forks a child, parent keeps serving — **no client blocking** (`SAVE` is the blocking variant; never use it). ([Redis docs — Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/))
- AOF would give second-of-loss durability but doubles disk writes and complicates restore (AOF replay vs RDB load). Default Redis production guidance is "RDB + AOF hybrid" — but that's for primary durability, not periodic external backup. We rely on RDB-only because backups are the disaster-recovery layer; live durability is a separate concern (and Redis on Mini PC isn't append-fsync'd anyway).
- Memory spike during BGSAVE is ~10-15% (CoW). 32 GB Mini PC absorbs this trivially.

**Implementation pattern:**

```typescript
// Wait for new RDB to land
await execa('redis-cli', ['-a', redisPassword, 'BGSAVE'])
const before = await getLastSave()
await waitFor(async () => (await getLastSave()) > before, {timeout: 10*60_000})
// Now /var/lib/redis/dump.rdb is fresh — pipe into kopia or age
```

### 3. Filesystem / Per-App Volumes: Extend kopia, don't add restic

**Decision:** **Reuse existing kopia** for filesystem snapshots (/opt/livos/data, .env, per-user home dirs); **keep Phase 20 alpine-tar pipe** for per-app Docker volumes that need fresh-tar semantics, but add **age stream encryption** for the cloud destinations.

**Why kopia stays:**
- It's **already vendored and used** in `livinityd/source/modules/backups/backups.ts`. Replacing it = wholesale rewrite of the existing /Backups UX.
- Kopia gives content-defined chunking (similar to Borg, more efficient than Restic), **client-side encryption**, **deduplication across snapshots**, **incremental via fast hash-lookup**, **resume on interrupt** (each snapshot writes incremental index files to repo). ([Kopia GitHub](https://github.com/kopia/kopia))
- Built-in repo backends: filesystem, **S3**, **SFTP**, **B2 native**, **rclone passthrough** (= 70+ clouds). Matches our destination matrix without code. ([kopia.io/docs/installation](https://kopia.io/docs/installation/))
- Disaster recovery is straightforward: `kopia repository connect <backend>` from a fresh host, `kopia restore <snapshot-id> /target/`. The `kopia repository status -t` token even encodes connection params for one-line reconnect. ([Kopia Forum — DR](https://kopia.discourse.group/t/kopia-disaster-recovery-instructions/3148))

**Why NOT switch to restic / borg:**
- restic 0.18.1 (April 2026) is excellent and has the simpler CLI, but **adopting it requires re-implementing repo-create / snapshot / restore wrapper code** that already exists for kopia. Net loss for this milestone. ([restic releases](https://github.com/restic/restic/releases))
- borg has the best memory profile (~75 MB peak) but **no native S3** — needs rclone-as-fuse mount, which is fragile. ([Onidel comparison](https://onidel.com/blog/restic-vs-borgbackup-vs-kopia-2025))
- Mini PC has 32 GB RAM; memory profile differences are noise.

**Why age stream encryption ON TOP of kopia:**
- Kopia already encrypts repo contents — but for **non-kopia destinations** (raw S3 bucket without kopia repo, plain SFTP drop-zone, restore-drill exports for off-site cold storage), we need a portable single-file encrypted blob.
- `age` is the modern PGP replacement: 1 binary, no keyring weirdness, X25519 + ChaCha20-Poly1305, supports passphrase OR keypair recipients, streaming-friendly. ([Soatok — What to use instead of PGP](https://soatok.blog/2024/11/15/what-to-use-instead-of-pgp/), [Switching from GPG to age — luke.hsiao.dev](https://luke.hsiao.dev/blog/gpg-to-age/))
- npm `age-encryption` (typage) by Filippo Valsorda lets us stream-encrypt inside livinityd without spawning external `age`. ([typage on GitHub](https://github.com/FiloSottile/typage))

### 4. Per-App Volume Backup: Keep Phase 20 alpine-tar pipeline

**Decision:** Don't change `scheduler/backup.ts`. Per-volume `tar czf - /data` from ephemeral alpine container with `:ro` bind, demuxed via dockerode, streamed to S3/SFTP/local — works and is tested.

**Extension:** Add an **age stream filter** between alpine-tar stdout and the destination uploader. Optional per-job flag `encrypt: true` that wraps the readable in `age.encrypt(passphrase)`.

```typescript
import * as age from 'age-encryption'
// ... existing streamVolumeAsTarGz()
let stream = out.stream
if (job.config.encrypt) {
  const enc = await age.encrypt({passphrase: passphraseFromVault, input: stream})
  stream = Readable.from(enc)
}
await uploadToS3(stream, key + '.age', cfg, secret)
```

### 5. Cloud Destinations: rclone for kopia, aws-sdk for direct

**Decision:**
- **kopia repos** → use `kopia repository create rclone --remote-path=<rclone-remote>:bucket/path` for B2/Wasabi/MinIO. This makes the repo backend 70-provider-agnostic.
- **Direct streaming** (Phase 20 path, raw `.tar.gz.age` files) → keep `@aws-sdk/client-s3` + `lib-storage Upload` (already wired). Works for S3/B2-S3-compat/Wasabi/MinIO/R2.
- **SFTP direct** → keep `ssh2-sftp-client` (already wired).

**Why rclone for kopia:**
- B2's S3-compat API has a 1000 req/day per-bucket cap on the LIST endpoint (used heavily by kopia for repo verification). Native B2 via rclone bypasses this.
- Wasabi has a 90-day minimum storage charge — kopia's content-addressable model prevents object thrash. rclone surfaces native semantics.
- Kopia's rclone backend is officially supported. ([kopia.io repos](https://kopia.io/docs/repositories/))

**Why NOT replace `@aws-sdk` with rclone shell-out for streaming uploads:**
- Phase 20's `Upload({Body: stream})` does multipart automatically with backpressure-correct streaming. rclone CLI shell-out loses Node.js-native abort + progress events.
- aws-sdk JS v3 supports custom endpoint + path-style addressing (already used: `forcePathStyle: true` for MinIO), so B2/Wasabi/R2/MinIO all work with the same code path.
- One spot, two transports: rclone for repos (because kopia integrates), aws-sdk for streams (because Node).

### 6. Job Orchestration: Keep `Scheduler.inFlight` Mutex, Add Heartbeat

**Decision:** Reuse Phase 20's `Scheduler` class verbatim. Do **NOT** add BullMQ / bee-queue / Redis-backed queue.

**Why:**
- LivOS scheduler runs **one livinityd process** on the Mini PC. There's no horizontal-scale concern, no multi-node race. The in-process `inFlight = new Set<string>()` mutex correctly drops concurrent firings.
- BullMQ adds a second Redis dependency surface (separate connection, separate keyspace), separate worker process model, and ~100 dev-hours of refactor for zero benefit at LivOS's scale. ([Judoscale — Choosing Node.js Job Queue](https://judoscale.com/blog/node-task-queues))
- node-cron's documented pattern for "job runs longer than its interval" is exactly what we already do (boolean/Set guard). ([node-cron issue #459](https://github.com/kelektiv/node-cron/issues/459))

**Extension required:** For long-running backup jobs (could be 1+ hour for 100 GB volume to remote SFTP), add a **heartbeat** column to `scheduled_jobs` so the UI doesn't show "running" forever after a livinityd crash:

```sql
ALTER TABLE scheduled_jobs ADD COLUMN heartbeat_at TIMESTAMPTZ;
-- In the handler, write to heartbeat_at every 30s.
-- On scheduler.start(), reset any 'running' rows with heartbeat older than 5min to 'failure'.
```

### 7. Compression: zstd everywhere we control the format

**Decision:**
- pg_dump: `-Z zstd:3` (PG 16+ supports it natively).
- Plain tar archives (Phase 20 path): pipe through `zstd -3 -T0` (multithreaded) instead of gzip. Gives ~30% size reduction at faster compression speed.
- Inside kopia repo: kopia uses **zstd by default** since v0.10. No action needed.

**Why:**
- zstd at level 3 hits ~3.5× compression in ~3s where gzip-9 takes 30s for similar ratio. ([ntorga compression comparison](https://ntorga.com/gzip-bzip2-xz-zstd-7z-brotli-or-lz4/))
- **Decompression speed is critical for restore** — zstd decompresses at ~4× gzip speed, ~10× xz. Restore-time matters more than backup-time for disaster scenarios. ([SQL Server 2025 ZSTD Backup](https://www.mytechmantra.com/sql-server/sql-server-2025-zstd-backup-compression/))
- xz wins on ratio but is glacial on compression — fine for archive-grade off-site copies, terrible for hourly backups.
- gzip is the lowest-common-denominator fallback — keep tar.gz emit available for "open it on grandma's Windows laptop" interop.

### 8. Disaster Recovery / Bootstrap: Standalone Restore Tool

**Decision:** Ship a `livos-restore.sh` shell wrapper + `packages/livinityd/source/modules/backups/restore.ts` that **runs via tsx without the livinityd daemon**.

**Why this is the most important architectural decision:**
- The whole point of backup is "livinityd is broken, PostgreSQL is gone, the disk got nuked — restore." If restore depends on livinityd running, the chicken-and-egg breaks the recovery story.
- restic, kopia, borg all support restore from any host with the binary + repo URL + passphrase. We must mirror that pattern at the **LivOS-as-a-whole** level, not just per-component.

**Bootstrap flow (target UX):**

```bash
# On a fresh Mini PC with only Ubuntu 24.04 + Node.js 22 installed:
curl -fsSL https://livinity.io/install.sh | sudo bash      # installs livinityd skeleton
sudo livos-restore --from s3://my-bucket/livos-backups/2026-04-28 \
                   --passphrase-file /tmp/passphrase
# Script:
#   1. Validates passphrase against repo manifest (kopia repository connect --check)
#   2. Restores PG dump → recreates livos DB user + DB → pg_restore -j 4
#   3. Restores Redis dump.rdb → systemctl stop redis → cp → start
#   4. Restores /opt/livos/data (kopia restore)
#   5. Restores .env / secrets (age decrypt)
#   6. Restores per-user Docker volumes (alpine extract from .tar.gz.age)
#   7. systemctl restart livos liv-core liv-worker liv-memory
```

This script is **the** bootstrap-from-shell tool. It uses `tsx` to run a TypeScript module so the same code paths/types as livinityd, but does NOT require livinityd running.

### 9. Restore Drill (Test-Restore)

**Decision:** A `livos-restore --drill` mode that restores into **`/var/lib/livos-drill/`** with:
- A separate PG database (`livos_drill`)
- A separate Redis instance on port 6380 (started ephemerally)
- A separate read-only mount for /opt/livos/data into a tmpfs
- Reports "OK" if PG schema migrations apply cleanly + Redis loads + critical tables non-empty
- Tears down on completion

This catches the "we've been backing up an empty DB for 3 months" silent-failure mode that kills self-hosted users.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `pg_dump -Fc` | `pg_basebackup` + WAL archiving (PITR) | If LivOS ever ships multi-TB user-data into PG (image embeddings, large logs) AND users demand sub-minute RPO. Currently overkill. |
| `pg_dump -Fc` | `pgBackRest` | Multi-cluster enterprise PG with shared backup repo across nodes. LivOS has one PG cluster. |
| kopia (existing) | `restic 0.18.1` | New project from scratch with no existing kopia integration. restic CLI is simpler, slightly more popular in 2026 polls, but no benefit at our scale to switch. |
| kopia (existing) | `borgbackup 1.4` | Memory-constrained host (<2 GB RAM) doing local-only backup. Not our case. |
| `age` (passphrase) | `gpg --symmetric` | Compatibility with users who already manage GPG keyrings. age is strictly better for new code. |
| `age` (passphrase) | `openssl enc -aes-256-cbc` | Never. CBC + no auth tag = corruption silent failure. age uses authenticated ChaCha20-Poly1305. |
| `rclone` for kopia repos | Native kopia S3 backend | Pure AWS S3 destination with no B2/MinIO/R2 needed. Native is slightly faster. |
| `node-cron` + Set mutex | `BullMQ` | Multi-livinityd horizontal scaling (not on roadmap). Complex job DAGs (not our model). |
| `zstd:3` | `lz4` | Streaming live data (database WAL shipping) where every CPU cycle matters. Backups are batch — zstd's 30% better ratio wins. |
| `zstd:3` | `xz -9` | Cold-storage archive copies kept for years. zstd:19 still wins on decompression speed; xz only beats on ratio at 22+ which is extreme. |
| `livos-restore.sh` | Reuse `update.sh` pattern | Restore != update. Keep them separate; update.sh is for code + config, restore is for data. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `pg_dumpall` | Dumps the entire cluster including roles, but LivOS only has one DB and we do NOT want to overwrite postgres superuser config on restore | `pg_dump -d livos` (single DB) |
| `mysqldump` analogues / blocking SAVE in Redis | `SAVE` blocks all clients — LivOS UI freezes during snapshot | `BGSAVE` |
| `tar` without auth (no signature) | A corrupted/MITM'd archive restores silently bad data | Pipe through `age` (authenticated) or kopia (HMAC'd) |
| `gpg --symmetric` for new code | Slow (orders of magnitude slower than age on backups, per [Filippo's age-authentication post](https://words.filippo.io/age-authentication/)), confusing UX, broken trust model | `age -p` |
| `BullMQ` / `bee-queue` | Adds Redis-as-a-queue surface, separate worker process, multi-process coordination — none of which we need at single-host scale | Existing in-process `Scheduler.inFlight` Set + heartbeat field |
| `rsync --link-dest` rolling backup | No encryption, no compression, hardlink scheme breaks across cloud storage, no integrity verification | kopia (designed for this exact use case) |
| `duplicity` | Active maintenance lagging, GPG-only encryption, slow restore due to incremental chains | restic / kopia |
| Custom dedup using SHA256 + rsync | Reinventing 10 years of restic/kopia work | Just use kopia |
| `xz -9` for hourly backups | 30s+ compression for marginal ratio gain over zstd:9 | `zstd -3 -T0` |

---

## Stack Patterns by Variant

### If user has multi-TB media on /opt/livos/data:
- Switch the filesystem snapshot from kopia-on-Phase20-alpine-tar to **kopia-direct-on-host** (`kopia snapshot create /opt/livos/data`). Lets kopia do per-file dedup + change detection rather than re-tarring the whole tree. ([restic forum — bare metal restore](https://forum.restic.net/t/bare-metal-restore-from-restic-repo-worked-fine/1651))
- Keep alpine-tar for **per-Docker-volume** path because we need read-only volume access without unmount.

### If user wants offsite + onsite:
- Configure **two** `scheduled_jobs` rows: one with `local` destination at `/mnt/external-drive`, one with `s3` destination. Same content, two repos. Matches the 3-2-1 backup rule.
- For B2/Wasabi specifically, add a `kopia maintenance set --owner=livos` cron to handle GC weekly so cold storage charges don't bloat from stale chunks.

### If multi-user with sensitive cross-user isolation:
- Per-user Docker volumes can be backed up under **per-user passphrases** (passphrase-derived from user's password hash + an admin master key as recipient — both are X25519 recipients on age). Admin can decrypt all; user can decrypt own.
- This requires `age-encryption`'s multiple-recipient support — already in the npm package.

### If Mini PC tunnel is flaky (per the constraint):
- Always use **kopia + rclone** for cloud destinations: rclone has built-in `--retries`, `--low-level-retries`, and resumable multipart uploads. ([rclone docs](https://rclone.org/docs/))
- Kopia itself stages chunks in repo; if interrupted mid-snapshot, the next run continues from where it left off (writes intermediate index files). ([restic forum — interrupted backup recovery](https://forum.restic.net/t/quicker-interrupted-backup-resumption/3470) — same pattern in kopia)
- For raw `.tar.gz.age` (Phase 20 path), the aws-sdk lib-storage Upload supports multipart resume, but you have to plumb the `UploadId` through. Acceptable trade-off: prefer the kopia path for unstable networks, the raw path for one-off "I want a portable file."

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `age-encryption@^0.2.4` (npm) | Node.js 18+, Bun, Deno, browser | Pure TS, no native deps, ESM-only — works in livinityd's `"type": "module"` setup |
| `kopia 0.18.x` | Mini PC Ubuntu 24.04 (glibc 2.39) | Single Go binary, no system deps |
| `rclone 1.73.x` | Any modern Linux | Single Go binary; verify `rclone version` reports >=1.70 for archive backend |
| `pg_dump 16` ↔ `pg_restore 16` | Same major version | Cross-major works for restore-up but not down — pin pg_restore to match the destination cluster |
| `@aws-sdk/lib-storage 3.700+` | Node.js 18+, ESM | Already pinned in package.json |
| `node-cron 3.0.x` | Node.js 18+ | LivOS pins 22+, fine |
| `ssh2-sftp-client 11.0.0` | Node.js 18+ | Already pinned, used by Phase 20 |

---

## Integration With Existing Phase 20 Code

### What to **REUSE** (don't reinvent)

1. **`scheduler/index.ts` — `Scheduler` class with `inFlight` mutex.** Register new job types: `pg-backup`, `redis-backup`, `livos-full-backup`, `restore-drill`.
2. **`scheduler/store.ts` — `scheduled_jobs` table CRUD.** Just add 3 new rows on `seedDefaults()`.
3. **`scheduler/backup-secrets.ts` — `BackupSecretStore` (AES-256-GCM, key=sha256(JWT)).** Use it for the **age passphrase** (field `agePassphrase`), S3/SFTP creds (already supported), and a new field `pgPassword` if backup user differs from livinityd user.
4. **`scheduler/backup.ts` — `streamVolumeAsTarGz()` + `uploadToS3 / uploadToSftp / uploadToLocal`.** Wrap with optional age stream encryption; reuse the destination uploaders verbatim for the new pg-backup / redis-backup jobs.
5. **`scheduler/backup.ts` — `testDestination()`.** Already does the 1KB probe roundtrip. Use unchanged for the UI's "Test connection" button on new backup destination types.
6. **`backups/backups.ts` — `Backups` class with kopia repo lifecycle.** This is the existing /Backups (user-files) flow. Keep it and **expose its kopia infrastructure** as helpers for the new full-system backup pipeline — don't fork kopia handling.

### What to **EXTEND** (small changes)

1. **`scheduled_jobs` table:** Add `heartbeat_at TIMESTAMPTZ` column for long-running job liveness.
2. **`Scheduler.start()`:** On startup, scan for `status='running' AND heartbeat_at < now() - interval '5 min'` rows → mark them `failure` with reason `"scheduler-restart-detected-stale-job"`.
3. **`scheduler/jobs.ts`:** Add 4 new BUILT_IN_HANDLERS entries — `pg-backup`, `redis-backup`, `livos-full-backup`, `restore-drill`. Each is a thin adapter that calls into a new `modules/backups/` helper.
4. **`backup-secrets.ts`:** Add new field names to the existing schema — `agePassphrase`, `pgPassword`, `kopiaRepoPassword`. No code change needed (Redis hash is field-name-agnostic).

### What to **ADD NEW** (real new code)

1. **`modules/backups/pg-backup.ts`** — Spawns `pg_dump -Fc -Z zstd:3 -d livos`, returns a Readable stream. Wraps in age, pipes to destination uploader (reused from scheduler/backup.ts).
2. **`modules/backups/redis-backup.ts`** — Calls `BGSAVE`, polls `LASTSAVE`, copies `dump.rdb`, streams through age + uploader.
3. **`modules/backups/livos-full-backup.ts`** — Orchestrator: runs pg-backup + redis-backup + filesystem-backup (kopia) + per-user-volume-backups in sequence, writes a `manifest.json` listing all the backup IDs/paths/checksums, uploads manifest as the "snapshot pointer."
4. **`modules/backups/restore.ts`** — The DR module. Standalone-runnable via `tsx`: `tsx packages/livinityd/source/modules/backups/restore.ts --from <url> --passphrase-file <path>`. Does NOT import livinityd's main entry — only the helpers it needs.
5. **`scripts/livos-restore.sh`** — User-facing shell wrapper that finds the right tsx, sets env, calls `restore.ts`. Lives at `/opt/livos/livos/scripts/` and gets symlinked into `/usr/local/bin/livos-restore` by `update.sh`/install.
6. **`modules/backups/manifest.ts`** — Defines the `BackupManifestV1` JSON schema (snapshot ID, components, checksums, kopia repo URL, age recipient fingerprint, livinityd version, PG version). Restore parses this first to know what to do.

### What NOT to add (already covered by Phase 20)

- A new credential vault (use `backup-secrets.ts`)
- A new scheduler / queue system (use `Scheduler` + `inFlight`)
- A new S3/SFTP/local destination uploader (use the three from `scheduler/backup.ts`)
- A new alpine-tar streamer for Docker volumes (use `streamVolumeAsTarGz`)
- A new Docker container enumeration helper (use existing `listContainers` from `modules/docker/docker.ts`)
- A new tRPC route group (extend the existing scheduler routes)
- A second Redis client (reuse the one in `backup-secrets.ts` and `Scheduler`)

---

## Sources

| Source | Confidence | What was verified |
|--------|------------|-------------------|
| [Onidel — Restic vs BorgBackup vs Kopia 2025](https://onidel.com/blog/restic-vs-borgbackup-vs-kopia-2025) | MEDIUM | Cloud support comparison, dedup ratios, RAM profiles |
| [Faisal Rafique — Restic vs Borg vs Kopia](https://faisalrafique.com/restic-vs-borg-vs-kopia/) | MEDIUM | Performance benchmarks, encryption modes |
| [Computingforgeeks — Backup tools benchmarked](https://computingforgeeks.com/borg-restic-kopia-comparison/) | MEDIUM | Speed numbers (Kopia winning first-backup) |
| [Crunchy Data — Intro to Postgres Backups](https://www.crunchydata.com/blog/introduction-to-postgres-backups) | HIGH | Authoritative — pg_dump vs pg_basebackup decision tree |
| [PostgreSQL Docs — Chapter 25: Backup and Restore](https://www.postgresql.org/docs/current/backup.html) | HIGH | Official reference |
| [Microsoft Learn — pg_dump and pg_restore best practices](https://learn.microsoft.com/en-us/azure/postgresql/troubleshoot/how-to-pgdump-restore) | HIGH | -Fc + -j parallel restore, max_connections |
| [Cybertec — pg_dump compression in PG 16](https://www.cybertec-postgresql.com/en/pg_dump-compression-specifications-postgresql-16/) | HIGH | -Z zstd availability and tuning |
| [Stormatics — PG backup best practices](https://stormatics.tech/blogs/postgresql-backup-best-practices) | MEDIUM | Logical vs physical scope decisions |
| [Top 5 PG backup tools 2025 — Medium](https://medium.com/@rostislavdugin/top-5-postgresql-backup-tools-in-2025-82da772c89e5) | MEDIUM | When pgBackRest/Barman vs pg_dump matter |
| [Redis docs — Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) | HIGH | Authoritative — BGSAVE vs SAVE vs AOF |
| [SimpleBackups — Complete Redis backup guide](https://simplebackups.com/blog/the-complete-redis-backup-guide-with-examples) | MEDIUM | Practical patterns, RDB+AOF hybrid recommendation |
| [age-encryption.org](https://age-encryption.org/) | HIGH | Authoritative — age spec, X25519+ChaCha20-Poly1305 |
| [Filippo Sottile — age and Authenticated Encryption](https://words.filippo.io/age-authentication/) | HIGH | Authoritative — author's design rationale |
| [Soatok — What to use instead of PGP](https://soatok.blog/2024/11/15/what-to-use-instead-of-pgp/) | MEDIUM | Independent review, libsodium alt |
| [npm — age-encryption (typage)](https://www.npmjs.com/package/age-encryption) | HIGH | Package metadata, version 0.2.4 latest |
| [GitHub — FiloSottile/typage](https://github.com/FiloSottile/typage) | HIGH | TypeScript impl by age author |
| [rclone changelog](https://rclone.org/changelog/) | HIGH | v1.73.5 (Apr 2026), archive backend, security fixes |
| [rclone S3 providers](https://rclone.org/s3/) | HIGH | B2/Wasabi/MinIO/R2 compatibility matrix |
| [Zero Services — S3 client perf](https://lp.zeroservices.eu/articles/s3-client-performance-rclone-minio-aws/) | MEDIUM | rclone vs aws-cli small/large file numbers |
| [Kopia.io — Installation](https://kopia.io/docs/installation/) | HIGH | Authoritative — kopia install + repo backends |
| [Kopia.io — Repositories](https://kopia.io/docs/repositories/) | HIGH | rclone backend support |
| [Kopia Forum — DR Instructions](https://kopia.discourse.group/t/kopia-disaster-recovery-instructions/3148) | MEDIUM | Repo connect on fresh host pattern |
| [restic releases on GitHub](https://github.com/restic/restic/releases) | HIGH | 0.18.1 latest stable confirmed |
| [restic docs — Restoring from backup](https://restic.readthedocs.io/en/stable/050_restore.html) | HIGH | Bare-metal restore semantics |
| [restic forum — Bare metal restore](https://forum.restic.net/t/bare-metal-restore-from-restic-repo-worked-fine/1651) | MEDIUM | Real-world DR validation |
| [restic forum — Quicker interrupted backup resumption](https://forum.restic.net/t/quicker-interrupted-backup-resumption/3470) | MEDIUM | Resume-on-interrupt model (kopia uses similar) |
| [zstd vs gzip for backups — Vastspace](https://www.vastspace.net/zstd-better-than-gzip) | MEDIUM | Backup-specific compression analysis |
| [SQL Server 2025 ZSTD backup compression](https://www.mytechmantra.com/sql-server/sql-server-2025-zstd-backup-compression/) | MEDIUM | zstd wins compression+restore speed in DB context |
| [ntorga — Compression algorithms](https://ntorga.com/gzip-bzip2-xz-zstd-7z-brotli-or-lz4/) | MEDIUM | zstd-3 ratio numbers |
| [Judoscale — Choosing Node.js Job Queue](https://judoscale.com/blog/node-task-queues) | MEDIUM | When BullMQ matters (it doesn't for us) |
| [node-cron Issue #459](https://github.com/kelektiv/node-cron/issues/459) | HIGH | Authoritative pattern — boolean/Set guard for concurrent firings |
| [bee-queue npm](https://www.npmjs.com/package/bee-queue) | MEDIUM | Confirms bee-queue is unmaintained (last release 2 yrs ago) |
| Existing code — `livos/packages/livinityd/source/modules/scheduler/backup.ts` | HIGH | Phase 20 implementation reference |
| Existing code — `livos/packages/livinityd/source/modules/scheduler/backup-secrets.ts` | HIGH | Phase 20 credential vault reference |
| Existing code — `livos/packages/livinityd/source/modules/backups/backups.ts` | HIGH | Existing kopia integration reference |

---

*Stack research for: v30.0 Backup & Restore — Self-hosted multi-component (PG + Redis + filesystem + Docker volumes) backup with disaster recovery*
*Researched: 2026-04-28*
*Confidence: HIGH — all primary recommendations validated against existing Phase 20 code AND independent 2025-26 sources*
