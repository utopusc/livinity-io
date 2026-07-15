#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# ── Phase 31 BUILD-03: root-cause fix ──
# Trigger root cause: INCONCLUSIVE per 31-ROOT-CAUSE.md (no controlled repro).
# BUILD-01 verify_build guard above is the safety net — if it ever fires
# in production, OBS-01 update-history will pin which contributing factor
# (H4 lockfile fallback / H5 race / unknown) was active that run.
# LivOS Safe Update Script
# Updates code, UI, and services WITHOUT touching user data
# Usage: bash update.sh
# ──────────────────────────────────────────────────────────

set -euo pipefail

# ── v29.0-hotpatch: escape livos.service cgroup ───────────
# When livinityd (livos.service) spawns this script, `systemctl restart livos.service`
# below kills the entire cgroup mid-call — taking this script with it before the
# Phase 33 finalize trap can rename -pending → -success and write .deployed-sha.
# detached:true on the spawn side only escapes the process group, not the cgroup.
# Re-exec into a transient systemd .scope so we survive the livos restart.
# Idempotency guard via LIVOS_UPDATE_SCOPED env var.
# IMPORTANT: must come BEFORE Phase 33 tee setup so the new scope owns the log fd.
#
# 2026-06-15 root-cause fix — `--slice=system.slice` is LOAD-BEARING: without it,
# when livinityd (in livos.service) spawns this script, systemd-run --scope
# creates the scope NESTED UNDER livos.service's cgroup (it inherits the caller's
# slice). `systemctl restart livos.service` then SIGKILLs the whole control-group
# INCLUDING the nested scope → update.sh dies mid-restart with NO trap (SIGKILL),
# so no success/failed.json is ever written and the UI hangs forever on "waiting".
# (Proven live on the Mini PC: the scope deactivated at the exact instant
# livos.service was SIGKILLed.) Pinning the scope to system.slice makes it a
# SIBLING of livos.service, so the restart's cgroup-kill can no longer reach it.
# SSH-launched deploys worked by luck — they inherited the SSH session scope, not
# livos.service. `--slice=system.slice` makes BOTH paths escape deterministically.
if [[ -z "${LIVOS_UPDATE_SCOPED:-}" ]] && command -v systemd-run >/dev/null 2>&1 && [[ $EUID -eq 0 ]]; then
    export LIVOS_UPDATE_SCOPED=1
    exec systemd-run --scope --collect --quiet \
        --slice=system.slice \
        --unit="livos-update-$$-$(date +%s)" \
        --description="LivOS Update (cgroup-escaped)" \
        -- "$0" "$@"
fi

# ── Single-flight guard (2026-06-15) ─────────────────────────────────────────
# A stressed operator double-clicking "Update" would otherwise launch two
# concurrent update.sh runs (each cgroup-escaped into its own unique scope) that
# race on the same trees + the rollback snapshot. Take a non-blocking exclusive
# lock; if another run already holds it, exit cleanly HERE — before the EXIT
# trap below is installed — so no spurious failed.json is written. Fail-open if
# flock is unavailable or the lock file can't be opened (never block a deploy on
# the guard itself).
exec 9>/run/lock/livos-update.lock 2>/dev/null || exec 9>/tmp/livos-update.lock 2>/dev/null || true
if command -v flock >/dev/null 2>&1 && { : >&9; } 2>/dev/null; then
    if ! flock -n 9; then
        echo "[INFO] Another LivOS update is already in progress — exiting (no concurrent deploy)." >&2
        exit 0
    fi
fi

# ── v29.0-hotpatch: survive livinityd's death during livos.service restart ──
# After cgroup-escape, the script lives in livos-update-*.scope, but stdout/stderr
# are still piped back to livinityd (execa spawn without stdio:'ignore'). When
# `systemctl restart livos.service` runs, livinityd dies → its pipe end closes →
# tee's writes to its stdout fail with SIGPIPE → tee dies → bash's writes to the
# FIFO break → bash dies (with whatever last $? was, which can misleadingly be 0
# from the systemctl that just succeeded). Trap fires reporting status=success
# but the script never reached "Recording deployed SHA" / cleanup steps.
#
# Two-part fix:
#   1. trap '' PIPE — bash itself ignores SIGPIPE; writes to broken pipes return
#      EPIPE (silent failure) instead of killing bash.
#   2. tee --output-error=warn-nopipe — tee continues writing to the log file
#      even when its stdout pipe to dead livinityd breaks.
trap '' PIPE

# ── Phase 33 OBS-01: log file emission ──
# Tee all stdout+stderr to a per-deploy log file and write the machine-readable
# JSON record on exit. Mirrors Phase 32's precheck-fail.json + livos-rollback.sh
# JSON write idiom — Phase 33 UI reads these via system.listUpdateHistory.
HISTORY_DIR="/opt/livos/data/update-history"
DEPLOYED_SHA_FILE="/opt/livos/.deployed-sha"
mkdir -p "$HISTORY_DIR"

LIVOS_UPDATE_START_TS=$(date -u +%s)
LIVOS_UPDATE_START_TS_MS=$(date -u +%s%3N 2>/dev/null || echo $((LIVOS_UPDATE_START_TS * 1000)))
LIVOS_UPDATE_START_ISO_FS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
LIVOS_UPDATE_START_ISO_JSON=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LIVOS_UPDATE_LOG_FILE="${HISTORY_DIR}/update-${LIVOS_UPDATE_START_ISO_FS}-$$-pending.log"
LIVOS_UPDATE_FROM_SHA=$(cat "$DEPLOYED_SHA_FILE" 2>/dev/null | tr -d '[:space:]' || echo "unknown")
LIVOS_UPDATE_TO_SHA=""

exec > >(tee --output-error=warn-nopipe -a "$LIVOS_UPDATE_LOG_FILE") 2>&1

# ── Update safety Layer-B (Phase 273) — independent SIGKILL-immune rollback guard ─
# Layer-A (health_probe_or_rollback, v44.18) runs INSIDE update.sh: if update.sh is
# SIGKILLed during the restart (cgroup-kill — mitigated by --slice/KillMode=mixed
# but defense-in-depth), Layer-A never runs. Layer-B is a systemd transient unit
# (system.slice ⇒ survives livos.service's control-group kill) armed BEFORE the
# restart and disarmed by the EXIT trap. It rolls back ONLY if update.sh died
# without disarming (sentinel present) AND :8080 is unhealthy — safe-or-better.
DEPLOY_GUARD_SCRIPT="/opt/livos/livos-deploy-guard.sh"
DEPLOY_GUARD_SENTINEL="/opt/livos/data/update/deploy-inflight"
DEPLOY_GUARD_UNIT="livos-deploy-guard"
# Invariant: the delay MUST exceed update.sh's own worst-case runtime from arm to
# exit, so a slow-but-surviving deploy disarms BEFORE the guard fires. Layer-A's
# rollback path is the worst case: restart (≤25s) + probe (≤120s) + restore +
# restart (≤25s) + re-probe (≤120s) + tail ≈ 320s. 420s gives ~100s margin. (Even
# if it fires early, the shared flock makes it bail while update.sh is alive.)
DEPLOY_GUARD_DELAY=420

# Heredoc-install the standalone guard (idempotent; mirrors ensure_*_dropin). The
# guard runs AFTER update.sh is dead, so it is fully self-contained (own flock,
# probe, restore, failed.json). QUOTED heredoc ⇒ nothing here expands at install
# time; every $var / $(...) is literal in the emitted script (expands at guard run).
install_deploy_guard() {
    local tmp; tmp=$(mktemp)
    cat > "$tmp" <<'GUARD_EOF'
#!/usr/bin/env bash
# LivOS deploy guard (Layer-B) — armed by update.sh via systemd-run in system.slice
# right before `systemctl restart livos.service`. Fires ONCE. Rolls back to
# last-good ONLY if update.sh died without disarming (sentinel present) AND :8080
# is unhealthy. Race-safe: takes the SAME flock update.sh holds — alive ⇒ bail.
set +e
EXPECTED_ID="${1:-}"
SENTINEL="/opt/livos/data/update/deploy-inflight"
LAST_GOOD_DIR="/opt/.livos-last-good"
LIVOS_DIR="/opt/livos"
LIV_DIR="/opt/liv"
HISTORY_DIR="/opt/livos/data/update-history"
LOCK="/run/lock/livos-update.lock"
log() { echo "[livos-deploy-guard] $*"; }

# 1. Race guard: acquire update.sh's single-flight lock. If update.sh is alive it
#    holds the lock → we can't → bail (it is in control, incl. its Layer-A). A
#    SIGKILL frees the fd → the lock is free → we proceed.
exec 9>"$LOCK" 2>/dev/null || exec 9>/tmp/livos-update.lock 2>/dev/null || true
if command -v flock >/dev/null 2>&1; then
    if ! flock -n 9; then
        log "update.sh still holds the lock — no-op (it is in control)"
        exit 0
    fi
fi

# 2. Sentinel present + matches the deploy we were armed for.
if [[ ! -f "$SENTINEL" ]]; then
    log "no sentinel — update.sh disarmed cleanly; nothing to do"
    exit 0
fi
SENT_ID=""; SENT_ISO_FS=""; SENT_ISO_JSON=""; SENT_FROM=""; SENT_TO=""; SENT_LOG=""
while IFS='=' read -r k v; do
    case "$k" in
        id) SENT_ID="$v" ;;
        iso_fs) SENT_ISO_FS="$v" ;;
        iso_json) SENT_ISO_JSON="$v" ;;
        from_sha) SENT_FROM="$v" ;;
        to_sha) SENT_TO="$v" ;;
        log_path) SENT_LOG="$v" ;;
    esac
done < "$SENTINEL"
if [[ -n "$EXPECTED_ID" && -n "$SENT_ID" && "$EXPECTED_ID" != "$SENT_ID" ]]; then
    log "sentinel id ($SENT_ID) != armed id ($EXPECTED_ID) — stale, ignoring"
    exit 0
fi

responding() {
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 4 http://127.0.0.1:8080/ 2>/dev/null || echo 000)
    [[ "$code" =~ ^(2|3)[0-9][0-9]$ || "$code" == "401" || "$code" == "403" ]]
}

# 3. Probe :8080 ~80s (a stranded box may be mid crash-loop boot). Healthy ⇒
#    never disturb it (safe-or-better) — just clear the sentinel.
for _ in $(seq 1 20); do
    if responding; then
        log "livinityd healthy on :8080 — no rollback needed; clearing sentinel"
        rm -f "$SENTINEL" 2>/dev/null
        exit 0
    fi
    sleep 4
done

# 4. Unhealthy + update.sh dead ⇒ restore last-good (self-contained copy of Layer-A).
log "livinityd NOT responding on :8080 and update.sh did not complete — Layer-B ROLLBACK"
if [[ -d "$LAST_GOOD_DIR/livinityd-source" ]]; then
    rsync -a --delete "$LAST_GOOD_DIR/livinityd-source/" "$LIVOS_DIR/packages/livinityd/source/" 2>/dev/null
    if [[ -d "$LAST_GOOD_DIR/ui-dist" ]]; then
        rm -rf "$LIVOS_DIR/packages/ui/dist" 2>/dev/null
        rsync -a "$LAST_GOOD_DIR/ui-dist/" "$LIVOS_DIR/packages/ui/dist/" 2>/dev/null
        ln -sf "$LIVOS_DIR/packages/ui/dist" "$LIVOS_DIR/packages/livinityd/ui" 2>/dev/null
    fi
    if [[ -d "$LAST_GOOD_DIR/liv-core-dist" && -d "$LIV_DIR/packages/core" ]]; then
        rm -rf "$LIV_DIR/packages/core/dist" 2>/dev/null
        rsync -a "$LAST_GOOD_DIR/liv-core-dist/" "$LIV_DIR/packages/core/dist/" 2>/dev/null
        for store_dir in /opt/livos/node_modules/.pnpm/@liv+core*/; do
            [[ -d "$store_dir" ]] || continue
            tgt="${store_dir}node_modules/@liv/core/dist"
            mkdir -p "$(dirname "$tgt")" 2>/dev/null
            rm -rf "$tgt" 2>/dev/null
            cp -r "$LAST_GOOD_DIR/liv-core-dist" "$tgt" 2>/dev/null
        done
    fi
    # ── Phase 311 WR-01 FIX: widened restore (mirror restore_last_good / Layer-A
    # + livos-manual-rollback.sh / Layer-C). A SIGKILL after `pnpm install` began
    # forward-mutating node_modules is the EXACT scenario Layer-B exists to catch,
    # yet without these two blocks Layer-B would restore OLD code against a
    # forward-mutated node_modules / systemd unit set (Pitfall 4). Keep all three
    # restore bodies in sync. ──
    # node_modules restore (paired with the code so old code never runs against
    # forward-mutated deps).
    if [[ -d "$LAST_GOOD_DIR/node_modules" ]]; then
        rsync -a --delete "$LAST_GOOD_DIR/node_modules/" "$LIVOS_DIR/node_modules/" 2>/dev/null \
            || log "node_modules restore failed — a rollback pnpm install may be required"
    fi
    # systemd units restore (cmp -s per unit; single daemon-reload + restart changed).
    if [[ -d "$LAST_GOOD_DIR/systemd" ]]; then
        _sd_changed=0; _sd_restart=""
        for _sd_unit in "$LAST_GOOD_DIR/systemd"/*.service; do
            [[ -f "$_sd_unit" ]] || continue
            _sd_base=$(basename "$_sd_unit")
            _sd_live="/etc/systemd/system/$_sd_base"
            if ! cmp -s "$_sd_unit" "$_sd_live" 2>/dev/null; then
                cp -a "$_sd_unit" "$_sd_live" 2>/dev/null
                _sd_changed=1; _sd_restart="$_sd_restart $_sd_base"
            fi
        done
        if [[ -d "$LAST_GOOD_DIR/systemd/livos.service.d" ]]; then
            if ! diff -rq "$LAST_GOOD_DIR/systemd/livos.service.d" /etc/systemd/system/livos.service.d >/dev/null 2>&1; then
                rm -rf /etc/systemd/system/livos.service.d 2>/dev/null
                cp -a "$LAST_GOOD_DIR/systemd/livos.service.d" /etc/systemd/system/livos.service.d 2>/dev/null
                _sd_changed=1
            fi
        fi
        if [[ "$_sd_changed" == "1" ]]; then
            systemctl daemon-reload 2>/dev/null
            for _sd_base in $_sd_restart; do systemctl restart "$_sd_base" 2>/dev/null; done
        fi
    fi
    _LIVOS_RUN_USER=$(grep -oP '^User=\K.*' /etc/systemd/system/livos.service 2>/dev/null | head -1); [ -z "$_LIVOS_RUN_USER" ] && _LIVOS_RUN_USER=$(stat -c '%U' /opt/livos 2>/dev/null)
    if id "$_LIVOS_RUN_USER" >/dev/null 2>&1; then
        chown -R "$_LIVOS_RUN_USER:$_LIVOS_RUN_USER" "$LIVOS_DIR/packages/livinityd/source" "$LIVOS_DIR/packages/ui/dist" 2>/dev/null
        [[ -d "$LIV_DIR/packages/core/dist" ]] && chown -R "$_LIVOS_RUN_USER:$_LIVOS_RUN_USER" "$LIV_DIR/packages/core/dist" 2>/dev/null
    fi
    log "last-good restored"
else
    log "no last-good snapshot — cannot restore (manual recovery needed)"
fi
systemctl reset-failed livos.service 2>/dev/null
systemctl restart livos.service 2>/dev/null
rolled_ok=0
for _ in $(seq 1 40); do
    if responding; then rolled_ok=1; break; fi
    sleep 3
done

# 5. failed.json for Past-Deploys visibility (mirrors phase33_finalize schema).
mkdir -p "$HISTORY_DIR" 2>/dev/null
ts_iso="${SENT_ISO_FS:-$(date -u +%Y-%m-%dT%H-%M-%SZ)}"
json_iso="${SENT_ISO_JSON:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
json_path="${HISTORY_DIR}/${ts_iso}-failed.json"
from_field=""; [[ -n "$SENT_FROM" && "$SENT_FROM" != "unknown" ]] && from_field=", \"from_sha\": \"$SENT_FROM\""
to_field="";   [[ -n "$SENT_TO" ]] && to_field=", \"to_sha\": \"$SENT_TO\""
log_field="";  [[ -n "$SENT_LOG" ]] && log_field=", \"log_path\": \"$SENT_LOG\""
reason="Layer-B guard rolled back a stranded/broken deploy (update.sh did not complete)"
[[ "$rolled_ok" == "1" ]] || reason="Layer-B guard ran but rollback did not restore :8080 — manual recovery needed"
cat > "$json_path" 2>/dev/null <<JSON
{
  "timestamp": "${json_iso}",
  "status": "failed"${from_field}${to_field},
  "guard": "layer-b"${log_field},
  "reason": "${reason}"
}
JSON
chmod 644 "$json_path" 2>/dev/null
rm -f "$SENTINEL" 2>/dev/null
log "Layer-B complete (rolled_ok=$rolled_ok) — wrote $json_path"
exit 0
GUARD_EOF
    if [[ ! -f "$DEPLOY_GUARD_SCRIPT" ]] || ! cmp -s "$tmp" "$DEPLOY_GUARD_SCRIPT"; then
        mv "$tmp" "$DEPLOY_GUARD_SCRIPT" 2>/dev/null || { rm -f "$tmp"; return 0; }
        chmod +x "$DEPLOY_GUARD_SCRIPT" 2>/dev/null || true
    else
        rm -f "$tmp"
    fi
}

# ── Phase 311-02 (UPDSAFE-04): operator manual-rollback script installer ──────
# Ships a standalone, self-contained /opt/livos/livos-manual-rollback.sh via the
# SAME heredoc-install idiom as install_deploy_guard (mktemp -> cmp -s idempotent
# install -> chmod +x). The emitted script does NOT source update.sh (matches
# Layer-B's anti-source precedent); it duplicates restore_last_good's body (incl.
# the node_modules + systemd restore + non-hardcoded run-user chown), does flock
# single-flight on the SAME lock update.sh/Layer-B use, restarts + probes
# livos.service, and writes a rolled-back history JSON. 311-03's admin-gated tRPC
# mutation shells out to it via `sudo -n`. QUOTED heredoc => nothing expands at
# install time; every $var / $(...) is literal in the emitted script.
MANUAL_ROLLBACK_SCRIPT="/opt/livos/livos-manual-rollback.sh"
install_manual_rollback_script() {
    local tmp; tmp=$(mktemp)
    cat > "$tmp" <<'ROLLBACK_EOF'
#!/usr/bin/env bash
# LivOS manual rollback (UPDSAFE-04, Phase 311-02) — operator-triggered restore to
# the last-good snapshot. Self-contained (does NOT source update.sh): own flock
# single-flight, own restore body, own probe, own history JSON. Invoked as
# `sudo -n bash /opt/livos/livos-manual-rollback.sh` from the admin-gated tRPC
# mutation shipped in 311-03. Refuses (non-zero) if no snapshot exists. Restores
# CODE + node_modules + systemd units only — it performs NO DB rollback (the
# additive-only-schema invariant makes the live schema forward-compatible).
set -uo pipefail

LAST_GOOD_DIR="/opt/.livos-last-good"
LIVOS_DIR="/opt/livos"
LIV_DIR="/opt/liv"
HISTORY_DIR="/opt/livos/data/update-history"
LOCK="/run/lock/livos-update.lock"
log() { echo "[livos-manual-rollback] $*"; }

# 0. Refuse when there is no snapshot to roll back to.
if [[ ! -d "$LAST_GOOD_DIR/livinityd-source" ]]; then
    log "ERROR: no last-good snapshot at $LAST_GOOD_DIR — nothing to roll back to"
    exit 2
fi

# 1. Single-flight: take the SAME lock update.sh/Layer-B hold, so a manual
#    rollback can never race a concurrent auto-update (which would corrupt rsync).
exec 9>"$LOCK" 2>/dev/null || exec 9>/tmp/livos-update.lock 2>/dev/null || true
if command -v flock >/dev/null 2>&1; then
    if ! flock -n 9; then
        log "ERROR: an update or rollback is already in progress (lock held) — aborting"
        exit 3
    fi
fi

START_ISO_FS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
START_ISO_JSON=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FROM_SHA=$(cat /opt/livos/.deployed-sha 2>/dev/null | tr -d '[:space:]')
TO_SHA=$(sed -E 's/.*"sha"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/' "$LAST_GOOD_DIR/manifest.json" 2>/dev/null)
[[ "$TO_SHA" == *"{"* ]] && TO_SHA=""

# 2. Restore the load-bearing runtime (duplicated restore_last_good body).
log "Restoring last-good source + UI dist + liv-core dist + node_modules + systemd units..."
rsync -a --delete "$LAST_GOOD_DIR/livinityd-source/" "$LIVOS_DIR/packages/livinityd/source/" 2>/dev/null || true
if [[ -d "$LAST_GOOD_DIR/ui-dist" ]]; then
    rm -rf "$LIVOS_DIR/packages/ui/dist" 2>/dev/null || true
    rsync -a "$LAST_GOOD_DIR/ui-dist/" "$LIVOS_DIR/packages/ui/dist/" 2>/dev/null || true
    ln -sf "$LIVOS_DIR/packages/ui/dist" "$LIVOS_DIR/packages/livinityd/ui" 2>/dev/null || true
fi
if [[ -d "$LAST_GOOD_DIR/liv-core-dist" && -d "$LIV_DIR/packages/core" ]]; then
    rm -rf "$LIV_DIR/packages/core/dist" 2>/dev/null || true
    rsync -a "$LAST_GOOD_DIR/liv-core-dist/" "$LIV_DIR/packages/core/dist/" 2>/dev/null || true
    for store_dir in /opt/livos/node_modules/.pnpm/@liv+core*/; do
        [[ -d "$store_dir" ]] || continue
        tgt="${store_dir}node_modules/@liv/core/dist"
        mkdir -p "$(dirname "$tgt")" 2>/dev/null || true
        rm -rf "$tgt" 2>/dev/null || true
        cp -r "$LAST_GOOD_DIR/liv-core-dist" "$tgt" 2>/dev/null || true
    done
fi
# node_modules restore (paired with the code so old code never runs against
# forward-mutated deps).
if [[ -d "$LAST_GOOD_DIR/node_modules" ]]; then
    rsync -a --delete "$LAST_GOOD_DIR/node_modules/" "$LIVOS_DIR/node_modules/" 2>/dev/null || true
fi
# systemd units restore (cmp -s per unit; single daemon-reload + restart changed).
if [[ -d "$LAST_GOOD_DIR/systemd" ]]; then
    _sd_changed=0; _sd_restart=""
    for _sd_unit in "$LAST_GOOD_DIR/systemd"/*.service; do
        [[ -f "$_sd_unit" ]] || continue
        _sd_base=$(basename "$_sd_unit")
        _sd_live="/etc/systemd/system/$_sd_base"
        if ! cmp -s "$_sd_unit" "$_sd_live" 2>/dev/null; then
            cp -a "$_sd_unit" "$_sd_live" 2>/dev/null || true
            _sd_changed=1; _sd_restart="$_sd_restart $_sd_base"
        fi
    done
    if [[ -d "$LAST_GOOD_DIR/systemd/livos.service.d" ]]; then
        if ! diff -rq "$LAST_GOOD_DIR/systemd/livos.service.d" /etc/systemd/system/livos.service.d >/dev/null 2>&1; then
            rm -rf /etc/systemd/system/livos.service.d 2>/dev/null || true
            cp -a "$LAST_GOOD_DIR/systemd/livos.service.d" /etc/systemd/system/livos.service.d 2>/dev/null || true
            _sd_changed=1
        fi
    fi
    if [[ "$_sd_changed" == "1" ]]; then
        systemctl daemon-reload 2>/dev/null || true
        for _sd_base in $_sd_restart; do systemctl restart "$_sd_base" 2>/dev/null || true; done
    fi
fi
# Non-hardcoded run-user chown — derive the run user from livos.service User=
# (a hardcoded owner would crash-loop boxes installed under other accounts).
_LIVOS_RUN_USER=$(grep -oP '^User=\K.*' /etc/systemd/system/livos.service 2>/dev/null | head -1)
[ -z "$_LIVOS_RUN_USER" ] && _LIVOS_RUN_USER=$(stat -c '%U' /opt/livos 2>/dev/null)
if id "$_LIVOS_RUN_USER" >/dev/null 2>&1; then
    chown -R "$_LIVOS_RUN_USER:$_LIVOS_RUN_USER" "$LIVOS_DIR/packages/livinityd/source" "$LIVOS_DIR/packages/ui/dist" 2>/dev/null || true
    [[ -d "$LIV_DIR/packages/core/dist" ]] && chown -R "$_LIVOS_RUN_USER:$_LIVOS_RUN_USER" "$LIV_DIR/packages/core/dist" 2>/dev/null || true
fi
log "last-good restored"

# 3. Restart livinityd + probe :8080/ then :8080/healthz/full (same shape/budgets
#    as health_probe_or_rollback). A non-200-but-non-503 /healthz/full is treated
#    as "probe not applicable" (pre-A2 build) — never a rollback-loop trigger.
responding() {
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 4 http://127.0.0.1:8080/ 2>/dev/null || echo 000)
    [[ "$code" =~ ^(2|3)[0-9][0-9]$ || "$code" == "401" || "$code" == "403" ]]
}
systemctl reset-failed livos.service 2>/dev/null || true
systemctl restart livos.service 2>/dev/null || true
rolled_ok=0
for _ in $(seq 1 40); do
    if responding; then rolled_ok=1; break; fi
    sleep 3
done
if [[ "$rolled_ok" == "1" ]]; then
    for _ in $(seq 1 40); do
        fcode=$(curl -s -o /dev/null -w '%{http_code}' -m 4 http://127.0.0.1:8080/healthz/full 2>/dev/null || echo 000)
        [[ "$fcode" == "503" ]] || break
        sleep 3
    done
fi

# 4. Record a rolled-back history JSON (phase33_finalize schema + trigger=manual).
#    'rolled-back' is already wired to a destructive badge in past-deploys-table.tsx.
mkdir -p "$HISTORY_DIR" 2>/dev/null || true
json_path="${HISTORY_DIR}/${START_ISO_FS}-rollback.json"
from_field=""; [[ -n "$FROM_SHA" ]] && from_field=", \"from_sha\": \"$FROM_SHA\""
to_field="";   [[ -n "$TO_SHA" ]] && to_field=", \"to_sha\": \"$TO_SHA\""
reason="Operator manual rollback to last-good (code + deps + systemd units restored; DB schema NOT reverted)"
[[ "$rolled_ok" == "1" ]] || reason="Manual rollback ran but :8080 did not recover — manual recovery may be needed"
cat > "$json_path" 2>/dev/null <<JSON
{
  "timestamp": "${START_ISO_JSON}",
  "status": "rolled-back"${from_field}${to_field},
  "trigger": "manual",
  "reason": "${reason}"
}
JSON
chmod 644 "$json_path" 2>/dev/null || true
log "manual rollback complete (rolled_ok=$rolled_ok) — wrote $json_path"
[[ "$rolled_ok" == "1" ]] && exit 0 || exit 1
ROLLBACK_EOF
    if [[ ! -f "$MANUAL_ROLLBACK_SCRIPT" ]] || ! cmp -s "$tmp" "$MANUAL_ROLLBACK_SCRIPT"; then
        mv "$tmp" "$MANUAL_ROLLBACK_SCRIPT" 2>/dev/null || { rm -f "$tmp"; return 0; }
        chmod +x "$MANUAL_ROLLBACK_SCRIPT" 2>/dev/null || true
    else
        rm -f "$tmp"
    fi
}

# Arm the guard right before the risky restart. Writes the sentinel (deploy
# metadata for the failed.json) and a one-shot system.slice transient unit.
arm_deploy_guard() {
    if [[ "${LIVOS_DISABLE_DEPLOY_GUARD:-}" == "1" ]]; then
        warn "Layer-B deploy guard disabled (LIVOS_DISABLE_DEPLOY_GUARD=1) — skipping arm"
        return 0
    fi
    if ! command -v systemd-run >/dev/null 2>&1; then
        warn "systemd-run unavailable — Layer-B guard not armed (Layer-A still protects)"
        return 0
    fi
    systemctl stop "${DEPLOY_GUARD_UNIT}.timer" "${DEPLOY_GUARD_UNIT}.service" 2>/dev/null || true
    systemctl reset-failed "${DEPLOY_GUARD_UNIT}.timer" "${DEPLOY_GUARD_UNIT}.service" 2>/dev/null || true
    install_deploy_guard
    mkdir -p "$(dirname "$DEPLOY_GUARD_SENTINEL")" 2>/dev/null || true
    cat > "$DEPLOY_GUARD_SENTINEL" <<SENT
id=${LIVOS_UPDATE_START_TS}
iso_fs=${LIVOS_UPDATE_START_ISO_FS}
iso_json=${LIVOS_UPDATE_START_ISO_JSON}
from_sha=${LIVOS_UPDATE_FROM_SHA}
to_sha=${LIVOS_UPDATE_TO_SHA}
log_path=${LIVOS_UPDATE_LOG_FILE}
SENT
    if systemd-run --slice=system.slice --collect --quiet \
        --on-active="${DEPLOY_GUARD_DELAY}" \
        --unit="${DEPLOY_GUARD_UNIT}" \
        --description="LivOS deploy guard (Layer-B rollback)" \
        -- "$DEPLOY_GUARD_SCRIPT" "${LIVOS_UPDATE_START_TS}" 2>/dev/null; then
        ok "Layer-B deploy guard armed (independent rollback in ${DEPLOY_GUARD_DELAY}s if update.sh is SIGKILLed)"
    else
        warn "Could not arm Layer-B deploy guard via systemd-run — Layer-A still protects"
        rm -f "$DEPLOY_GUARD_SENTINEL" 2>/dev/null || true
    fi
}

# Disarm: stop the transient unit + drop the sentinel. Called by the EXIT trap, so
# EVERY clean exit (success, Layer-A rollback, precheck-fail) cancels Layer-B — only
# a SIGKILL (no trap) leaves it armed, which is exactly when Layer-B must fire.
disarm_deploy_guard() {
    systemctl stop "${DEPLOY_GUARD_UNIT}.timer" "${DEPLOY_GUARD_UNIT}.service" 2>/dev/null || true
    systemctl reset-failed "${DEPLOY_GUARD_UNIT}.timer" "${DEPLOY_GUARD_UNIT}.service" 2>/dev/null || true
    rm -f "$DEPLOY_GUARD_SENTINEL" 2>/dev/null || true
}

phase33_finalize() {
    local exit_code=$?
    # Layer-B (273): cancel the independent guard on ANY clean exit (capture
    # exit_code FIRST so the systemctl calls below don't clobber $?).
    disarm_deploy_guard 2>/dev/null || true
    local end_ts end_ts_ms duration_ms status reason_field
    end_ts=$(date -u +%s)
    end_ts_ms=$(date -u +%s%3N 2>/dev/null || echo $((end_ts * 1000)))
    duration_ms=$((end_ts_ms - LIVOS_UPDATE_START_TS_MS))

    # Skip-on-precheck-fail (per O-08 / R-06): if Phase 32 precheck() wrote a
    # precheck-fail row with our START_ISO_FS prefix, rename .pending log to
    # <ts>-precheck-fail.log + backfill log_path into the existing JSON.
    local precheck_json="${HISTORY_DIR}/${LIVOS_UPDATE_START_ISO_FS}-precheck-fail.json"
    if [[ -f "$precheck_json" ]]; then
        local pf_log="${HISTORY_DIR}/${LIVOS_UPDATE_START_ISO_FS}-precheck-fail.log"
        if [[ -f "$LIVOS_UPDATE_LOG_FILE" ]]; then
            mv "$LIVOS_UPDATE_LOG_FILE" "$pf_log" 2>/dev/null || true
        fi
        if ! grep -q '"log_path"' "$precheck_json" 2>/dev/null; then
            local tmp; tmp=$(mktemp)
            # Insert "log_path": "<pf_log>" before the closing brace. Two-pass
            # awk: collect all lines, then re-emit with the extra field inserted
            # before the final '}'. Robust against trailing newlines and any
            # field ordering inside the JSON body.
            awk -v lp="$pf_log" '
                { lines[NR] = $0 }
                END {
                    last_brace = 0
                    for (i = NR; i >= 1; i--) {
                        if (lines[i] ~ /^[[:space:]]*\}[[:space:]]*$/) { last_brace = i; break }
                    }
                    if (last_brace == 0) {
                        for (i = 1; i <= NR; i++) print lines[i]
                    } else {
                        for (i = 1; i < last_brace; i++) {
                            if (i == last_brace - 1) {
                                line = lines[i]
                                if (line !~ /,[[:space:]]*$/) {
                                    sub(/[[:space:]]*$/, "", line)
                                    line = line ","
                                }
                                print line
                            } else {
                                print lines[i]
                            }
                        }
                        print "  \"log_path\": \"" lp "\""
                        for (i = last_brace; i <= NR; i++) print lines[i]
                    }
                }
            ' "$precheck_json" > "$tmp" 2>/dev/null && mv "$tmp" "$precheck_json" 2>/dev/null || rm -f "$tmp"
            chmod 644 "$precheck_json" 2>/dev/null || true
        fi
        return
    fi

    # v29.0-hotpatch: defense-in-depth — exit_code=0 alone is not enough to
    # claim success. The script may exit 0 prematurely (e.g., bash truly
    # completing after a no-op tail) without reaching "Recording deployed SHA"
    # or cleanup. Only declare success if the main flow set the completion
    # sentinel below ("Recording deployed SHA" step + cleanup reached).
    if (( exit_code == 0 )) && [[ "${LIVOS_UPDATE_COMPLETED:-0}" == "1" ]]; then
        status="success"
    else
        status="failed"
    fi

    local final_log_file="$LIVOS_UPDATE_LOG_FILE"
    if [[ -n "$LIVOS_UPDATE_TO_SHA" ]]; then
        final_log_file="${HISTORY_DIR}/update-${LIVOS_UPDATE_START_ISO_FS}-${LIVOS_UPDATE_TO_SHA:0:7}.log"
        mv "$LIVOS_UPDATE_LOG_FILE" "$final_log_file" 2>/dev/null || true
    fi

    # IMPORTANT: extract reason BEFORE appending the [PHASE33-SUMMARY] line.
    # The summary line contains the literal substring "failed" which would
    # match the reason regex below and `tail -1` would pick the summary itself
    # instead of the real error line.
    reason_field=""
    if [[ "$status" == "failed" ]]; then
        local last_err
        last_err=$(grep -E '\[FAIL\]|fail|Error|error' "$final_log_file" 2>/dev/null \
            | grep -vF '[PHASE33-SUMMARY]' \
            | tail -1 | tr -d '"' | cut -c1-200)
        reason_field=", \"reason\": \"${last_err:-unknown error (exit $exit_code)}\""
    fi

    {
        echo ""
        echo "[PHASE33-SUMMARY] status=$status exit_code=$exit_code duration_seconds=$((duration_ms / 1000))"
    } >> "$final_log_file" 2>/dev/null || true

    local from_field=""
    [[ -n "$LIVOS_UPDATE_FROM_SHA" ]] && [[ "$LIVOS_UPDATE_FROM_SHA" != "unknown" ]] && from_field=", \"from_sha\": \"$LIVOS_UPDATE_FROM_SHA\""
    local to_field=""
    [[ -n "$LIVOS_UPDATE_TO_SHA" ]] && to_field=", \"to_sha\": \"$LIVOS_UPDATE_TO_SHA\""

    # Phase 311-04 (UPDSAFE-02): warn-only signature verdict, built the same
    # conditional way from_field/to_field are. Populated only when
    # livos_verify_fetched_ref() set a status this run (empty on a precheck-fail
    # exit that never reached it — the object is then simply absent, valid JSON).
    # Local update-history JSON is the ONLY telemetry sink (operator-locked: no
    # cross-box phone-home / control-plane fan-out — see 311-RESEARCH Q3).
    local sigverify_field=""
    if [[ -n "${_LIVOS_SIGVERIFY_STATUS:-}" ]]; then
        sigverify_field=", \"signature_verification\": {\"status\": \"${_LIVOS_SIGVERIFY_STATUS}\", \"source\": \"${_LIVOS_SIGVERIFY_SOURCE:-}\", \"expected\": \"${_LIVOS_SIGVERIFY_EXPECTED:-}\", \"actual\": \"${_LIVOS_SIGVERIFY_ACTUAL:-}\"}"
    fi

    local json_path="${HISTORY_DIR}/${LIVOS_UPDATE_START_ISO_FS}-${status}.json"
    cat > "$json_path" <<JSON
{
  "timestamp": "${LIVOS_UPDATE_START_ISO_JSON}",
  "status": "${status}"${from_field}${to_field}${sigverify_field},
  "duration_ms": ${duration_ms},
  "log_path": "${final_log_file}"${reason_field}
}
JSON
    chmod 644 "$json_path" 2>/dev/null || true
}
trap phase33_finalize EXIT
trap 'exit 130' INT TERM HUP


# ── Constants ─────────────────────────────────────────────
LIVOS_DIR="/opt/livos"
LIV_DIR="/opt/liv"
REPO_URL="https://github.com/utopusc/livinity-io.git"

# ── Colors ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ── Phase 32 REL-01: precheck ──
# Refuses to start update.sh if the host can't possibly succeed.
# Three guards: disk free >= 2GB on /opt/livos, /opt/livos writable,
# api.github.com/repos/utopusc/livinity-io reachable within 5s.
# Output format `PRECHECK-FAIL: <reason>` MUST stay parser-friendly — Phase 34
# UX-01 toast handler matches `^PRECHECK-FAIL: (.+)$` regex on this string.
# Single-line, < 200 chars, no ANSI codes.
#
# On any failure: writes <iso-ts>-precheck-fail.json to update-history/ AND
# exits 1 (Phase 33 OBS-02 will render these as "deploy attempted, blocked").
precheck() {
    local start_ts end_ts duration_ms iso_ts history_dir
    start_ts=$(date -u +%s%3N 2>/dev/null || echo $(($(date -u +%s) * 1000)))
    iso_ts=$(date -u +%Y-%m-%dT%H-%M-%SZ)
    history_dir="/opt/livos/data/update-history"

    # FIRST action: ensure history dir exists (so the failure-row write below
    # has a target). Phase 33 also creates this — idempotent.
    mkdir -p "$history_dir" 2>/dev/null || true

    local fail_reason=""

    # Guard 1: disk free >= 2 GB on /opt/livos's mount
    local avail_gb
    avail_gb=$(df -BG -P /opt/livos 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4+0}')
    if [[ -z "${avail_gb:-}" ]]; then
        fail_reason="PRECHECK-FAIL: cannot determine free disk space on /opt/livos (df failed — check mountpoint exists)"
    elif (( avail_gb < 2 )); then
        fail_reason="PRECHECK-FAIL: insufficient disk space on /opt/livos (need >=2GB, have ${avail_gb}GB)"
    fi

    # Guard 2: /opt/livos writable (only if guard 1 passed)
    if [[ -z "$fail_reason" ]]; then
        local probe
        if ! probe=$(mktemp -p /opt/livos .precheck-XXXXXX 2>/dev/null); then
            fail_reason="PRECHECK-FAIL: /opt/livos is not writable (check mount/perms — root must own dir)"
        else
            rm -f "$probe"
        fi
    fi

    # Guard 3: GitHub reachable (only if guards 1+2 passed)
    # Check github.com (the CLONE host — what actually matters), not
    # api.github.com: the unauthenticated API is rate-limited to 60 req/hr/IP and
    # returns 403 from residential IPs, which would falsely block a deploy even
    # though `git clone` from github.com works fine. Fall back to the API only if
    # the repo page check fails (e.g. transient DNS), so the guard still catches
    # genuine "no network" cases.
    if [[ -z "$fail_reason" ]]; then
        local curl_exit=0
        curl -fsI -m 5 https://github.com/utopusc/livinity-io >/dev/null 2>&1 \
            || curl -fsI -m 5 https://api.github.com/repos/utopusc/livinity-io >/dev/null 2>&1 \
            || curl_exit=$?
        if (( curl_exit != 0 )); then
            fail_reason="PRECHECK-FAIL: GitHub unreachable (curl exit ${curl_exit} — check network)"
        fi
    fi

    # On failure: write precheck-failed.json + emit reason to stderr + exit 1
    if [[ -n "$fail_reason" ]]; then
        end_ts=$(date -u +%s%3N 2>/dev/null || echo $(($(date -u +%s) * 1000)))
        duration_ms=$((end_ts - start_ts))
        local json_path="${history_dir}/${iso_ts}-precheck-fail.json"
        # Escape double-quotes in reason for JSON safety
        local escaped_reason=${fail_reason//\"/\\\"}
        # Wrap the heredoc redirect in a brace group so bash's own
        # "no such file or directory" complaint is also silenced when the
        # history dir couldn't be created (e.g. precheck running on a host
        # where /opt/livos does not exist — test environments). The
        # PRECHECK-FAIL stderr message below is the contract; the JSON write
        # is best-effort logging that Phase 33 consumes.
        { cat > "$json_path" <<JSON
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "precheck-failed",
  "reason": "${escaped_reason}",
  "duration_ms": ${duration_ms}
}
JSON
        } 2>/dev/null
        chmod 644 "$json_path" 2>/dev/null || true
        echo "$fail_reason" >&2
        exit 1
    fi
}

# ── Phase 32 REL-02 prep: SHA rotation ──
# Shifts current /opt/livos/.deployed-sha to .deployed-sha.previous BEFORE
# update.sh writes the new SHA. Plan 32-02's livos-rollback.sh reads
# .deployed-sha.previous to know which SHA to revert to.
# No-op on first-ever deploy (no .deployed-sha to rotate).
record_previous_sha() {
    if [[ -f /opt/livos/.deployed-sha ]]; then
        cp /opt/livos/.deployed-sha /opt/livos/.deployed-sha.previous
        chmod 644 /opt/livos/.deployed-sha.previous 2>/dev/null || true
    fi
}

# ── Phase 31 BUILD-01: verify_build helper ──
# Asserts that a build produced non-empty output. Call AFTER every build
# invocation. Failure prints `BUILD-FAIL: <pkg> produced empty <dir>` to stderr
# and exits 1 — kills the silent-success lie that BACKLOG 999.5 tracked.
# Usage: verify_build "@livos/config" "/opt/livos/packages/config/dist"
verify_build() {
    local pkg="$1"
    local outdir="$2"
    if [[ ! -d "$outdir" ]] || [[ -z "$(find "$outdir" -type f 2>/dev/null | head -1)" ]]; then
        echo "BUILD-FAIL: $pkg produced empty $outdir" >&2
        exit 1
    fi
    echo "[VERIFY] $pkg dist OK ($outdir)"
}

step()  { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ── Phase 277.1 — desktop-user / operator-domain derivation (NO hardcoded `bruce`) ──
# LivOS is installed by many operators under arbitrary usernames + domains; nothing
# may assume `bruce` / `bruce.livinity.io`. Derive the desktop identity ONCE and reuse.
# Chain (no literal username): livos.service User= (source of truth) → first uid>=1000
# login → owner of /opt/livos → name of uid 1000.
_set_desktop_identity() {
    _DESKTOP_USER=$(grep -oP '^User=\K.*' /etc/systemd/system/livos.service 2>/dev/null | head -1)
    [[ -n "$_DESKTOP_USER" ]] || _DESKTOP_USER=$(getent passwd | awk -F: '$3>=1000 && $3<65534 {print $1; exit}')
    [[ -n "$_DESKTOP_USER" ]] || _DESKTOP_USER=$(stat -c '%U' /opt/livos 2>/dev/null)
    # Reject root/UNKNOWN from the weak last-resort tiers — root would mis-own desktop
    # assets (sudo -u root / chown root:root). Fall to the canonical uid-1000 operator.
    [[ -n "$_DESKTOP_USER" && "$_DESKTOP_USER" != "UNKNOWN" && "$_DESKTOP_USER" != "root" ]] || _DESKTOP_USER=$(id -un 1000 2>/dev/null)
    _DESKTOP_HOME=$(getent passwd "$_DESKTOP_USER" 2>/dev/null | cut -d: -f6)
    [[ -n "$_DESKTOP_HOME" ]] || _DESKTOP_HOME="/home/$_DESKTOP_USER"
}

# Resolve the operator's public domain (NO hardcoded bruce.livinity.io). Source of
# truth: livinityd persists it to Redis `livos:domain:config` (.domain). Echoes the
# domain or empty (callers must treat empty as "skip the domain-specific step").
_resolve_operator_domain() {
    local url pw dom=""
    if command -v redis-cli >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
        url=$(grep -E '^REDIS_URL=' /opt/livos/.env 2>/dev/null | cut -d= -f2-)
        if [[ -n "$url" ]]; then
            pw=$(echo "$url" | sed -E 's|redis://[^:]*:([^@]+)@.*|\1|')
            dom=$(redis-cli -a "$pw" --no-auth-warning GET livos:domain:config 2>/dev/null | jq -r '.domain // empty' 2>/dev/null)
        fi
    fi
    echo "$dom"
}

# ── Atomic-update safety net (2026-06-15) ─────────────────────────────────────
# Root cause of "update error → Cloudflare 502, UI inaccessible": update.sh
# rsyncs the new livinityd source OVER the live tree (no build/typecheck gate —
# livinityd runs tsx on source) and then UNCONDITIONALLY `systemctl restart
# livos.service`. A bad import/syntax/dep in the new source → livinityd throws
# on boot → :8080 never binds → Caddy has no origin → CF 502, with no probe and
# no rollback (the box stays bricked; with no admin to recover, the user is
# locked out). These helpers add: a last-good SNAPSHOT taken before the first
# rsync, a post-restart HTTP HEALTH PROBE, and AUTO-ROLLBACK to the snapshot on
# failure — so a failed update always lands back on a serving version.
LAST_GOOD_DIR="/opt/.livos-last-good"

# Capture the currently-deployed (working) runtime artifacts livinityd needs to
# serve the UI: its tsx source, the built UI dist, and the liv-core dist it
# imports. Taken at Step 2 BEFORE any in-place overwrite, so it reflects the
# last version that actually booted. Best-effort; never aborts the run.
snapshot_last_good() {
    info "Snapshotting last-good runtime (rollback safety)..."
    rm -rf "$LAST_GOOD_DIR" 2>/dev/null || true
    mkdir -p "$LAST_GOOD_DIR" 2>/dev/null || true
    local have_src=0
    if [[ -d "$LIVOS_DIR/packages/livinityd/source" ]]; then
        if rsync -a --delete "$LIVOS_DIR/packages/livinityd/source/" "$LAST_GOOD_DIR/livinityd-source/" 2>/dev/null; then
            have_src=1
        fi
    fi
    if [[ -d "$LIVOS_DIR/packages/ui/dist" ]]; then
        rsync -a --delete "$LIVOS_DIR/packages/ui/dist/" "$LAST_GOOD_DIR/ui-dist/" 2>/dev/null || true
    fi
    if [[ -d "$LIV_DIR/packages/core/dist" ]]; then
        rsync -a --delete "$LIV_DIR/packages/core/dist/" "$LAST_GOOD_DIR/liv-core-dist/" 2>/dev/null || true
    fi
    # ── Phase 311-02 (UPDSAFE-04): widen scope — node_modules + a UI manifest ──
    # node_modules hardlink snapshot: /opt is a single mount, so `cp -al` is a
    # metadata-only clone (no byte copy, near-instant) — it pairs the OLD deps
    # with the OLD code on rollback, so a restore never runs last-good source
    # against a `pnpm install`-mutated node_modules (Pitfall 4 point 1).
    #
    # Phase 311 WR-02 — SHARED-INODE ASSUMPTION (documented): `cp -al` hardlinks,
    # so the snapshot and the live tree share the SAME inode for every file until
    # one side replaces the directory entry. This is safe against pnpm's
    # unlink+recreate / content-addressable-store repointing (a NEW inode), which
    # leaves the snapshot's hardlink pointing at the old content untouched. It is
    # NOT safe against an IN-PLACE write to an existing path (e.g. a native
    # postinstall/node-gyp rewriting build/Release/*.node at a fixed path), which
    # would mutate the shared inode and silently poison the last-good copy. No
    # such in-place-write step exists in this repo's dependency tree today; if one
    # is ever added, switch this to a full `cp -a` (correctness over snapshot
    # speed) — see 311-REVIEW WR-02 / deferred-items.md.
    if [[ -d "$LIVOS_DIR/node_modules" ]]; then
        rm -rf "$LAST_GOOD_DIR/node_modules" 2>/dev/null || true
        cp -al "$LIVOS_DIR/node_modules" "$LAST_GOOD_DIR/node_modules" 2>/dev/null \
            || warn "node_modules hardlink snapshot failed (rollback will re-run pnpm install)"
    fi
    # manifest.json — lets the UI label the rollback target. Capture the CURRENTLY-
    # deployed sha/tag: these files still hold the OLD values at snapshot time
    # (.deployed-sha is advanced only on success, much later at "Recording deployed
    # SHA"), plus a schema fingerprint (sha256 digest, NOT schema content) for
    # telemetry / the rollback-time schema-drift warning (311-03).
    local _lg_sha _lg_tag _lg_schema
    _lg_sha=$(cat /opt/livos/.deployed-sha 2>/dev/null | tr -d '[:space:]')
    _lg_tag=$(cat /opt/livos/.deployed-release 2>/dev/null | tr -d '[:space:]')
    _lg_schema=$(sha256sum "$LIVOS_DIR/packages/livinityd/source/modules/database/schema.sql" 2>/dev/null | cut -d' ' -f1)
    cat > "$LAST_GOOD_DIR/manifest.json" <<MANIFEST 2>/dev/null || true
{"sha": "${_lg_sha}", "tag": "${_lg_tag}", "snapshotted_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "schema_hash": "${_lg_schema}"}
MANIFEST
    if (( have_src == 1 )); then
        ok "Last-good snapshot saved to $LAST_GOOD_DIR"
    else
        warn "No existing livinityd source to snapshot (first deploy?) — rollback unavailable this run"
    fi
}

# ── Phase 311-02 (UPDSAFE-04): pre-update systemd-unit capture ────────────────
# livos-egress.service + ydotoold.service are rewritten UNCONDITIONALLY in Step 1b
# (below), which runs BEFORE snapshot_last_good()'s call site — so a capture taken
# at/after that point would record the NEW (this-run) units, not the genuine
# pre-update ones. This function is therefore called EARLY (before Step 1b) and
# writes to the SIBLING dir "$LAST_GOOD_DIR.systemd-pre" (NOT a child of
# $LAST_GOOD_DIR), so snapshot_last_good()'s `rm -rf "$LAST_GOOD_DIR"` cannot wipe
# it; it is folded into $LAST_GOOD_DIR/systemd right after that rm -rf. Explicit
# path list (never a glob) — small text files, plain cp -a. Best-effort.
snapshot_systemd_units() {
    # Phase 311 IN-02 — clear the sibling capture dir before repopulating, so a
    # unit that was deliberately UNINSTALLED between runs cannot linger here (the
    # cp -a loop below only touches units that still exist on disk) and get folded
    # into $LAST_GOOD_DIR/systemd + resurrected by a later rollback. Mirrors
    # snapshot_last_good()'s own `rm -rf "$LAST_GOOD_DIR"` reset.
    rm -rf "$LAST_GOOD_DIR.systemd-pre" 2>/dev/null || true
    mkdir -p "$LAST_GOOD_DIR.systemd-pre" 2>/dev/null || true
    local f
    for f in /etc/systemd/system/livos.service \
             /etc/systemd/system/livos-egress.service \
             /etc/systemd/system/ydotoold.service \
             /etc/systemd/system/livos-app-liv-ai.service \
             /etc/systemd/system/liv-claw-gateway.service \
             /etc/systemd/system/liv-assistant.service; do
        [[ -f "$f" ]] && cp -a "$f" "$LAST_GOOD_DIR.systemd-pre/$(basename "$f")" 2>/dev/null
    done
    [[ -d /etc/systemd/system/livos.service.d ]] && cp -a /etc/systemd/system/livos.service.d "$LAST_GOOD_DIR.systemd-pre/livos.service.d" 2>/dev/null
}

# Restore the load-bearing runtime from the snapshot. Returns 1 (no rollback
# possible) when no snapshot exists.
restore_last_good() {
    if [[ ! -d "$LAST_GOOD_DIR/livinityd-source" ]]; then
        warn "No last-good snapshot present — cannot roll back"
        return 1
    fi
    warn "Restoring last-good livinityd source + UI dist + liv-core dist from $LAST_GOOD_DIR..."
    rsync -a --delete "$LAST_GOOD_DIR/livinityd-source/" "$LIVOS_DIR/packages/livinityd/source/" 2>/dev/null || true
    if [[ -d "$LAST_GOOD_DIR/ui-dist" ]]; then
        rm -rf "$LIVOS_DIR/packages/ui/dist" 2>/dev/null || true
        rsync -a "$LAST_GOOD_DIR/ui-dist/" "$LIVOS_DIR/packages/ui/dist/" 2>/dev/null || true
        ln -sf "$LIVOS_DIR/packages/ui/dist" "$LIVOS_DIR/packages/livinityd/ui" 2>/dev/null || true
    fi
    if [[ -d "$LAST_GOOD_DIR/liv-core-dist" && -d "$LIV_DIR/packages/core" ]]; then
        rm -rf "$LIV_DIR/packages/core/dist" 2>/dev/null || true
        rsync -a "$LAST_GOOD_DIR/liv-core-dist/" "$LIV_DIR/packages/core/dist/" 2>/dev/null || true
        # Re-propagate to every pnpm-store @liv+core resolution dir (mirror Step 5).
        local store_dir tgt
        for store_dir in /opt/livos/node_modules/.pnpm/@liv+core*/; do
            [[ -d "$store_dir" ]] || continue
            tgt="${store_dir}node_modules/@liv/core/dist"
            mkdir -p "$(dirname "$tgt")" 2>/dev/null || true
            rm -rf "$tgt" 2>/dev/null || true
            cp -r "$LAST_GOOD_DIR/liv-core-dist" "$tgt" 2>/dev/null || true
        done
    fi
    # ── Phase 311-02 (UPDSAFE-04): restore node_modules alongside the code ──
    # Paired with the source restore so a rollback never runs old code against a
    # forward-mutated node_modules. Best-effort; a failure just means the operator
    # may need a manual `pnpm install` on the rolled-back tree.
    if [[ -d "$LAST_GOOD_DIR/node_modules" ]]; then
        rsync -a --delete "$LAST_GOOD_DIR/node_modules/" "$LIVOS_DIR/node_modules/" 2>/dev/null \
            || warn "node_modules restore failed — a rollback pnpm install may be required"
    fi
    # ── Phase 311-02 (UPDSAFE-04): restore captured systemd units (if any) ──
    # Captured pre-update into $LAST_GOOD_DIR/systemd (see snapshot_systemd_units).
    # Only touch a unit whose content actually differs (cmp -s), then a SINGLE
    # daemon-reload + restart ONLY the changed units — avoid needless bounces.
    if [[ -d "$LAST_GOOD_DIR/systemd" ]]; then
        local _sd_changed=0 _sd_unit _sd_base _sd_live _sd_restart=""
        for _sd_unit in "$LAST_GOOD_DIR/systemd"/*.service; do
            [[ -f "$_sd_unit" ]] || continue
            _sd_base=$(basename "$_sd_unit")
            _sd_live="/etc/systemd/system/$_sd_base"
            if ! cmp -s "$_sd_unit" "$_sd_live" 2>/dev/null; then
                cp -a "$_sd_unit" "$_sd_live" 2>/dev/null || true
                _sd_changed=1
                _sd_restart="$_sd_restart $_sd_base"
            fi
        done
        if [[ -d "$LAST_GOOD_DIR/systemd/livos.service.d" ]]; then
            if ! diff -rq "$LAST_GOOD_DIR/systemd/livos.service.d" /etc/systemd/system/livos.service.d >/dev/null 2>&1; then
                rm -rf /etc/systemd/system/livos.service.d 2>/dev/null || true
                cp -a "$LAST_GOOD_DIR/systemd/livos.service.d" /etc/systemd/system/livos.service.d 2>/dev/null || true
                _sd_changed=1
            fi
        fi
        if (( _sd_changed == 1 )); then
            systemctl daemon-reload 2>/dev/null || true
            for _sd_base in $_sd_restart; do
                systemctl restart "$_sd_base" 2>/dev/null || true
            done
        fi
    fi
    # livos.service runs as the LivOS desktop user — derive it (NOT hardcoded bruce,
    # which crash-loops non-bruce accounts) and restore ownership so it can read the tree.
    _LIVOS_RUN_USER=$(grep -oP '^User=\K.*' /etc/systemd/system/livos.service 2>/dev/null | head -1); [ -z "$_LIVOS_RUN_USER" ] && _LIVOS_RUN_USER=$(stat -c '%U' /opt/livos 2>/dev/null)
    if id "$_LIVOS_RUN_USER" >/dev/null 2>&1; then
        chown -R "$_LIVOS_RUN_USER:$_LIVOS_RUN_USER" "$LIVOS_DIR/packages/livinityd/source" "$LIVOS_DIR/packages/ui/dist" 2>/dev/null || true
        [[ -d "$LIV_DIR/packages/core/dist" ]] && chown -R "$_LIVOS_RUN_USER:$_LIVOS_RUN_USER" "$LIV_DIR/packages/core/dist" 2>/dev/null || true
    fi
    ok "Last-good runtime restored"
    return 0
}

# livinityd serves the UI on :8080. ANY normal HTTP status (2xx/3xx, or the
# 401/403 auth gates) means it bound and is serving; connection-refused/timeout
# (curl → 000), 404, or 5xx mean it's down or the UI dist is broken.
livinityd_responding() {
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 4 http://127.0.0.1:8080/ 2>/dev/null || echo 000)
    [[ "$code" =~ ^(2|3)[0-9][0-9]$ ]] || [[ "$code" == "401" ]] || [[ "$code" == "403" ]]
}

# Poll livinityd for up to ~120s after restart. The budget is deliberately
# generous because livinityd does substantial BLOCKING work before it binds
# :8080 — `docker stop --time 30` in cleanDockerState (~30s worst case),
# waitForSystemTime (up to 10s), DB migrations/seed, + an EADDRINUSE listen
# retry. A budget shorter than that legitimate cold boot would roll back a
# perfectly good update. On success: return 0 and continue. On failure: roll
# back to last-good, restart, re-probe, and `fail` (the EXIT trap records
# status=failed and .deployed-sha is NOT advanced, so the box correctly reports
# it's still on the previous version) — the UI is restored either way.
health_probe_or_rollback() {
    local i live=0
    for i in $(seq 1 40); do
        if livinityd_responding; then
            live=1
            break
        fi
        sleep 3
    done
    if [[ "$live" == "1" ]]; then
        ok "livinityd health probe OK (serving on :8080)"
        # Reliability D1 (rides A1+A2) — FUNCTIONAL gate. Liveness alone passes
        # even when the production tRPC router swap was skipped and the box
        # serves the 412/500 stub cascade ("update succeeded" while degraded —
        # the exact failure this rollback net previously could not catch).
        # /healthz/full (A2) is 200 only after setProductionAppRouter() ran and
        # 503 until then. Any OTHER answer (200 via the SPA fallback on a
        # pre-A2 build, 404, curl 000 blip) means the probe is not applicable /
        # not trustworthy -> pass on liveness alone. NEVER turn a missing probe
        # into a rollback loop (R5: the original F2 spec was refuted for
        # exactly that — it would have pinned the box on last-good forever).
        # The swap runs late in boot (after streaming/Xvfb init), so give it
        # its own ~120s budget after :8080 came up.
        local fcode
        for i in $(seq 1 40); do
            fcode=$(curl -s -o /dev/null -w '%{http_code}' -m 4 http://127.0.0.1:8080/healthz/full 2>/dev/null || echo 000)
            if [[ "$fcode" == "200" ]]; then
                ok "livinityd FUNCTIONAL probe OK (/healthz/full: production tRPC router swap ran)"
                return 0
            fi
            if [[ "$fcode" != "503" ]]; then
                ok "Functional gate not applicable (/healthz/full → $fcode; pre-A2 build or probe unavailable) — passing on liveness"
                return 0
            fi
            sleep 3
        done
        warn "livinityd is LIVE on :8080 but /healthz/full stayed 503 for ~120s — the production tRPC router swap never ran (degraded boot: config/setup tRPC would serve 412/500 stubs). AUTO-ROLLING BACK to last-good"
    else
        warn "livinityd did NOT respond on :8080 within ~120s after restart — AUTO-ROLLING BACK to last-good"
    fi
    if ! restore_last_good; then
        fail "Update failed AND there is no snapshot to roll back to — manual recovery needed (journalctl -u livos -n 50)"
    fi
    systemctl reset-failed livos.service 2>/dev/null || true
    systemctl restart livos.service 2>/dev/null || true
    # The rolled-back OLD code does the same slow pre-listen boot work — give it
    # the same generous budget before declaring the box unrecoverable.
    for i in $(seq 1 40); do
        if livinityd_responding; then
            warn "Rolled back to the previous working version — the UI is reachable again. This update did NOT apply; review the log and retry."
            fail "Update failed and was ROLLED BACK to the last-good version (UI restored, box NOT bricked)"
        fi
        sleep 3
    done
    fail "Update failed AND rollback did not restore livinityd — manual recovery needed (journalctl -u livos -n 50)"
}

# Idempotent systemd drop-in so a crash-looping livos keeps getting retried
# (RestartSec bounds the rate) instead of latching into permanent 'failed' after
# 5 crashes/10s (systemd default) — which would leave a permanent 502 even after
# the source is fixed/rolled back. Pairs with the rollback above as belt+braces.
ensure_livos_startlimit_dropin() {
    local dir="/etc/systemd/system/livos.service.d"
    local f="$dir/10-livos-startlimit.conf"
    mkdir -p "$dir" 2>/dev/null || true
    local tmp; tmp=$(mktemp)
    cat > "$tmp" <<'DROPIN'
[Unit]
# LivOS auto-recovery (atomic-update safety): never latch livos into permanent
# 'failed' on a crash-loop, so a rolled-back / fixed source self-heals instead
# of leaving the user on a permanent Cloudflare 502.
StartLimitIntervalSec=0
DROPIN
    if [[ ! -f "$f" ]] || ! cmp -s "$tmp" "$f"; then
        mv "$tmp" "$f" 2>/dev/null || { rm -f "$tmp"; return 0; }
        chmod 644 "$f" 2>/dev/null || true
        systemctl daemon-reload 2>/dev/null || true
        ok "livos.service StartLimit drop-in installed (auto-recovery on crash-loop)"
    else
        rm -f "$tmp"
        ok "livos.service StartLimit drop-in already current"
    fi
}

# ── Fast, clean shutdown drop-in (2026-06-15) ────────────────────────────────
# Root cause of "every update = ~90s of Cloudflare 502": livos.service spawns a
# whole XFCE streaming-desktop subsystem (Xvfb, dbus, xfsettingsd, xfwm4,
# xfce4-panel, xfdesktop, gvfsd, goa-daemon, xdg-desktop-portal, ~25+ procs)
# INTO its own control-group. livinityd's SIGTERM handler exits node instantly
# ("Received SIGTERM, exiting immediately to release port"), BUT the default
# KillMode=control-group makes `systemctl restart` block until the ENTIRE cgroup
# drains — and the XFCE processes ignore SIGTERM, so systemd waits the full
# DefaultTimeoutStopSec (90s) then SIGKILLs the lot. That 90s window is ALSO
# exactly when update.sh's `sudo` parent (a leftover in the same cgroup) gets
# SIGKILLed — the mechanism that strands a non-escaped update.sh mid-deploy
# (stale markers, no success/failed.json, "rolled back to old version" in the UI
# with no record). Proven live on the Mini PC: 13:16:30 Stopping → 13:18:00
# "final-sigterm timed out. Killing." (xfce4-panel, bash, sudo).
#
# Fix: KillMode=mixed → SIGTERM goes to the MAIN process only; once it exits the
# cgroup remainder (the XFCE session, which livinityd re-spawns on every boot
# anyway) is SIGKILLed immediately instead of being waited on. TimeoutStopSec=25
# is a hard cap so a stuck stop can never again hang for 90s. Net: restart
# downtime collapses from ~90s to a few seconds, and the cgroup-SIGKILL window
# that endangers update.sh effectively disappears. Idempotent — mirrors the
# StartLimit drop-in idiom above.
ensure_livos_killmode_dropin() {
    local dir="/etc/systemd/system/livos.service.d"
    local f="$dir/20-livos-killmode.conf"
    mkdir -p "$dir" 2>/dev/null || true
    local tmp; tmp=$(mktemp)
    cat > "$tmp" <<'DROPIN'
[Service]
# LivOS fast-shutdown (atomic-update safety): the XFCE streaming-desktop the
# daemon spawns into this cgroup ignores SIGTERM and would otherwise hold the
# stop open for the full 90s DefaultTimeoutStopSec, then SIGKILL — a window that
# both gives users a 90s 502 on every update AND strands update.sh's sudo parent
# (leftover in this cgroup) when systemd force-kills it. KillMode=mixed gates the
# stop on the main process and SIGKILLs the desktop remainder immediately;
# TimeoutStopSec caps any residual hang.
KillMode=mixed
TimeoutStopSec=25
DROPIN
    if [[ ! -f "$f" ]] || ! cmp -s "$tmp" "$f"; then
        mv "$tmp" "$f" 2>/dev/null || { rm -f "$tmp"; return 0; }
        chmod 644 "$f" 2>/dev/null || true
        systemctl daemon-reload 2>/dev/null || true
        ok "livos.service KillMode=mixed drop-in installed (fast restart, no 90s stop-hang)"
    else
        rm -f "$tmp"
        ok "livos.service KillMode=mixed drop-in already current"
    fi
}

# ── Phase 196-02 — opencode CLI version-pin warning ──
# update.sh assumes install.sh has already provisioned opencode. If the
# operator skipped install.sh OR opencode upstream pushed a regression,
# warn loudly so the auth.xai.start tRPC procedure doesn't fail post-deploy.
OPENCODE_MIN_VERSION="1.15.0"
if ! command -v opencode >/dev/null 2>&1; then
    echo "⚠ Phase 196-02 — opencode CLI not found in PATH. Run \`sudo bash install.sh\` for a clean bootstrap." >&2
    sleep 5
else
    OPENCODE_CURRENT=$(opencode --version 2>/dev/null | awk '{print $NF}' | tr -d 'v')
    if [[ -n "$OPENCODE_CURRENT" ]] && [[ "$(printf '%s\n%s' "$OPENCODE_MIN_VERSION" "$OPENCODE_CURRENT" | sort -V | head -1)" != "$OPENCODE_MIN_VERSION" ]]; then
        echo "⚠ Phase 196-02 — opencode $OPENCODE_CURRENT < required $OPENCODE_MIN_VERSION. Re-run \`sudo bash scripts/install/opencode-install.sh\`." >&2
        sleep 5
    fi
fi

# ── Pre-flight checks ────────────────────────────────────
step "Pre-flight checks"

if [[ $EUID -ne 0 ]]; then
    fail "Must run as root"
fi

if [[ ! -d "$LIVOS_DIR" ]]; then
    fail "LivOS not installed at $LIVOS_DIR - run install.sh first"
fi

if [[ ! -f "$LIVOS_DIR/.env" ]]; then
    fail ".env not found - installation seems broken"
fi

ok "Pre-flight passed"

# Phase 311-02 (UPDSAFE-04): keep the operator manual-rollback script current on
# disk every run (idempotent cmp -s install), even if no rollback is triggered.
install_manual_rollback_script

# Phase 32 REL-01 call site
precheck

# ── Step 1: Pull latest code from GitHub ──────────────────
step "Pulling latest code"

TEMP_DIR="/tmp/livinity-update-$$"
rm -rf "$TEMP_DIR"

# ── Phase 266 — RELEASE-based deploy ──────────────────────────────────────
# Resolve the latest PUBLISHED GitHub Release tag and deploy THAT curated tag
# instead of bleeding master HEAD, so "update" means an intentional, verified
# release. If no release exists yet (/releases/latest → 404) OR GitHub is
# unreachable, fall back to master so a release-less repo / offline box still
# updates (no regression). jq-optional: grep/sed extracts .tag_name when jq is
# absent (fresh boxes may not have jq during early bootstrap).
# ── Phase 311 UPDSAFE-01 — release channel (settings.releaseChannel) ───────
# Read the box's opted-in channel from the FileStore YAML — the SAME key the
# UI's setReleaseChannel persists and update.ts's getLatestRelease reads, so the
# UI and the deployed artifact never disagree. Fail-safe to "stable" so a parse
# miss can NEVER falsely activate beta. Mirrors the _resolve_operator_domain()
# bash-reads-box-state idiom. js-yaml dump = 2-space indent, unquoted scalar.
_LIVOS_RELEASE_CHANNEL="stable"
if [[ -f /opt/livos/data/livinity.yaml ]]; then
    _chan=$(grep -A0 -E '^\s*releaseChannel:\s*' /opt/livos/data/livinity.yaml 2>/dev/null \
        | tail -1 | sed -E 's/^\s*releaseChannel:\s*//; s/["'\'']//g; s/\s+$//')
    [[ "$_chan" == "beta" ]] && _LIVOS_RELEASE_CHANNEL="beta"
fi

RELEASE_TAG=""
if [[ "$_LIVOS_RELEASE_CHANNEL" == "beta" ]]; then
    # Beta channel: resolve the semver-MAX PUBLISHED release (prereleases
    # included, drafts filtered) from the FULL list endpoint — NOT the first
    # entry / raw API order.
    #
    # Phase 311 CR-01 FIX: raw `sort -V` is NOT semver-prerelease-aware — it
    # ranks "v44.2-beta.1" AFTER "v44.2" (treats -beta.1 as a LATER component),
    # the OPPOSITE of semver precedence, so on the promotion case (a beta cut,
    # then its final release) it would pick the OLDER beta while the UI's
    # pickMaxReleaseTag correctly shows the final → perpetual non-actionable
    # "update available" nag. GNU `sort -V` DOES honor a Debian "~" as sorting
    # BEFORE the release, which is exactly semver prerelease precedence. So map
    # the FIRST "-" (the prerelease separator) to "~" before sort, take tail -1,
    # then map it back — making this shell selector AGREE with pickMaxReleaseTag
    # on the same input (empirically: v44.1/v44.2-beta.1/v44.2 -> v44.2; proven
    # by update.beta-selector.test.sh). Stable channel path below is untouched.
    _REL_JSON=$(curl -fsSL --max-time 10 \
        -H "User-Agent: LivOS-update" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/utopusc/livinity-io/releases?per_page=100" 2>/dev/null || echo "")
    if [[ -n "$_REL_JSON" ]]; then
        if command -v jq >/dev/null 2>&1; then
            RELEASE_TAG=$(echo "$_REL_JSON" \
                | jq -r '[.[] | select(.draft==false) | .tag_name] | .[]' 2>/dev/null \
                | sed 's/-/~/' | sort -V | tail -1 | sed 's/~/-/' || echo "")
        else
            RELEASE_TAG=$(echo "$_REL_JSON" | grep '"tag_name"' \
                | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' \
                | sed 's/-/~/' | sort -V | tail -1 | sed 's/~/-/' || echo "")
        fi
    fi
else
    # Stable channel (default): byte-unchanged /releases/latest resolution.
    _REL_JSON=$(curl -fsSL --max-time 10 \
        -H "User-Agent: LivOS-update" \
        -H "Accept: application/vnd.github+json" \
        https://api.github.com/repos/utopusc/livinity-io/releases/latest 2>/dev/null || echo "")
    if [[ -n "$_REL_JSON" ]]; then
        if command -v jq >/dev/null 2>&1; then
            RELEASE_TAG=$(echo "$_REL_JSON" | jq -r '.tag_name // empty' 2>/dev/null || echo "")
        else
            RELEASE_TAG=$(echo "$_REL_JSON" | grep -m1 '"tag_name"' \
                | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || echo "")
        fi
    fi
fi
info "Release channel: ${_LIVOS_RELEASE_CHANNEL} — resolved tag ${RELEASE_TAG:-<none>}"

if [[ -n "$RELEASE_TAG" ]]; then
    info "Latest GitHub Release: $RELEASE_TAG — deploying that tag (not bare master)"
    if git clone --depth 1 --branch "$RELEASE_TAG" "$REPO_URL" "$TEMP_DIR" 2>/dev/null; then
        ok "Cloned release tag $RELEASE_TAG"
    else
        warn "Shallow clone of tag $RELEASE_TAG failed — falling back to master HEAD"
        RELEASE_TAG=""
        rm -rf "$TEMP_DIR"
        git clone --depth 1 "$REPO_URL" "$TEMP_DIR" || fail "Failed to clone repository"
    fi
else
    info "No published release (or GitHub unreachable) — deploying master HEAD"
    git clone --depth 1 "$REPO_URL" "$TEMP_DIR" || fail "Failed to clone repository"
fi
# ── Phase 33 OBS-01 prep: capture target SHA for log filename rename ──
LIVOS_UPDATE_TO_SHA=$(git -C "$TEMP_DIR" rev-parse HEAD 2>/dev/null || echo "")

ok "Latest code fetched${RELEASE_TAG:+ ($RELEASE_TAG)}"

# ── Phase 257-01 WS-B (LIVOS-011): verify-before-deploy commit pin ─────────
# The fetched HEAD is rsync'd + built + restarted as ROOT. With no pin/signature
# a compromised remote or TLS MITM = silent root RCE on the operator's next
# Update. Resolve an EXPECTED ref and REFUSE (before the first rsync) when the
# fetched HEAD does not match. Priority: (a) env LIVOS_EXPECTED_SHA, (b) repo
# pin file scripts/install/EXPECTED_RELEASE, (c) signed-tag verification when a
# maintainer key is shipped at scripts/install/maintainer.gpg.
# OPT-IN-STRICT: when NO pin material exists, warn loudly + proceed so the
# current unpinned Mini PC still updates (no deploy regression). Shipping an
# EXPECTED_RELEASE / maintainer key flips it to fail-closed.
livos_verify_fetched_ref() {
    local to_sha="$LIVOS_UPDATE_TO_SHA"
    local pin_file="$TEMP_DIR/scripts/install/EXPECTED_RELEASE"
    local maintainer_key="$TEMP_DIR/scripts/install/maintainer.gpg"
    local expected="" expected_source="" had_pin_material=0

    # ── Phase 311-04 (UPDSAFE-02): WARN-ONLY signature verification ─────────────
    # This function NEVER calls fail()/exit on a pin or signature mismatch. Every
    # former "Refusing to deploy" abort is now warn() + telemetry vars + return 0.
    # Shipping scripts/install/EXPECTED_RELEASE + maintainer.gpg therefore CANNOT
    # activate fail-closed enforcement — that flip is Phase 312 (a LATER release),
    # gated on one full release cycle of the warn-only telemetry emitted below.
    # A future maintainer MUST NOT re-introduce a fail()/exit path here; the
    # fail-closed change belongs in Phase 312's own update.sh edit, not this one.
    # These four vars are module-level (no `local`) so phase33_finalize's EXIT-trap
    # JSON heredoc can read them; init empty so a run that skips a branch is clean.
    _LIVOS_SIGVERIFY_STATUS=""
    _LIVOS_SIGVERIFY_SOURCE=""
    _LIVOS_SIGVERIFY_EXPECTED=""
    _LIVOS_SIGVERIFY_ACTUAL=""

    if [[ -z "$to_sha" ]]; then
        warn "update.sh: could not resolve fetched HEAD SHA — cannot verify pin (proceeding unverified)"
        _LIVOS_SIGVERIFY_STATUS="no-head-sha"
        return 0
    fi

    # (a) explicit env override — highest priority
    if [[ -n "${LIVOS_EXPECTED_SHA:-}" ]]; then
        expected="${LIVOS_EXPECTED_SHA}"
        expected_source="env LIVOS_EXPECTED_SHA"
        had_pin_material=1
    # (b) repo-shipped pin file (single SHA or refs/tags/<tag> line)
    elif [[ -f "$pin_file" ]]; then
        had_pin_material=1
        local pin_line
        pin_line=$(grep -vE '^\s*(#|$)' "$pin_file" 2>/dev/null | head -1 | tr -d '[:space:]')
        if [[ "$pin_line" == refs/tags/* ]]; then
            # resolve the tag to its commit SHA inside the cloned tree
            expected=$(git -C "$TEMP_DIR" rev-parse "${pin_line#refs/tags/}^{commit}" 2>/dev/null \
                || git -C "$TEMP_DIR" rev-parse "$pin_line" 2>/dev/null || echo "")
            expected_source="pin file tag ${pin_line}"
        else
            expected="$pin_line"
            expected_source="pin file scripts/install/EXPECTED_RELEASE"
        fi
    fi

    # (c) signed-tag verification (only when a maintainer key is present and HEAD is a tag)
    if [[ -z "$expected" && -f "$maintainer_key" ]]; then
        had_pin_material=1
        local head_tag
        head_tag=$(git -C "$TEMP_DIR" describe --exact-match --tags HEAD 2>/dev/null || echo "")
        if [[ -n "$head_tag" ]]; then
            local gnupg_tmp
            gnupg_tmp=$(mktemp -d)
            if GNUPGHOME="$gnupg_tmp" gpg --quiet --import "$maintainer_key" 2>/dev/null \
               && GNUPGHOME="$gnupg_tmp" git -C "$TEMP_DIR" -c gpg.program=gpg verify-tag "$head_tag" 2>/dev/null; then
                ok "update.sh: signed tag ${head_tag} verified against shipped maintainer key"
                _LIVOS_SIGVERIFY_STATUS="ok"; _LIVOS_SIGVERIFY_SOURCE="maintainer.gpg"; _LIVOS_SIGVERIFY_EXPECTED="${head_tag}"; _LIVOS_SIGVERIFY_ACTUAL="${to_sha}"
                rm -rf "$gnupg_tmp" 2>/dev/null || true
                return 0
            fi
            rm -rf "$gnupg_tmp" 2>/dev/null || true
            warn "SIGNATURE-WARN (non-blocking, Phase 311 warn-only): signed-tag verification of ${head_tag} (HEAD ${to_sha}) failed against the shipped maintainer key"
            _LIVOS_SIGVERIFY_STATUS="gpg-fail"; _LIVOS_SIGVERIFY_SOURCE="maintainer.gpg"; _LIVOS_SIGVERIFY_EXPECTED="${head_tag}"; _LIVOS_SIGVERIFY_ACTUAL="${to_sha}"
            return 0
        else
            warn "SIGNATURE-WARN (non-blocking, Phase 311 warn-only): a maintainer key is shipped but the fetched HEAD ${to_sha} is not an annotated tag (cannot verify-tag)"
            _LIVOS_SIGVERIFY_STATUS="not-a-tag"; _LIVOS_SIGVERIFY_SOURCE="maintainer.gpg"; _LIVOS_SIGVERIFY_EXPECTED=""; _LIVOS_SIGVERIFY_ACTUAL="${to_sha}"
            return 0
        fi
    fi

    if [[ -n "$expected" ]]; then
        if [[ "$to_sha" != "$expected" ]]; then
            warn "SIGNATURE-WARN (non-blocking, Phase 311 warn-only): fetched HEAD ${to_sha} does not match the expected pinned ref ${expected} (source: ${expected_source})"
            _LIVOS_SIGVERIFY_STATUS="mismatch"; _LIVOS_SIGVERIFY_SOURCE="${expected_source}"; _LIVOS_SIGVERIFY_EXPECTED="${expected}"; _LIVOS_SIGVERIFY_ACTUAL="${to_sha}"
            return 0
        fi
        ok "update.sh: fetched HEAD ${to_sha} matches the expected pinned ref (source: ${expected_source})"
        _LIVOS_SIGVERIFY_STATUS="ok"; _LIVOS_SIGVERIFY_SOURCE="${expected_source}"; _LIVOS_SIGVERIFY_EXPECTED="${expected}"; _LIVOS_SIGVERIFY_ACTUAL="${to_sha}"
        return 0
    fi

    if (( had_pin_material == 0 )); then
        warn "update.sh: no commit pin / signature available — deploying unverified HEAD ${to_sha} (set LIVOS_EXPECTED_SHA or ship scripts/install/EXPECTED_RELEASE to enforce)"
        _LIVOS_SIGVERIFY_STATUS="no-pin-material"; _LIVOS_SIGVERIFY_SOURCE=""; _LIVOS_SIGVERIFY_EXPECTED=""; _LIVOS_SIGVERIFY_ACTUAL="${to_sha}"
        return 0
    fi

    # Pin material was present but did not yield an expected SHA (e.g. unresolvable
    # tag, or the pre-tag sentinel pin that has not yet been bumped to a real tag).
    # WARN-ONLY: record telemetry and proceed — never abort (Phase 312 owns the flip).
    warn "SIGNATURE-WARN (non-blocking, Phase 311 warn-only): pin material present but no expected SHA could be resolved (HEAD ${to_sha})"
    _LIVOS_SIGVERIFY_STATUS="unresolvable"; _LIVOS_SIGVERIFY_SOURCE="${expected_source}"; _LIVOS_SIGVERIFY_EXPECTED="${expected}"; _LIVOS_SIGVERIFY_ACTUAL="${to_sha}"
    return 0
}
livos_verify_fetched_ref

# ── Step 1b: Phase 93 streaming subsystem apt packages ────
# Idempotent apt-install so existing Mini PC deploys (which never re-ran
# install.sh) pick up the streaming subsystem binaries on next update.
# Locked decision D-93-07: "Install.sh ile bu butun servisler kurulmali"
# applies to both install.sh (fresh) AND update.sh (incremental).
# apt-get install -y -qq is a no-op on already-installed packages.
# ── Phase 311-02 (UPDSAFE-04): EARLY systemd capture — MUST precede Step 1b ────
# Step 1b below rewrites livos-egress.service + ydotoold.service UNCONDITIONALLY,
# BEFORE snapshot_last_good()'s call site (Step 2). Capture the genuine pre-update
# units NOW into the sibling $LAST_GOOD_DIR.systemd-pre; it is folded into
# $LAST_GOOD_DIR/systemd right after snapshot_last_good()'s rm -rf. This bare call
# MUST stay above the egress/ydotoold heredoc writes (the line-order proof pins it).
snapshot_systemd_units
step "Phase 93: streaming subsystem dependencies"
if [[ -x /usr/bin/apt-get ]] && command -v apt-get >/dev/null 2>&1; then
    info "Ensuring streaming subsystem apt packages are installed..."
    # Phase 100-08-01: xvfb + fluxbox added for dedicated WebApp display :1
    # (D-100-08-A — livinityd spawns Xvfb :1 + fluxbox on boot).
    # ── Phase 257-01 WS-B (LIVOS-040): gate the blanket apt install ──────────
    # Only run the (unpinned) heavy apt set when at least one key binary is
    # actually missing — a re-run on a fully-provisioned box now skips apt
    # entirely instead of trusting the host apt source set as root every time.
    streaming_need_install=0
    for bin in x11vnc xdotool maim scrot websockify ffmpeg gst-launch-1.0 Xvfb fluxbox feh tint2 bwrap tinyproxy; do
        if ! command -v "$bin" >/dev/null 2>&1; then streaming_need_install=1; break; fi
    done
    if (( streaming_need_install == 1 )); then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
            x11vnc xdotool x11-xserver-utils \
            ydotool maim scrot gnome-screenshot \
            websockify vncsnapshot \
            ffmpeg \
            gstreamer1.0-tools \
            gstreamer1.0-plugins-good \
            gstreamer1.0-plugins-bad \
            gstreamer1.0-plugins-ugly \
            xdg-desktop-portal-gnome \
            xvfb fluxbox \
            feh tint2 \
            bubblewrap tinyproxy \
            2>&1 | tail -5 || warn "Some streaming packages failed to install (non-fatal)"
    else
        info "update.sh: streaming deps already present — skipping apt install"
    fi

    # ── Phase 256-01 (WS-A): egress allowlist proxy for the bwrap'd agent ──────
    # Byte-identical to scripts/install/deploy-livinityd.sh — tinyproxy
    # default-deny + hostname allowlist; the agent's bwrap child gets
    # HTTPS_PROXY=http://127.0.0.1:13128 (sandbox.ts buildScrubbedEnv). bwrap is
    # the hard requirement, the proxy is defense-in-depth — all warn-not-fail.
    info "Phase 256-01: writing livos-egress allowlist proxy config + unit"
    cat > /etc/tinyproxy/livos-egress.conf <<'EGRESS_CONF' || warn "livos-egress.conf write failed (non-fatal)"
Port 13128
Listen 127.0.0.1
Allow 127.0.0.1
FilterDefaultDeny Yes
Filter "/etc/tinyproxy/livos-egress.filter"
ConnectPort 443
EGRESS_CONF
    cat > /etc/tinyproxy/livos-egress.filter <<'EGRESS_FILTER' || warn "livos-egress.filter write failed (non-fatal)"
^api\.anthropic\.com$
^generativelanguage\.googleapis\.com$
^github\.com$
\.githubusercontent\.com$
^registry\.npmjs\.org$
^registry\.npmjs\.com$
EGRESS_FILTER
    cat > /etc/systemd/system/livos-egress.service <<'EGRESS_UNIT' || warn "livos-egress.service write failed (non-fatal)"
[Unit]
Description=LivOS egress allowlist proxy (tinyproxy)
After=network.target

[Service]
ExecStart=/usr/bin/tinyproxy -d -c /etc/tinyproxy/livos-egress.conf
Restart=on-failure

[Install]
WantedBy=multi-user.target
EGRESS_UNIT
    systemctl daemon-reload 2>/dev/null || warn "daemon-reload failed (non-fatal)"
    systemctl enable --now livos-egress 2>/dev/null || warn "livos-egress enable failed (non-fatal)"
    ok "livos-egress proxy configured"

    # ── Phase 256-01b (WS-A): AppArmor userns profile for bwrap (Ubuntu 24.04) ─
    # Ubuntu 24.04 sets kernel.apparmor_restrict_unprivileged_userns=1, so bwrap's
    # --unshare-all fails ("setting up uid map: Permission denied") and the agent
    # sandbox (sandbox.ts) would break the shell tool. Grant bwrap the userns cap
    # via a scoped AppArmor profile — least-broad fix; does NOT disable unprivileged
    # userns globally. Idempotent; warn-not-fail.
    if [ -d /etc/apparmor.d ]; then
        cat > /etc/apparmor.d/bwrap <<'BWRAP_AA' || warn "bwrap apparmor profile write failed (non-fatal)"
abi <abi/4.0>,
include <tunables/global>
profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,
  include if exists <local/bwrap>
}
BWRAP_AA
        apparmor_parser -r /etc/apparmor.d/bwrap 2>/dev/null || warn "bwrap apparmor profile load failed (non-fatal — bwrap may need it on Ubuntu 24.04)"
        ok "bwrap AppArmor userns profile installed"
    fi

    # ── Phase 256-02 (WS-B): cred-egress-proxy CA material (LIVOS-001) ─────────
    # The host credential-injecting egress proxy (cred-egress-proxy.ts) MITM-
    # terminates the AI hosts to inject the operator OAuth bearer at the wire.
    # The container trusts that leg via a PUBLIC CA cert mounted read-only
    # (credproxy-ca.pem). Generate the CA once here (cert + 0600 key); the key
    # never leaves the host, the cert is mounted into containers (not a secret).
    # This is a DISTINCT region from the 256-01 tinyproxy block above — a
    # different proxy (in-process node service, not an apt package). All steps
    # warn-not-fail (the inject degrades gracefully if the CA is absent).
    info "Phase 256-02: generating cred-egress-proxy CA material (if absent)"
    _CREDPROXY_SECRETS="${LIVOS_DIR}/data/secrets"
    _CREDPROXY_CA="${_CREDPROXY_SECRETS}/credproxy-ca.pem"
    _CREDPROXY_KEY="${_CREDPROXY_SECRETS}/credproxy-ca.key"
    mkdir -p "$_CREDPROXY_SECRETS" 2>/dev/null || warn "credproxy secrets dir mkdir failed (non-fatal)"
    if [[ ! -s "$_CREDPROXY_CA" ]]; then
        openssl req -x509 -newkey rsa:2048 -nodes \
            -keyout "$_CREDPROXY_KEY" -out "$_CREDPROXY_CA" \
            -days 3650 -subj "/CN=livinity-credproxy" 2>/dev/null \
            && chmod 0600 "$_CREDPROXY_KEY" 2>/dev/null \
            && chmod 0644 "$_CREDPROXY_CA" 2>/dev/null \
            && ok "cred-egress-proxy CA generated at $_CREDPROXY_CA" \
            || warn "cred-egress-proxy CA generation failed (non-fatal — inject degrades)"
    else
        ok "cred-egress-proxy CA already present at $_CREDPROXY_CA (reuse)"
    fi

    # VAAPI userspace — separate group so an Intel-iGPU-less host doesn't fail the run.
    # apt package is `libva-utils` (provides the `vainfo` binary), NOT `vainfo`.
    # Phase 257-01 WS-B (LIVOS-040): only install when `vainfo` is missing.
    if ! command -v vainfo >/dev/null 2>&1; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
            libva-utils intel-media-va-driver libdrm-intel1 \
            2>&1 | tail -5 || warn "VAAPI userspace install failed — libx264 fallback will be used"
    else
        info "update.sh: VAAPI userspace already present — skipping apt install"
    fi

    # Phase 252 portability — luse display-lifecycle + terminal binaries the
    # v44/250-hotfix code now hard-requires but were never on the apt list.
    # Phase 257-01 WS-B (LIVOS-040): only install when a key binary is missing.
    luse_need_install=0
    for bin in Xephyr xterm gnome-terminal xprop xclip wmctrl; do
        if ! command -v "$bin" >/dev/null 2>&1; then luse_need_install=1; break; fi
    done
    if (( luse_need_install == 1 )); then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
            xserver-xephyr xterm gnome-terminal x11-utils xclip wmctrl \
            2>&1 | tail -5 || warn "Some luse display/terminal packages failed (non-fatal)"
    else
        info "update.sh: luse display/terminal deps already present — skipping apt install"
    fi

    # Verify the critical streaming binaries are present after install
    streaming_missing=()
    for bin in ffmpeg gst-launch-1.0 dbus-send xdotool maim Xvfb fluxbox Xephyr xterm feh tint2 bwrap; do
        if ! command -v "$bin" >/dev/null 2>&1; then
            streaming_missing+=("$bin")
        fi
    done
    if (( ${#streaming_missing[@]} > 0 )); then
        warn "Streaming binaries still missing after apt: ${streaming_missing[*]}"
    else
        ok "Streaming subsystem binaries verified"
    fi

    # Provision ydotoold systemd unit if ydotoold is now available
    if command -v ydotoold >/dev/null 2>&1 && [[ ! -f /etc/systemd/system/ydotoold.service ]]; then
        # Pick the most likely desktop user — first non-system user with UID>=1000.
        desktop_user_p93=$(getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 {print $1; exit}')
        if [[ -n "${desktop_user_p93:-}" ]]; then
            desktop_uid_p93=$(id -u "$desktop_user_p93" 2>/dev/null || echo 1000)
            cat > /etc/systemd/system/ydotoold.service << UNIT
[Unit]
Description=LivOS ydotoold input daemon (Phase 93 streaming subsystem)
After=graphical.target
Wants=graphical.target

[Service]
Type=simple
ExecStart=/usr/bin/ydotoold --socket-path=/tmp/.ydotool_socket --socket-own=${desktop_uid_p93}:${desktop_uid_p93}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=graphical.target
UNIT
            systemctl daemon-reload 2>/dev/null || true
            systemctl enable ydotoold.service 2>/dev/null && \
                ok "ydotoold systemd unit installed (user=${desktop_user_p93})" || \
                warn "ydotoold unit written but enable failed"
        fi
    fi
else
    info "apt-get not available — skipping streaming subsystem install"
fi

# ── Step 1c: Backups-v2 P0 — kopia backup engine ──────────
# The backups module shells out to `kopia`. umbrelOS ships it inside their OS
# image; LivOS runs livinityd on stock Ubuntu, so nothing ever installed it —
# backups have been silently dead on every existing box. livinityd runs as the
# unprivileged service user and CANNOT write /usr/local/bin, so its boot
# self-heal EACCESes; update.sh runs as ROOT (LIVINITYD_UPDATE sudoers grant)
# and is the durable install path for existing boxes. Pinned release + sha256
# (no third-party apt source). Warn-not-fail: a download hiccup must never
# abort a deploy — the RED Backups card + boot retry cover it.
_kopia_version="0.23.1"
case "$(uname -m)" in
    x86_64)  _kopia_arch="x64";   _kopia_sha256="416d0f84a3dbb321a8b2d8f0997b1a0a6e915babe79ee76fa6e4d2bd1e1c5178" ;;
    aarch64) _kopia_arch="arm64"; _kopia_sha256="a4ffbc019e0b0f932e2632054e73ec521dc1e80172a00095369c53ecf4e5a6cb" ;;
    *)       _kopia_arch="" ;;
esac
_kopia_current="$(kopia --version 2>/dev/null | awk '{print $1}' || true)"
if [[ -z "$_kopia_arch" ]]; then
    warn "kopia: unsupported arch $(uname -m) — backup engine not installed"
elif [[ -n "$_kopia_current" ]] && dpkg --compare-versions "$_kopia_current" ge "$_kopia_version" 2>/dev/null; then
    # >= not ==: never downgrade a newer kopia (repo-format lockout risk).
    ok "kopia $_kopia_current already installed (>= $_kopia_version)"
else
    info "Installing kopia $_kopia_version (backup engine)..."
    # mktemp shielded inside the && chain so a failure here can't abort the
    # deploy under set -e; every downstream step is warn-not-fail too.
    if _kopia_tmp="$(mktemp -d 2>/dev/null)" \
        && curl -fsSL --retry 3 -o "$_kopia_tmp/kopia.tgz" \
            "https://github.com/kopia/kopia/releases/download/v${_kopia_version}/kopia-${_kopia_version}-linux-${_kopia_arch}.tar.gz" \
        && echo "${_kopia_sha256}  $_kopia_tmp/kopia.tgz" | sha256sum -c --quiet - \
        && tar -xzf "$_kopia_tmp/kopia.tgz" -C "$_kopia_tmp" \
        && install -m 0755 "$_kopia_tmp"/kopia-*/kopia /usr/local/bin/kopia; then
        ok "kopia installed: $(kopia --version 2>/dev/null | head -1)"
    else
        warn "kopia install FAILED — backups stay disabled until the next attempt"
    fi
    { [[ -n "${_kopia_tmp:-}" ]] && rm -rf "$_kopia_tmp"; } || true
fi
mkdir -p /kopia/config /kopia/cache 2>/dev/null || true

# ── Step 2: Update LivOS source files ─────────────────────
step "Updating LivOS source files"

# Atomic-update safety net: capture the current working runtime BEFORE the first
# in-place rsync, so Step 8's health probe can roll back if the new code can't
# boot. Must run before ANY overwrite below.
snapshot_last_good

# ── Phase 311-02 (UPDSAFE-04): fold the EARLY systemd capture into the snapshot ─
# snapshot_last_good() just did `rm -rf "$LAST_GOOD_DIR"` + mkdir, so the sibling
# .systemd-pre (captured before Step 1b overwrote the units) is now safe to move
# in as $LAST_GOOD_DIR/systemd — the ONLY point that has BOTH the fresh snapshot
# dir AND the genuine pre-update units.
mv "$LAST_GOOD_DIR.systemd-pre" "$LAST_GOOD_DIR/systemd" 2>/dev/null || true

# Update livinityd source (tsx runs directly, no compile needed)
info "Updating livinityd source..."
rsync -a --delete \
    "$TEMP_DIR/livos/packages/livinityd/source/" \
    "$LIVOS_DIR/packages/livinityd/source/"
ok "livinityd source updated"

# ── Phase 253 (G21): deploy repo-root scripts/install/cli/<name>.sh ────────
# The livinityd `cliInstaller.install` tRPC mutation spawns
# `bash /opt/livos/scripts/install/cli/<name>.sh`. On a FRESH install these
# land via deploy-livinityd.sh, but update.sh (the existing-box path) never
# copied them — so new Local Agents CLIs shipped after the last fresh install
# silently never reached the box (Phase 253 found 0/15 landed). Mirror the
# deploy-livinityd.sh G12 directory-glob rsync here so update.sh stays in sync.
if [[ -d "$TEMP_DIR/scripts/install/cli" ]]; then
    info "Updating Local Agents install scripts (scripts/install/cli/)..."
    mkdir -p "$LIVOS_DIR/scripts/install/cli"
    rsync -a "$TEMP_DIR/scripts/install/cli/" "$LIVOS_DIR/scripts/install/cli/"
    [[ -f "$TEMP_DIR/scripts/install/_logging.sh" ]] \
        && cp "$TEMP_DIR/scripts/install/_logging.sh" "$LIVOS_DIR/scripts/install/_logging.sh"
    chmod +x "$LIVOS_DIR/scripts/install/cli/"*.sh 2>/dev/null || true
    ok "Local Agents install scripts updated (G21)"
else
    info "scripts/install/cli/ not in TEMP_DIR — skipping (pre-Phase 253 clone)"
fi

# v29.1 mini-milestone: self-rsync — deploy update.sh itself so future
# update.sh hot-patches reach Mini PC automatically without manual SCP.
# IMPORTANT: must use atomic mv (not in-place cp), otherwise the running
# bash reads partial new content through its open fd and crashes mid-run.
# `cp` to a sibling .new path then `mv` over the original — the mv is a
# rename within the same filesystem, so the new content gets a NEW inode
# and bash's open fd on the old inode keeps the old script readable until
# the current run finishes. Next invocation will read the new version.
info "Updating update.sh..."
if [[ -f "$TEMP_DIR/update.sh" ]]; then
    cp "$TEMP_DIR/update.sh" "$LIVOS_DIR/update.sh.new"
    chmod +x "$LIVOS_DIR/update.sh.new"
    mv "$LIVOS_DIR/update.sh.new" "$LIVOS_DIR/update.sh"
    # Phase 262 WS3: keep update.sh root-owned so the scoped LIVINITYD_UPDATE sudoers grant
    # (`sudo -n bash /opt/livos/update.sh`) stays SAFE across deploys — bruce executes but
    # cannot rewrite it (else the Update-button grant would be a passwordless-root hole).
    chown root:root "$LIVOS_DIR/update.sh" 2>/dev/null || true
    chmod 0755 "$LIVOS_DIR/update.sh" 2>/dev/null || true
    ok "update.sh updated + root-owned (next run will use new version)"
else
    warn "update.sh not in TEMP_DIR — skipping self-update"
fi

# Update package.json files (for dependency changes)
info "Updating package manifests..."
cp "$TEMP_DIR/livos/package.json" "$LIVOS_DIR/package.json"
cp "$TEMP_DIR/livos/pnpm-lock.yaml" "$LIVOS_DIR/pnpm-lock.yaml" 2>/dev/null || true
cp "$TEMP_DIR/livos/pnpm-workspace.yaml" "$LIVOS_DIR/pnpm-workspace.yaml" 2>/dev/null || true
cp "$TEMP_DIR/livos/packages/livinityd/package.json" "$LIVOS_DIR/packages/livinityd/package.json"
cp "$TEMP_DIR/livos/packages/ui/package.json" "$LIVOS_DIR/packages/ui/package.json"
cp "$TEMP_DIR/livos/packages/config/package.json" "$LIVOS_DIR/packages/config/package.json" 2>/dev/null || true
ok "Package manifests updated"

# Update UI source
info "Updating UI source..."
rsync -a --delete \
    "$TEMP_DIR/livos/packages/ui/src/" \
    "$LIVOS_DIR/packages/ui/src/"
# Also copy vite config, tailwind config, index.html etc.
for f in vite.config.ts tailwind.config.ts tailwind.config.js postcss.config.ts postcss.config.js tsconfig.json tsconfig.app.json tsconfig.node.json index.html components.json; do
    if [[ -f "$TEMP_DIR/livos/packages/ui/$f" ]]; then
        cp "$TEMP_DIR/livos/packages/ui/$f" "$LIVOS_DIR/packages/ui/$f"
    fi
done
# Sync public assets (icons, images, PWA manifest)
info "Updating UI public assets..."
rsync -a "$TEMP_DIR/livos/packages/ui/public/" "$LIVOS_DIR/packages/ui/public/"
ok "UI source updated"

# Update config package source
info "Updating config package..."
rsync -a --delete \
    "$TEMP_DIR/livos/packages/config/" \
    "$LIVOS_DIR/packages/config/"
ok "Config package updated"

# ── Phase 202-10: liv-ai-app subapp rsync (Phase 201 carry-over fix) ──────
# Phase 201 left a gap — packages/liv-ai-app/ was NOT in the rsync block,
# so update.sh would build a stale tree. Phase 202 adds /agents, /agents/[id],
# /agents/new, /settings pages + tRPC adapters + new components; without
# this rsync those files never reach Mini PC.
# --delete is intentional so removed files (e.g. Phase 197/198 legacy)
# get pruned. node_modules + .next are excluded so the local build cache
# survives. Defensive: only run if source dir exists in TEMP.
if [[ -d "$TEMP_DIR/livos/packages/liv-ai-app" ]]; then
    info "Updating liv-ai-app subapp source (Phase 202 — /agents + /settings)..."
    mkdir -p "$LIVOS_DIR/packages/liv-ai-app"
    rsync -a --delete \
        --exclude='node_modules' \
        --exclude='.next' \
        --exclude='.turbo' \
        "$TEMP_DIR/livos/packages/liv-ai-app/" \
        "$LIVOS_DIR/packages/liv-ai-app/"
    ok "liv-ai-app subapp source updated"
else
    info "liv-ai-app not in TEMP_DIR — skipping subapp rsync"
fi

# ── Phase 203-03: liv-claw-os fork + liv-claw-gateway wrapper rsync ────────
# In-tree fork of thesysdev/openclaw-os (pinned at SHA 076ae63 — see
# packages/liv-claw-os/UPSTREAM-COMMIT) PLUS the thin systemd-deployable
# wrapper package that boots `openclaw gateway run` in foreground with the
# rebranded plugin pre-loaded. Both directories ship as source-tree
# artifacts; pnpm install (Step 4) resolves their deps; pnpm build below
# in Step 7.x produces the plugin bundle the gateway loads.
# Excludes mirror liv-ai-app (no node_modules / .next / .turbo / dist / out
# rsync churn — those rebuild from source).
if [[ -d "$TEMP_DIR/livos/packages/liv-claw-os" ]]; then
    info "Updating liv-claw-os fork (Phase 203-02 clone of openclaw-os)..."
    mkdir -p "$LIVOS_DIR/packages/liv-claw-os"
    rsync -a --delete \
        --exclude='node_modules' \
        --exclude='.next' \
        --exclude='.turbo' \
        --exclude='dist' \
        --exclude='out' \
        --exclude='.git' \
        "$TEMP_DIR/livos/packages/liv-claw-os/" \
        "$LIVOS_DIR/packages/liv-claw-os/"
    ok "liv-claw-os source updated"
else
    info "liv-claw-os not in TEMP_DIR — skipping (Phase 203 fork not in this checkout)"
fi

if [[ -d "$TEMP_DIR/livos/packages/liv-claw-gateway" ]]; then
    info "Updating liv-claw-gateway wrapper (Phase 203-03)..."
    mkdir -p "$LIVOS_DIR/packages/liv-claw-gateway"
    rsync -a --delete \
        --exclude='node_modules' \
        "$TEMP_DIR/livos/packages/liv-claw-gateway/" \
        "$LIVOS_DIR/packages/liv-claw-gateway/"
    chmod +x "$LIVOS_DIR/packages/liv-claw-gateway/start.sh" 2>/dev/null || true
    ok "liv-claw-gateway wrapper updated"
else
    info "liv-claw-gateway not in TEMP_DIR — skipping (Phase 203 wrapper not in this checkout)"
fi

# ── Step 3: Update Liv source files ───────────────────────
step "Updating Liv source files"

if [[ -d "$LIV_DIR" ]]; then
    # Update liv packages source
    for pkg in core worker mcp-server memory; do
        if [[ -d "$TEMP_DIR/liv/packages/$pkg" ]]; then
            info "Updating liv/$pkg..."
            rsync -a --delete \
                "$TEMP_DIR/liv/packages/$pkg/" \
                "$LIV_DIR/packages/$pkg/"
        fi
    done

    # Update liv root files
    cp "$TEMP_DIR/liv/package.json" "$LIV_DIR/package.json"
    cp "$TEMP_DIR/liv/package-lock.json" "$LIV_DIR/package-lock.json" 2>/dev/null || true
    cp "$TEMP_DIR/liv/tsconfig.json" "$LIV_DIR/tsconfig.json" 2>/dev/null || true

    ok "Liv source updated"
else
    info "Liv not found, copying fresh..."
    cp -r "$TEMP_DIR/liv" "$LIV_DIR"
    ok "Liv installed fresh"
fi

# ── Step 4: Install dependencies ──────────────────────────
step "Installing dependencies"

info "Installing LivOS dependencies..."
cd "$LIVOS_DIR"
# Phase 202-10: CI=true forces --frozen-lockfile by default. When the
# committed pnpm-lock.yaml is out of sync with package.json (e.g. dev
# branch added a dep without `pnpm install`), the fallback MUST opt out
# explicitly via --no-frozen-lockfile. Previously the bare `pnpm install`
# fallback inherited the CI=true default and looped on the same error.
pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile
ok "LivOS dependencies installed"

if [[ -d "$LIV_DIR" ]]; then
    info "Installing Liv dependencies..."
    cd "$LIV_DIR"
    npm install --production=false 2>/dev/null || npm install
    ok "Liv dependencies installed"
fi

# ── Step 4.5: Phase 208-03 — install openclaw CLI shim ────
# Wires /opt/livos/bin/openclaw → workspace-pinned openclaw entry.
# Required by livinityd's openclaw-cli/cli-spawner.ts resolver (Plan 208-03
# Task 2) — without this, the openclaw.config.setDefaultModel tRPC mutation
# throws OpenclawNotInstalledError because no system-wide `openclaw` exists
# on the Mini PC and `npm install` does NOT hoist pnpm package bins to PATH.
#
# Idempotent: the helper exits 0 immediately if the symlink already points
# at a working binary. Sourced from TEMP_DIR (fresh clone) so a stale on-disk
# helper can't shadow the just-pulled version. Non-fatal — warn and continue
# if the helper is missing or fails, so older deploys (where the helper file
# doesn't exist yet) don't block the rest of the update.
step "Phase 208-03: openclaw CLI shim install"
_OPENCLAW_INSTALLER_SRC="$TEMP_DIR/scripts/install/install-openclaw-cli.sh"
if [[ -f "$_OPENCLAW_INSTALLER_SRC" ]]; then
    if LIVOS_ROOT="$LIVOS_DIR" bash "$_OPENCLAW_INSTALLER_SRC" 2>&1 | tail -5; then
        ok "openclaw CLI shim ensured at $LIVOS_DIR/bin/openclaw"
    else
        warn "install-openclaw-cli.sh exited non-zero — openclaw.config.* mutations may fail; check pnpm-store for openclaw@* dirs"
    fi
else
    info "scripts/install/install-openclaw-cli.sh not in TEMP_DIR — skipping (pre-Phase 208-03 deploy)"
fi

# ── Step 4.6: Phase 225 — liv-assistant install (Phase 223 vendored AionUi) ────
# Re-runs the idempotent installer on every update so the on-box vendored binary +
# systemd unit are guaranteed-fresh. Installer is content-addressed (pinned SHA),
# so on unchanged source this is a sub-second no-op (UPSTREAM.md timestamp preserved,
# tarball cache hit, symlink unchanged). Phase 223-01 contract. Phase 291 R3 adds a
# post-install symlink-on-pin self-heal (the installer is fail-soft → boxes drifted).
step "Phase 225: liv-assistant install (vendored AionUi, self-healed to pin)"
_LIV_ASSISTANT_INSTALLER_SRC="$TEMP_DIR/scripts/install-liv-assistant.sh"
# Fallback to on-disk copy (for the rare case TEMP_DIR was pruned mid-run)
if [[ ! -f "$_LIV_ASSISTANT_INSTALLER_SRC" ]]; then
    _LIV_ASSISTANT_INSTALLER_SRC="$LIVOS_DIR/scripts/install-liv-assistant.sh"
fi
if [[ -f "$_LIV_ASSISTANT_INSTALLER_SRC" ]]; then
    # Phase 291 R3 — read the pinned AionUi version FROM the installer that is about
    # to run, so the self-heal check below never drifts from the pin (no second
    # hardcoded version to keep in sync). Empty string if the grep ever misses.
    _AIONUI_PIN="$(grep -oE 'AIONUI_VERSION="[^"]+"' "$_LIV_ASSISTANT_INSTALLER_SRC" | head -1 | cut -d'"' -f2)"
    # True iff /opt/liv-assistant/current points at the pinned aionui-web-<pin> tree
    # (the symlink TEXT is …/aionui-web-<pin>/aionui-web — we check the link target,
    # not whether it resolves, so a half-extracted tree still reads as "off pin").
    _liv_symlink_on_pin() {
        local _t
        _t="$(readlink /opt/liv-assistant/current 2>/dev/null || true)"
        [[ -n "$_AIONUI_PIN" && "$_t" == *"aionui-web-${_AIONUI_PIN}/"* ]]
    }

    # 2026-06-15: wrap in `timeout` — this step (AionUi/claude-agent setup) has hung
    # indefinitely on a `claude doctor` child with no timeout, stranding the whole
    # update (observed on the `everything` box). It is OPTIONAL polish, so a timeout
    # that warns + continues is strictly better than an infinite hang.
    if timeout 420 bash "$_LIV_ASSISTANT_INSTALLER_SRC" 2>&1 | tail -10; then
        ok "liv-assistant install ensured (vendored AionUi v${_AIONUI_PIN:-?} at /opt/liv-assistant/current)"
    else
        # 2026-06-13: was a hard `fail` (abort). But liv-assistant (AionUi) is the
        # OPTIONAL Liv AI subsystem — exactly the "OPTIONAL polish, NOT core" class
        # the `set +e` block below (lines ~865-872) was created for. A SHA/network/
        # disk hiccup here must NOT throw away an otherwise-good core LivOS update
        # (UI + livinityd + liv core) and leave the box stuck on the old version.
        # Warn + continue; the core build/restart + SHA recording still happen.
        warn "install-liv-assistant.sh failed (SHA mismatch / network / disk?) — Liv AI may be degraded, but NOT aborting the core LivOS update. Re-run later or check the output above."
    fi

    # Phase 291 R3 — durable self-heal. The installer above is FAIL-SOFT, so a
    # SHA/download/timeout/disk hiccup can leave `current` pointing at an OLD AionUi
    # while the core update still reports success. That is exactly why boxes sat on
    # a stale AionUi across many "successful" Updates → the R2 Liv composer features
    # (Skills / MCP / file upload / permission Mode via v0.1.30 config-options) 404'd.
    # Verify the symlink actually advanced to the pin; if not, retry the installer
    # ONCE, then surface a LOUD, specific warning instead of silently swallowing it.
    if [[ -n "$_AIONUI_PIN" ]]; then
        if _liv_symlink_on_pin; then
            ok "liv-assistant on pin: /opt/liv-assistant/current -> aionui-web-${_AIONUI_PIN}"
        else
            warn "liv-assistant NOT on pin (current -> $(readlink /opt/liv-assistant/current 2>/dev/null || echo '??'); expected aionui-web-${_AIONUI_PIN}) — retrying the installer ONCE"
            timeout 420 bash "$_LIV_ASSISTANT_INSTALLER_SRC" 2>&1 | tail -10 || true
            if _liv_symlink_on_pin; then
                ok "liv-assistant self-healed to pin aionui-web-${_AIONUI_PIN} on retry"
            else
                warn "LIV AI STALE: /opt/liv-assistant/current is STILL NOT aionui-web-${_AIONUI_PIN} after a retry — the Liv command bar's Skills/MCP/upload + permission Modes will keep 404ing until this resolves. Diagnose the cause: 'sudo bash $_LIV_ASSISTANT_INSTALLER_SRC' (watch for SHA mismatch / GitHub-blocked curl / 420s timeout / disk-full), then re-run the update."
            fi
        fi
    fi
else
    info "scripts/install-liv-assistant.sh not in TEMP_DIR or LIVOS_DIR — skipping (pre-Phase 223-01 deploy)"
fi

# Phase 259 — the liv-assistant / Claude-Code / AionUi MCP tooling below (245.2–
# 245.3) is OPTIONAL polish, NOT core to livos. Under `set -e` a non-critical
# failure here (e.g. `tee .../claude: Text file busy` while liv-assistant holds
# the binary, or an AionUi patch hiccup) aborted the WHOLE deploy BEFORE the
# package build + service restart — leaving livos on stale/half-built code or
# down. Disable errexit for this best-effort block so it can never block the real
# deploy; re-enabled right after, before the load-bearing Caddy snippet.
set +e

# ── Phase 245.2 — Claude Code wrapper for MCP_TIMEOUT ─────────────────────
# aioncore (AionUi backend) sanitizes env when spawning Claude Code child processes,
# dropping any MCP_TIMEOUT set via systemd unit or shell. Without 30s timeout, 5 of 6
# stdio MCPs (luse / liv-system / liv-vault / liv-apps / liv-docker) silently fail
# to register tools during 6× parallel `npx tsx` cold-start. Wrapper script at
# `/home/bruce/.local/bin/claude` exports MCP_TIMEOUT=30000 before exec'ing the real
# claude binary. Idempotent: only re-installs if wrapper missing or stale.
step "Phase 245.2: Claude Code MCP_TIMEOUT wrapper"
# Phase 277.1 — desktop-user-aware + version-agnostic. Derive the desktop user/home
# (NOT hardcoded bruce) and resolve the REAL claude dynamically (newest native
# versioned install, else whatever `claude` resolves to — e.g. a global npm install),
# so the wrapper works on ANY operator's box regardless of username or claude version.
_set_desktop_identity
_CLAUDE_BIN="$_DESKTOP_HOME/.local/bin/claude"
_WRAPPER_MARKER="Phase 245.2 wrapper"
# Resolve the REAL claude binary (version-agnostic), EXCLUDING our own wrapper so we can
# NEVER bake a self-exec wrapper (fork/exec loop — review finding). Realistic locations
# in order: native versioned install (the claude.ai installer) → global npm
# (/usr/(local/)bin) → the DESKTOP USER's login PATH (covers ~/.local/bin installs; run
# AS the user since root's PATH excludes ~/.local/bin). Any candidate that canonicalises
# to the wrapper path OR already carries our marker is rejected.
_CLAUDE_REAL=$(ls -1d "$_DESKTOP_HOME"/.local/share/claude/versions/* 2>/dev/null | sort -V | tail -1)
[[ -x "$_CLAUDE_REAL" ]] || _CLAUDE_REAL=""
if [[ -z "$_CLAUDE_REAL" ]]; then
    _BIN_CANON=$(readlink -f "$_CLAUDE_BIN" 2>/dev/null)
    for _cand in /usr/local/bin/claude /usr/bin/claude "$(sudo -u "$_DESKTOP_USER" -H bash -lc 'command -v claude' 2>/dev/null)"; do
        [[ -x "$_cand" ]] || continue
        [[ -n "$_BIN_CANON" && "$(readlink -f "$_cand" 2>/dev/null)" == "$_BIN_CANON" ]] && continue
        grep -q "$_WRAPPER_MARKER" "$_cand" 2>/dev/null && continue
        _CLAUDE_REAL="$_cand"; break
    done
fi
if [[ -n "$_CLAUDE_REAL" && -x "$_CLAUDE_REAL" ]]; then
    _NEEDS_INSTALL=0
    if [[ ! -f "$_CLAUDE_BIN" ]] || ! grep -q "$_WRAPPER_MARKER" "$_CLAUDE_BIN" 2>/dev/null; then
        _NEEDS_INSTALL=1
    fi
    if [[ "$_NEEDS_INSTALL" -eq 1 ]]; then
        # Preserve original symlink if it exists
        if [[ -L "$_CLAUDE_BIN" && ! -L "$_CLAUDE_BIN.real-symlink" ]]; then
            sudo -u "$_DESKTOP_USER" mv "$_CLAUDE_BIN" "$_CLAUDE_BIN.real-symlink" 2>/dev/null || true
        fi
        sudo -u "$_DESKTOP_USER" mkdir -p "$_DESKTOP_HOME/.local/bin"
        # NON-quoted heredoc so $_CLAUDE_REAL (the resolved real binary) is baked in;
        # \$MCP_TIMEOUT and \$@ are escaped so they stay runtime-evaluated in the wrapper.
        sudo -u "$_DESKTOP_USER" tee "$_CLAUDE_BIN" > /dev/null <<CLAUDE_WRAPPER_EOF
#!/bin/bash
# Phase 245.2 wrapper — aioncore sanitizes env when spawning Claude Code, dropping MCP_TIMEOUT.
# Without 30s timeout, 5 of 6 stdio MCPs (luse/liv-*) silently fail during cold-start.
export MCP_TIMEOUT=\${MCP_TIMEOUT:-30000}
exec "$_CLAUDE_REAL" "\$@"
CLAUDE_WRAPPER_EOF
        sudo -u "$_DESKTOP_USER" chmod 755 "$_CLAUDE_BIN"
        ok "Phase 245.2: claude wrapper installed at $_CLAUDE_BIN → $_CLAUDE_REAL (MCP_TIMEOUT=30000)"
    else
        ok "Phase 245.2: claude wrapper already in place (idempotent skip)"
    fi
else
    # Phase 245.2: no claude binary resolvable for the desktop user (native versioned
    # install absent AND `claude` not on PATH) → wrapper deferred.
    # Phase 277 (Bug 1 — THE original hang): 'claude doctor' is single-quoted ON PURPOSE.
    # Backticks here would be COMMAND SUBSTITUTION — bash would actually RUN `claude
    # doctor`, which hangs on input/auth and blocks the whole Update (anon_pipe_read).
    # That was the multi-minute stall that needed a manual kill. DO NOT use backticks.
    info "Phase 245.2: no claude binary found for $_DESKTOP_USER — wrapper deferred (run 'claude doctor' to install)"
fi

# ── Phase 245.4 — Single-binary MCP wrappers under /usr/local/bin/ ─────────
# AionUi's "One-Click Import" UI flow concatenates `command + args[]` into a single
# string and runs `which` on it → "Command not found" when args are present. Plus,
# even when bypassing import via direct `claude mcp add`, AionUi spawns under the
# liv-assistant.service sandbox (`ProtectHome=read-only`, ReadWritePaths excludes
# ~/.npm), so `npx tsx ...` fails with EROFS when it tries to write its package cache.
#
# Fix: lay down 5 single-binary wrapper scripts that exec `/usr/bin/tsx ...` directly
# (no npx, no npm cache needed). MCP config in AionUi/Claude Code uses these wrappers
# as the `command` with empty `args[]` — works for both One-Click Import path and the
# direct spawn path under the sandboxed liv-assistant service.
# ── Phase 253 (tsx gap) — ensure tsx is installed for the MCP wrappers ───────
# The wrappers below exec `/usr/bin/node /usr/lib/node_modules/tsx/dist/cli.mjs`,
# but nothing here ever INSTALLED tsx. A fresh box (the test box) was missing it,
# so EVERY LivOS MCP server failed to start ("Cannot find module .../tsx/dist/
# cli.mjs"), which HUNG the Claude ACP session/new — claude-agent-acp waits for
# its injected MCP servers — and Claude chat silently broke (no 401, no
# deadlock). Mini PC worked only because tsx happened to be installed there.
# Pin to 4.21.0 (the version proven on Mini PC). Idempotent.
if [[ ! -f /usr/lib/node_modules/tsx/dist/cli.mjs ]]; then
    if command -v npm >/dev/null 2>&1; then
        info "Installing tsx@4.21.0 globally (/usr) for the Liv MCP wrappers..."
        if npm install -g tsx@4.21.0 --prefix /usr >/dev/null 2>&1; then
            chmod -R a+rX /usr/lib/node_modules/tsx 2>/dev/null || true
            ok "tsx installed at /usr/lib/node_modules/tsx"
        else
            warn "tsx global install failed — Liv MCP servers + Claude chat may not work; run: sudo npm install -g tsx@4.21.0 --prefix /usr"
        fi
    else
        warn "npm not found — cannot install tsx; Liv MCP servers will not start"
    fi
else
    info "tsx already present at /usr/lib/node_modules/tsx"
fi

step "Phase 245.4: Liv MCP wrapper scripts (npm-free spawn under read-only \$HOME sandbox)"
_MCP_DIR=/usr/local/bin
declare -A _MCP_PATHS=(
    [liv-system]="/opt/livos/packages/livinityd/source/modules/mcp/local/liv-system/index.ts"
    [liv-vault]="/opt/livos/packages/livinityd/source/modules/mcp/local/liv-vault/index.ts"
    [liv-apps]="/opt/livos/packages/livinityd/source/modules/mcp/local/liv-apps/index.ts"
    [liv-docker]="/opt/livos/packages/livinityd/source/modules/mcp/local/liv-docker/index.ts"
    [luse]="/opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts"
)
_MCP_WRAPPED=0
for _NAME in "${!_MCP_PATHS[@]}"; do
    _WRAPPER="${_MCP_DIR}/liv-mcp-${_NAME}"
    _PATH="${_MCP_PATHS[$_NAME]}"
    _DESIRED="#!/bin/bash
# Phase 245.5 wrapper — explicit /usr/bin/node + tsx cli.mjs bypasses TWO traps:
# (1) EROFS under liv-assistant.service ProtectHome=read-only sandbox when npx
#     tries to write its package cache to ~/.npm.
# (2) Bun runtime resolution when AionUi's @agentclientprotocol/claude-agent-acp
#     bunx prepends /tmp/bunx-*/node_modules/.bin to PATH. tsx's shebang
#     '#!/usr/bin/env node' then resolves to Bun runtime which cannot import
#     tsx's CJS implementation ('Cannot find module ./cjs/index.cjs from \"\"').
exec /usr/bin/node /usr/lib/node_modules/tsx/dist/cli.mjs ${_PATH} \"\$@\""
    if [[ ! -f "$_WRAPPER" ]] || ! diff -q <(echo "$_DESIRED") "$_WRAPPER" >/dev/null 2>&1; then
        echo "$_DESIRED" | sudo tee "$_WRAPPER" > /dev/null
        sudo chmod 755 "$_WRAPPER"
        _MCP_WRAPPED=$((_MCP_WRAPPED + 1))
    fi
done
if [[ "$_MCP_WRAPPED" -gt 0 ]]; then
    ok "Phase 245.4: ${_MCP_WRAPPED}/5 MCP wrapper(s) installed/updated"
else
    ok "Phase 245.4: 5/5 MCP wrappers already current (idempotent skip)"
fi

# Patch AionUi backend MCP entries to use wrapper paths (only if entries exist
# from Phase 241 seed AND still reference the old /usr/bin/npx command). The
# PATCH is HTTP-driven so it survives across liv-assistant restarts. Idempotent.
step "Phase 245.4: AionUi backend MCP entry patching (wrapper paths)"
_PATCH_COUNT=0
# Phase 275 — derive the LivOS desktop user (NOT hardcoded bruce) so the luse env
# below carries the right slug + XAUTHORITY on ANY box (e.g. uid-1001 'everything').
# WebApps now route to their real url so the slug is non-fatal, but native apps +
# the synthesized fallback need it correct. Same desktop-user pattern as elsewhere.
_LUSE_RUN_USER=$(grep -oP '^User=\K.*' /etc/systemd/system/livos.service 2>/dev/null | head -1)
[[ -n "$_LUSE_RUN_USER" ]] || _LUSE_RUN_USER=$(getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 {print $1; exit}')
[[ -n "$_LUSE_RUN_USER" ]] || _LUSE_RUN_USER=$(stat -c '%U' /opt/livos 2>/dev/null)
_LUSE_RUN_HOME=$(getent passwd "$_LUSE_RUN_USER" 2>/dev/null | cut -d: -f6)
[[ -n "$_LUSE_RUN_HOME" ]] || _LUSE_RUN_HOME="/home/$_LUSE_RUN_USER"
for _NAME in "${!_MCP_PATHS[@]}"; do
    _ID=$(curl -s --connect-timeout 3 --max-time 10 http://localhost:3020/api/mcp/servers 2>/dev/null | \
        python3 -c "import sys,json; d=json.load(sys.stdin); [print(m['id']) for m in d.get('data',[]) if m['name']=='${_NAME}']" 2>/dev/null | head -1)
    if [[ -n "$_ID" ]]; then
        _CURRENT_CMD=$(curl -s --connect-timeout 3 --max-time 10 "http://localhost:3020/api/mcp/servers/$_ID" 2>/dev/null | \
            python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('transport',{}).get('command',''))" 2>/dev/null)
        if [[ "$_CURRENT_CMD" != "/usr/local/bin/liv-mcp-${_NAME}" ]]; then
            _ENV_JSON='{}'
            if [[ "$_NAME" == "luse" ]]; then
                # Phase 276 — host display :1 removed; the luse env no longer carries
                # DISPLAY/XAUTHORITY (no host canvas). Generic computer-use tools take
                # an explicit per-app display:":N"; the resolver/openLivosApp path
                # (launch WebApp by name) needs neither.
                _ENV_JSON="{\"LIVINITYD_API_URL\":\"http://127.0.0.1:8080\",\"LIV_API_KEY\":\"$(grep -oP 'LIV_API_KEY=\K[^\n]+' /opt/livos/.env 2>/dev/null || echo missing)\",\"LUSE_REDIS_URL\":\"$(grep -oP 'REDIS_URL=\K[^\n]+' /opt/livos/.env 2>/dev/null || echo missing)\",\"LUSE_USER_SLUG\":\"${_LUSE_RUN_USER}\",\"LUSE_USER_ID\":\"${_LUSE_RUN_USER}\",\"LUSE_DOMAIN_ROOT\":\"livinity.io\"}"
            else
                _ENV_JSON="{\"LIVINITYD_API_URL\":\"http://127.0.0.1:8080\",\"LIV_API_KEY\":\"$(grep -oP 'LIV_API_KEY=\K[^\n]+' /opt/livos/.env 2>/dev/null || echo missing)\"}"
            fi
            curl -s --connect-timeout 3 --max-time 15 -X PUT "http://localhost:3020/api/mcp/servers/$_ID" \
                -H "Content-Type: application/json" \
                -d "{\"transport\":{\"type\":\"stdio\",\"command\":\"/usr/local/bin/liv-mcp-${_NAME}\",\"args\":[],\"env\":${_ENV_JSON}}}" > /dev/null
            _PATCH_COUNT=$((_PATCH_COUNT + 1))
        fi
    fi
done
if [[ "$_PATCH_COUNT" -gt 0 ]]; then
    ok "Phase 245.4: ${_PATCH_COUNT} AionUi MCP entries patched to wrapper paths"
else
    ok "Phase 245.4: AionUi MCP entries already on wrapper paths (idempotent skip)"
fi

# ── Phase 245.3 — Claude Code user-level MCP permissions allowlist ─────────
# AionUi's @agentclientprotocol/claude-agent-acp wrapper enforces tool permissions
# strictly: only mcp__* patterns listed in user/project settings.json `permissions.allow`
# are surfaced to the agent. Without this, Claude Code receives all 6 stdio MCPs via
# --mcp-config and they connect, BUT the ACP layer filters out the unallowed mcp__*
# tools from the agent's tool list. Agent then sees only Bash/Read/etc. + Claude.AI
# hosted MCPs + aionui-team-guide (always pre-allowed by AionUi).
#
# Fix: write /home/bruce/.claude/settings.json with wildcard MCP allowlist for the
# 6 system MCPs (luse, liv-system, liv-vault, liv-apps, liv-docker, aionui-team-guide).
# Idempotent — only rewrites if missing or content drifts.
step "Phase 245.3: Claude Code MCP permissions allowlist"
# Phase 277.1 — write to the DESKTOP user's home (NOT hardcoded /home/bruce) so the
# MCP allowlist actually applies to the user liv-assistant runs as.
_set_desktop_identity
_CLAUDE_SETTINGS="$_DESKTOP_HOME/.claude/settings.json"
_CLAUDE_SETTINGS_DESIRED='{
  "permissions": {
    "allow": [
      "mcp__luse__*",
      "mcp__liv-system__*",
      "mcp__liv-vault__*",
      "mcp__liv-apps__*",
      "mcp__liv-docker__*",
      "mcp__aionui-team-guide__*"
    ]
  }
}'
if [[ -f "$_CLAUDE_SETTINGS" ]] && diff -q <(echo "$_CLAUDE_SETTINGS_DESIRED") "$_CLAUDE_SETTINGS" >/dev/null 2>&1; then
    ok "Phase 245.3: settings.json already has MCP allowlist (idempotent skip)"
else
    sudo -u "$_DESKTOP_USER" mkdir -p "$_DESKTOP_HOME/.claude"
    echo "$_CLAUDE_SETTINGS_DESIRED" | sudo -u "$_DESKTOP_USER" tee "$_CLAUDE_SETTINGS" > /dev/null
    ok "Phase 245.3: settings.json written with 6 MCP wildcard permissions"
fi

# ── Phase 275/276 — Liv agent persona (ALL CLI backends) ───────────────────
# Without this, whichever CLI agent AionUi runs boots with its default
# "terminal coding agent" persona and refuses to open apps ("I can't open a
# browser") until the user says "use luse mcp". Seed the SAME persona to every
# supported CLI's user-global instruction file so it works no matter which agent
# the user picks (NOT just Claude):
#   - Claude Code → ~/.claude/CLAUDE.md
#   - OpenAI Codex → ~/.codex/AGENTS.md
#   - Gemini CLI  → ~/.gemini/GEMINI.md
# (The MCP tool descriptions are already CLI-agnostic; this adds the persona
# nudge for every backend.) Desktop-user-aware (NOT hardcoded bruce); idempotent.
step "Phase 275/276: Liv agent persona (all CLI backends)"
_LIV_PERSONA_SRC="$TEMP_DIR/scripts/install/seeds/liv-agent-persona.md"
[[ -f "$_LIV_PERSONA_SRC" ]] || _LIV_PERSONA_SRC="$LIVOS_DIR/scripts/install/seeds/liv-agent-persona.md"
_PERSONA_USER=$(grep -oP '^User=\K.*' /etc/systemd/system/livos.service 2>/dev/null | head -1)
[[ -n "$_PERSONA_USER" ]] || _PERSONA_USER=$(getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 {print $1; exit}')
[[ -n "$_PERSONA_USER" ]] || _PERSONA_USER=$(stat -c '%U' /opt/livos 2>/dev/null)
_PERSONA_HOME=$(getent passwd "$_PERSONA_USER" 2>/dev/null | cut -d: -f6)
[[ -n "$_PERSONA_HOME" ]] || _PERSONA_HOME="/home/$_PERSONA_USER"
if [[ ! -f "$_LIV_PERSONA_SRC" ]]; then
    warn "Phase 275/276: liv-agent-persona.md seed not found — skipping persona seed"
else
    # subdir:file pairs — one per CLI instruction convention.
    for _PERSONA_TARGET in ".claude:CLAUDE.md" ".codex:AGENTS.md" ".gemini:GEMINI.md"; do
        _P_DIR="${_PERSONA_TARGET%%:*}"
        _P_FILE="${_PERSONA_TARGET##*:}"
        _P_DST="$_PERSONA_HOME/$_P_DIR/$_P_FILE"
        if [[ -f "$_P_DST" ]] && cmp -s "$_LIV_PERSONA_SRC" "$_P_DST"; then
            ok "Phase 275/276: persona already current ($_P_DST)"
        else
            sudo -u "$_PERSONA_USER" mkdir -p "$_PERSONA_HOME/$_P_DIR"
            sudo -u "$_PERSONA_USER" tee "$_P_DST" < "$_LIV_PERSONA_SRC" > /dev/null
            ok "Phase 275/276: persona written to $_P_DST (user=$_PERSONA_USER)"
        fi
    done
fi

# ── Phase 288 — Liv deploy schema doc (ALL CLI backends) ───────────────────
# Seeds the deploy_app compose+manifest schema reference next to the persona so
# Liv authors a VALID, sanitizer-passing compose before calling deploy_app (no
# docker.sock / host binds / privileged). Written to a SEPARATE filename
# (LIV-DEPLOY.md) so it NEVER clobbers the persona file (CLAUDE.md/AGENTS.md/
# GEMINI.md). Reuses the already-resolved $_PERSONA_USER / $_PERSONA_HOME from
# the persona step above; idempotent via cmp -s.
step "Phase 288: Liv deploy schema doc (all CLI backends)"
_LIV_DEPLOY_SCHEMA_SRC="$TEMP_DIR/scripts/install/seeds/liv-deploy-schema.md"
[[ -f "$_LIV_DEPLOY_SCHEMA_SRC" ]] || _LIV_DEPLOY_SCHEMA_SRC="$LIVOS_DIR/scripts/install/seeds/liv-deploy-schema.md"
# Re-resolve the desktop user/home with the same 3-fallback chain in case the
# persona step above was skipped (its src missing) and left these empty.
[[ -n "$_PERSONA_USER" ]] || _PERSONA_USER=$(grep -oP '^User=\K.*' /etc/systemd/system/livos.service 2>/dev/null | head -1)
[[ -n "$_PERSONA_USER" ]] || _PERSONA_USER=$(getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 {print $1; exit}')
[[ -n "$_PERSONA_USER" ]] || _PERSONA_USER=$(stat -c '%U' /opt/livos 2>/dev/null)
[[ -n "$_PERSONA_HOME" ]] || _PERSONA_HOME=$(getent passwd "$_PERSONA_USER" 2>/dev/null | cut -d: -f6)
[[ -n "$_PERSONA_HOME" ]] || _PERSONA_HOME="/home/$_PERSONA_USER"
if [[ ! -f "$_LIV_DEPLOY_SCHEMA_SRC" ]]; then
    warn "Phase 288: liv-deploy-schema.md seed not found — skipping deploy-schema seed"
else
    # subdir:file pairs — one per CLI convention, but a SEPARATE filename so the
    # persona files are never overwritten.
    for _SCHEMA_TARGET in ".claude:LIV-DEPLOY.md" ".codex:LIV-DEPLOY.md" ".gemini:LIV-DEPLOY.md"; do
        _S_DIR="${_SCHEMA_TARGET%%:*}"
        _S_FILE="${_SCHEMA_TARGET##*:}"
        _S_DST="$_PERSONA_HOME/$_S_DIR/$_S_FILE"
        if [[ -f "$_S_DST" ]] && cmp -s "$_LIV_DEPLOY_SCHEMA_SRC" "$_S_DST"; then
            ok "Phase 288: deploy schema already current ($_S_DST)"
        else
            sudo -u "$_PERSONA_USER" mkdir -p "$_PERSONA_HOME/$_S_DIR"
            sudo -u "$_PERSONA_USER" tee "$_S_DST" < "$_LIV_DEPLOY_SCHEMA_SRC" > /dev/null
            ok "Phase 288: deploy schema written to $_S_DST (user=$_PERSONA_USER)"
        fi
    done
fi

# ── Phase 245.3 — liv-assistant restart to pick up settings + wrapper ──────
# Live-applies the 245.2 wrapper + 245.3 settings to any future Claude Code spawns.
# Without restart, in-flight chat sessions keep their pre-fix env/settings.
step "Phase 245.3: liv-assistant restart for MCP fix activation"
# Phase 277 (Bug 1 — defensive hardening, NOT the root cause): bound the restart wait.
# `systemctl restart` blocks until the unit reaches "started"; if aioncore is slow or
# wedged on boot this could wait up to TimeoutStartSec (~90s). The ACTUAL multi-minute
# "claude doctor" stall was the unescaped-backtick command-substitution at line ~1387
# (fixed there). This bound is belt-and-suspenders so no restart wait can stall the
# Update for minutes. `timeout -k 10 75` caps the WAIT (the systemd job keeps booting
# in the background; the Step 8 restart + bounded :3020 probe confirm serving state).
# 124 = timed out → warn + continue.
if timeout -k 10 75 sudo systemctl restart liv-assistant 2>&1; then
    sleep 3
    if sudo systemctl is-active liv-assistant | grep -q '^active'; then
        ok "Phase 245.3: liv-assistant restarted — new chats will see all 6 MCPs"
    else
        warn "Phase 245.3: liv-assistant restart reported active=false — check journalctl"
    fi
else
    warn "Phase 245.3: liv-assistant restart slow/failed (bounded at 75s, continuing — Step 8 restart + probe still run)"
fi

# Phase 259 — re-enable errexit; everything below (Caddy snippet, package build,
# service restart) is load-bearing and MUST still abort on failure.
set -e

# ── Step 4.7: Phase 226 — Caddy /liv reverse-proxy snippet install ─────────
# Lays down /etc/caddy/conf.d/liv-assistant.caddy + wires `import liv_assistant`
# into the existing bruce.livinity.io site block, defensively chowns Caddyfile
# to bruce:bruce (feedback_caddyfile_must_be_bruce_owned), and HARD-GATES on
# `caddy validate` exit 0. Installer is idempotent (cmp -s guard); re-runs on
# unchanged source = no Caddyfile write.
step "Phase 226: Caddy /liv reverse-proxy snippet install"
_LIV_CADDY_INSTALLER_SRC="$TEMP_DIR/scripts/install-liv-caddy-snippet.sh"
if [[ ! -f "$_LIV_CADDY_INSTALLER_SRC" ]]; then
    _LIV_CADDY_INSTALLER_SRC="$LIVOS_DIR/scripts/install-liv-caddy-snippet.sh"
fi
if [[ -f "$_LIV_CADDY_INSTALLER_SRC" ]]; then
    if bash "$_LIV_CADDY_INSTALLER_SRC" 2>&1 | tail -15; then
        ok "Caddy /liv routing ensured (deprecation stub; routing emitted by livinityd caddy.ts since Phase 226-04)"
    else
        fail "install-liv-caddy-snippet.sh failed — see output above (caddy validate fail / EACCES / awk fail?)"
    fi
else
    info "scripts/install-liv-caddy-snippet.sh not in TEMP_DIR or LIVOS_DIR — skipping (pre-Phase 226-01 deploy)"
fi

# ── Step 5: Build packages ────────────────────────────────
step "Building packages"

# Build @livos/config
info "Building @livos/config..."
cd "$LIVOS_DIR/packages/config"
npx tsc
cd "$LIVOS_DIR"
ok "@livos/config built"

# Build UI
# Phase 51 (v29.5 A2) — defensive fresh-build for UI bundle.
#   1. rm -rf dist BEFORE build forces vite to regenerate from source. Prevents
#      stale dist surviving deploys when vite's cache hash matches by accident
#      OR when a prior build silently failed (the v29.4 1m 2s deploy regression
#      hypothesis: streaming/security-panel UI never actually deployed).
#   2. verify_build moved to AFTER npm run build (matches the "Call AFTER every
#      build invocation" contract documented at the function definition). Pre-build
#      verify_build was a no-op on existing installs (always passed because old
#      dist was present) and a hard-block on fresh installs (exit 1 because dist
#      didn't exist yet).
info "Building UI (this may take a minute)..."
cd "$LIVOS_DIR/packages/ui"
rm -rf dist
npm run build 2>&1 | tail -5
verify_build "@livos/ui" "/opt/livos/packages/ui/dist"
cd "$LIVOS_DIR"

# Ensure UI symlink
ln -sf "$LIVOS_DIR/packages/ui/dist" "$LIVOS_DIR/packages/livinityd/ui"
ok "UI built and linked"

# Build Liv packages
if [[ -d "$LIV_DIR" ]]; then
    info "Building Liv core..."
    cd "$LIV_DIR/packages/core" && npx tsc && cd "$LIV_DIR"
verify_build "@liv/core" "/opt/liv/packages/core/dist"
    ok "Liv core built"

    # Build memory service
    if [[ -d "$LIV_DIR/packages/memory" ]]; then
        info "Building Liv memory..."
        cd "$LIV_DIR/packages/memory"
        npm run build 2>&1 | tail -3
        cd "$LIV_DIR"
        ok "Liv memory built"
    fi

    info "Building Liv worker..."
    cd "$LIV_DIR/packages/worker" && npx tsc 2>/dev/null && cd "$LIV_DIR" || cd "$LIV_DIR"
verify_build "@liv/worker" "/opt/liv/packages/worker/dist"

    info "Building Liv mcp-server..."
    cd "$LIV_DIR/packages/mcp-server" && npx tsc 2>/dev/null && cd "$LIV_DIR" || cd "$LIV_DIR"
verify_build "@liv/mcp-server" "/opt/liv/packages/mcp-server/dist"

    # Copy liv dist to pnpm symlink location
    # ── Phase 31 BUILD-02: multi-dir dist-copy loop ──
    # Replaces the `find ... | head -1` single-target bug (BACKLOG 999.5b).
    # Copies @liv/core dist into ALL pnpm-store resolution dirs so livinityd
    # always picks up fresh dist regardless of which dir its symlink resolves to.
    LIV_CORE_DIST_SRC="$LIV_DIR/packages/core/dist"
    if [[ ! -d "$LIV_CORE_DIST_SRC" ]] || [[ -z "$(find "$LIV_CORE_DIST_SRC" -type f 2>/dev/null | head -1)" ]]; then
        echo "DIST-COPY-FAIL: source $LIV_CORE_DIST_SRC is empty — liv core build did not emit" >&2
        exit 1
    fi
    COPY_COUNT=0
    for store_dir in /opt/livos/node_modules/.pnpm/@liv+core*/; do
        [[ -d "$store_dir" ]] || continue
        target_parent="${store_dir}node_modules/@liv/core"
        target="${target_parent}/dist"
        mkdir -p "$target_parent"
        rm -rf "$target"
        cp -r "$LIV_CORE_DIST_SRC" "$target"
        if [[ -z "$(find "$target" -type f 2>/dev/null | head -1)" ]]; then
            echo "DIST-COPY-FAIL: post-copy target $target is empty" >&2
            exit 1
        fi
        COPY_COUNT=$((COPY_COUNT + 1))
        echo "[VERIFY] liv core dist copied to $store_dir"
    done
    if [[ "$COPY_COUNT" -eq 0 ]]; then
        echo "DIST-COPY-FAIL: no @liv+core* dirs found under /opt/livos/node_modules/.pnpm/" >&2
        exit 1
    fi
    ok "Liv dist linked to $COPY_COUNT pnpm-store resolution dir(s)"
fi

# ── Step 6: Update gallery cache ──────────────────────────
step "Updating gallery cache"

# Phase 294 hardening: every scan/network op here is wrapped in `timeout` so a
# stale mount under data/app-stores/ (find) or an unreachable gallery remote (git
# fetch) can NEVER hang the deploy. This step runs BEFORE the restart + the
# .deployed-sha/.deployed-release record, so a hang here strands the whole update
# with the version never advancing (a real operator update stopped dead at this
# exact step). All failures stay non-fatal (|| true / warn) — the gallery cache is
# recreated on first App Store access anyway.
GALLERY_CACHE_DIR=$(timeout 20 find "$LIVOS_DIR/data/app-stores/" -maxdepth 1 -name '*livinity-apps*' -type d 2>/dev/null | head -1 || true)
if [[ -n "$GALLERY_CACHE_DIR" ]] && [[ -d "$GALLERY_CACHE_DIR/.git" ]]; then
    info "Updating gallery cache at $GALLERY_CACHE_DIR..."
    cd "$GALLERY_CACHE_DIR"
    git config --global --add safe.directory "$GALLERY_CACHE_DIR" 2>/dev/null || true
    timeout 30 git fetch origin 2>/dev/null || true
    timeout 20 git reset --hard origin/main 2>/dev/null || timeout 20 git reset --hard origin/master 2>/dev/null || warn "Gallery cache update failed"
    cd "$LIVOS_DIR"
    ok "Gallery cache updated"
else
    info "No gallery cache found - will be created on first App Store access"
fi

# ── Step 7: Fix permissions ───────────────────────────────
step "Fixing permissions"

# Make app-script executable
chmod +x "$LIVOS_DIR/packages/livinityd/source/modules/apps/legacy-compat/app-script" 2>/dev/null || true

# Set ownership (livos user for most, root runs the service)
chown -R root:root "$LIVOS_DIR" 2>/dev/null || true
chown -R root:root "$LIV_DIR" 2>/dev/null || true

ok "Permissions fixed"

# ── Step 7.2: Phase 201-06 — liv-ai-app Next.js subapp build ────────────────
# The Liv AI subapp lives at livos/packages/liv-ai-app and is served by
# livos-app-liv-ai.service on 127.0.0.1:3010 (Caddy `handle /liv-ai-app/*`
# routes to it). Rebuild on every deploy so updates pick up changes — the
# pnpm workspace at LIVOS_DIR already covers this filter.
step "Phase 201-06: Building Liv AI Next.js subapp (liv-ai-app)"

if [[ -d "$LIVOS_DIR/packages/liv-ai-app" ]]; then
    if (cd "$LIVOS_DIR" && pnpm --filter liv-ai-app install --frozen-lockfile 2>&1) ; then
        ok "liv-ai-app dependencies installed"
    else
        warn "liv-ai-app pnpm install (frozen) failed — retrying without --frozen-lockfile"
        (cd "$LIVOS_DIR" && pnpm --filter liv-ai-app install 2>&1) || warn "liv-ai-app install still failing"
    fi

    if (cd "$LIVOS_DIR" && pnpm --filter liv-ai-app build 2>&1) ; then
        ok "liv-ai-app build complete"
    else
        warn "liv-ai-app build failed — check journalctl -u livos-app-liv-ai -n 30 after deploy"
    fi
else
    info "liv-ai-app package not present in this checkout — skipping (legacy deploys may not ship it)"
fi

# ── Step 7.3: Phase 203-03 — liv-claw-os plugin build ──────────────────────
# The openclaw gateway loads @livos/liv-claw-os's claw-plugin in-process via
# `node start.js --plugin <bundle>` (see liv-claw-gateway/start.js). The
# bundle is dist/index.js inside packages/claw-plugin, produced by esbuild.
# `pnpm --filter @livos/liv-claw-os build` runs the recursive build which
# covers claw-plugin (esbuild → dist/index.js, ~170kb) AND claw-client (Next.js
# static export → out/) per the upstream prepack/build wiring.
# Guarded so legacy deploys without Phase 203 source don't fail.
step "Phase 203-03: liv-claw-os build (RETIRED 2026-06-09)"
# RETIRED — OpenClawOS was replaced by AionUi in Phase 231; the liv-claw-os
# fork + liv-claw-gateway are dead. The Next.js `claw-client` build started
# failing tsc on every deploy (ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL), spamming the
# log for a component nothing serves. We no longer build it. The packages remain
# on disk (harmless, unbuilt) pending a full repo-level removal phase; livinityd's
# separate modules/openclawos backend (config/handshake/dock-seed) is UNAFFECTED.
info "liv-claw-os build skipped (retired — replaced by AionUi in Phase 231)"

# ── Step 7.3b: Phase 203 Hot-fix-C — bundle claw-client static export into claw-plugin/static ──
# § G.2 Fix-C root cause: claw-plugin's `registerHttpRoute` handler streams
# files from path.resolve(__dirname, "..", "static") — i.e. the PACKAGE-ROOT
# `static/` dir of @openuidev/openclaw-os-plugin. That directory is populated
# ONLY by the `bundle-ui` npm script in claw-plugin/package.json:
#   cd ../claw-client && pnpm install --frozen-lockfile=false && pnpm build \
#     && shx rm -rf ../claw-plugin/static && shx cp -r out ../claw-plugin/static
# which is wired into `prepack` (NOT `build`). Step 7.3 above only runs
# `pnpm -r build` recursively, so claw-client emits `out/` but it never gets
# copied into claw-plugin/static. Result: gateway log says "workspace UI
# mounted at /plugins/openclawos/" but every request 404s because the static
# root is empty (= absent on disk).
#
# Path 3 from 203-HOTFIX-205-PLUGIN-LOAD.md: invoke `bundle-ui` explicitly
# from update.sh — keeps repo lean, no source/CI churn, idempotent (the
# nested `pnpm install --frozen-lockfile=false` and `next build` are both
# safe re-runs over an already-installed/built workspace).
#
# Run AFTER 7.3 so deps are guaranteed installed; before plugin restart so
# liv-claw-gateway re-mount sees the populated dir on next boot.
if [[ -d "$LIVOS_DIR/packages/liv-claw-os/packages/claw-plugin" ]]; then
    info "Phase 203 hot-fix C: bundling claw-client static export into claw-plugin/static/..."
    if (cd "$LIVOS_DIR" && pnpm --filter @openuidev/openclaw-os-plugin bundle-ui 2>&1 | tail -10) ; then
        if [[ -f "$LIVOS_DIR/packages/liv-claw-os/packages/claw-plugin/static/index.html" ]]; then
            ok "claw-plugin/static/ populated (index.html present — /plugins/openclawos will serve Liv AI UI)"
        else
            warn "bundle-ui exited 0 but static/index.html missing — /plugins/openclawos may still 404"
        fi
    else
        warn "bundle-ui failed — /plugins/openclawos will 404; check pnpm --filter @openuidev/openclaw-os-plugin bundle-ui output above"
    fi
fi

# ── Step 7.4: Phase 203-03 — liv-claw-gateway dep resolution ───────────────
# Wrapper package depends on openclaw (npm) + @livos/liv-claw-os (workspace).
# pnpm install at workspace root (Step 4 above) already resolves these, but
# we re-run a filtered install here to guarantee node_modules exists at
# /opt/livos/packages/liv-claw-gateway/ even if the root install used a
# partial filter or skipped a workspace member.
if [[ -d "$LIVOS_DIR/packages/liv-claw-gateway" ]]; then
    if (cd "$LIVOS_DIR" && pnpm --filter @livos/liv-claw-gateway install 2>&1) ; then
        ok "liv-claw-gateway dependencies installed"
    else
        warn "liv-claw-gateway install failed (frozen) — retrying without --frozen-lockfile"
        (cd "$LIVOS_DIR" && pnpm --filter @livos/liv-claw-gateway install --no-frozen-lockfile 2>&1) || warn "liv-claw-gateway install still failing"
    fi
fi

# ── Step 7.5: Mastra storage schema drift fixes ─────────────────────────────
# P199 UAT discovered Mastra v1.36 expects camelCase columns the old @mastra/pg
# init never created (mastra_threads.resourceId, mastra_messages.type). Both
# ALTERs are idempotent (IF NOT EXISTS) so safe to run on every deploy.
step "Applying Mastra storage schema drift fixes"

if command -v sudo >/dev/null && sudo -u postgres psql -d livos -c '\q' >/dev/null 2>&1; then
    sudo -u postgres psql -d livos <<'SQL' >/dev/null 2>&1 || true
ALTER TABLE IF EXISTS mastra_threads ADD COLUMN IF NOT EXISTS "resourceId" text;
UPDATE mastra_threads SET "resourceId" = resource_id
  WHERE "resourceId" IS NULL AND resource_id IS NOT NULL;
ALTER TABLE IF EXISTS mastra_messages ADD COLUMN IF NOT EXISTS "type" text;
ALTER TABLE IF EXISTS mastra_messages ADD COLUMN IF NOT EXISTS "createdAtZ" timestamp with time zone DEFAULT now();
SQL
    ok "Mastra schema drift fixes applied"
else
    info "Postgres not accessible — skipping Mastra schema fixes (run manually if upgrading)"
fi

# ── Step 7.7: Phase 201-06 — install livos-app-liv-ai.service if missing ───
# update.sh runs on pre-existing deploys that may not have the new unit yet.
# We copy the file ourselves (avoiding a dependency on install.sh having been
# re-run) so the restart step below has a unit to manage.
step "Phase 201-06: install livos-app-liv-ai.service unit (if missing)"

# ── Phase 278 — render the AI unit per box (de-hardcode User=bruce) ───────────
# The repo unit (scripts/install/systemd/livos-app-liv-ai.service) hardcodes
# User=bruce/Group=bruce. update.sh USED to `install` it VERBATIM — which on a
# non-bruce box pinned the Next.js subapp to user bruce → systemd 217/USER →
# /liv-ai-app/* 502. Worse: the byte-vs-source cmp guard compared repo-source
# (User=bruce) vs installed (User=jack) → mismatch → RE-CLOBBERED to User=bruce
# on EVERY update. This helper mirrors _render_liv_assistant_unit EXACTLY: derive
# the desktop identity, sed the unit, and cmp the TEMPLATED content vs installed
# (so a correct box is `unchanged` — no re-clobber, no daemon-reload churn).
#
# Sets globals for the caller: _LAI_USER, _LAI_HOME, _LAI_UNIT_STATUS
# (changed|unchanged|error). Always returns 0 (best-effort; source-missing case
# is reflected as _LAI_UNIT_STATUS=error).
_render_liv_ai_unit() {
    local src="$1" dst="$2" tmp
    _LAI_UNIT_STATUS=error; _LAI_USER=""; _LAI_HOME=""   # set -u safety on early-return
    [[ -f "$src" ]] || return 0
    # Phase 277.1 — single source of truth for the desktop identity (no literal bruce).
    _set_desktop_identity
    _LAI_USER="$_DESKTOP_USER"; _LAI_HOME="$_DESKTOP_HOME"
    tmp="${dst}.tmp.$$"
    sed -E "s/^(User=)bruce$/\1${_LAI_USER}/; s/^(Group=)bruce$/\1${_LAI_USER}/; s#/home/bruce#${_LAI_HOME}#g" \
        "$src" > "$tmp"
    if [[ ! -f "$dst" ]] || ! cmp -s "$tmp" "$dst"; then
        install -m 0644 -o root -g root "$tmp" "$dst"
        systemctl daemon-reload 2>/dev/null || true
        _LAI_UNIT_STATUS=changed
    else
        _LAI_UNIT_STATUS=unchanged
    fi
    rm -f "$tmp"
    return 0
}

_LIV_AI_UNIT_SRC="$LIVOS_DIR/../scripts/install/systemd/livos-app-liv-ai.service"
# Fallback to TEMP_DIR location (fresh clone) if the on-disk path isn't there.
if [[ ! -f "$_LIV_AI_UNIT_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _LIV_AI_UNIT_SRC="$TEMP_DIR/scripts/install/systemd/livos-app-liv-ai.service"
fi

if [[ -f "$_LIV_AI_UNIT_SRC" ]]; then
    _LIV_AI_UNIT_DST="/etc/systemd/system/livos-app-liv-ai.service"
    # Phase 278: render+cmp through the helper (templated User=desktop), not a
    # verbatim install with a source-vs-installed cmp (that re-clobbered to bruce).
    _render_liv_ai_unit "$_LIV_AI_UNIT_SRC" "$_LIV_AI_UNIT_DST"
    if [[ "$_LAI_UNIT_STATUS" == changed ]]; then
        systemctl enable livos-app-liv-ai.service 2>/dev/null || true
        ok "livos-app-liv-ai.service installed (User=${_LAI_USER}) at $_LIV_AI_UNIT_DST"
    else
        ok "livos-app-liv-ai.service already current (User=${_LAI_USER})"
    fi
else
    info "livos-app-liv-ai.service source not found — skipping install (Caddy /liv-ai-app/* will 502 until unit lands)"
fi

# ── Step 7.7b: cloudflared auto-recovery drop-in (reboot/power-loss resilience) ─
# The CF Tunnel is livinity's public ingress; it MUST come back on its own after
# a reboot, power loss, or a transient boot-time DNS/network race. cloudflared's
# stock unit has Restart=on-failure, but systemd's default StartLimit can give up
# after repeated quick failures. This idempotent drop-in (mirrors mode-tunnel.sh
# _ensure_cloudflared_resilience_dropin) makes it restart on ANY exit and retry
# FOREVER. Applied on every update so EXISTING boxes get it too — mode-tunnel.sh
# only writes it at fresh-install time. No-op when cloudflared isn't installed
# (local / non-tunnel mode).
if [[ -f /etc/systemd/system/cloudflared.service ]]; then
    _cfd_dropin_dir="/etc/systemd/system/cloudflared.service.d"
    _cfd_dropin="${_cfd_dropin_dir}/livos-resilience.conf"
    install -d -m 0755 "$_cfd_dropin_dir" 2>/dev/null || true
    _cfd_want="$(cat <<'CONF'
# Managed by LivOS (update.sh) — auto-recover the CF Tunnel after reboot /
# power loss / transient boot-time DNS or network races. Do not edit by hand.
[Unit]
StartLimitIntervalSec=0

[Service]
Restart=always
RestartSec=5s
CONF
)"
    if [[ ! -f "$_cfd_dropin" ]] || [[ "$(cat "$_cfd_dropin" 2>/dev/null)" != "$_cfd_want" ]]; then
        printf '%s\n' "$_cfd_want" > "$_cfd_dropin" 2>/dev/null || true
        chmod 0644 "$_cfd_dropin" 2>/dev/null || true
        systemctl daemon-reload 2>/dev/null || true
        ok "cloudflared resilience drop-in written (auto-recovers on reboot/power-loss)"
    else
        ok "cloudflared resilience drop-in already current"
    fi
fi

# ── Step 7.8: Phase 203-03 — install liv-claw-gateway.service unit (if missing) ──
# Mirror of Step 7.7's idempotent pattern for the new gateway unit. update.sh
# runs on pre-existing deploys that may not have re-run install.sh; copy the
# file ourselves so the restart step below has a unit to manage. cmp -s guard
# keeps re-runs cheap (no daemon-reload churn on byte-identical writes).
step "Phase 203-03: install liv-claw-gateway.service unit (if missing)"

_LIV_CLAW_UNIT_SRC="$LIVOS_DIR/../scripts/install/systemd/liv-claw-gateway.service"
# Fallback to TEMP_DIR location (fresh clone) if the on-disk path isn't there.
if [[ ! -f "$_LIV_CLAW_UNIT_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _LIV_CLAW_UNIT_SRC="$TEMP_DIR/scripts/install/systemd/liv-claw-gateway.service"
fi

if [[ -f "$_LIV_CLAW_UNIT_SRC" ]]; then
    _LIV_CLAW_UNIT_DST="/etc/systemd/system/liv-claw-gateway.service"
    if [[ ! -f "$_LIV_CLAW_UNIT_DST" ]] || ! cmp -s "$_LIV_CLAW_UNIT_SRC" "$_LIV_CLAW_UNIT_DST"; then
        install -m 0644 -o root -g root "$_LIV_CLAW_UNIT_SRC" "$_LIV_CLAW_UNIT_DST"
        systemctl daemon-reload
        systemctl enable liv-claw-gateway.service 2>/dev/null || true
        ok "liv-claw-gateway.service installed at $_LIV_CLAW_UNIT_DST"
    else
        ok "liv-claw-gateway.service already byte-identical"
    fi
    # Ensure the gateway's state dir exists and is desktop-user-writable
    _set_desktop_identity   # Phase 277.1 — self-derive (don't depend on a distant earlier call)
    mkdir -p /opt/livos/data/openclaw 2>/dev/null || true
    if id "$_DESKTOP_USER" >/dev/null 2>&1; then
        chown -R "$_DESKTOP_USER":"$_DESKTOP_USER" /opt/livos/data/openclaw 2>/dev/null || true
    fi

    # ── Phase 203 Hot-fix F 2026-05-24 — openclaw allowedOrigins patch ──
    # Operator UAT (post Hot-fix D/E): browser console shows
    #   "connect RPC failed — Error: origin not allowed (open the Control UI
    #    from the gateway host or allow it in gateway.controlUi.allowedOrigins)"
    # The openclaw plugin's connect RPC rejects WS handshakes whose Origin
    # header is not in `gateway.controlUi.allowedOrigins`. bruce.livinity.io
    # is not in the default list — defaults assume operator opens the UI
    # from localhost. Production access from the LivOS frontend at
    # bruce.livinity.io (Caddy → relay → Mini PC) needs an explicit entry.
    #
    # openclaw resolves its config path from $OPENCLAW_STATE_DIR/openclaw.json
    # (paths-r6w2eKyy.js). The gateway runs with OPENCLAW_STATE_DIR=
    # /opt/livos/data/openclaw so the file is at:
    #   /opt/livos/data/openclaw/openclaw.json
    #
    # Strategy: idempotent jq patch. Adds three origins (HTTPS prod, HTTP
    # fallback, root domain) and dedupes. Skips silently if jq is missing
    # or the file doesn't exist yet (first-boot — operator can re-run
    # update.sh after the gateway writes its initial config).
    _OPENCLAW_CFG="/opt/livos/data/openclaw/openclaw.json"
    if command -v jq >/dev/null 2>&1; then
        if [[ -f "$_OPENCLAW_CFG" ]]; then

            # ── Hot-fix F2 2026-05-24 — resolve operator domain dynamically ──
            # Hot-fix F part 3 hardcoded `bruce.livinity.io`. That broke any
            # other operator (different VPS, different domain) before they
            # could even open Liv AI. livinityd persists the active operator
            # domain to Redis key `livos:domain:config` at install/activation
            # time. Read it; fall back to bruce.livinity.io only if Redis is
            # unreachable AND the file's existing list is empty.
            _OPERATOR_DOMAIN=""
            if command -v redis-cli >/dev/null 2>&1; then
                _REDIS_URL=$(grep -E "^REDIS_URL=" /opt/livos/.env 2>/dev/null | cut -d= -f2-)
                if [[ -n "$_REDIS_URL" ]]; then
                    _REDIS_PW=$(echo "$_REDIS_URL" | sed -E 's|redis://[^:]*:([^@]+)@.*|\1|')
                    _OPERATOR_DOMAIN=$(redis-cli -a "$_REDIS_PW" --no-auth-warning GET livos:domain:config 2>/dev/null | jq -r '.domain // empty' 2>/dev/null)
                fi
            fi
            # Phase 277.1 — no hardcoded bruce.livinity.io fallback. If the domain is
            # unresolvable, the jq below omits the domain-specific origins (the bare-
            # scheme entries are skipped via the $dom length guard).
            info "openclaw config: operator domain resolved = ${_OPERATOR_DOMAIN:-<none>}"

            # ── Hot-fix F2 2026-05-24 — ensure gateway.auth.token exists ──
            # The custom livinityd Ed25519 mint flow (Plan 203-05) is incompat
            # with openclaw upstream's identity-keypair device-token system
            # (every WS connect logged `device_token_mismatch` in operator UAT
            # 2026-05-24). openclaw DOES support a documented `gateway.auth.
            # token` master-token mechanism that IS verified upstream.
            # Strategy: generate a 64-char hex token on first run, persist into
            # openclaw.json, then have livinityd-handshake serve it (Hot-fix
            # F2 part 1).  Idempotent: if the key already exists, preserve the
            # operator's existing token (do NOT rotate on every update.sh — a
            # rotation would invalidate every browser tab's cached creds).
            _EXISTING_TOKEN=$(jq -r '.gateway.auth.token // empty' "$_OPENCLAW_CFG" 2>/dev/null)
            if [[ -z "$_EXISTING_TOKEN" ]]; then
                _NEW_TOKEN=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32)
                if [[ -z "$_NEW_TOKEN" ]]; then
                    warn "openclaw master-token generation failed — neither openssl nor xxd available. claw-client connects will continue to fail device_token_mismatch."
                else
                    info "openclaw master token will be generated (first-time bootstrap)"
                fi
            else
                info "openclaw master token already present (preserving operator's existing token)"
                _NEW_TOKEN=""  # don't overwrite
            fi

            _TMP_CFG=$(mktemp)
            # Single jq invocation does THREE things idempotently:
            #   1. Ensure gateway.controlUi.allowedOrigins includes operator domain (https, http, wss)
            #   2. Ensure gateway.auth.token exists (set if missing; preserve if present)
            #   3. Ensure gateway.auth.mode = "token" (openclaw upstream requirement)
            if jq --arg dom "$_OPERATOR_DOMAIN" --arg newtok "$_NEW_TOKEN" '
                   .gateway //= {}
                   | .gateway.controlUi //= {}
                   | .gateway.controlUi.allowedOrigins = (
                       ((.gateway.controlUi.allowedOrigins // []) +
                        (if ($dom | length) > 0
                          then ["https://" + $dom, "http://" + $dom, "wss://" + $dom]
                          else [] end) +
                        ["https://livinity.io",
                         "http://localhost:18789",
                         "http://127.0.0.1:18789"])
                       | unique
                     )
                   | .gateway.auth //= {}
                   | (if (.gateway.auth.token // "" | length) == 0
                       then .gateway.auth.token = $newtok
                       else . end)
                   | .gateway.auth.mode = "token"
                 ' "$_OPENCLAW_CFG" > "$_TMP_CFG" 2>/dev/null; then
                if ! cmp -s "$_TMP_CFG" "$_OPENCLAW_CFG"; then
                    # Take a backup before overwriting — Hot-fix F2 changes are
                    # significant. openclaw already keeps .bak rotations but a
                    # local one helps with rapid rollback.
                    cp "$_OPENCLAW_CFG" "${_OPENCLAW_CFG}.pre-hotfix-f2.bak" 2>/dev/null || true
                    mv "$_TMP_CFG" "$_OPENCLAW_CFG"
                    chmod 600 "$_OPENCLAW_CFG" 2>/dev/null || true
                    if id "$_DESKTOP_USER" >/dev/null 2>&1; then
                        chown "$_DESKTOP_USER":"$_DESKTOP_USER" "$_OPENCLAW_CFG" 2>/dev/null || true
                    fi
                    ok "openclaw config patched (allowedOrigins:$_OPERATOR_DOMAIN, gateway.auth.token ensured)"
                else
                    ok "openclaw config already converged (allowedOrigins + gateway.auth.token)"
                    rm -f "$_TMP_CFG"
                fi
            else
                warn "jq failed to patch $_OPENCLAW_CFG — connect RPC will still fail"
                rm -f "$_TMP_CFG"
            fi
        else
            info "$_OPENCLAW_CFG missing — gateway hasn't written initial config yet. Re-run update.sh after first liv-claw-gateway boot."
        fi
    else
        warn "jq not installed — skipping openclaw allowedOrigins/master-token patch (install via: apt-get install -y jq)"
    fi
else
    info "liv-claw-gateway.service source not found — skipping install (Caddy /liv-ai-app/* will route to legacy :3010 unit until landed)"
fi

# ── Phase 277 — shared desktop-user-aware liv-assistant unit renderer ──────────
# TWO blocks below touch /etc/systemd/system/liv-assistant.service: the Phase 225
# install (Step 7.9) and the Phase 253 GC-E sync (Step 8). The repo unit hardcodes
# User=bruce/Group=bruce + /home/bruce; on a non-bruce box (e.g. `everything`) the
# unit MUST be adapted to the real desktop user or aioncore's logging-init fails
# (BOOTSTRAP_LOGGING_INIT_FAILED logDir=/opt/liv-assistant/data/logs) → liv-assistant
# crash-loops → /liv (:3020) 502. Phase 225 did this sed; the GC-E block historically
# `install`ed the repo unit VERBATIM (User=bruce) and CLOBBERED the Phase 225 fix on
# EVERY update (User=bruce won → /liv 502 → operator hand-fixed each time). Factor the
# derive+sed+cmp+install into ONE helper both blocks call so they can never diverge.
#
# Sets globals for the caller: _LA_USER, _LA_HOME, _LA_UNIT_STATUS (changed|unchanged|
# error). daemon-reloads + chowns the data dir on change. Always returns 0 (best-effort;
# the source-missing case is reflected as _LA_UNIT_STATUS=error). Same desktop-user
# substitution as the v44.19/v44.25 bruce-hardcoding fixes — the repo unit stays
# User=bruce and the on-box render adapts it per box.
_render_liv_assistant_unit() {
    local src="$1" dst="$2" tmp
    _LA_UNIT_STATUS=error; _LA_USER=""; _LA_HOME=""   # set -u safety on the early-return path
    [[ -f "$src" ]] || return 0
    # Phase 277.1 — single source of truth for the desktop identity (no literal bruce).
    _set_desktop_identity
    _LA_USER="$_DESKTOP_USER"; _LA_HOME="$_DESKTOP_HOME"
    tmp="${dst}.tmp.$$"
    sed -E "s/^(User=)bruce$/\1${_LA_USER}/; s/^(Group=)bruce$/\1${_LA_USER}/; s#/home/bruce#${_LA_HOME}#g" \
        "$src" > "$tmp"
    if [[ ! -f "$dst" ]] || ! cmp -s "$tmp" "$dst"; then
        install -m 0644 -o root -g root "$tmp" "$dst"
        systemctl daemon-reload 2>/dev/null || true
        # The unit just (re)gained the desktop User=; make the data dir match so
        # aioncore's logging init can't fail (the live BOOTSTRAP_LOGGING_INIT_FAILED).
        [[ -d /opt/liv-assistant/data ]] && chown -R "$_LA_USER":"$_LA_USER" /opt/liv-assistant/data 2>/dev/null || true
        _LA_UNIT_STATUS=changed
    else
        _LA_UNIT_STATUS=unchanged
    fi
    rm -f "$tmp"
    return 0
}

# ── Step 7.9: Phase 225 — install liv-assistant.service unit (if missing) ──────
# Mirror of Step 7.7/7.8's idempotent pattern. update.sh runs on pre-existing
# deploys that may not have re-run scripts/install-liv-assistant.sh's sibling
# install of the unit file; copy the file ourselves so the restart step below
# has a unit to manage. cmp -s guard keeps re-runs cheap (no daemon-reload churn
# on byte-identical writes). Phase 223-02 shipped the unit at repo-root
# `systemd/liv-assistant.service` — try that path first.
step "Phase 225: install liv-assistant.service unit (if missing)"

_LIV_ASSISTANT_UNIT_SRC="$LIVOS_DIR/systemd/liv-assistant.service"
# Fallback to TEMP_DIR repo-root systemd dir (fresh clone)
if [[ ! -f "$_LIV_ASSISTANT_UNIT_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _LIV_ASSISTANT_UNIT_SRC="$TEMP_DIR/systemd/liv-assistant.service"
fi
# Secondary fallback: scripts/install/systemd/ (parity with Step 7.7/7.8 layout)
if [[ ! -f "$_LIV_ASSISTANT_UNIT_SRC" ]]; then
    _LIV_ASSISTANT_UNIT_SRC="$LIVOS_DIR/scripts/install/systemd/liv-assistant.service"
    if [[ ! -f "$_LIV_ASSISTANT_UNIT_SRC" && -d "${TEMP_DIR:-}" ]]; then
        _LIV_ASSISTANT_UNIT_SRC="$TEMP_DIR/scripts/install/systemd/liv-assistant.service"
    fi
fi
# Tertiary fallback: scripts/systemd/ (alternate layout)
if [[ ! -f "$_LIV_ASSISTANT_UNIT_SRC" ]]; then
    _LIV_ASSISTANT_UNIT_SRC="$LIVOS_DIR/scripts/systemd/liv-assistant.service"
    if [[ ! -f "$_LIV_ASSISTANT_UNIT_SRC" && -d "${TEMP_DIR:-}" ]]; then
        _LIV_ASSISTANT_UNIT_SRC="$TEMP_DIR/scripts/systemd/liv-assistant.service"
    fi
fi

if [[ -f "$_LIV_ASSISTANT_UNIT_SRC" ]]; then
    _LIV_ASSISTANT_UNIT_DST="/etc/systemd/system/liv-assistant.service"
    # WS (2026-06-15): the repo unit hardcodes User=bruce/Group=bruce + /home/bruce
    # (PATH/HOME/ReadWritePaths). update.sh USED to `install` it VERBATIM — which on
    # a non-bruce box (e.g. "murphy") pinned AionUi to user bruce / HOME=/home/bruce,
    # so AionUi's startup $PATH scan never saw the operator's own ~/.local/bin claude
    # → only the bundled Aion CLI showed in the picker. Phase 277: the derive+sed+cmp+
    # install now lives in the shared _render_liv_assistant_unit helper (used here AND
    # by the GC-E sync below, so the two can never diverge again).
    _render_liv_assistant_unit "$_LIV_ASSISTANT_UNIT_SRC" "$_LIV_ASSISTANT_UNIT_DST"
    if [[ "$_LA_UNIT_STATUS" == changed ]]; then
        systemctl enable liv-assistant.service 2>/dev/null || true
        # Restart so the corrected User=/PATH takes effect AND AionUi re-scans $PATH
        # (it only discovers CLIs at startup) — this is what makes a newly-installed
        # claude appear in the picker. Phase 277 (Bug 1): bound the wait (timeout -k
        # 10 75) so a wedged aioncore boot can't stall the Update for minutes.
        timeout -k 10 75 systemctl restart liv-assistant.service 2>/dev/null || true
        ok "liv-assistant.service installed (User=${_LA_USER}, HOME=${_LA_HOME}) at $_LIV_ASSISTANT_UNIT_DST"
    else
        ok "liv-assistant.service already current (User=${_LA_USER})"
    fi
else
    info "liv-assistant.service unit source not found — skipping install (the unit may already be installed from a prior Phase 223-05 deploy)"
fi

# ── Step 7.10: Phase 289 (WS-D) — native-install provisioning (sudoers + apt-repo helper) ──
# Native apps install via host `sudo -n /usr/bin/apt-get install` (native-installer.ts:432),
# which needs the /etc/sudoers.d/livos-native NOPASSWD grant. The fresh-install path
# (deploy-livinityd.sh:_dld_template_app_units) installs it, but the day-2 update.sh path
# NEVER did → on updated boxes the grant is absent → `sudo: a password is required` →
# `sudo_denied` → native install refused → no desktop tile. apt-repo apps (Brave/Signal/
# Spotify/Firefox) ALSO need /usr/local/lib/livos/livos-add-apt-repo.sh, which is copied by
# NO path today. This step installs both, idempotently, every Update. Fully fail-tolerant:
# a missing source or a chown error never aborts the Update.
step "Phase 289 (WS-D): native-install provisioning (sudoers.d/livos-native + apt-repo helper)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a) sudoers.d/livos-native — install + template the subject to the desktop user --------
_NATIVE_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-native"
if [[ ! -f "$_NATIVE_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _NATIVE_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-native"
fi
_NATIVE_SUDOERS_DST="/etc/sudoers.d/livos-native"
if [[ -f "$_NATIVE_SUDOERS_SRC" ]]; then
    _NATIVE_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        # Template the `bruce ALL=(root) NOPASSWD: …` subject AND the `=(bruce)` group spec
        # (the source uses `=(root)` for the run-as, so only the leading subject needs sed;
        # match both forms defensively, exactly like deploy-livinityd.sh:2743).
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_NATIVE_SUDOERS_SRC" > "$_NATIVE_SUDOERS_TMP"
    else
        cp -f "$_NATIVE_SUDOERS_SRC" "$_NATIVE_SUDOERS_TMP"
    fi
    if [[ ! -f "$_NATIVE_SUDOERS_DST" ]] || ! cmp -s "$_NATIVE_SUDOERS_TMP" "$_NATIVE_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_NATIVE_SUDOERS_TMP" "$_NATIVE_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide. Validate the
        # INSTALLED file; if visudo rejects it, REMOVE it (native apt installs stay denied —
        # the prior state — rather than risk a broken sudoers).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_NATIVE_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_NATIVE_SUDOERS_DST — removing (native apt installs stay denied until fixed)"
            rm -f "$_NATIVE_SUDOERS_DST"
        else
            ok "sudoers.d/livos-native installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-native already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_NATIVE_SUDOERS_TMP"
else
    info "sudoers.d/livos-native source not found — skipping (native apt installs unavailable)"
fi

# --- (b) livos-add-apt-repo.sh — the apt-repo privileged helper (missing from EVERY path) ---
_APT_REPO_SRC="$LIVOS_DIR/scripts/install/livos-add-apt-repo.sh"
if [[ ! -f "$_APT_REPO_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _APT_REPO_SRC="$TEMP_DIR/scripts/install/livos-add-apt-repo.sh"
fi
_APT_REPO_DST="/usr/local/lib/livos/livos-add-apt-repo.sh"
if [[ -f "$_APT_REPO_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_APT_REPO_DST" ]] || ! cmp -s "$_APT_REPO_SRC" "$_APT_REPO_DST"; then
        install -m 0755 -o root -g root "$_APT_REPO_SRC" "$_APT_REPO_DST"
        ok "livos-add-apt-repo.sh installed at $_APT_REPO_DST"
    else
        info "livos-add-apt-repo.sh already current"
    fi
else
    info "livos-add-apt-repo.sh source not found — skipping (apt-repo apps unavailable)"
fi

# ── Step 7.10b: Phase 313 (SMART) — disk-health provisioning (sudoers.d/livos-smart + smartmontools) ──
# The livos-smart NOPASSWD grant + smartmontools must reach ALREADY-DEPLOYED
# boxes on Update, not just fresh installs. Mirrors the livos-native day-2 sync
# above VERBATIM (content-diff + visudo validate-or-remove), retargeted to
# livos-smart. Missing this is the "looks wired, silently no-ops" failure class
# (RESEARCH Pitfall 1 / PATTERNS Flag 1): a box that took Phase 313 would call
# `sudo -n smartctl ...`, get denied, and surface every drive as permission-denied
# forever. Fully fail-tolerant: a missing source or a visudo rejection never
# aborts the Update.
step "Phase 313 (SMART): disk-health provisioning (sudoers.d/livos-smart + smartmontools)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a0) livos-smartctl.sh wrapper (code-review HIGH-01) — install BEFORE the grant ---
# The livos-smart grant (a) is on this ONE root-owned binary; the wrapper validates
# the device id + mode enum and hardcodes the smartctl argv, so no caller flag can be
# appended (the old `/dev/*` glob hole). smart.ts invokes `sudo -n <wrapper> ...`, so
# the wrapper must exist on day-2 boxes too. Idempotent (content-diffed), fail-tolerant.
_SMART_WRAP_SRC="$LIVOS_DIR/scripts/install/livos-smartctl.sh"
if [[ ! -f "$_SMART_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _SMART_WRAP_SRC="$TEMP_DIR/scripts/install/livos-smartctl.sh"
fi
_SMART_WRAP_DST="/usr/local/lib/livos/livos-smartctl.sh"
if [[ -f "$_SMART_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_SMART_WRAP_DST" ]] || ! cmp -s "$_SMART_WRAP_SRC" "$_SMART_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_SMART_WRAP_SRC" "$_SMART_WRAP_DST"; then
            ok "livos-smartctl.sh installed at $_SMART_WRAP_DST"
        else
            warn "Failed to install livos-smartctl.sh (non-fatal — SMART reads unavailable until fixed)"
        fi
    else
        info "livos-smartctl.sh already current"
    fi
else
    info "livos-smartctl.sh source not found — skipping (SMART reads unavailable)"
fi

# --- (a) sudoers.d/livos-smart — install + template the subject to the desktop user ---
_SMART_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-smart"
if [[ ! -f "$_SMART_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _SMART_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-smart"
fi
_SMART_SUDOERS_DST="/etc/sudoers.d/livos-smart"
if [[ -f "$_SMART_SUDOERS_SRC" ]]; then
    _SMART_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_SMART_SUDOERS_SRC" > "$_SMART_SUDOERS_TMP"
    else
        cp -f "$_SMART_SUDOERS_SRC" "$_SMART_SUDOERS_TMP"
    fi
    if [[ ! -f "$_SMART_SUDOERS_DST" ]] || ! cmp -s "$_SMART_SUDOERS_TMP" "$_SMART_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_SMART_SUDOERS_TMP" "$_SMART_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it (SMART reads
        # stay denied — the prior state — rather than risk a broken sudoers).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_SMART_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_SMART_SUDOERS_DST — removing (SMART reads stay denied until fixed)"
            rm -f "$_SMART_SUDOERS_DST"
        else
            ok "sudoers.d/livos-smart installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-smart already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_SMART_SUDOERS_TMP"
else
    info "sudoers.d/livos-smart source not found — skipping (SMART reads unavailable)"
fi

# --- (b) smartmontools — gated idempotent apt install (skip the apt call on a provisioned box) ---
if command -v smartctl >/dev/null 2>&1; then
    info "update.sh: smartctl already present — skipping apt install"
elif [[ -x /usr/bin/apt-get ]] && command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq smartmontools 2>&1 | tail -3 \
        || warn "smartmontools install failed (non-fatal — SMART surfaces 'unavailable' until fixed)"
fi

# --- (c) Phase 330 (GPU-03): pciutils — day-2 presence-ensure so ALREADY-DEPLOYED
# boxes get `lspci` for bare-metal AMD/Intel GPU vendor detection (system/gpu.ts).
# Same idempotent apt idiom as (b) smartmontools; NOT NVIDIA-gated (lspci is what
# detects AMD/Intel in the first place). Non-fatal — vendor detect degrades to
# "none" until present. No new numbered step; folds into the existing baseline. ---
if command -v lspci >/dev/null 2>&1; then
    info "update.sh: lspci already present — skipping pciutils install"
elif [[ -x /usr/bin/apt-get ]] && command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq pciutils 2>&1 | tail -3 \
        || warn "pciutils install failed (non-fatal — bare-metal AMD/Intel GPU vendor detect degrades to 'none' until fixed)"
fi

# ── Step 7.10c: Phase 316 (GPU-01) — NVIDIA install provisioning (sudoers.d/livos-gpu + wrapper) ──
# The livos-gpu NOPASSWD grant + the root-owned install wrapper must reach
# ALREADY-DEPLOYED boxes on Update, not just fresh installs. Mirrors Step 7.10b
# (livos-smart) VERBATIM (content-diff + visudo validate-or-remove), retargeted to
# livos-gpu / livos-gpu-install.sh. Missing this is the "looks wired, silently
# no-ops" failure class: a box that took Phase 316 would call
# `sudo -n /usr/local/lib/livos/livos-gpu-install.sh <action>`, get denied, and the
# admin's guided NVIDIA install would fail forever. The container-toolkit apt work
# stays in the fresh-install path + the guided UI action (not re-run on every
# Update). Fully fail-tolerant: a missing source or a visudo rejection never aborts
# the Update.
step "Phase 316 (GPU-01): NVIDIA install provisioning (sudoers.d/livos-gpu + install wrapper)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a0) livos-gpu-install.sh wrapper — install BEFORE the grant ---
# The livos-gpu grant (a) is on this ONE root-owned binary; the wrapper validates a
# fixed action enum {detect|install-driver|install-toolkit} and hardcodes every
# apt/ubuntu-drivers/nvidia-ctk argv, so no caller flag can be appended. livinityd
# invokes `sudo -n <wrapper> <action>`, so the wrapper must exist on day-2 boxes too.
# Idempotent (content-diffed), fail-tolerant.
_GPU_WRAP_SRC="$LIVOS_DIR/scripts/install/livos-gpu-install.sh"
if [[ ! -f "$_GPU_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _GPU_WRAP_SRC="$TEMP_DIR/scripts/install/livos-gpu-install.sh"
fi
_GPU_WRAP_DST="/usr/local/lib/livos/livos-gpu-install.sh"
if [[ -f "$_GPU_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_GPU_WRAP_DST" ]] || ! cmp -s "$_GPU_WRAP_SRC" "$_GPU_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_GPU_WRAP_SRC" "$_GPU_WRAP_DST"; then
            ok "livos-gpu-install.sh installed at $_GPU_WRAP_DST"
        else
            warn "Failed to install livos-gpu-install.sh (non-fatal — guided GPU install unavailable until fixed)"
        fi
    else
        info "livos-gpu-install.sh already current"
    fi
else
    info "livos-gpu-install.sh source not found — skipping (guided GPU install unavailable)"
fi

# --- (a) sudoers.d/livos-gpu — install + template the subject to the desktop user ---
_GPU_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-gpu"
if [[ ! -f "$_GPU_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _GPU_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-gpu"
fi
_GPU_SUDOERS_DST="/etc/sudoers.d/livos-gpu"
if [[ -f "$_GPU_SUDOERS_SRC" ]]; then
    _GPU_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_GPU_SUDOERS_SRC" > "$_GPU_SUDOERS_TMP"
    else
        cp -f "$_GPU_SUDOERS_SRC" "$_GPU_SUDOERS_TMP"
    fi
    if [[ ! -f "$_GPU_SUDOERS_DST" ]] || ! cmp -s "$_GPU_SUDOERS_TMP" "$_GPU_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_GPU_SUDOERS_TMP" "$_GPU_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it (guided GPU
        # install stays denied — the prior state — rather than risk a broken sudoers).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_GPU_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_GPU_SUDOERS_DST — removing (guided GPU install stays denied until fixed)"
            rm -f "$_GPU_SUDOERS_DST"
        else
            ok "sudoers.d/livos-gpu installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-gpu already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_GPU_SUDOERS_TMP"
else
    info "sudoers.d/livos-gpu source not found — skipping (guided GPU install unavailable)"
fi

# ── Step 7.10d: Phase 326 (OS-01) — unattended-upgrades provisioning (sudoers.d/livos-os-patch + wrapper) ──
# The livos-os-patch NOPASSWD grant + the root-owned unattended-upgrades wrapper must
# reach ALREADY-DEPLOYED boxes on Update, not just fresh installs. Mirrors Step 7.10c
# (livos-gpu) VERBATIM (content-diff + visudo validate-or-remove), retargeted to
# livos-os-patch / livos-os-patch.sh. Missing this is the "looks wired, silently
# no-ops" failure class: a box that took Phase 326 would call
# `sudo -n /usr/local/lib/livos/livos-os-patch.sh <action>`, get denied, and the
# admin's unattended-upgrades toggle would fail forever. Fully fail-tolerant: a missing
# source or a visudo rejection never aborts the Update.
step "Phase 326 (OS-01): unattended-upgrades provisioning (sudoers.d/livos-os-patch + install wrapper)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a0) livos-os-patch.sh wrapper — install BEFORE the grant ---
# The livos-os-patch grant (a) is on this ONE root-owned binary; the wrapper validates a
# fixed action enum {status|enable|disable|set-options|dry-run|run-now|report}, regex-
# validates its set-options args, and hardcodes every apt argv + /etc/apt config body,
# so no caller flag can be appended. livinityd invokes `sudo -n <wrapper> <action>`, so
# the wrapper must exist on day-2 boxes too. Idempotent (content-diffed), fail-tolerant.
_OSPATCH_WRAP_SRC="$LIVOS_DIR/scripts/install/livos-os-patch.sh"
if [[ ! -f "$_OSPATCH_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _OSPATCH_WRAP_SRC="$TEMP_DIR/scripts/install/livos-os-patch.sh"
fi
_OSPATCH_WRAP_DST="/usr/local/lib/livos/livos-os-patch.sh"
if [[ -f "$_OSPATCH_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_OSPATCH_WRAP_DST" ]] || ! cmp -s "$_OSPATCH_WRAP_SRC" "$_OSPATCH_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_OSPATCH_WRAP_SRC" "$_OSPATCH_WRAP_DST"; then
            ok "livos-os-patch.sh installed at $_OSPATCH_WRAP_DST"
        else
            warn "Failed to install livos-os-patch.sh (non-fatal — unattended-upgrades control unavailable until fixed)"
        fi
    else
        info "livos-os-patch.sh already current"
    fi
else
    info "livos-os-patch.sh source not found — skipping (unattended-upgrades control unavailable)"
fi

# --- (a) sudoers.d/livos-os-patch — install + template the subject to the desktop user ---
_OSPATCH_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-os-patch"
if [[ ! -f "$_OSPATCH_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _OSPATCH_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-os-patch"
fi
_OSPATCH_SUDOERS_DST="/etc/sudoers.d/livos-os-patch"
if [[ -f "$_OSPATCH_SUDOERS_SRC" ]]; then
    _OSPATCH_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_OSPATCH_SUDOERS_SRC" > "$_OSPATCH_SUDOERS_TMP"
    else
        cp -f "$_OSPATCH_SUDOERS_SRC" "$_OSPATCH_SUDOERS_TMP"
    fi
    if [[ ! -f "$_OSPATCH_SUDOERS_DST" ]] || ! cmp -s "$_OSPATCH_SUDOERS_TMP" "$_OSPATCH_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_OSPATCH_SUDOERS_TMP" "$_OSPATCH_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it (unattended-
        # upgrades control stays denied — the prior state — rather than risk broken sudo).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_OSPATCH_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_OSPATCH_SUDOERS_DST — removing (unattended-upgrades control stays denied until fixed)"
            rm -f "$_OSPATCH_SUDOERS_DST"
        else
            ok "sudoers.d/livos-os-patch installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-os-patch already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_OSPATCH_SUDOERS_TMP"
else
    info "sudoers.d/livos-os-patch source not found — skipping (unattended-upgrades control unavailable)"
fi

# ── Step 7.10e: Phase 326 (HW-01) — NUT/UPS provisioning (sudoers.d/livos-ups + wrappers) ──
# The livos-ups NOPASSWD grant + the root-owned NUT wrapper + the root SHUTDOWNCMD
# script must reach ALREADY-DEPLOYED boxes on Update, not just fresh installs. Mirrors
# Step 7.10d (livos-os-patch) VERBATIM (content-diff + visudo validate-or-remove),
# retargeted to livos-ups. TWO scripts are installed (both root-owned 0755): the wrapper
# livinityd calls via `sudo -n <wrapper> <action>`, and the root SHUTDOWNCMD script
# upsmon runs AS ROOT directly (no grant — only deployment). Missing this is the "looks
# wired, silently no-ops" failure class. Fully fail-tolerant: a missing source or a
# visudo rejection never aborts the Update.
step "Phase 326 (HW-01): NUT/UPS provisioning (sudoers.d/livos-ups + install wrappers)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a0) livos-ups.sh wrapper — install BEFORE the grant ---
# The livos-ups grant (a) is on this ONE root-owned binary; the wrapper validates a
# fixed action enum {detect|install|configure|status|remove} and hardcodes every
# apt/systemctl/nut argv + /etc/nut body, so no caller flag can be appended. livinityd
# invokes `sudo -n <wrapper> <action>`, so the wrapper must exist on day-2 boxes too.
_UPS_WRAP_SRC="$LIVOS_DIR/scripts/install/livos-ups.sh"
if [[ ! -f "$_UPS_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _UPS_WRAP_SRC="$TEMP_DIR/scripts/install/livos-ups.sh"
fi
_UPS_WRAP_DST="/usr/local/lib/livos/livos-ups.sh"
if [[ -f "$_UPS_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_UPS_WRAP_DST" ]] || ! cmp -s "$_UPS_WRAP_SRC" "$_UPS_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_UPS_WRAP_SRC" "$_UPS_WRAP_DST"; then
            ok "livos-ups.sh installed at $_UPS_WRAP_DST"
        else
            warn "Failed to install livos-ups.sh (non-fatal — UPS control unavailable until fixed)"
        fi
    else
        info "livos-ups.sh already current"
    fi
else
    info "livos-ups.sh source not found — skipping (UPS control unavailable)"
fi

# --- (a1) livos-ups-shutdown.sh root SHUTDOWNCMD — install root-owned 0755 (no grant) ---
# upsmon runs this AS ROOT from its FSD flow, so it needs no sudoers grant — only to be
# deployed root-owned 0755 on day-2 boxes.
_UPS_SHUT_SRC="$LIVOS_DIR/scripts/install/livos-ups-shutdown.sh"
if [[ ! -f "$_UPS_SHUT_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _UPS_SHUT_SRC="$TEMP_DIR/scripts/install/livos-ups-shutdown.sh"
fi
_UPS_SHUT_DST="/usr/local/lib/livos/livos-ups-shutdown.sh"
if [[ -f "$_UPS_SHUT_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_UPS_SHUT_DST" ]] || ! cmp -s "$_UPS_SHUT_SRC" "$_UPS_SHUT_DST"; then
        if install -m 0755 -o root -g root "$_UPS_SHUT_SRC" "$_UPS_SHUT_DST"; then
            ok "livos-ups-shutdown.sh installed at $_UPS_SHUT_DST"
        else
            warn "Failed to install livos-ups-shutdown.sh (non-fatal — UPS auto-shutdown unavailable until fixed)"
        fi
    else
        info "livos-ups-shutdown.sh already current"
    fi
else
    info "livos-ups-shutdown.sh source not found — skipping (UPS auto-shutdown unavailable)"
fi

# --- (a) sudoers.d/livos-ups — install + template the subject to the desktop user ---
_UPS_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-ups"
if [[ ! -f "$_UPS_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _UPS_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-ups"
fi
_UPS_SUDOERS_DST="/etc/sudoers.d/livos-ups"
if [[ -f "$_UPS_SUDOERS_SRC" ]]; then
    _UPS_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_UPS_SUDOERS_SRC" > "$_UPS_SUDOERS_TMP"
    else
        cp -f "$_UPS_SUDOERS_SRC" "$_UPS_SUDOERS_TMP"
    fi
    if [[ ! -f "$_UPS_SUDOERS_DST" ]] || ! cmp -s "$_UPS_SUDOERS_TMP" "$_UPS_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_UPS_SUDOERS_TMP" "$_UPS_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it (UPS control stays
        # denied — the prior state — rather than risk broken sudo).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_UPS_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_UPS_SUDOERS_DST — removing (UPS control stays denied until fixed)"
            rm -f "$_UPS_SUDOERS_DST"
        else
            ok "sudoers.d/livos-ups installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-ups already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_UPS_SUDOERS_TMP"
else
    info "sudoers.d/livos-ups source not found — skipping (UPS control unavailable)"
fi

# ── Step 7.10f: Phase 325 (STOR-01) — encrypted-folders provisioning (sudoers.d/livos-crypto + wrapper) ──
# The livos-crypto NOPASSWD grant + the root-owned gocryptfs wrapper must reach
# ALREADY-DEPLOYED boxes on Update, not just fresh installs. Mirrors Step 7.10e
# (livos-ups) VERBATIM (content-diff + visudo validate-or-remove), retargeted to
# livos-crypto. livinityd invokes `sudo -n /usr/local/lib/livos/livos-crypto.sh
# <action>`, so the wrapper + grant must exist on day-2 boxes too. Missing this is
# the "looks wired, silently no-ops" failure class (day-2 box gets denied forever).
# Fully fail-tolerant: a missing source or a visudo rejection never aborts the Update.
step "Phase 325 (STOR-01): encrypted-folders provisioning (sudoers.d/livos-crypto + install wrapper)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a0) livos-crypto.sh wrapper — install BEFORE the grant ---
# The livos-crypto grant (a) is on this ONE root-owned binary; the wrapper validates
# a fixed action enum {install|create|unlock|lock|status}, regex-validates +
# data-root-anchors every path arg, and builds every gocryptfs/fusermount/apt argv
# itself. The passphrase reaches gocryptfs via stdin (-extpass), never argv.
_CRYPTO_WRAP_SRC="$LIVOS_DIR/scripts/install/livos-crypto.sh"
if [[ ! -f "$_CRYPTO_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _CRYPTO_WRAP_SRC="$TEMP_DIR/scripts/install/livos-crypto.sh"
fi
_CRYPTO_WRAP_DST="/usr/local/lib/livos/livos-crypto.sh"
if [[ -f "$_CRYPTO_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_CRYPTO_WRAP_DST" ]] || ! cmp -s "$_CRYPTO_WRAP_SRC" "$_CRYPTO_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_CRYPTO_WRAP_SRC" "$_CRYPTO_WRAP_DST"; then
            ok "livos-crypto.sh installed at $_CRYPTO_WRAP_DST"
        else
            warn "Failed to install livos-crypto.sh (non-fatal — encrypted-folder control unavailable until fixed)"
        fi
    else
        info "livos-crypto.sh already current"
    fi
else
    info "livos-crypto.sh source not found — skipping (encrypted-folder control unavailable)"
fi

# --- (a) sudoers.d/livos-crypto — install + template the subject to the desktop user ---
_CRYPTO_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-crypto"
if [[ ! -f "$_CRYPTO_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _CRYPTO_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-crypto"
fi
_CRYPTO_SUDOERS_DST="/etc/sudoers.d/livos-crypto"
if [[ -f "$_CRYPTO_SUDOERS_SRC" ]]; then
    _CRYPTO_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_CRYPTO_SUDOERS_SRC" > "$_CRYPTO_SUDOERS_TMP"
    else
        cp -f "$_CRYPTO_SUDOERS_SRC" "$_CRYPTO_SUDOERS_TMP"
    fi
    if [[ ! -f "$_CRYPTO_SUDOERS_DST" ]] || ! cmp -s "$_CRYPTO_SUDOERS_TMP" "$_CRYPTO_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_CRYPTO_SUDOERS_TMP" "$_CRYPTO_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it (encrypted-folder
        # control stays denied — the prior state — rather than risk broken sudo).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_CRYPTO_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_CRYPTO_SUDOERS_DST — removing (encrypted-folder control stays denied until fixed)"
            rm -f "$_CRYPTO_SUDOERS_DST"
        else
            ok "sudoers.d/livos-crypto installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-crypto already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_CRYPTO_SUDOERS_TMP"
else
    info "sudoers.d/livos-crypto source not found — skipping (encrypted-folder control unavailable)"
fi

# ── Step 7.10g: Phase 325 (NET-01) — host networking provisioning (sudoers.d/livos-network + wrapper) ──
# The livos-network NOPASSWD grant + the root-owned networking wrapper (hostname/
# static-IP/DNS + fail-closed armed-rollback watchdog) must reach ALREADY-DEPLOYED
# boxes on Update, not just fresh installs. Mirrors Step 7.10f (livos-crypto)
# VERBATIM (content-diff + visudo validate-or-remove), retargeted to livos-network.
# livinityd invokes `sudo -n /usr/local/lib/livos/livos-network.sh <action>`, so the
# wrapper + grant must exist on day-2 boxes too. Missing this is the "looks wired,
# silently no-ops" failure class (day-2 box gets denied forever). Fully
# fail-tolerant: a missing source or a visudo rejection never aborts the Update.
step "Phase 325 (NET-01): host networking provisioning (sudoers.d/livos-network + install wrapper)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a0) livos-network.sh wrapper — install BEFORE the grant ---
# The livos-network grant (a) is on this ONE root-owned binary; the wrapper validates
# a fixed action enum {status|set-hostname|apply-ip|confirm|revert|set-dns},
# regex-validates every hostname/IPv4/CIDR/DNS arg, and builds every netplan yaml
# body + hostnamectl/netplan/systemd-run argv itself.
_NETWORK_WRAP_SRC="$LIVOS_DIR/scripts/install/livos-network.sh"
if [[ ! -f "$_NETWORK_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _NETWORK_WRAP_SRC="$TEMP_DIR/scripts/install/livos-network.sh"
fi
_NETWORK_WRAP_DST="/usr/local/lib/livos/livos-network.sh"
if [[ -f "$_NETWORK_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_NETWORK_WRAP_DST" ]] || ! cmp -s "$_NETWORK_WRAP_SRC" "$_NETWORK_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_NETWORK_WRAP_SRC" "$_NETWORK_WRAP_DST"; then
            ok "livos-network.sh installed at $_NETWORK_WRAP_DST"
        else
            warn "Failed to install livos-network.sh (non-fatal — network control unavailable until fixed)"
        fi
    else
        info "livos-network.sh already current"
    fi
else
    info "livos-network.sh source not found — skipping (network control unavailable)"
fi

# --- (a) sudoers.d/livos-network — install + template the subject to the desktop user ---
_NETWORK_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-network"
if [[ ! -f "$_NETWORK_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _NETWORK_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-network"
fi
_NETWORK_SUDOERS_DST="/etc/sudoers.d/livos-network"
if [[ -f "$_NETWORK_SUDOERS_SRC" ]]; then
    _NETWORK_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_NETWORK_SUDOERS_SRC" > "$_NETWORK_SUDOERS_TMP"
    else
        cp -f "$_NETWORK_SUDOERS_SRC" "$_NETWORK_SUDOERS_TMP"
    fi
    if [[ ! -f "$_NETWORK_SUDOERS_DST" ]] || ! cmp -s "$_NETWORK_SUDOERS_TMP" "$_NETWORK_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_NETWORK_SUDOERS_TMP" "$_NETWORK_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it (network
        # control stays denied — the prior state — rather than risk broken sudo).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_NETWORK_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_NETWORK_SUDOERS_DST — removing (network control stays denied until fixed)"
            rm -f "$_NETWORK_SUDOERS_DST"
        else
            ok "sudoers.d/livos-network installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-network already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_NETWORK_SUDOERS_TMP"
else
    info "sudoers.d/livos-network source not found — skipping (network control unavailable)"
fi

# ── Step 7.10h: Phase 325 (NET-02) — Tailscale VPN provisioning (sudoers.d/livos-tailscale + wrapper) ──
# The livos-tailscale NOPASSWD grant + the root-owned VPN wrapper (guided login +
# accept-dns=false MagicDNS/cloudflared-1033 fix + ufw tailscale0 + D-12 /opt/livos/.env
# overlay-bind persistence + livos.service restart) must reach ALREADY-DEPLOYED boxes on
# Update, not just fresh installs. Mirrors Step 7.10g (livos-network) VERBATIM (content-diff
# + visudo validate-or-remove), retargeted to livos-tailscale. livinityd invokes
# `sudo -n /usr/local/lib/livos/livos-tailscale.sh <action>`, so the wrapper + grant must
# exist on day-2 boxes too. Missing this is the "looks wired, silently no-ops" failure class.
# Fully fail-tolerant: a missing source or a visudo rejection never aborts the Update.
step "Phase 325 (NET-02): Tailscale VPN provisioning (sudoers.d/livos-tailscale + install wrapper)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a0) livos-tailscale.sh wrapper — install BEFORE the grant ---
# The livos-tailscale grant (a) is on this ONE root-owned binary; the wrapper validates
# a fixed action enum {install|login|set|down|status} and builds every apt/tailscale/ufw/
# systemctl argv + the fixed LIVOS_TAILSCALE_BIND /opt/livos/.env line itself.
_TAILSCALE_WRAP_SRC="$LIVOS_DIR/scripts/install/livos-tailscale.sh"
if [[ ! -f "$_TAILSCALE_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _TAILSCALE_WRAP_SRC="$TEMP_DIR/scripts/install/livos-tailscale.sh"
fi
_TAILSCALE_WRAP_DST="/usr/local/lib/livos/livos-tailscale.sh"
if [[ -f "$_TAILSCALE_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_TAILSCALE_WRAP_DST" ]] || ! cmp -s "$_TAILSCALE_WRAP_SRC" "$_TAILSCALE_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_TAILSCALE_WRAP_SRC" "$_TAILSCALE_WRAP_DST"; then
            ok "livos-tailscale.sh installed at $_TAILSCALE_WRAP_DST"
        else
            warn "Failed to install livos-tailscale.sh (non-fatal — VPN control unavailable until fixed)"
        fi
    else
        info "livos-tailscale.sh already current"
    fi
else
    info "livos-tailscale.sh source not found — skipping (VPN control unavailable)"
fi

# --- (a) sudoers.d/livos-tailscale — install + template the subject to the desktop user ---
_TAILSCALE_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-tailscale"
if [[ ! -f "$_TAILSCALE_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _TAILSCALE_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-tailscale"
fi
_TAILSCALE_SUDOERS_DST="/etc/sudoers.d/livos-tailscale"
if [[ -f "$_TAILSCALE_SUDOERS_SRC" ]]; then
    _TAILSCALE_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_TAILSCALE_SUDOERS_SRC" > "$_TAILSCALE_SUDOERS_TMP"
    else
        cp -f "$_TAILSCALE_SUDOERS_SRC" "$_TAILSCALE_SUDOERS_TMP"
    fi
    if [[ ! -f "$_TAILSCALE_SUDOERS_DST" ]] || ! cmp -s "$_TAILSCALE_SUDOERS_TMP" "$_TAILSCALE_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_TAILSCALE_SUDOERS_TMP" "$_TAILSCALE_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it (VPN control
        # stays denied — the prior state — rather than risk broken sudo).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_TAILSCALE_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_TAILSCALE_SUDOERS_DST — removing (VPN control stays denied until fixed)"
            rm -f "$_TAILSCALE_SUDOERS_DST"
        else
            ok "sudoers.d/livos-tailscale installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-tailscale already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_TAILSCALE_SUDOERS_TMP"
else
    info "sudoers.d/livos-tailscale source not found — skipping (VPN control unavailable)"
fi

# ── Step 7.10i: Phase 329 (FILES-05) — WebDAV (SFTPGo) provisioning (sudoers.d/livos-webdav + wrapper) ──
# The livos-webdav NOPASSWD grant + the root-owned SFTPGo wrapper (sha256-pinned v2.7.4
# .deb install + wrapper-owned webdavd-only 127.0.0.1 config with external_auth_hook to
# livinityd + SFTP/FTP/HTTPS off) must reach ALREADY-DEPLOYED boxes on Update, not just
# fresh installs. Mirrors Step 7.10h (livos-tailscale) VERBATIM (content-diff + visudo
# validate-or-remove), retargeted to livos-webdav. livinityd invokes
# `sudo -n /usr/local/lib/livos/livos-webdav.sh <action>`, so the wrapper + grant must
# exist on day-2 boxes too. Missing this is the "looks wired, silently no-ops" failure class.
# Fully fail-tolerant: a missing source or a visudo rejection never aborts the Update.
step "Phase 329 (FILES-05): WebDAV (SFTPGo) provisioning (sudoers.d/livos-webdav + install wrapper)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a0) livos-webdav.sh wrapper — install BEFORE the grant ---
# The livos-webdav grant (a) is on this ONE root-owned binary; the wrapper validates
# a fixed action enum {install|configure|status|remove} and builds the pinned SFTPGo
# download URL + sha256 pin + every apt argv + the entire /etc/sftpgo config body itself.
_WEBDAV_WRAP_SRC="$LIVOS_DIR/scripts/install/livos-webdav.sh"
if [[ ! -f "$_WEBDAV_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _WEBDAV_WRAP_SRC="$TEMP_DIR/scripts/install/livos-webdav.sh"
fi
_WEBDAV_WRAP_DST="/usr/local/lib/livos/livos-webdav.sh"
if [[ -f "$_WEBDAV_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_WEBDAV_WRAP_DST" ]] || ! cmp -s "$_WEBDAV_WRAP_SRC" "$_WEBDAV_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_WEBDAV_WRAP_SRC" "$_WEBDAV_WRAP_DST"; then
            ok "livos-webdav.sh installed at $_WEBDAV_WRAP_DST"
        else
            warn "Failed to install livos-webdav.sh (non-fatal — WebDAV control unavailable until fixed)"
        fi
    else
        info "livos-webdav.sh already current"
    fi
else
    info "livos-webdav.sh source not found — skipping (WebDAV control unavailable)"
fi

# --- (a) sudoers.d/livos-webdav — install + template the subject to the desktop user ---
_WEBDAV_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-webdav"
if [[ ! -f "$_WEBDAV_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _WEBDAV_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-webdav"
fi
_WEBDAV_SUDOERS_DST="/etc/sudoers.d/livos-webdav"
if [[ -f "$_WEBDAV_SUDOERS_SRC" ]]; then
    _WEBDAV_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_WEBDAV_SUDOERS_SRC" > "$_WEBDAV_SUDOERS_TMP"
    else
        cp -f "$_WEBDAV_SUDOERS_SRC" "$_WEBDAV_SUDOERS_TMP"
    fi
    if [[ ! -f "$_WEBDAV_SUDOERS_DST" ]] || ! cmp -s "$_WEBDAV_SUDOERS_TMP" "$_WEBDAV_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_WEBDAV_SUDOERS_TMP" "$_WEBDAV_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it (WebDAV control
        # stays denied — the prior state — rather than risk broken sudo).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_WEBDAV_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_WEBDAV_SUDOERS_DST — removing (WebDAV control stays denied until fixed)"
            rm -f "$_WEBDAV_SUDOERS_DST"
        else
            ok "sudoers.d/livos-webdav installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-webdav already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_WEBDAV_SUDOERS_TMP"
else
    info "sudoers.d/livos-webdav source not found — skipping (WebDAV control unavailable)"
fi

# ── Step 7.10j: Phase 329 (NET-04) — raw TCP/UDP exposure provisioning (sudoers.d/livos-net-expose + wrapper) ──
# The livos-net-expose NOPASSWD grant + the root-owned exposure wrapper (validates
# proto/port/CIDR, keeps a parsed openings state file, regenerates the WHOLE
# /etc/livos/docker-firewall.sh inserting -j RETURN openings BEFORE the DROP, then re-execs
# it directly) must reach ALREADY-DEPLOYED boxes on Update, not just fresh installs.
# Mirrors Step 7.10i (livos-webdav) VERBATIM (content-diff + visudo validate-or-remove),
# retargeted to livos-net-expose. livinityd invokes
# `sudo -n /usr/local/lib/livos/livos-net-expose.sh <action> [args...]`, so the wrapper + grant
# must exist on day-2 boxes too. Missing this is the "looks wired, silently no-ops" failure class.
# Fully fail-tolerant: a missing source or a visudo rejection never aborts the Update.
step "Phase 329 (NET-04): raw TCP/UDP exposure provisioning (sudoers.d/livos-net-expose + install wrapper)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a0) livos-net-expose.sh wrapper — install BEFORE the grant ---
# The livos-net-expose grant (a) is on this ONE root-owned binary; the wrapper validates
# a fixed action enum {status|open|close|list} and builds every DOCKER-USER rule + the entire
# /etc/livos/docker-firewall.sh body itself.
_NETEXPOSE_WRAP_SRC="$LIVOS_DIR/scripts/install/livos-net-expose.sh"
if [[ ! -f "$_NETEXPOSE_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _NETEXPOSE_WRAP_SRC="$TEMP_DIR/scripts/install/livos-net-expose.sh"
fi
_NETEXPOSE_WRAP_DST="/usr/local/lib/livos/livos-net-expose.sh"
if [[ -f "$_NETEXPOSE_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_NETEXPOSE_WRAP_DST" ]] || ! cmp -s "$_NETEXPOSE_WRAP_SRC" "$_NETEXPOSE_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_NETEXPOSE_WRAP_SRC" "$_NETEXPOSE_WRAP_DST"; then
            ok "livos-net-expose.sh installed at $_NETEXPOSE_WRAP_DST"
        else
            warn "Failed to install livos-net-expose.sh (non-fatal — TCP/UDP exposure unavailable until fixed)"
        fi
    else
        info "livos-net-expose.sh already current"
    fi
else
    info "livos-net-expose.sh source not found — skipping (TCP/UDP exposure unavailable)"
fi

# --- (a) sudoers.d/livos-net-expose — install + template the subject to the desktop user ---
_NETEXPOSE_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-net-expose"
if [[ ! -f "$_NETEXPOSE_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _NETEXPOSE_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-net-expose"
fi
_NETEXPOSE_SUDOERS_DST="/etc/sudoers.d/livos-net-expose"
if [[ -f "$_NETEXPOSE_SUDOERS_SRC" ]]; then
    _NETEXPOSE_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_NETEXPOSE_SUDOERS_SRC" > "$_NETEXPOSE_SUDOERS_TMP"
    else
        cp -f "$_NETEXPOSE_SUDOERS_SRC" "$_NETEXPOSE_SUDOERS_TMP"
    fi
    if [[ ! -f "$_NETEXPOSE_SUDOERS_DST" ]] || ! cmp -s "$_NETEXPOSE_SUDOERS_TMP" "$_NETEXPOSE_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_NETEXPOSE_SUDOERS_TMP" "$_NETEXPOSE_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it (TCP/UDP exposure
        # stays denied — the prior state — rather than risk broken sudo).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_NETEXPOSE_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_NETEXPOSE_SUDOERS_DST — removing (TCP/UDP exposure stays denied until fixed)"
            rm -f "$_NETEXPOSE_SUDOERS_DST"
        else
            ok "sudoers.d/livos-net-expose installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-net-expose already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_NETEXPOSE_SUDOERS_TMP"
else
    info "sudoers.d/livos-net-expose source not found — skipping (TCP/UDP exposure unavailable)"
fi

# ── Step 7.10k: Phase 329 (HW-02) — power management provisioning (sudoers.d/livos-power + wrapper) ──
# The livos-power NOPASSWD grant + the root-owned power wrapper (validates every
# device/iface/time token, refuses NVMe + the boot/root disk for spin-down, keeps the
# scheduled wake DEFAULT OFF, and builds every hdparm/ethtool/rtcwake/systemctl argv +
# /etc file body itself) must reach ALREADY-DEPLOYED boxes on Update, not just fresh
# installs. Mirrors Step 7.10j (livos-net-expose) VERBATIM (content-diff + visudo
# validate-or-remove), retargeted to livos-power. livinityd invokes
# `sudo -n /usr/local/lib/livos/livos-power.sh <action> [args...]`, so the wrapper + grant
# must exist on day-2 boxes too. Missing this is the "looks wired, silently no-ops" failure class.
# Fully fail-tolerant: a missing source or a visudo rejection never aborts the Update.
step "Phase 329 (HW-02): power management provisioning (sudoers.d/livos-power + install wrapper)"

_set_desktop_identity   # Phase 277.1 — self-derive the desktop user (no literal bruce)

# --- (a0) livos-power.sh wrapper — install BEFORE the grant ---
# The livos-power grant (a) is on this ONE root-owned binary; the wrapper validates a fixed
# 9-action enum and builds every privileged argv + /etc file body itself.
_POWER_WRAP_SRC="$LIVOS_DIR/scripts/install/livos-power.sh"
if [[ ! -f "$_POWER_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _POWER_WRAP_SRC="$TEMP_DIR/scripts/install/livos-power.sh"
fi
_POWER_WRAP_DST="/usr/local/lib/livos/livos-power.sh"
if [[ -f "$_POWER_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_POWER_WRAP_DST" ]] || ! cmp -s "$_POWER_WRAP_SRC" "$_POWER_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_POWER_WRAP_SRC" "$_POWER_WRAP_DST"; then
            ok "livos-power.sh installed at $_POWER_WRAP_DST"
        else
            warn "Failed to install livos-power.sh (non-fatal — power management unavailable until fixed)"
        fi
    else
        info "livos-power.sh already current"
    fi
else
    info "livos-power.sh source not found — skipping (power management unavailable)"
fi

# --- (a) sudoers.d/livos-power — install + template the subject to the desktop user ---
_POWER_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-power"
if [[ ! -f "$_POWER_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _POWER_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-power"
fi
_POWER_SUDOERS_DST="/etc/sudoers.d/livos-power"
if [[ -f "$_POWER_SUDOERS_SRC" ]]; then
    _POWER_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/; s/=\(bruce\)/=(${_DESKTOP_USER})/g" \
            "$_POWER_SUDOERS_SRC" > "$_POWER_SUDOERS_TMP"
    else
        cp -f "$_POWER_SUDOERS_SRC" "$_POWER_SUDOERS_TMP"
    fi
    if [[ ! -f "$_POWER_SUDOERS_DST" ]] || ! cmp -s "$_POWER_SUDOERS_TMP" "$_POWER_SUDOERS_DST"; then
        install -m 0440 -o root -g root "$_POWER_SUDOERS_TMP" "$_POWER_SUDOERS_DST"
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it (power management
        # stays denied — the prior state — rather than risk broken sudo).
        if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_POWER_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_POWER_SUDOERS_DST — removing (power management stays denied until fixed)"
            rm -f "$_POWER_SUDOERS_DST"
        else
            ok "sudoers.d/livos-power installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-power already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_POWER_SUDOERS_TMP"
else
    info "sudoers.d/livos-power source not found — skipping (power management unavailable)"
fi

# ── Step 7.11: Phase 306 — desktop-user password helper (wrapper + sudoers + bootstrap) ──
# The "Regenerate" button on the Desktop password row in Settings → Account calls
# livinityd's system.regenerateDesktopPassword, which runs
#   sudo -n /usr/local/lib/livos/set-desktop-password.sh
# via the scoped /etc/sudoers.d/livos-desktop-password grant. Neither existed on
# day-2 boxes, so we install both here every Update (idempotent). We also BOOTSTRAP
# a password ONCE (when /etc/livos/desktop-user-credentials is absent) so existing
# boxes whose desktop user was created WITHOUT a password (useradd -m) get a known
# sudo password the operator can read in Settings. Fully fail-tolerant: a missing
# source or any error here never aborts the Update.
#
# NOTE (v45.06): inline update.sh changes only take effect the update AFTER they
# ship — update.sh self-replaces /opt/livos/update.sh (L1167) but does NOT re-exec
# the fresh clone, so a box that took v45.05 first runs THIS block on its next
# update. v45.06 is a no-op re-ship purely to trigger that follow-up update on
# boxes already on v45.05 (the v45.05 update.sh on disk runs this block, then
# self-replaces to v45.06). Future must-run-this-update logic should instead be a
# freshly-cloned SCRIPT invoked by the already-deployed update.sh, not inline.
step "Phase 306: desktop-user password helper (set-desktop-password.sh + sudoers + bootstrap)"

# (a) set-desktop-password.sh wrapper → /usr/local/lib/livos (root-owned 0755)
_PWD_WRAP_SRC="$LIVOS_DIR/scripts/install/set-desktop-password.sh"
if [[ ! -f "$_PWD_WRAP_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _PWD_WRAP_SRC="$TEMP_DIR/scripts/install/set-desktop-password.sh"
fi
_PWD_WRAP_DST="/usr/local/lib/livos/set-desktop-password.sh"
if [[ -f "$_PWD_WRAP_SRC" ]]; then
    mkdir -p /usr/local/lib/livos
    if [[ ! -f "$_PWD_WRAP_DST" ]] || ! cmp -s "$_PWD_WRAP_SRC" "$_PWD_WRAP_DST"; then
        if install -m 0755 -o root -g root "$_PWD_WRAP_SRC" "$_PWD_WRAP_DST"; then
            ok "set-desktop-password.sh installed at $_PWD_WRAP_DST"
        else
            warn "Failed to install set-desktop-password.sh (non-fatal; password regenerate unavailable)"
        fi
    else
        info "set-desktop-password.sh already current"
    fi
else
    info "set-desktop-password.sh source not found — skipping (password regenerate unavailable)"
fi

# (b) sudoers.d/livos-desktop-password — template the `bruce` subject to the desktop user
_PWD_SUDOERS_SRC="$LIVOS_DIR/scripts/install/sudoers.d/livos-desktop-password"
if [[ ! -f "$_PWD_SUDOERS_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _PWD_SUDOERS_SRC="$TEMP_DIR/scripts/install/sudoers.d/livos-desktop-password"
fi
_PWD_SUDOERS_DST="/etc/sudoers.d/livos-desktop-password"
if [[ -f "$_PWD_SUDOERS_SRC" ]]; then
    _PWD_SUDOERS_TMP=$(mktemp)
    if [[ "$_DESKTOP_USER" != "bruce" ]]; then
        sed -E "s/^bruce([[:space:]]+ALL=)/${_DESKTOP_USER}\1/" \
            "$_PWD_SUDOERS_SRC" > "$_PWD_SUDOERS_TMP"
    else
        cp -f "$_PWD_SUDOERS_SRC" "$_PWD_SUDOERS_TMP"
    fi
    if [[ ! -f "$_PWD_SUDOERS_DST" ]] || ! cmp -s "$_PWD_SUDOERS_TMP" "$_PWD_SUDOERS_DST"; then
        # SAFETY-CRITICAL: a malformed sudoers file can break sudo system-wide.
        # Validate the INSTALLED file; if visudo rejects it, REMOVE it. The install
        # itself is non-fatal — a failure must never abort the Update.
        if ! install -m 0440 -o root -g root "$_PWD_SUDOERS_TMP" "$_PWD_SUDOERS_DST"; then
            warn "Failed to install sudoers.d/livos-desktop-password (non-fatal; password regenerate unavailable)"
        elif command -v visudo >/dev/null 2>&1 && ! visudo -cf "$_PWD_SUDOERS_DST" >/dev/null 2>&1; then
            warn "visudo rejected $_PWD_SUDOERS_DST — removing (password regenerate stays unavailable until fixed)"
            rm -f "$_PWD_SUDOERS_DST"
        else
            ok "sudoers.d/livos-desktop-password installed (subject: ${_DESKTOP_USER})"
        fi
    else
        info "sudoers.d/livos-desktop-password already current (subject: ${_DESKTOP_USER})"
    fi
    rm -f "$_PWD_SUDOERS_TMP"
else
    info "sudoers.d/livos-desktop-password source not found — skipping"
fi

# (c) one-time bootstrap — give the desktop user a known password if it has none.
# Guard on the credential snapshot: present ⇒ a password was already generated;
# never overwrite it on subsequent Updates.
if [[ ! -f /etc/livos/desktop-user-credentials && -x "$_PWD_WRAP_DST" ]]; then
    info "No desktop-user credential snapshot yet — bootstrapping a password via $_PWD_WRAP_DST"
    if LIVOS_DESKTOP_USER="$_DESKTOP_USER" "$_PWD_WRAP_DST" --firstboot; then
        ok "Desktop-user password bootstrapped (shown once on the onboarding screen; Settings → Account reveal is 2FA-gated)"
    else
        warn "Desktop-user password bootstrap failed (non-fatal; operator can use Regenerate in Settings)"
    fi
else
    info "Desktop-user credential snapshot present or wrapper missing — skipping bootstrap"
fi

# --- (c) v44.57 — admin local-bundle runtimes (AppImage / Flatpak / Snap) -------------------
# v44.56 added admin .deb upload; v44.57 extends it to AppImage/Flatpak/Snap. Each format
# needs a host RUNTIME present before installLocalDeb's sibling code-paths can succeed.
# Mirrors the :947-968 apt pattern: command -v guard (re-run = no-op) + DEBIAN_FRONTEND
# noninteractive + warn-not-fail (a missing runtime NEVER aborts the Update; the upload
# route returns a clean {ok:false,"runtime not installed"} at install time instead).
# The snap sudoers grant ships above in (a); these runtimes are the day-2 dependency layer.
if [[ -x /usr/bin/apt-get ]] && command -v apt-get >/dev/null 2>&1; then
    # (c.1) AppImage — needs libfuse2 at RUN time (the AppImage self-mounts via FUSE).
    #       `fusermount` is provided by libfuse2; install only if absent.
    if ! command -v fusermount >/dev/null 2>&1; then
        info "v44.57: installing libfuse2 for AppImage runtime support…"
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libfuse2 \
            2>&1 | tail -3 || warn "libfuse2 install failed (non-fatal; AppImage uploads will report runtime not installed)"
    else
        info "v44.57: libfuse2 (fusermount) already present — skipping"
    fi

    # (c.2) Flatpak — install the `flatpak` runtime, then add the flathub remote in the
    #       desktop user's --user scope (idempotent via --if-not-exists). All warn-not-fail.
    if ! command -v flatpak >/dev/null 2>&1; then
        info "v44.57: installing flatpak runtime…"
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq flatpak \
            2>&1 | tail -3 || warn "flatpak install failed (non-fatal; Flatpak uploads will report runtime not installed)"
    else
        info "v44.57: flatpak runtime already present — skipping"
    fi
    if command -v flatpak >/dev/null 2>&1 && id "$_DESKTOP_USER" >/dev/null 2>&1; then
        sudo -u "$_DESKTOP_USER" flatpak remote-add --if-not-exists --user \
            flathub https://dl.flathub.org/repo/flathub.flatpakrepo \
            >/dev/null 2>&1 || warn "flathub --user remote-add failed for ${_DESKTOP_USER} (non-fatal)"
    fi

    # (c.3) Snap — install snapd. Headless/VPS hosts (no seeded snap, container/cgroup
    #       quirks) frequently fail to bring snapd up; this MUST stay warn-not-fail so the
    #       Update never aborts. The `snap install --dangerous *` sudoers grant ships in (a).
    if ! command -v snap >/dev/null 2>&1; then
        info "v44.57: installing snapd for Snap runtime support…"
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq snapd \
            2>&1 | tail -3 || warn "snapd install failed (non-fatal; common on headless VPS — Snap uploads will report snapd not available)"
    else
        info "v44.57: snapd already present — skipping"
    fi
else
    info "v44.57: apt-get unavailable — skipping AppImage/Flatpak/Snap runtime provisioning"
fi

# ── Phase 202-10: desktop-user ownership hook (recurring P198/P199/P200/P201 patch) ──
# When update.sh runs as root, rsync + pnpm install + builds end up root-owned.
# livos.service runs as the LivOS desktop user, and pnpm-store / .next / dist
# directories end up un-readable on next boot. This was hot-fixed manually on every
# deploy since Phase 198. Folding into update.sh closes the recurring carry-over.
#
# 2026-06-15: derive the run-user from the installed unit — hardcoding `bruce` here
# CRASH-LOOPS any non-bruce account (e.g. the `everything` account): `chown bruce:bruce`
# makes /opt/livos unreadable by `User=everything` → systemd "Changing to the requested
# working directory failed: Permission denied" → restart loop → CF 502. Fall back to
# bruce ONLY if the unit can't be read (legacy single-user Mini PC).
step "Fixing /opt/livos + /opt/liv ownership (LivOS desktop user)"
_LIVOS_RUN_USER=$(grep -oP '^User=\K.*' /etc/systemd/system/livos.service 2>/dev/null | head -1); [ -z "$_LIVOS_RUN_USER" ] && _LIVOS_RUN_USER=$(stat -c '%U' /opt/livos 2>/dev/null)
if id "$_LIVOS_RUN_USER" >/dev/null 2>&1; then
    chown -R "$_LIVOS_RUN_USER:$_LIVOS_RUN_USER" "$LIVOS_DIR" 2>/dev/null || warn "chown $LIVOS_DIR partial"
    if [[ -d "$LIV_DIR" ]]; then
        chown -R "$_LIVOS_RUN_USER:$_LIVOS_RUN_USER" "$LIV_DIR" 2>/dev/null || warn "chown $LIV_DIR partial"
    fi
    ok "Ownership normalised to $_LIVOS_RUN_USER:$_LIVOS_RUN_USER"
else
    info "LivOS run-user '$_LIVOS_RUN_USER' absent — skipping ownership normalisation"
fi

# ── Step 8: Restart services ─────────────────────────────
step "Restarting services"

systemctl daemon-reload

# Auto-recovery: keep systemd retrying livos on crash-loop (never permanent-fail).
ensure_livos_startlimit_dropin
# Fast, clean shutdown — collapse the 90s stop-hang (XFCE cgroup) that both 502s
# users on every update AND strands update.sh's sudo parent at the SIGKILL.
ensure_livos_killmode_dropin

info "Restarting livos..."
# Layer-B (Phase 273): arm the independent, SIGKILL-immune rollback guard RIGHT
# before the restart (the cgroup-kill point). If this restart strands/kills
# update.sh before Layer-A's probe runs, the guard rolls back to last-good on its
# own. The EXIT trap disarms it on any clean exit, so it only fires on a SIGKILL.
# `|| true` keeps arming fail-open: a sentinel-write/systemd-run hiccup must never
# abort the deploy itself (Layer-A still protects).
arm_deploy_guard || true
# Clear any latched failed-state FIRST — a box already crash-looping from a prior
# bad deploy (the exact case this rescues) can refuse a plain `restart` with
# "start request repeated too quickly" until reset-failed clears the latch.
systemctl reset-failed livos.service 2>/dev/null || true
systemctl restart livos.service
sleep 2

# ── Atomic-update safety net: probe livinityd; roll back to last-good on failure ──
# livinityd serves the UI on :8080 (Caddy → :8080 → Cloudflare). If the freshly
# rsynced source can't boot, restore the Step-2 snapshot + restart so a bad
# update can NEVER leave the user on a permanent 502. On rollback this `fail`s
# (deploy marked failed, .deployed-sha NOT advanced) but the UI stays reachable.
health_probe_or_rollback

# ── App Store self-heal: re-seed livos:platform:api_key from .env (2026-06-18) ──
# The platform api key is seeded into Redis ONLY on a fresh install
# (deploy-livinityd.sh _dld_seed_platform_api_key, from the --api-key flag).
# A reinstall / Redis wipe leaves the key empty while .env still holds
# LIV_PLATFORM_API_KEY — and update.sh never re-seeded it, so the App Store
# could not install any non-builtin app (livinityd fetchPlatformTemplate →
# null → "App <id> not found: no builtin definition and no platform compose",
# silently swallowed into the store iframe). Re-seed from .env here, every
# update. Fully fail-tolerant: every redis-cli is `|| true` so this can NEVER
# abort the Update.
if command -v redis-cli >/dev/null 2>&1; then
    _PAK_KEY=$(grep -oE '^LIV_PLATFORM_API_KEY=.+' /opt/livos/.env 2>/dev/null | head -1 | cut -d= -f2- || true)
    _PAK_RURL=$(grep -E '^REDIS_URL=' /opt/livos/.env 2>/dev/null | cut -d= -f2- || true)
    if [[ -n "${_PAK_KEY:-}" && -n "${_PAK_RURL:-}" ]]; then
        _PAK_RPW=$(echo "$_PAK_RURL" | sed -E 's|redis://[^:]*:([^@]+)@.*|\1|')
        _PAK_CUR=$(redis-cli -a "$_PAK_RPW" --no-auth-warning GET livos:platform:api_key 2>/dev/null || true)
        if [[ "$_PAK_CUR" != "$_PAK_KEY" ]]; then
            redis-cli -a "$_PAK_RPW" --no-auth-warning SET livos:platform:api_key "$_PAK_KEY" >/dev/null 2>&1 || true
            redis-cli -a "$_PAK_RPW" --no-auth-warning SET livos:platform:enabled 1 >/dev/null 2>&1 || true
            ok "Re-seeded livos:platform:api_key from .env (App Store install fix)"
        else
            info "livos:platform:api_key already in sync with .env"
        fi
    else
        warn "App Store: no LIV_PLATFORM_API_KEY in /opt/livos/.env — non-builtin app install will fail until a key is provided."
    fi
fi

# ── v43 terminal panel: enable the new (v43) PTY backend (Phase 290 R3 B2) ──
# The desktop UI now renders the v43 terminal panel UNCONDITIONALLY (the legacy
# terminal can no longer mount). But the v43 PTY WebSocket backend
# (/livos/terminal/ws) is gated server-side by the Redis flag
# livos:v43:terminal_panel — and when it is unset/false the server refuses the
# socket, so the panel renders but the shell is BLANK. Seed the flag to true
# here, every update, so the new terminal has a live shell after Update.
# Idempotent (GET then SET only when needed) and fully fail-tolerant: every
# redis-cli is `|| true` so this can NEVER abort the Update.
if command -v redis-cli >/dev/null 2>&1; then
    _V43_RURL=$(grep -E '^REDIS_URL=' /opt/livos/.env 2>/dev/null | cut -d= -f2- || true)
    if [[ -n "${_V43_RURL:-}" ]]; then
        _V43_RPW=$(echo "$_V43_RURL" | sed -E 's|redis://[^:]*:([^@]+)@.*|\1|')
        _V43_CUR=$(redis-cli -a "$_V43_RPW" --no-auth-warning GET livos:v43:terminal_panel 2>/dev/null || true)
        if [[ "$_V43_CUR" != "true" ]]; then
            redis-cli -a "$_V43_RPW" --no-auth-warning SET livos:v43:terminal_panel true >/dev/null 2>&1 || true
            ok "Enabled livos:v43:terminal_panel (new terminal PTY backend live)"
        else
            info "livos:v43:terminal_panel already enabled"
        fi
    fi
fi

info "Restarting liv-core..."
systemctl restart liv-core.service
sleep 1

info "Restarting liv-worker..."
systemctl restart liv-worker.service 2>/dev/null || true

info "Restarting liv-memory..."
systemctl restart liv-memory.service 2>/dev/null || true

# Phase 201-06 — restart liv-ai-app Next.js subapp (127.0.0.1:3010).
# Guarded so this is a no-op on legacy deploys that haven't yet had the unit
# installed via scripts/install/systemd-units-install.sh.
if [[ -f /etc/systemd/system/livos-app-liv-ai.service || -f /usr/lib/systemd/system/livos-app-liv-ai.service ]]; then
    systemctl enable livos-app-liv-ai.service 2>/dev/null || true
    if systemctl restart livos-app-liv-ai.service 2>/dev/null; then
        ok "Restarted livos-app-liv-ai (Next.js :3010)"
    else
        warn "livos-app-liv-ai restart failed — check journalctl -u livos-app-liv-ai -n 30"
    fi
else
    info "livos-app-liv-ai.service not installed yet — run scripts/install/systemd-units-install.sh as root to enable"
fi

# Phase 203-03 → RETIRED 2026-06-09 — liv-claw-gateway (openclaw :18789).
# OpenClawOS was retired in Phase 231 (AI chat moved to AionUi). The gateway's
# Phase-231 force-mask kept getting undone because the service-install step above
# re-installed + re-enabled the unit on every deploy, leaving a dead runtime
# bound to :18789. We now RETIRE it explicitly here (runs after the install step,
# so the mask wins): stop, disable, and mask so future deploys can't resurrect it.
_LIV_CLAW_UNIT="/etc/systemd/system/liv-claw-gateway.service"
systemctl stop liv-claw-gateway.service 2>/dev/null || true
systemctl disable liv-claw-gateway.service 2>/dev/null || true
# FORCE-mask via /dev/null symlink (plain `systemctl mask` fails when the
# install step above wrote a REAL unit file at this path — see Phase 231 notes).
# This runs AFTER the install step, so the mask always wins; the service is
# never started in the brief same-run window (install only enables, never starts).
if [[ ! -L "$_LIV_CLAW_UNIT" || "$(readlink "$_LIV_CLAW_UNIT" 2>/dev/null)" != "/dev/null" ]]; then
    rm -f "$_LIV_CLAW_UNIT"
    ln -sf /dev/null "$_LIV_CLAW_UNIT"
    systemctl daemon-reload 2>/dev/null || true
fi
ok "liv-claw-gateway retired (stopped + disabled + force-masked — openclaw replaced by AionUi)"

# ── Phase 225 — restart liv-assistant.service + /api/auth/status smoke ─────────
# Guarded so legacy deploys without the unit are no-ops. Restart is required so
# the freshly-installed binary at /opt/liv-assistant/current is picked up (the
# install script's atomic symlink swap doesn't trigger a reload by itself).
# The /api/auth/status probe enforces that the service ACTUALLY booted to a
# serving state — not just `active (running)` (which can be true for a few
# seconds while the HTTP server is still initialising). A 5s timeout is generous
# given Phase 223-05's measured cold-boot of ~3s. Plan 225-03 pivoted the probe
# URL to /api/auth/status because vendored AionUi v2.1.4 binary returns HTTP 200
# from the application-layer auth controller (router-alive + handler-alive) —
# see Plan 225-02 DEPLOY-LOG Step 2d endpoint matrix for the full evidence.
if [[ -f /etc/systemd/system/liv-assistant.service || -f /usr/lib/systemd/system/liv-assistant.service ]]; then
    # ── Phase 253 GC-E — keep the liv-assistant unit in sync from the repo ──────
    # The unit was historically installed only on fresh install, so Environment=
    # changes (e.g. GEMINI_CLI_TRUST_WORKSPACE) never reached existing boxes. Sync
    # it from the fresh clone and daemon-reload so the restart below picks up unit
    # edits. Idempotent (cmp guard); only the on-disk /etc unit is touched.
    #
    # Phase 277 (Bug 2 fix): this block USED to `install` the repo unit VERBATIM
    # (User=bruce) — running LATER than the Phase 225 install above, it CLOBBERED the
    # desktop-user fix on EVERY update (User=bruce won → aioncore logging-init fail →
    # liv-assistant crash-loop → /liv 502 → operator hand-fixed each time). Now it
    # renders through the SAME _render_liv_assistant_unit helper, so it produces the
    # byte-identical desktop-user unit (cmp → unchanged → no clobber, no churn).
    _LIV_ASSISTANT_UNIT_SRC="$TEMP_DIR/systemd/liv-assistant.service"
    if [[ -f "$_LIV_ASSISTANT_UNIT_SRC" ]]; then
        _render_liv_assistant_unit "$_LIV_ASSISTANT_UNIT_SRC" /etc/systemd/system/liv-assistant.service
        if [[ "$_LA_UNIT_STATUS" == changed ]]; then
            ok "liv-assistant.service unit synced from repo (User=${_LA_USER}) + daemon-reload (GC-E)"
        else
            info "liv-assistant.service unit unchanged"
        fi
    else
        info "systemd/liv-assistant.service not in TEMP_DIR — skipping unit sync (pre-Phase 253 clone)"
    fi

    systemctl enable liv-assistant.service 2>/dev/null || true
    # Phase 277 (Bug 1 — defensive hardening): bound the restart wait so a slow/wedged
    # aioncore boot can't freeze the Update for minutes (the actual claude-doctor hang
    # is fixed at line ~1387). The job keeps booting in the background; the bounded
    # :3020 probe below confirms serving state. 124 = timed out → warn + continue.
    if timeout -k 10 75 systemctl restart liv-assistant.service 2>/dev/null; then
        ok "Restarted liv-assistant (AionUi WebUI :3020)"
    else
        warn "liv-assistant restart slow/failed (bounded at 75s) — check journalctl -u liv-assistant -n 30"
    fi
    # Give the service a moment to bind port 3020 before probing.
    sleep 2
    info "Probing http://127.0.0.1:3020/api/auth/status (5s timeout)..."
    if curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3020/api/auth/status 2>/dev/null | grep -qE '^(200|204)$'; then
        ok "liv-assistant /api/auth/status = 200/204 OK"
    else
        # Capture the failing response for the deploy log before aborting.
        warn "liv-assistant /api/auth/status probe non-2xx; collecting diagnostics..."
        curl -sS -o /dev/null -w 'HTTP %{http_code} (curl exit %{exitcode}, time %{time_total}s)\n' --max-time 5 http://127.0.0.1:3020/api/auth/status 2>&1 || true
        journalctl -u liv-assistant -n 20 --no-pager 2>/dev/null || true
        # 2026-06-13: was a hard `fail` (Deploy aborted). This 5s post-restart probe
        # of an OPTIONAL subsystem (AionUi :3020) was killing the ENTIRE update on
        # boxes where AionUi cold-boots slower than 5s OR is mid-restart-loop (the
        # known Claude-Code-version-pin deadlock → 502/524). Worse, .deployed-sha is
        # recorded AFTER this step, so aborting here discards an already-successful
        # core update and the box stays on the OLD version (operator sees "update
        # failed" with no version change). Liv AI health must never block the core
        # update — warn + continue so the SHA gets recorded; fix AionUi separately.
        warn "liv-assistant health probe did not return 200/204 within 5s (slow cold-boot or AionUi issue) — NOT aborting: the core LivOS update already succeeded and will be recorded. Fix Liv AI separately: journalctl -u liv-assistant -n 30"
    fi

    # ── Phase 225 — first-boot password capture (race-tolerant) ─────────────────
    # Phase 223-03 helper is idempotent (no-op if creds file already populated)
    # and exits 0 even when the journald marker line hasn't landed yet (Plan 05
    # retry-loop contract). So we ALWAYS invoke it; the helper itself decides
    # whether to write or no-op. We only skip outright if the helper script is
    # missing (pre-Phase 223-03 deploy).
    _LIV_ASSISTANT_CAPTURE_SRC="$TEMP_DIR/scripts/capture-liv-assistant-password.sh"
    if [[ ! -f "$_LIV_ASSISTANT_CAPTURE_SRC" ]]; then
        _LIV_ASSISTANT_CAPTURE_SRC="$LIVOS_DIR/scripts/capture-liv-assistant-password.sh"
    fi
    if [[ -f "$_LIV_ASSISTANT_CAPTURE_SRC" ]]; then
        if bash "$_LIV_ASSISTANT_CAPTURE_SRC" 2>&1 | tail -5; then
            ok "liv-assistant credentials capture step ran (no-op if already captured)"
        else
            warn "capture-liv-assistant-password.sh exited non-zero — operator can re-run manually: sudo bash $_LIV_ASSISTANT_CAPTURE_SRC"
        fi
    else
        info "scripts/capture-liv-assistant-password.sh not in TEMP_DIR or LIVOS_DIR — skipping (pre-Phase 223-03 deploy)"
    fi

    # ── Phase 238.3 — set Claude Code as default agent ──────────────────────
    # Idempotent post-restart helper: ensures guid.lastSelectedAgent points at
    # the Claude Code agent (id=2d23ff1c) rather than AionUi's built-in
    # `aionrs` default. Operator preference: Aion CLI stays VISIBLE in the
    # picker (agents.hidden/disabled remain []); only the DEFAULT changes.
    # Helper itself decides write-vs-no-op and never fails the deploy on
    # transient API hiccups.
    _LIV_DEFAULT_AGENT_SRC="$TEMP_DIR/scripts/set-default-liv-agent.sh"
    if [[ ! -f "$_LIV_DEFAULT_AGENT_SRC" ]]; then
        _LIV_DEFAULT_AGENT_SRC="$LIVOS_DIR/scripts/set-default-liv-agent.sh"
    fi
    if [[ -f "$_LIV_DEFAULT_AGENT_SRC" ]]; then
        if bash "$_LIV_DEFAULT_AGENT_SRC" 2>&1 | tail -5; then
            ok "Default agent normalization step ran (no-op if already Claude Code)"
        else
            warn "set-default-liv-agent.sh exited non-zero — operator can re-run manually: sudo bash $_LIV_DEFAULT_AGENT_SRC"
        fi
    else
        info "scripts/set-default-liv-agent.sh not in TEMP_DIR or LIVOS_DIR — skipping (pre-Phase 238.3 deploy)"
    fi

    # ── Phase 253 W4 — LivOS MCP import is handled by the CapabilitiesSettings
    # importer patch (install-liv-assistant.sh), NOT by seeding agent configs.
    # Seeding ~/.claude.json mcpServers (the old GC-F approach) DOUBLE-injected
    # the LivOS servers into Claude's ACP session/new (aioncore already injects
    # them from its own registry), which HUNG session/new and broke Claude chat
    # on a box whose claude.json was non-empty (Mini PC works precisely because
    # its claude.json mcpServers is empty). So we deliberately do NOT seed here.
    info "LivOS MCP import handled by the importer patch (W4); not seeding agent configs (keeps claude.json mcpServers empty so ACP session/new does not double-inject)"
else
    info "liv-assistant.service not installed — skipping restart + health probe (pre-Phase 225 deploy)"
fi

# ── Liv MCP / Local-Agents carve-out repair (drift-fix) ───────────────────
# The tunnel/portal-mode Caddyfile is laid down ONCE at install by
# scripts/install/{mode-tunnel,deploy-livinityd}.sh and is NOT regenerated by
# livinityd at boot (applyCaddyConfig only runs on a domain/app change), so its
# @liv_cli_installer carve-out can lag the source (caddy.ts LIV_CLI_INSTALLER_HANDLE).
# When it lags, /liv/trpc/<proc> falls through to the framed AionUi SPA and the
# One-Click Liv MCPs button (+ the Local Agents panel's manual-apply calls) fail
# with "Unexpected token '<', "<!doctype "... is not valid JSON". This idempotently
# rewrites that ONE matcher line to the canonical full path set, then validates +
# reloads. Keep this list in lock-step with caddy.ts LIV_CLI_INSTALLER_HANDLE.
_LIV_CARVEOUT_CANON='    @liv_cli_installer path /liv/trpc/cliInstaller.detect /liv/trpc/cliInstaller.install /liv/trpc/cliInstaller.auth /liv/trpc/cliInstaller.applyAgentChanges /liv/trpc/cliInstaller.hasPendingAgentChanges /liv/trpc/mcp.config.installLivTools /liv/trpc/mcp.config.installLivMcpsToCli'
if [[ -f /etc/caddy/Caddyfile ]] && grep -q '@liv_cli_installer path' /etc/caddy/Caddyfile; then
    if grep -qF "$_LIV_CARVEOUT_CANON" /etc/caddy/Caddyfile; then
        info "Caddy @liv_cli_installer carve-out already current — no repair needed"
    else
        cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-carveout 2>/dev/null || true
        # Rewrite ONLY the matcher line (delimiter '|' so the /liv/trpc/ paths pass through).
        sed -i "s|^[[:space:]]*@liv_cli_installer path .*|${_LIV_CARVEOUT_CANON}|" /etc/caddy/Caddyfile
        if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
            systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || true
            ok "Repaired Caddy @liv_cli_installer carve-out (added missing /liv/trpc procedures) + reloaded"
        else
            warn "Caddy carve-out repair produced an invalid config — restoring backup"
            cp -a /etc/caddy/Caddyfile.bak-carveout /etc/caddy/Caddyfile 2>/dev/null || true
        fi
    fi
fi

# ── Phase 226 — reload caddy + /liv proxy smoke ───────────────────────────
# Reload (not restart) so existing connections are preserved. Guarded on the
# snippet file's presence so legacy deploys without Phase 226-01 are no-ops.
# Smoke probe uses --resolve loopback so it does NOT depend on public DNS or
# the Server5 relay — it exercises ONLY the Mini PC's local Caddy listener.
# Plan 226-03 deploy will additionally exercise the full external relay path.
if [[ -f /etc/caddy/conf.d/liv-assistant.caddy ]]; then
    if systemctl reload caddy 2>/dev/null; then
        ok "Reloaded caddy (snippet conf.d/liv-assistant.caddy active)"
    else
        # Reload can fail if caddy isn't running; try start.
        warn "caddy reload failed — attempting systemctl start caddy"
        if systemctl start caddy 2>/dev/null; then
            ok "Started caddy"
        else
            warn "caddy start failed — check journalctl -u caddy -n 30"
        fi
    fi
    # Give caddy a moment to apply the new config before probing.
    sleep 2
    # Phase 277.1 — derive the operator domain (NOT hardcoded bruce.livinity.io) so the
    # /liv proxy smoke is meaningful on ANY operator's box; skip gracefully if unknown.
    _SMOKE_DOMAIN=$(_resolve_operator_domain)
    if [[ -z "$_SMOKE_DOMAIN" ]]; then
        info "/liv proxy smoke skipped — operator domain not resolvable (Redis livos:domain:config empty); core update unaffected"
    else
        info "Probing https://$_SMOKE_DOMAIN/liv/api/auth/status via --resolve loopback (5s timeout)..."
        _LIV_PROXY_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
            --max-time 5 \
            --resolve "$_SMOKE_DOMAIN:443:127.0.0.1" \
            -k \
            "https://$_SMOKE_DOMAIN/liv/api/auth/status" 2>/dev/null || echo '000')"
        if [[ "$_LIV_PROXY_CODE" =~ ^(200|204)$ ]]; then
            ok "/liv proxy smoke = HTTP $_LIV_PROXY_CODE OK ($_SMOKE_DOMAIN/liv/api/auth/status → 127.0.0.1:3020)"
        else
            # Collect diagnostics. OPTIONAL subsystem (Liv AI /liv proxy) — must NEVER
            # gate the core deploy (a non-2xx here used to abort every non-bruce update).
            warn "/liv proxy smoke non-2xx (got HTTP $_LIV_PROXY_CODE) for $_SMOKE_DOMAIN; collecting diagnostics..."
            curl -sS -o /dev/null -w 'HTTP %{http_code} (time %{time_total}s)\n' --max-time 5 \
                --resolve "$_SMOKE_DOMAIN:443:127.0.0.1" -k \
                "https://$_SMOKE_DOMAIN/liv/api/auth/status" 2>&1 || true
            ls -la /etc/caddy/conf.d/liv-assistant.caddy 2>&1 || true
            journalctl -u caddy -n 20 --no-pager 2>/dev/null || true
            warn "/liv proxy smoke returned $_LIV_PROXY_CODE (expected 200/204) — NOT aborting (Liv AI /liv proxy only; core update already succeeded)."
        fi
    fi
else
    info "/etc/caddy/conf.d/liv-assistant.caddy not installed — skipping caddy reload + /liv smoke (pre-Phase 226 deploy)"
fi

# Verify services
sleep 3
if systemctl is-active --quiet livos.service; then
    ok "LivOS service running"
else
    warn "LivOS service may not have started - check: journalctl -u livos -n 30"
fi

if systemctl is-active --quiet liv-core.service; then
    ok "Liv-core service running"
else
    warn "Liv-core service may not have started - check: journalctl -u liv-core -n 30"
fi

if systemctl is-active --quiet liv-assistant.service; then
    ok "liv-assistant service running"
else
    # Non-fatal — if the unit isn't installed yet (legacy deploy) this is normal.
    # If it IS installed and the health probe above already aborted, we won't reach here.
    info "liv-assistant service not active (may not be installed on this deploy)"
fi

# ── Phase 30 UPD-03: Record deployed SHA ──────────────────
step "Recording deployed SHA"
if [[ -d "$TEMP_DIR/.git" ]]; then
    # Phase 32 REL-02 prep call site
    record_previous_sha
    if git -C "$TEMP_DIR" rev-parse HEAD > /opt/livos/.deployed-sha 2>/dev/null; then
        chmod 644 /opt/livos/.deployed-sha 2>/dev/null || true
        ok "Deployed SHA recorded: $(cat /opt/livos/.deployed-sha | cut -c1-7)"
    else
        warn "Could not record deployed SHA (livinityd update notifications may be inaccurate)"
    fi
    # ── Phase 266 — record the deployed RELEASE TAG ───────────────────────
    # livinityd's getLatestRelease() compares this tag against the latest
    # published release; writing it clears the "update available" flag once the
    # box is on the release. If we deployed bare master (no release / clone
    # fallback), clear any stale tag so detection falls back to a SHA compare.
    if [[ -n "${RELEASE_TAG:-}" ]]; then
        echo "$RELEASE_TAG" > /opt/livos/.deployed-release 2>/dev/null || true
        chmod 644 /opt/livos/.deployed-release 2>/dev/null || true
        ok "Deployed release recorded: $RELEASE_TAG"
    else
        rm -f /opt/livos/.deployed-release 2>/dev/null || true
        info "No release tag deployed (master HEAD) — .deployed-release cleared"
    fi
else
    warn "TEMP_DIR/.git not found; skipping .deployed-sha/.deployed-release write"
fi

# ── Step 9: Cleanup ───────────────────────────────────────
step "Cleanup"

rm -rf "$TEMP_DIR"
ok "Temp files cleaned"

# v29.0-hotpatch: completion sentinel — only set after the deploy SHA was
# recorded and cleanup ran. phase33_finalize uses this to avoid reporting
# false-positive success when the script exits 0 prematurely (e.g., due to
# SIGPIPE chain from livinityd's death during livos.service restart).
LIVOS_UPDATE_COMPLETED=1

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  LivOS updated successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${YELLOW}What was updated:${NC}"
echo -e "    - livinityd source code"
echo -e "    - UI (rebuilt from source)"
echo -e "    - Liv AI packages (core, worker, mcp-server)"
echo -e "    - liv-assistant (AionUi WebUI, vendored v2.1.14, port 3020)"
echo -e "    - Caddy /liv reverse-proxy (livinityd-emitted; <operator-domain>/liv → :3020, iframe CSP override) [Phase 226-04]"
echo -e "    - Gallery app cache"
echo -e "    - Dependencies"
echo ""
echo -e "  ${YELLOW}What was preserved:${NC}"
echo -e "    - .env (secrets, API keys, config)"
echo -e "    - Redis data (all settings, conversations)"
echo -e "    - App data volumes (installed apps, user files)"
echo -e "    - Systemd service configurations"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
