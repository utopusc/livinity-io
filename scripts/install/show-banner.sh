# scripts/install/show-banner.sh
# Sourced by scripts/install.sh. Prints mode-aware next-step URL after install.
#
# This is the LAST line of user-visible output before install.sh exits 0; it
# tells the user what to do next (open <URL>, install CA cert, etc.).

print_banner() {
    local mode="$1"
    local host_ip="${HOST_IP:-<host-ip>}"
    local tld="${LIVINITY_LOCAL_TLD:-livinity.local}"
    # Plan 104-11 — deploy_livinityd ran iff SKIP_DEPLOY != 1. When it ran, we
    # say "open <URL>" — the UI is actually live. When skipped, we fall back to
    # the legacy "next step" wording (livinityd needs to be installed manually).
    local deployed="yes"
    [[ "${SKIP_DEPLOY:-0}" == "1" ]] && deployed="no"
    echo
    echo "================================================================"
    echo "  LivOS install (mode=${mode}) COMPLETE"
    if [[ "$deployed" == "yes" ]]; then
        echo "  Status: TLS/DNS + livinityd both deployed (Plan 104-11)"
    else
        echo "  Status: TLS/DNS only — livinityd NOT deployed (--skip-deploy)"
    fi
    echo "================================================================"
    # Phase 142-02 — parse-cli normalizes hybrid/tunnel → portal before this
    # point; the legacy arms remain as defense-in-depth so any caller invoking
    # print_banner with the old strings still gets sensible output.
    case "$mode" in
        portal|hybrid|tunnel)
            local dom="${LIVOS_DOMAIN:-<your-domain>}"
            if [[ "$deployed" == "yes" ]]; then
                echo "  UI: open https://${dom}/"
                echo "      (livinityd up on :8080; cloudflared dials outbound to CF edge)"
            else
                echo "  Next: open https://${dom}/"
                echo "        (subdomain routing configured in CF Tunnels dashboard)"
            fi
            echo
            echo "  Mode:     portal (Cloudflare Tunnel transport)"
            echo "  Tunnel:   cloudflared → CF edge → ${dom}"
            echo "  TLS:      CF-managed cert at the edge (no LE on this host)"
            echo "  Public IP: NOT required (outbound-only — CGNAT-compatible)"
            echo "  Server5 relay: ZERO traffic (D-104-RELAY-ZERO-DATA-PLANE)"
            ;;
    esac
    echo "================================================================"
    echo
}
