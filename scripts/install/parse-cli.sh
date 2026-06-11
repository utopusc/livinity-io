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
#
# Plan 145-01 (2026-05-17): adds api-key→subdomain auto-resolution. When --api-key
# is set, install.sh calls https://livinity.io/api/me/profile (X-API-Key:
# $LIVOS_API_KEY) and either auto-fills LIVOS_SUBDOMAIN (if unset) or WARNS +
# overrides on mismatch. The conflict path also covers --domain X.Y.Z whose
# left-most label disagrees with the api-key owner's username; in that case the
# domain is also overridden to <owner>.livinity.io. Never fail-stop on conflict
# (user contract: "patlamasin").

MODE="${MODE:-portal}"   # D-104-DEFAULT-MODE (Phase 142-02: `hybrid` renamed → `portal`)
# Phase 142-02: `portal` is the user-facing name for what used to be `hybrid`
# (Cloudflare Tunnel transport — Mini PC accessible from anywhere via CF edge).
# `hybrid` and `tunnel` are kept on the whitelist as silent back-compat aliases
# (normalized to `portal` below) so any operator copy-pasting an old install
# command from the docs/wiki still works. `local-lan` and `cloud` REMAIN on the
# whitelist here so they reach their respective friendly-rejection branches
# below (Phase 142-01 retires local-lan; Phase 142-03 marks cloud Coming Soon).
MODE_WHITELIST="cloud local-lan hybrid portal tunnel"

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
  portal     DEFAULT (and only active mode as of Phase 142). Cloudflare Tunnel
             transport (cloudflared outbound). Works on any device with
             outbound HTTPS — no public IP, no port-forward, no CGNAT
             concerns. CF terminates TLS at the edge; Caddy serves plain HTTP
             on localhost:80. Universal: VPS, VDS, Mini PC, home boxes — all
             install the same way. Get the install command from
             https://livinity.io/dashboard/install (it pre-fills the
             --cf-tunnel-token for you).
  hybrid     Back-compat alias for portal — accepted, normalized silently.
  tunnel     Back-compat alias for portal — accepted, normalized silently.
  cloud      Coming Soon — not yet available in this LivOS build.
  local-lan  RETIRED (Phase 142-01). Use --mode portal instead.

Tunnel-transport flags (portal mode — Phase 134, updated Phase 140+142):
  --subdomain SUB          The subdomain part of your livinity.io address
                           (e.g. `lucy` for lucy.livinity.io). OPTIONAL when
                           --api-key is set — derived automatically from the
                           api-key owner via livinity.io/api/me/profile
                           (Phase 145-01). The full domain is then
                           ${SUB}.livinity.io. Pass it explicitly only to
                           override / sanity-check; mismatch becomes WARN, not
                           fail.
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

Legacy CF DNS flags (back-compat only — no longer used by portal):
  --cf-token TOKEN         Pre-Phase-134 CF API token for DNS-01 wildcard
                           cert issuance. Ignored by portal mode (CF Tunnel
                           handles cert + DNS server-side).
  --cf-zone-id ZONE_ID     Pre-Phase-134 CF zone ID for direct-LAN A-record.
                           Ignored by portal mode.

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
  # Phase 145 — single-flag install. --api-key alone is enough; install.sh
  # resolves the subdomain by calling livinity.io/api/me/profile.
  curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
      --api-key liv_k_<from-dashboard>

  # Pre-Phase-145 form — passing --subdomain explicitly still works.
  # Mismatch with api-key owner becomes WARN (never fail-stop).
  curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
      --subdomain lucy \
      --api-key liv_k_<from-dashboard>

  # Backward-compat — full --domain + --cf-tunnel-token still works for
  # operators with existing automation.
  curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
      --mode portal \
      --domain bruce.livinity.live \
      --api-key liv_k_<from-wizard> \
      --cf-tunnel-token <auto-from-wizard>

  # --mode hybrid and --mode tunnel are silently accepted and normalized to
  # portal — old install commands keep working without edits.
  bash install.sh --mode hybrid --domain bruce.bruceoz.com --cf-tunnel-token <tok>

Environment overrides (set instead of --flag if you can't pass long args):
  LIVOS_DOMAIN             equivalent to --domain
  LIVOS_SUBDOMAIN          equivalent to --subdomain (Plan 140-07)
  LIVOS_CF_TUNNEL_TOKEN    equivalent to --cf-tunnel-token (Plan 104-09)
  LIVOS_API_KEY            equivalent to --api-key (Plan 104-09)
  LIVINITY_HOST_IP         override auto-detected host IP
  NO_COLOR                 disable ANSI colors

CGNAT note:
  Portal mode uses Cloudflare Tunnel (cloudflared outbound). CGNAT is FINE
  — cloudflared dials OUT to CF's edge, so no inbound connectivity is
  required from the operator's ISP.
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
            # Plan 145-02: bare api-key positional. `bash -s liv_k_xxx` (no flag) is
            # the canonical short form for the dashboard one-liner. Matches the
            # `liv_k_` prefix the issuer enforces. Equivalent to --api-key X.
            liv_k_*) LIVOS_API_KEY="$1"; shift ;;
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

    # Plan 145-01: api-key auto-resolve BEGIN
    # api-key → subdomain auto-resolution. Triggers whenever LIVOS_API_KEY is set.
    # Three input shapes covered:
    #   (1) Only --api-key K          → resolve and set LIVOS_SUBDOMAIN + LIVOS_DOMAIN
    #   (2) --subdomain X + --api-key → resolve; WARN+override if owner != X
    #   (3) --domain D.livinity.io + --api-key → resolve; if D's left-most label
    #       differs from owner, WARN+override the whole LIVOS_DOMAIN to
    #       <owner>.livinity.io. Custom-apex domains (e.g. bruce.bruceoz.com)
    #       are LEFT ALONE — they're the operator's own DNS and the api-key
    #       owner is irrelevant to the apex. A code comment marks the explicit
    #       defer-on-custom-apex case below.
    # We use python3 (already a dep via common-deps) for JSON parsing — keeps jq
    # off the install path. Response shape: {"username": "lucy", "email": "..."}.
    #
    # Test escape hatch: LIVOS_SKIP_API_KEY_RESOLVE=1 bypasses the network call
    # entirely. Used by the Plan 140-07 offline test suite to assert non-network
    # parse-cli behavior with fake api-keys (e.g. liv_k_test4xxx). Production
    # one-liners NEVER set this — the resolver is the whole point of Phase 145.
    if [[ -n "$LIVOS_API_KEY" && "${LIVOS_SKIP_API_KEY_RESOLVE:-0}" != "1" ]]; then
        info "Resolving subdomain from --api-key via https://livinity.io/api/me/profile (Plan 145-01)"
        local _resp _http _resolved _domain_label
        # -L follows Vercel's apex→www 307 redirect post-Phase 146 cutover.
        # Install-hardening audit 2026-06-11 (P1): NO -f here — with -f, curl
        # exits non-zero on HTTP 401/403 so the || arm clobbered the captured
        # status with "000" and an expired api-key was reported as a NETWORK
        # error (the 401 branch below was dead code). Without -f curl exits 0
        # on HTTP errors and the real status reaches the case statement.
        _resp=$(curl -sSL -o /tmp/livos-profile-resp.json -w "%{http_code}" \
            --max-time 15 --retry 2 --retry-delay 2 \
            -H "X-API-Key: $LIVOS_API_KEY" \
            "https://livinity.io/api/me/profile" 2>/dev/null) || _resp="000"
        _http="$_resp"
        case "$_http" in
            200)
                _resolved=$(python3 -c 'import json,sys;print(json.load(sys.stdin)["username"])' \
                    < /tmp/livos-profile-resp.json 2>/dev/null) || _resolved=""
                if [[ -z "$_resolved" ]]; then
                    fail "api-key resolver returned 200 but no username in body. Re-issue from the dashboard." 1
                fi
                # T-145-02 mitigation: re-apply the existing --subdomain shape check
                # to the resolved username before any assignment (refuses a
                # malicious DB row containing shell-metachars).
                case "$_resolved" in
                    *' '*|*.*|-*|*-)
                        fail "api-key resolver returned malformed username '$_resolved' (no dots, spaces, or leading/trailing dashes)" 1
                        ;;
                esac
                # Plan 145-01: conflict-WARN BEGIN
                if [[ -z "$LIVOS_SUBDOMAIN" && -z "$LIVOS_DOMAIN" ]]; then
                    # Input shape (1) — no domain hints, fill them in.
                    LIVOS_SUBDOMAIN="$_resolved"
                    LIVOS_DOMAIN="${LIVOS_SUBDOMAIN}.livinity.io"
                    info "auto-resolved subdomain from api-key: $LIVOS_SUBDOMAIN"
                elif [[ -n "$LIVOS_SUBDOMAIN" && "$LIVOS_SUBDOMAIN" != "$_resolved" ]]; then
                    # Input shape (2) — explicit --subdomain mismatch.
                    warn "--subdomain '$LIVOS_SUBDOMAIN' overridden by api-key owner '$_resolved' (Phase 145 auto-resolve)"
                    LIVOS_SUBDOMAIN="$_resolved"
                    LIVOS_DOMAIN="${LIVOS_SUBDOMAIN}.livinity.io"
                elif [[ -n "$LIVOS_DOMAIN" && -z "$LIVOS_SUBDOMAIN" ]]; then
                    # Input shape (3) — explicit --domain. Only override when the
                    # domain is under livinity.io AND the left-label disagrees.
                    # Custom apex (e.g. bruce.bruceoz.com) is the operator's own
                    # DNS — defer silently.
                    case "$LIVOS_DOMAIN" in
                        *.livinity.io)
                            _domain_label="${LIVOS_DOMAIN%%.livinity.io}"
                            if [[ "$_domain_label" != "$_resolved" ]]; then
                                warn "--domain '$LIVOS_DOMAIN' (label '$_domain_label') overridden by api-key owner '$_resolved' (Phase 145 auto-resolve)"
                                LIVOS_SUBDOMAIN="$_resolved"
                                LIVOS_DOMAIN="${LIVOS_SUBDOMAIN}.livinity.io"
                            fi
                            ;;
                        *)
                            # Custom-apex defer: explicit --domain on operator's
                            # own DNS — api-key owner is informational, not
                            # authoritative. No warn, no override.
                            info "custom apex --domain '$LIVOS_DOMAIN' kept as-is (api-key owner '$_resolved' not enforced on non-livinity.io domains)"
                            ;;
                    esac
                fi
                # Plan 145-01: conflict-WARN END
                ;;
            401)
                fail "api-key rejected by livinity.io/api/me/profile (HTTP 401). Re-issue from the dashboard." 1
                ;;
            000)
                fail "Cannot reach https://livinity.io/api/me/profile (network error). Check connectivity." 1
                ;;
            *)
                fail "Unexpected HTTP $_http from https://livinity.io/api/me/profile. Check api-key and try again." 1
                ;;
        esac
        rm -f /tmp/livos-profile-resp.json
    fi
    # Plan 145-01: api-key auto-resolve END

    local valid=0
    for m in $MODE_WHITELIST; do
        [[ "$MODE" == "$m" ]] && valid=1 && break
    done
    if [[ $valid -ne 1 ]]; then
        echo "ERROR: invalid --mode '$MODE'. Use: portal" >&2
        echo "See: bash install.sh --help" >&2
        exit 64   # EX_USAGE per sysexits.h
    fi

    # Phase 142-01 — local-lan mode retired. Reject with a pointer to the only
    # active mode. dnsmasq + Caddy internal-CA path has no production install
    # base; the maintenance cost of keeping it alive across every refactor
    # outweighs its niche air-gap use case.
    if [[ "$MODE" == "local-lan" ]]; then
        echo "ERROR: --mode local-lan was retired in Phase 142-01." >&2
        echo "  LivOS now ships a single transport mode: portal (CF Tunnel; air-gapped" >&2
        echo "  Mini PC + accessible from anywhere via Cloudflare's edge)." >&2
        echo "  Re-run with: --mode portal  (or omit --mode — portal is the default)" >&2
        exit 64
    fi

    # Phase 142-03 — cloud mode is "Coming Soon" — the hosted control-plane it
    # implies isn't shipped yet. We keep the mode-cloud.sh helper on disk for
    # the future implementation but refuse the CLI invocation today.
    if [[ "$MODE" == "cloud" ]]; then
        echo "ERROR: --mode cloud is Coming Soon — not yet available in this LivOS build." >&2
        echo "  Track progress: https://livinity.io/dashboard" >&2
        echo "  For now use: --mode portal  (or omit --mode — portal is the default)" >&2
        exit 64
    fi

    # Phase 142-02 — `hybrid` and `tunnel` are silent back-compat aliases for
    # `portal`. Normalize here so all downstream code paths see exactly one
    # canonical mode string. Operators copy-pasting old commands get an INFO
    # line; new installs go straight to portal without noise.
    case "$MODE" in
        hybrid|tunnel)
            info "--mode $MODE renamed → portal (Phase 142-02). Treating as --mode portal."
            MODE="portal"
            ;;
    esac

    info "Mode: $MODE"

    # Plan 104-08 — when --domain is set in hybrid mode, the partner flags MUST
    # be set too. Plan 104-09 — tunnel mode also accepts --domain (and REQUIRES
    # it together with --cf-tunnel-token). Reject --domain in any OTHER mode.
    # We don't fall through to an interactive prompt because the typical
    # invocation is `curl | bash` where stdin is the pipe (no tty).
    if [[ -n "$LIVOS_DOMAIN" ]]; then
        case "$MODE" in
            portal)
                # Phase 142-02 — portal (formerly hybrid/tunnel) uses CF Tunnel
                # transport. --domain validation (shape) happens below; the
                # required-flag check (--cf-tunnel-token) lives in the unified
                # gating block.
                ;;
            *)
                echo "ERROR: --domain is only valid with --mode portal (got --mode $MODE)" >&2
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

    # Phase 142-02 — unified tunnel-transport gating. `portal` mode (formerly
    # `hybrid`/`tunnel`) requires a domain (either --subdomain or --domain) AND
    # a tunnel token (either --cf-tunnel-token or --api-key for runtime fetch
    # — see Plan 140-07).
    # --cf-tunnel-token is REJECTED in any other mode so operators don't
    # accidentally wire it where it's unused.
    if [[ "$MODE" == "portal" ]]; then
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
        echo "ERROR: --cf-tunnel-token is only valid with --mode portal (got --mode $MODE)" >&2
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
