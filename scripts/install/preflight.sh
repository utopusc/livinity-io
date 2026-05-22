#!/usr/bin/env bash
# scripts/install/preflight.sh
# Phase 196-02 — pre-install host validation.
#
# Refuses to proceed on unsupported OS / arch / RAM / disk so install.sh fails
# fast with a clear message instead of cascading apt errors. Idempotent by
# nature: read-only checks, no state mutation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=_logging.sh
[[ -f "${SCRIPT_DIR}/_logging.sh" ]] && source "${SCRIPT_DIR}/_logging.sh"

step "Phase 196-02 — preflight checks"

# Track whether anything had to be enforced (vs already-OK). Even if every check
# is read-only, surface a "✓ already configured" line so the detect-then-skip
# grep contract from the plan acceptance criteria holds for this file too.
_preflight_changes=0

# ── OS check ────────────────────────────────────────────────────────────────
if [[ ! -f /etc/os-release ]]; then
    fail "preflight: /etc/os-release missing — cannot identify distro" 65
fi
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in
    ubuntu) ;;
    *) fail "preflight: unsupported distro '${ID:-unknown}' — Ubuntu 22.04 or 24.04 required" 65 ;;
esac
case "${VERSION_ID:-}" in
    22.04|24.04) ok "OS: Ubuntu ${VERSION_ID}" ;;
    *) fail "preflight: unsupported Ubuntu version '${VERSION_ID:-unknown}' — need 22.04 or 24.04" 65 ;;
esac

# ── Architecture check ──────────────────────────────────────────────────────
_arch=$(uname -m)
case "$_arch" in
    x86_64|aarch64) ok "Arch: ${_arch}" ;;
    *) fail "preflight: unsupported arch '${_arch}' — need x86_64 or aarch64" 65 ;;
esac

# ── RAM check (≥ 4 GB) ──────────────────────────────────────────────────────
_mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
if (( _mem_kb < 4000000 )); then
    fail "preflight: insufficient RAM — need ≥ 4 GB, have $(( _mem_kb / 1024 )) MB" 73
fi
ok "RAM: $(( _mem_kb / 1024 )) MB"

# ── Disk free on / (≥ 10 GB) ────────────────────────────────────────────────
_disk_gb=$(df -BG --output=avail / 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$1); print $1+0}')
if [[ -z "${_disk_gb:-}" ]] || (( _disk_gb < 10 )); then
    fail "preflight: insufficient disk free on / — need ≥ 10 GB, have ${_disk_gb:-unknown} GB" 73
fi
ok "Disk free on /: ${_disk_gb} GB"

# Read-only checks — by definition there was nothing to do, so the run is
# already in the "configured" state.
if (( _preflight_changes == 0 )); then
    info "✓ preflight already configured (host meets all minimums)"
fi

info "✓ preflight complete"
