#!/usr/bin/env bash
# Phase 192-02 — Migrate livinityd runtime from User=root to User=bruce.
#
# Idempotent: marker /opt/livos/data/.bruce-migrated guards re-runs.
# Safe to re-run after partial failure — each step skips if already applied.
#
# Run order (deploy script + operator manual):
#   sudo bash scripts/migrate-to-bruce-user.sh
#   sudo systemctl daemon-reload && sudo systemctl restart livos.service
#
# Env vars for CI / dev:
#   TEST_ROOT   = use <tmpdir> instead of /opt/livos (no chown, no real install)
#   DRY_RUN=1   = print actions but do not perform them
#   REPO_ROOT   = repo root (defaults to scripts/.. resolved from this file)
#   SUDOERS_DEST = override /etc/sudoers.d/livinityd install path (test mode)
#
# See: .planning/phases/192-livinityd-bruce-user-switch/192-CONTEXT.md
# See: scripts/install/sudoers.d/livinityd (192-01 audit-derived fragment)

set -uo pipefail

# ── Configuration ───────────────────────────────────────────────────────────
LIVOS_ROOT="${TEST_ROOT:-/opt/livos}"
LIVOS_DATA_DIR="$LIVOS_ROOT/data"
LIVOS_ENV_FILE="$LIVOS_ROOT/.env"
MARKER="$LIVOS_DATA_DIR/.bruce-migrated"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SUDOERS_SRC="$REPO_ROOT/scripts/install/sudoers.d/livinityd"
SUDOERS_DEST="${SUDOERS_DEST:-/etc/sudoers.d/livinityd}"
DRY_RUN="${DRY_RUN:-0}"
# WS1 (2026-06-11) — the desktop user LivOS runs as. Derives from
# LIVOS_DESKTOP_USER / DESKTOP_USER (passed by deploy-livinityd.sh from the
# platform username), defaulting to `bruce` so legacy + the Mini PC are
# unchanged. The .bruce-migrated marker filename is kept stable (it's an
# idempotency flag, not a username) so existing boxes don't re-migrate.
DESKTOP_USER="${DESKTOP_USER:-${LIVOS_DESKTOP_USER:-bruce}}"

log() { echo "[migrate-to-bruce] $*"; }
do_cmd() {
    if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY_RUN: $*"
    else
        eval "$@"
    fi
}

# ── 1. Pre-flight: must run as root (unless TEST_ROOT mode) ─────────────────
if [[ -z "${TEST_ROOT:-}" && "$(id -u)" -ne 0 ]]; then
    log "ERROR: must run as root (or set TEST_ROOT=<tmpdir> for CI)"
    exit 1
fi

log "starting: LIVOS_ROOT=$LIVOS_ROOT REPO_ROOT=$REPO_ROOT DRY_RUN=$DRY_RUN"

# ── 2. Idempotency: marker exists → already migrated, exit 0 ────────────────
if [[ -f "$MARKER" ]]; then
    log "marker $MARKER exists — already migrated, exit 0"
    exit 0
fi

# ── 3. Ensure bruce user exists ─────────────────────────────────────────────
# In TEST_ROOT mode we skip user creation (CI may not have useradd).
if [[ -z "${TEST_ROOT:-}" ]]; then
    if ! id "$DESKTOP_USER" >/dev/null 2>&1; then
        log "$DESKTOP_USER user does not exist — creating with useradd -m -s /bin/bash"
        do_cmd "useradd -m -s /bin/bash $DESKTOP_USER" || {
            log "ERROR: useradd $DESKTOP_USER failed — aborting migration"
            exit 1
        }
    else
        log "$DESKTOP_USER user exists (uid=$(id -u "$DESKTOP_USER"))"
    fi
else
    log "TEST_ROOT mode — skipping $DESKTOP_USER user creation"
fi

# ── 4. Chown -R /opt/livos/data → bruce:bruce ───────────────────────────────
if [[ -d "$LIVOS_DATA_DIR" ]]; then
    log "chown -R $DESKTOP_USER:$DESKTOP_USER $LIVOS_DATA_DIR"
    if [[ -z "${TEST_ROOT:-}" ]]; then
        do_cmd "chown -R $DESKTOP_USER:$DESKTOP_USER $LIVOS_DATA_DIR"
    else
        log "TEST_ROOT mode — skipping actual chown"
    fi
else
    log "WARN: $LIVOS_DATA_DIR does not exist — creating + chowning $DESKTOP_USER:$DESKTOP_USER"
    do_cmd "mkdir -p $LIVOS_DATA_DIR"
    if [[ -z "${TEST_ROOT:-}" ]]; then
        do_cmd "chown $DESKTOP_USER:$DESKTOP_USER $LIVOS_DATA_DIR"
    fi
fi

# ── 5. Chown .env* files → bruce:bruce mode 0640 ────────────────────────────
for f in "$LIVOS_ENV_FILE" "$LIVOS_ENV_FILE.local"; do
    if [[ -f "$f" ]]; then
        log "chown $DESKTOP_USER:$DESKTOP_USER $f + chmod 0640"
        if [[ -z "${TEST_ROOT:-}" ]]; then
            do_cmd "chown $DESKTOP_USER:$DESKTOP_USER $f"
            do_cmd "chmod 0640 $f"
        else
            log "TEST_ROOT mode — skipping actual chown/chmod on $f"
        fi
    fi
done

# ── 6. Add bruce to docker group (if docker installed) ──────────────────────
if [[ -z "${TEST_ROOT:-}" ]]; then
    if [[ -S /var/run/docker.sock ]] || command -v docker >/dev/null 2>&1; then
        if ! id -nG "$DESKTOP_USER" 2>/dev/null | grep -qw docker; then
            log "adding $DESKTOP_USER to docker group"
            do_cmd "usermod -aG docker $DESKTOP_USER"
        else
            log "$DESKTOP_USER already in docker group"
        fi
    else
        log "docker not installed — skipping docker group add"
    fi
else
    log "TEST_ROOT mode — skipping docker group add"
fi

# ── 7. Install sudoers fragment ─────────────────────────────────────────────
if [[ -f "$SUDOERS_SRC" ]]; then
    log "installing $SUDOERS_SRC → $SUDOERS_DEST (0440 root:root)"
    if [[ -z "${TEST_ROOT:-}" ]]; then
        do_cmd "install -m 0440 -o root -g root $SUDOERS_SRC $SUDOERS_DEST"
        # 7a. WS1 (2026-06-11) — the repo fragment hardcodes the user-spec subject
        # `bruce` (sudoers does NOT expand env vars, so it must be templated at
        # install time). Rewrite ONLY the user-spec subject (`^bruce ALL=`) and the
        # self-target Runas (`=(bruce)`) to the actual desktop user. The
        # `chown -R 1000:1000` Cmnd_Alias is deliberately UNTOUCHED — that 1000 is
        # the Tor/app CONTAINER's internal uid, not the host desktop user. No-op on
        # a bruce box (bruce→bruce). RCE boundary: visudo -c re-validates below; a
        # botched substitution removes the file rather than leaving broken sudoers.
        if [[ "$DESKTOP_USER" != "bruce" ]]; then
            log "templating sudoers user-spec: bruce → $DESKTOP_USER"
            do_cmd "sed -i -E 's/^bruce([[:space:]]+ALL=)/${DESKTOP_USER}\\1/; s/=\\(bruce\\)/=(${DESKTOP_USER})/g' $SUDOERS_DEST"
        fi
        # 7b. visudo syntax check — if it fails, REMOVE the file (broken sudoers
        # bricks sudo entirely; aborting with a removed file is safe).
        if command -v visudo >/dev/null 2>&1; then
            if ! visudo -cf "$SUDOERS_DEST" >/dev/null; then
                log "ERROR: visudo syntax check FAILED on $SUDOERS_DEST — removing"
                do_cmd "rm -f $SUDOERS_DEST"
                exit 2
            fi
        fi
    else
        log "TEST_ROOT mode — skipping sudoers install (would: install -m 0440 -o root -g root $SUDOERS_SRC $SUDOERS_DEST)"
    fi
else
    log "WARN: $SUDOERS_SRC missing — skipping sudoers install (192-01 not deployed?)"
fi

# ── 8. Write idempotency marker ─────────────────────────────────────────────
do_cmd "mkdir -p $LIVOS_DATA_DIR"
do_cmd "touch $MARKER"
if [[ -z "${TEST_ROOT:-}" ]]; then
    do_cmd "chown $DESKTOP_USER:$DESKTOP_USER $MARKER"
fi

log "MIGRATION COMPLETE — restart livos.service to apply User=bruce"
log "  systemctl daemon-reload && systemctl restart livos.service"
exit 0
