#!/usr/bin/env bash
# scripts/install/factory-reset.sh
# Phase 141-10 — Idempotent Mini PC LivOS factory reset.
#
# Reverts a Mini PC to a "never installed" state so a different user can run
# install.sh fresh. Discovered necessary 2026-05-17 when socinity's install
# inherited Lucy's residual state — the previous "full" wipe missed the
# PostgreSQL livos DB, so the login screen kept greeting "Welcome, Lucy"
# despite https://socinity.livinity.io resolving correctly.
#
# This script is destructive. It refuses to run without --confirm-destroy
# AND prints a 5-second countdown so an accidental invocation can be Ctrl-C'd.
#
# Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
#
# Usage:
#   sudo bash scripts/install/factory-reset.sh --confirm-destroy
#   sudo bash scripts/install/factory-reset.sh --confirm-destroy --keep-postgres   # debug — skips PG drop
#   sudo bash scripts/install/factory-reset.sh --confirm-destroy --dry-run        # show what would happen
#
# After this completes, run install.sh fresh:
#   sudo bash scripts/install.sh --subdomain ${NEW_USER} --api-key liv_k_xxx

set -uo pipefail

# ── Color + log helpers ────────────────────────────────────────────────────
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 2 ]]; then
    _R='\033[0;31m'; _G='\033[0;32m'; _Y='\033[1;33m'; _C='\033[0;36m'; _NC='\033[0m'
else
    _R=''; _G=''; _Y=''; _C=''; _NC=''
fi
info() { echo -e "${_C}[INFO]${_NC}  $*" >&2; }
ok()   { echo -e "${_G}[OK]${_NC}    $*" >&2; }
warn() { echo -e "${_Y}[WARN]${_NC}  $*" >&2; }
fail() { echo -e "${_R}[FAIL]${_NC}  $*" >&2; exit "${2:-1}"; }
step() { echo -e "\n${_C}=== $* ===${_NC}" >&2; }

# ── Arg parse ──────────────────────────────────────────────────────────────
CONFIRM=0
KEEP_PG=0
DRY_RUN=0
for arg in "$@"; do
    case "$arg" in
        --confirm-destroy) CONFIRM=1 ;;
        --keep-postgres)   KEEP_PG=1 ;;
        --dry-run)         DRY_RUN=1 ;;
        -h|--help)
            sed -n '4,21p' "$0" | sed 's/^# //; s/^#//'
            exit 0
            ;;
        *) fail "unknown arg: $arg (try --help)" 64 ;;
    esac
done

# ── Safety gates ───────────────────────────────────────────────────────────
# Order matters: surface the most informative refusal first. The
# --confirm-destroy gate ALWAYS trips on a no-arg invocation (even when run
# from a non-root shell during exploration), so the operator sees the
# "here's what gets destroyed" message before the "must be root" message.
if [[ $CONFIRM -ne 1 ]]; then
    fail "Refusing to run without --confirm-destroy. This wipes /opt/livos, /opt/liv, /opt/nexus,
    /etc/livos, the livos PostgreSQL database, Docker app containers/volumes, and Redis livos:* keys.
    Re-run with --confirm-destroy if you really mean it." 1
fi

[[ $EUID -eq 0 ]] || fail "factory-reset.sh must run as root (drops /opt, systemd units, PG db)" 1

if [[ $DRY_RUN -ne 1 ]]; then
    cat >&2 <<BANNER

  ${_R}┌─────────────────────────────────────────────────────────────┐${_NC}
  ${_R}│  LIVOS FACTORY RESET — DESTRUCTIVE                          │${_NC}
  ${_R}│  About to wipe ALL livos state from this machine.           │${_NC}
  ${_R}│  Ctrl-C in the next 5 seconds to abort.                     │${_NC}
  ${_R}└─────────────────────────────────────────────────────────────┘${_NC}

BANNER
    for n in 5 4 3 2 1; do
        echo -en "${_Y}  starting in ${n}...${_NC}\r" >&2
        sleep 1
    done
    echo >&2
fi

run() {
    if [[ $DRY_RUN -eq 1 ]]; then
        echo "  [dry-run] $*" >&2
    else
        eval "$@"
    fi
}

# ── 1. Stop services so nothing writes back mid-wipe ───────────────────────
step "Stopping livos services"
for s in livos liv-core liv-worker liv-memory cloudflared caddy; do
    if systemctl list-unit-files "${s}.service" &>/dev/null; then
        run "systemctl stop ${s}.service 2>/dev/null || true"
        info "  stopped ${s}"
    fi
done

# ── 2. Wipe Docker app containers + volumes ────────────────────────────────
step "Wiping Docker app containers and volumes"
if command -v docker &>/dev/null; then
    # Stop + remove every container with a livinity-app prefix / label, AND every
    # generic container the user installed via App Store (best-effort: scope to
    # containers in /opt/livos/data/app-data/* compose projects).
    if [[ -d /opt/livos/data/app-data ]]; then
        for d in /opt/livos/data/app-data/*/; do
            [[ -f "${d}docker-compose.yml" ]] || continue
            local_app=$(basename "$d")
            info "  docker compose down + -v in ${local_app}"
            run "(cd '$d' && docker compose down -v 2>/dev/null || true)"
        done
    fi
    # Belt-and-suspenders: prune any dangling livos-tagged volumes
    run "docker volume ls -q 2>/dev/null | grep -E '^(livos|liv_|nexus_)' | xargs -r docker volume rm -f 2>/dev/null || true"
else
    info "  docker not installed — skipping container wipe"
fi

# ── 3. Drop + recreate livos PostgreSQL database ───────────────────────────
if [[ $KEEP_PG -eq 1 ]]; then
    step "Skipping PG drop (--keep-postgres). NOTE: residual user rows will survive!"
else
    step "Dropping + recreating livos PostgreSQL database"
    if command -v psql &>/dev/null && id postgres &>/dev/null; then
        run "sudo -u postgres psql -c \"DROP DATABASE IF EXISTS livos;\""
        run "sudo -u postgres psql -c \"CREATE DATABASE livos OWNER livos;\""
        ok "  livos DB dropped + recreated (empty schema; livinityd Migration rebuilds on boot)"
    else
        warn "  PostgreSQL not detected — skipping PG step"
    fi
fi

# ── 4. Wipe Redis livos:* and liv:* keys ───────────────────────────────────
step "Wiping Redis livos:* and liv:* keys"
REDIS_PASS=""
if [[ -f /opt/livos/.env ]]; then
    REDIS_PASS=$(grep -oP 'REDIS_URL=redis://[^:]*:\K[^@]+' /opt/livos/.env | head -1 | tr -d '\n' || true)
fi
if command -v redis-cli &>/dev/null && [[ -n "$REDIS_PASS" ]]; then
    # Lua script: delete all matching keys in one round-trip.
    run "redis-cli -a '$REDIS_PASS' --no-auth-warning eval \"for _,k in ipairs(redis.call('keys','livos:*')) do redis.call('del',k) end for _,k in ipairs(redis.call('keys','liv:*')) do redis.call('del',k) end return 'ok'\" 0"
    ok "  Redis livos:* + liv:* wiped"
else
    warn "  redis-cli unavailable or REDIS_URL missing — skipping Redis wipe"
fi

# ── 5. Remove systemd units ────────────────────────────────────────────────
step "Removing livos systemd units"
for unit in livos liv-core liv-worker liv-memory cloudflared; do
    if [[ -f "/etc/systemd/system/${unit}.service" ]]; then
        run "systemctl disable ${unit}.service 2>/dev/null || true"
        run "rm -f /etc/systemd/system/${unit}.service"
        info "  removed ${unit}.service"
    fi
done
run "systemctl daemon-reload 2>/dev/null || true"

# ── 6. Wipe Caddy config (so a fresh install starts from a known baseline) ──
step "Resetting Caddy to minimal baseline"
if [[ -f /etc/caddy/Caddyfile ]]; then
    run "rm -f /etc/caddy/Caddyfile"
    info "  removed /etc/caddy/Caddyfile (install.sh will write a fresh one)"
fi

# ── 7. Wipe source trees + data dirs + secrets ─────────────────────────────
step "Wiping source trees + data + secrets"
for dir in /opt/livos /opt/liv /opt/nexus /etc/livos /var/lib/livos; do
    if [[ -d "$dir" ]]; then
        run "rm -rf '$dir'"
        info "  removed $dir"
    fi
done

# ── 8. Clear install.sh stage-dir cache ────────────────────────────────────
step "Clearing install.sh stage-dir cache"
for d in /tmp/livos-install-stage /tmp/livinity-update-*; do
    if [[ -e "$d" ]]; then
        run "rm -rf $d"
        info "  removed $d"
    fi
done

# ── 9. Final sanity ────────────────────────────────────────────────────────
step "Factory reset complete"
cat >&2 <<DONE

  ${_G}Mini PC is back to a clean state.${_NC}

  Next step — run install.sh fresh:

    sudo bash scripts/install.sh --subdomain ${_C}<new-user>${_NC} --api-key liv_k_xxx

  install.sh will:
    1. Re-install + re-seed PG schema (livinityd Migration on boot)
    2. Re-seed Redis livos:platform:* + livos:domain:* keys
    3. Register a fresh cloudflared.service with the new user's token
    4. Write a fresh /etc/caddy/Caddyfile (livinityd rebuilds it post-install)

DONE

if [[ $DRY_RUN -eq 1 ]]; then
    info "DRY RUN — no changes made"
fi
exit 0
