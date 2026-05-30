#!/usr/bin/env bash
# scripts/install/cli/snow-cli.sh
# Phase 253 — install Snow CLI (Ink TUI). Called by livinityd cliInstaller.install
# tRPC mutation (whitelist-gated to SUPPORTED_CLIS).
#
# Wave C (install-only / authHidden): snow-cli has no published binary/installer —
# it is BUILD-FROM-SOURCE. We git-clone MayDay-wpf/snow-cli into a user-writable
# dir, `npm install`, then `npm run link` to expose the `snow` binary.
#
# NAME COLLISION (RESEARCH / T-253-06, accept): the `snow` binary collides with
# the Snowflake CLI's `snow`. snow-cli ships install-only (authHidden) and this
# script PRINTS where it linked the binary so Plan 04 can confirm the dir. The
# collision only manifests if the Snowflake CLI is separately installed.
#
# authHidden — no auth surface. Plan 04 sets CLI_AUTH_COMMANDS['snow-cli'] = null
# + authHidden:true (no Auth button rendered).
#
# FAIL-CLOSED (WARNING 1): EACH build step (git clone / npm install / npm run
# link) is guarded with `|| fail "..." 75` — any failure exits NON-ZERO (mirrors
# aion-cli.sh) — NEVER a silent exit 0 after a broken build.
#
# Idempotency contract: if the `snow` binary is already on PATH, log "already
# installed" and exit 0 without re-cloning/re-building.

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

step "Phase 253 — installing Snow CLI (build-from-source MayDay-wpf/snow-cli)"

# G14 — npm-link bins typically land in the npm prefix bin (~/.npm-global/bin) and
# we ALSO symlink into ~/.local/bin below; livinityd's PATH may lack either, so
# put both on PATH up front, BEFORE the idempotency probe.
NPM_PREFIX="${HOME}/.npm-global"
export PATH="${NPM_PREFIX}/bin:${HOME}/.local/bin:/usr/local/bin:${PATH}"

# NAME COLLISION (T-253-06): `snow` also belongs to the Snowflake CLI.
if command -v snow >/dev/null 2>&1; then
    _v=$(snow --version 2>/dev/null | head -1 || echo unknown)
    ok "✓ snow already installed: ${_v}"
    exit 0
fi

if ! command -v git >/dev/null 2>&1; then
    fail "snow-cli: git not on PATH — install git first" 75
fi
if ! command -v npm >/dev/null 2>&1; then
    fail "snow-cli: npm not on PATH — install Node.js first" 75
fi

# Use a user-writable build dir (avoids root-owned /usr EACCES). Use ~/.npm-global
# as the npm prefix so `npm run link` lands the bin in a user-owned dir.
mkdir -p "${NPM_PREFIX}"
npm config set prefix "${NPM_PREFIX}" >/dev/null 2>&1 || true

BUILD_DIR="${HOME}/.livos-cli/snow-cli"
mkdir -p "${HOME}/.livos-cli"

# FAIL-CLOSED: guard EACH build step.
if [[ -d "${BUILD_DIR}/.git" ]]; then
    info "snow-cli source already cloned; pulling latest ..."
    git -C "${BUILD_DIR}" pull --ff-only || fail "snow-cli: git pull failed" 75
else
    info "Cloning https://github.com/MayDay-wpf/snow-cli ..."
    rm -rf "${BUILD_DIR}"
    git clone --depth 1 https://github.com/MayDay-wpf/snow-cli "${BUILD_DIR}" \
        || fail "snow-cli: git clone failed" 75
fi

info "Building snow-cli (npm install) ..."
( cd "${BUILD_DIR}" && npm install ) || fail "snow-cli: npm install failed" 75

info "Linking snow binary (npm run link) ..."
( cd "${BUILD_DIR}" && npm run link ) || fail "snow-cli: npm run link failed" 75

export PATH="${NPM_PREFIX}/bin:${HOME}/.local/bin:/usr/local/bin:${PATH}"
hash -r 2>/dev/null || true

# If `snow` is NOT yet resolvable on the covered dirs, symlink whatever the link
# step produced under ~/.npm-global/bin into ~/.local/bin (a detector/auth-covered
# dir) and PRINT the link dir so Plan 04 can confirm whether a new PATH dir is
# needed.
if ! command -v snow >/dev/null 2>&1; then
    if [[ -e "${NPM_PREFIX}/bin/snow" ]]; then
        mkdir -p "${HOME}/.local/bin"
        ln -sf "${NPM_PREFIX}/bin/snow" "${HOME}/.local/bin/snow"
        info "snow-cli: symlinked ${NPM_PREFIX}/bin/snow -> ${HOME}/.local/bin/snow"
        hash -r 2>/dev/null || true
    fi
fi

if ! command -v snow >/dev/null 2>&1; then
    fail "snow-cli: build completed but 'snow' binary still not on PATH (npm-link dir may need adding in Plan 04)" 75
fi

# Report where snow resolved so Plan 04 can confirm the link dir / PATH coverage.
_snow_path="$(command -v snow 2>/dev/null || echo unknown)"
info "snow-cli: 'snow' resolves to ${_snow_path}"

# G20.1 — persist ~/.local/bin + ~/.npm-global/bin on PATH for the LivOS terminal.
# The PTY spawns `bash --login`, and a LOGIN shell reads ~/.profile, NOT ~/.bashrc.
# Idempotent (grep-guarded on the 'LivOS CLI PATH' marker).
if [[ -f "${HOME}/.profile" ]] && ! grep -qF 'LivOS CLI PATH' "${HOME}/.profile"; then
    printf '\n# LivOS CLI PATH (login shells read .profile, not .bashrc)\nexport PATH="/opt/livos/bin:$HOME/.npm-global/bin:$HOME/.opencode/bin:$HOME/.local/bin:$PATH"\n' >> "${HOME}/.profile"
fi

ok "snow installed: $(snow --version 2>/dev/null | head -1 || echo unknown)"
