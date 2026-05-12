# scripts/install/parse-cli.sh
# Sourced by scripts/install.sh. Parses --mode and --help.
# Exports: MODE (validated against whitelist)
#
# D-104-DEFAULT-MODE: hybrid is the default — covers iPhone/iPad/Mac users
# (largest LAN-client segment), zero relay traffic, only requires LivOS to host
# one apex DNS zone on Server5.
# D-104-INSTALL-MODES: whitelist is exactly { cloud, local-lan, hybrid }.

MODE="${MODE:-hybrid}"   # D-104-DEFAULT-MODE
MODE_WHITELIST="cloud local-lan hybrid"

print_help() {
    cat <<'HELP'
Usage: install.sh [--mode MODE] [--help]

LivOS one-shot installer. Provisions Caddy + Node + Postgres + Redis on a fresh
Ubuntu 24.04 system and starts the LivOS services.

Modes:
  cloud      *.livinity.io via Server5 relay; existing Mini PC path. Requires
             Cloudflare API token in CLOUDFLARE_API_TOKEN env.
  local-lan  *.livinity.local via dnsmasq + Caddy internal PKI. Fully air-gapped.
             Apple devices NOT supported (RFC 6762 + macOS 26 mDNS interception).
  hybrid     *.<random>.home.livinity.io with public DNS A-record to LAN IP and
             Let's Encrypt DNS-01 wildcard cert. Works on all Apple devices.
             Default. Requires CLOUDFLARE_API_TOKEN.

Examples:
  curl -fsSL https://livinity.io/install.sh | bash -s -- --mode hybrid
  CLOUDFLARE_API_TOKEN=xyz bash install.sh --mode hybrid
  bash install.sh --mode local-lan
  bash install.sh --mode cloud   # existing Mini PC path

Environment overrides:
  CLOUDFLARE_API_TOKEN  required for cloud + hybrid modes
  LIVINITY_LOCAL_TLD    override local-lan TLD (default: livinity.local)
  LIVINITY_HOST_IP      override auto-detected host IP
  NO_COLOR              disable ANSI colors
HELP
}

parse_cli() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --mode) MODE="${2:-}"; shift 2 ;;
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
}
