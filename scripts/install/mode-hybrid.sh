# scripts/install/mode-hybrid.sh
# Phase 104 plan 104-04 — real body (was stub in plan 104-02).
# Provisions:
#   - Caddy with caddy-dns/cloudflare plugin (verify via `caddy list-modules`)
#   - /etc/livos/secrets/cf-token (0600) with CLOUDFLARE_API_TOKEN
#   - systemd EnvironmentFile drop-in for caddy.service
#   - Server5 control-plane subdomain mint (best-effort; manual fallback)
#
# Sourced by scripts/install.sh after parse_cli + detect_platform + detect_host_ip,
# so HOST_IP is already populated. Honors CLOUDFLARE_API_TOKEN env (interactive
# prompt is out of scope — D-104-DEFAULT-MODE wave 2 brief).

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
    local token="${CLOUDFLARE_API_TOKEN:-}"
    if [[ -z "$token" ]]; then
        warn "CLOUDFLARE_API_TOKEN env var not set."
        warn "Hybrid mode requires this for Let's Encrypt DNS-01 wildcard cert."
        warn "Re-run: CLOUDFLARE_API_TOKEN=<token> bash install.sh --mode hybrid"
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
    step "Provisioning hybrid subdomain via Server5 control-plane"
    if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
        warn "Skipping subdomain provision (no CLOUDFLARE_API_TOKEN)"
        return 0
    fi
    # Probe Server5 endpoint; on failure, fall back to user-prompt (interactive
    # only) or leave the wizard to handle on first run (non-interactive).
    local endpoint="https://livinity.io/api/hybrid/provision"
    local response
    if ! response=$(curl -fsSL -X POST \
        -H "content-type: application/json" \
        -H "user-agent: LivOS-install.sh/Phase104" \
        --data "{\"hostIp\":\"${HOST_IP}\",\"cloudflareApiToken\":\"${CLOUDFLARE_API_TOKEN}\"}" \
        --max-time 30 \
        "$endpoint" 2>/dev/null); then
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

# Public entry point (called by scripts/install.sh case dispatch)
install_mode_hybrid() {
    _verify_caddy_cloudflare_plugin
    _write_cf_token_secret
    _provision_hybrid_subdomain
    # Mode marker + host IP are also set by install.sh itself for idempotency
    # diff stability; re-write defensively here so post-103 calls don't lose state.
    set_livos_redis_key "livos:domain:local_mode" "hybrid"
    set_livos_redis_key "livos:domain:host_ip" "$HOST_IP"
}
