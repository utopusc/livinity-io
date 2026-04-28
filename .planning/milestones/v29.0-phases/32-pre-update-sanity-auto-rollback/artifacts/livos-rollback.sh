#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Phase 32 REL-02: livos-rollback.sh
#
# Triggered by livos-rollback.service via systemd OnFailure= when livos.service
# crash-loops 3+ times within 5 minutes (StartLimitBurst=3, StartLimitIntervalSec=300).
#
# Rollback flow:
#   1. Loop-guard check (.rollback-attempted lock) — abort if previous attempt
#      didn't clear (operator must investigate).
#   2. Touch .rollback-attempted (cleared only on success).
#   3. Read .deployed-sha.previous — abort if absent (first-ever deploy case).
#   4. Inline precheck (disk/writable/net) — abort if any guard fails (don't
#      half-rollback on a degraded host — R-04 mitigation).
#   5. git clone + checkout previous SHA into /tmp/livinity-rollback-$$.
#   6. rsync source files into /opt/livos/ + /opt/nexus/ (mirrors update.sh).
#   7. pnpm install + npm install.
#   8. Build all packages with verify_build asserts (mirrors Phase 31 BUILD-01).
#   9. Multi-dir nexus-core dist-copy (mirrors Phase 31 BUILD-02).
#  10. echo prev-sha > /opt/livos/.deployed-sha.
#  11. Write <iso-ts>-rollback.json to update-history/ (Phase 33 OBS-02 contract).
#  12. systemctl reset-failed + restart livos liv-core liv-worker liv-memory.
#  13. rm .rollback-attempted lock + cleanup tmp dir.
#
# Idempotency marker (Plan 32-03 grep-checks this exact line):
#   # ── Phase 32 REL-02: livos-rollback.sh ──
# ──────────────────────────────────────────────────────────────────────────────
# ── Phase 32 REL-02: livos-rollback.sh ──

set -euo pipefail

LIVOS_DIR="/opt/livos"
NEXUS_DIR="/opt/nexus"
REPO_URL="https://github.com/utopusc/livinity-io.git"
ROLLBACK_LOCK="/opt/livos/.rollback-attempted"
PREV_SHA_FILE="/opt/livos/.deployed-sha.previous"
CURRENT_SHA_FILE="/opt/livos/.deployed-sha"
HISTORY_DIR="/opt/livos/data/update-history"
START_TS=$(date -u +%s)
START_TS_MS=$(date -u +%s%3N 2>/dev/null || echo $((START_TS * 1000)))
START_ISO_FS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
START_ISO_JSON=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LOG_FILE="${HISTORY_DIR}/${START_ISO_FS}-rollback.log"

mkdir -p "$HISTORY_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[ROLLBACK] starting at $START_ISO_JSON (pid $$)"

# ── Loop guard ─────────────────────────────────────────────────────────────
if [[ -f "$ROLLBACK_LOCK" ]]; then
    echo "[ROLLBACK-ABORT] $ROLLBACK_LOCK exists — operator must investigate."
    echo "[ROLLBACK-ABORT] previous rollback attempt did not clear the lock."
    echo "[ROLLBACK-ABORT] to retry: sudo rm $ROLLBACK_LOCK && sudo systemctl start livos-rollback.service"
    exit 1
fi
touch "$ROLLBACK_LOCK"

# EXIT trap: log a clear failure marker when the process dies unexpectedly
# (SIGTERM from systemd timeout, set -e abort mid-build, OOM kill, etc.).
# NOTE: Per O-05 lock-persistence policy the lock is deliberately NOT removed
# on error — it stays so the operator can see a previous attempt failed before
# allowing another auto-rollback cycle. The trap exists purely to emit a
# visible journal message; without it a mid-run death is completely silent.
cleanup_lock_on_error() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]] && [[ -f "$ROLLBACK_LOCK" ]]; then
        echo "[ROLLBACK-ERROR] process exited with code $exit_code; lock preserved at $ROLLBACK_LOCK for operator review" >&2
        echo "[ROLLBACK-ERROR] to retry after investigating: sudo rm $ROLLBACK_LOCK && sudo systemctl start livos-rollback.service" >&2
    fi
}
trap cleanup_lock_on_error EXIT

# ── Read previous SHA ──────────────────────────────────────────────────────
if [[ ! -f "$PREV_SHA_FILE" ]]; then
    echo "[ROLLBACK-ABORT] first deploy ever, no previous SHA to revert to."
    echo "[ROLLBACK-ABORT] $PREV_SHA_FILE not found."
    echo "[ROLLBACK-ABORT] livinityd is crash-looping but there is no rollback target."
    echo "[ROLLBACK-ABORT] Operator must investigate: journalctl -u livos -n 100"
    exit 1
fi
PREV_SHA=$(tr -d '[:space:]' < "$PREV_SHA_FILE")
CURRENT_SHA=$(tr -d '[:space:]' < "$CURRENT_SHA_FILE" 2>/dev/null || echo "unknown")
if [[ -z "$PREV_SHA" ]]; then
    echo "[ROLLBACK-ABORT] $PREV_SHA_FILE is empty — refusing to checkout empty SHA."
    exit 1
fi
echo "[ROLLBACK] reverting from $CURRENT_SHA to $PREV_SHA"

# ── Inline precheck (R-04 mitigation: don't half-rollback on degraded host) ─
# Duplicated from precheck-block.sh inline for hard isolation — sourcing the
# block file would mean rollback depends on a file in /opt/livos/ that the
# very SHA we're rolling back from might have broken.
avail_gb=$(df -BG -P /opt/livos 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4+0}' || echo 0)
if (( avail_gb < 2 )); then
    echo "[ROLLBACK-ABORT] insufficient disk space on /opt/livos (need >=2GB, have ${avail_gb}GB)"
    exit 1
fi
if ! probe=$(mktemp -p /opt/livos .rollback-precheck-XXXXXX 2>/dev/null); then
    echo "[ROLLBACK-ABORT] /opt/livos is not writable — cannot rollback"
    exit 1
fi
rm -f "$probe"
curl_exit=0
curl -fsI -m 5 https://api.github.com/repos/utopusc/livinity-io >/dev/null 2>&1 || curl_exit=$?
if (( curl_exit != 0 )); then
    echo "[ROLLBACK-ABORT] GitHub api.github.com unreachable (curl exit $curl_exit) — cannot fetch previous SHA"
    exit 1
fi

# ── Clone + checkout previous SHA (per O-01 lock decision) ─────────────────
TEMP_DIR="/tmp/livinity-rollback-$$"
rm -rf "$TEMP_DIR"
echo "[ROLLBACK] cloning into $TEMP_DIR"
git clone --no-checkout "$REPO_URL" "$TEMP_DIR"
echo "[ROLLBACK] fetching previous SHA $PREV_SHA"
if ! git -C "$TEMP_DIR" fetch --depth=1 origin "$PREV_SHA" 2>/dev/null; then
    echo "[ROLLBACK] depth-1 fetch failed; falling back to full branch fetch"
    git -C "$TEMP_DIR" fetch origin 2>/dev/null || git -C "$TEMP_DIR" fetch --unshallow 2>/dev/null || true
fi
if ! git -C "$TEMP_DIR" checkout "$PREV_SHA" 2>&1; then
    echo "[ROLLBACK-ABORT] could not checkout $PREV_SHA after fetch — SHA may not be reachable from any branch tip (force-push?); aborting" >&2
    exit 1
fi

# ── Rsync source files (mirrors update.sh) ─────────────────────────────────
echo "[ROLLBACK] rsyncing livinityd source"
rsync -a --delete \
    "$TEMP_DIR/livos/packages/livinityd/source/" \
    "$LIVOS_DIR/packages/livinityd/source/"

echo "[ROLLBACK] rsyncing UI source"
rsync -a --delete \
    "$TEMP_DIR/livos/packages/ui/src/" \
    "$LIVOS_DIR/packages/ui/src/"

echo "[ROLLBACK] rsyncing config package"
rsync -a --delete \
    "$TEMP_DIR/livos/packages/config/src/" \
    "$LIVOS_DIR/packages/config/src/" 2>/dev/null || true

echo "[ROLLBACK] rsyncing nexus packages"
rsync -a --delete \
    "$TEMP_DIR/nexus/packages/" \
    "$NEXUS_DIR/packages/"

# Update package manifests
cp "$TEMP_DIR/livos/package.json" "$LIVOS_DIR/package.json"
cp "$TEMP_DIR/livos/pnpm-lock.yaml" "$LIVOS_DIR/pnpm-lock.yaml" 2>/dev/null || true

# ── Inline verify_build helper (mirrors Phase 31 BUILD-01) ──────────────────
verify_build() {
    local pkg="$1"
    local outdir="$2"
    if [[ ! -d "$outdir" ]] || [[ -z "$(find "$outdir" -type f 2>/dev/null | head -1)" ]]; then
        echo "[ROLLBACK-ABORT] BUILD-FAIL: $pkg produced empty $outdir during rollback"
        exit 1
    fi
    echo "[ROLLBACK-VERIFY] $pkg dist OK ($outdir)"
}

# ── Install + build (mirrors update.sh shape) ──────────────────────────────
echo "[ROLLBACK] pnpm install"
cd "$LIVOS_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "[ROLLBACK] npm install (nexus)"
cd "$NEXUS_DIR"
npm install --no-audit --no-fund 2>&1 | tail -5

echo "[ROLLBACK] building @livos/config"
cd "$LIVOS_DIR"
pnpm --filter @livos/config build 2>&1 | tail -5
verify_build "@livos/config" "$LIVOS_DIR/packages/config/dist"

echo "[ROLLBACK] building @livos/ui"
pnpm --filter ui build 2>&1 | tail -5
verify_build "@livos/ui" "$LIVOS_DIR/packages/ui/dist"

echo "[ROLLBACK] building @nexus/core"
cd "$NEXUS_DIR/packages/core"
npx tsc 2>&1 | tail -5
cd "$NEXUS_DIR"
verify_build "@nexus/core" "$NEXUS_DIR/packages/core/dist"

echo "[ROLLBACK] building @nexus/worker"
cd "$NEXUS_DIR/packages/worker"
npx tsc 2>&1 | tail -5
cd "$NEXUS_DIR"
verify_build "@nexus/worker" "$NEXUS_DIR/packages/worker/dist"

echo "[ROLLBACK] building @nexus/mcp-server"
cd "$NEXUS_DIR/packages/mcp-server"
npx tsc 2>&1 | tail -5
cd "$NEXUS_DIR"
verify_build "@nexus/mcp-server" "$NEXUS_DIR/packages/mcp-server/dist"

if [[ -d "$NEXUS_DIR/packages/memory" ]]; then
    echo "[ROLLBACK] building @nexus/memory"
    cd "$NEXUS_DIR/packages/memory"
    npm run build 2>&1 | tail -5
    cd "$NEXUS_DIR"
    verify_build "@nexus/memory" "$NEXUS_DIR/packages/memory/dist"
fi

# ── Multi-dir dist-copy (mirrors Phase 31 BUILD-02) ────────────────────────
echo "[ROLLBACK] copying nexus core dist into all pnpm-store @nexus+core* dirs"
NEXUS_CORE_DIST_SRC="$NEXUS_DIR/packages/core/dist"
COPY_COUNT=0
for store_dir in /opt/livos/node_modules/.pnpm/@nexus+core*/; do
    [[ -d "$store_dir" ]] || continue
    target_parent="${store_dir}node_modules/@nexus/core"
    target="${target_parent}/dist"
    mkdir -p "$target_parent"
    rm -rf "$target"
    cp -r "$NEXUS_CORE_DIST_SRC" "$target"
    if [[ -z "$(find "$target" -type f 2>/dev/null | head -1)" ]]; then
        echo "[ROLLBACK-ABORT] DIST-COPY-FAIL: post-copy target $target is empty"
        exit 1
    fi
    COPY_COUNT=$((COPY_COUNT + 1))
done
echo "[ROLLBACK] nexus core dist copied to $COPY_COUNT pnpm-store dir(s)"
if (( COPY_COUNT == 0 )); then
    echo "[ROLLBACK-ABORT] no @nexus+core* dirs found in pnpm-store — livinityd import will fail; aborting rather than restart with stale dist" >&2
    exit 1
fi

# ── Write new SHA + history JSON ───────────────────────────────────────────
echo "$PREV_SHA" > "$CURRENT_SHA_FILE"
chmod 644 "$CURRENT_SHA_FILE"

END_TS=$(date -u +%s)
END_TS_MS=$(date -u +%s%3N 2>/dev/null || echo $((END_TS * 1000)))
DURATION_MS=$((END_TS_MS - START_TS_MS))

cat > "${HISTORY_DIR}/${START_ISO_FS}-rollback.json" <<JSON
{
  "timestamp": "${START_ISO_JSON}",
  "status": "rolled-back",
  "from_sha": "${CURRENT_SHA}",
  "to_sha": "${PREV_SHA}",
  "reason": "3-crash-loop",
  "duration_ms": ${DURATION_MS},
  "log_path": "${LOG_FILE}"
}
JSON
chmod 644 "${HISTORY_DIR}/${START_ISO_FS}-rollback.json"
echo "[ROLLBACK] history JSON written: ${START_ISO_FS}-rollback.json"

# ── Restart services (per O-02 lock: only these 4) ─────────────────────────
echo "[ROLLBACK] resetting failed state on livos.service"
systemctl reset-failed livos.service || true

echo "[ROLLBACK] restarting livos liv-core liv-worker liv-memory"
systemctl restart livos liv-core liv-worker liv-memory

# ── Cleanup ────────────────────────────────────────────────────────────────
rm -f "$ROLLBACK_LOCK"
rm -rf "$TEMP_DIR"

echo "[ROLLBACK-OK] reverted to $PREV_SHA in ${DURATION_MS}ms"
exit 0
