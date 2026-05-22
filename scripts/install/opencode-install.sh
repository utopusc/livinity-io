#!/usr/bin/env bash
# scripts/install/opencode-install.sh
# Phase 196-02 — opencode CLI installer + version pin enforcement.
#
# opencode is the device-code spawner behind Phase 195's auth.xai.start tRPC
# flow (XaiAuthFlowService wraps `opencode auth login -p xai -m console`).
# Without opencode on PATH the onboarding ConnectAiStep cannot complete. This
# script ships the official upstream installer + a hard version-pin guard.
#
# Idempotency contract:
#   - If opencode >= OPENCODE_MIN_VERSION is already on PATH, log "already
#     installed" and exit 0 without touching upstream.
#   - Otherwise: pipe the official upstream installer URL to bash and verify
#     the post-install version. If the version is still below the floor, exit 1
#     so install.sh halts instead of pretending success.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=_logging.sh
[[ -f "${SCRIPT_DIR}/_logging.sh" ]] && source "${SCRIPT_DIR}/_logging.sh"

OPENCODE_MIN_VERSION="1.15.0"

step "Phase 196-02 — installing opencode CLI (>= ${OPENCODE_MIN_VERSION})"

# Helper: extract `X.Y.Z` from the first whitespace-separated token of
# `opencode --version`. Strips any leading `v` and trailing garbage.
_opencode_version() {
    command -v opencode >/dev/null 2>&1 || return 1
    opencode --version 2>/dev/null | awk '{print $NF}' | tr -d 'v' | head -1
}

# Helper: returns 0 if $1 >= $2 (semver-ish via sort -V).
_version_ge() {
    [[ -n "${1:-}" ]] || return 1
    [[ "$(printf '%s\n%s' "$2" "$1" | sort -V | head -1)" == "$2" ]]
}

_current=$(_opencode_version || true)
if [[ -n "${_current:-}" ]] && _version_ge "$_current" "$OPENCODE_MIN_VERSION"; then
    ok "✓ opencode ${_current} already installed (>= ${OPENCODE_MIN_VERSION})"
    info "✓ opencode-install complete"
    exit 0
fi

if [[ -n "${_current:-}" ]]; then
    warn "opencode ${_current} present but < ${OPENCODE_MIN_VERSION} — upgrading"
else
    info "opencode not present — installing"
fi

# ── Upstream install ────────────────────────────────────────────────────────
# Run as the invoking user (not via sudo); the upstream installer drops the
# binary under ~/.local/bin and symlinks /usr/local/bin when it can. We must
# NOT pipe to bash with set -e disabled — keep the strict mode.
#
# Phase 196-02 STRIDE T-196-02-01 (accept): we trust opencode.ai's TLS and
# their installer signing. Defense-in-depth = post-install version-pin guard
# rejects any tampered downgrade.
info "Fetching https://opencode.ai/install ..."
if ! curl -fsSL https://opencode.ai/install | bash; then
    fail "opencode-install: upstream installer failed (curl exit non-zero)" 75
fi

# Re-resolve PATH because the upstream installer often appends ~/.local/bin
# during this very shell session.
export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"
hash -r 2>/dev/null || true

_after=$(_opencode_version || true)
if [[ -z "${_after:-}" ]]; then
    fail "opencode-install: binary still not on PATH after upstream installer ran" 75
fi
if ! _version_ge "$_after" "$OPENCODE_MIN_VERSION"; then
    fail "opencode-install: post-install version ${_after} < required ${OPENCODE_MIN_VERSION}" 75
fi

ok "opencode ${_after} installed at $(command -v opencode)"
info "✓ opencode-install complete"
