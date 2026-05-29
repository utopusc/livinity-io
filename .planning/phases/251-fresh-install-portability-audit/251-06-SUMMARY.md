---
phase: 251-fresh-install-portability-audit
plan: 06
subsystem: infra
tags: [audit, portability, systemd, environment, env-delivery, liv-assistant, luse, redis, EnvironmentFile, aioncore]

# Dependency graph
requires:
  - phase: 251-fresh-install-portability-audit
    provides: 251-RESEARCH.md verified leads (liv-assistant.service no REDIS_URL, update.sh:720-746 MCP patch, redis-env.conf live-only)
provides:
  - "Systemd & env-delivery portability findings (6-row per-service env-delivery table, liv-assistant inheritance-chain trace, AionUi luse first-create gap, redis-env.conf live-only confirmation, EnvironmentFile recommendation)"
affects: [251-08, 251-09, 252-remediation]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Audit findings doc with file:line evidence + per-service env-delivery table + inheritance-chain trace"]

key-files:
  created: [.planning/phases/251-fresh-install-portability-audit/findings/251-06-FINDINGS.md]
  modified: []

key-decisions:
  - "Verdict: WITHOUT redis-env.conf a fresh box gives luse Redis ONLY via the /opt/livos/.env file fallback (server.ts:124) — no systemd inheritance (liv-assistant.service has no EnvironmentFile), no per-MCP env seed (update.sh:725 gated on pre-existing entry that no script first-creates)"
  - "Recommend EnvironmentFile=-/opt/livos/.env on the committed liv-assistant.service unit as the single canonical channel; NEVER productize the literal redis-env.conf drop-in (would re-hardcode the secret)"

patterns-established:
  - "Trace the aioncore->claude->luse child-inheritance chain and classify each delivery channel (inheritance / per-MCP env / .env file fallback) as COVERED/GAP per install path"

requirements-completed: [PORT-251-SYSTEMD-ENV]

# Metrics
duration: ~11min
completed: 2026-05-29
---

# Phase 251 Plan 06: Systemd & Env-Delivery Portability Summary

**Read-only audit proving that on a fresh box the luse process gets a Redis URL ONLY through the in-repo `/opt/livos/.env` file fallback (`server.ts:124`) — `liv-assistant.service` ships with NO `EnvironmentFile`/`REDIS_URL` so aioncore→claude→luse inherit nothing, and the per-MCP `env` block that carries `LUSE_REDIS_URL` is only written by `update.sh:737` if the AionUi entry already exists (a first-create that no shell script performs); the hand-made `redis-env.conf` drop-in exists nowhere in repo/scripts.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-05-29
- **Completed:** 2026-05-29
- **Tasks:** 2 (both `auto`)
- **Files modified:** 1 created (findings doc); zero source/script files (D-251-READONLY honored)

## Accomplishments
- **Task 1 (trace env delivery)** — Built a 6-row per-service env-delivery table: `livos.service` + `liv-core/worker/memory` all carry `EnvironmentFile=/opt/livos/.env` (`deploy-livinityd.sh:1480,1572`) → COVERED; `liv-assistant.service` carries only `PATH`/`HOME`/`MCP_TIMEOUT` (`:13,17,19`), NO Redis env → GAP. Traced the inheritance chain: liv-assistant spawns aioncore→claude→luse as plain children, so they inherit liv-assistant's Redis-less env. Showed the per-MCP `env` seed (which DOES inject `LUSE_REDIS_URL`, `update.sh:731`) sits inside `if [[ -n "$_ID" ]]` (`:725`) and the matching first-create POST exists in NO `.sh` (only the "Phase 241 seed" comment at `:718`). Confirmed `resolveLuseRedisUrl` fallback order (`server.ts:113-139`): `LUSE_REDIS_URL` env → `REDIS_URL` env → `/opt/livos/.env` file read (`:124`). Grep proved `redis-env.conf`/`*.service.d` absent everywhere (0 matches across `scripts/ systemd/ update.sh install.sh`).
- **Task 2 (recommendation)** — Recommended ONE coherent mechanism: add `EnvironmentFile=-/opt/livos/.env` to the committed `liv-assistant.service` so `REDIS_URL` enters liv-assistant's env and children inherit it (luse `resolveLuseRedisUrl` step 2 then resolves with no dependence on the per-MCP seed or the luse-side `.env` read). Explicitly recommended AGAINST productizing the literal `redis-env.conf` drop-in (re-hardcodes the per-install secret). Flagged the missing AionUi luse MCP first-create POST as a secondary gap to encode, and demoted the `server.ts:124` file read to last-resort fallback only.

## Task Commits

1. **Tasks 1 + 2: Systemd & env-delivery findings doc** - `2c31d5bb` (docs)

**Plan metadata:** (this SUMMARY + STATE + ROADMAP) committed separately.

_Both audit tasks landed in the single findings doc + one commit, matching the prior 251-0N findings-doc convention._

## Files Created/Modified
- `.planning/phases/251-fresh-install-portability-audit/findings/251-06-FINDINGS.md` - The dimension's findings: TL;DR verdict, 6-row per-service env-delivery table with file:line evidence, inheritance-chain analysis, live-box-vs-fresh-box masking explanation, single recommended `EnvironmentFile` mechanism, cross-references to 251-01/251-08, severity/effort.

## Decisions Made
- **The `/opt/livos/.env` file fallback (`server.ts:124`) is the SINGLE load-bearing Redis-delivery path for luse on a fresh box.** Rationale: no systemd inheritance (liv-assistant.service has no EnvironmentFile), no per-MCP env seed (gated on a pre-existing AionUi entry that no script creates). Works only on Path A (`/opt/livos/.env` holds a real `REDIS_URL`); breaks on Path B (`CHANGEME`) and on any non-`/opt/livos` install root.
- **Recommended fix is `EnvironmentFile=-/opt/livos/.env` on the committed `liv-assistant.service` unit** (one line, non-fatal `-` prefix, keeps the secret file-resident/per-install) — NOT the literal `redis-env.conf` drop-in, which would re-introduce the hardcoded-secret shape.
- These are recommendations for the future Phase 252 remediation backlog (251-09 will aggregate); no fixes applied here per D-251-READONLY.

## Deviations from Plan

None - plan executed exactly as written. Read-only audit; only the prescribed `findings/251-06-FINDINGS.md` was created; no `livos/`/`liv/`/`scripts/` edits. The `[sacred-sha] PASS: 20 files verified` pre-commit hook confirmed D-V44-SACRED held trivially (no source touched).

## Issues Encountered
- One RESEARCH lead was corrected by evidence: RESEARCH claimed `factory-reset.sh:193,243` DELETES `livos.service.d`; the current `factory-reset.sh` contains no `service.d`/`redis-env` reference at all (grep = 0 matches). Documented the drop-in as purely live-only with no installer touchpoint whatsoever.
- `.planning/STATE.md` and `.planning/ROADMAP.md` exceed the 256KB read cap; updated via targeted Grep + Edit rather than a full read, matching the 251-05 executor's approach.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- One of the eight Wave-1 findings docs (251-01..06 now complete) feeding the Wave-2 synthesis (251-09).
- This dimension's GAP/RISK items for the 251-09 `REMEDIATION-BACKLOG.md`: (1) `liv-assistant.service` lacks `EnvironmentFile`/Redis env — luse children inherit nothing [NEW-this-session class, HIGH, fix = 1-line `EnvironmentFile=-`]; (2) AionUi luse MCP first-create ("Phase 241 seed") exists in no shell script → `update.sh:725` patch is a no-op on a clean box [GAP, MEDIUM]; (3) luse Redis delivery relies solely on the `/opt/livos/.env` fallback → breaks on Path B `CHANGEME` and non-`/opt/livos` roots [HIGH, ties to 251-01/251-08]; (4) `redis-env.conf` drop-in is a live-only artifact reproduced by no installer [GAP to encode, LOW once #1 lands].

## Self-Check: PASSED
- FOUND: `.planning/phases/251-fresh-install-portability-audit/findings/251-06-FINDINGS.md` (133 lines, exceeds 40 min-lines)
- FOUND commit: `2c31d5bb`

---
*Phase: 251-fresh-install-portability-audit*
*Completed: 2026-05-29*
