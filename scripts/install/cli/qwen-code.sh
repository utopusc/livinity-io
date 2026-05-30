#!/usr/bin/env bash
# scripts/install/cli/qwen-code.sh
# Phase 253 — install Qwen Code CLI. Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to SUPPORTED_CLIS).
#
# CRITICAL: the npm package is `@qwen-code/qwen-code` but the installed binary
# is `qwen` (NOT `qwen-code`). Probe `command -v qwen`.
#
# Idempotency contract: if the `qwen` binary is already on PATH, log "already
# installed" and exit 0 without re-running npm install.

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

step "Phase 253 — installing Qwen Code CLI"

# G15 — `npm install -g` as the (non-root) livinityd user hits EACCES because
# npm's global prefix defaults to /usr (root-owned). Use a user-writable prefix
# (~/.npm-global) and put its bin dir on PATH for the idempotency + verify checks.
NPM_PREFIX="${HOME}/.npm-global"
export PATH="${NPM_PREFIX}/bin:${HOME}/.local/bin:/usr/local/bin:${PATH}"
mkdir -p "${NPM_PREFIX}"

if command -v qwen >/dev/null 2>&1; then
    _v=$(qwen --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ qwen already installed: ${_v}"
    exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
    fail "qwen-code: npm not on PATH — install Node.js first" 75
fi

info "Running: npm install -g --prefix ${NPM_PREFIX} @qwen-code/qwen-code@latest"
if ! npm install -g --prefix "${NPM_PREFIX}" @qwen-code/qwen-code@latest; then
    fail "qwen-code: npm install failed" 75
fi
hash -r 2>/dev/null || true

if ! command -v qwen >/dev/null 2>&1; then
    fail "qwen-code install completed but qwen binary still not on PATH" 75
fi

# G20.1 — persist ~/.npm-global/bin on PATH for the LivOS terminal. The PTY
# spawns `bash --login`, and a LOGIN shell reads ~/.profile, NOT ~/.bashrc — so
# the binary must be added to ~/.profile or terminal-based auth reports "command
# not found". Idempotent (grep-guarded on the 'LivOS CLI PATH' marker).
if [[ -f "${HOME}/.profile" ]] && ! grep -qF 'LivOS CLI PATH' "${HOME}/.profile"; then
    printf '\n# LivOS CLI PATH (login shells read .profile, not .bashrc)\nexport PATH="/opt/livos/bin:$HOME/.npm-global/bin:$HOME/.opencode/bin:$HOME/.local/bin:$PATH"\n' >> "${HOME}/.profile"
fi

ok "qwen-code installed: $(qwen --version 2>/dev/null | head -1 || echo unknown)"
