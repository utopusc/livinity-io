#!/usr/bin/env bash
# scripts/install.sh
# LivOS one-shot installer. Dispatches to mode-cloud.sh, mode-local-lan.sh, or
# mode-hybrid.sh based on --mode flag.
#
# Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
#
# Source: 104-RESEARCH.md §Pattern 5 (Sentry-style sourced helpers).
# D-104-INSTALL-ENTRY: single entry point. D-104-DEFAULT-MODE: default = hybrid.
# D-104-NO-PROD-IMPACT: this is a NEW file; the existing livos/install.sh stays
# unchanged so update.sh on the Mini PC keeps working byte-for-byte.
#
# Plan 140-07 (2026-05-17): adds `--subdomain X` as the primary user-facing
# flag (derives --domain X.livinity.io). When --api-key is set but
# --cf-tunnel-token is not, mode-tunnel.sh fetches the token at runtime from
# /api/me/tunnel-token. parse-cli + mode-tunnel handle the new args; install.sh
# itself just passes args through unchanged (no dispatcher change needed).

set -euo pipefail

# ── Resolve helper directory ──────────────────────────────────
# Three modes (Phase 132-03 self-bootstrap):
#   1. Sourced from a cloned repo (BASH_SOURCE is a real file path) → use sibling install/
#   2. Piped via curl|bash AND CWD happens to be a repo root → use $PWD/scripts/install
#   3. Piped via curl|bash from anywhere else → self-bootstrap: download helpers
#      from GitHub raw into a temp dir (override base via LIVOS_INSTALL_BOOTSTRAP_BASE)
HELPERS_REQUIRED=(_logging.sh parse-cli.sh detect-platform.sh common-deps.sh
                  show-banner.sh mode-cloud.sh mode-local-lan.sh mode-hybrid.sh
                  mode-tunnel.sh deploy-livinityd.sh)
GH_RAW_BASE="${LIVOS_INSTALL_BOOTSTRAP_BASE:-https://raw.githubusercontent.com/utopusc/livinity-io/master/scripts/install}"

if [[ -n "${BASH_SOURCE[0]:-}" ]] && [[ ! "${BASH_SOURCE[0]:-}" =~ ^/dev/ ]]; then
    # Mode 1: sourced from cloned repo
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install"
elif [[ -d "$(pwd)/scripts/install" ]]; then
    # Mode 2: piped via curl|bash, CWD is repo root
    SCRIPT_DIR="$(pwd)/scripts/install"
else
    # Mode 3: piped via curl|bash from elsewhere — self-bootstrap
    SCRIPT_DIR="$(mktemp -d -t livos-install-XXXXXX)"
    echo "── Self-bootstrap: downloading helpers from ${GH_RAW_BASE} → ${SCRIPT_DIR}"
    for h in "${HELPERS_REQUIRED[@]}"; do
        if ! curl -fsSL "${GH_RAW_BASE}/${h}" -o "${SCRIPT_DIR}/${h}"; then
            echo "ERROR: failed to download ${h} from ${GH_RAW_BASE}" >&2
            echo "Check network connectivity OR set LIVOS_INSTALL_BOOTSTRAP_BASE env var to override." >&2
            exit 3
        fi
    done
    chmod +x "${SCRIPT_DIR}"/*.sh 2>/dev/null || true
    echo "── Self-bootstrap complete: $(ls "${SCRIPT_DIR}" | wc -l) helpers downloaded"
fi

# Final sanity check: every required helper is present
for h in "${HELPERS_REQUIRED[@]}"; do
    if [[ ! -f "${SCRIPT_DIR}/${h}" ]]; then
        echo "ERROR: missing required helper after resolution: ${SCRIPT_DIR}/${h}" >&2
        exit 2
    fi
done

# ── Source helpers (order matters: logging first so subsequent helpers can call
#    info/ok/warn/fail; then cli to set MODE; then platform; then common-deps) ──
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_logging.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/parse-cli.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/detect-platform.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/common-deps.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/show-banner.sh"

# ── ERR trap (captures line number for diagnosis; honors original exit code) ──
on_error() {
    local exit_code=$?
    local line=$1
    fail "install.sh aborted at line ${line} (exit=${exit_code})" "$exit_code"
}
trap 'on_error $LINENO' ERR

# ── Parse args (also validates --mode against whitelist; exits 64 on invalid) ─
parse_cli "$@"

# ── Platform detection ──
step "Detecting platform"
detect_os
detect_arch
detect_host_ip
# Plan 104-08 hotfix — CGNAT check (warn-only, hybrid mode only). Skipped silently
# in other modes and when ifconfig.me is unreachable. See detect-platform.sh.
detect_cgnat

# ── Sudo check (apt-get install needs root for common-deps + mode bodies) ──
if [[ $EUID -ne 0 ]]; then
    fail "install.sh must run as root (apt-get install requires it). Try: sudo bash scripts/install.sh --mode $MODE" 1
fi

# ── Shared deps (every mode needs Caddy + apt prereqs) ──
install_common_deps

# ── Dispatch to mode helper. Phase 134: hybrid (default) and tunnel are the
#    same code path now (CF Tunnel transport via cloudflared outbound). hybrid
#    is the user-facing default; tunnel is a back-compat alias. Both invoke
#    install_mode_tunnel from mode-tunnel.sh — mode-hybrid.sh just delegates.
case "$MODE" in
    cloud)         source "$SCRIPT_DIR/mode-cloud.sh"; install_mode_cloud ;;
    local-lan)     source "$SCRIPT_DIR/mode-local-lan.sh"; install_mode_local_lan ;;
    hybrid)        source "$SCRIPT_DIR/mode-hybrid.sh"; install_mode_hybrid ;;   # Phase 134: delegates → install_mode_tunnel
    tunnel)        source "$SCRIPT_DIR/mode-tunnel.sh"; install_mode_tunnel ;;   # Phase 134: kept as back-compat alias
    *)             fail "internal error: unhandled MODE=$MODE" 64 ;;
esac

# ── Persist mode marker (read by livinityd on boot + by update.sh;
#    RESEARCH §Pitfall 5 — without this, livinityd cannot tell which TLS path to
#    take and defaults to cloud, breaking local-lan and hybrid) ──
set_livos_redis_key "livos:domain:local_mode" "$MODE"

# ── Plan 104-11 — full livinityd deploy (system pkgs + Postgres + Redis +
#    UI build + systemd unit + Caddy reverse_proxy :8080). Default: deploy.
#    Skip with --skip-deploy (legacy 104-08/104-09 behavior — TLS/DNS only). ──
if [[ "${SKIP_DEPLOY:-0}" != "1" ]]; then
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/deploy-livinityd.sh"
    deploy_livinityd
else
    info "Plan 104-11 — --skip-deploy set; skipping livinityd deploy step"
    info "  Run with --skip-deploy removed (or omit it) to get the full UI install."
fi

# ── Done ──
print_banner "$MODE"
exit 0
