---
phase: 286-app-install-end-to-end-fix
plan: 04
subsystem: apps / caddy-reachability
tags: [caddy, reachability, p-retry, port-verification, docker-network, SC6]
requires: [286-01, 286-03]
provides:
  - registerAppSubdomain retried (pRetry, 3 retries) + surfaced loudly at the install call site
  - published-host-port vs manifest.port verification (logged on mismatch)
  - narrowed docker network create catch (tolerate "already exists", surface/throw the rest)
affects:
  - livos/packages/livinityd/source/modules/apps/apps.ts
  - livos/packages/livinityd/source/modules/apps/legacy-compat/app-environment.ts
tech-stack:
  added: []
  patterns:
    - "p-retry around the Caddy register call site (bounded retries:3, onFailedAttempt logs, final catch surfaces loudly without hard-failing the install)"
    - "compose host-port parsing reusing app.ts main-service-resolution + host:container split rule"
    - "narrowed bare-catch: regex-classify error.stderr/message, tolerate benign races, console.error + rethrow real failures"
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/apps/apps.ts
    - livos/packages/livinityd/source/modules/apps/legacy-compat/app-environment.ts
decisions:
  - "No reportInstallEvent on subdomain-register failure — its signature is (appId, action:'install'|'uninstall'); a new event value would be a tsc type error breaking the 305 baseline. Loud logger.error is the SC6 operator-visibility mechanism."
  - "Port mismatch is LOGGED, not auto-rewritten — the compose is authoritative (catalog composes carry explicit 41xxx mappings)."
  - "network-create non-benign failure rethrows so the broken shared network is not masked; benign 'already exists'/'in use' tolerated. Used console.error (file has no this.logger; standalone function)."
metrics:
  duration: ~15m
  completed: 2026-06-18
  tasks: 2
  files: 2
---

# Phase 286 Plan 04: Caddy/Reachability Hardening (SC6) Summary

Hardened the install→reachability pipeline so a healthy container is actually reachable: `registerAppSubdomain` at the install call site is now wrapped in `pRetry` (3 retries, per-attempt logging) and a final failure is surfaced loudly instead of silently swallowed (which previously dropped the Caddy block → subdomain 404 on a healthy container); the published host port is verified against `manifest.port` (the value Caddy reverse_proxies to) and a mismatch is logged; and the `docker network create livinity_main_network` bare-catch in `legacy-compat/app-environment.ts` is narrowed so a real create failure is logged + rethrown while the benign "already exists" race is still tolerated.

## Tasks Completed

### Task 1: Retry + surface registerAppSubdomain at the install call site + port-match verification (apps.ts)
- Confirmed `import pRetry from 'p-retry'` already present (apps.ts:8) — no import added.
- Replaced the install-site Caddy register block (was apps.ts:827-836) with:
  - A **port-match verification** block inserted BEFORE the register block (apps.ts ~827-854): reads `app.readCompose()`, resolves the main service via the same rule app.ts uses (`appId|server|app|web` → first non-infra → first), parses host ports from each `host:container` mapping (strips `/udp`/`/tcp`, takes the second-to-last `:`-segment), and `logger.error`s `port mismatch for ${appId}` when none of the published host ports equals `manifest.port`. Wrapped in its own try/catch so a parse failure never breaks install.
  - A **retried + surfaced** register block (apps.ts ~856-886): `await pRetry(() => this.registerAppSubdomain(...), { retries: 3, onFailedAttempt: logs attempt/retriesLeft })`; final catch logs `subdomain registration FAILED for ${appId} after retries` loudly and does NOT hard-fail the install (data + container intact; boot regen/reapply can recover). No `reportInstallEvent` call (would be a tsc type error per the plan note).

### Task 2: Narrow the appEnvironment network-create bare-catch (app-environment.ts)
- Replaced the bare `catch {}` (was app-environment.ts:43-47) with `catch (error: any)`: builds `msg` from `error?.stderr || error?.message || error`; tolerates `/already exists|being used|in use/i`; otherwise `console.error('[app-environment] docker network create FAILED (non-benign): ...')` and **rethrows** so a broken shared network is surfaced (every app's `external: livinity_main_network` attach depends on it).
- The `--remove-orphans` compose-up block (app-environment.ts ~64-70) left UNCHANGED — its tolerant empty catch is correct (networks-only compose legitimately exits non-zero with "no service selected").
- Used `console.error` (the file is a standalone function with no `this.logger`).

## Verification

- **tsc baseline:** 305 before edits → **305 after edits** (≤ 305 ✅, zero new errors). The 3 errors tsc reports for apps.ts (lines 193/194/256) are pre-existing baseline errors in the unrelated binary-copy / cleanDockerState code (Wave-1/2 region), confirmed by reading those lines — they are NOT in this plan's edit regions (apps.ts ~827-886).
- **Acceptance-criteria greps (all match):**
  - `import pRetry from 'p-retry'` → apps.ts:8
  - `pRetry(() => this.registerAppSubdomain` → apps.ts:864
  - `subdomain registration FAILED` → apps.ts:883
  - `port mismatch for` → apps.ts:849
  - `already exists` → app-environment.ts:46,51
  - `network create FAILED` → app-environment.ts:55
  - non-benign branch `throw error` → app-environment.ts:56
  - `--remove-orphans` compose-up block unchanged ✅
- **Tests:**
  - `builtin-precedence.test.ts` (6) + `reconcile-volume-ownership.test.ts` (18) → **24/24 passed** (neighboring Wave-1/2 modules, confirm no regression).
  - `apps.integration.test.ts` → 32 tests SKIPPED, 1 environment error (`ENOENT /var/run/dbus/system_bus_socket`) — Docker/dbus unavailable in the Windows sandbox; NOT a logic failure from this change.

## Deviations from Plan

None — both tasks executed exactly as written. The plan's stale line numbers (Waves 1+2 shifted them) were resolved by grepping for the real anchors (`registerAppSubdomain`, `rebuildCaddyFromState`, `docker network create`) and editing via exact-string match, as instructed. `app.ts`, `reconcile-volume-ownership.ts`, `builtin-precedence.ts` were NOT touched.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: livos/packages/livinityd/source/modules/apps/apps.ts (modified, all greps match)
- FOUND: livos/packages/livinityd/source/modules/apps/legacy-compat/app-environment.ts (modified, all greps match)
- tsc error count = 305 (≤ baseline 305)
- Changes left uncommitted per task constraint.
