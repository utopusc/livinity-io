---
phase: 252-fresh-install-portability-remediation
plan: 04
subsystem: install-entrypoint
tags: [install, route.ts, env-seed, mcp-seed, openssl-rand, path-a, path-c, README, R9]

# Dependency graph
requires:
  - phase: 252-fresh-install-portability-remediation
    plan: 02
    provides: Wave-2 ordering (no code dependency)
  - phase: 252-fresh-install-portability-remediation
    plan: 03
    provides: GET-LIVINITY-IO-RESOLUTION.md — corrected entrypoint verdict that redefined the real R9 gap (livos/install.sh Path C lacks MCP seed)
  - phase: 251-fresh-install-portability-audit
    provides: 251-08 four-entrypoint analysis (A/B/C/D) + Path B CHANGEME / Path C no-MCP-seed findings
provides:
  - "route.ts clone-fallback now runs scripts/install.sh (Path A — seeds liv:mcp:config) instead of livos/install.sh (Path C); both primary fetch + fallback are Path A"
  - "env-seed.sh (Path B) writes openssl-rand DATABASE_URL + REDIS_URL secrets (was literal CHANGEME), logs none of them"
  - "README documents the canonical install entrypoint mapping (livinity.io/install.sh = Path A; get.livinity.io = legacy Path C)"
  - "livos/install.sh (Path C) now seeds liv:mcp:config (idempotent, fail-soft port of deploy-livinityd.sh:_dld_seed_mcp_servers) — EVERY public install entrypoint seeds the MCP catalog"
affects: [252-05 (R5/R6/R12 — loud empty-catalog + liv-assistant env), 252-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Port a Path-A install helper into the legacy Path-C self-contained installer, adapting for Path C's redis://:<pass>@ URL shape (vs Path A's redis://default:<pass>@) and for the repo-root seed file not being on disk (GitHub-raw fetch)"
    - "Unquoted heredoc + openssl rand -hex + unset to write real .env secrets without ever echoing them"

key-files:
  created:
    - .planning/phases/252-fresh-install-portability-remediation/252-04-SUMMARY.md
  modified:
    - platform/web/src/app/install.sh/route.ts
    - scripts/install/env-seed.sh
    - README.md
    - livos/install.sh

key-decisions:
  - "R9(2): route.ts fallback retargeted from livos/install.sh (Path C) to scripts/install.sh (Path A). Primary GitHub-raw fetch was already Path A; only the fallback diverged."
  - "R9(3): env-seed.sh CHANGEME → openssl rand -hex 24 for both DATABASE_URL + REDIS_URL. -hex chosen (URL-safe, no @:/ chars that would corrupt the connection URLs). umask 0177 during write, chmod 0640, chown bruce:bruce, unset after heredoc, never echoed."
  - "R9(1): README documents the CORRECTED dual-URL mapping from GET-LIVINITY-IO-RESOLUTION.md (livinity.io/install.sh = Path A primary; get.livinity.io = legacy Caddy 301 → Path C) rather than the plan's pre-correction canonical-intent text."
  - "EXTENSION (operator-approved, beyond plan's files_modified): ported _dld_seed_mcp_servers into livos/install.sh so the route.ts clone-fallback AND legacy get.livinity.io (both Path C) also seed liv:mcp:config. This is the real R9-part-1 closure identified in GET-LIVINITY-IO-RESOLUTION.md."

requirements-completed: [R9]

# Metrics
duration: ~20min
completed: 2026-05-29
---

# Phase 252 Plan 04: Install Path-A Pin + Secret Hardening + MCP-Seed Port (R9) Summary

**Every public LivOS install entrypoint now either runs Path A or, on the legacy Path-C paths, seeds `liv:mcp:config` itself — and Path B writes real `openssl rand` secrets instead of `CHANGEME`. The route.ts clone-fallback was retargeted from `livos/install.sh` (Path C, no MCP seed) to `scripts/install.sh` (Path A); `env-seed.sh` generates real DATABASE_URL + REDIS_URL secrets logging none; README documents the corrected `livinity.io/install.sh → Path A` mapping; and — per the operator-approved scope extension from GET-LIVINITY-IO-RESOLUTION.md — `_dld_seed_mcp_servers` was ported into `livos/install.sh` so the route.ts fallback and the legacy `get.livinity.io` URL no longer downgrade a fresh install to an empty MCP catalog.**

## Performance
- **Duration:** ~20 min
- **Tasks:** 4 (3 planned + 1 operator-approved extension)
- **Files modified:** 4 (route.ts, env-seed.sh, README.md, livos/install.sh)

## Accomplishments

### Task 1 — route.ts fallback → Path A (R9 part 2) — commit `4da83e75`
- `platform/web/src/app/install.sh/route.ts` fallback clone now `exec bash "$TMPDIR/livinity-io/scripts/install.sh"` (Path A — seeds `liv:mcp:config`) instead of `livos/install.sh` (Path C). Comment updated.
- The primary GitHub-raw fetch (:11-13) was already Path A — left unchanged. A transient GitHub-raw outage no longer silently downgrades the install to the no-MCP-seed path.
- GET routing primitive + export shape preserved (Next.js reserved-filename pitfall honored).
- Acceptance: `grep -c 'livos/install.sh'` → 0; fallback `scripts/install.sh" "$@"` present; `export async function GET(` intact; `npx tsc --noEmit -p platform/web` → no errors in route.ts.

### Task 2 — env-seed.sh openssl-rand secrets (R9 part 3) — commit `2640b926`
- Replaced the literal `CHANGEME` Postgres + Redis passwords with `openssl rand -hex 24` each.
- Switched the `<<'ENV'` quoted heredoc to an unquoted `<<ENV` so the generated secrets interpolate.
- `umask 0177` during write, `chmod 0640`, `chown bruce:bruce`, `unset _pg_pass _redis_pass` after the heredoc. No secret is ever `echo`/`info`/`warn`'d.
- Acceptance: `grep -q 'openssl rand'` ✓; `grep -c CHANGEME` → 0; secret-logged grep → 0; `unset` present ✓; `bash -n` clean.

### Task 3 — README entrypoint doc (R9 part 1) — commit `29c76f57`
- Added an "Install entrypoint" section near the existing `get.livinity.io` mention documenting: canonical command `curl -fsSL https://livinity.io/install.sh | sudo bash -s <key>` → Vercel route.ts shim → `scripts/install.sh` (Path A, seeds MCP, with a clone fallback to the same script); `get.livinity.io` = legacy Caddy 301 → `livos/install.sh` (Path C, now also seeds MCP after R9); Path B `/install.sh` writes openssl-rand secrets. Cross-references `GET-LIVINITY-IO-RESOLUTION.md`.
- Documented the CORRECTED verdict (per the plan's instruction to use Plan 03's confirmed mapping when it diverges from the pre-correction canonical intent).
- Acceptance: `Install entrypoint`, `scripts/install.sh`, `get.livinity.io` all present in README.

### Task 4 (EXTENSION) — port MCP seed into livos/install.sh — commit `098cdaea`
- Added `seed_mcp_servers()` inside `main()` of `livos/install.sh`, mirroring `scripts/install/deploy-livinityd.sh:_dld_seed_mcp_servers` (idempotent HASH gate, STRING→re-seed, fail-soft on every error path).
- Wired the call after `start_services` (Redis must be up): `seed_mcp_servers || warn "MCP seed skipped (non-critical)"`.
- `bash -n` clean; 14 `liv:mcp:config` references; function def + call grep = 1 each; `HSET liv:mcp:config` present.

## Deviations from Plan

### Approved Extension (NOT auto-applied — operator-delegated)

**1. [Operator-approved extension] Ported the MCP seed into `livos/install.sh`**
- **Why beyond plan:** the plan's `files_modified` listed only route.ts, env-seed.sh, README.md. `livos/install.sh` was added per the explicit operator delegation ("Both") and the corrected R9-part-1 finding in `GET-LIVINITY-IO-RESOLUTION.md`: Path C (`livos/install.sh`) seeds NO MCP config, and it is reachable via the route.ts clone-fallback AND the legacy `get.livinity.io` URL. Pinning route.ts alone (Task 1) does not fix anyone who hits the fallback or the legacy URL.
- **What was done:** added `seed_mcp_servers()` to `livos/install.sh` mirroring `_dld_seed_mcp_servers`, called after `start_services`.
- **Path-C adaptations vs the Path-A original (necessary, not cosmetic):**
  1. **Redis password shape** — Path C's `.env` is `redis://:<pass>@` (password-only) vs Path A's `redis://default:<pass>@`. The port uses the in-scope `$SECRET_REDIS` directly (set in `generate_secrets()`), with an `.env` REDIS_URL parse fallback that accepts both `redis://:` and `redis://default:` shapes for re-runs.
  2. **Seed file location** — `scripts/install/seeds/mcp-servers.json` lives in the repo ROOT, which `setup_repository` does NOT copy to `/opt/livos` or `/opt/liv`. The port fetches it from GitHub-raw (`raw.githubusercontent.com/.../scripts/install/seeds/mcp-servers.json`), fail-soft if unreachable (`info` + `return 0`). This keeps the canonical seed in one place rather than duplicating the ~260-line JSON inline.
  3. **API key** — uses the in-scope `$SECRET_API_KEY` (Path C's generated LIV_API_KEY) with an `.env` fallback.
- **Idempotency / fail-soft:** byte-for-byte the same contract as Path A — skip if `liv:mcp:config` is already a HASH; DEL+re-seed if it's a legacy STRING; `warn` + `return 0` on every error; verify `TYPE == hash` after HSET. The `|| warn` at the call site guarantees a seed failure never bricks the install.
- **Files modified:** `livos/install.sh`
- **Commit:** `098cdaea`

### Auto-fixed Issues
None — Rules 1-3 did not trigger; all four tasks executed cleanly.

## Verification
- route.ts: `grep -c 'livos/install.sh'` → 0; Path-A fallback present; `GET` export intact; platform/web tsc → no new errors in route.ts.
- env-seed.sh: `! grep -q CHANGEME` ✓; `grep -q 'openssl rand'` ✓; no secret logged; `unset` present; `bash -n` clean.
- README: `Install entrypoint` + `scripts/install.sh` + `get.livinity.io` all present.
- livos/install.sh: `bash -n` clean; `seed_mcp_servers()` def + call present; `HSET liv:mcp:config` present.
- Sacred blob SHA `f3538e1d…` preserved — `[sacred-sha] PASS: 20 files` on all four commits (no `sdk-agent-runner.ts` change).

## Notes
- Could not execute the python3 seed-row emitter locally (no python3 on the Windows dev host — "Python bulunamadı"). The function is fail-soft on missing python3 and its parser is byte-identical to the proven `deploy-livinityd.sh` version that runs on the Ubuntu 24.04 target; `bash -n` syntax check passed. The seed path is exercised on the next Mini PC `update.sh` / fresh install.
- NOT YET DEPLOYED to Mini PC — repo-side changes take effect on the next install / `update.sh`.
- Threat register T-252-10/11/12/13 all addressed: route.ts both paths → A (T-10); secrets openssl-rand + unquoted-heredoc + unset + chmod 0640 (T-11/12/13). No new threat surface introduced.

## Self-Check: PASSED
- All 4 modified files + the SUMMARY exist on disk (verified).
- All 4 task commits exist in git history: `4da83e75`, `2640b926`, `29c76f57`, `098cdaea`.
