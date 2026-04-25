# Phase 20: Scheduled Tasks + Container Backup - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

node-cron-based scheduler for routine Docker maintenance + container/volume backup to S3/SFTP/local with encrypted credentials.

**Scope:**
- PostgreSQL `scheduled_jobs` table with definitions
- Built-in scheduled tasks: image-prune (weekly), container-update-check (daily), git-stack-sync (hourly — placeholder for Phase 21)
- Volume backup using ephemeral `alpine tar czf - /data` helper container
- Backup destinations: S3-compatible (AWS SDK), SFTP (ssh2-sftp-client), local filesystem
- Settings UI: Scheduler section with job list + backup config

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Use node-cron library (lightweight, no Redis required)
- Persist jobs in `scheduled_jobs` PG table; load on startup
- Backup credentials encrypted with AES-256-GCM using JWT_SECRET-derived key (reuse Phase 17 pattern)
- For S3: `@aws-sdk/client-s3` (already common dep)
- For SFTP: `ssh2-sftp-client`
- Each backup run produces a timestamped tar.gz at destination

</decisions>

<specifics>
## Specific Ideas

**Plans (target 2):**
- Plan 20-01: Scheduler module + built-in maintenance tasks (image prune + update check)
- Plan 20-02: Backup module + destinations + Settings UI

</specifics>

<deferred>
## Deferred Ideas

- Backup encryption at rest (beyond destination encryption) — v28.0
- Backup verification / restore testing UI — v28.0
- Cross-version backup compatibility — v28.0
- Container live-state backup (CRIU) — out of scope

</deferred>
