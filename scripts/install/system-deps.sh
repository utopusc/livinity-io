#!/usr/bin/env bash
# scripts/install/system-deps.sh
# Phase 196-02 — apt-based install of the LivOS runtime stack.
#
# Each package is guarded by `dpkg -s` (binary packages) or `command -v` (tools
# that may be installed via alternative channels) so re-runs are no-ops.
#
# Node.js is bumped to the >=20 line via NodeSource if the system node is older
# (Ubuntu 22.04 ships 12.x by default — too old for the pnpm workspace + tsx
# combination livinityd uses).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=_logging.sh
[[ -f "${SCRIPT_DIR}/_logging.sh" ]] && source "${SCRIPT_DIR}/_logging.sh"

step "Phase 196-02 — system dependencies (apt + node + pnpm)"

if [[ $EUID -ne 0 ]]; then
    fail "system-deps: must run as root (apt-get install needs CAP_SYS_ADMIN)" 77
fi

export DEBIAN_FRONTEND=noninteractive

# ── apt index refresh (cheap, non-destructive) ──────────────────────────────
apt-get update -qq

# ── Node.js >= 20 ───────────────────────────────────────────────────────────
_install_node20=0
if command -v node >/dev/null 2>&1; then
    _node_major=$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)
    if [[ -n "${_node_major:-}" ]] && (( _node_major >= 20 )); then
        ok "node $(node -v) already installed (>= 20)"
    else
        warn "node $(node -v) present but < 20 — upgrading via NodeSource"
        _install_node20=1
    fi
else
    info "node missing — installing via NodeSource setup_20.x"
    _install_node20=1
fi

if (( _install_node20 == 1 )); then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi

# ── Other apt packages ──────────────────────────────────────────────────────
# build-essential is a meta package; use `dpkg -s` to detect installation.
_pkgs=(build-essential postgresql-16 redis-server caddy git curl ca-certificates)
for _pkg in "${_pkgs[@]}"; do
    if dpkg -s "$_pkg" >/dev/null 2>&1; then
        ok "${_pkg} already installed"
    else
        info "Installing ${_pkg}"
        apt-get install -y -qq "$_pkg" || {
            # postgresql-16 is not on Ubuntu 22.04's default apt list; fall
            # back to the generic `postgresql` meta package so the host still
            # gets *some* PG. install.sh's env-seed will refuse non-16 later
            # if needed.
            if [[ "$_pkg" == "postgresql-16" ]]; then
                warn "postgresql-16 not available — falling back to 'postgresql'"
                apt-get install -y -qq postgresql || fail "apt install postgresql failed" 75
            else
                fail "apt install ${_pkg} failed" 75
            fi
        }
    fi
done

# ── pnpm ───────────────────────────────────────────────────────────────────
if command -v pnpm >/dev/null 2>&1; then
    ok "pnpm $(pnpm -v) already installed"
else
    info "Installing pnpm via npm -g"
    npm install -g pnpm || fail "npm install -g pnpm failed" 75
    ok "pnpm $(pnpm -v) installed"
fi

info "✓ system-deps complete"
