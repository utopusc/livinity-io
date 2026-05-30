#!/usr/bin/env bash
# scripts/install/cli/nanobot.sh
# Phase 253 — install Nanobot MCP host. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to SUPPORTED_CLIS).
#
# Wave C (install-only / authHidden): nanobot is an MCP host with NO auth surface
# — it is config/env driven. Primary install is pip (`pip install --user
# nanobot-ai`), which drops the `nanobot` entry-point into pip's user bin
# (~/.local/bin). Fallback (commented, not auto-attempted): the release Go binary
# at github.com/nanobot-ai/nanobot if pip is unavailable.
#
# authHidden — NO auth. Plan 04 sets CLI_AUTH_COMMANDS['nanobot'] = null +
# authHidden:true (no Auth button rendered).
#
# FAIL-CLOSED (WARNING 1): on pip-install failure this script exits NON-ZERO via
# `fail "..." 75` (mirrors aion-cli.sh) — NEVER a silent exit 0 after a broken
# install.
#
# Idempotency contract: if the `nanobot` binary is already on PATH, log "already
# installed" and exit 0 without re-running the installer.

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

step "Phase 253 — installing Nanobot MCP host (pip nanobot-ai; no auth)"

# G14 — pip --user drops the entry-point into ~/.local/bin; livinityd's PATH may
# lack it, so the idempotency probe AND post-install verify fail → install reports
# ok:false even though it succeeded. Put ~/.local/bin on PATH up front, BEFORE the
# idempotency probe.
export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"

if command -v nanobot >/dev/null 2>&1; then
    _v=$(nanobot --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ nanobot already installed: ${_v}"
    exit 0
fi

# Resolve a pip front-end (pip3 preferred, else pip, else `python3 -m pip`).
PIP=""
if command -v pip3 >/dev/null 2>&1; then
    PIP="pip3"
elif command -v pip >/dev/null 2>&1; then
    PIP="pip"
elif command -v python3 >/dev/null 2>&1 && python3 -m pip --version >/dev/null 2>&1; then
    PIP="python3 -m pip"
else
    # FALLBACK (manual): brew not guaranteed on the server; if pip is unavailable,
    # the operator can install the release Go binary from
    # github.com/nanobot-ai/nanobot and drop `nanobot` into ~/.local/bin.
    fail "nanobot: no pip front-end found — install Python/pip (or fetch the release Go binary from github.com/nanobot-ai/nanobot)" 75
fi

# FAIL-CLOSED: on pip-install failure → non-zero FAIL (never a silent exit 0).
info "Installing nanobot-ai via ${PIP} --user ..."
if ! ${PIP} install --user nanobot-ai; then
    fail "nanobot: pip install failed" 75
fi
export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"
hash -r 2>/dev/null || true

if ! command -v nanobot >/dev/null 2>&1; then
    fail "nanobot install completed but binary still not on PATH" 75
fi

# G20.1 — persist ~/.local/bin on PATH for the LivOS terminal. The PTY spawns
# `bash --login`, and a LOGIN shell reads ~/.profile, NOT ~/.bashrc. Idempotent
# (grep-guarded on the 'LivOS CLI PATH' marker).
if [[ -f "${HOME}/.profile" ]] && ! grep -qF 'LivOS CLI PATH' "${HOME}/.profile"; then
    printf '\n# LivOS CLI PATH (login shells read .profile, not .bashrc)\nexport PATH="/opt/livos/bin:$HOME/.npm-global/bin:$HOME/.opencode/bin:$HOME/.local/bin:$PATH"\n' >> "${HOME}/.profile"
fi

ok "nanobot installed: $(nanobot --version 2>/dev/null | head -1 || echo unknown)"
