#!/usr/bin/env bash
# scripts/install/cli/kimi-cli.sh
# Phase 253 — install Kimi CLI. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to SUPPORTED_CLIS).
#
# Wave C (install-only / authHidden): Kimi is a Python CLI. The OFFICIAL
# installer (code.kimi.com/install.sh) bootstraps uv + Python itself and drops
# the `kimi` shim into ~/.local/bin (uv may land in ~/.cargo/bin). We do NOT add
# a custom uv install step and we do NOT shoehorn this into the npm template
# (Pitfall 5: a global npm install for a Python tool fails / installs the wrong thing).
#
# authHidden — no clean headless auth surface. Plan 04 sets
# CLI_AUTH_COMMANDS['kimi-cli'] = null + authHidden:true (no Auth button rendered).
#
# FAIL-CLOSED (WARNING 1): on official-installer failure this script exits
# NON-ZERO via `fail "..." 75` (mirrors aion-cli.sh) — NEVER a silent exit 0
# after a broken install.
#
# Idempotency contract: if the `kimi` binary is already on PATH, log "already
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

step "Phase 253 — installing Kimi CLI (Python/uv; official installer bootstraps uv)"

# G14 — the uv shim lands in ~/.local/bin and uv itself may go to ~/.cargo/bin;
# livinityd's PATH may lack both, so the idempotency probe AND post-install verify
# fail → install reports ok:false even though it succeeded. Put both on PATH
# up front, BEFORE the idempotency probe.
export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:/usr/local/bin:${PATH}"

if command -v kimi >/dev/null 2>&1; then
    _v=$(kimi --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ kimi already installed: ${_v}"
    exit 0
fi

# FAIL-CLOSED: official installer (bootstraps uv + Python). On error → non-zero FAIL.
info "Fetching https://code.kimi.com/install.sh ..."
if ! curl -LsSf https://code.kimi.com/install.sh | bash; then
    fail "kimi-cli: official installer failed" 75
fi
export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:/usr/local/bin:${PATH}"
hash -r 2>/dev/null || true

if ! command -v kimi >/dev/null 2>&1; then
    fail "kimi-cli install completed but binary still not on PATH" 75
fi

# G20.1 — persist ~/.local/bin on PATH for the LivOS terminal. The PTY spawns
# `bash --login`, and a LOGIN shell reads ~/.profile, NOT ~/.bashrc. Idempotent
# (grep-guarded on the 'LivOS CLI PATH' marker).
if [[ -f "${HOME}/.profile" ]] && ! grep -qF 'LivOS CLI PATH' "${HOME}/.profile"; then
    printf '\n# LivOS CLI PATH (login shells read .profile, not .bashrc)\nexport PATH="/opt/livos/bin:$HOME/.npm-global/bin:$HOME/.opencode/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"\n' >> "${HOME}/.profile"
fi

ok "kimi installed: $(kimi --version 2>/dev/null | head -1 || echo unknown)"
