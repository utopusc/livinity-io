# scripts/install/detect-platform.sh
# Sourced by scripts/install.sh. Detects OS, architecture, and host IP.
# Source: livos/install.sh lines 19-71 (OS/arch detection idiom).
#
# Honors LIVINITY_HOST_IP env override (Q4-RESOLVED in 104-CONTEXT.md: multi-NIC
# hosts can pick the right interface).

OS_ID=""
OS_VERSION_ID=""
ARCH=""
HOST_IP=""

detect_os() {
    if [[ -f /etc/os-release ]]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        OS_ID="${ID:-unknown}"
        OS_VERSION_ID="${VERSION_ID:-unknown}"
    fi
    case "$OS_ID" in
        ubuntu|debian) ok "Detected OS: $OS_ID $OS_VERSION_ID" ;;
        *) fail "Unsupported OS '$OS_ID'. install.sh requires Ubuntu/Debian." 65 ;;
    esac
}

detect_arch() {
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64|aarch64|arm64) ok "Detected arch: $ARCH" ;;
        *) fail "Unsupported arch '$ARCH'. install.sh requires x86_64 or arm64." 65 ;;
    esac
}

# detect_host_ip — sets HOST_IP. Honors LIVINITY_HOST_IP override (multi-NIC).
# Strategy: prefer the IP used to reach 1.1.1.1 (default route source); fall
# back to first hostname -I entry if `ip route` is unavailable.
detect_host_ip() {
    if [[ -n "${LIVINITY_HOST_IP:-}" ]]; then
        HOST_IP="$LIVINITY_HOST_IP"
        ok "Using LIVINITY_HOST_IP override: $HOST_IP"
        return 0
    fi
    HOST_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')
    if [[ -z "$HOST_IP" ]]; then
        HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    [[ -z "$HOST_IP" ]] && fail "Could not detect host IP. Set LIVINITY_HOST_IP=<ip> and re-run." 73
    ok "Detected host IP: $HOST_IP"
}
