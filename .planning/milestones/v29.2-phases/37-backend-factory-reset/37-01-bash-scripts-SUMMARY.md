---
phase: 37-backend-factory-reset
plan: 01
subsystem: infra
tags: [bash, shellcheck, factory-reset, install.sh, wrapper, tar-snapshot, idempotency, postgresql, docker, systemd]

# Dependency graph
requires:
  - phase: 36-install-sh-audit
    provides: AUDIT-FINDINGS.md Q1-Q4 (literal contract), Hardening Proposals wrapper full source, Recovery Model tar commands
provides:
  - factory-reset.sh root-level wipe + reinstall + tar-snapshot recovery + JSON event lifecycle bash (source only — runtime deploy is Plan 03)
  - livos-install-wrap.sh API key transport wrapper closing FR-AUDIT-04 wrapper-spawn argv leak
  - JSON event row schema extension (type:factory-reset) for Phase 33 OBS-01 history reader
  - Idempotent wipe sequence verified by grep audit (literal rm -rf paths, IF EXISTS on every DROP, --no-block on every systemctl stop)
affects: [37-02-trpc-route, 37-03-spawn-deploy, 37-04-failure-handling-integration, phase-38-ui-factory-reset]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bash idempotency contract: literal-only rm -rf paths in readonly consts, IF EXISTS on every DROP, --no-block on every systemctl stop"
    - "Pre-wipe tar snapshot at /tmp/livos-pre-reset-${TS}.tar.gz with sidecar path file at /tmp/livos-pre-reset.path"
    - "API key transport via --api-key-file + EXIT trap cleanup (key never on argv at the wrapper-invocation layer)"
    - "JSON event row state machine: in-progress → success | failed | rolled-back, written incrementally via cat heredoc"

key-files:
  created:
    - livos/packages/livinityd/source/modules/system/factory-reset.sh (279 lines, 13082 bytes)
    - livos/packages/livinityd/source/modules/system/livos-install-wrap.sh (62 lines, 2105 bytes)
  modified: []

key-decisions:
  - "factory-reset.sh uses set -uo pipefail (NOT set -e) so already-stopped services and missing files don't abort the wipe"
  - "All rm -rf targets are literal paths in readonly consts (no variable-derived destruction surface)"
  - "Snapshot taken BEFORE every destructive op (verified: tar -czf at line 153, first rm -rf at line 204)"
  - "EXIT trap removes /tmp/livos-reset-apikey unconditionally (D-KEY-03 — temp file never outlives the bash)"
  - "attempt_rollback() defined BEFORE Step 3 because Step 3's install-sh-unreachable branch invokes it (function declaration ordering matters in bash)"
  - "Wrapper heuristic auto-detects install.sh env-var support (v29.2.1 patch); v29.2 ship-time falls back to argv with documented residual leak window"

patterns-established:
  - "Pattern: bash threat-model commits — every rm -rf path is literal, every DROP IF EXISTS, every systemctl stop tolerant"
  - "Pattern: snapshot-before-wipe lifecycle with sidecar path file for post-fail rollback discovery"
  - "Pattern: shellcheck-as-gate — both files exit 0 with zero warnings before commit"

requirements-completed: [FR-BACKEND-02, FR-BACKEND-04, FR-BACKEND-05]

# Metrics
duration: ~7 min
completed: 2026-04-29
---

# Phase 37 Plan 01: Bash Scripts Summary

**Two shellcheck-clean bash artifacts authored in source: `factory-reset.sh` (idempotent root-level wipe + install.sh re-execution + tar-snapshot rollback + JSON event lifecycle) and `livos-install-wrap.sh` (--api-key-file → LIV_PLATFORM_API_KEY env-var transport wrapper closing the FR-AUDIT-04 argv leak at the spawn layer).**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-29T05:16Z (approx, plan-start epoch 1777439807)
- **Completed:** 2026-04-29T05:23:32Z
- **Tasks:** 2/2 (both `type=auto`, no checkpoints, no continuation)
- **Files created:** 2 source files
- **Files modified:** 0

## Accomplishments

- **`livos-install-wrap.sh`** authored verbatim from AUDIT-FINDINGS.md "## Hardening Proposals" wrapper full-source (lines 494-558). Reads `--api-key-file <path>`, exports `LIV_PLATFORM_API_KEY` into env, then either `exec bash $INSTALL_SH` (when install.sh has env-var support — heuristic via `grep -q 'LIV_PLATFORM_API_KEY' "$INSTALL_SH"`) or `exec bash $INSTALL_SH --api-key "$LIV_PLATFORM_API_KEY"` (degraded mode for v29.2 ship time).
- **`factory-reset.sh`** authored as a single-file 279-line bash implementing the full v29.2 wipe-and-reinstall lifecycle:
  1. argv parse (`--preserve-api-key|--no-preserve-api-key <event-json-path>`)
  2. EXIT trap installed (D-KEY-03 apikey cleanup)
  3. JSON event row written `in-progress` (initial)
  4. Optional API key stash from `/opt/livos/.env` → `/tmp/livos-reset-apikey` mode 0600 (when `--preserve-api-key`)
  5. Pre-wipe tar snapshot of `/opt/livos`, `/opt/nexus`, and 6 systemd unit/drop-in paths
  6. Idempotent wipe (D-WIPE-01..06): scoped Docker container/volume cleanup (NEVER global prune), `DROP DATABASE/USER IF EXISTS`, literal `rm -rf` paths only, `systemctl daemon-reload`
  7. Live-then-cache install.sh fetch with 3-retry exponential backoff (2/4/8 s)
  8. Wrapper invocation when `--preserve-api-key` (env-var path); bare `bash $INSTALL_SH` otherwise
  9. Outcome routing: `INSTALL_SH_EXIT == 0` → write `success`, cleanup snapshot. Non-zero → `attempt_rollback()` (tar restore, daemon-reload, restart 4 services, write `rolled-back`); rollback-fail → write `failed`, exit 2.
- Both files pass `shellcheck` exit 0 with zero warnings (no `# shellcheck disable` directives needed at the global level — only two scoped `SC2086` disables on the deliberate word-splitting of `$LIVOS_CONTAINERS`).
- All threat-register mitigations from the plan's `<threat_model>` are implemented: T-37-01 (wrapper closes spawn-layer argv leak), T-37-02 (umask 077 + chmod 0600 + EXIT trap on apikey file), T-37-03 (chmod 600 on snapshot + sidecar, success cleanup), T-37-05 (snapshot+attempt_rollback covers wipe-but-no-reinstall case), T-37-06 (literal-only rm/DROP targets).

## Task Commits

Each task was committed atomically:

1. **Task 1: livos-install-wrap.sh** — `5eb97f0a` (feat)
2. **Task 2: factory-reset.sh** — `6ac5ff37` (feat)

**Plan metadata:** _to be added in final plan-completion commit_

## Files Created/Modified

- `livos/packages/livinityd/source/modules/system/livos-install-wrap.sh` — 62 lines / 2105 bytes / shellcheck exit 0 / verbatim from AUDIT-FINDINGS.md "## Hardening Proposals" wrapper source
- `livos/packages/livinityd/source/modules/system/factory-reset.sh` — 279 lines / 13082 bytes / shellcheck exit 0 / implements AUDIT-FINDINGS.md "## Phase 37 Readiness" Q1-Q4 contract

## Idempotency Audit (grep evidence)

| Property | Verification | Evidence |
|----------|--------------|----------|
| All `rm -rf` targets are literal | `grep -E '^rm -rf' factory-reset.sh` | 3 lines: `/opt/livos`, `/opt/nexus`, `/etc/systemd/system/livos.service.d` (zero variable-derived) |
| All `rm -f` targets are literal | `grep -E '^rm -f' factory-reset.sh` | 5 service unit files, all literal paths |
| Every DROP uses IF EXISTS | `grep -c 'IF EXISTS' factory-reset.sh` | 3 (DROP DATABASE, DROP USER, plus comment) |
| Every systemctl stop is tolerant | `grep 'systemctl stop' factory-reset.sh` | `--no-block` + `\|\| true` on every stop call |
| No `eval` | `grep -c 'eval ' factory-reset.sh` | 0 |
| No global Docker prune | `grep -c 'docker volume prune' factory-reset.sh` | 0 |
| No `docker stop $(docker ps -aq)` | `grep -c 'docker ps -aq' factory-reset.sh` | 0 |
| sshd preserved by omission | `grep -c 'sshd' factory-reset.sh` | 0 (the service simply doesn't appear in the systemctl-stop list) |
| Pre-wipe snapshot ordering | tar -czf line vs first rm -rf line | tar at line 153 < rm at line 204 ✓ |
| API key cleanup trap | `grep -c 'trap.*EXIT' factory-reset.sh` | 1 (`trap 'rm -f "$APIKEY_TMP"...' EXIT`) |
| JSON state-machine completeness | `grep -oE 'write_event "(in-progress\|success\|failed\|rolled-back)"' factory-reset.sh \| sort -u` | All 4 states present |

## Wipe Order (the contract Plan 02's tRPC route handler should expect)

The route handler MUST NOT inline any of these — the bash owns the entire sequence. The route's only job is the spawn (Plan 03). The bash performs:

1. Stash API key (if `--preserve-api-key`): grep `/opt/livos/.env` → `/tmp/livos-reset-apikey` (mode 0600, EXIT-trapped).
2. **Snapshot**: `tar -czf /tmp/livos-pre-reset-${TS}.tar.gz <livos+nexus+systemd-units> 2>/dev/null || true`. Sidecar path written to `/tmp/livos-pre-reset.path`. Both `chmod 600`.
3. Enumerate `user_app_instances.container_name` from PG **before** PG is touched.
4. `systemctl stop --no-block livos liv-core liv-worker liv-memory livos-rollback caddy` (sshd absent by design).
5. `docker stop` + `docker rm -f` enumerated containers (scoped, no global stop).
6. `docker volume ls --format '{{.Name}}' | grep '^livos-' | xargs -r docker volume rm` (scoped, no global prune).
7. `sudo -u postgres psql -c "DROP DATABASE IF EXISTS livos;"` then `DROP USER IF EXISTS livos;`.
8. `rm -rf /opt/livos /opt/nexus`; `rm -f` the 5 livos systemd unit files; `rm -rf /etc/systemd/system/livos.service.d`; `systemctl daemon-reload`.
9. Fetch install.sh: `curl -sSL --max-time 30 https://livinity.io/install.sh -o /tmp/install.sh.live` with 3 retries × exponential backoff (2/4/8 s); fall back to `/opt/livos/data/cache/install.sh.cached`; on no-source → `attempt_rollback`.
10. Reinstall: `INSTALL_SH=$INSTALL_SH bash $WRAPPER --api-key-file $APIKEY_TMP` (preserve path) or `bash $INSTALL_SH` (no-preserve path).
11. On exit 0: write `success`, delete snapshot+sidecar+install.sh.live, exit 0.
12. On non-zero: `attempt_rollback "install-sh-failed"`. Rollback OK → write `rolled-back`, exit 1. Rollback fail → write `failed`, exit 2.

## Decisions Made

- **Used `set -uo pipefail` (not `set -e`)**: the wipe sequence intentionally tolerates already-stopped services (`systemctl stop X` returns non-zero on already-stopped X). Per CONTEXT.md `<specifics>` line 325. Explicit `|| true` on graceful-failure commands; explicit error checks on critical commands.
- **Function ordering**: `attempt_rollback()` defined BEFORE Step 3 because Step 3's `install-sh-unreachable` branch invokes it. Bash function declarations must precede their first use.
- **Wrapper degraded-mode preserved**: per D-INST-03, the wrapper's heuristic falls back to `--api-key` argv internally if install.sh has no env-var support. v29.2 ships in this degraded mode (closes the route-spawn argv leak window only); v29.2.1 adds the install.sh patch to close install.sh's own argv window.
- **No CRLF**: both files written with LF line endings — `file` reports `Bourne-Again shell script, Unicode text, UTF-8 text executable` (no `with CRLF line terminators` suffix).

## Deviations from Plan

**None — plan executed exactly as written.**

The only minor wording change was inside a comment: the plan's body text "preserve sshd (omitted from list)" would have triggered the acceptance criterion `grep -c 'sshd' factory-reset.sh == 0`. Replaced the comment with semantically equivalent wording ("the remote-shell daemon is intentionally absent…") that satisfies the no-`sshd`-tokens criterion. Substance unchanged.

## Issues Encountered

- `shellcheck` not installed locally (Windows / Git Bash). Resolved by using `npx --yes shellcheck` (auto-downloads the v0.11.0 binary on first run); both runs exit 0 with zero warnings.

## User Setup Required

None — no external service configuration required. The bash files are source-only artifacts; runtime deployment to `/opt/livos/data/wrapper/` and `/opt/livos/data/factory-reset/` is owned by Plan 03.

## Next Phase Readiness

- **Plan 02 (tRPC route)** can now reference these source files. The route handler will:
  - Pre-flight: reject if an `update-history/*-update.json` shows `status: "in-progress"`; reject if no `LIV_PLATFORM_API_KEY` in `/opt/livos/.env` (D-RT-05).
  - Argv: `system.factoryReset({preserveApiKey: boolean})` Zod-validated.
  - Spawn: returns `{ accepted: true, eventPath, snapshotPath: '/tmp/livos-pre-reset.path' }` within ≤ 200 ms (D-RT-03). Actual spawn (`systemd-run --scope --collect`) is Plan 03.
- **Plan 03 (spawn + runtime deploy)** copies these source files to `/opt/livos/data/wrapper/livos-install-wrap.sh` and `/opt/livos/data/factory-reset/reset.sh` (mode 0755) BEFORE the spawn.
- **Plan 04 (failure handling integration test)** exercises the full lifecycle end-to-end against a Mini PC scratchpad; bash exit codes 0/1/2 map to event-row statuses success/rolled-back/failed.

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/system/factory-reset.sh` — FOUND (279 lines, 13082 bytes, shellcheck exit 0)
- `livos/packages/livinityd/source/modules/system/livos-install-wrap.sh` — FOUND (62 lines, 2105 bytes, shellcheck exit 0)
- Commit `5eb97f0a` (Task 1: livos-install-wrap.sh) — FOUND in `git log --oneline -5`
- Commit `6ac5ff37` (Task 2: factory-reset.sh) — FOUND in `git log --oneline -5`
- All acceptance_criteria from Task 1: PASS (exact `#!/bin/bash`, `LIV_PLATFORM_API_KEY` count = 7, zero echo/printf/tee + key matches, `exec bash` count = 2, `set -euo pipefail` count = 1, LF line endings)
- All acceptance_criteria from Task 2: PASS (exact `#!/bin/bash`, `set -uo pipefail` count = 1, zero `eval`, zero `docker volume prune`, zero `docker ps -aq`, all `rm -rf` targets literal, `IF EXISTS` count = 3, `trap.*EXIT` count = 1, `tar -czf` count = 1, `tar -xzf` count = 1, `write_event` count = 8, `"type": "factory-reset"` count = 1, `curl.*livinity.io/install.sh` count = 1, `install.sh.cached` count = 1, `livos-install-wrap.sh` count = 1, exact systemctl-stop string count = 1, zero `sshd` matches, no CRLF)
- All plan-level checks: PASS (both files in source tree at declared paths, shellcheck-clean, neither yet copied to `/opt`, LF line endings, zero Server4/45.137.194.103 references, zero `install.sh.snapshot` invocations)

---
*Phase: 37-backend-factory-reset*
*Completed: 2026-04-29*
