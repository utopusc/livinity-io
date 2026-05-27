#!/usr/bin/env bash
# pre-v42-cutover-backup.sh
#
# Mini PC pre-cutover backup for Phase 231 (OpenClawOS retirement -- POINT OF
# NO RETURN). Snapshots Mini PC state BEFORE the destructive cleanup so a
# tarball-based rollback path exists if Phase 231 wedges the deploy.
#
# Scope (per .planning/ROADMAP.md Phase 230):
#   1. redis-cli SAVE                                (quiesce Redis to disk)
#   2. tar -czf /opt/livos/backups/pre-v42-cutover-YYYY-MM-DD.tgz of:
#        /opt/livos/data                             (livos app data + RDB)
#        /home/bruce/.claude                         (Claude credentials)
#        /home/bruce/livinity                        (operator data root)
#        /etc/livos                                  (livos config; may be symlinked)
#        /etc/caddy                                  (Caddyfile + conf.d)
#        /etc/systemd/system/liv-*.service           (liv-* unit files)
#        /etc/systemd/system/livos.service           (livos.service unit)
#   3. tar -tzf <tarball>                            (integrity check)
#   4. sha256sum + size                              (audit trail)
#   5. Append one-line entry to /opt/livos/backups/RESTORE-INDEX.log
#
# Idempotency: refuses to overwrite a same-date tarball unless --force.
#
# Safety guards:
#   - Refuses to run if /opt/livos/.env is absent (HARD RULE 2026-04-27 --
#     Mini PC is the ONLY valid target; this guard prevents accidental
#     dev-laptop runs).
#   - --ignore-failed-read on tar (per scope_locked: /etc/livos may be a
#     symlink chain; liv-* unit files may not exist on a freshly-bootstrapped
#     host; the archive must tolerate these).
#
# Sacred SHA invariant: this script does NOT touch any path under
# liv/packages/core/. Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
# (blob SHA of liv/packages/core/src/sdk-agent-runner.ts) is UNCHANGED.
#
# Usage (on Mini PC, as a sudo-capable user):
#   sudo bash /opt/livos/scripts/pre-v42-cutover-backup.sh           # default
#   sudo bash /opt/livos/scripts/pre-v42-cutover-backup.sh --force   # overwrite same-date tarball

set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# Logging helpers (style match: scripts/install-liv-assistant.sh)
# ---------------------------------------------------------------------------
if [[ -z "${NO_COLOR:-}" && -t 1 ]]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
    BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; NC=$'\033[0m'
else
    RED=""; GREEN=""; YELLOW=""; BLUE=""; CYAN=""; NC=""
fi

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }
step()  { echo -e "\n${CYAN}-- $* --${NC}"; }

# ---------------------------------------------------------------------------
# Args + safety guard
# ---------------------------------------------------------------------------
FORCE=0
if [[ "${1:-}" == "--force" ]]; then
    FORCE=1
    shift
fi

if [[ ! -f /opt/livos/.env ]]; then
    fail "Not a LivOS host (no /opt/livos/.env) -- refusing to run. Mini PC is the only valid target (HARD RULE 2026-04-27)."
fi

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
BACKUP_DIR="/opt/livos/backups"
DATE_ISO=$(date +%F)              # YYYY-MM-DD
TS_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TARBALL="${BACKUP_DIR}/pre-v42-cutover-${DATE_ISO}.tgz"
RESTORE_INDEX="${BACKUP_DIR}/RESTORE-INDEX.log"
TAR_STDERR_LOG="${BACKUP_DIR}/pre-v42-cutover-${DATE_ISO}.tar-stderr.log"

step "Pre-cutover backup -- ${DATE_ISO}"
info "Tarball target: ${TARBALL}"
info "Restore index:  ${RESTORE_INDEX}"

# ---------------------------------------------------------------------------
# Same-date tarball collision guard
# ---------------------------------------------------------------------------
sudo mkdir -p "${BACKUP_DIR}"
if [[ -f "${TARBALL}" ]]; then
    if [[ "${FORCE}" -eq 1 ]]; then
        warn "Tarball ${TARBALL} already exists; --force passed, deleting and re-creating"
        sudo rm -f "${TARBALL}"
    else
        fail "Tarball ${TARBALL} already exists; pass --force to overwrite"
    fi
fi

# ---------------------------------------------------------------------------
# Step 1 -- Redis SAVE (quiesce Redis state to disk)
# ---------------------------------------------------------------------------
step "Step 1 -- Redis SAVE"

REDIS_PASS=""
if sudo test -r /opt/livos/.env; then
    REDIS_URL=$(sudo grep -E '^REDIS_URL=' /opt/livos/.env | head -1 | cut -d= -f2-)
    REDIS_URL=${REDIS_URL%\"}; REDIS_URL=${REDIS_URL#\"}
    REDIS_URL=${REDIS_URL%\'}; REDIS_URL=${REDIS_URL#\'}
    if [[ -n "${REDIS_URL}" ]]; then
        REDIS_PASS_ENCODED=$(echo "${REDIS_URL}" | sed -nE 's|^redis://[^:@]*:([^@]+)@.*$|\1|p')
        if [[ -n "${REDIS_PASS_ENCODED}" ]]; then
            # URL-decode (%21 -> !, etc.)
            REDIS_PASS=$(printf '%b' "${REDIS_PASS_ENCODED//%/\\x}")
        fi
    fi
fi

if command -v redis-cli >/dev/null 2>&1; then
    if [[ -n "${REDIS_PASS}" ]]; then
        if redis-cli -a "${REDIS_PASS}" --no-auth-warning SAVE >/dev/null 2>&1; then
            ok "redis-cli SAVE OK (Redis state quiesced to disk)"
        else
            warn "redis-cli SAVE failed (auth or connectivity); continuing with tar archive (RDB on disk may be slightly stale)"
        fi
    else
        if redis-cli SAVE >/dev/null 2>&1; then
            ok "redis-cli SAVE OK (no auth)"
        else
            warn "redis-cli SAVE failed (no auth available and no anon access); continuing"
        fi
    fi
else
    warn "redis-cli not found on PATH; skipping Redis SAVE (RDB on disk may be slightly stale)"
fi

# ---------------------------------------------------------------------------
# Step 2 -- tar archive (7 paths, --ignore-failed-read)
# ---------------------------------------------------------------------------
step "Step 2 -- tar archive"

# Collect liv-*.service unit files via nullglob (avoid passing literal glob string)
shopt -s nullglob
LIV_UNITS=(/etc/systemd/system/liv-*.service)
shopt -u nullglob

if [[ -f /etc/systemd/system/livos.service ]]; then
    LIV_UNITS+=(/etc/systemd/system/livos.service)
fi

info "Paths to archive:"
info "  /opt/livos/data"
info "  /home/bruce/.claude"
info "  /home/bruce/livinity"
info "  /etc/livos"
info "  /etc/caddy"
for u in "${LIV_UNITS[@]}"; do
    info "  ${u}"
done

if ! sudo tar --ignore-failed-read -czf "${TARBALL}" \
        /opt/livos/data \
        /home/bruce/.claude \
        /home/bruce/livinity \
        /etc/livos \
        /etc/caddy \
        "${LIV_UNITS[@]}" \
        2> >(sudo tee "${TAR_STDERR_LOG}" >&2); then
    fail "tar archive command failed (non-zero exit even with --ignore-failed-read); inspect ${TAR_STDERR_LOG}"
fi

ok "tar archive written: ${TARBALL}"

# ---------------------------------------------------------------------------
# Step 3 -- integrity check (tar -tzf)
# ---------------------------------------------------------------------------
step "Step 3 -- integrity check"

if sudo tar -tzf "${TARBALL}" > /dev/null 2>&1; then
    ok "Tarball integrity check PASS (tar -tzf exit 0)"
else
    sudo rm -f "${TARBALL}"
    fail "Tarball integrity check FAILED (tar -tzf non-zero); deleted partial tarball"
fi

# ---------------------------------------------------------------------------
# Step 4 -- sha256 + size + RESTORE-INDEX append
# ---------------------------------------------------------------------------
step "Step 4 -- audit trail"

SHA256=$(sudo sha256sum "${TARBALL}" | awk '{print $1}')
SIZE=$(sudo stat -c %s "${TARBALL}")

info "sha256: ${SHA256}"
info "size:   ${SIZE} bytes"

echo "${TS_UTC} ${TARBALL} ${SHA256} ${SIZE}" | sudo tee -a "${RESTORE_INDEX}" >/dev/null
ok "Appended one-line entry to ${RESTORE_INDEX}"

# ---------------------------------------------------------------------------
# Final summary (parsed by Plan 230-02 for DEPLOY-LOG capture)
# ---------------------------------------------------------------------------
step "Summary"
echo "[SUMMARY] tarball=${TARBALL} size=${SIZE} sha256=${SHA256}"
ok "Phase 230 pre-cutover backup complete"
