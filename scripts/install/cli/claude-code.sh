#!/usr/bin/env bash
# scripts/install/cli/claude-code.sh
# Phase 239 — install Claude Code. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to D-239-07 SUPPORTED_CLIS).
#
# Idempotency contract: if the `claude` binary is already on PATH and
# `claude --version` exits 0, log "already installed" and exit 0 without
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

step "Phase 239 — installing Claude Code"

if command -v claude >/dev/null 2>&1; then
    _v=$(claude --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ Claude Code already installed: ${_v}"
    exit 0
fi

info "Fetching https://claude.ai/install.sh ..."
export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"
if ! curl -fsSL https://claude.ai/install.sh | bash; then
    fail "claude-code: upstream installer failed" 75
fi
export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"
hash -r 2>/dev/null || true

if ! command -v claude >/dev/null 2>&1; then
    fail "Claude Code install completed but binary still not on PATH" 75
fi

ok "Claude Code installed: $(claude --version 2>/dev/null | head -1 || echo unknown)"
