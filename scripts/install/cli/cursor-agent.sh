#!/usr/bin/env bash
# scripts/install/cli/cursor-agent.sh
# Phase 253 — install Cursor agent CLI. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to SUPPORTED_CLIS).
#
# Wave B (curl-installer binary): cursor.com/install drops the binary into
# ~/.local/bin. The installer creates a DUAL symlink — both a bare `agent` AND a
# `cursor-agent`. We PIN the canonical binary to `cursor-agent` everywhere and
# NEVER probe the collision-prone bare `agent`.
#
# BLOCKER 1 / BINARY IDENTITY (keep aligned when editing Plan 04):
#   install binary  ==  CLI_BIN_NAMES['cursor-agent'] == 'cursor-agent'
#                   ==  detector.test.ts probe (Plan 04 detector.ts)
#                   ==  auth subcommand binary (`cursor-agent login`)
#   The detector binary == the install binary == the auth binary — the SAME name
#   `cursor-agent` across all four maps. Changing the binary here without changing
#   the Plan 04 detector map re-opens the G13d detect-after-install false-negative.
#
# Idempotency contract: if the `cursor-agent` binary is already on PATH, log
# "already installed" and exit 0 without re-running the upstream installer.

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

step "Phase 253 — installing Cursor agent CLI"

# G14 — Cursor's installer drops the binary in ~/.local/bin. livinityd's PATH may
# lack it, so both the idempotency check below and the post-install verify fail →
# the install reports ok:false even though it succeeded. Put ~/.local/bin on PATH
# up front, BEFORE the idempotency probe.
export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"

# BLOCKER 1: pin the canonical binary to cursor-agent (NEVER the bare `agent`).
if command -v cursor-agent >/dev/null 2>&1; then
    _v=$(cursor-agent --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ cursor-agent already installed: ${_v}"
    exit 0
fi

# RESEARCH A6: the Mar-2026 installer had a transient 403 on asset download. The
# `|| fail ... 75` below means a broken installer surfaces as a clear FAIL
# (non-zero), never a silent success.
info "Fetching https://cursor.com/install ..."
if ! curl https://cursor.com/install -fsS | bash; then
    fail "cursor-agent: upstream installer failed" 75
fi
export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"
hash -r 2>/dev/null || true

# BLOCKER 1 post-install ASSERTION: cursor-agent must resolve on PATH. The
# installer drops a dual symlink — we assert on `cursor-agent`, never bare `agent`.
if ! command -v cursor-agent >/dev/null 2>&1; then
    fail "cursor-agent installed but not on PATH (dual symlink — pinning cursor-agent)" 75
fi

# G20.1 — persist ~/.local/bin on PATH for the LivOS terminal. The PTY spawns
# `bash --login`, and a LOGIN shell reads ~/.profile, NOT ~/.bashrc — so the
# binary must be added to ~/.profile or terminal-based `cursor-agent login`
# reports "command not found". Idempotent (grep-guarded on 'LivOS CLI PATH').
if [[ -f "${HOME}/.profile" ]] && ! grep -qF 'LivOS CLI PATH' "${HOME}/.profile"; then
    printf '\n# LivOS CLI PATH (login shells read .profile, not .bashrc)\nexport PATH="/opt/livos/bin:$HOME/.npm-global/bin:$HOME/.opencode/bin:$HOME/.local/bin:$PATH"\n' >> "${HOME}/.profile"
fi

ok "cursor-agent installed: $(cursor-agent --version 2>/dev/null | head -1 || echo unknown)"
