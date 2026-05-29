---
phase: 251-fresh-install-portability-audit
plan: 01
subsystem: computer-use / luse MCP / installer
tags: [audit, read-only, redis, luse, portability, fresh-install]
requires: []
provides: "Findings on luse Redis-URL resolution portability (resolveLuseRedisUrl fallback chain × install paths)"
affects: []
tech-stack:
  added: []
  patterns: ["read-only evidence-backed audit (D-251-EVIDENCE)"]
key-files:
  created:
    - .planning/phases/251-fresh-install-portability-audit/findings/251-01-FINDINGS.md
  modified: []
decisions:
  - "Path-A fresh install COVERED for luse Redis URL via two independent paths (seed.ts env-thread + /opt/livos/.env fallback)"
  - "RESEARCH preliminary 'GAP for liv-assistant first-create' is CORRECTED: mcp-registrar/seed.ts DOES first-create the AionUi luse entry and transform.ts:31 threads the env block"
  - "Path-B fresh install is GAP (pre-existing CHANGEME placeholder, not caused by Luse feature)"
  - "server.ts:124 hardcoded /opt/livos fallback array is NEW-THIS-SESSION RISK (works today, breaks on non-/opt/livos root)"
metrics:
  duration: "~12 min"
  completed: 2026-05-29
---

# Phase 251 Plan 01: Luse Redis-URL Resolution Audit Summary

Read-only audit confirming that on a canonical (Path-A) fresh install the luse MCP obtains a working Redis
URL with zero manual steps via two independent paths, correcting the RESEARCH preliminary first-create GAP,
and flagging one NEW-THIS-SESSION hardcoded-root RISK plus the pre-existing Path-B CHANGEME GAP.

## What Was Done

- **Task 1 — runtime resolution chain (committed `a7a5097d`):** Verified `resolveLuseRedisUrl()`
  (`server.ts:113-139`) precedence (`LUSE_REDIS_URL` → `REDIS_URL` → env-file fallback), quoted the literal
  fallback array `['/opt/livos/.env','/opt/livos/livos/.env']` (`server.ts:124`) and the extraction regex
  `/^REDIS_URL=(.+)$/m` (`server.ts:133`), confirmed production passes NO override (`server.ts:178`), and
  documented the fail-closed chain (`redis=null` → no `displayManager` → 4 display tools + `create_stream`
  deny).
- **Task 2 — install-side coverage:** Mapped each resolution source to Path A vs Path B with script:line
  evidence. Found Path A writes a REAL `REDIS_URL` (`deploy-livinityd.sh:988`) and seeds the luse entry with
  a substituted real `LUSE_REDIS_URL` (`mcp-servers.json:177` → `deploy-livinityd.sh:1138,1181`), Path B
  writes a CHANGEME placeholder (`env-seed.sh:69`) and never seeds `liv:mcp:config`.
- Discovered the **Phase 241 seed** (`mcp-registrar/seed.ts` + `transform.ts:31`) first-creates the AionUi
  luse entry carrying the full env block — correcting the RESEARCH preliminary "GAP for liv-assistant
  first-create."
- Confirmed `liv-assistant.service` has NO `REDIS_URL`/`EnvironmentFile` (`:8-31`) and the live-box
  `redis-env.conf` drop-in exists nowhere in repo/scripts.

## Key Findings (verdicts)

- **Path A: COVERED** — luse gets a working Redis URL via (1) seeded AionUi entry env-thread and (2)
  `/opt/livos/.env` fallback; zero manual steps.
- **Path B: GAP** — CHANGEME placeholder + no `liv:mcp:config` seed → all three resolution sources empty/dead
  → fail-closed. Pre-existing, surfaced not caused by Luse. (Whether it matters depends on 251-08's
  `get.livinity.io`-target determination.)
- **`server.ts:124` fallback array: NEW-THIS-SESSION RISK** — literal `/opt/livos` root; not derived from
  `$LIVOS_ROOT`; silently breaks on a relocated install root.

## Portable Fix Recommendations (for 251-09 backlog)

1. Derive `server.ts:124` fallback path from `$LIVOS_ROOT` (medium).
2. Make Path-B `env-seed.sh` write a real Redis password + seed `liv:mcp:config` (high; cross-ref 251-06/08).
3. Add `EnvironmentFile=-/opt/livos/.env` to `liv-assistant.service` as defense-in-depth (low; makes the
   live-only `redis-env.conf` drop-in reproducible-by-install).

## Deviations from Plan

None — plan executed exactly as written. Read-only audit; the ONLY file created is the findings doc under the
phase directory (D-251-READONLY satisfied). No source modified; sacred SHA preserved (commit hook PASS:
20 files verified). One substantive analytical result differs from the RESEARCH seed (the liv-assistant
first-create GAP is corrected to COVERED on Path A) — documented with evidence, not a process deviation.

## Self-Check: PASSED

- FOUND: `.planning/phases/251-fresh-install-portability-audit/findings/251-01-FINDINGS.md` (160 lines > 40 min)
- FOUND: commit `a7a5097d` `docs(251-01): luse Redis-URL resolution audit findings`
