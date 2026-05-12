# scripts/install/mode-hybrid.sh
# Phase 104 plan 104-04 — real body (was stub in plan 104-02).
# Plan 104-08 hotfix — user-owned-domain bypass branch.
#
# Provisions:
#   - Caddy with caddy-dns/cloudflare plugin (verify via `caddy list-modules`)
#   - /etc/livos/secrets/cf-token (0600) with the operator's CF API token
#     (LIVOS_CF_TOKEN preferred; falls back to legacy CLOUDFLARE_API_TOKEN env)
#   - systemd EnvironmentFile drop-in for caddy.service
#   - EITHER user-owned-domain CF DNS A-record (when LIVOS_DOMAIN is set —
#     D-104-RELAY-ZERO-DATA-PLANE realized at install-time, Server5 untouched)
#     OR Server5 control-plane subdomain mint (legacy default; best-effort).
#
# Sourced by scripts/install.sh after parse_cli + detect_platform + detect_host_ip,
# so HOST_IP, LIVOS_DOMAIN, LIVOS_CF_TOKEN, LIVOS_CF_ZONE_ID are all populated.

_verify_caddy_cloudflare_plugin() {
    step "Verifying Caddy has caddy-dns/cloudflare plugin"
    if caddy list-modules 2>/dev/null | grep -q '^dns.providers.cloudflare'; then
        ok "Caddy already has caddy-dns/cloudflare plugin"
        return 0
    fi
    warn "Stock apt caddy does NOT include caddy-dns/cloudflare"
    info "Building Caddy with the plugin via xcaddy..."
    # Install xcaddy (idempotent). Prefer apt; fall back to `go install`.
    if ! command -v xcaddy &>/dev/null; then
        # Ensure golang is available for the go-install fallback
        apt-get install -y -qq golang-go || true
        if apt-cache show xcaddy >/dev/null 2>&1; then
            apt-get install -y -qq xcaddy
        else
            export GOBIN=/usr/local/bin
            go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
        fi
    fi
    if ! command -v xcaddy &>/dev/null; then
        # Graceful exit — DO NOT silently ship a broken Caddy. install.sh will
        # set local_mode=hybrid in Redis; on next run (with build deps available)
        # this function will retry. Operator can also pre-build Caddy manually.
        warn "xcaddy not installable in this environment."
        warn "Skipping Caddy rebuild — hybrid TLS issuance will FAIL until the"
        warn "caddy-dns/cloudflare module is installed."
        warn "Manual fix: xcaddy build --with github.com/caddy-dns/cloudflare"
        warn "Then: install the resulting binary at /usr/bin/caddy and restart caddy."
        return 0
    fi
    # Build a Caddy with the cloudflare plugin and atomically swap binary
    local builddir
    builddir=$(mktemp -d)
    if ! (
        cd "$builddir"
        xcaddy build --with github.com/caddy-dns/cloudflare
    ); then
        warn "xcaddy build failed — leaving existing /usr/bin/caddy in place"
        rm -rf "$builddir"
        return 0
    fi
    # Atomic swap (the existing caddy is currently running; stop, swap, restart)
    systemctl stop caddy 2>/dev/null || true
    mv -f "$builddir/caddy" /usr/bin/caddy
    chmod 0755 /usr/bin/caddy
    rm -rf "$builddir"
    ok "Caddy rebuilt with caddy-dns/cloudflare plugin"
    # Sanity check
    if ! caddy list-modules 2>/dev/null | grep -q '^dns.providers.cloudflare'; then
        fail "Caddy rebuild succeeded but dns.providers.cloudflare module is missing"
    fi
}

_write_cf_token_secret() {
    step "Writing Cloudflare API token secret"
    # Plan 104-08 — prefer LIVOS_CF_TOKEN (set by --cf-token CLI flag or env);
    # fall back to legacy CLOUDFLARE_API_TOKEN for backward compat.
    local token="${LIVOS_CF_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
    if [[ -z "$token" ]]; then
        warn "No Cloudflare API token provided (--cf-token / LIVOS_CF_TOKEN / CLOUDFLARE_API_TOKEN)."
        warn "Hybrid mode requires this for Let's Encrypt DNS-01 wildcard cert."
        warn "Re-run with: --cf-token <token>  OR  CLOUDFLARE_API_TOKEN=<token> ..."
        warn "Continuing install — Caddy will fail to issue certs until token is provided."
        return 0
    fi
    local secret_dir="/etc/livos/secrets"
    local secret_file="${secret_dir}/cf-token"
    mkdir -p "$secret_dir"
    chmod 0700 "$secret_dir"
    # Write with restrictive perms (0600). Format: EnvironmentFile (KEY=VALUE).
    # umask 0077 is a defense-in-depth — if the explicit chmod is somehow elided,
    # the file still drops without world/group bits.
    umask 0077
    cat > "$secret_file" <<EOF
CLOUDFLARE_API_TOKEN=${token}
EOF
    chmod 0600 "$secret_file"
    ok "Cloudflare token written to ${secret_file} (0600)"

    # Configure Caddy systemd unit to load this file (idempotent)
    local drop_dir="/etc/systemd/system/caddy.service.d"
    local drop_file="${drop_dir}/livos-cf-token.conf"
    mkdir -p "$drop_dir"
    if ! grep -qF "EnvironmentFile=${secret_file}" "$drop_file" 2>/dev/null; then
        cat > "$drop_file" <<EOF
[Service]
EnvironmentFile=${secret_file}
EOF
        systemctl daemon-reload 2>/dev/null || true
        ok "Caddy systemd drop-in: EnvironmentFile=${secret_file}"
    else
        ok "Caddy systemd drop-in already present"
    fi

    set_livos_redis_key "livos:domain:cf_api_token_secret_ref" "$secret_file"
}

_provision_hybrid_subdomain() {
    # Plan 104-08 — when the operator supplied their own --domain, the entire
    # Server5 mint is a no-op. We branch at the very top so grepping for the
    # `livinity.io/api/hybrid/provision` curl call lands strictly inside this
    # `if [[ -z "$LIVOS_DOMAIN" ]]; then ... fi` block (AC-104-08-4).
    if [[ -n "${LIVOS_DOMAIN:-}" ]]; then
        info "Skipping Server5 mint (user supplied --domain ${LIVOS_DOMAIN})"
        return 0
    fi

    step "Provisioning hybrid subdomain via Server5 control-plane"
    # Honor either LIVOS_CF_TOKEN (104-08) or legacy CLOUDFLARE_API_TOKEN.
    local cf_token="${LIVOS_CF_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
    if [[ -z "$cf_token" ]]; then
        warn "Skipping subdomain provision (no CF API token)"
        return 0
    fi
    # Probe Server5 endpoint; on failure, fall back to user-prompt (interactive
    # only) or leave the wizard to handle on first run (non-interactive).
    #
    # CF-01 (Phase 104 review fix): build payload in a local var and feed via
    # stdin (`--data-binary @-`). Passing the token in `curl --data` argv would
    # expose it via `ps auxww` to any local user during the ≤30s call window.
    local endpoint="https://livinity.io/api/hybrid/provision"
    local response
    local payload
    payload=$(printf '{"hostIp":"%s","cloudflareApiToken":"%s"}' \
        "$HOST_IP" "$cf_token")
    if ! response=$(printf '%s' "$payload" | curl -fsSL -X POST \
        -H "content-type: application/json" \
        -H "user-agent: LivOS-install.sh/Phase104" \
        --data-binary @- \
        --max-time 30 \
        "$endpoint" 2>/dev/null); then
        unset payload
        warn "Server5 control-plane unreachable at ${endpoint}"
        warn "Falling back to manual subdomain entry."
        # Prompt only if interactive; otherwise leave Redis key empty and let UI handle.
        if [[ -t 0 ]]; then
            local manual_sub
            read -rp "Enter your hybrid subdomain (e.g. ab12.home.livinity.io): " manual_sub
            if [[ -n "$manual_sub" ]]; then
                set_livos_redis_key "livos:domain:hybrid_subdomain" "$manual_sub"
                ok "Manual hybrid subdomain recorded: $manual_sub"
            else
                warn "No subdomain entered — UI wizard will handle on first run"
            fi
        else
            warn "Non-interactive install — UI wizard will handle on first run"
        fi
        return 0
    fi
    # CF-01: clear payload from local scope on success path too
    unset payload
    # Parse JSON response (use jq if available, fall back to grep)
    local subdomain zone_id
    if command -v jq &>/dev/null; then
        subdomain=$(echo "$response" | jq -r '.subdomain // empty')
        zone_id=$(echo "$response" | jq -r '.zoneId // empty')
    else
        subdomain=$(echo "$response" | grep -oE '"subdomain":"[^"]+"' | sed 's/.*:"\(.*\)"/\1/')
        zone_id=$(echo "$response" | grep -oE '"zoneId":"[^"]+"' | sed 's/.*:"\(.*\)"/\1/')
    fi
    if [[ -z "$subdomain" || -z "$zone_id" ]]; then
        warn "Server5 returned malformed response; UI wizard will handle on first run"
        return 0
    fi
    set_livos_redis_key "livos:domain:hybrid_subdomain" "$subdomain"
    set_livos_redis_key "livos:domain:hybrid_zone_id" "$zone_id"
    ok "Hybrid subdomain provisioned: $subdomain (zone $zone_id)"
}

# Plan 104-08 — user-owned-domain provisioning. Idempotent CF DNS A-record
# creation pointing $LIVOS_DOMAIN at $HOST_IP. Skips when no token (the
# _write_cf_token_secret block above will have already warned). Skips if the
# A-record already points at the host IP (re-runs are a no-op).
#
# Security: token flows ONLY via Authorization header (curl @stdin pattern + a
# local `_cf_curl_auth` env var assignment scoped to the curl subprocess) so it
# never lands in `ps auxww` (CF-01 invariant carried over from Server5 mint).
_provision_user_owned_domain() {
    step "Provisioning user-owned-domain hybrid: ${LIVOS_DOMAIN}"
    local cf_token="${LIVOS_CF_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
    if [[ -z "$cf_token" ]] || [[ -z "${LIVOS_CF_ZONE_ID:-}" ]]; then
        warn "Missing CF token or zone ID — recording domain only, skipping CF API call"
        set_livos_redis_key "livos:domain:hybrid_subdomain" "$LIVOS_DOMAIN"
        return 0
    fi

    local cf_api="https://api.cloudflare.com/client/v4/zones/${LIVOS_CF_ZONE_ID}/dns_records"

    # CF-01 invariant carried into Plan 104-08: token MUST NOT land on curl's
    # argv (which is world-readable via `ps auxww`). We use `curl -K -` (config
    # from stdin) so the `header = "Authorization: Bearer <token>"` directive
    # is read from a pipe — never an argument. grep verification:
    #   `grep -E 'curl.*\$\{?LIVOS_CF_TOKEN' mode-hybrid.sh` → 0 hits (AC-104-08-5)
    #   `grep -E 'curl.*Authorization.*Bearer' mode-hybrid.sh` → 0 hits

    # Idempotency: list existing records first. If a matching A-record for our
    # name + IP already exists, skip POST. T-104-04-R1 (orphan records on
    # re-mint) — same mitigation pattern as the Server5 path.
    local existing
    if ! existing=$(printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\nurl = "%s?type=A&name=%s"\nrequest = "GET"\nfail\nsilent\nshow-error\nlocation\nmax-time = 15\n' \
            "$cf_token" "$cf_api" "$LIVOS_DOMAIN" \
            | curl -K - 2>/dev/null); then
        warn "CF API list-records failed (network? bad token? bad zone ID?)"
        warn "Proceeding without auto-DNS; operator must create the A-record manually."
        warn "  Type: A   Name: ${LIVOS_DOMAIN}   Content: ${HOST_IP}   Proxy: OFF (DNS only)"
        set_livos_redis_key "livos:domain:hybrid_subdomain" "$LIVOS_DOMAIN"
        set_livos_redis_key "livos:domain:hybrid_zone_id" "$LIVOS_CF_ZONE_ID"
        return 0
    fi

    # Parse "did this record already exist with the right IP?" — jq if avail,
    # otherwise grep. We only need to know `success == true && count >= 1 &&
    # one record content matches HOST_IP`.
    local already_correct=0
    if command -v jq &>/dev/null; then
        if echo "$existing" | jq -e --arg ip "$HOST_IP" \
                '.success == true and (.result[]? | select(.content == $ip))' \
                >/dev/null 2>&1; then
            already_correct=1
        fi
    else
        # Fallback grep — coarse but fine; if jq's missing we just need to spot
        # a `"content":"<HOST_IP>"` substring in the response.
        if echo "$existing" | grep -qF "\"content\":\"${HOST_IP}\""; then
            already_correct=1
        fi
    fi

    if [[ $already_correct -eq 1 ]]; then
        ok "A-record ${LIVOS_DOMAIN} → ${HOST_IP} already exists (idempotent skip)"
    else
        info "Creating A-record ${LIVOS_DOMAIN} → ${HOST_IP} via Cloudflare API"
        # Body is small structured JSON — printf-template into a temp file so
        # the body lives on disk (0600) and `curl --data-binary @<file>`
        # reads it without exposing token on argv. Body file does NOT contain
        # the token (only the DNS record payload).
        local body_file
        body_file=$(mktemp)
        chmod 0600 "$body_file"
        printf '{"type":"A","name":"%s","content":"%s","ttl":120,"proxied":false}' \
            "$LIVOS_DOMAIN" "$HOST_IP" > "$body_file"

        local create_resp
        if ! create_resp=$(printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\nurl = "%s"\nrequest = "POST"\ndata-binary = "@%s"\nfail\nsilent\nshow-error\nlocation\nmax-time = 15\n' \
                "$cf_token" "$cf_api" "$body_file" \
                | curl -K - 2>/dev/null); then
            rm -f "$body_file"
            warn "CF API create-record failed."
            warn "Operator must create the A-record manually:"
            warn "  Type: A   Name: ${LIVOS_DOMAIN}   Content: ${HOST_IP}   Proxy: OFF"
            set_livos_redis_key "livos:domain:hybrid_subdomain" "$LIVOS_DOMAIN"
            set_livos_redis_key "livos:domain:hybrid_zone_id" "$LIVOS_CF_ZONE_ID"
            return 0
        fi
        rm -f "$body_file"
        # Best-effort validation that CF returned success:true. Don't fail on
        # parse — the record may have been created even if our jq matcher is
        # over-strict.
        if echo "$create_resp" | grep -qF '"success":true'; then
            ok "A-record created: ${LIVOS_DOMAIN} → ${HOST_IP}"
        else
            warn "CF API responded but success flag not detected; verify in dashboard"
        fi
    fi

    set_livos_redis_key "livos:domain:hybrid_subdomain" "$LIVOS_DOMAIN"
    set_livos_redis_key "livos:domain:hybrid_zone_id" "$LIVOS_CF_ZONE_ID"
    ok "User-owned-domain hybrid provisioned: ${LIVOS_DOMAIN} (zone ${LIVOS_CF_ZONE_ID})"
}

# Public entry point (called by scripts/install.sh case dispatch)
install_mode_hybrid() {
    _verify_caddy_cloudflare_plugin
    _write_cf_token_secret
    # Plan 104-08 — branch on LIVOS_DOMAIN:
    #   - set:    skip Server5; create CF DNS A-record via user's own zone
    #   - unset:  legacy Server5 control-plane mint (backward compat)
    if [[ -n "${LIVOS_DOMAIN:-}" ]]; then
        _provision_user_owned_domain
    else
        _provision_hybrid_subdomain
    fi
    # Mode marker + host IP are also set by install.sh itself for idempotency
    # diff stability; re-write defensively here so post-103 calls don't lose state.
    set_livos_redis_key "livos:domain:local_mode" "hybrid"
    set_livos_redis_key "livos:domain:host_ip" "$HOST_IP"
}
