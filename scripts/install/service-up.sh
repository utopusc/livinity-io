#!/usr/bin/env bash
# scripts/install/service-up.sh
# Phase 196-02 — start the LivOS systemd units + curl /health 30-retry gate.
#
# Idempotency:
#   - `systemctl start` on an already-active unit is a no-op exit 0.
#   - The health-check retry loop returns success on first 200, so a healthy
#     box gets through in <1s.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=_logging.sh
[[ -f "${SCRIPT_DIR}/_logging.sh" ]] && source "${SCRIPT_DIR}/_logging.sh"

step "Phase 196-02 — service start + health gate"

if [[ $EUID -ne 0 ]]; then
    fail "service-up: must run as root" 77
fi

_units=(livos.service liv-core.service liv-worker.service liv-memory.service)

# Detect-then-skip per unit so the "already started" path is loud + visible.
_already_active=0
for _unit in "${_units[@]}"; do
    if systemctl is-active "$_unit" >/dev/null 2>&1; then
        ok "✓ ${_unit} already configured + active"
        _already_active=$((_already_active + 1))
    else
        info "systemctl start ${_unit}"
        if ! systemctl start "$_unit" 2>&1; then
            warn "${_unit} failed to start — see journalctl below"
            journalctl -u "$_unit" -n 25 --no-pager || true
        fi
    fi
done

# ── Health gate ─────────────────────────────────────────────────────────────
info "Waiting for http://127.0.0.1:8080/health (max 30s)"
_health_ok=0
for _i in $(seq 1 30); do
    if curl -fsS --max-time 2 http://127.0.0.1:8080/health >/dev/null 2>&1; then
        ok "✓ /health returned 200 (after ${_i}s)"
        _health_ok=1
        break
    fi
    sleep 1
done

if (( _health_ok == 0 )); then
    warn "service-up: /health did not return 200 within 30s — dumping journal"
    journalctl -u livos.service -n 50 --no-pager || true
    fail "service-up: livos.service /health gate timed out" 75
fi

# ── Onboarding URL ──────────────────────────────────────────────────────────
_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
if [[ -n "${_ip:-}" ]]; then
    echo ""
    echo "================================================================"
    echo "  Onboarding: http://${_ip}:8080"
    echo "================================================================"
    echo ""
fi

if (( _already_active == ${#_units[@]} )); then
    info "✓ service-up — all ${#_units[@]} units were already active"
fi

info "✓ service-up complete"
