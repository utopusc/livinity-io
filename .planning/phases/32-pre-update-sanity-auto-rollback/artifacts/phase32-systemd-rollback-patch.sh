#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Phase 32 patch for /opt/livos/update.sh + systemd:
#
#   REL-01 (Plan 32-01): precheck() + record_previous_sha() helpers spliced
#                        into /opt/livos/update.sh. precheck() refuses to start
#                        if disk < 2GB / /opt/livos not writable / GitHub
#                        unreachable; record_previous_sha() rotates
#                        .deployed-sha → .deployed-sha.previous before update.sh
#                        writes the new SHA.
#
#   REL-02 (Plan 32-02): livos.service drop-in (auto-rollback.conf) +
#                        livos-rollback.service oneshot unit +
#                        /opt/livos/livos-rollback.sh orchestrator. Together
#                        these deliver systemd-level auto-rollback when
#                        livinityd crash-loops 3 starts within 5 minutes.
#
# Idempotent: re-runs short-circuit on the 5 marker constants below.
# Apply via:  ssh <host> 'sudo bash -s' < phase32-systemd-rollback-patch.sh
#
# Backup safety: writes /opt/livos/update.sh.pre-phase32 BEFORE any change.
# Final `bash -n` syntax check on the patched output. On syntax fail, restores
# from backup + exit 1 (Phase 31 lesson — never leave update.sh half-patched).
#
# systemd version detection (per O-05): if `systemctl --version` < 254 the
# auto-rollback.conf drop-in is SKIPPED with a WARN line. Other artifacts
# (precheck patches, livos-rollback.sh, livos-rollback.service) install
# regardless — they're version-independent. Operator on old systemd loses
# auto-rollback semantics but can still invoke `systemctl start
# livos-rollback.service` manually.
#
# Caller responsible for sudo. Script does NOT call `sudo` internally.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

UPDATE_SH="/opt/livos/update.sh"
DROPIN_DIR="/etc/systemd/system/livos.service.d"
DROPIN_PATH="$DROPIN_DIR/auto-rollback.conf"
ROLLBACK_UNIT="/etc/systemd/system/livos-rollback.service"
ROLLBACK_SH_PATH="/opt/livos/livos-rollback.sh"
HISTORY_DIR="/opt/livos/data/update-history"

# ──────────────────────────────────────────────────────────────────────────────
# Marker constants — MUST match the embedded artifact bodies VERBATIM (including
# the U+2500 box-drawing chars). The `grep -qF` short-circuits depend on these
# being byte-identical to the markers inside the HEREDOC bodies further down.
# ──────────────────────────────────────────────────────────────────────────────
MARKER_PRECHECK="# ── Phase 32 REL-01: precheck ──"
MARKER_SHA_ROT="# ── Phase 32 REL-02 prep: SHA rotation ──"
MARKER_DROPIN="# ── Phase 32 REL-02: livos.service drop-in ──"
MARKER_UNIT="# ── Phase 32 REL-02: livos-rollback.service oneshot ──"
MARKER_ROLLBACK="# ── Phase 32 REL-02: livos-rollback.sh ──"

# Call-site markers (distinct from helper-body markers — these guard the
# precheck and record_previous_sha invocation lines, not the function defs).
PRECHECK_CALL_MARKER='# Phase 32 REL-01 call site'
SHA_ROT_CALL_MARKER='# Phase 32 REL-02 prep call site'

if [[ ! -f "$UPDATE_SH" ]]; then
    echo "ERROR: $UPDATE_SH not found on this host" >&2
    exit 1
fi

# ── Snapshot original (Phase 31 precedent — keep .pre-phaseNN backup) ─────────
if [[ ! -f "$UPDATE_SH.pre-phase32" ]]; then
    cp "$UPDATE_SH" "$UPDATE_SH.pre-phase32"
    echo "Backup written: $UPDATE_SH.pre-phase32"
else
    echo "Backup already exists: $UPDATE_SH.pre-phase32 (re-run safe)"
fi

# Ensure history dir exists so first-ever rollback / precheck-fail row has a
# writable target. Phase 33 will also touch this — idempotent.
mkdir -p "$HISTORY_DIR"

# ──────────────────────────────────────────────────────────────────────────────
# systemd version detection (O-05 lock)
#
# RestartMode=direct was introduced in systemd v254. On older systemd the
# directive is silently ignored and OnFailure= fires on every restart cycle
# (Ubuntu 24.04 / systemd 255 trap per 32-RESEARCH). Refuse to install the
# drop-in on those hosts — operator gets degraded rollback (manual invoke
# only), all other artifacts install normally.
# ──────────────────────────────────────────────────────────────────────────────
SYSTEMD_VER_RAW=$(systemctl --version 2>/dev/null | head -1 | awk '{print $2}' || echo "0")
SYSTEMD_VER=$(echo "$SYSTEMD_VER_RAW" | sed 's/[^0-9].*//')
SYSTEMD_VER=${SYSTEMD_VER:-0}
INSTALL_DROPIN=true
if (( SYSTEMD_VER < 254 )); then
    echo "WARN: systemd v${SYSTEMD_VER_RAW} < 254 — RestartMode=direct unsupported, skipping drop-in install (rollback semantics will misfire on every restart)"
    echo "WARN: precheck patches + livos-rollback.sh + livos-rollback.service will still install — operator can invoke rollback manually."
    INSTALL_DROPIN=false
else
    echo "INFO: systemd v${SYSTEMD_VER_RAW} (>= 254) — auto-rollback.conf drop-in will install."
fi

# ──────────────────────────────────────────────────────────────────────────────
# Patch 1/6: REL-01 — splice precheck() + record_previous_sha() helper bodies
#                     into update.sh after the fail() helper.
# ──────────────────────────────────────────────────────────────────────────────
if grep -qF "$MARKER_PRECHECK" "$UPDATE_SH"; then
    echo "ALREADY-PATCHED (REL-01 helpers): precheck + record_previous_sha present in update.sh"
else
    ANCHOR_LINE=$(grep -n '^fail()' "$UPDATE_SH" | head -1 | cut -d: -f1)
    if [[ -z "$ANCHOR_LINE" ]]; then
        echo "ERROR: cannot find fail() helper to anchor precheck insertion" >&2
        exit 1
    fi
    INSERT_AT=$((ANCHOR_LINE + 1))

    PATCH_BLOCK=$(mktemp)
    cat <<'EOPRECHECK' > "$PATCH_BLOCK"

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
    if [[ -z "$fail_reason" ]]; then
        local curl_exit=0
        curl -fsI -m 5 https://api.github.com/repos/utopusc/livinity-io >/dev/null 2>&1 || curl_exit=$?
        if (( curl_exit != 0 )); then
            fail_reason="PRECHECK-FAIL: GitHub api.github.com unreachable (curl exit ${curl_exit} — check network or rate-limit)"
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

EOPRECHECK

    awk -v line="$INSERT_AT" -v patchfile="$PATCH_BLOCK" '
        BEGIN { while ((getline pl < patchfile) > 0) patch = patch pl ORS }
        NR == line { printf "%s", patch }
        { print }
    ' "$UPDATE_SH" > "$UPDATE_SH.new"
    mv "$UPDATE_SH.new" "$UPDATE_SH"
    chmod +x "$UPDATE_SH"
    rm -f "$PATCH_BLOCK"
    echo "PATCH-OK (REL-01 helpers): precheck + record_previous_sha inserted at line $INSERT_AT"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Patch 2/6: REL-01 call-site — invoke precheck after `ok "Pre-flight passed"`
# ──────────────────────────────────────────────────────────────────────────────
if grep -qF "$PRECHECK_CALL_MARKER" "$UPDATE_SH"; then
    echo "ALREADY-PATCHED (REL-01 call): precheck() invocation already wired"
else
    PREFLIGHT_LINE=$(grep -n 'ok "Pre-flight passed"' "$UPDATE_SH" | head -1 | cut -d: -f1)
    if [[ -z "$PREFLIGHT_LINE" ]]; then
        echo "ERROR: cannot find 'ok \"Pre-flight passed\"' anchor for precheck call insertion" >&2
        exit 1
    fi
    INSERT_AT=$((PREFLIGHT_LINE + 1))
    awk -v line="$INSERT_AT" -v marker="$PRECHECK_CALL_MARKER" '
        NR == line {
            print ""
            print marker
            print "precheck"
        }
        { print }
    ' "$UPDATE_SH" > "$UPDATE_SH.new"
    mv "$UPDATE_SH.new" "$UPDATE_SH"
    chmod +x "$UPDATE_SH"
    echo "PATCH-OK (REL-01 call): precheck() invocation inserted after line $PREFLIGHT_LINE"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Patch 3/6: REL-02 prep call-site — invoke record_previous_sha BEFORE the
#            existing `git rev-parse HEAD > /opt/livos/.deployed-sha` line.
# ──────────────────────────────────────────────────────────────────────────────
if grep -qF "$SHA_ROT_CALL_MARKER" "$UPDATE_SH"; then
    echo "ALREADY-PATCHED (REL-02 SHA-rot call): record_previous_sha() invocation already wired"
else
    SHA_LINE=$(grep -n 'rev-parse HEAD > /opt/livos/.deployed-sha' "$UPDATE_SH" | head -1 | cut -d: -f1 || true)
    if [[ -z "$SHA_LINE" ]]; then
        echo "WARN: cannot find SHA-write anchor — record_previous_sha() NOT wired (manual fix needed)"
    else
        awk -v line="$SHA_LINE" -v marker="$SHA_ROT_CALL_MARKER" '
            NR == line {
                print "    " marker
                print "    record_previous_sha"
            }
            { print }
        ' "$UPDATE_SH" > "$UPDATE_SH.new"
        mv "$UPDATE_SH.new" "$UPDATE_SH"
        chmod +x "$UPDATE_SH"
        echo "PATCH-OK (REL-02 SHA-rot call): record_previous_sha() invocation inserted before line $SHA_LINE"
    fi
fi

# ──────────────────────────────────────────────────────────────────────────────
# Patch 4/6: REL-02 — install /opt/livos/livos-rollback.sh (mode 0755, root)
# ──────────────────────────────────────────────────────────────────────────────
if [[ -f "$ROLLBACK_SH_PATH" ]] && grep -qF "$MARKER_ROLLBACK" "$ROLLBACK_SH_PATH"; then
    echo "ALREADY-PATCHED (REL-02 rollback.sh): $ROLLBACK_SH_PATH present"
else
    cat <<'EOROLLBACK' > "$ROLLBACK_SH_PATH"
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
    echo "[ROLLBACK] depth-1 fetch failed; falling back to --unshallow"
    git -C "$TEMP_DIR" fetch --unshallow
fi
git -C "$TEMP_DIR" checkout "$PREV_SHA"

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
EOROLLBACK
    chmod 0755 "$ROLLBACK_SH_PATH"
    chown root:root "$ROLLBACK_SH_PATH" 2>/dev/null || true
    echo "PATCH-OK (REL-02 rollback.sh): wrote $ROLLBACK_SH_PATH (mode 0755)"
    if ! bash -n "$ROLLBACK_SH_PATH"; then
        echo "ERROR: $ROLLBACK_SH_PATH failed bash -n syntax check — removing" >&2
        rm -f "$ROLLBACK_SH_PATH"
        exit 1
    fi
fi

# ──────────────────────────────────────────────────────────────────────────────
# Patch 5/6: REL-02 — install /etc/systemd/system/livos-rollback.service
# ──────────────────────────────────────────────────────────────────────────────
if [[ -f "$ROLLBACK_UNIT" ]] && grep -qF "$MARKER_UNIT" "$ROLLBACK_UNIT"; then
    echo "ALREADY-PATCHED (REL-02 unit): $ROLLBACK_UNIT present"
else
    cat <<'EOUNIT' > "$ROLLBACK_UNIT"
# ── Phase 32 REL-02: livos-rollback.service oneshot ──
# Installed by phase32-systemd-rollback-patch.sh into:
#   /etc/systemd/system/livos-rollback.service
# Idempotency marker (Plan 32-03 grep-checks this exact line):
#   # ── Phase 32 REL-02: livos-rollback.service oneshot ──
[Unit]
Description=LivOS auto-rollback to previous deployed SHA
# CRITICAL: do NOT add OnFailure= here — rollback failure is hard-stop for
# operator investigation, not another rollback attempt (would risk infinite
# loops; mitigated also by .rollback-attempted lock in livos-rollback.sh).
# CRITICAL: do NOT add Requires=livos.service — would create circular dep.

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
EOUNIT
    chmod 0644 "$ROLLBACK_UNIT"
    echo "PATCH-OK (REL-02 unit): wrote $ROLLBACK_UNIT"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Patch 6/6: REL-02 — install drop-in (skipped if systemd < 254 per O-05)
# ──────────────────────────────────────────────────────────────────────────────
if [[ "$INSTALL_DROPIN" == "true" ]]; then
    if [[ -f "$DROPIN_PATH" ]] && grep -qF "$MARKER_DROPIN" "$DROPIN_PATH"; then
        echo "ALREADY-PATCHED (REL-02 drop-in): $DROPIN_PATH present"
    else
        mkdir -p "$DROPIN_DIR"
        cat <<'EODROPIN' > "$DROPIN_PATH"
# ── Phase 32 REL-02: livos.service drop-in ──
# Installed by phase32-systemd-rollback-patch.sh into:
#   /etc/systemd/system/livos.service.d/auto-rollback.conf
# Idempotency marker (Plan 32-03 grep-checks this exact line):
#   # ── Phase 32 REL-02: livos.service drop-in ──
#
# Behavior: when livinityd crash-loops (>=3 starts within 300s), systemd marks
# livos.service `failed` and triggers livos-rollback.service via OnFailure=.
# RestartMode=direct prevents OnFailure= from misfiring on every restart cycle
# (systemd v255+ trap — see 32-RESEARCH Domain Background).
[Unit]
StartLimitIntervalSec=300
StartLimitBurst=3
OnFailure=livos-rollback.service

[Service]
RestartMode=direct
EODROPIN
        chmod 0644 "$DROPIN_PATH"
        echo "PATCH-OK (REL-02 drop-in): wrote $DROPIN_PATH"
    fi
else
    echo "SKIPPED (REL-02 drop-in): systemd v${SYSTEMD_VER_RAW} too old (need >=254)"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Reload systemd + enable rollback unit
# ──────────────────────────────────────────────────────────────────────────────
systemctl daemon-reload
if systemctl enable livos-rollback.service 2>/dev/null; then
    echo "INFO: systemctl daemon-reload + livos-rollback.service enabled"
else
    echo "WARN: systemctl enable livos-rollback.service failed (non-fatal — unit still loadable)"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Final safety net: bash syntax check on patched update.sh
# ──────────────────────────────────────────────────────────────────────────────
if ! bash -n "$UPDATE_SH"; then
    echo "FATAL: patched $UPDATE_SH failed bash syntax check — restoring backup" >&2
    cp "$UPDATE_SH.pre-phase32" "$UPDATE_SH"
    chmod +x "$UPDATE_SH"
    echo "RESTORED: $UPDATE_SH reverted to pre-phase32 backup" >&2
    exit 1
fi

echo
echo "=== PHASE 32 PATCH COMPLETE ==="
echo "Backup:            $UPDATE_SH.pre-phase32"
echo "Patched update.sh: $UPDATE_SH"
echo "rollback.sh:       $ROLLBACK_SH_PATH (mode 0755 root)"
echo "rollback unit:     $ROLLBACK_UNIT"
echo "drop-in:           $DROPIN_PATH (installed=$INSTALL_DROPIN, systemd v${SYSTEMD_VER_RAW})"
echo "history dir:       $HISTORY_DIR"
echo
echo "Markers in update.sh:"
grep -nE "Phase 32 (REL-01|REL-02)" "$UPDATE_SH" | head -10 || true
