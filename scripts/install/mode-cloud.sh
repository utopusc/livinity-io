# scripts/install/mode-cloud.sh
# STUB — body lands in plan 104-06 (cloud-mode regression).
# At wave 2, this stub proves the dispatch path works without doing destructive
# Cloudflare DNS / cloudflared work. The shared common-deps install (Caddy +
# apt prereqs) IS exercised end-to-end via the dispatch, which is what
# AC-104-2 (idempotency) measures.

install_mode_cloud() {
    step "Installing in cloud mode (STUB)"
    warn "mode-cloud.sh body is a stub — plan 104-06 fills it in."
    warn "Skipping Cloudflare DNS challenge / cloudflared install."
    ok   "Cloud-mode stub complete (Caddy installed via common-deps; no further action)"
}
