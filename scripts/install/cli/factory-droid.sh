#!/usr/bin/env bash
# scripts/install/cli/factory-droid.sh
# Phase 253 — install Factory droid CLI. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to SUPPORTED_CLIS).
#
# Wave B (curl-installer binary): the official installer drops the binary `droid`
# into ~/.local/bin. Auth is the verified `droid login` subcommand wired in
# Plan 04 (browser auth later needs xdg-utils on the host).
#
# Idempotency contract: if the `droid` binary is already on PATH, log "already
# installed" and exit 0 without re-running the upstream installer.

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

step "Phase 253 — installing Factory droid CLI"

# G14 — Factory's installer drops the binary in ~/.local/bin. livinityd's PATH may
# lack it, so both the idempotency check below and the post-install verify fail →
# the install reports ok:false even though it succeeded. Put ~/.local/bin on PATH
# up front, BEFORE the idempotency probe.
export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"

if command -v droid >/dev/null 2>&1; then
    _v=$(droid --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ droid already installed: ${_v}"
    exit 0
fi

info "Fetching https://app.factory.ai/cli ..."
if ! curl -fsSL https://app.factory.ai/cli | sh; then
    fail "factory-droid: upstream installer failed" 75
fi
export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"
hash -r 2>/dev/null || true

if ! command -v droid >/dev/null 2>&1; then
    fail "factory-droid install completed but binary still not on PATH" 75
fi

# G20.1 — persist ~/.local/bin on PATH for the LivOS terminal. The PTY spawns
# `bash --login`, and a LOGIN shell reads ~/.profile, NOT ~/.bashrc — so the
# binary must be added to ~/.profile or terminal-based `droid login` reports
# "command not found". Idempotent (grep-guarded on the 'LivOS CLI PATH' marker).
if [[ -f "${HOME}/.profile" ]] && ! grep -qF 'LivOS CLI PATH' "${HOME}/.profile"; then
    printf '\n# LivOS CLI PATH (login shells read .profile, not .bashrc)\nexport PATH="/opt/livos/bin:$HOME/.npm-global/bin:$HOME/.opencode/bin:$HOME/.local/bin:$PATH"\n' >> "${HOME}/.profile"
fi

ok "droid installed: $(droid --version 2>/dev/null | head -1 || echo unknown)"
