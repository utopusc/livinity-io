# scripts/install/mode-hybrid.sh
# Phase 134 — `--mode hybrid` now uses Cloudflare Tunnel as transport.
#
# D-134-MODE: hybrid is the default user-facing install mode and transparently
# implements CF Tunnel (cloudflared outbound). Direct-LAN retired — required
# public IP / port-forward and failed silently behind CGNAT / no-public-IP /
# Client Isolation (the exact Mini PC blocker that drove Phase 134).
#
# D-134-MODE-ALIAS: `--mode tunnel` is kept as a backward-compat alias; both
# `--mode hybrid` and `--mode tunnel` land in install_mode_tunnel below.
#
# D-134-RETIRE-DIRECT-LAN: the pre-Phase-134 direct-LAN code (xcaddy + caddy-
# dns/cloudflare plugin + LE DNS-01 wildcard + CF DNS A-record-to-LAN-IP +
# Server5 mint fallback) has been removed. See `git show <pre-134 sha>` to
# recover historical behavior if needed.

# Source mode-tunnel.sh so install_mode_tunnel is in scope. install.sh's
# dispatcher sources mode-hybrid.sh; mode-tunnel.sh in turn provides the
# cloudflared install + token + Caddy :80 plumbing.
# shellcheck disable=SC1091
source "$SCRIPT_DIR/mode-tunnel.sh"

# Public entry point (called by scripts/install.sh case dispatch). Preserves
# the install_mode_hybrid name so old call sites + external scripts grepping
# for it don't break.
install_mode_hybrid() {
    info "Hybrid mode (Phase 134): using Cloudflare Tunnel as transport"
    install_mode_tunnel
}
