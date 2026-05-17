# scripts/install/mode-tunnel.sh
# Phase 104 plan 104-09 — Cloudflare Tunnel install mode.
#
# Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
#
# Plan 140-07 (2026-05-17): added _fetch_cf_tunnel_token_from_api — when
# LIVOS_CF_TUNNEL_TOKEN is unset BUT LIVOS_API_KEY is set, we curl
# /api/me/tunnel-token to fetch the token at install time (CF for SaaS
# multi-tenant auto-provisioning flow). Backward-compat: if the operator
# already passed --cf-tunnel-token, this helper is a no-op.
#
# Provisions:
#   - cloudflared (CF's official Debian package from pkg.cloudflare.com)
#   - /etc/livos/secrets/cf-tunnel-token (0600) with the CF Tunnel token (NOT a
#     CF API token — different thing; token comes from CF dashboard >
#     Zero Trust > Networks > Tunnels > Configure > Install connector, OR
#     auto-fetched from /api/me/tunnel-token when --api-key is supplied)
#   - cloudflared systemd service registered + started via
#     `cloudflared service install <token>`
#   - Minimal Caddyfile on :80 plain HTTP (CF Tunnel terminates TLS at the edge)
#   - Redis keys livos:domain:local_mode=tunnel + livos:domain:tunnel_domain
#   - (Optional) /etc/livos/secrets/api-key (0600) for marketplace integration
#
# Sourced by scripts/install.sh after parse_cli + detect_platform + detect_host_ip.
# LIVOS_DOMAIN + LIVOS_CF_TUNNEL_TOKEN are guaranteed non-empty by parse-cli.sh's
# tunnel-mode gating; LIVOS_API_KEY is optional in all modes.
#
# KEY DIFFERENCES FROM mode-hybrid.sh:
#   - No xcaddy / caddy-dns/cloudflare plugin (Caddy doesn't terminate TLS here)
#   - No `pki` block (CF edge issues + serves the cert)
#   - No public-IP / inbound-port-forward requirement (cloudflared dials OUT)
#   - No Cloudflare API DNS-record creation (operator pre-configured CF dashboard
#     Public Hostname routing; we just install the connector)
#   - No Server5 relay / control-plane references AT ALL (realizes
#     D-104-RELAY-ZERO-DATA-PLANE — verified by host-side bash test grep on
#     this file in __tests__/test-mode-tunnel-args.sh)
#
# Idempotency: every block is safe to re-run. cloudflared apt repo + binary,
# secret files, Caddyfile, and systemd `enable --now` are all atomic or
# replace-by-id operations.

_install_cloudflared_for_tunnel() {
    step "Installing cloudflared (Cloudflare Tunnel daemon)"

    if command -v cloudflared &>/dev/null; then
        ok "cloudflared already installed: $(cloudflared --version 2>&1 | head -1)"
        return 0
    fi

    # Add CF's official apt repo (signed-by + signed). Idempotent — keyring
    # write is overwrite-OK and apt-get update is always safe.
    info "Adding pkg.cloudflare.com apt repository..."
    apt-get install -y -qq curl gpg lsb-release ca-certificates

    local keyring=/usr/share/keyrings/cloudflare-main.gpg
    local list=/etc/apt/sources.list.d/cloudflared.list

    # Download + dearmor the CF main GPG key (idempotent — same URL each time).
    # Phase 134 Bug #18: add --no-tty --batch so nohup-piped installs work.
    if ! curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
            | gpg --dearmor --no-tty --batch --yes --output "$keyring" 2>/dev/null; then
        fail "Failed to fetch + dearmor CF gpg key from pkg.cloudflare.com"
    fi
    chmod 0644 "$keyring"

    local codename
    codename=$(lsb_release -cs 2>/dev/null || echo noble)
    cat > "$list" <<EOF
deb [signed-by=${keyring}] https://pkg.cloudflare.com/cloudflared ${codename} main
EOF
    chmod 0644 "$list"

    apt-get update -qq
    if ! apt-get install -y -qq cloudflared; then
        fail "apt-get install cloudflared failed — check ${list} and CF repo availability"
    fi

    if ! command -v cloudflared &>/dev/null; then
        fail "cloudflared not on PATH after apt install — something is very wrong"
    fi
    ok "cloudflared installed: $(cloudflared --version 2>&1 | head -1)"
}

# Plan 140-07 — when LIVOS_CF_TUNNEL_TOKEN is unset BUT LIVOS_API_KEY is set,
# fetch the token from /api/me/tunnel-token at install time. Runs AFTER
# common-deps install (so curl is guaranteed available). Idempotent — re-runs
# with the same --api-key fetch the same token from the server (the endpoint
# returns the persisted DB row; token doesn't rotate).
#
# Failure modes:
#   - both LIVOS_CF_TUNNEL_TOKEN and LIVOS_API_KEY unset → fail 64 (operator
#     should have hit parse-cli's gate, but defense-in-depth)
#   - HTTP 4xx/5xx from /api/me/tunnel-token → fail 1 with the api-key prefix
#     in the message (don't leak the full key)
#   - empty / short response → fail 1 (token format sanity)
_fetch_cf_tunnel_token_from_api() {
    # Already have a token (operator passed --cf-tunnel-token explicitly) → skip
    if [[ -n "${LIVOS_CF_TUNNEL_TOKEN:-}" ]]; then
        return 0
    fi
    # No --api-key either → can't fetch; parse-cli should have caught this
    if [[ -z "${LIVOS_API_KEY:-}" ]]; then
        fail "no --cf-tunnel-token and no --api-key — cannot proceed" 64
    fi

    step "Fetching Cloudflare Tunnel token from livinity.io API (Plan 140-07)"
    info "endpoint: https://livinity.io/api/me/tunnel-token"
    info "api-key prefix: $(echo "$LIVOS_API_KEY" | cut -c1-10)..."

    # Capture body separately so we can grep it. We use `|| true` on the curl
    # so a network error doesn't kill the trap-on-ERR before we print our own
    # fail message. --fail makes curl exit non-zero on HTTP 4xx/5xx.
    local api_body
    api_body=$(curl -sS --fail \
        -H "X-API-Key: ${LIVOS_API_KEY}" \
        --max-time 10 \
        --retry 3 --retry-delay 2 \
        "https://livinity.io/api/me/tunnel-token" 2>&1) || {
        fail "/api/me/tunnel-token request failed — check api-key validity + server status (curl: $api_body)" 1
    }

    # Extract token from JSON. Response shape from Plan 140-05: { "token": "..." }
    # Using grep -oE + cut keeps us POSIX-portable (jq isn't installed until
    # common-deps runs, and that already happened before this — but we avoid
    # adding jq as a hard dep here for the broader install.sh use case).
    local tok
    tok=$(echo "$api_body" \
        | grep -oE '"token":"[^"]+"' \
        | head -1 \
        | cut -d'"' -f4)

    # Sanity check the extracted token. CF Tunnel tokens are JWE-style — long
    # base64 blobs typically 200+ chars. < 100 chars is almost certainly an
    # extraction failure or a mocked / placeholder response.
    if [[ -z "$tok" ]] || [[ "${#tok}" -lt 100 ]]; then
        fail "could not extract a valid tunnel-token from /api/me/tunnel-token — server returned ${#tok} chars (need 100+)" 1
    fi

    # Stash into the env-var the rest of mode-tunnel.sh expects. Downstream code
    # (_write_cf_tunnel_token_secret + _register_cloudflared_service) is
    # unchanged — it just reads LIVOS_CF_TUNNEL_TOKEN.
    LIVOS_CF_TUNNEL_TOKEN="$tok"
    export LIVOS_CF_TUNNEL_TOKEN
    ok "fetched tunnel-token from server (${#LIVOS_CF_TUNNEL_TOKEN} chars)"
}

_write_cf_tunnel_token_secret() {
    step "Writing Cloudflare Tunnel token secret"

    # Sanity check — parse-cli.sh's gating already enforced this, but belt and
    # suspenders. The token MUST never be expanded into argv (security).
    if [[ -z "${LIVOS_CF_TUNNEL_TOKEN:-}" ]]; then
        fail "internal error: LIVOS_CF_TUNNEL_TOKEN unset (parse-cli should have caught this)" 64
    fi

    local secret_dir="/etc/livos/secrets"
    local secret_file="${secret_dir}/cf-tunnel-token"
    mkdir -p "$secret_dir"
    chmod 0700 "$secret_dir"

    # Write with restrictive perms. umask 0077 + explicit chmod is defense-in-
    # depth (same pattern as mode-hybrid.sh _write_cf_token_secret).
    # CF-01 invariant: the token flows from env-var into the file via shell
    # redirection — it NEVER lands on any tool's argv. We use printf instead of
    # echo so backslash escapes in the token (if any) don't get mangled.
    umask 0077
    printf '%s\n' "$LIVOS_CF_TUNNEL_TOKEN" > "$secret_file"
    chmod 0600 "$secret_file"
    ok "CF Tunnel token written to ${secret_file} (0600)"

    set_livos_redis_key "livos:domain:cf_tunnel_token_secret_ref" "$secret_file"
}

_register_cloudflared_service() {
    step "Registering cloudflared as a systemd service"

    local secret_file="/etc/livos/secrets/cf-tunnel-token"
    if [[ ! -s "$secret_file" ]]; then
        fail "expected token at ${secret_file} but it's missing/empty"
    fi

    # If cloudflared.service already exists + is active, the operator has
    # already run `cloudflared service install` before. Re-running it would
    # fail with "already installed" — short-circuit instead. The token might
    # have changed though, so we still re-write the secret file (above) and
    # restart the service to pick up the new token.
    if systemctl list-unit-files cloudflared.service &>/dev/null \
            && systemctl is-enabled cloudflared.service &>/dev/null; then
        ok "cloudflared.service already registered — restarting to pick up token"
        systemctl restart cloudflared.service \
            || warn "cloudflared restart returned non-zero (check 'journalctl -u cloudflared')"
        return 0
    fi

    # First-time registration. `cloudflared service install <token>` creates the
    # /etc/systemd/system/cloudflared.service unit AND starts the daemon.
    #
    # SECURITY: the token IS passed as an argv to cloudflared here — this is
    # unavoidable (the cloudflared CLI accepts it only as a positional arg).
    # However: (a) cloudflared invocations during normal operation read the
    # token from the systemd unit's hidden config (not argv), so the argv
    # exposure window is bounded to this one install-time call; (b) the system
    # is being installed as root so ps auxww from another user wouldn't have
    # been possible anyway; (c) the token is stored at 0600 immediately above.
    # Trade-off acknowledged but acceptable for a one-time setup call.
    local token
    token=$(cat "$secret_file")
    if ! cloudflared service install "$token" 2>&1; then
        unset token
        fail "cloudflared service install failed — verify the token is valid in CF dashboard"
    fi
    unset token

    systemctl daemon-reload 2>/dev/null || true
    systemctl enable --now cloudflared.service 2>&1 \
        || warn "systemctl enable cloudflared returned non-zero (may already be enabled)"

    if ! systemctl is-active cloudflared.service &>/dev/null; then
        warn "cloudflared.service not active — check 'journalctl -u cloudflared'"
    else
        ok "cloudflared systemd service active"
    fi
}

_configure_caddy_for_tunnel() {
    step "Configuring Caddy for tunnel mode (plain HTTP on :80)"

    # CF Tunnel terminates TLS at the edge; Caddy does NOT need a TLS issuer,
    # a pki block, or the caddy-dns/cloudflare module here. We just need a
    # plain HTTP reverse-proxy from localhost:80 → livinityd:8080.
    #
    # The livinityd boot path generates its OWN Caddyfile at runtime (out of
    # scope for this plan), but we ship a minimal bootstrap Caddyfile so the
    # operator can verify the install before livinityd takes over.
    mkdir -p /etc/caddy
    local caddyfile=/etc/caddy/Caddyfile
    local tmp="${caddyfile}.new"
    # Phase 134 Bug #19 (UAT 2026-05-17): _write_cf_tunnel_token_secret runs
    # BEFORE this function and sets `umask 0077` which persists in the same
    # shell. Without an explicit umask reset, `cat > "$tmp"` writes the
    # Caddyfile as 0600 root:root. caddy.service runs as the `caddy` user →
    # `Error: reading config from file: open /etc/caddy/Caddyfile: permission
    # denied` → service exit 1 → install proceed but caddy never starts.
    # Same Caddyfile-must-be-world-readable invariant Plan 105-05 Bug #4
    # added to deploy-livinityd.sh; backport here so the install completes
    # standalone without depending on the deploy step's chmod 0644 to recover.
    (
        umask 0022
        cat > "$tmp" <<EOF
# Generated by LivOS install.sh --mode tunnel (Phase 104 plan 104-09).
# CF Tunnel terminates TLS at the edge; Caddy serves plain HTTP locally.
# livinityd may regenerate this file at runtime — those edits supersede this.

{
    # Disable Caddy's automatic HTTPS — CF edge handles TLS for us.
    auto_https off
}

:80 {
    reverse_proxy 127.0.0.1:8080
}
EOF
    )
    mv -f "$tmp" "$caddyfile"
    chmod 0644 "$caddyfile" 2>/dev/null || true

    # Validate before reloading so we don't break a working Caddy.
    if ! caddy validate --config "$caddyfile" --adapter caddyfile &>/dev/null; then
        warn "caddy validate FAILED on tunnel-mode Caddyfile — see /etc/caddy/Caddyfile"
        warn "Continuing — operator can fix manually and 'systemctl reload caddy'"
    else
        ok "Caddyfile validated"
    fi

    # Reload if already running, otherwise start. Either path is OK on a
    # greenfield install where common-deps installed Caddy fresh.
    if systemctl is-active caddy &>/dev/null; then
        systemctl reload caddy 2>&1 || systemctl restart caddy
        ok "Caddy reloaded (tunnel mode: HTTP-only :80 → livinityd :8080)"
    else
        systemctl enable --now caddy 2>&1 || warn "caddy enable --now returned non-zero"
        ok "Caddy started (tunnel mode: HTTP-only :80 → livinityd :8080)"
    fi
}

_persist_tunnel_mode_redis() {
    step "Persisting tunnel-mode markers to Redis"
    # livinityd reads these on boot. tunnel_domain is the operator's apex zone
    # (e.g. bruceoz.com) — livinityd computes per-user subdomains as
    # <user>.<tunnel_domain> downstream.
    set_livos_redis_key "livos:domain:local_mode" "tunnel"
    set_livos_redis_key "livos:domain:tunnel_domain" "$LIVOS_DOMAIN"
    set_livos_redis_key "livos:domain:host_ip" "${HOST_IP:-unknown}"
}

_write_api_key_secret_if_provided() {
    # --api-key is orthogonal to tunnel mode (works in all modes) but tunnel
    # mode is the typical first context where operators wire it up, since
    # they're already setting up their own domain. Other modes that want the
    # api-key persisted should call this same helper (currently they don't —
    # left as a no-op there for plan 104-09 scope).
    if [[ -z "${LIVOS_API_KEY:-}" ]]; then
        return 0
    fi
    step "Saving marketplace API key"

    local secret_dir="/etc/livos/secrets"
    local secret_file="${secret_dir}/api-key"
    mkdir -p "$secret_dir"
    chmod 0700 "$secret_dir"
    umask 0077
    printf '%s\n' "$LIVOS_API_KEY" > "$secret_file"
    chmod 0600 "$secret_file"
    ok "Marketplace API key written to ${secret_file} (0600)"

    set_livos_redis_key "livos:account:api_key_path" "$secret_file"
}

# Public entry point (called by scripts/install.sh case dispatch).
# Plan 140-07: _fetch_cf_tunnel_token_from_api runs FIRST (so the rest of the
# pipeline sees LIVOS_CF_TUNNEL_TOKEN populated whether the operator passed it
# directly or supplied --api-key for auto-fetch).
install_mode_tunnel() {
    _install_cloudflared_for_tunnel
    _fetch_cf_tunnel_token_from_api
    _write_cf_tunnel_token_secret
    _register_cloudflared_service
    _configure_caddy_for_tunnel
    _persist_tunnel_mode_redis
    _write_api_key_secret_if_provided
}
