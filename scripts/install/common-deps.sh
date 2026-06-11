# scripts/install/common-deps.sh
# Sourced by scripts/install.sh. Installs system packages shared by ALL modes.
# Source: livos/install.sh lines 487-513 (install_caddy idiom).
#
# Idempotency contract (AC-104-2):
# - `apt-get install -y -qq <pkg>` is a no-op when <pkg> is already installed
#   (does not return an error, does not re-download).
# - The Caddy install path uses `command -v caddy` as a fast-skip.
# - No top-level files outside /etc/apt/sources.list.d/ + /usr/share/keyrings/
#   are mutated; both writes are conditional on Caddy not being present.

install_common_deps() {
    step "Installing common dependencies (apt + Caddy + Redis tools)"

    # apt prerequisites — D-104-NO-PROD-IMPACT note: the heavier installs
    # (Node, Postgres, Docker, redis-server) remain in livos/install.sh for
    # cloud-mode parity. This file ships the smallest possible shared layer so
    # plans 104-03/04/06 can extend per-mode with confidence.
    export DEBIAN_FRONTEND=noninteractive

    # Field bug 2026-06-11: a previous failed run (or a manual cloudflared
    # attempt) can leave /etc/apt/sources.list.d/cloudflared.list pointing at
    # a suite Cloudflare doesn't publish (e.g. non-LTS Ubuntu 'plucky') —
    # "does not have a Release file" then poisons EVERY apt-get update,
    # including ours, so re-runs die here in common-deps. Probe the suite and
    # quarantine a broken list; mode-tunnel.sh re-creates it later with a
    # supported suite (it has the matching fallback logic).
    local cf_list=/etc/apt/sources.list.d/cloudflared.list
    if [[ -f "$cf_list" ]]; then
        local cf_suite
        cf_suite=$(grep -m1 'pkg\.cloudflare\.com/cloudflared' "$cf_list" \
            | sed -E 's|.*pkg\.cloudflare\.com/cloudflared[[:space:]]+([^[:space:]]+).*|\1|')
        if [[ -n "$cf_suite" ]] \
                && ! curl -fsI --max-time 10 "https://pkg.cloudflare.com/cloudflared/dists/${cf_suite}/Release" >/dev/null 2>&1; then
            info "Quarantining stale cloudflared.list (suite '${cf_suite}' not published by Cloudflare)"
            mv -f "$cf_list" "${cf_list}.disabled"
        fi
    fi

    apt-get update -qq
    apt-get install -y -qq \
        ca-certificates curl gnupg2 wget jq dnsutils openssl \
        debian-keyring debian-archive-keyring apt-transport-https \
        redis-tools

    # Caddy (idempotent — `command -v` short-circuits when present)
    if command -v caddy &>/dev/null; then
        ok "Caddy already installed: $(caddy version 2>/dev/null | head -1)"
    else
        info "Installing Caddy from official repo"
        # Phase 134 UAT (Bug #18, 2026-05-17): when install.sh is run via
        # `nohup curl|sudo bash` (no controlling TTY), gpg's first invocation
        # for the new root user fails with `cannot open '/dev/tty'` because
        # gpg-agent tries to attach to a TTY for pinentry / first-time agent
        # setup. --no-tty + --batch + --yes makes the dearmor strictly non-
        # interactive. Idempotent (--yes overwrites existing keyring).
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
            | gpg --dearmor --no-tty --batch --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
            | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
        apt-get update -qq
        apt-get install -y -qq caddy
        ok "Caddy installed"
    fi

    # Ensure /etc/hosts maps `localhost` on the IPv6 `::1` line.
    # Phase 134 UAT discovered Ubuntu 24.04 default ships `::1 ip6-localhost
    # ip6-loopback` WITHOUT `localhost` as an alias. x11vnc (called by the
    # WebApp streaming pipeline) does `getaddrinfo("localhost", AAAA)` when
    # `-localhost` is requested; without the alias it returns NXDOMAIN +
    # rfbListenOnTCP6Port fails + x11vnc exits with code 2 → fluxbox loses
    # display → cascade crash → wss://.../ws/stream/* close 1006 in browser.
    # Adding `localhost` to the ::1 line resolves AAAA → ::1 and unblocks
    # the WebApp pipeline. Idempotent: only touches the line if not already
    # patched. Single point in install path so every mode (hybrid/tunnel/
    # cloud/local-lan) gets it.
    if grep -qE '^::1\s+(\S+\s+)*localhost(\s|$)' /etc/hosts; then
        ok "/etc/hosts already has localhost on ::1 line"
    elif grep -qE '^::1\s' /etc/hosts; then
        info "Patching /etc/hosts ::1 line to include localhost alias (Phase 134 UAT fix)"
        # cp -n preserves an existing backup; only creates one on first run
        cp -n /etc/hosts /etc/hosts.pre-livos.bak 2>/dev/null || true
        sed -i -E 's/^::1[[:space:]]+(.*)$/::1     localhost \1/' /etc/hosts
        ok "/etc/hosts patched"
    else
        # No ::1 line at all (unusual) — append a complete one
        info "Adding missing ::1 localhost line to /etc/hosts"
        cp -n /etc/hosts /etc/hosts.pre-livos.bak 2>/dev/null || true
        printf '::1     localhost ip6-localhost ip6-loopback\n' >> /etc/hosts
        ok "/etc/hosts appended"
    fi

    ok "Common deps complete"
}
