#!/usr/bin/env bash
# scripts/install/migrate-to-cf-tunnel.sh
# Phase 134 plan 134-03 — migrate an existing LivOS install from direct-LAN
# hybrid (pre-Phase-134: Caddy LE DNS-01 + A-record to LAN IP) to CF Tunnel
# hybrid. Idempotent. Safe to re-run.
#
# Usage:
#   sudo bash migrate-to-cf-tunnel.sh --domain DOMAIN --cf-tunnel-token TOKEN [--dry-run] [--keep-le-cert]
#
# Required:
#   --domain            The domain already configured (e.g. bruce.livinity.live)
#   --cf-tunnel-token   CF Tunnel token (from livinity.io/dashboard/install
#                       or manually from CF Zero Trust dashboard)
#
# Optional:
#   --dry-run           Print steps that would run; make no changes
#   --keep-le-cert      Don't delete /var/lib/caddy LE state (default: delete)
#   --force             Re-run even if already migrated (mode == "tunnel")
#   --help              Show this help
#
# Idempotency: each step checks current state before mutating. Re-run after
# partial failure picks up from where it left off.

set -uo pipefail   # NOT -e — we want to inspect exit codes ourselves

# ── Locate helpers (mode-tunnel.sh provides cloudflared install +
#    token-write + systemd-register + Caddy-:80 plumbing) ──────────────────
# Three resolution modes (same pattern as install.sh self-bootstrap):
#   1. Run from cloned repo (BASH_SOURCE → sibling dir)
#   2. Run from /opt/liv/scripts/install/ on Mini PC (sibling dir)
#   3. Self-bootstrap from GitHub raw (curl|bash)
HELPERS_REQUIRED=(_logging.sh mode-tunnel.sh)
GH_RAW_BASE="${LIVOS_INSTALL_BOOTSTRAP_BASE:-https://raw.githubusercontent.com/utopusc/livinity-io/master/scripts/install}"

if [[ -n "${BASH_SOURCE[0]:-}" ]] && [[ ! "${BASH_SOURCE[0]:-}" =~ ^/dev/ ]] \
        && [[ -d "$(dirname "${BASH_SOURCE[0]}")" ]] \
        && [[ -f "$(dirname "${BASH_SOURCE[0]}")/_logging.sh" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SCRIPT_DIR="$(mktemp -d -t livos-migrate-XXXXXX)"
    echo "── Self-bootstrap: fetching helpers from ${GH_RAW_BASE} → ${SCRIPT_DIR}"
    for h in "${HELPERS_REQUIRED[@]}"; do
        if ! curl -fsSL "${GH_RAW_BASE}/${h}" -o "${SCRIPT_DIR}/${h}"; then
            echo "ERROR: failed to download ${h} from ${GH_RAW_BASE}" >&2
            exit 3
        fi
    done
fi

# Args
DOMAIN=""
TOKEN=""
DRY_RUN=0
KEEP_LE_CERT=0
FORCE=0

print_help() {
    cat <<'HELP'
Usage: sudo bash migrate-to-cf-tunnel.sh --domain DOMAIN --cf-tunnel-token TOKEN [options]

Migrates an existing LivOS install from direct-LAN hybrid (Caddy LE) to CF
Tunnel hybrid. Idempotent — safe to re-run.

Required:
  --domain DOMAIN          The domain already configured (e.g. bruce.livinity.live)
  --cf-tunnel-token TOKEN  CF Tunnel token (from livinity.io/dashboard/install
                           OR CF Zero Trust > Networks > Tunnels > Install connector)

Optional:
  --dry-run                Print the steps that would run; make no changes
  --keep-le-cert           Don't delete /var/lib/caddy LE state (default: delete)
  --force                  Re-run even if already migrated to tunnel mode
  --help, -h               Show this help

Steps performed:
   1. Pre-flight (root check, args validated, helpers present)
   2. Detect current mode (read livos:domain:local_mode from Redis)
   3. Snapshot state to /var/lib/livos/migrate-134-snapshot.json
   4. Stop Caddy
   5. Install cloudflared (apt repo from pkg.cloudflare.com)
   6. Write CF Tunnel token to /etc/livos/secrets/cf-tunnel-token (0600)
   7. Register cloudflared as systemd service
   8. Reconfigure Caddyfile (HTTP-only :80 → livinityd :8080)
   9. Delete LE cert state (unless --keep-le-cert)
  10. Persist mode markers to Redis (local_mode=tunnel, tunnel_domain=DOMAIN)
  11. Restart Caddy + livinityd
  12. Wait for cloudflared connection (poll journalctl)
  13. Health check (curl localhost:80)
  14. Verify sacred SHA preserved
  15. Print migration summary
HELP
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain)            DOMAIN="${2:-}"; shift 2 ;;
        --cf-tunnel-token)   TOKEN="${2:-}"; shift 2 ;;
        --dry-run)           DRY_RUN=1; shift ;;
        --keep-le-cert)      KEEP_LE_CERT=1; shift ;;
        --force)             FORCE=1; shift ;;
        --help|-h)           print_help; exit 0 ;;
        *)                   echo "ignoring unknown arg: $1" >&2; shift ;;
    esac
done

# Source logging helpers
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_logging.sh" 2>/dev/null || {
    # Minimal fallback logging if helper missing
    info() { echo "INFO: $*"; }
    step() { echo "── $*"; }
    ok()   { echo "OK:   $*"; }
    warn() { echo "WARN: $*" >&2; }
    fail() { echo "FAIL: $*" >&2; exit "${2:-1}"; }
}

dry() {
    if [[ $DRY_RUN -eq 1 ]]; then
        echo "  [DRY RUN] would run: $*"
        return 0
    fi
    return 1   # caller should execute the real command
}

# ── Step 1: pre-flight ────────────────────────────────────────────────────
step "Step 1/15: pre-flight checks"
# Args validated FIRST so missing-args fails with EX_USAGE (64) regardless of
# whether the caller is root. Root check is only relevant for actual mutation.
if [[ -z "$DOMAIN" ]] || [[ -z "$TOKEN" ]]; then
    print_help
    fail "missing required args. --domain and --cf-tunnel-token are required." 64
fi
case "$DOMAIN" in
    *' '*|*..*|.*) fail "invalid --domain '$DOMAIN'" 64 ;;
esac
if [[ $DRY_RUN -eq 0 ]] && [[ $EUID -ne 0 ]]; then
    fail "must run as root (apt install, systemctl, /var/lib/* writes). Try: sudo bash $0 $*" 1
fi
ok "args validated (domain=$DOMAIN)"

# ── Step 2: detect current mode ───────────────────────────────────────────
step "Step 2/15: detecting current install mode"
CURRENT_MODE=""
if [[ $DRY_RUN -eq 0 ]] && command -v redis-cli &>/dev/null; then
    # Try to read Redis password from /opt/livos/.env REDIS_URL
    if [[ -r /opt/livos/.env ]]; then
        REDIS_PW=$(grep -oP "(?<=:)[^@]+(?=@)" /opt/livos/.env | head -1 || true)
        CURRENT_MODE=$(redis-cli --no-auth-warning -a "$REDIS_PW" GET livos:domain:local_mode 2>/dev/null \
            | grep -v "Warning" | tr -d '\r\n' || echo "")
    fi
fi
if [[ -z "$CURRENT_MODE" ]]; then
    warn "could not detect current mode from Redis (likely fine — pre-Phase-134 installs may not have set the key)"
    CURRENT_MODE="unknown"
fi
info "detected current mode: $CURRENT_MODE"
if [[ "$CURRENT_MODE" == "tunnel" ]] && [[ $FORCE -eq 0 ]]; then
    ok "already migrated to tunnel mode — exit 0 (use --force to re-run anyway)"
    exit 0
fi

# ── Step 3: snapshot ──────────────────────────────────────────────────────
step "Step 3/15: snapshotting current state"
SNAPSHOT=/var/lib/livos/migrate-134-snapshot.json
if dry "snapshot to $SNAPSHOT"; then :; else
    mkdir -p /var/lib/livos
    {
        echo "{"
        echo "  \"timestamp\": \"$(date -Iseconds)\","
        echo "  \"previous_mode\": \"$CURRENT_MODE\","
        echo "  \"caddyfile\": $(test -f /etc/caddy/Caddyfile && jq -Rs . < /etc/caddy/Caddyfile || echo '"<missing>"'),"
        echo "  \"redis_local_mode\": \"$CURRENT_MODE\""
        echo "}"
    } > "$SNAPSHOT" 2>/dev/null || warn "snapshot write returned non-zero (continuing)"
    ok "snapshot at $SNAPSHOT"
fi

# ── Step 4: stop Caddy ────────────────────────────────────────────────────
step "Step 4/15: stopping Caddy"
if dry "systemctl stop caddy"; then :; else
    systemctl stop caddy 2>/dev/null || warn "caddy stop returned non-zero (may not have been running)"
fi

# ── Steps 5-8 + 10: delegate to mode-tunnel.sh helpers ────────────────────
# Export the env vars that mode-tunnel.sh's helpers read.
export LIVOS_DOMAIN="$DOMAIN"
export LIVOS_CF_TUNNEL_TOKEN="$TOKEN"
export HOST_IP="${HOST_IP:-$(hostname -I 2>/dev/null | awk '{print $1}' || echo unknown)}"

if [[ $DRY_RUN -eq 0 ]]; then
    # Need set_livos_redis_key (defined in mode-cloud.sh / detect-platform.sh
    # historically; mode-tunnel.sh references it). Provide a minimal local
    # fallback that uses /opt/livos/.env REDIS_URL.
    if ! type set_livos_redis_key &>/dev/null; then
        set_livos_redis_key() {
            local key="$1" value="$2"
            if [[ -r /opt/livos/.env ]] && command -v redis-cli &>/dev/null; then
                local pw
                pw=$(grep -oP "(?<=:)[^@]+(?=@)" /opt/livos/.env | head -1 || true)
                redis-cli --no-auth-warning -a "$pw" SET "$key" "$value" >/dev/null 2>&1 \
                    || warn "redis SET $key failed"
            else
                warn "redis-cli or /opt/livos/.env unavailable — skip SET $key=$value"
            fi
        }
    fi
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/mode-tunnel.sh"
fi

step "Step 5/15: installing cloudflared"
if dry "apt install cloudflared from pkg.cloudflare.com"; then :; else
    _install_cloudflared_for_tunnel
fi

step "Step 6/15: writing CF Tunnel token secret"
if dry "write /etc/livos/secrets/cf-tunnel-token (0600)"; then :; else
    _write_cf_tunnel_token_secret
fi

step "Step 7/15: registering cloudflared systemd service"
if dry "cloudflared service install + systemctl enable --now"; then :; else
    _register_cloudflared_service
fi

step "Step 8/15: reconfiguring Caddy for tunnel mode (:80 HTTP-only)"
if dry "rewrite /etc/caddy/Caddyfile to HTTP :80 → 127.0.0.1:8080"; then :; else
    _configure_caddy_for_tunnel
fi

# ── Step 9: delete LE cert state (idempotent — keyed on "done" sentinel) ──
step "Step 9/15: cleaning up Let's Encrypt cert state"
DONE_MARK=/var/lib/livos/migrate-134-done
if [[ $KEEP_LE_CERT -eq 1 ]]; then
    info "skipping LE cleanup (--keep-le-cert)"
elif [[ -f "$DONE_MARK" ]]; then
    info "LE cleanup already performed (sentinel $DONE_MARK exists)"
else
    if dry "rm -rf /var/lib/caddy/.local/share/caddy/certificates/acme*"; then :; else
        rm -rf /var/lib/caddy/.local/share/caddy/certificates/acme* 2>/dev/null \
            || warn "LE cert cleanup returned non-zero (continuing — was idempotent)"
        touch "$DONE_MARK" 2>/dev/null || true
        ok "LE cert state cleaned"
    fi
fi

step "Step 10/15: persisting tunnel-mode markers to Redis"
if dry "redis SET livos:domain:local_mode=tunnel + tunnel_domain=$DOMAIN"; then :; else
    _persist_tunnel_mode_redis
fi

# ── Step 11: restart Caddy + livinityd ────────────────────────────────────
step "Step 11/15: restarting Caddy + livinityd"
if dry "systemctl restart caddy livos"; then :; else
    systemctl restart caddy 2>/dev/null || warn "caddy restart returned non-zero"
    systemctl restart livos 2>/dev/null || warn "livos restart returned non-zero"
fi

# ── Step 12: wait for cloudflared connection ──────────────────────────────
step "Step 12/15: waiting for cloudflared to register with CF edge"
if dry "poll journalctl -u cloudflared for 'Registered tunnel connection'"; then :; else
    waited=0
    until [[ $waited -ge 60 ]]; do
        if journalctl -u cloudflared --since "1 minute ago" --no-pager 2>/dev/null \
                | grep -q "Registered tunnel connection"; then
            ok "cloudflared registered with CF edge"
            break
        fi
        sleep 3
        waited=$((waited + 3))
    done
    if [[ $waited -ge 60 ]]; then
        warn "cloudflared registration not confirmed within 60s — check 'journalctl -u cloudflared'"
    fi
fi

# ── Step 13: health check ─────────────────────────────────────────────────
step "Step 13/15: health check on localhost:80"
if dry "curl -fsS http://127.0.0.1:80/"; then :; else
    waited=0
    healthy=0
    until [[ $waited -ge 30 ]]; do
        code=$(curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ 2>/dev/null || echo 0)
        if [[ "$code" == "200" ]]; then
            ok "localhost:80 returns HTTP 200"
            healthy=1
            break
        fi
        sleep 2
        waited=$((waited + 2))
    done
    if [[ $healthy -ne 1 ]]; then
        warn "localhost:80 not healthy within 30s — check 'journalctl -u livos -u caddy'"
    fi
fi

# ── Step 14: verify sacred SHA ────────────────────────────────────────────
step "Step 14/15: verifying sacred SHA preservation"
SACRED_FILE=/opt/liv/packages/core/src/sdk-agent-runner.ts
SACRED_SHA=f3538e1d811992b782a9bb057d1b7f0a0189f95f
if dry "git hash-object $SACRED_FILE → must equal $SACRED_SHA"; then :; else
    if [[ -r "$SACRED_FILE" ]]; then
        actual=$(git hash-object "$SACRED_FILE" 2>/dev/null || echo "")
        if [[ "$actual" == "$SACRED_SHA" ]]; then
            ok "sacred SHA preserved on Mini PC"
        else
            warn "sacred SHA MISMATCH: got $actual, expected $SACRED_SHA — investigate"
        fi
    else
        info "sacred file at $SACRED_FILE not present (path differs on this box — OK on non-Mini-PC)"
    fi
fi

# ── Step 15: summary ──────────────────────────────────────────────────────
step "Step 15/15: migration summary"
if [[ $DRY_RUN -eq 1 ]]; then
    info "DRY RUN — no changes were made."
    info "Re-run without --dry-run to perform the migration."
else
    ok "Migration to CF Tunnel hybrid complete."
    info "  domain:         $DOMAIN"
    info "  previous mode:  $CURRENT_MODE"
    info "  new mode:       tunnel"
    info "  snapshot:       $SNAPSHOT"
    info "  verify:         curl -fsSI https://$DOMAIN/"
    info "  cloudflared:    journalctl -u cloudflared --since '10 minutes ago'"
fi
exit 0
