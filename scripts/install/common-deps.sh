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

    ok "Common deps complete"
}
