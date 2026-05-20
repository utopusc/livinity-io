#!/usr/bin/env bash
# scripts/migrate-v35-to-v38.sh — Phase 173-01
#
# Renames the legacy v35 vault root `/root/livinity-vault/` to the v38 root
# `/root/liv/` and creates a backward-compat symlink so external readers
# that hard-coded the old path keep working.
#
# Idempotent: detects current state and skips when nothing to do.
# Safe: stops livos.service before mv, restarts after symlink creation.
#
# Env overrides (for CI testing):
#   VAULT_PREFIX  — prepended to /root/livinity-vault and /root/liv (e.g. "/tmp/xyz")
#   DRY_RUN       — when "1", prints planned actions but performs no mv/ln/systemctl
#   SKIP_SYSTEMD  — when "1", does NOT call systemctl (also set automatically when VAULT_PREFIX is non-empty)
#
# Exit codes:
#   0 — success (migrated, already-migrated, or no-vault scenarios all = 0)
#   1 — unexpected state (BOTH old and new exist as real dirs, or mv failed)
#   64 — usage error (--help printed → 0; bad arg → 64)

set -euo pipefail

VAULT_PREFIX="${VAULT_PREFIX:-}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_SYSTEMD="${SKIP_SYSTEMD:-0}"

# Auto-enable SKIP_SYSTEMD whenever VAULT_PREFIX is set — CI tests have no systemd.
if [[ -n "$VAULT_PREFIX" ]]; then
    SKIP_SYSTEMD=1
fi

OLD_PATH="${VAULT_PREFIX}/root/livinity-vault"
NEW_PATH="${VAULT_PREFIX}/root/liv"

usage() {
    cat <<USAGE
Usage: bash scripts/migrate-v35-to-v38.sh [--help]

Renames the legacy v35 vault root '/root/livinity-vault/' to the v38 root
'/root/liv/' and creates a backward-compat symlink. Idempotent.

Env:
  VAULT_PREFIX  Prefix for paths (CI tests use /tmp; production leaves empty)
  DRY_RUN=1     Print planned actions, perform no mv/ln/systemctl
  SKIP_SYSTEMD=1 Do not invoke systemctl (auto-on when VAULT_PREFIX set)

Steps performed:
  1. If NEW_PATH is a real dir and OLD_PATH is a symlink (or missing) → already-migrated, skip
  2. If NEITHER OLD_PATH nor NEW_PATH exists → no-vault-to-migrate, skip
  3. If OLD_PATH is real and NEW_PATH does not exist → stop livos, mv, ln -s, restart livos
  4. If BOTH are real dirs → ABORT (unexpected state; manual review required)

Idempotent: running twice produces the same final state.
USAGE
}

if [[ "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi
if [[ "$#" -gt 0 ]]; then
    echo "[migrate-v35-to-v38] ERROR: unknown arg '$1'" >&2
    usage >&2
    exit 64
fi

log() { echo "[migrate-v35-to-v38] $*"; }

# maybe_run — argv-form runner (no eval, safe for paths with spaces).
# Usage: maybe_run mv "$OLD" "$NEW"
maybe_run() {
    if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY_RUN: $*"
    else
        "$@"
    fi
}

run_systemctl() {
    # $1 = action (stop|start|restart), $2 = unit
    if [[ "$SKIP_SYSTEMD" == "1" ]]; then
        log "SKIP_SYSTEMD: would systemctl $1 $2"
        return 0
    fi
    if command -v systemctl >/dev/null 2>&1; then
        # `|| true` — never let a missing/stopped unit abort the migration
        maybe_run systemctl "$1" "$2" || true
    else
        log "no systemctl on PATH — skipping systemctl $1 $2"
    fi
}

# ── State detection ────────────────────────────────────────────────────────
OLD_IS_DIR=0; OLD_IS_LINK=0; OLD_MISSING=0
NEW_IS_DIR=0; NEW_IS_LINK=0; NEW_MISSING=0

if [[ -L "$OLD_PATH" ]]; then OLD_IS_LINK=1
elif [[ -d "$OLD_PATH" ]]; then OLD_IS_DIR=1
else OLD_MISSING=1; fi

if [[ -L "$NEW_PATH" ]]; then NEW_IS_LINK=1
elif [[ -d "$NEW_PATH" ]]; then NEW_IS_DIR=1
else NEW_MISSING=1; fi

log "state: OLD($OLD_PATH) dir=$OLD_IS_DIR link=$OLD_IS_LINK missing=$OLD_MISSING"
log "state: NEW($NEW_PATH) dir=$NEW_IS_DIR link=$NEW_IS_LINK missing=$NEW_MISSING"

# ── Decision tree ──────────────────────────────────────────────────────────
# Scenario A: already migrated
if [[ "$NEW_IS_DIR" == "1" && "$OLD_IS_DIR" == "0" ]]; then
    log "already-migrated, skip"
    exit 0
fi

# Scenario B: nothing to migrate (fresh install)
if [[ "$OLD_MISSING" == "1" && "$NEW_MISSING" == "1" ]]; then
    log "no-vault-to-migrate, skip"
    exit 0
fi

# Scenario D: dangerous — both real dirs
if [[ "$OLD_IS_DIR" == "1" && "$NEW_IS_DIR" == "1" ]]; then
    log "ERROR: BOTH $OLD_PATH AND $NEW_PATH are real directories. Manual review required." >&2
    log "       Refusing to mv to avoid data loss." >&2
    exit 1
fi

# Scenario C: real migration (OLD_IS_DIR=1, NEW_MISSING=1)
if [[ "$OLD_IS_DIR" == "1" && "$NEW_MISSING" == "1" ]]; then
    log "migrating $OLD_PATH → $NEW_PATH"

    run_systemctl stop livos.service

    maybe_run mkdir -p "$(dirname "$NEW_PATH")"
    maybe_run mv "$OLD_PATH" "$NEW_PATH"
    maybe_run ln -s "$NEW_PATH" "$OLD_PATH"

    run_systemctl restart livos.service

    log "migration complete"
    exit 0
fi

log "ERROR: unhandled state combination — refusing to proceed." >&2
exit 1
