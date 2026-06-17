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
    if ! curl -fsSL --retry 3 --retry-delay 2 --max-time 30 https://pkg.cloudflare.com/cloudflare-main.gpg \
            | gpg --dearmor --no-tty --batch --yes --output "$keyring" 2>/dev/null; then
        fail "Failed to fetch + dearmor CF gpg key from pkg.cloudflare.com"
    fi
    chmod 0644 "$keyring"

    local codename
    codename=$(lsb_release -cs 2>/dev/null || echo noble)
    # Field bug 2026-06-11: Cloudflare only publishes suites for LTS/stable
    # codenames (jammy, noble, bookworm…). On non-LTS Ubuntu (plucky 25.04,
    # oracular 24.10…) or Debian testing there is NO Release file for
    # $(lsb_release -cs) → `apt-get update` hard-fails and the install dies.
    # Probe the suite first; if absent, fall back to the newest supported
    # suite for the distro family (cloudflared is a static Go binary — the
    # noble/bookworm pool installs fine on newer releases).
    if ! curl -fsI --max-time 10 "https://pkg.cloudflare.com/cloudflared/dists/${codename}/Release" >/dev/null 2>&1; then
        local os_id fallback
        os_id=$(. /etc/os-release 2>/dev/null && echo "${ID:-ubuntu}")
        fallback=noble
        [[ "$os_id" == "debian" ]] && fallback=bookworm
        info "pkg.cloudflare.com has no '${codename}' suite — using '${fallback}' instead"
        codename=$fallback
    fi
    cat > "$list" <<EOF
deb [signed-by=${keyring}] https://pkg.cloudflare.com/cloudflared ${codename} main
EOF
    chmod 0644 "$list"

    # Warn-and-continue on partial update (broken third-party repos on user
    # boxes — same hardening as common-deps.sh). The install below is the
    # loud failure point if the cloudflared repo itself didn't refresh.
    apt-get update -qq \
        || warn "apt-get update reported errors — continuing to cloudflared install"
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
    # -L follows Vercel's apex→www 307 redirect post-Phase 146 cutover.
    api_body=$(curl -sSL --fail \
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

    # If cloudflared.service already exists + is enabled, the operator has
    # already run `cloudflared service install` before. Re-running it would
    # fail with "already installed" — short-circuit instead.
    #
    # Phase 141-09: BEFORE short-circuiting, reconcile the systemd unit's
    # ExecStart --token argument against the freshly-fetched token in
    # /etc/livos/secrets/cf-tunnel-token. The stage-dir cache + the
    # short-circuit branch combined to silently leave the OLD user's token in
    # the unit on a re-install with a different user — cloudflared would
    # connect to the wrong tunnel + the new subdomain would 530. The
    # token-in-secrets-file is already correct at this point (rewritten by
    # _write_cf_tunnel_token_secret above); we just need to mirror that
    # change into the ExecStart line.
    if systemctl list-unit-files cloudflared.service &>/dev/null \
            && systemctl is-enabled cloudflared.service &>/dev/null; then
        local unit_file="/etc/systemd/system/cloudflared.service"
        local current_token expected_token
        expected_token=$(cat "$secret_file")
        if [[ -f "$unit_file" ]] && grep -q -- "--token " "$unit_file"; then
            current_token=$(grep -oE -- "--token [A-Za-z0-9_=.-]+" "$unit_file" | head -1 | awk '{print $2}')
            if [[ -n "$current_token" && "$current_token" != "$expected_token" ]]; then
                info "Phase 141-09: cloudflared.service token drift detected — rewriting unit"
                # Escape token chars that have meaning to sed (use | as delim to
                # avoid escaping the / and = chars present in CF JWTs).
                sed -i "s|--token ${current_token}|--token ${expected_token}|" "$unit_file"
                systemctl daemon-reload 2>/dev/null || true
                ok "cloudflared.service ExecStart token reconciled"
            fi
        else
            info "Phase 141-09: cloudflared.service has no --token in ExecStart (EnvironmentFile path?) — skipping rewrite"
        fi
        unset current_token expected_token
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
    # Phase 278 — CSP frame-ancestors embedder. When LIVOS_DOMAIN is set (tunnel
    # mode normally requires one) allow-list it; otherwise emit just `'self'`
    # rather than a hardcoded operator-domain literal. livinityd's runtime
    # caddy.ts regen supersedes this once the domain config is in Redis.
    local _csp_embedder=""
    [[ -n "${LIVOS_DOMAIN:-}" ]] && _csp_embedder=" https://${LIVOS_DOMAIN}"
    (
        umask 0022
        cat > "$tmp" <<EOF
# Generated by LivOS install.sh --mode tunnel (Phase 104 plan 104-09).
# CF Tunnel terminates TLS at the edge; Caddy serves plain HTTP locally.
# livinityd may regenerate this file at runtime — those edits supersede this.
#
# Phase 201-06 → Phase 203-03 (D-203-05) → Phase 203-09 — Liv AI surface
# routing is SPLIT:
#   /liv-ai-app/openclawos[/*]  → :18789 (openclaw claw-gateway, strip_prefix via handle_path)
#   /liv-ai-app/*                → :3010 (Next.js Phase 202 dashboard subapp)
# Both handles placed ABOVE the catch-all so Caddy's matcher-specificity rules
# steer Liv AI traffic away from the livinityd app gateway. Runtime generator
# in livos/packages/livinityd/.../domain/caddy.ts emits the same split for
# per-user vhosts.

{
    # Disable Caddy's automatic HTTPS — CF edge handles TLS for us.
    auto_https off
}

:80 {
    @livaiSubapp path /liv-ai-app /liv-ai-app/*
    handle @livaiSubapp {
        reverse_proxy 127.0.0.1:3010 {
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
    }
    handle /liv/branding/* {
        uri strip_prefix /liv/branding
        root * /etc/liv-assistant/branding
        file_server
    }
    @webapp_stream_ws path /ws/stream/*
    handle @webapp_stream_ws {
        reverse_proxy 127.0.0.1:8080 {
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
    }
    @liv_ws path /ws /ws/*
    handle @liv_ws {
        reverse_proxy 127.0.0.1:3020 {
            header_down -X-Frame-Options
            header_down -Content-Security-Policy
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
    }
    @liv_api_subresource {
        header_regexp Referer ^https?://[^/]+/liv(/|\$)
        path /api/*
    }
    handle @liv_api_subresource {
        reverse_proxy 127.0.0.1:3020 {
            header_down -X-Frame-Options
            header_down -Content-Security-Policy
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
        header Content-Security-Policy "frame-ancestors 'self'${_csp_embedder}"
    }
    @livos_terminal_ws path /livos/terminal/ws
    handle @livos_terminal_ws {
        reverse_proxy 127.0.0.1:8080 {
            header_down -X-Frame-Options
            header_down -Content-Security-Policy
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
    }
    # Phase 262 WS1 (LIVOS-054): the broad /liv/trpc/* → livinityd :8080 bridge was REMOVED.
    # The framed AionUi SPA must NOT reach the full LivOS tRPC API with the operator's
    # same-origin cookie auto-attached.
    # 2026-06-11 carve-out (operator-accepted trade-off): ONLY these named procedures
    # route to :8080 so the Liv AI "Local Agents" panel + One-Click Liv MCPs work. EXACT
    # paths, NOT cliInstaller.* — a trailing wildcard would match tRPC comma-batch URLs
    # (cliInstaller.detect,users.create?batch=1) and re-open the full API. forward_auth
    # gates it. This list MUST stay in lock-step with caddy.ts LIV_CLI_INSTALLER_HANDLE
    # (drift here = /liv/trpc/<proc> 404s into the AionUi SPA → "Unexpected token '<'").
    @liv_cli_installer path /liv/trpc/cliInstaller.detect /liv/trpc/cliInstaller.install /liv/trpc/cliInstaller.auth /liv/trpc/cliInstaller.applyAgentChanges /liv/trpc/cliInstaller.hasPendingAgentChanges /liv/trpc/mcp.config.installLivTools /liv/trpc/mcp.config.installLivMcpsToCli
    handle @liv_cli_installer {
        forward_auth 127.0.0.1:8080 {
            uri /auth/verify
            @bad status 401
            handle_response @bad {
                redir https://{host}/login?redirect={scheme}://{host}{uri} 302
            }
        }
        uri strip_prefix /liv
        reverse_proxy 127.0.0.1:8080 {
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
    }
    @liv path /liv /liv/*
    handle @liv {
        uri strip_prefix /liv
        reverse_proxy 127.0.0.1:3020 {
            header_down -X-Frame-Options
            header_down -Content-Security-Policy
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
        header Content-Security-Policy "frame-ancestors 'self'${_csp_embedder}"
    }
    handle {
        reverse_proxy 127.0.0.1:8080
    }
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
        # Audit P1: the ok below used to be UNCONDITIONAL — a Caddy that
        # failed to bind :80 sailed through as "started" and the install
        # ended green with a dead domain (502 at the CF edge).
        if systemctl is-active caddy &>/dev/null; then
            ok "Caddy started (tunnel mode: HTTP-only :80 → livinityd :8080)"
        else
            fail "Caddy did NOT start — check 'journalctl -u caddy -n 30' (is something else holding port 80?)"
        fi
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
