#!/usr/bin/env bash
# scripts/install/cli/opencode.sh
# Phase 239 — install OpenCode. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to D-239-07 SUPPORTED_CLIS).
#
# Idempotency contract: if the `opencode` binary is already on PATH and
# `opencode --version` exits 0, log "already installed" and exit 0 without
# touching upstream.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../_logging.sh
if [[ -f "${SCRIPT_DIR}/../_logging.sh" ]]; then
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/../_logging.sh"
else
    info() { echo "[INFO] $*" >&2; }
    ok()   { echo "[OK] $*" >&2; }
    warn() { echo "[WARN] $*" >&2; }
    fail() { echo "[FAIL] $*" >&2; exit "${2:-1}"; }
    step() { echo "=== $* ===" >&2; }
fi

step "Phase 239 — installing OpenCode"

# G14 — opencode's upstream installer drops the binary in ~/.opencode/bin (and
# appends that dir to ~/.bashrc), NOT ~/.local/bin. livinityd's PATH lacks it, so
# both the idempotency check below and the post-install verify fail → the install
# reports ok:false even though it succeeded. Put ~/.opencode/bin on PATH up front.
export PATH="${HOME}/.local/bin:${HOME}/.opencode/bin:/usr/local/bin:${PATH}"

if command -v opencode >/dev/null 2>&1; then
    _v=$(opencode --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ OpenCode already installed: ${_v}"
    exit 0
fi

info "Fetching https://opencode.ai/install ..."
export PATH="${HOME}/.local/bin:${HOME}/.opencode/bin:/usr/local/bin:${PATH}"
if ! curl -fsSL https://opencode.ai/install | bash; then
    fail "opencode: upstream installer failed" 75
fi
export PATH="${HOME}/.local/bin:${HOME}/.opencode/bin:/usr/local/bin:${PATH}"
hash -r 2>/dev/null || true

if ! command -v opencode >/dev/null 2>&1; then
    fail "OpenCode install completed but binary still not on PATH" 75
fi

ok "OpenCode installed: $(opencode --version 2>/dev/null | head -1 || echo unknown)"
