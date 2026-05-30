#!/usr/bin/env bash
# scripts/install/cli/kiro.sh
# Phase 253 — install Kiro CLI. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to SUPPORTED_CLIS).
#
# Wave C (install-only / authHidden): Kiro CLI 2.0 (rebranded Amazon Q). Its
# install one-liner is UNVERIFIED (RESEARCH A9) — no canonical installer URL or
# package name could be confirmed at Phase 253 planning/execution time.
#
# API-KEY HEADLESS NOTE: Kiro is operated headless via an API key / env-based
# auth (no clean interactive login surface here). It ships authHidden — Plan 04
# sets CLI_AUTH_COMMANDS['kiro'] = null + authHidden:true (no Auth button); the
# operator provides the Kiro API key out of band once a verified installer exists.
#
# FAIL-CLOSED (WARNING 1, RESEARCH A9 / T-253-07): because NO verifiable installer
# exists, this script REFUSES to guess a package name (the aion-cli two-name-guess
# anti-pattern). It exits NON-ZERO via `fail "..." 75` so the unverified state is
# explicit rather than masquerading as a successful install. If/when the kiro.dev
# install path is verified, replace the fail below with the guarded installer
# (`<installer> || fail "kiro: installer failed" 75`) — still FAIL-CLOSED.
#
# Idempotency contract: if the `kiro` binary is already on PATH (operator-installed
# via the verified manual path), log "already installed" and exit 0.

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

step "Phase 253 — installing Kiro CLI (installer UNVERIFIED — RESEARCH A9)"

# G14 — a manually-installed kiro binary most likely lands in ~/.local/bin;
# livinityd's PATH may lack it, so put it on PATH up front, BEFORE the idempotency
# probe (lets an operator-installed kiro short-circuit as already-installed).
export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"

if command -v kiro >/dev/null 2>&1; then
    _v=$(kiro --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ kiro already installed: ${_v}"

    # G20.1 — persist ~/.local/bin on PATH for the LivOS terminal (login shells
    # read ~/.profile, NOT ~/.bashrc). Idempotent (grep-guarded on the marker).
    if [[ -f "${HOME}/.profile" ]] && ! grep -qF 'LivOS CLI PATH' "${HOME}/.profile"; then
        printf '\n# LivOS CLI PATH (login shells read .profile, not .bashrc)\nexport PATH="/opt/livos/bin:$HOME/.npm-global/bin:$HOME/.opencode/bin:$HOME/.local/bin:$PATH"\n' >> "${HOME}/.profile"
    fi
    exit 0
fi

# FAIL-CLOSED (RESEARCH A9 / T-253-07): no verified installer one-liner exists.
# Refuse to guess a package name — exit NON-ZERO with an explicit message so the
# failure is honest rather than a silent broken install.
fail "kiro: installer one-liner unverified — manual install + API-key env required (RESEARCH A9)" 75
