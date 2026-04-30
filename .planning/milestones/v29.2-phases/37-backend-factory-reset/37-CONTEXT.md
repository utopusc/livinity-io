# Phase 37: Backend Factory Reset — Context

**Gathered:** 2026-04-29
**Status:** Ready for planning
**Source:** ROADMAP.md success criteria + REQUIREMENTS.md (FR-BACKEND-01..07) + Phase 36 AUDIT-FINDINGS.md (the technical input gate) — synthesized as locked decisions (skip-discuss config + audit-driven phase)
**Milestone:** v29.2 Factory Reset (mini-milestone)
**Depends on:** Phase 36 (consumes AUDIT-FINDINGS.md verbatim)

<domain>
## Phase Boundary

This phase ships the **backend half** of the factory reset feature:

1. A `system.factoryReset({preserveApiKey: boolean})` tRPC mutation in `livos/packages/livinityd/source/modules/system/`
2. A bash wipe+reinstall script that runs as root in a `systemd-run --scope --collect` cgroup-escaped transient unit
3. A wrapper script (`livos-install-wrap.sh`) that takes the API key via `--api-key-file` and execs install.sh with the key in the environment (NOT argv) — closes FR-AUDIT-04 leak
4. JSON event emission to `/opt/livos/data/update-history/<ts>-factory-reset.json` extending Phase 33 schema
5. install.sh failure handling (401, transient 5xx, generic non-zero exit) with retry semantics

**Out of scope:** the UI button + modal + progress overlay (Phase 38). The route returns a 202-equivalent immediately; UI polls the JSON event row for progress.

**Audit gate (D-10) governs this phase:** The four "Phase 37 Readiness" answers in `.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md` are the literal bash commands and mechanism this phase must implement. The plans MUST cite those answers directly — no re-deriving, no improvisation.

**Target host:** Mini PC (`bruce@10.69.31.68`) is the only LivOS deployment. All deploy/test paths target this host. **Server4 is OFF-LIMITS** per project memory hard rule (2026-04-27). Server5 is the relay only — no LivOS install there.

</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Phase 36 audit findings (THE INPUT GATE — D-AUD-* refs)

**D-AUD-01 (LOCKED):** install.sh is **NOT-IDEMPOTENT** (per AUDIT-FINDINGS.md "## Idempotency Verdict"). Plans MUST include the full wipe sequence — running install.sh twice without an intervening wipe produces a broken host (PG CREATE USER fails on 2nd run, etc.). 4 critical NOT-IDEMPOTENT commands cited: `generate_secrets` (line:861), JWT secret-file write (line:1086), `redis-cli FLUSHALL` (line:1125), PG CREATE USER guard mismatch (line:1136-1137).

**D-AUD-02 (LOCKED):** install.sh accepts the API key **only via argv `--api-key <value>`** (line:14 of snapshot). This leaks via `ps`. Plans MUST use the wrapper-based env-var transport from AUDIT-FINDINGS.md "## Hardening Proposals":
```bash
# Wrapper transport (v29.2 production):
bash /opt/livos/data/wrapper/livos-install-wrap.sh --api-key-file /tmp/livos-reset-apikey
# Internally the wrapper reads $(cat /tmp/livos-reset-apikey), exports it as LIV_PLATFORM_API_KEY, and execs install.sh with shebang+content (no argv).
```
The wrapper script itself is part of THIS phase's deliverables — it ships to `/opt/livos/data/wrapper/livos-install-wrap.sh` (mode 0755).

**D-AUD-03 (LOCKED):** Recovery model is **pre-wipe tar snapshot** (per AUDIT-FINDINGS.md "## Recovery Model"). Implementation:
```bash
# BEFORE any rm/dropdb/FLUSHALL:
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SNAPSHOT_PATH=/tmp/livos-pre-reset-${TIMESTAMP}.tar.gz
tar -czf "$SNAPSHOT_PATH" /opt/livos /opt/nexus /etc/systemd/system/livos.service /etc/systemd/system/liv-*.service /etc/systemd/system/livos.service.d 2>/dev/null || true
echo "$SNAPSHOT_PATH" > /tmp/livos-pre-reset.path

# IF reinstall fails:
SNAPSHOT_PATH=$(cat /tmp/livos-pre-reset.path)
tar -xzf "$SNAPSHOT_PATH" -C /
systemctl daemon-reload
systemctl restart livos liv-core liv-worker liv-memory

# IF reinstall succeeds:
rm -f "$SNAPSHOT_PATH" /tmp/livos-pre-reset.path
```

**D-AUD-04 (LOCKED):** Server5 fallback is **cached install.sh on Mini PC** at `/opt/livos/data/cache/install.sh.cached`. Live URL is preferred; cache is fallback. v29.2 implementation:
- The wipe+reinstall script tries `curl -sSL https://livinity.io/install.sh -o /tmp/install.sh.live` first
- If curl exits non-zero OR HTTP code is not 2xx after 3 retries with exponential backoff, fall back to `cat /opt/livos/data/cache/install.sh.cached > /tmp/install.sh.live`
- If neither live nor cached version is available: write event row with `error: "install-sh-unreachable"` and abort (no rollback needed since wipe hasn't run yet)
- **Cache population is out of scope for v29.2** — that's a future update.sh patch (deferred to v29.2.1 or later). v29.2 only consumes the cache; if it's empty (fresh install), live URL is the only path.

**D-AUD-05 (LOCKED):** Phase 37 Readiness Q1-Q4 from AUDIT-FINDINGS.md are the LITERAL implementation contract. The route's reset bash MUST match Q1's reinstall command, Q2's recovery action, Q3's NOT-IDEMPOTENT-aware wipe, and Q4's transport mechanism. Any deviation requires updating AUDIT-FINDINGS.md first (which would re-open Phase 36).

### tRPC route surface (FR-BACKEND-01)

**D-RT-01 (LOCKED):** Route signature: `system.factoryReset({preserveApiKey: boolean})` — Zod-validated input, returns `{ accepted: true, eventPath: string, snapshotPath: string }` or throws.

**D-RT-02 (LOCKED):** Route MUST be added to `httpOnlyPaths` in `livos/packages/livinityd/source/modules/trpc/common.ts` (mirror `system.update` precedent). Without this, the long-running mutation rides the WebSocket and hangs.

**D-RT-03 (LOCKED):** Route returns within **200ms** (verified via curl + wall-clock). The actual wipe+reinstall is a **detached** subprocess spawn — `systemd-run --scope --collect` returns immediately and the script runs in a separate transient cgroup.

**D-RT-04 (LOCKED):** Auth: route is `adminProcedure` only. RBAC check happens before the spawn. Non-admin → 403.

**D-RT-05 (LOCKED):** Pre-flight check inside the mutation handler (BEFORE spawning the bash):
- Reject if `update-history/*-update.json` exists with `status: "in-progress"` (an update is running)
- Reject if `LIV_PLATFORM_API_KEY` is missing from `/opt/livos/.env` (no key to use)
- Both rejections throw a tRPC `BAD_REQUEST` with explanatory message
- Network reachability check is the UI's job (Phase 38), NOT the backend's

### Wipe procedure (FR-BACKEND-02)

**D-WIPE-01 (LOCKED):** Stop services in this exact order: `livos liv-core liv-worker liv-memory livos-rollback caddy`. Do NOT stop sshd. Use `systemctl stop --no-block` so the wipe doesn't wait on graceful shutdown timeouts.

**D-WIPE-02 (LOCKED):** Docker container scoping — enumerate `user_app_instances` table BEFORE stopping PG. The list of LivOS-managed containers is `SELECT container_name FROM user_app_instances`. Then `docker stop $names` and `docker rm $names`. NEVER `docker stop $(docker ps -aq)` or `docker volume prune` without scoping (R6 mitigation).

**D-WIPE-03 (LOCKED):** Docker volume scoping — `docker volume ls --format '{{.Name}}' | grep '^livos-' | xargs -r docker volume rm` (LivOS volumes follow the `livos-*` naming convention). NEVER global `docker volume prune -f`.

**D-WIPE-04 (LOCKED):** Database wipe — after enumerating the user_app_instances table:
```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS livos;"
sudo -u postgres psql -c "DROP USER IF EXISTS livos;"
```
The `IF EXISTS` makes the wipe idempotent (FR-BACKEND-02 idempotency requirement).

**D-WIPE-05 (LOCKED):** Filesystem wipe:
```bash
rm -rf /opt/livos /opt/nexus
rm -f /etc/systemd/system/livos.service /etc/systemd/system/liv-core.service /etc/systemd/system/liv-worker.service /etc/systemd/system/liv-memory.service /etc/systemd/system/livos-rollback.service
rm -rf /etc/systemd/system/livos.service.d
systemctl daemon-reload
```

**D-WIPE-06 (LOCKED):** The wipe is idempotent. Running it twice produces no errors. Every command above is `IF EXISTS` / `-f` / handles missing-target gracefully. Plans MUST verify this — a plan that uses `rm /opt/livos` (without `-rf`) is a defect.

### API key preservation (FR-BACKEND-03)

**D-KEY-01 (LOCKED):** Stash sequence (preserveApiKey=true):
```bash
# BEFORE rm -rf /opt/livos:
LIV_API_KEY=$(grep '^LIV_PLATFORM_API_KEY=' /opt/livos/.env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
echo -n "$LIV_API_KEY" > /tmp/livos-reset-apikey
chmod 0600 /tmp/livos-reset-apikey
```

**D-KEY-02 (LOCKED):** preserveApiKey=false skips the stash entirely. install.sh is invoked WITHOUT --api-key-file → install.sh prompts for a fresh key at first boot of the new livinityd. Phase 38 redirects to /onboarding in this case.

**D-KEY-03 (LOCKED):** Cleanup (always, even on failure):
```bash
trap 'rm -f /tmp/livos-reset-apikey 2>/dev/null' EXIT
```
The temp file MUST NOT outlive the bash script. If the wrapper script fails and exits, the trap cleans it up.

### install.sh re-execution (FR-BACKEND-04)

**D-INST-01 (LOCKED):** Re-execution sequence (post-wipe):
```bash
# Try live URL first:
RETRIES=0
INSTALL_SH=""
while [ $RETRIES -lt 3 ]; do
  if curl -sSL --max-time 30 https://livinity.io/install.sh -o /tmp/install.sh.live; then
    INSTALL_SH=/tmp/install.sh.live
    break
  fi
  RETRIES=$((RETRIES + 1))
  sleep $((2 ** RETRIES))  # exponential backoff: 2, 4, 8 seconds
done

# Fall back to cache if live failed:
if [ -z "$INSTALL_SH" ] && [ -f /opt/livos/data/cache/install.sh.cached ]; then
  cp /opt/livos/data/cache/install.sh.cached /tmp/install.sh.live
  INSTALL_SH=/tmp/install.sh.live
fi

# Hard fail if neither:
if [ -z "$INSTALL_SH" ]; then
  echo '{"status":"failed","error":"install-sh-unreachable"}' >> "$EVENT_PATH"
  exit 1
fi

# Invoke via wrapper for env-var transport:
if [ "$PRESERVE_API_KEY" = "true" ]; then
  INSTALL_SH=$INSTALL_SH bash /opt/livos/data/wrapper/livos-install-wrap.sh --api-key-file /tmp/livos-reset-apikey
else
  INSTALL_SH=$INSTALL_SH bash /opt/livos/data/wrapper/livos-install-wrap.sh
fi
INSTALL_EXIT=$?
```

**D-INST-02 (LOCKED):** **The wrapper itself is also a deliverable of this phase.** Spec from AUDIT-FINDINGS.md:
```bash
#!/bin/bash
# /opt/livos/data/wrapper/livos-install-wrap.sh
# Reads --api-key-file argument, sets LIV_PLATFORM_API_KEY env var, execs install.sh.
# Closes FR-AUDIT-04 argv-leak by passing the key via env, not argv.
set -euo pipefail
API_KEY=""
if [ "${1:-}" = "--api-key-file" ] && [ -r "${2:-}" ]; then
  API_KEY=$(cat "$2")
fi
INSTALL_SH=${INSTALL_SH:-/tmp/install.sh.live}
[ -r "$INSTALL_SH" ] || { echo "install.sh missing at $INSTALL_SH"; exit 2; }
if [ -n "$API_KEY" ]; then
  LIV_PLATFORM_API_KEY="$API_KEY" bash "$INSTALL_SH"
else
  bash "$INSTALL_SH"
fi
```
**This is checked into a real production path — `/opt/livos/data/wrapper/livos-install-wrap.sh`.** The reset script copies it from the source tree (path TBD by planner; likely `livos/packages/livinityd/source/modules/system/livos-install-wrap.sh`) to `/opt/livos/data/wrapper/` BEFORE the wipe step (cache it across the wipe).

**D-INST-03 (LOCKED):** install.sh's argv-only API key parsing IS NOT modified in this phase. The env-var fallback patch (5-line diff in AUDIT-FINDINGS.md "## Hardening Proposals") is **deferred to v29.2.1**. v29.2 ships with the wrapper as the sole transport mechanism. Note that the wrapper passes the key via env-var; install.sh as it is today does NOT read `LIV_PLATFORM_API_KEY` from env and so the wrapper's env-var export is currently a no-op until install.sh is patched. **The wrapper transport is therefore degraded in v29.2 — the actual transport is whatever install.sh accepts (likely it would be invoked with --api-key argv inside the wrapper as a fallback). The full env-var hardening lands in v29.2.1.**

Resolution: The wrapper for v29.2 falls back to argv, but ON THE WRAPPER'S OWN COMMAND LINE — not on Phase 37's `systemd-run` invocation. So `ps` shows `bash livos-install-wrap.sh --api-key-file /tmp/livos-reset-apikey` (no key value). The wrapper internally does `bash $INSTALL_SH --api-key "$API_KEY"` which IS visible via `ps` for the duration install.sh runs. This is a partial fix; v29.2.1's install.sh env-var patch closes the remaining window.

Document this clearly in commit messages and SUMMARY: **v29.2 = wrapper-only fix (closes the route-spawn argv leak window). v29.2.1 = full env-var transport (closes install.sh's own argv window).**

### JSON event row (FR-BACKEND-05)

**D-EVT-01 (LOCKED):** Event path: `/opt/livos/data/update-history/<ISO_TIMESTAMP>-factory-reset.json` where `ISO_TIMESTAMP` is `date -u +%Y%m%dT%H%M%SZ` format (matching v29.0 Phase 33 OBS-01 schema).

**D-EVT-02 (LOCKED):** Schema (extends Phase 33 OBS-01):
```json
{
  "type": "factory-reset",
  "status": "in-progress | success | failed | rolled-back",
  "started_at": "<ISO timestamp>",
  "ended_at": "<ISO timestamp or null>",
  "preserveApiKey": true,
  "wipe_duration_ms": 12345,
  "reinstall_duration_ms": 67890,
  "install_sh_exit_code": 0,
  "install_sh_source": "live | cache",
  "snapshot_path": "/tmp/livos-pre-reset-...tar.gz",
  "error": null
}
```
The script writes the row at start (status=in-progress), updates status fields incrementally (after each phase), and writes the final status (success/failed/rolled-back) at completion.

**D-EVT-03 (LOCKED):** The "schema extension" is by ADDING the `factory-reset` type — Phase 33's existing `update` type events continue to work. The history reader in livinityd already handles arbitrary type fields; no reader code change is required (verify this in research — if reader is type-restricted, plan a small adjustment).

### cgroup-escape (FR-BACKEND-06)

**D-CG-01 (LOCKED):** v29.1 cgroup-escape pattern (per project memory `reference_cgroup_escape.md`): the wipe+reinstall bash MUST run inside a `systemd-run --scope --collect` transient unit so it survives `systemctl stop livos` mid-flight.

Concrete invocation from the tRPC route handler (TypeScript):
```typescript
// In the route handler, BEFORE returning:
const eventPath = `/opt/livos/data/update-history/${timestamp}-factory-reset.json`;
const child = spawn('systemd-run', [
  '--scope',
  '--collect',
  '--unit', `livos-factory-reset-${timestamp}`,
  '--quiet',
  'bash',
  '/opt/livos/data/factory-reset/reset.sh',  // path TBD by planner
  preserveApiKey ? '--preserve-api-key' : '--no-preserve-api-key',
  eventPath
], {
  detached: true,
  stdio: 'ignore'
});
child.unref();
return { accepted: true, eventPath, snapshotPath: '/tmp/livos-pre-reset.path' };
```

The `--collect` flag ensures the transient unit is auto-removed once the script exits — no leftover units in `systemctl list-units`.

**D-CG-02 (LOCKED):** Pre-route deployment: the reset.sh script must exist at `/opt/livos/data/factory-reset/reset.sh` BEFORE the route can be called. Either:
- (a) Ship it as a source file, copied to /opt during update.sh — but that means update.sh changes (out of scope), OR
- (b) The route copies the script from the source tree at first invocation (so it's deployed lazily).

Plans pick (b) for v29.2 — first-call cold-start is acceptable since reset is rare. Path: source `livos/packages/livinityd/source/modules/system/factory-reset.sh` → runtime `/opt/livos/data/factory-reset/reset.sh` (copied with mode 0755 during the route handler before the systemd-run spawn). The wrapper script gets the same treatment.

### install.sh failure handling (FR-BACKEND-07)

**D-ERR-01 (LOCKED):** install.sh exit code mapping to event row `error` field:
- `0` → `error: null`, `status: success`
- `401` from any curl-ish request inside install.sh → `error: "api-key-401"`, `status: failed`. (Detection: parse install.sh stdout/stderr for `HTTP/2 401` or similar; if not detectable, fall back to mapping any non-zero exit to a generic error and let the UI show generic message.)
- Server5 5xx after retry exhaustion → `error: "server5-unreachable"`, `status: failed`
- Generic non-zero exit → `error: "install-sh-failed"`, `status: failed`, with `install_sh_exit_code` populated.

**D-ERR-02 (LOCKED):** On any `status: failed`, the recovery action runs (D-AUD-03 tar restore). After successful recovery, the event row's status flips to `rolled-back`.

**D-ERR-03 (LOCKED):** Failure messages are PLAIN STRINGS (no nested error objects). The UI in Phase 38 reads these to show "API key invalid — log into livinity.io and re-issue" etc.

### Out-of-scope / Deferred

**D-DEF-01:** install.sh env-var fallback patch (5-line diff in AUDIT-FINDINGS.md) → v29.2.1.
**D-DEF-02:** install.sh ALTER USER patch (6-line diff in AUDIT-FINDINGS.md, idempotency improvement) → v29.2.1.
**D-DEF-03:** update.sh patch to populate `/opt/livos/data/cache/install.sh.cached` → v29.2.1 or later.
**D-DEF-04:** Backup-aware reset (auto-snapshot before wipe) → v30.0 Backup milestone.

### Claude's Discretion

- Exact file layout under `livos/packages/livinityd/source/modules/system/` (e.g., one big file vs. split into route + helper)
- Choice between `child_process.spawn` and equivalent (subject to existing project patterns — check `system.update` route)
- Test strategy: unit tests for the route handler vs. integration tests against a Mini PC scratchpad. v29.2 tests are integration-style — plans should leverage existing v29.0 test patterns.
- Whether `factory-reset.sh` is a single bash file or modular (helper functions). Single-file is simpler; modular is more testable. Planner picks based on existing v29.1 reset/update patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 36 audit deliverable (THE PRIMARY INPUT)
- `.planning/phases/36-install-sh-audit/AUDIT-FINDINGS.md` — Phase 37 Readiness Q1-Q4 are the literal contract. Hardening Proposals section has the wrapper spec verbatim. Recovery Model section has the tar+restore commands verbatim.
- `.planning/phases/36-install-sh-audit/install.sh.snapshot` — the script being wrapped (DO NOT EDIT this file in this phase; it's a frozen audit input)

### v29.2 milestone artifacts
- `.planning/ROADMAP.md` — Phase 37 success criteria (lines ~46–58) and Phase 38 dependency
- `.planning/REQUIREMENTS.md` — FR-BACKEND-01..07 verbatim (lines ~26–39)
- `.planning/STATE.md` — confirms milestone v29.2, current_phase 37 (after Phase 36 marked complete)

### v29.0 prior-art (REUSE THESE PATTERNS)
- `.planning/milestones/v29.0-phases/33-update-observability-surface/` — JSON event row schema in `/opt/livos/data/update-history/`. Read SUMMARY.md and PLAN.md to see the exact schema this phase extends.
- `.planning/milestones/v29.0-phases/32-pre-update-sanity-auto-rollback/` — auto-rollback pattern (transient cgroup scope) that this phase mirrors

### v29.1 prior-art (CGROUP ESCAPE PATTERN — CRITICAL)
- Project memory: `C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/reference_cgroup_escape.md` — explains the `systemd-run --scope --collect` pattern, why detached:true alone is insufficient, and the exact invocation
- The hot-patches mentioned in MEMORY.md ("Post v29.1 hot-patches (cgroup-escape, SIGPIPE survival, self-rsync)") are deployed on Mini PC; the source for these is in the same livinityd modules this phase touches — search for existing cgroup-escape usage in `livos/packages/livinityd/source/modules/system/` to find the precedent.

### Project memory (auto-loaded server topology hard rules)
- `C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/MEMORY.md`:
  - Mini PC (`bruce@10.69.31.68`) is the ONLY LivOS deployment that matters
  - **Server4 is OFF-LIMITS** — never reference, never plan against
  - Server5 (45.137.194.102) is the relay only; LivOS is NOT installed there
  - Cloudflare is DNS-only; `cloudflared` does not exist in the stack
  - Mini PC SSH: `ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68`
  - Mini PC code layout: `/opt/livos/packages/{livinityd,ui,config}/` and `/opt/nexus/packages/{core,worker,mcp-server,memory}/`
  - systemd services on Mini PC: `livos.service` (livinityd via tsx, port 8080), `liv-core.service`, `liv-worker.service`, `liv-memory.service`
  - Deployment is `bash /opt/livos/update.sh` — DO NOT use old `git pull + pm2 restart` flow

### tRPC pattern reference
- `livos/packages/livinityd/source/modules/trpc/common.ts` — `httpOnlyPaths` array. The `system.update` mutation precedent is the model for `system.factoryReset`. Read this file to understand the path-name convention.
- `livos/packages/livinityd/source/modules/system/` — existing system tRPC module. New factory-reset code lives in this directory.

### NOT canonical (do not consult)
- `.planning/milestones/v22.0-phases/` — archived, irrelevant to v29.2
- Any reference to Server4 — off-limits

</canonical_refs>

<specifics>
## Specific Ideas

- The route handler must **acknowledge fast (≤200ms)** so the UI can transition to the progress overlay immediately. Any pre-spawn validation that takes > 50ms is a defect; push slow checks into the bash script.

- The wipe script's `set -euo pipefail` should be carefully scoped — some commands legitimately may exit non-zero (e.g., `systemctl stop X` on already-stopped services) and the wipe must continue. Use `|| true` on graceful-failure commands; `set -e` only catches actual errors.

- The reinstall step writes its progress to the JSON event row in **chunks** so the UI can poll it. After each major step (wipe-services-stopped, wipe-docker-done, wipe-db-done, wipe-fs-done, fetch-install-sh-done, install-sh-running, install-sh-done) the script appends a status update.

- **Test strategy:** v29.2 tests are integration against the Mini PC. Write a test bash script that:
  1. SSHes to Mini PC
  2. Captures `journalctl -u livos -n 100` baseline
  3. Curls `system.factoryReset` mutation
  4. Polls the event row until status flips to `success` or `failed`
  5. Verifies new livinityd is up: `curl https://bruce.livinity.io/api/health`
  - This test is destructive — only run on disposable Mini PC scratchpad, NEVER on production data. Plans must call out that the integration test is opt-in only.

- **Code review surface:** Phase 37 introduces real bash-as-root code. Plans must include a security checklist: no `eval`, no `$(...)` with user input, all paths absolute, all `rm -rf` paths LITERAL (no variables), `psql` with `IF EXISTS` only.

</specifics>

<deferred>
## Deferred Ideas

- install.sh env-var patch (v29.2.1) — adds `LIV_PLATFORM_API_KEY` env-var fallback so wrapper transport works fully without argv at all
- install.sh ALTER USER patch (v29.2.1) — improves install.sh's own idempotency (PG CREATE → ALTER USER)
- update.sh patch to seed `/opt/livos/data/cache/install.sh.cached` (v29.2.1+)
- Backup-aware reset (v30.0)
- Multi-host orchestration (no plan — LivOS is single-host)

</deferred>

---

*Phase: 37-backend-factory-reset*
*Context gathered: 2026-04-29 via PRD-style express path (ROADMAP success criteria + REQUIREMENTS.md FR-BACKEND-01..07 + AUDIT-FINDINGS.md as locked decisions)*
