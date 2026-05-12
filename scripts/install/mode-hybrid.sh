# scripts/install/mode-hybrid.sh
# STUB — body lands in plan 104-04.
# At wave 2, this stub proves the dispatch path works without performing any
# Cloudflare DNS-01 ACME or Server5 control-plane subdomain mint.
#
# Wave 2 explicitly DOES NOT write the host_ip Redis key here — that is
# scoped to local-lan (which needs LAN-resolvable A-records). Hybrid mode
# does its A-record write via Server5 control-plane in plan 104-04.

install_mode_hybrid() {
    step "Installing in hybrid mode (STUB)"
    warn "mode-hybrid.sh body is a stub — plan 104-04 fills it in."
    warn "Skipping Cloudflare DNS-01 ACME, Server5 control-plane subdomain mint."
    if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
        warn "CLOUDFLARE_API_TOKEN not set; production hybrid install will require it."
    fi
    ok "Hybrid stub complete"
}
