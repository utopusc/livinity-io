# scripts/install/parse-cli.sh
# Sourced by scripts/install.sh. Parses --mode, --domain, --cf-token,
# --cf-zone-id, and --help.
# Exports: MODE (validated against whitelist), LIVOS_DOMAIN, LIVOS_CF_TOKEN,
#          LIVOS_CF_ZONE_ID
#
# D-104-DEFAULT-MODE: hybrid is the default — covers iPhone/iPad/Mac users
# (largest LAN-client segment), zero relay traffic, only requires LivOS to host
# one apex DNS zone on Server5.
# D-104-INSTALL-MODES: whitelist is exactly { cloud, local-lan, hybrid }.
#
# Plan 104-08 hotfix (2026-05-12): adds user-owned-domain support to hybrid mode.
# When --domain is supplied, mode-hybrid.sh skips the Server5 control-plane mint
# entirely (D-104-RELAY-ZERO-DATA-PLANE — fewer Server5 touches is always better)
# and uses the user's own Cloudflare zone for DNS-01 + A-record.

MODE="${MODE:-hybrid}"   # D-104-DEFAULT-MODE
MODE_WHITELIST="cloud local-lan hybrid"

# Plan 104-08 — user-owned domain bypass (env-var form; CLI flags below also set
# these). Honoring env overrides keeps the install.sh-piped-via-curl ergonomics
# matched by `LIVOS_DOMAIN=foo.com bash install.sh --mode hybrid` for users who
# can't pass long arg lists through their pipeline.
LIVOS_DOMAIN="${LIVOS_DOMAIN:-}"
LIVOS_CF_TOKEN="${LIVOS_CF_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
LIVOS_CF_ZONE_ID="${LIVOS_CF_ZONE_ID:-}"

print_help() {
    cat <<'HELP'
Usage: install.sh [--mode MODE] [--domain DOMAIN --cf-token TOKEN --cf-zone-id ZONE_ID] [--help]

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

Examples:
  # Default hybrid via Server5 mint (greenfield install)
  curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --mode hybrid

  # User-owned-domain hybrid (zero Server5 touch — recommended for power users)
  curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
      --mode hybrid \
      --domain bruce.bruceoz.com \
      --cf-token <CF_API_TOKEN> \
      --cf-zone-id <CF_ZONE_ID>

  # Other modes
  bash install.sh --mode local-lan
  bash install.sh --mode cloud   # existing Mini PC path

Environment overrides (set instead of --flag if you can't pass long args):
  CLOUDFLARE_API_TOKEN  required for cloud + default-hybrid (Server5 mint) modes
  LIVOS_DOMAIN          equivalent to --domain
  LIVOS_CF_TOKEN        equivalent to --cf-token (also CLOUDFLARE_API_TOKEN)
  LIVOS_CF_ZONE_ID      equivalent to --cf-zone-id
  LIVINITY_LOCAL_TLD    override local-lan TLD (default: livinity.local)
  LIVINITY_HOST_IP      override auto-detected host IP
  NO_COLOR              disable ANSI colors

CGNAT warning (hybrid mode):
  Hybrid mode requires a public IP for inbound LAN-direct connections. If your
  ISP places you behind CGNAT (typical for apartment / condo / cellular ISPs;
  the gateway in 100.64.0.0/10), hybrid mode WILL NOT WORK because clients
  outside your LAN cannot reach your host. Use --mode local-lan instead, or
  wait for v34 Cloudflare Tunnel support (research issue #v34-tunnel).
HELP
}

parse_cli() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --mode) MODE="${2:-}"; shift 2 ;;
            --domain) LIVOS_DOMAIN="${2:-}"; shift 2 ;;
            --cf-token) LIVOS_CF_TOKEN="${2:-}"; shift 2 ;;
            --cf-zone-id) LIVOS_CF_ZONE_ID="${2:-}"; shift 2 ;;
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
        echo "ERROR: invalid --mode '$MODE'. Use: cloud | local-lan | hybrid" >&2
        echo "See: bash install.sh --help" >&2
        exit 64   # EX_USAGE per sysexits.h
    fi
    info "Mode: $MODE"

    # Plan 104-08 — when --domain is set, the partner flags MUST be set too.
    # We don't fall through to an interactive prompt here because the typical
    # invocation is `curl | bash` where stdin is the pipe (no tty) — interactive
    # `read` would hang the install. Operators who want interactive flow can
    # `wget install.sh && bash install.sh` instead, and we'll prompt downstream
    # in mode-hybrid.sh if applicable.
    if [[ -n "$LIVOS_DOMAIN" ]]; then
        if [[ "$MODE" != "hybrid" ]]; then
            echo "ERROR: --domain is only valid with --mode hybrid (got --mode $MODE)" >&2
            exit 64
        fi
        local missing=""
        [[ -z "$LIVOS_CF_TOKEN" ]] && missing+=" --cf-token"
        [[ -z "$LIVOS_CF_ZONE_ID" ]] && missing+=" --cf-zone-id"
        if [[ -n "$missing" ]]; then
            echo "ERROR: --domain '$LIVOS_DOMAIN' requires:$missing" >&2
            echo "See: bash install.sh --help" >&2
            exit 64
        fi
        # Light shape check — refuse traversal / spaces / leading dot. Stricter
        # FQDN validation is the caller's problem; we just guard against the
        # most common copy-paste mistakes that would torpedo Caddy + CF API.
        case "$LIVOS_DOMAIN" in
            *' '*|*..*|.*) echo "ERROR: invalid --domain '$LIVOS_DOMAIN'" >&2; exit 64 ;;
        esac
        info "User-owned domain: $LIVOS_DOMAIN (Server5 mint will be SKIPPED)"
    fi

    # Export so sub-shells / sourced helpers can read them. Belt-and-suspenders
    # — `source` already shares scope, but mode-hybrid.sh's curl call to the CF
    # API runs in a subshell-friendly pattern so we make the env unambiguous.
    export LIVOS_DOMAIN LIVOS_CF_TOKEN LIVOS_CF_ZONE_ID
}
