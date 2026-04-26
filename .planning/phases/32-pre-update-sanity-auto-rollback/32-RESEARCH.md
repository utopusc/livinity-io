# Phase 32: Pre-Update Sanity & Auto-Rollback - Research

**Researched:** 2026-04-26
**Domain:** Bash deploy script preflight + systemd-driven auto-rollback on livinityd boot failure
**Confidence:** HIGH (systemd semantics verified against live source docs and a closed `not-a-bug` issue thread; bash precheck patterns are well-trodden)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
*All implementation choices at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss: true`. Decisions below are inherited from Phase 31 conventions and the success criteria embedded in the CONTEXT.*

**Inherited from Phase 31 (locked):**
- Idempotent SSH-applied patch script following Phase 30/31 pattern
- Single artifact at `.planning/phases/<phase-dir>/artifacts/<name>.sh` applies to BOTH Mini PC + Server4
- Backup-then-syntax-check-then-restore safety net (writes `/opt/livos/update.sh.pre-phase32` before changes; runs `bash -n` on patched output; restores on failure)
- `grep -qF` idempotency guards on every block insertion
- Fail-loud exit conventions (`PRECHECK-FAIL: <reason>`) match BUILD-01's `verify_build` error style

**Critical constraints (from CONTEXT success criteria):**
- Precheck MUST exit before any `git clone`/`rsync` — early-bail design
- Rollback MUST be systemd-level (not livinityd in-process) — works when livinityd can't start
- Recovery target: < 2 minutes from third crash to prior code running
- Rollback marker MUST land in `/opt/livos/data/update-history/` for Phase 33 to consume as `status:rolled-back`

**Phase 34 contract (locked):**
- Precheck error format `PRECHECK-FAIL: <reason>` is the exact string Phase 34's UX-01 toast surfaces
- Single-line, actionable, no ANSI codes — must round-trip through `system.update` tRPC mutation cleanly

### Claude's Discretion
- Exact systemd directives for the watchdog (Restart=, RestartMode=, StartLimit*, OnFailure=)
- Bash idioms for precheck guards (which curl flags, which df parsing form, etc.)
- Whether rollback logic lives in a separate `.sh` script vs inline in the `.service` unit
- Naming of intermediate state files (`.deployed-sha.previous`, `.rollback-attempted` etc.)
- Where/how `update.sh` writes the rollback-history JSON (Phase 33 consumes; format decided here)

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped. All other ideas surface during plan phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-01 (precheck guards) | `update.sh` runs sanity check before any state mutation: disk free > 2 GB on `/opt/livos`, write access on `/opt/livos`, `api.github.com/repos/utopusc/livinity-io` reachable. Any failure → fail-loud `PRECHECK-FAIL: <reason>` to stderr, exit non-zero, mutation `onError` carries the reason cleanly. | (1) `update.sh` already has a `# ── Pre-flight checks` step at line 30 — natural anchor. (2) `set -euo pipefail` at line 8 means any `[[ ]]`-negative will exit. (3) `update.ts:performUpdate` (lines 196-228) already strips ANSI via `stripAnsi()` and the `proc.stderr.on('data', ...)` handler echoes lines as `error` once execa's child returns non-zero. So as long as we exit BEFORE the long-running steps, the mutation throws and the error is the literal `PRECHECK-FAIL` message. |
| REL-02 (auto-rollback) | After 3 consecutive failed boots of livinityd within 5 min, automatically restore the previous known-good SHA without user intervention. Recovery completes in < 2 min from 3rd crash. UI sees rollback in next `Past Deploys` poll. | (1) Phase 30's `/opt/livos/.deployed-sha` is the hook for "current SHA"; we add `.deployed-sha.previous`. (2) systemd `OnFailure=` + `StartLimit*` is the documented pattern but has a CRITICAL Ubuntu 24.04 (systemd 255) gotcha — see Domain Background. (3) `update.sh` clones into `/tmp/livinity-update-$$` — same flow can be invoked by a rollback script with `git checkout <prev-sha>` after clone. (4) `/opt/livos/data/update-history/` is greenfield — Phase 32 creates it; Phase 33 consumes. |
</phase_requirements>

## Summary

Phase 32 layers two safety nets onto the deploy/runtime cycle established by Phases 30 and 31:

1. **Pre-flight gate (REL-01)** — `update.sh` grows a `precheck()` function that runs BEFORE any state-mutating step (`git clone`, `rsync`, `pnpm install`, `systemctl restart`). Three guards: disk free ≥ 2 GB on `/opt/livos`'s mount, `/opt/livos` is writable by root, and `api.github.com/repos/utopusc/livinity-io` returns HTTP 2xx within 5 s. Any failure prints `PRECHECK-FAIL: <reason>` to stderr and exits 1. The existing `# ── Pre-flight checks` block at line 30 is the natural anchor.

2. **Boot-watchdog (REL-02)** — `livos.service` gains a drop-in (`/etc/systemd/system/livos.service.d/auto-rollback.conf`) that adds `StartLimitIntervalSec=300`, `StartLimitBurst=3`, `RestartMode=direct`, and `OnFailure=livos-rollback.service`. A new oneshot unit `livos-rollback.service` invokes `/opt/livos/livos-rollback.sh`, which: reads `/opt/livos/.deployed-sha.previous`, re-clones GitHub at that SHA into `/tmp/livinity-rollback-$$`, runs the same rsync+build pipeline as `update.sh`, writes a `<timestamp>-rollback.json` marker into `/opt/livos/data/update-history/`, then restarts `livos liv-core liv-worker liv-memory`. A `/opt/livos/.rollback-attempted` lock file prevents rollback-of-rollback loops.

The non-obvious finding driving the design: **Ubuntu 24.04 ships systemd 255.4 [VERIFIED: Launchpad noble systemd], in which `OnFailure=` triggers on every restart cycle by default — not just when `StartLimitBurst` is hit** [CITED: github.com/systemd/systemd/issues/33710 close comment by maintainer YHNdnzj]. The fix is `RestartMode=direct` (added in systemd v254 [CITED: man systemd.service v255]), which causes auto-restarts to skip the failed/inactive states, leaving `OnFailure=` to fire only when the start limit is exhausted — exactly the semantics REL-02 needs. Without `RestartMode=direct`, the rollback service would fire on the FIRST crash, never giving the original code a chance to recover from a transient hiccup.

**Primary recommendation:** Mirror the Phase 31 patch-script architecture exactly. One artifact (`phase32-systemd-rollback-patch.sh`) installs three things on each host: (a) the new precheck block in `update.sh` plus the `record_previous_sha()` SHA-rotation; (b) the `livos.service` drop-in with `RestartMode=direct` + `StartLimitBurst=3`; (c) the new `livos-rollback.service` and `livos-rollback.sh` files. Idempotent re-runs detect markers and exit 0. Apply via `ssh <host> 'sudo bash -s' < phase32-systemd-rollback-patch.sh`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Precheck (disk / perms / network) | `update.sh` (bash, root) | — | Runs before livinityd is touched; livinityd can't gate its own update. Same tier as the existing `# ── Pre-flight checks` block. |
| Surface precheck error to UI | `update.ts:performUpdate` (already implemented) | — | execa's `proc.stderr.on('data')` already streams stderr; mutation already throws on non-zero exit. We just need the error string format to be parser-friendly (`PRECHECK-FAIL: <reason>`). |
| SHA rotation (`.deployed-sha` → `.deployed-sha.previous`) | `update.sh` (bash, root) | — | Atomic with the SHA write; livinityd writing it would race the build. |
| Crash detection | systemd (init system) | — | The whole point of REL-02 is that livinityd can't watchdog itself. systemd is the only process guaranteed to run when livinityd doesn't. |
| Rollback orchestration | `/opt/livos/livos-rollback.sh` (bash, root, invoked via `livos-rollback.service` oneshot) | — | Same reason as above — must run when livinityd is down. Bash because it mirrors update.sh's tooling and avoids re-implementing rsync/build orchestration. |
| Rollback history marker | `/opt/livos/livos-rollback.sh` writes `/opt/livos/data/update-history/<timestamp>-rollback.json` | livinityd reads it (Phase 33 OBS-02) | Filesystem is the lowest-common-denominator IPC between root-owned bash and the `livos`-or-root livinityd. JSON shape is the data contract Phase 33 consumes. |

## Domain Background

### systemd `Restart=` + `StartLimitIntervalSec` + `StartLimitBurst` interaction

[CITED: man systemd.service v255 + man systemd.unit v255]

- `Restart=on-failure` (already present on `livos.service`) makes systemd auto-restart the service when its main process exits non-zero (or is killed by an unclean signal).
- `StartLimitIntervalSec=N` and `StartLimitBurst=K` together say "if there are more than K start attempts within N seconds, stop trying and put the unit in `failed` state." These directives go in the **`[Unit]`** section, NOT `[Service]` (a common bug — they're silently ignored if misplaced).
- When the start limit is hit, the unit definitively enters `failed` state, and any `OnFailure=` units listed in `[Unit]` are activated (queued via the `--job-mode=` selector, default `replace`).

### `OnFailure=` semantics — the Ubuntu 24.04 / systemd 255 trap

[CITED: github.com/systemd/systemd/issues/33710 (closed `not-a-bug`, comment by maintainer YHNdnzj)]
[VERIFIED: Launchpad noble — Ubuntu 24.04 ships systemd 255.4-1ubuntu8.x]

- **Old behavior (systemd ≤ v254 default):** `OnFailure=` activated only when the unit hit the start limit and entered final `failed` state. This is what most online tutorials assume.
- **New behavior (systemd v255+):** Each automatic restart takes the unit through the `failed` state momentarily before transitioning to `activating`. Because `OnFailure=` listens for entry to `failed`, **it now fires on every restart cycle**, not just on the final exhaust.
- The maintainer's verdict: the previous behavior was a bug; the new behavior is correct per the documented "enters the `failed` state" wording.

### `RestartMode=direct` — the documented fix

[CITED: man systemd.service v255 — `RestartMode=` introduced in v254]

> If set to `direct`, the service transitions to the activating state directly during auto-restart, skipping failed/inactive state. `ExecStopPost=` is invoked. `OnSuccess=` and `OnFailure=` are skipped.
>
> This option is useful in cases where a dependency can fail temporarily but we don't want these temporary failures to make the dependent units fail.

This is the EXACT directive needed for our use case. With `RestartMode=direct`:
- Restarts 1, 2, 3 within the burst window: livinityd auto-restarts without firing `OnFailure=`.
- Restart attempt 4 (or whichever exceeds `StartLimitBurst`): start limit triggers, unit enters `failed` (no auto-restart this time), `OnFailure=livos-rollback.service` fires.

There is one open issue (`#34758`) about `RestartMode=direct` interacting with `Requires=`/`BindsTo=` dependent services, but it does not apply here — `livos.service` has no `Requires=` consumers among `liv-core`/`liv-worker`/`liv-memory` (those are independent services).

### `OnFailure=` invocation as a oneshot service

`livos-rollback.service` should be `Type=oneshot` with `RemainAfterExit=no` so it runs to completion and clears, regardless of whether the rollback succeeded. This matches the [CITED: redhat.com/en/blog/systemd-automate-recovery] self-healing pattern. Critically: the rollback service itself MUST NOT have `OnFailure=` set — if rollback fails, that's a hard stop for human intervention, not another rollback (would risk infinite loops).

### Network reach test pattern

[VERIFIED: existing `update.sh` line 53 already does `git clone` over HTTPS, proving GitHub reach in production]

Three options compared:

| Probe | Pro | Con |
|-------|-----|-----|
| `curl -fsI -m 5 https://api.github.com/repos/utopusc/livinity-io` | Tests both DNS + TLS + HTTP layer + the exact endpoint we need. `-f` makes curl exit non-zero on HTTP 4xx/5xx. `-m 5` caps total time at 5 s. `-sI` is silent + HEAD-only (no body bytes). | A 403 from GitHub rate-limit looks like "unreachable" (false positive). Mitigated by reporting the curl exit code in the failure message — `PRECHECK-FAIL: GitHub api.github.com unreachable (curl exit 22)` lets the user see HTTP-error vs network-error vs timeout. |
| `git ls-remote https://github.com/utopusc/livinity-io HEAD` | Tests git protocol end-to-end, exactly mirrors what update.sh will do anyway. | Slower (no `-m 5` equivalent), git's exit codes are less specific. |
| DNS-only (`getent hosts api.github.com`) | Fastest. | Doesn't catch HTTPS interception, partial outages, or rate-limit blocks. Too weak for our purpose. |

**Choose curl with `-fsI -m 5`** to `api.github.com/repos/utopusc/livinity-io`. Repo-specific URL also catches the case where the repo was renamed/deleted upstream.

### Disk-free check

`df -BG /opt/livos | awk 'NR==2 {gsub(/G/, "", $4); if ($4+0 < 2) exit 1}'`

[CITED: linuxize.com df docs] [VERIFIED: GNU coreutils df man page]

- `df -BG <path>` resolves `<path>` to the mountpoint and prints sizes in 1-GB units.
- `NR==2` skips the header row.
- `$4` is the `Available` column (note: `$3` = Used, $4 = Avail — verified against `df -BG /` on a Linux host).
- `gsub(/G/, "", $4)` strips the literal `G` suffix so `$4+0` is a numeric compare.
- `exit 1` from awk propagates to the bash invocation, then `set -e` triggers on the negative compare.

Edge cases:
- **Path doesn't exist:** `df -BG /missing` prints to stderr and exits non-zero. We rely on `set -e` to catch.
- **`Available` is 0G for tiny partitions:** Won't happen here — we check `/opt/livos` which is on the root partition (10s of GB minimum).
- **Reserved root space:** GNU df's `Available` already accounts for the 5% root-reserve. We're operating as root anyway, so `Available` is the conservative number we want.
- **tmpfs / overlayfs:** Not an issue — `/opt/livos` is a real on-disk directory on both Mini PC and Server4.

### Write-test

```bash
TEST=$(mktemp -p /opt/livos .precheck-XXXXXX 2>/dev/null) && rm -f "$TEST"
```

`mktemp -p` creates the file in the target directory; if the directory is read-only or non-existent, mktemp exits non-zero. `set -e` then trips. This catches both `EROFS` (filesystem mounted read-only — happens occasionally with full-disk panics on ext4) and the (very unlikely) case where `/opt/livos` was chowned away from root.

### Update-history JSON contract

Phase 33 will read `/opt/livos/data/update-history/*.json` and render a "Past Deploys" table. Phase 32 produces the rollback rows. Schema (decided here, not yet locked across phases):

```json
{
  "timestamp": "2026-04-26T14:32:18Z",
  "status": "rolled-back",
  "from_sha": "e518570f...",
  "to_sha": "21f1e095...",
  "reason": "3-crash-loop",
  "duration_ms": 87432,
  "log_path": "/opt/livos/data/update-history/2026-04-26T14-32-18Z-rollback.log"
}
```

Status values Phase 33 will see: `success`, `failed`, `rolled-back`. Phase 32 only writes `rolled-back`. Phase 33 (OBS-01) will retro-add `success` and `failed` writes inside `update.sh`.

## Recommended Implementation Approach

### Concrete systemd configuration

`/etc/systemd/system/livos.service.d/auto-rollback.conf` (drop-in — does NOT modify the original `livos.service`):

```ini
[Unit]
StartLimitIntervalSec=300
StartLimitBurst=3
OnFailure=livos-rollback.service

[Service]
RestartMode=direct
```

Rationale:
- Drop-in at `livos.service.d/*.conf` is the documented way to extend a unit without replacing it [CITED: man systemd.unit `Drop-in files`]. Survives systemd-reload-daemon. No need to touch the original `livos.service` (which the patch script doesn't author anyway).
- `StartLimitIntervalSec=300` (5 min) and `StartLimitBurst=3` (3 attempts) match REQUIREMENTS.md REL-01 verbatim: "3 ardışık başarısız boot" within a window long enough to weather a transient resource hiccup.
- `RestartMode=direct` prevents `OnFailure=` from misfiring on every restart in systemd 255+ (see Domain Background).
- `OnFailure=livos-rollback.service` triggers the oneshot.

`/etc/systemd/system/livos-rollback.service` (new unit):

```ini
[Unit]
Description=LivOS auto-rollback to previous deployed SHA
# CRITICAL: do NOT add OnFailure= here — rollback failure is hard-stop.
# CRITICAL: do NOT add Requires=livos.service — would create a circular dep.

[Service]
Type=oneshot
ExecStart=/opt/livos/livos-rollback.sh
TimeoutStartSec=600
StandardOutput=journal
StandardError=journal
# Run as root — needs systemctl restart, /opt/livos/ writes, git clone.
User=root

[Install]
WantedBy=multi-user.target
```

### Concrete bash orchestration

`/opt/livos/livos-rollback.sh` (new file, +x, root-owned):

```bash
#!/usr/bin/env bash
# Phase 32 REL-02: auto-rollback when livinityd crash-loops.
# Triggered by livos-rollback.service via OnFailure=.
#
# Loop prevention: writes /opt/livos/.rollback-attempted on entry.
# If this file exists, abort — operator must investigate (don't recurse).

set -euo pipefail

ROLLBACK_LOCK="/opt/livos/.rollback-attempted"
PREV_SHA_FILE="/opt/livos/.deployed-sha.previous"
HISTORY_DIR="/opt/livos/data/update-history"
START_TS=$(date -u +%s)
START_ISO=$(date -u +%Y-%m-%dT%H-%M-%SZ)
LOG_FILE="${HISTORY_DIR}/${START_ISO}-rollback.log"

mkdir -p "$HISTORY_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[ROLLBACK] starting at $START_ISO"

# ── Loop guard ──
if [[ -f "$ROLLBACK_LOCK" ]]; then
    echo "[ROLLBACK-ABORT] $ROLLBACK_LOCK exists — operator must investigate."
    echo "[ROLLBACK-ABORT] previous rollback attempt did not clear the lock."
    echo "[ROLLBACK-ABORT] to retry: sudo rm $ROLLBACK_LOCK && sudo systemctl start livos-rollback.service"
    exit 1
fi
touch "$ROLLBACK_LOCK"

# ── Read previous SHA ──
if [[ ! -f "$PREV_SHA_FILE" ]]; then
    echo "[ROLLBACK-ABORT] $PREV_SHA_FILE not found — first deploy ever, no previous SHA to revert to."
    echo "[ROLLBACK-ABORT] livinityd is crash-looping but there is no rollback target. Operator must investigate."
    exit 1
fi
PREV_SHA=$(cat "$PREV_SHA_FILE" | tr -d '[:space:]')
CURRENT_SHA=$(cat /opt/livos/.deployed-sha 2>/dev/null | tr -d '[:space:]' || echo "unknown")
echo "[ROLLBACK] reverting from $CURRENT_SHA to $PREV_SHA"

# ── Clone + checkout previous SHA ──
TEMP_DIR="/tmp/livinity-rollback-$$"
rm -rf "$TEMP_DIR"
git clone https://github.com/utopusc/livinity-io.git "$TEMP_DIR"
git -C "$TEMP_DIR" checkout "$PREV_SHA"

# ── Reuse update.sh's rsync+build pipeline ──
# We invoke update.sh against a SHA-checked-out tree by overriding REPO_URL via
# environment is not enough (update.sh re-clones). Simpler: copy the patched
# update.sh logic inline, OR use update.sh's TEMP_DIR injection.
#
# DECISION: copy the relevant rsync+install+build steps inline here. Keeps
# rollback self-contained and avoids "what if update.sh itself is the broken
# code we're rolling back?"
# (The plan should literally lift lines 57-205 of update.sh into a helper that
# both update.sh and livos-rollback.sh source. Plan-phase decides factoring.)

# rsync source from $TEMP_DIR/livos/packages/* and $TEMP_DIR/nexus/packages/*
# pnpm install + npm install
# build @livos/config + @livos/ui + @nexus/{core,memory,worker,mcp-server}
# copy nexus/core dist into ALL pnpm-store @nexus+core* dirs (Phase 31 BUILD-02)
# verify_build each (Phase 31 BUILD-01)
# (See File-by-File Plan for the recommended factoring.)

# ── Write the new SHA + history marker ──
echo "$PREV_SHA" > /opt/livos/.deployed-sha
chmod 644 /opt/livos/.deployed-sha

END_TS=$(date -u +%s)
DURATION_MS=$(( (END_TS - START_TS) * 1000 ))

cat > "${HISTORY_DIR}/${START_ISO}-rollback.json" <<JSON
{
  "timestamp": "$(date -u -d @$START_TS +%Y-%m-%dT%H:%M:%SZ)",
  "status": "rolled-back",
  "from_sha": "$CURRENT_SHA",
  "to_sha": "$PREV_SHA",
  "reason": "3-crash-loop",
  "duration_ms": $DURATION_MS,
  "log_path": "$LOG_FILE"
}
JSON
chmod 644 "${HISTORY_DIR}/${START_ISO}-rollback.json"

# ── Restart services ──
systemctl reset-failed livos.service  # clear the failed state from start-limit
systemctl restart livos liv-core liv-worker liv-memory

# ── Clear lock — rollback succeeded ──
rm -f "$ROLLBACK_LOCK"
rm -rf "$TEMP_DIR"

echo "[ROLLBACK-OK] reverted to $PREV_SHA in ${DURATION_MS}ms"
```

### Concrete `update.sh` modifications

Two new functions injected by the patch script:

```bash
# Inserted right AFTER fail() helper definition (anchor stable across hosts):
precheck() {
    # Phase 32 REL-01: refuse to start if host can't possibly succeed.
    # Output format MUST stay `PRECHECK-FAIL: <reason>` — Phase 34 UX-01 toast
    # parses this exactly.

    # 1. Disk free ≥ 2 GB on /opt/livos's mount
    local avail_gb
    avail_gb=$(df -BG /opt/livos 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4+0}')
    if [[ -z "${avail_gb:-}" ]] || (( avail_gb < 2 )); then
        echo "PRECHECK-FAIL: insufficient disk space on /opt/livos (need >=2GB, have ${avail_gb:-unknown}GB)" >&2
        exit 1
    fi

    # 2. /opt/livos writable
    local probe
    if ! probe=$(mktemp -p /opt/livos .precheck-XXXXXX 2>/dev/null); then
        echo "PRECHECK-FAIL: /opt/livos is not writable (check mount/perms — root must own dir)" >&2
        exit 1
    fi
    rm -f "$probe"

    # 3. GitHub reachable (5s budget; tests DNS + TLS + HTTP + repo exists)
    if ! curl -fsI -m 5 https://api.github.com/repos/utopusc/livinity-io >/dev/null 2>&1; then
        local exit_code=$?
        echo "PRECHECK-FAIL: GitHub api.github.com unreachable (curl exit $exit_code — check network or rate-limit)" >&2
        exit 1
    fi
}

record_previous_sha() {
    # Phase 32 REL-02 prep: shift current .deployed-sha → .deployed-sha.previous
    # before update.sh writes the new one. Called immediately before the
    # existing Phase 30 SHA-write step.
    if [[ -f /opt/livos/.deployed-sha ]]; then
        cp /opt/livos/.deployed-sha /opt/livos/.deployed-sha.previous
        chmod 644 /opt/livos/.deployed-sha.previous
    fi
}
```

Wiring:
- `precheck` called immediately after the existing `[OK] Pre-flight passed` (line 44) — extends the existing pre-flight section, doesn't replace it.
- `record_previous_sha` called inside the Phase 30 "Recording deployed SHA" block, BEFORE `git rev-parse HEAD > /opt/livos/.deployed-sha` (line 254 of `update.sh.minipc`).
- `mkdir -p /opt/livos/data/update-history` injected near the top of `precheck` so first-ever rollback has a writable target dir (Phase 33 also creates this; idempotent).

### Error string format contract (Phase 34 binding)

The exact regex Phase 34's UX-01 toast handler will match:

```
^PRECHECK-FAIL: (.+)$
```

Captured group 1 is shown verbatim in the toast. To stay parser-friendly:
- One-line strings only (no `\n` mid-message)
- No ANSI codes (already stripped by `update.ts:performUpdate` via `stripAnsi()`, but keep them out of the source string anyway)
- Sentence case, ending with period or actionable hint in parens
- Keep < 200 chars (toast UI cuts longer)

## File-by-File Plan

| File | Action | Owner | Rationale |
|------|--------|-------|-----------|
| `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh` | **CREATE** | this phase | Single SSH-applied artifact; mirrors Phase 31 pattern. Idempotent via `grep -qF` markers. Safety: backs up `update.sh` to `.pre-phase32`, runs `bash -n` on the patched output, restores from backup if syntax check fails. Also writes/installs the four runtime files below. |
| `/opt/livos/update.sh` | **PATCH** (in-place via SSH) | the patch script | Add `precheck()` helper after `fail()` definition; call it after `[OK] Pre-flight passed`. Add `record_previous_sha()` helper; call it before the Phase 30 SHA-write. Add `mkdir -p /opt/livos/data/update-history` so the rollback dir exists. Markers: `# ── Phase 32 REL-01: precheck ──`, `# ── Phase 32 REL-02 prep: SHA rotation ──`. |
| `/etc/systemd/system/livos.service.d/auto-rollback.conf` | **CREATE** (drop-in, NOT a replacement) | the patch script | Adds `StartLimitIntervalSec=300`, `StartLimitBurst=3`, `OnFailure=livos-rollback.service`, `RestartMode=direct`. Drop-in pattern means we don't touch the original `livos.service` (which we don't author). After install, patch script runs `systemctl daemon-reload`. |
| `/etc/systemd/system/livos-rollback.service` | **CREATE** | the patch script | New oneshot unit. `ExecStart=/opt/livos/livos-rollback.sh`. `Type=oneshot`, `User=root`, `TimeoutStartSec=600` (10 min budget — generous). NO `OnFailure=` here (rollback failure = hard stop). `WantedBy=multi-user.target` (so a reboot picks up the install state). After install, patch script runs `systemctl daemon-reload && systemctl enable livos-rollback.service`. |
| `/opt/livos/livos-rollback.sh` | **CREATE** | the patch script | The actual rollback logic. Reads `.deployed-sha.previous`, clones+checkout, rsyncs+builds, restarts services, writes history JSON. Loop guard via `.rollback-attempted` lock. Mode 0755, owner root. Tees all output to `<history_dir>/<ts>-rollback.log`. |
| `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/test-canary-commit.md` | **CREATE** (recommended, optional) | this phase | Documents the canary-commit test procedure (push a `process.exit(1)` at top of livinityd `index.ts` to a `phase32-rollback-canary` branch; run `update.sh` with `REPO_URL` overridden to that branch via env; observe rollback fires within 5 min; assert `.deployed-sha` reverts and `<ts>-rollback.json` lands in history dir). NOT executed in this phase — held for the test plan to run on Mini PC during plan-03 SSH apply, OR deferred to Phase 35 (CI smoke test) if too risky on production. |

### Why a single artifact rather than committing `livos.service`/`livos-rollback.service` files into the repo separately

Phase 30/31 precedent locks the "patch script is the source of truth, files-on-disk are the patched output" model. The patch script HEREDOC's the `.conf`/`.service`/`.sh` content into the right paths on disk. This means:
- One git commit = one deployable unit
- Idempotent re-runs detect already-installed files (compare content via sha256 or just `grep -qF` for a known marker line)
- Backup-and-restore safety net is uniform across all the files the patch script touches

### Why the rollback `.sh` script is on disk at `/opt/livos/livos-rollback.sh` and not embedded in the `.service`

The `.service` file would balloon if `ExecStart=/bin/bash -c '<300 lines of bash>'`. Separation of concerns: the `.service` declares triggering + isolation; the `.sh` does the work. Standard pattern from [CITED: redhat.com/en/blog/systemd-automate-recovery]. Also, `.sh` files are easier to test in isolation (`sudo /opt/livos/livos-rollback.sh` from the command line during a dry-run test).

### Should the rollback script call `update.sh` directly with a checked-out tree?

Considered, **rejected**. Risk: if the broken deploy that triggered the rollback was caused by a bug INSIDE `update.sh` itself (e.g., a fresh Phase 31 BUILD-01 false-positive that exits 1), then re-running `update.sh` for rollback would re-trigger the same bug. Better: rollback runs an INDEPENDENT copy of the rsync+build steps, lifted from `update.sh` but stable (won't be re-patched by future phases unless the rollback script is also re-patched). The plan-phase should decide whether to factor the shared rsync+build into a sourced helper (`/opt/livos/lib/build-pipeline.sh`) or to inline-duplicate it inside `livos-rollback.sh` for hard isolation.

## Risks & Edge Cases

### R-01: Rollback-of-rollback infinite loop
**Scenario:** Rollback fires; rollback rsyncs the previous SHA; previous SHA's livinityd ALSO crashes 3× in 5 min; would normally trigger `livos-rollback.service` again, which would clone the SAME `.deployed-sha.previous` (now equal to current!) and rsync nothing-different. Infinite loop.

**Mitigation (chosen):** `/opt/livos/.rollback-attempted` lock file. `livos-rollback.sh` `touch`es it on entry, `rm`s it only on success. If the file exists at entry, abort with `[ROLLBACK-ABORT]` to journal. Operator must `rm` the lock manually after diagnosing.

**Why not auto-clear after 24 h?** Auto-clearing risks letting the loop resume after a transient outage if the operator hasn't actually fixed anything. Hard-stop is safer; `journalctl -u livos-rollback` will tell the operator what to do.

### R-02: `.deployed-sha.previous` doesn't exist (first-ever deploy)
**Scenario:** Brand-new install. `update.sh` ran for the first time; no `.deployed-sha.previous` was created (because there was no previous SHA to shift). livinityd crash-loops. Rollback fires. Reads `.deployed-sha.previous` → ENOENT.

**Mitigation:** `livos-rollback.sh` checks for the file before doing anything else. If missing, `[ROLLBACK-ABORT] first deploy ever, no previous SHA` to journal and exit 1. systemd flips `livos-rollback.service` to `failed`; operator gets a `journalctl -u livos-rollback` to investigate. No infinite recursion (the `.rollback-attempted` lock is touched first, so even subsequent triggers will hit the loop guard).

### R-03: Network flapping during precheck
**Scenario:** `curl -fsI -m 5 https://api.github.com/repos/utopusc/livinity-io` fails because of a transient 1-second network blip during the 5 s window.

**Mitigation:** `-m 5` is a 5-second TOTAL budget; curl will retry the connect within that window via the kernel's TCP retransmit. If it still fails, the user retries via the UI's "Install Update" button (now wired with UX-01 toast in Phase 34, so the user will SEE the failure and know to retry). We deliberately do NOT add internal retry loops to the precheck — false reassurance is worse than visible failure. Open question O-04 explores whether 5 s is the right budget.

### R-04: Disk full mid-rollback
**Scenario:** Disk is at 1.9 GB free at rollback start; rollback's `git clone` plus pnpm install pushes it over the edge.

**Mitigation:** `livos-rollback.sh` ALSO calls a precheck on entry (or shares the same precheck function). If disk fails, `[ROLLBACK-ABORT] insufficient disk space` to journal, lock stays set, operator must intervene. Better to abort cleanly than to leave a half-rolled-back tree.

**Recommended:** Lift `precheck()` from `update.sh` into a sourced helper, or just duplicate the disk check inline in `livos-rollback.sh`. Plan phase decides.

### R-05: Phase 33's `update-history/` dir not writable by livinityd
**Scenario:** `livos-rollback.sh` runs as root and `mkdir -p /opt/livos/data/update-history` with default mode (0755 from root → readable by all but only writable by root). Phase 33's livinityd runs as `livos` user (per memory) and needs to READ this dir. Reading is fine — no issue.

**Open issue:** Phase 33's OBS-01 also wants `update.sh` (root) to write `success`/`failed` rows. Same dir, same root-writes-livos-reads pattern → fine. NO permission fix needed in Phase 32.

**Edge case:** If a future phase adds livinityd-side WRITES to `update-history/`, we'd need `chmod 0775` + `chgrp livos`. Not Phase 32's problem.

### R-06: `RestartMode=direct` not honored on Server4
**Scenario:** Server4 might run an older Ubuntu (Phase 31 only verified Ubuntu 24.04 on Mini PC). `RestartMode=` requires systemd v254+. If Server4 is on systemd ≤ v253, the directive is silently ignored, and we're back to "OnFailure fires on every restart."

**Mitigation:** Patch script runs `systemctl --version` on each host BEFORE installing the drop-in. If `< 254`, prints a `WARN:` line and either (a) refuses to install the drop-in on that host, or (b) installs a degraded variant that uses `Restart=no` + `OnFailure=` only (rollback fires on FIRST crash; no auto-recovery for transient hiccups; tradeoff documented).

**Recommended:** (a) — refuse to install on old systemd, surface a clear `PHASE32-INCOMPATIBLE: systemd <version> too old; need >=254` message. Server4 is documented as legacy in MEMORY.md; degrading the rollback semantics there is fine.

**Open question O-05** explores whether Server4 should get rollback at all.

### R-07: rollback runs while update.sh is mid-deploy
**Scenario:** User clicks "Install Update". `update.sh` starts. livinityd is restarted at the end. livinityd boots fail for some reason (3 crashes in 5 min). `livos-rollback.service` fires. But `update.sh` is STILL running (e.g., gallery cache update at the tail end). Now both processes are touching `/opt/livos/`.

**Mitigation:** systemd's `OnFailure=` only fires when livinityd's start limit is hit — by that point, `update.sh`'s `systemctl restart livos` step has already completed (it's the LAST step before "LivOS updated successfully"). So the deploy's restart attempt is the ONE attempt that crashed; subsequent restart attempts are systemd's auto-restarts (within 5 min window). update.sh has likely already exited by then.

**Defense in depth:** `livos-rollback.sh` could check for `pgrep -f "bash /opt/livos/update.sh"` at entry and abort if found. But this is a 3-second race window at most; not worth complicating the rollback. Document as a known limitation; if it surfaces, Phase 33's history dir will have BOTH a `success` row from update.sh and a `rolled-back` row from the watchdog — operator can see what happened.

### R-08: Phase 30's existing `.deployed-sha` write doesn't run if update.sh fails BEFORE that step
**Scenario:** Old behavior: if `update.sh` fails partway (e.g., during build), the `.deployed-sha` file is NOT updated, but the source files ARE half-rsynced into place. livinityd then runs against a half-updated tree on next boot.

**Mitigation:** Out of scope for Phase 32 (REL-02 only handles "successful update.sh + boot fail"). But worth flagging: the right long-term fix is for `update.sh` to be transactional (rsync into a staging dir, swap on success). This is Phase 999.x material per CONTEXT.md.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (livinityd) — already used for `update.unit.test.ts` and `routes.unit.test.ts` |
| Config file | `livos/packages/livinityd/package.json` (vitest config inline) |
| Quick run command | `pnpm --filter livinityd test:unit -- --run system/` |
| Full suite command | `pnpm --filter livinityd test:unit -- --run` |
| Bash script lint | `bash -n /opt/livos/livos-rollback.sh && bash -n .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/phase32-systemd-rollback-patch.sh` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REL-01 | `PRECHECK-FAIL: insufficient disk space` when /opt/livos disk < 2 GB | unit (bash) | `bash tests/precheck-disk.sh` (mocks `df` via PATH-injected stub) | ❌ Wave 0 |
| REL-01 | `PRECHECK-FAIL: not writable` when /opt/livos chmod 555 | unit (bash) | `bash tests/precheck-write.sh` (uses tmp dir + chmod 555) | ❌ Wave 0 |
| REL-01 | `PRECHECK-FAIL: GitHub unreachable` when curl exits non-zero | unit (bash) | `bash tests/precheck-net.sh` (PATH-injected curl stub returning exit 7) | ❌ Wave 0 |
| REL-01 | `system.update` mutation `error` field carries `PRECHECK-FAIL: ...` verbatim | unit (vitest) | extend `update.unit.test.ts` test F: mock execa to reject with stderr `PRECHECK-FAIL: insufficient disk space\n`, assert `getUpdateStatus().error` contains `PRECHECK-FAIL: insufficient disk space` | ❌ Wave 0 (extend existing file) |
| REL-02 | systemd drop-in installs cleanly + `systemctl show livos.service -p RestartMode,OnFailure,StartLimitBurst,StartLimitIntervalUSec` shows expected values | integration (SSH) | `ssh bruce@10.69.31.68 'systemctl show livos.service \| grep -E "^(RestartMode\|OnFailure\|StartLimitBurst\|StartLimitIntervalUSec)="'` post-apply | ❌ Wave 0 (in plan-phase patch-apply task) |
| REL-02 | rollback script aborts cleanly when `.deployed-sha.previous` missing | unit (bash) | `bash tests/rollback-no-prev-sha.sh` (rm -f .deployed-sha.previous; run script; assert exit 1 + journal contains `[ROLLBACK-ABORT] first deploy ever`) | ❌ Wave 0 |
| REL-02 | rollback script aborts cleanly when lock file exists | unit (bash) | `bash tests/rollback-loop-guard.sh` (touch .rollback-attempted; run script; assert exit 1 + `[ROLLBACK-ABORT] $LOCK exists`) | ❌ Wave 0 |
| REL-02 | end-to-end: canary commit triggers rollback within 2 min | manual (SSH on Mini PC) | See Open Question O-06 — recommend dry-run mode + manually-triggered `systemctl start livos-rollback.service` against a known-bad SHA | ❌ Wave 0 (manual, not CI) |

### Sampling Rate

- **Per task commit:** `pnpm --filter livinityd test:unit -- --run system/` (covers REL-01 mutation-error test); `bash -n` on all bash artifacts.
- **Per wave merge:** Full test suite + all bash precheck tests.
- **Phase gate:** SSH-apply on Mini PC + manual canary-commit test (or simulated via `systemctl start livos-rollback.service` against a controlled previous SHA), assert `<ts>-rollback.json` lands in history dir, `.deployed-sha` reverts, services come back up within 2 min.

### Wave 0 Gaps
- [ ] `tests/precheck-disk.sh` — bash test with PATH-injected `df` stub, asserts `PRECHECK-FAIL: insufficient disk space` on stderr + exit 1
- [ ] `tests/precheck-write.sh` — bash test using tmp dir chmod 555, asserts `PRECHECK-FAIL: not writable`
- [ ] `tests/precheck-net.sh` — bash test with PATH-injected `curl` stub returning exit 7 (network unreachable)
- [ ] `tests/rollback-no-prev-sha.sh` — bash test asserting clean abort when `.deployed-sha.previous` missing
- [ ] `tests/rollback-loop-guard.sh` — bash test asserting clean abort when `.rollback-attempted` lock exists
- [ ] Extend `livos/packages/livinityd/source/modules/system/update.unit.test.ts` with a "PRECHECK-FAIL stderr round-trips to mutation error" test
- [ ] Manual canary procedure documented in `artifacts/test-canary-commit.md`

### Chains of Evidence (input → middleware → assertion)

**REL-01 chain** (precheck blocks update.sh):
```
INPUT:        df reports < 2 GB available on /opt/livos
MIDDLEWARE:   precheck() in update.sh runs awk parse
              → emits "PRECHECK-FAIL: insufficient disk space..." to stderr
              → exit 1
              → execa $`bash /opt/livos/update.sh` rejects with non-zero exit
              → performUpdate's catch block sets updateStatus.error = stderr text
              → tRPC mutation throws TRPCError carrying the error in result.data
              → UI's mutation.onError fires (Phase 34 UX-01 already implemented)
ASSERTION:    toast displays "PRECHECK-FAIL: insufficient disk space on /opt/livos (need >=2GB, have 1GB)"
              git clone never executed (verifiable: ls /tmp/livinity-update-* empty)
              .deployed-sha unchanged (verifiable: file mtime predates the test)
```

**REL-02 chain** (auto-rollback after 3 crashes):
```
INPUT:        livinityd's main process exits non-zero 3 times within 300s
MIDDLEWARE:   systemd Restart=on-failure auto-restarts attempts 1, 2, 3 (RestartMode=direct
                skips OnFailure firing on each)
              Attempt 4: StartLimitBurst exceeded → unit enters `failed` state
              OnFailure=livos-rollback.service triggered → oneshot starts
              livos-rollback.sh:
                touches .rollback-attempted lock
                reads .deployed-sha.previous → "21f1e095..."
                git clone + checkout 21f1e095...
                rsync + pnpm install + build
                writes /opt/livos/data/update-history/<ts>-rollback.json
                writes new .deployed-sha = 21f1e095...
                systemctl reset-failed livos.service
                systemctl restart livos liv-core liv-worker liv-memory
                rm .rollback-attempted lock
ASSERTION:    /opt/livos/.deployed-sha == previous SHA (revert successful)
              /opt/livos/data/update-history/<ts>-rollback.json exists with status:rolled-back
              systemctl is-active livos.service == "active"
              curl http://localhost:8080/health returns 200
              total time from 3rd crash to /health 200: < 120s (target from CONTEXT)
              journalctl -u livos-rollback.service shows [ROLLBACK-OK] line
```

## Open Questions

### O-01: Should the rollback script use `git clone --depth 1` like update.sh, or a full clone to enable arbitrary checkout?
- **What we know:** `update.sh` line 53 uses `--depth 1` (shallow). Rollback needs to checkout an arbitrary previous SHA, which `--depth 1` does NOT support (the previous SHA is almost certainly not the tip of master).
- **What's unclear:** Time cost of full clone — repo is ~25k commits; full clone takes several seconds and ~50-100 MB. Within 2-min budget, fine.
- **Recommendation (LOCK):** Use `git clone --no-checkout` then `git fetch --depth=1 origin <prev-sha>` then `git checkout <prev-sha>`. If `--depth=1` fetch of a specific commit fails (some hosts disable this), fall back to `git fetch --unshallow`. Plan-phase confirms via test against the actual GitHub repo.

### O-02: Does the rollback need to ALSO restart Caddy / Cloudflare Tunnel / other dependents?
- **What we know:** MEMORY.md lists `livos.service`, `liv-core.service`, `liv-worker.service`, `liv-memory.service` as the LivOS-managed units. Caddy and Cloudflare are independent.
- **What's unclear:** Does updating `/opt/livos/packages/ui/dist` change the static-asset path Caddy serves? If so, Caddy might need a reload to pick up new files (or the symlink swap might already handle it).
- **Recommendation (LOCK):** Restart only `livos liv-core liv-worker liv-memory` (the same set `update.sh` restarts). If Caddy needs anything, it's already a Phase 30 oversight, not Phase 32's. Out of scope.

### O-03: When precheck fires, should `update.sh` STILL `mkdir -p /opt/livos/data/update-history` so Phase 33 can log the failed attempt?
- **What we know:** Currently the precheck would exit 1 BEFORE any side-effects. But Phase 33 OBS-01 wants every update attempt logged — including the precheck failures.
- **Recommendation (LOCK):** YES — `mkdir -p /opt/livos/data/update-history` is the FIRST line of `precheck()`, before any actual checks. Cost is microseconds. Then if precheck fails, write a `<ts>-precheck-fail.json` row before exiting. Phase 33 can render these as "deploy attempted, blocked by precheck."
- **Status:** This is a Phase 32 design decision; lock here. JSON shape: `{timestamp, status: "precheck-failed", reason: "<the PRECHECK-FAIL string>", duration_ms}`.

### O-04: 5-second curl timeout — too tight for slow connections, too loose for fast ones?
- **What we know:** GitHub's median response time is ~200-400ms. A 5 s budget is 10-25× headroom.
- **What's unclear:** Mini PC is on a residential link via the Server5 relay tunnel; tail latency could spike to 2-3 s under load.
- **Recommendation:** Start with 5 s; revisit if Phase 33 logs show > 1% of deploys hitting the timeout. Document in Plan summary so future me can correlate against logs. NOT a blocker.

### O-05: Should the patch script install on Server4 if its systemd is < v254?
- **What we know:** `RestartMode=direct` is v254+. Server4's systemd version is unverified in this research.
- **What's unclear:** Server4's actual `systemctl --version`. Per MEMORY.md it's a legacy host; could be Ubuntu 22.04 or 24.04.
- **Recommendation:** Patch script runs `systemctl --version | head -1 | awk '{print $2}'` on the host. If `< 254`, refuse to install the drop-in with `WARN: systemd v<X> too old for RestartMode=direct; rollback semantics will misfire on every restart. Skipping drop-in install.` Precheck `update.sh` patch still applies (it's host-version-independent). Plan-phase decides whether to surface this with a hard ERROR or a soft WARN.

### O-06: How to validate end-to-end without bricking production?
- **What we know:** Three options: VM snapshot, dry-run mode in rollback script, canary commit on a test branch.
- **Recommendation (LOCK):** Combine two:
  1. **Synthetic trigger** — in the patch-apply test, manually run `sudo systemctl start livos-rollback.service` AFTER manually setting `/opt/livos/.deployed-sha.previous` to a SHA that's known-good. This exercises the rollback orchestration without needing a real crash. Verifies: clone+checkout works, history JSON is written, services restart.
  2. **Canary** — push a `process.exit(1)` at the top of livinityd's `index.ts` to a `phase32-rollback-canary` branch. Update `/opt/livos/.deployed-sha.previous` to the current good SHA, then deploy the canary via `update.sh` (with `REPO_URL` overridden to point to the canary branch). Observe: livinityd crashes 3× → rollback fires → reverts to previous SHA → services come back. Document procedure but DO NOT execute in plan unless user explicitly opts in (this DOES touch production).
- **Phase-32 plan-03 should pick option 1 as automated, option 2 as a `checkpoint:human-verify` task with explicit user opt-in.**

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| systemd v254+ | REL-02 (`RestartMode=direct`) | ✓ Mini PC (255.4) | 255.4-1ubuntu8.x [VERIFIED: Launchpad] | If Server4 < v254: degrade to `Restart=no + OnFailure=` (rollback on first crash, no auto-recovery — see O-05) |
| `curl` | REL-01 precheck | ✓ both hosts (Phase 31 SSH apply uses curl) | system curl | none — curl is mandatory |
| `awk` | REL-01 disk parse | ✓ both hosts | GNU awk | none — POSIX awk works too |
| `git` | REL-02 rollback clone | ✓ both hosts (update.sh already uses it) | system git | none |
| `pnpm` / `npm` | REL-02 rollback build | ✓ both hosts | per existing update.sh | none |
| `ssh` (from dev machine) | apply patch | ✓ user's Windows OpenSSH | system ssh | none |
| network reach to api.github.com | REL-01 + REL-02 | ✓ verified by Phase 30/31 deploys | — | Precheck CATCHES failure; rollback aborts cleanly via O-02 |

**Missing dependencies with no fallback:** None blocking.

**Missing dependencies with fallback:** systemd version drift on Server4 (mitigated by version-detection in patch script — see O-05).

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────── DEV MACHINE (Windows) ─────────────────────┐
│  User runs: ssh bruce@10.69.31.68 'sudo bash -s'           │
│              < phase32-systemd-rollback-patch.sh           │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌──────────────── HOST (Mini PC / Server4) ──────────────────┐
│                                                            │
│  /opt/livos/update.sh                                      │
│    ├── precheck()         ◄── NEW (Phase 32 REL-01)        │
│    │   ├── df -BG /opt/livos          (≥ 2 GB?)           │
│    │   ├── mktemp -p /opt/livos        (writable?)         │
│    │   └── curl -fsI api.github.com    (reachable?)        │
│    │       └── on FAIL: PRECHECK-FAIL: <r>" >&2 ; exit 1   │
│    │           └── execa rejects → mutation.onError →      │
│    │               toast (Phase 34 UX-01 — already done)   │
│    │                                                       │
│    ├── (existing rsync + build steps from Phase 31)        │
│    │                                                       │
│    ├── record_previous_sha()  ◄── NEW (Phase 32 REL-02)    │
│    │   └── cp .deployed-sha → .deployed-sha.previous       │
│    │                                                       │
│    └── git rev-parse HEAD > .deployed-sha (existing P30)   │
│                                                            │
│  livos.service (existing)                                  │
│    + drop-in: /etc/systemd/system/livos.service.d/         │
│       auto-rollback.conf  ◄── NEW                          │
│       [Unit] StartLimitIntervalSec=300                     │
│              StartLimitBurst=3                             │
│              OnFailure=livos-rollback.service              │
│       [Service] RestartMode=direct                         │
│                                                            │
│  CRASH SEQUENCE:                                           │
│  attempt 1 → exit 1 → systemd auto-restarts (RestartMode   │
│              =direct skips OnFailure)                      │
│  attempt 2 → exit 1 → auto-restart (skip OnFailure)        │
│  attempt 3 → exit 1 → auto-restart (skip OnFailure)        │
│  attempt 4 → StartLimitBurst hit → unit enters `failed`    │
│              → OnFailure=livos-rollback.service fires      │
│                                                            │
│  livos-rollback.service (oneshot, NEW)                     │
│    └── ExecStart=/opt/livos/livos-rollback.sh              │
│         ├── touch .rollback-attempted (loop guard)         │
│         ├── if previous-sha missing → ABORT clean          │
│         ├── git clone + checkout <prev-sha>                │
│         ├── rsync + pnpm install + build (lifted from      │
│         │   update.sh; see plan factoring decision)        │
│         ├── echo $prev_sha > .deployed-sha                 │
│         ├── write <ts>-rollback.json to                    │
│         │   /opt/livos/data/update-history/                │
│         │   (consumed later by Phase 33's OBS-02)          │
│         ├── systemctl reset-failed livos.service           │
│         ├── systemctl restart livos liv-core liv-worker    │
│         │                       liv-memory                 │
│         └── rm .rollback-attempted (clear lock on success) │
│                                                            │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────── livinityd boots on previous SHA ───────────────┐
│  (rolled-back JSON visible to Phase 33's Past Deploys UI)  │
└────────────────────────────────────────────────────────────┘
```

### Key file locations on host

```
/opt/livos/
  update.sh                       (existing, patched in-place)
  update.sh.pre-phase32           (backup created by patch script)
  livos-rollback.sh               (NEW — orchestrates rollback)
  .deployed-sha                   (existing — current SHA, written by update.sh)
  .deployed-sha.previous          (NEW — written by record_previous_sha())
  .rollback-attempted             (NEW — loop guard, lifecycle: rollback start..success)
  data/
    update-history/               (NEW dir — Phase 32 creates it)
      2026-04-26T14-32-18Z-rollback.json
      2026-04-26T14-32-18Z-rollback.log

/etc/systemd/system/
  livos.service.d/                (NEW dir if not exist)
    auto-rollback.conf            (NEW — drop-in adding rollback semantics)
  livos-rollback.service          (NEW — oneshot rollback unit)
```

## Sources

### Primary (HIGH confidence)
- [systemd v255 man systemd.service.xml](https://raw.githubusercontent.com/systemd/systemd/v255/man/systemd.service.xml) — RestartMode=direct definition (v254+), Restart=on-failure semantics, StartLimitBurst placement
- [systemd v255 man systemd.unit.xml](https://raw.githubusercontent.com/systemd/systemd/v255/man/systemd.unit.xml) — OnFailure= semantics, drop-in file pattern
- [GitHub systemd issue #33710](https://github.com/systemd/systemd/issues/33710) — closed `not-a-bug`; maintainer confirms RestartMode=direct is the v255 fix for OnFailure firing on every restart
- [Ubuntu Launchpad — noble systemd 255.4-1ubuntu8.x](https://launchpad.net/ubuntu/noble/+source/systemd) — confirms Mini PC's systemd version
- `.planning/phases/31-update-sh-build-pipeline-integrity/artifacts/phase31-update-sh-patch.sh` — the precedent patch-script architecture this phase mirrors (idempotency, backup-syntax-restore, marker-guarded blocks)
- `.planning/phases/31-update-sh-build-pipeline-integrity/31-03-SUMMARY.md` — Mini PC + Server4 SSH-apply pattern, the awk-`&` pitfall lesson learned
- `.claude/tmp/phase31-investigation/update.sh.minipc` — actual `update.sh` shape on Mini PC (deployed); used as the patch-script's authoritative source
- `livos/packages/livinityd/source/modules/system/update.ts` — `performUpdate()` already streams stderr and surfaces it as `updateStatus.error` (the chain Phase 34's UX-01 toast consumes)

### Secondary (MEDIUM confidence — verified against primary docs)
- [Red Hat blog: Set up self-healing services with systemd](https://www.redhat.com/en/blog/systemd-automate-recovery) — oneshot rollback pattern, OnFailure handler conventions
- [github.com/systemd/systemd/issues/34758](https://github.com/systemd/systemd/issues/34758) — RestartMode=direct caveat with Requires=/BindsTo= (NOT applicable to our setup; no dependent services link to livos.service)
- [Linuxize: df command](https://linuxize.com/post/how-to-check-disk-space-in-linux-using-the-df-command/) — `df -BG` parse pattern, Available column semantics

### Tertiary (LOW confidence — flagged for plan-phase verification)
- [copyprogramming.com StartLimitIntervalSec article](https://copyprogramming.com/howto/systemd-s-startlimitintervalsec-and-startlimitburst-never-work) — secondary source confirming `[Unit]` section requirement; corroborates primary docs but the site quality is unverified

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Server4's systemd version may be < 254 | R-06, O-05 | If true, RestartMode=direct silently ignored on Server4 — rollback fires on first crash; mitigated by version-detection in patch script |
| A2 | livinityd `User=root` on both hosts (verified for Mini PC in Plan 30-01 D-12) | (multiple) | If livinityd ran as `livos` user, the rollback script's `systemctl restart livos` would still work because livos-rollback.service runs as root; no impact |
| A3 | `liv-core`/`liv-worker`/`liv-memory` services have no `Requires=livos.service` linkage | Domain Background (RestartMode=direct caveat) | If any of these had `Requires=livos`, RestartMode=direct could leave them in inconsistent state during livinityd auto-restart cycles. Plan-phase should `systemctl show liv-core liv-worker liv-memory \| grep -E '^(Requires|Wants|BindsTo)='` to verify |
| A4 | The 2-minute recovery target is achievable with a fresh git clone + pnpm install + build | Validation Architecture | Pnpm install on a cold cache could exceed 2 min on the Mini PC (16 cores, fast NVMe — likely fine) but might not on Server4. Measure during plan-03 SSH apply |
| A5 | `df -BG /opt/livos` correctly resolves to the partition mountpoint regardless of whether /opt/livos is bind-mounted or symlinked | Domain Background | If /opt/livos is a symlink (it isn't on Mini PC per Phase 31 evidence, but unverified for Server4), df may follow or not follow the link depending on version. Mitigation: use `df -BG -P /opt/livos` (POSIX-compliant, more deterministic). |

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` file present in the repo (verified via Glob `CLAUDE.md`). No project-level constraints to enforce beyond the inherited Phase 30/31 conventions documented in CONTEXT.md and STATE.md.

## RESEARCH COMPLETE
