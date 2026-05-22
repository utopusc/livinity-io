#!/usr/bin/env bash
# scripts/install/bruce-user-bootstrap.sh
# Phase 196-02 — create the `bruce` UNIX user + install the Phase 192 sudoers
# fragment byte-identical from scripts/install/sudoers.d/livinityd.
#
# SACRED: this script COPIES the Phase 192-01 fragment via `install -m 0440`.
# It does NOT modify the content. Mutating the fragment would invalidate the
# pinned blob SHA in scripts/sacred-shas-v38.json (entry "scripts/install/
# sudoers.d/livinityd" → 568e4403b...). Only Plan 196-05 may re-pin.
#
# Idempotency contract:
#   - useradd guarded by `id -u bruce` lookup
#   - chown ALWAYS runs (memory pitfall feedback_bruce_home_ownership — useradd
#     -m alone is not defensive; root-owned ~/.config/chromium kills WebApp)
#   - sudoers fragment install guarded by `cmp` against the destination

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=_logging.sh
[[ -f "${SCRIPT_DIR}/_logging.sh" ]] && source "${SCRIPT_DIR}/_logging.sh"

step "Phase 196-02 — bruce user + sudoers"

if [[ $EUID -ne 0 ]]; then
    fail "bruce-user-bootstrap: must run as root" 77
fi

# ── User ────────────────────────────────────────────────────────────────────
if id -u bruce >/dev/null 2>&1; then
    ok "✓ user 'bruce' already present (uid=$(id -u bruce))"
else
    info "Creating user 'bruce' (useradd -m -s /bin/bash)"
    useradd -m -s /bin/bash bruce || fail "useradd bruce failed" 77
    ok "user 'bruce' created (uid=$(id -u bruce))"
fi

# ── Home ownership (always run; memory pitfall) ─────────────────────────────
# Per feedback_bruce_home_ownership: useradd -m alone is not defensive —
# WebApp Chrome dies SIGTRAP when /home/bruce is root-owned because chrome +
# fluxbox + feh write to ~/.config / ~/.fluxbox / ~/.fehbg → Permission denied.
info "Ensuring /home/bruce is owned by bruce:bruce"
chown -R bruce:bruce /home/bruce
ok "/home/bruce ownership reconciled"

# ── Sudoers fragment ────────────────────────────────────────────────────────
_src="${SCRIPT_DIR}/sudoers.d/livinityd"
_dst="/etc/sudoers.d/livinityd"

if [[ ! -f "$_src" ]]; then
    fail "bruce-user-bootstrap: source sudoers fragment missing at ${_src}" 66
fi

if [[ -f "$_dst" ]] && cmp -s "$_src" "$_dst"; then
    ok "✓ /etc/sudoers.d/livinityd already installed (byte-identical to source)"
else
    info "Installing sudoers fragment → ${_dst}"
    # `install -m 0440` is the canonical pattern from Phase 192-02 — preserves
    # the byte-identical contents (sha1 568e4403b... in registry).
    install -m 0440 -o root -g root "$_src" "$_dst"

    # Syntax-check; if visudo refuses, REMOVE the file so the box doesn't lock
    # itself out on next sudo invocation.
    if ! visudo -c -f "$_dst" >/dev/null 2>&1; then
        rm -f "$_dst"
        fail "bruce-user-bootstrap: visudo -c rejected ${_src} — fragment removed for safety" 75
    fi
    ok "sudoers fragment installed and visudo-clean"
fi

info "✓ bruce-user-bootstrap complete"
