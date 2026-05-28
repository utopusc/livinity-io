#!/usr/bin/env bash
# scripts/install/cli/openclaw.sh
# Phase 239 — install OpenClaw CLI. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to D-239-07 SUPPORTED_CLIS).
#
# D-239-REUSE-EXISTING — delegates to the existing repo installer at
# scripts/install/install-openclaw-cli.sh which already implements the
# pnpm-store-locate + symlink/shim install pattern (Phase 208-03).
#
# Idempotency contract: if the `openclaw` binary is already on PATH and
# `openclaw --version` exits 0, log "already installed" and exit 0 without
# re-running the delegate.

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

step "Phase 239 — installing OpenClaw CLI"

if command -v openclaw >/dev/null 2>&1; then
    _v=$(openclaw --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ OpenClaw already installed: ${_v}"
    exit 0
fi

info "Delegating to scripts/install/install-openclaw-cli.sh"
DELEGATE="${SCRIPT_DIR}/../install-openclaw-cli.sh"
if [[ ! -x "${DELEGATE}" ]]; then
    fail "openclaw: delegate script not found or not executable at ${DELEGATE}" 75
fi
if ! "${DELEGATE}"; then
    fail "openclaw: delegate installer exited non-zero" 75
fi
export PATH="/opt/livos/bin:${PATH}"
hash -r 2>/dev/null || true

if ! command -v openclaw >/dev/null 2>&1; then
    fail "OpenClaw install completed but binary still not on PATH" 75
fi

ok "OpenClaw installed: $(openclaw --version 2>/dev/null | head -1 || echo unknown)"
