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
            echo "  Next: open https://<user>.<random>.home.livinity.io"
            echo "  (Public DNS + LE wildcard cert; works on all Apple devices)"
            ;;
    esac
    echo "================================================================"
    echo
}
