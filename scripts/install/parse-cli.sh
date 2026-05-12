# scripts/install/parse-cli.sh
# Sourced by scripts/install.sh. Parses --mode, --domain, --cf-token,
# --cf-zone-id, --cf-tunnel-token, --api-key, and --help.
# Exports: MODE (validated against whitelist), LIVOS_DOMAIN, LIVOS_CF_TOKEN,
#          LIVOS_CF_ZONE_ID, LIVOS_CF_TUNNEL_TOKEN, LIVOS_API_KEY
#
# D-104-DEFAULT-MODE: hybrid is the default — covers iPhone/iPad/Mac users
# (largest LAN-client segment), zero relay traffic, only requires LivOS to host
# one apex DNS zone on Server5.
# D-104-INSTALL-MODES: whitelist is { cloud, local-lan, hybrid, tunnel }.
#
# Plan 104-08 hotfix (2026-05-12): adds user-owned-domain support to hybrid mode.
# When --domain is supplied, mode-hybrid.sh skips the Server5 control-plane mint
# entirely (D-104-RELAY-ZERO-DATA-PLANE — fewer Server5 touches is always better)
# and uses the user's own Cloudflare zone for DNS-01 + A-record.
#
# Plan 104-09 hotfix (2026-05-12): adds a 4th install mode `tunnel` — Cloudflare
# Tunnel (cloudflared) outbound-only connectivity. Bypasses public IP / CGNAT /
# port-forward requirements ENTIRELY. Server5 relay UNTOUCHED (zero data-plane).
# Also adds an orthogonal `--api-key liv_k_...` flag (saves it to disk for future
# marketplace integration) usable with ANY mode.

MODE="${MODE:-hybrid}"   # D-104-DEFAULT-MODE
MODE_WHITELIST="cloud local-lan hybrid tunnel"

# Plan 104-08 — user-owned domain bypass (env-var form; CLI flags below also set
# these). Honoring env overrides keeps the install.sh-piped-via-curl ergonomics
# matched by `LIVOS_DOMAIN=foo.com bash install.sh --mode hybrid` for users who
# can't pass long arg lists through their pipeline.
LIVOS_DOMAIN="${LIVOS_DOMAIN:-}"
LIVOS_CF_TOKEN="${LIVOS_CF_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
LIVOS_CF_ZONE_ID="${LIVOS_CF_ZONE_ID:-}"

# Plan 104-09 — tunnel-mode CF Tunnel token (DIFFERENT thing from LIVOS_CF_TOKEN;
# the tunnel token comes from the CF dashboard > Zero Trust > Networks > Tunnels
# panel as a long opaque blob, whereas LIVOS_CF_TOKEN is a Cloudflare API token
# scoped to Zone:DNS:Edit). Kept as a separate var to avoid mistaken cross-wiring.
# LIVOS_API_KEY is the marketplace-integration key (liv_k_*), works in all modes.
LIVOS_CF_TUNNEL_TOKEN="${LIVOS_CF_TUNNEL_TOKEN:-}"
LIVOS_API_KEY="${LIVOS_API_KEY:-}"

print_help() {
    cat <<'HELP'
Usage: install.sh [--mode MODE] [mode-specific flags] [--api-key KEY] [--help]

LivOS one-shot installer. Provisions Caddy + Node + Postgres + Redis on a fresh
Ubuntu 24.04 system and starts the LivOS services.

Modes:
  cloud      *.livinity.io via Server5 relay; existing Mini PC path. Requires
             Cloudflare API token in CLOUDFLARE_API_TOKEN env.
  local-lan  *.livinity.local via dnsmasq + Caddy internal PKI. Fully air-gapped.
             Apple devices NOT supported (RFC 6762 + macOS 26 mDNS interception).
  hybrid     *.<random>.home.livinity.io with public DNS A-record to LAN IP and
             Let's Encrypt DNS-01 wildcard cert. Works on all Apple devices.
             Default. Requires CLOUDFLARE_API_TOKEN (or --cf-token).
  tunnel     User-owned domain via Cloudflare Tunnel (cloudflared). Outbound-only
             — no public IP, no port-forward, CGNAT-compatible. CF terminates
             TLS at the edge; Caddy serves plain HTTP on localhost:80. Zero
             Server5 data-plane traffic. (Plan 104-09 hotfix.)

User-owned-domain hybrid (Plan 104-08 hotfix):
  --domain DOMAIN          Your own domain, e.g. bruce.bruceoz.com. When set,
                           install.sh skips the Server5 control-plane mint and
                           wires Caddy to use *.DOMAIN + LE DNS-01 directly.
                           Cuts Server5 out of the critical path entirely.
  --cf-token TOKEN         Cloudflare API token with Zone:DNS:Edit scope on the
                           --domain zone. REQUIRED when --domain is set.
  --cf-zone-id ZONE_ID     Cloudflare zone ID for the --domain. REQUIRED when
                           --domain is set. Find it: cloudflare.com > zone >
                           Overview pane (right rail, "Zone ID").

Tunnel mode (Plan 104-09 hotfix):
  --domain DOMAIN          Your own domain, e.g. bruceoz.com. The CF Tunnel
                           you pre-create must be assigned to this zone in the
                           CF dashboard. REQUIRED for --mode tunnel.
  --cf-tunnel-token TOKEN  Cloudflare Tunnel token (NOT a CF API token — this
                           comes from CF dashboard > Zero Trust > Networks >
                           Tunnels > Configure > Install connector > token).
                           REQUIRED for --mode tunnel. Pre-configure your
                           Public Hostname routing in the CF dashboard to point
                           e.g. `*.bruceoz.com` -> `http://localhost:80`.

Marketplace API key (optional, works in all modes):
  --api-key KEY            LivOS marketplace API key (liv_k_...). Saved to
                           /etc/livos/secrets/api-key (mode 0600) for future
                           marketplace integration. Refuses keys not prefixed
                           with `liv_k_` (matches Server5 schema).

Examples:
  # Default hybrid via Server5 mint (greenfield install)
  curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --mode hybrid

  # User-owned-domain hybrid (zero Server5 touch — recommended for power users)
  curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
      --mode hybrid \
      --domain bruce.bruceoz.com \
      --cf-token <CF_API_TOKEN> \
      --cf-zone-id <CF_ZONE_ID>

  # Tunnel mode (CGNAT-friendly, no public IP needed)
  curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
      --mode tunnel \
      --domain bruceoz.com \
      --cf-tunnel-token <CF_TUNNEL_TOKEN> \
      --api-key liv_k_iCCxIa7vlFgbpOl-fPwd

  # Other modes
  bash install.sh --mode local-lan
  bash install.sh --mode cloud   # existing Mini PC path

Environment overrides (set instead of --flag if you can't pass long args):
  CLOUDFLARE_API_TOKEN     required for cloud + default-hybrid (Server5 mint)
  LIVOS_DOMAIN             equivalent to --domain
  LIVOS_CF_TOKEN           equivalent to --cf-token (also CLOUDFLARE_API_TOKEN)
  LIVOS_CF_ZONE_ID         equivalent to --cf-zone-id
  LIVOS_CF_TUNNEL_TOKEN    equivalent to --cf-tunnel-token (Plan 104-09)
  LIVOS_API_KEY            equivalent to --api-key (Plan 104-09)
  LIVINITY_LOCAL_TLD       override local-lan TLD (default: livinity.local)
  LIVINITY_HOST_IP         override auto-detected host IP
  NO_COLOR                 disable ANSI colors

CGNAT warning (hybrid mode):
  Hybrid mode requires a public IP for inbound LAN-direct connections. If your
  ISP places you behind CGNAT (typical for apartment / condo / cellular ISPs;
  the gateway in 100.64.0.0/10), hybrid mode WILL NOT WORK because clients
  outside your LAN cannot reach your host. Use --mode tunnel instead (Plan
  104-09) — tunnel mode is outbound-only and works behind CGNAT.
HELP
}

parse_cli() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --mode) MODE="${2:-}"; shift 2 ;;
            --domain) LIVOS_DOMAIN="${2:-}"; shift 2 ;;
            --cf-token) LIVOS_CF_TOKEN="${2:-}"; shift 2 ;;
            --cf-zone-id) LIVOS_CF_ZONE_ID="${2:-}"; shift 2 ;;
            --cf-tunnel-token) LIVOS_CF_TUNNEL_TOKEN="${2:-}"; shift 2 ;;
            --api-key) LIVOS_API_KEY="${2:-}"; shift 2 ;;
            --help|-h) print_help; exit 0 ;;
            --) shift; break ;;
            *) warn "ignoring unknown arg: $1"; shift ;;
        esac
    done

    local valid=0
    for m in $MODE_WHITELIST; do
        [[ "$MODE" == "$m" ]] && valid=1 && break
    done
    if [[ $valid -ne 1 ]]; then
        echo "ERROR: invalid --mode '$MODE'. Use: cloud | local-lan | hybrid | tunnel" >&2
        echo "See: bash install.sh --help" >&2
        exit 64   # EX_USAGE per sysexits.h
    fi
    info "Mode: $MODE"

    # Plan 104-08 — when --domain is set in hybrid mode, the partner flags MUST
    # be set too. Plan 104-09 — tunnel mode also accepts --domain (and REQUIRES
    # it together with --cf-tunnel-token). Reject --domain in any OTHER mode.
    # We don't fall through to an interactive prompt because the typical
    # invocation is `curl | bash` where stdin is the pipe (no tty).
    if [[ -n "$LIVOS_DOMAIN" ]]; then
        case "$MODE" in
            hybrid)
                local missing=""
                [[ -z "$LIVOS_CF_TOKEN" ]] && missing+=" --cf-token"
                [[ -z "$LIVOS_CF_ZONE_ID" ]] && missing+=" --cf-zone-id"
                if [[ -n "$missing" ]]; then
                    echo "ERROR: --domain '$LIVOS_DOMAIN' requires:$missing" >&2
                    echo "See: bash install.sh --help" >&2
                    exit 64
                fi
                ;;
            tunnel)
                # Tunnel-mode --domain validation lives in the dedicated block
                # below (alongside --cf-tunnel-token), to keep all tunnel-mode
                # gating in one place. Fall through to the shape-check.
                ;;
            *)
                echo "ERROR: --domain is only valid with --mode hybrid or --mode tunnel (got --mode $MODE)" >&2
                exit 64
                ;;
        esac
        # Light shape check — refuse traversal / spaces / leading dot. Stricter
        # FQDN validation is the caller's problem; we just guard against the
        # most common copy-paste mistakes that would torpedo Caddy + CF API.
        case "$LIVOS_DOMAIN" in
            *' '*|*..*|.*) echo "ERROR: invalid --domain '$LIVOS_DOMAIN'" >&2; exit 64 ;;
        esac
        if [[ "$MODE" == "hybrid" ]]; then
            info "User-owned domain: $LIVOS_DOMAIN (Server5 mint will be SKIPPED)"
        else
            info "Tunnel domain: $LIVOS_DOMAIN (Cloudflare Tunnel terminates TLS at the edge)"
        fi
    fi

    # Plan 104-09 — tunnel-mode gating. Tunnel mode REQUIRES both --domain
    # (already shape-validated above when present) AND --cf-tunnel-token. We
    # reject --cf-tunnel-token in any other mode so operators don't accidentally
    # mix the CF Tunnel token with a hybrid/cloud install where it's unused.
    if [[ "$MODE" == "tunnel" ]]; then
        local missing=""
        [[ -z "$LIVOS_DOMAIN" ]] && missing+=" --domain"
        [[ -z "$LIVOS_CF_TUNNEL_TOKEN" ]] && missing+=" --cf-tunnel-token"
        if [[ -n "$missing" ]]; then
            echo "ERROR: --mode tunnel requires:$missing" >&2
            echo "See: bash install.sh --help" >&2
            exit 64
        fi
    elif [[ -n "$LIVOS_CF_TUNNEL_TOKEN" ]]; then
        echo "ERROR: --cf-tunnel-token is only valid with --mode tunnel (got --mode $MODE)" >&2
        exit 64
    fi

    # Plan 104-09 — --api-key shape check. We refuse keys that don't start with
    # `liv_k_` (Server5 marketplace schema). Empty / unset is OK in every mode
    # (it's an OPTIONAL flag for future marketplace integration).
    if [[ -n "$LIVOS_API_KEY" ]]; then
        case "$LIVOS_API_KEY" in
            liv_k_*) info "Marketplace API key: $(echo "$LIVOS_API_KEY" | cut -c1-10)... (will save to /etc/livos/secrets/api-key)" ;;
            *)
                echo "ERROR: --api-key must start with 'liv_k_' (got prefix '$(echo "$LIVOS_API_KEY" | cut -c1-6)...')" >&2
                exit 64
                ;;
        esac
    fi

    # Export so sub-shells / sourced helpers can read them. Belt-and-suspenders
    # — `source` already shares scope, but mode-hybrid.sh's curl call to the CF
    # API runs in a subshell-friendly pattern so we make the env unambiguous.
    # Plan 104-09 — export tunnel-mode + api-key vars too.
    export LIVOS_DOMAIN LIVOS_CF_TOKEN LIVOS_CF_ZONE_ID \
           LIVOS_CF_TUNNEL_TOKEN LIVOS_API_KEY
}
