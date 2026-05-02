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
# Re-exec into a transient systemd .scope under system.slice so we survive the
# livos restart. Idempotency guard via LIVOS_UPDATE_SCOPED env var.
# IMPORTANT: must come BEFORE Phase 33 tee setup so the new scope owns the log fd.
if [[ -z "${LIVOS_UPDATE_SCOPED:-}" ]] && command -v systemd-run >/dev/null 2>&1 && [[ $EUID -eq 0 ]]; then
    export LIVOS_UPDATE_SCOPED=1
    exec systemd-run --scope --collect --quiet \
        --unit="livos-update-$$-$(date +%s)" \
        --description="LivOS Update (cgroup-escaped)" \
        -- "$0" "$@"
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

phase33_finalize() {
    local exit_code=$?
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

    local json_path="${HISTORY_DIR}/${LIVOS_UPDATE_START_ISO_FS}-${status}.json"
    cat > "$json_path" <<JSON
{
  "timestamp": "${LIVOS_UPDATE_START_ISO_JSON}",
  "status": "${status}"${from_field}${to_field},
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
NEXUS_DIR="/opt/nexus"
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

# Phase 32 REL-01 call site
precheck

# ── Step 1: Pull latest code from GitHub ──────────────────
step "Pulling latest code"

TEMP_DIR="/tmp/livinity-update-$$"
rm -rf "$TEMP_DIR"

info "Cloning latest from GitHub..."
git clone --depth 1 "$REPO_URL" "$TEMP_DIR" || fail "Failed to clone repository"
# ── Phase 33 OBS-01 prep: capture target SHA for log filename rename ──
LIVOS_UPDATE_TO_SHA=$(git -C "$TEMP_DIR" rev-parse HEAD 2>/dev/null || echo "")

ok "Latest code fetched"

# ── Step 2: Update LivOS source files ─────────────────────
step "Updating LivOS source files"

# Update livinityd source (tsx runs directly, no compile needed)
info "Updating livinityd source..."
rsync -a --delete \
    "$TEMP_DIR/livos/packages/livinityd/source/" \
    "$LIVOS_DIR/packages/livinityd/source/"
ok "livinityd source updated"

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
    ok "update.sh updated (next run will use new version)"
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

# ── Step 3: Update Nexus source files ─────────────────────
step "Updating Nexus source files"

if [[ -d "$NEXUS_DIR" ]]; then
    # Update nexus packages source
    for pkg in core worker mcp-server memory; do
        if [[ -d "$TEMP_DIR/nexus/packages/$pkg" ]]; then
            info "Updating nexus/$pkg..."
            rsync -a --delete \
                "$TEMP_DIR/nexus/packages/$pkg/" \
                "$NEXUS_DIR/packages/$pkg/"
        fi
    done

    # Update nexus root files
    cp "$TEMP_DIR/nexus/package.json" "$NEXUS_DIR/package.json"
    cp "$TEMP_DIR/nexus/package-lock.json" "$NEXUS_DIR/package-lock.json" 2>/dev/null || true
    cp "$TEMP_DIR/nexus/tsconfig.json" "$NEXUS_DIR/tsconfig.json" 2>/dev/null || true

    ok "Nexus source updated"
else
    info "Nexus not found, copying fresh..."
    cp -r "$TEMP_DIR/nexus" "$NEXUS_DIR"
    ok "Nexus installed fresh"
fi

# ── Step 4: Install dependencies ──────────────────────────
step "Installing dependencies"

info "Installing LivOS dependencies..."
cd "$LIVOS_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "LivOS dependencies installed"

if [[ -d "$NEXUS_DIR" ]]; then
    info "Installing Nexus dependencies..."
    cd "$NEXUS_DIR"
    npm install --production=false 2>/dev/null || npm install
    ok "Nexus dependencies installed"
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

# Build Nexus packages
if [[ -d "$NEXUS_DIR" ]]; then
    info "Building Nexus core..."
    cd "$NEXUS_DIR/packages/core" && npx tsc && cd "$NEXUS_DIR"
verify_build "@nexus/core" "/opt/nexus/packages/core/dist"
    ok "Nexus core built"

    # Build memory service
    if [[ -d "$NEXUS_DIR/packages/memory" ]]; then
        info "Building Nexus memory..."
        cd "$NEXUS_DIR/packages/memory"
        npm run build 2>&1 | tail -3
        cd "$NEXUS_DIR"
        ok "Nexus memory built"
    fi

    info "Building Nexus worker..."
    cd "$NEXUS_DIR/packages/worker" && npx tsc 2>/dev/null && cd "$NEXUS_DIR" || cd "$NEXUS_DIR"
verify_build "@nexus/worker" "/opt/nexus/packages/worker/dist"

    info "Building Nexus mcp-server..."
    cd "$NEXUS_DIR/packages/mcp-server" && npx tsc 2>/dev/null && cd "$NEXUS_DIR" || cd "$NEXUS_DIR"
verify_build "@nexus/mcp-server" "/opt/nexus/packages/mcp-server/dist"

    # Copy nexus dist to pnpm symlink location
    # ── Phase 31 BUILD-02: multi-dir dist-copy loop ──
    # Replaces the `find ... | head -1` single-target bug (BACKLOG 999.5b).
    # Copies @nexus/core dist into ALL pnpm-store resolution dirs so livinityd
    # always picks up fresh dist regardless of which dir its symlink resolves to.
    NEXUS_CORE_DIST_SRC="$NEXUS_DIR/packages/core/dist"
    if [[ ! -d "$NEXUS_CORE_DIST_SRC" ]] || [[ -z "$(find "$NEXUS_CORE_DIST_SRC" -type f 2>/dev/null | head -1)" ]]; then
        echo "DIST-COPY-FAIL: source $NEXUS_CORE_DIST_SRC is empty — nexus core build did not emit" >&2
        exit 1
    fi
    COPY_COUNT=0
    for store_dir in /opt/livos/node_modules/.pnpm/@nexus+core*/; do
        [[ -d "$store_dir" ]] || continue
        target_parent="${store_dir}node_modules/@nexus/core"
        target="${target_parent}/dist"
        mkdir -p "$target_parent"
        rm -rf "$target"
        cp -r "$NEXUS_CORE_DIST_SRC" "$target"
        if [[ -z "$(find "$target" -type f 2>/dev/null | head -1)" ]]; then
            echo "DIST-COPY-FAIL: post-copy target $target is empty" >&2
            exit 1
        fi
        COPY_COUNT=$((COPY_COUNT + 1))
        echo "[VERIFY] nexus core dist copied to $store_dir"
    done
    if [[ "$COPY_COUNT" -eq 0 ]]; then
        echo "DIST-COPY-FAIL: no @nexus+core* dirs found under /opt/livos/node_modules/.pnpm/" >&2
        exit 1
    fi
    ok "Nexus dist linked to $COPY_COUNT pnpm-store resolution dir(s)"
fi

# ── Step 6: Update gallery cache ──────────────────────────
step "Updating gallery cache"

GALLERY_CACHE_DIR=$(find "$LIVOS_DIR/data/app-stores/" -maxdepth 1 -name '*livinity-apps*' -type d 2>/dev/null | head -1)
if [[ -n "$GALLERY_CACHE_DIR" ]] && [[ -d "$GALLERY_CACHE_DIR/.git" ]]; then
    info "Updating gallery cache at $GALLERY_CACHE_DIR..."
    cd "$GALLERY_CACHE_DIR"
    git config --global --add safe.directory "$GALLERY_CACHE_DIR" 2>/dev/null || true
    git fetch origin 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || git reset --hard origin/master 2>/dev/null || warn "Gallery cache update failed"
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
chown -R root:root "$NEXUS_DIR" 2>/dev/null || true

ok "Permissions fixed"

# ── Step 8: Restart services ─────────────────────────────
step "Restarting services"

systemctl daemon-reload

info "Restarting livos..."
systemctl restart livos.service
sleep 2

info "Restarting liv-core..."
systemctl restart liv-core.service
sleep 1

info "Restarting liv-worker..."
systemctl restart liv-worker.service 2>/dev/null || true

info "Restarting liv-memory..."
systemctl restart liv-memory.service 2>/dev/null || true

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
else
    warn "TEMP_DIR/.git not found; skipping .deployed-sha write"
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
echo -e "    - Nexus AI packages (core, worker, mcp-server)"
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
