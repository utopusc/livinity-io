#!/usr/bin/env bash
# scripts/install/systemd-units-install.sh
# Phase 196-02 — copy livos.service + liv-core/worker/memory.service into
# /etc/systemd/system + daemon-reload + enable (NOT start; service-up.sh does
# the start + health gate).
#
# Source-of-truth search order for each unit file:
#   1. ${SCRIPT_DIR}/../../systemd/<name>.service      (top-level systemd/ in repo)
#   2. ${SCRIPT_DIR}/systemd/<name>.service            (scripts/install/systemd/)
#   3. ${SCRIPT_DIR}/seeds/<name>.service              (scripts/install/seeds/)
#
# If none of those locations hold a given unit, we WARN but do not fail. Some
# operators may use systemctl edit overlays on top of pre-existing units; the
# v34.x deploys never shipped seed unit files in-repo, so this is by design.
#
# Phase 201-06 — adds `livos-app-liv-ai.service` (Next.js subapp on :3010) and
# resolves it from the new scripts/install/systemd/ directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=_logging.sh
[[ -f "${SCRIPT_DIR}/_logging.sh" ]] && source "${SCRIPT_DIR}/_logging.sh"

step "Phase 196-02 — systemd units (livos + liv-*)"

if [[ $EUID -ne 0 ]]; then
    fail "systemd-units-install: must run as root" 77
fi

# Phase 201-06 — livos-app-liv-ai.service ships from scripts/install/systemd/
# Phase 203-03's liv-claw-gateway.service was RETIRED 2026-06-09 (claw replaced
# by AionUi in Phase 231; the liv-claw-os fork + gateway packages were removed
# from the repo). Its unit file + array entry are gone; the runtime service is
# already force-masked on deployed hosts.
# Note: P201's livos-app-liv-ai.service stays in the array — it is the legacy
# Liv AI Next.js subapp; Plan 203-12 (Mini PC deploy walk) is responsible for
# retiring it once the openclaw path is proven. Until then both units coexist
# (Caddy's `handle /liv-ai-app/*` reverse-proxy decides which one is reachable).
_units=(livos.service liv-core.service liv-worker.service liv-memory.service livos-app-liv-ai.service)
_repo_systemd_dir="${SCRIPT_DIR}/../../systemd"
_install_systemd_dir="${SCRIPT_DIR}/systemd"
_seeds_dir="${SCRIPT_DIR}/seeds"

_installed_any=0
_skipped_any=0
_missing_any=0

for _unit in "${_units[@]}"; do
    _src=""
    if [[ -f "${_repo_systemd_dir}/${_unit}" ]]; then
        _src="${_repo_systemd_dir}/${_unit}"
    elif [[ -f "${_install_systemd_dir}/${_unit}" ]]; then
        _src="${_install_systemd_dir}/${_unit}"
    elif [[ -f "${_seeds_dir}/${_unit}" ]]; then
        _src="${_seeds_dir}/${_unit}"
    fi

    if [[ -z "$_src" ]]; then
        warn "systemd unit source missing: ${_unit} — checked ${_repo_systemd_dir}/, ${_install_systemd_dir}/, and ${_seeds_dir}/ (not fatal; pre-existing overlay may be in place)"
        _missing_any=$((_missing_any + 1))
        continue
    fi

    _dst="/etc/systemd/system/${_unit}"
    if [[ -f "$_dst" ]] && cmp -s "$_src" "$_dst"; then
        ok "✓ ${_unit} already installed (byte-identical)"
        _skipped_any=$((_skipped_any + 1))
    else
        info "Installing ${_unit} → ${_dst}"
        install -m 0644 -o root -g root "$_src" "$_dst"
        _installed_any=$((_installed_any + 1))
    fi
done

# daemon-reload only if we actually wrote a new unit (cheap, but stay precise).
if (( _installed_any > 0 )); then
    info "systemctl daemon-reload"
    systemctl daemon-reload
fi

# Enable every unit that ended up present in /etc/systemd/system. `enable` is
# idempotent — re-running on an already-enabled unit is a no-op exit 0.
for _unit in "${_units[@]}"; do
    if [[ -f "/etc/systemd/system/${_unit}" ]]; then
        if systemctl is-enabled "$_unit" >/dev/null 2>&1; then
            ok "✓ ${_unit} already enabled"
        else
            info "systemctl enable ${_unit}"
            systemctl enable "$_unit" >/dev/null 2>&1 || warn "systemctl enable ${_unit} returned non-zero (continuing)"
        fi
    fi
done

info "systemd-units summary: installed=${_installed_any} skipped=${_skipped_any} missing=${_missing_any}"
info "✓ systemd-units-install complete"
