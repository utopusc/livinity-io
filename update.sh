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

# ── Step 1b: Phase 93 streaming subsystem apt packages ────
# Idempotent apt-install so existing Mini PC deploys (which never re-ran
# install.sh) pick up the streaming subsystem binaries on next update.
# Locked decision D-93-07: "Install.sh ile bu butun servisler kurulmali"
# applies to both install.sh (fresh) AND update.sh (incremental).
# apt-get install -y -qq is a no-op on already-installed packages.
step "Phase 93: streaming subsystem dependencies"
if [[ -x /usr/bin/apt-get ]] && command -v apt-get >/dev/null 2>&1; then
    info "Ensuring streaming subsystem apt packages are installed..."
    # Phase 100-08-01: xvfb + fluxbox added for dedicated WebApp display :1
    # (D-100-08-A — livinityd spawns Xvfb :1 + fluxbox on boot).
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
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        libva-utils intel-media-va-driver libdrm-intel1 \
        2>&1 | tail -5 || warn "VAAPI userspace install failed — libx264 fallback will be used"

    # Phase 252 portability — luse display-lifecycle + terminal binaries the
    # v44/250-hotfix code now hard-requires but were never on the apt list.
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        xserver-xephyr xterm gnome-terminal x11-utils xclip wmctrl \
        2>&1 | tail -5 || warn "Some luse display/terminal packages failed (non-fatal)"

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

# ── Step 2: Update LivOS source files ─────────────────────
step "Updating LivOS source files"

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

# ── Step 4.6: Phase 225 — liv-assistant install (Phase 223 vendored AionUi v2.1.4) ────
# Re-runs the idempotent installer on every update so the on-box vendored binary +
# systemd unit are guaranteed-fresh. Installer is content-addressed (pinned SHA),
# so on unchanged source this is a sub-second no-op (UPSTREAM.md timestamp preserved,
# tarball cache hit, symlink unchanged). Phase 223-01 contract.
step "Phase 225: liv-assistant install (vendored AionUi v2.1.4)"
_LIV_ASSISTANT_INSTALLER_SRC="$TEMP_DIR/scripts/install-liv-assistant.sh"
# Fallback to on-disk copy (for the rare case TEMP_DIR was pruned mid-run)
if [[ ! -f "$_LIV_ASSISTANT_INSTALLER_SRC" ]]; then
    _LIV_ASSISTANT_INSTALLER_SRC="$LIVOS_DIR/scripts/install-liv-assistant.sh"
fi
if [[ -f "$_LIV_ASSISTANT_INSTALLER_SRC" ]]; then
    if bash "$_LIV_ASSISTANT_INSTALLER_SRC" 2>&1 | tail -10; then
        ok "liv-assistant install ensured (vendored AionUi v2.1.4 at /opt/liv-assistant/current)"
    else
        fail "install-liv-assistant.sh failed — see output above (SHA mismatch / network / disk?)"
    fi
else
    info "scripts/install-liv-assistant.sh not in TEMP_DIR or LIVOS_DIR — skipping (pre-Phase 223-01 deploy)"
fi

# ── Phase 245.2 — Claude Code wrapper for MCP_TIMEOUT ─────────────────────
# aioncore (AionUi backend) sanitizes env when spawning Claude Code child processes,
# dropping any MCP_TIMEOUT set via systemd unit or shell. Without 30s timeout, 5 of 6
# stdio MCPs (luse / liv-system / liv-vault / liv-apps / liv-docker) silently fail
# to register tools during 6× parallel `npx tsx` cold-start. Wrapper script at
# `/home/bruce/.local/bin/claude` exports MCP_TIMEOUT=30000 before exec'ing the real
# claude binary. Idempotent: only re-installs if wrapper missing or stale.
step "Phase 245.2: Claude Code MCP_TIMEOUT wrapper"
_CLAUDE_BIN="/home/bruce/.local/bin/claude"
_CLAUDE_REAL="/home/bruce/.local/share/claude/versions/2.1.148"
_WRAPPER_MARKER="Phase 245.2 wrapper"
if [[ -f "$_CLAUDE_REAL" ]]; then
    _NEEDS_INSTALL=0
    if [[ ! -f "$_CLAUDE_BIN" ]] || ! grep -q "$_WRAPPER_MARKER" "$_CLAUDE_BIN" 2>/dev/null; then
        _NEEDS_INSTALL=1
    fi
    if [[ "$_NEEDS_INSTALL" -eq 1 ]]; then
        # Preserve original symlink if it exists
        if [[ -L "$_CLAUDE_BIN" && ! -L "$_CLAUDE_BIN.real-symlink" ]]; then
            sudo -u bruce mv "$_CLAUDE_BIN" "$_CLAUDE_BIN.real-symlink" 2>/dev/null || true
        fi
        sudo -u bruce tee "$_CLAUDE_BIN" > /dev/null <<'CLAUDE_WRAPPER_EOF'
#!/bin/bash
# Phase 245.2 wrapper — aioncore sanitizes env when spawning Claude Code, dropping MCP_TIMEOUT.
# Without 30s timeout, 5 of 6 stdio MCPs (luse/liv-*) silently fail during cold-start.
export MCP_TIMEOUT=${MCP_TIMEOUT:-30000}
exec /home/bruce/.local/share/claude/versions/2.1.148 "$@"
CLAUDE_WRAPPER_EOF
        sudo -u bruce chmod 755 "$_CLAUDE_BIN"
        ok "Phase 245.2: claude wrapper installed at $_CLAUDE_BIN (MCP_TIMEOUT=30000)"
    else
        ok "Phase 245.2: claude wrapper already in place (idempotent skip)"
    fi
else
    info "Phase 245.2: $_CLAUDE_REAL not present — claude wrapper deferred (run `claude doctor` to install)"
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
for _NAME in "${!_MCP_PATHS[@]}"; do
    _ID=$(curl -s http://localhost:3020/api/mcp/servers 2>/dev/null | \
        python3 -c "import sys,json; d=json.load(sys.stdin); [print(m['id']) for m in d.get('data',[]) if m['name']=='${_NAME}']" 2>/dev/null | head -1)
    if [[ -n "$_ID" ]]; then
        _CURRENT_CMD=$(curl -s "http://localhost:3020/api/mcp/servers/$_ID" 2>/dev/null | \
            python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('transport',{}).get('command',''))" 2>/dev/null)
        if [[ "$_CURRENT_CMD" != "/usr/local/bin/liv-mcp-${_NAME}" ]]; then
            _ENV_JSON='{}'
            if [[ "$_NAME" == "luse" ]]; then
                _ENV_JSON="{\"DISPLAY\":\":1\",\"XAUTHORITY\":\"/run/user/1000/gdm/Xauthority\",\"LIVINITYD_API_URL\":\"http://127.0.0.1:8080\",\"LIV_API_KEY\":\"$(grep -oP 'LIV_API_KEY=\K[^\n]+' /opt/livos/.env 2>/dev/null || echo missing)\",\"LUSE_REDIS_URL\":\"$(grep -oP 'REDIS_URL=\K[^\n]+' /opt/livos/.env 2>/dev/null || echo missing)\",\"LUSE_USER_SLUG\":\"bruce\",\"LUSE_DOMAIN_ROOT\":\"livinity.io\"}"
            else
                _ENV_JSON="{\"LIVINITYD_API_URL\":\"http://127.0.0.1:8080\",\"LIV_API_KEY\":\"$(grep -oP 'LIV_API_KEY=\K[^\n]+' /opt/livos/.env 2>/dev/null || echo missing)\"}"
            fi
            curl -s -X PUT "http://localhost:3020/api/mcp/servers/$_ID" \
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
_CLAUDE_SETTINGS="/home/bruce/.claude/settings.json"
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
    sudo -u bruce mkdir -p /home/bruce/.claude
    echo "$_CLAUDE_SETTINGS_DESIRED" | sudo -u bruce tee "$_CLAUDE_SETTINGS" > /dev/null
    ok "Phase 245.3: settings.json written with 6 MCP wildcard permissions"
fi

# ── Phase 245.3 — liv-assistant restart to pick up settings + wrapper ──────
# Live-applies the 245.2 wrapper + 245.3 settings to any future Claude Code spawns.
# Without restart, in-flight chat sessions keep their pre-fix env/settings.
step "Phase 245.3: liv-assistant restart for MCP fix activation"
if sudo systemctl restart liv-assistant 2>&1; then
    sleep 3
    if sudo systemctl is-active liv-assistant | grep -q '^active'; then
        ok "Phase 245.3: liv-assistant restarted — new chats will see all 6 MCPs"
    else
        warn "Phase 245.3: liv-assistant restart reported active=false — check journalctl"
    fi
else
    warn "Phase 245.3: liv-assistant restart failed (continuing — manual fix may be needed)"
fi

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
step "Phase 203-03: Building liv-claw-os plugin + claw-client"
if [[ -d "$LIVOS_DIR/packages/liv-claw-os" ]]; then
    if (cd "$LIVOS_DIR" && pnpm --filter @livos/liv-claw-os build 2>&1) ; then
        ok "liv-claw-os build complete (claw-plugin dist + claw-client out)"
    else
        warn "liv-claw-os build failed — liv-claw-gateway will fail to boot until plugin bundle exists; check journalctl -u liv-claw-gateway -n 30 after deploy"
    fi
else
    info "liv-claw-os not present in this checkout — skipping (Phase 203 fork not deployed yet)"
fi

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

_LIV_AI_UNIT_SRC="$LIVOS_DIR/../scripts/install/systemd/livos-app-liv-ai.service"
# Fallback to TEMP_DIR location (fresh clone) if the on-disk path isn't there.
if [[ ! -f "$_LIV_AI_UNIT_SRC" && -d "${TEMP_DIR:-}" ]]; then
    _LIV_AI_UNIT_SRC="$TEMP_DIR/scripts/install/systemd/livos-app-liv-ai.service"
fi

if [[ -f "$_LIV_AI_UNIT_SRC" ]]; then
    _LIV_AI_UNIT_DST="/etc/systemd/system/livos-app-liv-ai.service"
    if [[ ! -f "$_LIV_AI_UNIT_DST" ]] || ! cmp -s "$_LIV_AI_UNIT_SRC" "$_LIV_AI_UNIT_DST"; then
        install -m 0644 -o root -g root "$_LIV_AI_UNIT_SRC" "$_LIV_AI_UNIT_DST"
        systemctl daemon-reload
        systemctl enable livos-app-liv-ai.service 2>/dev/null || true
        ok "livos-app-liv-ai.service installed at $_LIV_AI_UNIT_DST"
    else
        ok "livos-app-liv-ai.service already byte-identical"
    fi
else
    info "livos-app-liv-ai.service source not found — skipping install (Caddy /liv-ai-app/* will 502 until unit lands)"
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
    # Ensure the gateway's state dir exists and is bruce-writable
    mkdir -p /opt/livos/data/openclaw 2>/dev/null || true
    if id bruce >/dev/null 2>&1; then
        chown -R bruce:bruce /opt/livos/data/openclaw 2>/dev/null || true
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
            [[ -z "$_OPERATOR_DOMAIN" ]] && _OPERATOR_DOMAIN="bruce.livinity.io"
            info "openclaw config: operator domain resolved = $_OPERATOR_DOMAIN"

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
                        ["https://" + $dom,
                         "http://" + $dom,
                         "wss://" + $dom,
                         "https://livinity.io",
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
                    if id bruce >/dev/null 2>&1; then
                        chown bruce:bruce "$_OPENCLAW_CFG" 2>/dev/null || true
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
    if [[ ! -f "$_LIV_ASSISTANT_UNIT_DST" ]] || ! cmp -s "$_LIV_ASSISTANT_UNIT_SRC" "$_LIV_ASSISTANT_UNIT_DST"; then
        install -m 0644 -o root -g root "$_LIV_ASSISTANT_UNIT_SRC" "$_LIV_ASSISTANT_UNIT_DST"
        systemctl daemon-reload
        systemctl enable liv-assistant.service 2>/dev/null || true
        ok "liv-assistant.service installed at $_LIV_ASSISTANT_UNIT_DST"
    else
        ok "liv-assistant.service already byte-identical"
    fi
else
    info "liv-assistant.service unit source not found — skipping install (the unit may already be installed from a prior Phase 223-05 deploy)"
fi

# ── Phase 202-10: bruce ownership hook (recurring P198/P199/P200/P201 patch) ──
# When update.sh runs as root, rsync + pnpm install + builds end up root-owned.
# livos.service runs as `bruce`, and pnpm-store / .next / dist directories
# end up un-readable on next boot. This was hot-fixed manually on every deploy
# since Phase 198. Folding into update.sh closes the recurring carry-over.
step "Fixing /opt/livos + /opt/liv ownership (bruce:bruce)"
if id bruce >/dev/null 2>&1; then
    chown -R bruce:bruce "$LIVOS_DIR" 2>/dev/null || warn "chown $LIVOS_DIR partial"
    if [[ -d "$LIV_DIR" ]]; then
        chown -R bruce:bruce "$LIV_DIR" 2>/dev/null || warn "chown $LIV_DIR partial"
    fi
    ok "Ownership normalised to bruce:bruce"
else
    info "bruce user absent — skipping ownership normalisation"
fi

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

# Phase 203-03 — restart liv-claw-gateway (openclaw runtime on 127.0.0.1:18789).
# Guarded so legacy deploys without the unit installed are no-ops. Caddy
# `handle /liv-ai-app/*` will steer traffic to :18789 once D-203-05 routing
# lands (Plan 203-12 deploy walk).
if [[ -f /etc/systemd/system/liv-claw-gateway.service || -f /usr/lib/systemd/system/liv-claw-gateway.service ]]; then
    systemctl enable liv-claw-gateway.service 2>/dev/null || true
    if systemctl restart liv-claw-gateway.service 2>/dev/null; then
        ok "Restarted liv-claw-gateway (openclaw + plugin :18789)"
    else
        warn "liv-claw-gateway restart failed — check journalctl -u liv-claw-gateway -n 30"
    fi
else
    info "liv-claw-gateway.service not installed yet — pre-203-03 deploy; run scripts/install/systemd-units-install.sh as root to enable"
fi

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
    _LIV_ASSISTANT_UNIT_SRC="$TEMP_DIR/systemd/liv-assistant.service"
    if [[ -f "$_LIV_ASSISTANT_UNIT_SRC" ]]; then
        if ! cmp -s "$_LIV_ASSISTANT_UNIT_SRC" /etc/systemd/system/liv-assistant.service 2>/dev/null; then
            install -m 0644 -o root -g root "$_LIV_ASSISTANT_UNIT_SRC" /etc/systemd/system/liv-assistant.service
            systemctl daemon-reload 2>/dev/null || true
            ok "liv-assistant.service unit synced from repo + daemon-reload (GC-E)"
        else
            info "liv-assistant.service unit unchanged"
        fi
    else
        info "systemd/liv-assistant.service not in TEMP_DIR — skipping unit sync (pre-Phase 253 clone)"
    fi

    systemctl enable liv-assistant.service 2>/dev/null || true
    if systemctl restart liv-assistant.service 2>/dev/null; then
        ok "Restarted liv-assistant (AionUi WebUI :3020)"
    else
        warn "liv-assistant restart failed — check journalctl -u liv-assistant -n 30"
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
        fail "liv-assistant health probe FAILED (http://127.0.0.1:3020/api/auth/status did not return 200/204 within 5s). Deploy aborted."
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
    info "Probing https://bruce.livinity.io/liv/api/auth/status via --resolve loopback (5s timeout)..."
    _LIV_PROXY_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
        --max-time 5 \
        --resolve bruce.livinity.io:443:127.0.0.1 \
        -k \
        https://bruce.livinity.io/liv/api/auth/status 2>/dev/null || echo '000')"
    if [[ "$_LIV_PROXY_CODE" =~ ^(200|204)$ ]]; then
        ok "/liv proxy smoke = HTTP $_LIV_PROXY_CODE OK (bruce.livinity.io/liv/api/auth/status → 127.0.0.1:3020)"
    else
        # Collect diagnostics before aborting (mirrors Phase 225-01 Step C diagnostic pattern).
        warn "/liv proxy smoke non-2xx (got HTTP $_LIV_PROXY_CODE); collecting diagnostics..."
        curl -sS -o /dev/null -w 'HTTP %{http_code} (time %{time_total}s)\n' --max-time 5 \
            --resolve bruce.livinity.io:443:127.0.0.1 -k \
            https://bruce.livinity.io/liv/api/auth/status 2>&1 || true
        # Show the Caddy snippet path it should have read.
        ls -la /etc/caddy/conf.d/liv-assistant.caddy 2>&1 || true
        # Show caddy's most recent errors.
        journalctl -u caddy -n 20 --no-pager 2>/dev/null || true
        fail "/liv proxy smoke FAILED (https://bruce.livinity.io/liv/api/auth/status returned $_LIV_PROXY_CODE, expected 200/204). Deploy aborted."
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
echo -e "    - Liv AI packages (core, worker, mcp-server)"
echo -e "    - liv-assistant (AionUi WebUI, vendored v2.1.4, port 3020)"
echo -e "    - Caddy /liv reverse-proxy (livinityd-emitted; bruce.livinity.io/liv → :3020, iframe CSP override) [Phase 226-04]"
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
