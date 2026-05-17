# scripts/install/parse-cli.sh
# Sourced by scripts/install.sh. Parses --mode, --domain, --subdomain, --cf-token,
# --cf-zone-id, --cf-tunnel-token, --api-key, and --help.
# Exports: MODE (validated against whitelist), LIVOS_DOMAIN, LIVOS_SUBDOMAIN,
#          LIVOS_CF_TOKEN, LIVOS_CF_ZONE_ID, LIVOS_CF_TUNNEL_TOKEN, LIVOS_API_KEY
#
# Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
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
#
# Plan 140-07 (2026-05-17): adds `--subdomain X` as the primary user-facing flag.
# Derives `LIVOS_DOMAIN=X.livinity.io` internally when only --subdomain is given.
# When --api-key is set but --cf-tunnel-token is not, mode-tunnel.sh fetches the
# token at runtime from /api/me/tunnel-token (CF for SaaS multi-tenant flow).
# Backward-compat: `--domain X.livinity.io --cf-tunnel-token Y` continues to work.

MODE="${MODE:-hybrid}"   # D-104-DEFAULT-MODE
MODE_WHITELIST="cloud local-lan hybrid tunnel"

# Plan 104-08 — user-owned domain bypass (env-var form; CLI flags below also set
# these). Honoring env overrides keeps the install.sh-piped-via-curl ergonomics
# matched by `LIVOS_DOMAIN=foo.com bash install.sh --mode hybrid` for users who
# can't pass long arg lists through their pipeline.
LIVOS_DOMAIN="${LIVOS_DOMAIN:-}"
LIVOS_CF_TOKEN="${LIVOS_CF_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
LIVOS_CF_ZONE_ID="${LIVOS_CF_ZONE_ID:-}"

# Plan 140-07 — `--subdomain X` (primary UX flag). When set without --domain, we
# derive LIVOS_DOMAIN="${X}.livinity.io" downstream. Both set at once is an
# error (operator confused which one they meant); neither set + hybrid mode is
# an error unless backward-compat --domain is also supplied.
LIVOS_SUBDOMAIN="${LIVOS_SUBDOMAIN:-}"

# Plan 104-09 — tunnel-mode CF Tunnel token (DIFFERENT thing from LIVOS_CF_TOKEN;
# the tunnel token comes from the CF dashboard > Zero Trust > Networks > Tunnels
# panel as a long opaque blob, whereas LIVOS_CF_TOKEN is a Cloudflare API token
# scoped to Zone:DNS:Edit). Kept as a separate var to avoid mistaken cross-wiring.
# LIVOS_API_KEY is the marketplace-integration key (liv_k_*), works in all modes.
LIVOS_CF_TUNNEL_TOKEN="${LIVOS_CF_TUNNEL_TOKEN:-}"
LIVOS_API_KEY="${LIVOS_API_KEY:-}"

# Plan 104-11 — --skip-deploy flag. When set, install.sh runs TLS/DNS/Caddy
# bootstrap (the legacy 104-08 / 104-09 behavior) but skips the new
# deploy_livinityd step. Useful for operators who only want the network
# scaffolding (e.g. testing CF DNS pipeline without spinning up Postgres).
# Default behavior: DEPLOY (SKIP_DEPLOY=0) — the "single line install" UX
# that lands you at the LivOS UI in the browser.
SKIP_DEPLOY="${SKIP_DEPLOY:-0}"

print_help() {
    cat <<'HELP'
Usage: install.sh [--mode MODE] [mode-specific flags] [--api-key KEY] [--help]

LivOS one-shot installer. Provisions Caddy + Node + Postgres + Redis on a fresh
Ubuntu 24.04 system and starts the LivOS services.

Modes:
  hybrid     DEFAULT. Cloudflare Tunnel transport (cloudflared outbound).
             Works on any device with outbound HTTPS — no public IP, no port-
             forward, no CGNAT concerns. CF terminates TLS at the edge; Caddy
             serves plain HTTP on localhost:80. Universal: VPS, VDS, Mini PC,
             home boxes — all install the same way. Get the install command
             from https://livinity.io/dashboard/install (it pre-fills the
             --cf-tunnel-token for you). (Phase 134.)
  tunnel     Alias for hybrid (kept for backward compat with pre-Phase-134
             docs / scripts). Identical behavior.
  cloud      *.livinity.io via Server5 relay (Mini PC legacy path). Use only
             if you specifically want the Server5-managed subdomain. Requires
             CLOUDFLARE_API_TOKEN env.
  local-lan  *.livinity.local via dnsmasq + Caddy internal PKI. Fully air-
             gapped. Apple devices NOT supported (RFC 6762 + macOS 26 mDNS
             interception).

Tunnel-transport flags (hybrid + tunnel modes — Phase 134, updated Phase 140):
  --subdomain SUB          The subdomain part of your livinity.io address
                           (e.g. `lucy` for lucy.livinity.io). REQUIRED for
                           hybrid mode unless --domain is supplied instead.
                           The full domain is derived as ${SUB}.livinity.io.
                           Phase 140-07.
  --domain DOMAIN          Your own apex domain or LivOS-managed FQDN (e.g.
                           bruce.livinity.live or yourbox.bruceoz.com).
                           Backward-compat alternative to --subdomain;
                           takes the full FQDN instead of just the subdomain
                           part. Don't pass both.
  --cf-tunnel-token TOKEN  Cloudflare Tunnel token. OPTIONAL when --api-key is
                           also passed — token is fetched automatically from
                           livinity.io/api/me/tunnel-token at install time.
                           Pass --api-key from your livinity.io dashboard —
                           token is fetched automatically.

Legacy CF DNS flags (back-compat only — no longer used by hybrid/tunnel):
  --cf-token TOKEN         Pre-Phase-134 CF API token for DNS-01 wildcard
                           cert issuance. Ignored by hybrid/tunnel modes
                           (CF Tunnel handles cert + DNS server-side).
                           Still consumed by `cloud` mode if present.
  --cf-zone-id ZONE_ID     Pre-Phase-134 CF zone ID for direct-LAN A-record.
                           Ignored by hybrid/tunnel modes.

Marketplace API key (optional, works in all modes):
  --api-key KEY            LivOS marketplace API key (liv_k_...). Saved to
                           /etc/livos/secrets/api-key (mode 0600) for future
                           marketplace integration. Refuses keys not prefixed
                           with `liv_k_` (matches Server5 schema).

Application deploy (Plan 104-11):
  --skip-deploy            Skip the full livinityd deploy step (install
                           Node + pnpm + Postgres + Redis, clone source,
                           build UI, write /opt/livos/.env, install
                           livos.service systemd unit, health-check :8080,
                           update Caddyfile to reverse_proxy :8080). When
                           set, install.sh only runs the TLS/DNS/Caddy
                           bootstrap — equivalent to the pre-104-11
                           behavior. DEFAULT: deploy (UI loads in browser
                           after install.sh exits 0).

Examples:
  # Phase 140 — minimal subdomain-only one-liner. --api-key auto-fetches the
  # tunnel token from livinity.io/api/me/tunnel-token. Works on any device
  # with outbound HTTPS — no port-forward, no public IP, no CGNAT concerns.
  curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
      --subdomain lucy \
      --api-key liv_k_<from-dashboard>

  # Backward-compat — full --domain + --cf-tunnel-token still works for
  # operators with existing automation.
  curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
      --mode hybrid \
      --domain bruce.livinity.live \
      --api-key liv_k_<from-wizard> \
      --cf-tunnel-token <auto-from-wizard>

  # `--mode tunnel` is a backward-compat alias for hybrid (both use CF Tunnel
  # transport since Phase 134). Same flags apply.
  bash install.sh --mode tunnel --domain bruce.bruceoz.com --cf-tunnel-token <tok>

  # Other modes
  bash install.sh --mode local-lan
  bash install.sh --mode cloud   # Mini PC legacy path (Server5-managed subdomain)

Environment overrides (set instead of --flag if you can't pass long args):
  CLOUDFLARE_API_TOKEN     required for cloud mode only (Server5 mint)
  LIVOS_DOMAIN             equivalent to --domain
  LIVOS_SUBDOMAIN          equivalent to --subdomain (Plan 140-07)
  LIVOS_CF_TOKEN           equivalent to --cf-token (also CLOUDFLARE_API_TOKEN)
  LIVOS_CF_ZONE_ID         equivalent to --cf-zone-id
  LIVOS_CF_TUNNEL_TOKEN    equivalent to --cf-tunnel-token (Plan 104-09)
  LIVOS_API_KEY            equivalent to --api-key (Plan 104-09)
  LIVINITY_LOCAL_TLD       override local-lan TLD (default: livinity.local)
  LIVINITY_HOST_IP         override auto-detected host IP
  NO_COLOR                 disable ANSI colors

CGNAT note (hybrid + tunnel modes — Phase 134+):
  Hybrid mode now uses Cloudflare Tunnel (cloudflared outbound) as transport
  (Phase 134). CGNAT is FINE — cloudflared dials OUT to CF's edge, so no
  inbound connectivity is required from the operator's ISP.
HELP
}

parse_cli() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --mode) MODE="${2:-}"; shift 2 ;;
            --domain) LIVOS_DOMAIN="${2:-}"; shift 2 ;;
            --subdomain) LIVOS_SUBDOMAIN="${2:-}"; shift 2 ;;
            --cf-token) LIVOS_CF_TOKEN="${2:-}"; shift 2 ;;
            --cf-zone-id) LIVOS_CF_ZONE_ID="${2:-}"; shift 2 ;;
            --cf-tunnel-token) LIVOS_CF_TUNNEL_TOKEN="${2:-}"; shift 2 ;;
            --api-key) LIVOS_API_KEY="${2:-}"; shift 2 ;;
            --skip-deploy) SKIP_DEPLOY=1; shift ;;
            --help|-h) print_help; exit 0 ;;
            --) shift; break ;;
            *) warn "ignoring unknown arg: $1"; shift ;;
        esac
    done

    # Plan 140-07 — --subdomain ↔ --domain precedence.
    # Reject both-set (operator confused which one they meant) BEFORE the
    # mode-whitelist check so the error is the most actionable one.
    if [[ -n "$LIVOS_SUBDOMAIN" ]] && [[ -n "$LIVOS_DOMAIN" ]]; then
        echo "ERROR: Pick either --subdomain or --domain, not both." >&2
        echo "  --subdomain X  → derives --domain X.livinity.io (Phase 140 default)" >&2
        echo "  --domain X.Y   → backward-compat for operators with their own apex" >&2
        exit 64
    fi
    # Derive LIVOS_DOMAIN from LIVOS_SUBDOMAIN when only the latter is set.
    # Light shape check on the subdomain — refuse spaces / dots (it's the LABEL,
    # not the FQDN) / leading-trailing dash. Stricter validation lives at the
    # /api/me/tunnel-token endpoint; we just block the most common mis-uses.
    if [[ -n "$LIVOS_SUBDOMAIN" ]]; then
        case "$LIVOS_SUBDOMAIN" in
            *' '*|*.*|-*|*-)
                echo "ERROR: invalid --subdomain '$LIVOS_SUBDOMAIN' (no dots, spaces, or leading/trailing dashes)" >&2
                exit 64
                ;;
        esac
        LIVOS_DOMAIN="${LIVOS_SUBDOMAIN}.livinity.io"
        info "Subdomain: $LIVOS_SUBDOMAIN → derived domain: $LIVOS_DOMAIN (Plan 140-07)"
    fi

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
            hybrid|tunnel)
                # Phase 134 — both modes use CF Tunnel transport. --domain
                # validation (shape) happens below; the required-flag check
                # (--cf-tunnel-token) lives in the unified tunnel-gating block.
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
        info "Domain: $LIVOS_DOMAIN (Cloudflare Tunnel terminates TLS at the edge — D-134-MODE)"
    fi

    # Phase 134 — unified tunnel-transport gating. Both `--mode hybrid` (default)
    # and `--mode tunnel` (back-compat alias) require a domain (either --subdomain
    # or --domain) AND a tunnel token (either --cf-tunnel-token or --api-key for
    # runtime fetch — see Plan 140-07).
    # --cf-tunnel-token is REJECTED in any other mode (cloud / local-lan) so
    # operators don't accidentally wire it where it's unused.
    if [[ "$MODE" == "hybrid" || "$MODE" == "tunnel" ]]; then
        # Domain gate: at this point LIVOS_DOMAIN is set if either --domain or
        # --subdomain was passed (the derivation above propagates --subdomain).
        if [[ -z "$LIVOS_DOMAIN" ]]; then
            echo "ERROR: --mode $MODE requires --subdomain X (or --domain X.Y for backward-compat)." >&2
            echo "Get the full install command from https://livinity.io/dashboard/install" >&2
            echo "(or see: bash install.sh --help)" >&2
            exit 64
        fi
        # Token gate: --cf-tunnel-token OR --api-key (which triggers a runtime
        # fetch in mode-tunnel.sh). Both missing → fail with a clear menu.
        # NOTE: error string MUST keep `requires.*--cf-tunnel-token` in one line
        # so test-mode-tunnel-args.sh TEST 2 + TEST 10 regex assertions still
        # match. Plan 140-07: add the `or --api-key` clause without breaking
        # backward-compat tests.
        if [[ -z "$LIVOS_CF_TUNNEL_TOKEN" ]] && [[ -z "$LIVOS_API_KEY" ]]; then
            echo "ERROR: --mode $MODE requires --cf-tunnel-token (manual) or --api-key (auto-fetch)." >&2
            echo "Get an --api-key from https://livinity.io/dashboard (Plan 140-07)." >&2
            echo "(or see: bash install.sh --help)" >&2
            exit 64
        fi
        # When the operator passed --api-key but no --cf-tunnel-token, mode-
        # tunnel.sh fetches the token from /api/me/tunnel-token at install time.
        # Log it here so the dry-run / arg-parse pass tells the operator what
        # will happen downstream.
        if [[ -z "$LIVOS_CF_TUNNEL_TOKEN" ]] && [[ -n "$LIVOS_API_KEY" ]]; then
            info "--cf-tunnel-token not set; will fetch from /api/me/tunnel-token at install time (Plan 140-07)"
        fi
    elif [[ -n "$LIVOS_CF_TUNNEL_TOKEN" ]]; then
        echo "ERROR: --cf-tunnel-token is only valid with --mode hybrid or --mode tunnel (got --mode $MODE)" >&2
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
    # Plan 104-11 — export SKIP_DEPLOY too (read by install.sh tail dispatch).
    # Plan 140-07 — export LIVOS_SUBDOMAIN for logging / banner consumption.
    export LIVOS_DOMAIN LIVOS_SUBDOMAIN LIVOS_CF_TOKEN LIVOS_CF_ZONE_ID \
           LIVOS_CF_TUNNEL_TOKEN LIVOS_API_KEY \
           SKIP_DEPLOY
}
