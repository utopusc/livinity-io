# scripts/install/mode-local-lan.sh
# STUB — body lands in plan 104-03.
# At wave 2, this stub proves the dispatch path works without installing
# dnsmasq, provisioning the Caddy PKI block, or wiring livinityd's local-DNS
# routes.
#
# Wave 2 STILL writes the local_tld + host_ip Redis keys so AC-104-2
# (idempotency) has stable state to diff against. Plan 104-03 expands this
# body with the heavy dnsmasq + Caddy pki work.

install_mode_local_lan() {
    step "Installing in local-lan mode (STUB)"
    warn "mode-local-lan.sh body is a stub — plan 104-03 fills it in."
    warn "Skipping dnsmasq install, Caddy PKI provision, livinityd local-DNS routes."
    set_livos_redis_key "livos:domain:local_tld" "${LIVINITY_LOCAL_TLD:-livinity.local}"
    set_livos_redis_key "livos:domain:host_ip" "$HOST_IP"
    ok "Local-lan stub complete"
}
