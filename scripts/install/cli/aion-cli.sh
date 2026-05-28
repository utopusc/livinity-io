#!/usr/bin/env bash
# scripts/install/cli/aion-cli.sh
# Phase 239 — install Aion CLI. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to D-239-07 SUPPORTED_CLIS).
#
# NOTE: The canonical Aion CLI install command was UNVERIFIED at Phase 239
# planning + execution time — docs.aion.ai, github.com/aion-ai/aion-cli,
# and npmjs.com/package/@aion-ai/cli were not reachable (HTTP 403/404).
# This script ships with a best-effort npm install path that tries the two
# most likely package names; operator may need to install manually. Phase
# 240 will supersede this script once the official packaging is confirmed.
#
# Idempotency contract: if the `aion` binary is already on PATH and
# `aion --version` exits 0, log "already installed" and exit 0 without
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

step "Phase 239 — installing Aion CLI (best-effort; canonical source unverified)"

if command -v aion >/dev/null 2>&1; then
    _v=$(aion --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ Aion CLI already installed: ${_v}"
    exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
    fail "aion-cli: npm not on PATH — install Node.js first" 75
fi

# NOTE: Aion CLI canonical install command unverified at Phase 239 planning
# time (docs.aion.ai / github.com/aion-ai/aion-cli / npmjs.com/@aion-ai/cli
# all unreachable). Best-effort attempt; operator may need to manually
# install. Phase 240 may supersede this script once official packaging is
# confirmed.
warn "aion-cli: install command is best-effort (canonical source unverified)"
info "Attempting: npm install -g @aion-ai/cli"
if ! npm install -g @aion-ai/cli 2>/dev/null; then
    info "Fallback: npm install -g aion-cli"
    if ! npm install -g aion-cli 2>/dev/null; then
        fail "aion-cli: no install command succeeded — operator must install manually" 75
    fi
fi
hash -r 2>/dev/null || true

if ! command -v aion >/dev/null 2>&1; then
    fail "Aion CLI install completed but binary still not on PATH" 75
fi

ok "Aion CLI installed: $(aion --version 2>/dev/null | head -1 || echo unknown)"
