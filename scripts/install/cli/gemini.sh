#!/usr/bin/env bash
# scripts/install/cli/gemini.sh
# Phase 239 — install Gemini CLI. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to D-239-07 SUPPORTED_CLIS).
#
# Idempotency contract: if the `gemini` binary is already on PATH and
# `gemini --version` exits 0, log "already installed" and exit 0 without
# re-running npm install.

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

step "Phase 239 — installing Gemini CLI"

if command -v gemini >/dev/null 2>&1; then
    _v=$(gemini --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ Gemini CLI already installed: ${_v}"
    exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
    fail "gemini: npm not on PATH — install Node.js first" 75
fi

info "Running: npm install -g @google/gemini-cli"
if ! npm install -g @google/gemini-cli; then
    fail "gemini: npm install failed" 75
fi
hash -r 2>/dev/null || true

if ! command -v gemini >/dev/null 2>&1; then
    fail "Gemini CLI install completed but binary still not on PATH" 75
fi

ok "Gemini CLI installed: $(gemini --version 2>/dev/null | head -1 || echo unknown)"
