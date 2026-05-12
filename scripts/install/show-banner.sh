# scripts/install/show-banner.sh
# Sourced by scripts/install.sh. Prints mode-aware next-step URL after install.
#
# This is the LAST line of user-visible output before install.sh exits 0; it
# tells the user what to do next (open <URL>, install CA cert, etc.).

print_banner() {
    local mode="$1"
    local host_ip="${HOST_IP:-<host-ip>}"
    local tld="${LIVINITY_LOCAL_TLD:-livinity.local}"
    echo
    echo "================================================================"
    echo "  LivOS install (mode=${mode}) COMPLETE"
    echo "================================================================"
    case "$mode" in
        cloud)
            echo "  Next: open https://<your-subdomain>.livinity.io"
            echo "  (Server5 relay routes traffic; existing Mini PC path)"
            ;;
        local-lan)
            echo "  Next: open http://${host_ip}/setup to download the CA cert"
            echo "  After CA install, browse: https://<user>.${tld}"
            echo "  WARNING: Apple devices (iOS/macOS) do NOT support .local TLDs."
            echo "           Use --mode hybrid for Apple support."
            ;;
        hybrid)
            # Plan 104-08 — user-owned-domain banner branch. The wildcard cert
            # covers both `livos.${LIVOS_DOMAIN}` and bare `${LIVOS_DOMAIN}`.
            if [[ -n "${LIVOS_DOMAIN:-}" ]]; then
                echo "  Next: open https://livos.${LIVOS_DOMAIN}/"
                echo "        or:   https://${LIVOS_DOMAIN}/"
                echo "  DNS A-record: ${LIVOS_DOMAIN} → ${host_ip} (created via Cloudflare API)"
                echo "  TLS: Let's Encrypt DNS-01 wildcard (no Server5 in the data plane)"
            else
                echo "  Next: open https://<user>.<random>.home.livinity.io"
                echo "  (Public DNS + LE wildcard cert; works on all Apple devices)"
            fi
            # CGNAT advisory — repeats the warning from detect_cgnat if it fired,
            # so the operator sees it even if they scrolled past the install log.
            if [[ "${CGNAT_DETECTED:-0}" == "1" ]]; then
                echo
                echo "  NOTE: CGNAT detected (public IP in 100.64.0.0/10)."
                echo "  External clients (e.g. iPhone on cellular) will NOT reach"
                echo "  this host. Re-run with --mode tunnel instead (Plan 104-09)"
                echo "  — Cloudflare Tunnel is outbound-only and works behind CGNAT."
            fi
            ;;
        tunnel)
            # Plan 104-09 — Cloudflare Tunnel banner. CF edge terminates TLS;
            # Caddy serves plain HTTP on :80 locally; cloudflared dials outbound
            # to the CF edge. No public IP required.
            local dom="${LIVOS_DOMAIN:-<your-domain>}"
            echo "  Next: open https://<subdomain>.${dom}/"
            echo "        (subdomain routing configured in CF Tunnels dashboard)"
            echo
            echo "  Tunnel:  cloudflared → CF edge → ${dom}"
            echo "  TLS:     CF-managed cert at the edge (no LE on this host)"
            echo "  Public IP: NOT required (outbound-only — CGNAT-compatible)"
            echo "  Server5 relay: ZERO traffic (D-104-RELAY-ZERO-DATA-PLANE)"
            ;;
    esac
    echo "================================================================"
    echo
}
