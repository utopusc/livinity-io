#!/usr/bin/env bash
# scripts/install.sh
# LivOS one-shot installer. Dispatches to mode-cloud.sh, mode-local-lan.sh, or
# mode-hybrid.sh based on --mode flag.
#
# Source: 104-RESEARCH.md §Pattern 5 (Sentry-style sourced helpers).
# D-104-INSTALL-ENTRY: single entry point. D-104-DEFAULT-MODE: default = hybrid.
# D-104-NO-PROD-IMPACT: this is a NEW file; the existing livos/install.sh stays
# unchanged so update.sh on the Mini PC keeps working byte-for-byte.

set -euo pipefail

# Resolve script directory (works under `bash install.sh`, `./install.sh`, and
# `curl ... | bash` where BASH_SOURCE may be /dev/stdin or empty → fall back to
# ./scripts/install/ relative to CWD).
if [[ "${BASH_SOURCE[0]:-}" =~ ^/dev/ ]] || [[ -z "${BASH_SOURCE[0]:-}" ]]; then
    # Piped via curl | bash — assume CWD is repo root
    SCRIPT_DIR="$(pwd)/scripts/install"
else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install"
fi

if [[ ! -d "$SCRIPT_DIR" ]]; then
    echo "ERROR: helper directory not found: $SCRIPT_DIR" >&2
    echo "Run from the livinity-io repo root: bash scripts/install.sh ..." >&2
    exit 2
fi

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

# ── Sudo check (apt-get install needs root for common-deps + mode bodies) ──
if [[ $EUID -ne 0 ]]; then
    fail "install.sh must run as root (apt-get install requires it). Try: sudo bash scripts/install.sh --mode $MODE" 1
fi

# ── Shared deps (every mode needs Caddy + apt prereqs) ──
install_common_deps

# ── Dispatch to mode helper (stubs at this wave — bodies land in 104-03/04/06) ─
case "$MODE" in
    cloud)     source "$SCRIPT_DIR/mode-cloud.sh"; install_mode_cloud ;;
    local-lan) source "$SCRIPT_DIR/mode-local-lan.sh"; install_mode_local_lan ;;
    hybrid)    source "$SCRIPT_DIR/mode-hybrid.sh"; install_mode_hybrid ;;
    *)         fail "internal error: unhandled MODE=$MODE" 64 ;;
esac

# ── Persist mode marker (read by livinityd on boot + by update.sh;
#    RESEARCH §Pitfall 5 — without this, livinityd cannot tell which TLS path to
#    take and defaults to cloud, breaking local-lan and hybrid) ──
set_livos_redis_key "livos:domain:local_mode" "$MODE"

# ── Done ──
print_banner "$MODE"
exit 0
