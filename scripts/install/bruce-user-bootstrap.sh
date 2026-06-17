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

step "Phase 196-02 — desktop user + sudoers"

if [[ $EUID -ne 0 ]]; then
    fail "bruce-user-bootstrap: must run as root" 77
fi

# Phase 278 — the desktop user is parameterized (was a hardcoded `bruce`). Derive
# from LIVOS_DESKTOP_USER / DESKTOP_USER (set by parse-cli.sh), neutral `livos`
# last-resort. Running this on a non-bruce box no longer creates a stray `bruce`
# OS account or chowns the wrong home. The sudoers fragment copy below stays
# BYTE-IDENTICAL (pinned blob) — only the user/home body is parameterized.
_DESKTOP_USER="${LIVOS_DESKTOP_USER:-${DESKTOP_USER:-livos}}"

# ── User ────────────────────────────────────────────────────────────────────
if id -u "$_DESKTOP_USER" >/dev/null 2>&1; then
    ok "✓ user '$_DESKTOP_USER' already present (uid=$(id -u "$_DESKTOP_USER"))"
else
    info "Creating user '$_DESKTOP_USER' (useradd -m -s /bin/bash)"
    useradd -m -s /bin/bash "$_DESKTOP_USER" || fail "useradd $_DESKTOP_USER failed" 77
    ok "user '$_DESKTOP_USER' created (uid=$(id -u "$_DESKTOP_USER"))"
fi

# ── Home ownership (always run; memory pitfall) ─────────────────────────────
# Per feedback_bruce_home_ownership: useradd -m alone is not defensive —
# WebApp Chrome dies SIGTRAP when the home is root-owned because chrome +
# fluxbox + feh write to ~/.config / ~/.fluxbox / ~/.fehbg → Permission denied.
_DESKTOP_HOME="$(getent passwd "$_DESKTOP_USER" 2>/dev/null | cut -d: -f6)"
[[ -n "$_DESKTOP_HOME" ]] || _DESKTOP_HOME="/home/$_DESKTOP_USER"
_DESKTOP_GROUP="$(id -gn "$_DESKTOP_USER" 2>/dev/null || echo "$_DESKTOP_USER")"
info "Ensuring $_DESKTOP_HOME is owned by ${_DESKTOP_USER}:${_DESKTOP_GROUP}"
chown -R "${_DESKTOP_USER}:${_DESKTOP_GROUP}" "$_DESKTOP_HOME"
ok "$_DESKTOP_HOME ownership reconciled"

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
