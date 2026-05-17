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
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
            | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
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
