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
    local os_like=""
    if [[ -f /etc/os-release ]]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        OS_ID="${ID:-unknown}"
        OS_VERSION_ID="${VERSION_ID:-unknown}"
        os_like="${ID_LIKE:-}"
    fi
    case "$OS_ID" in
        ubuntu|debian) ok "Detected OS: $OS_ID $OS_VERSION_ID" ;;
        # Install-hardening audit 2026-06-11 (P0): Mint/Pop!_OS/etc. are
        # apt+systemd Ubuntu derivatives and rollout targets — downstream is
        # derivative-safe (third-party repos are codename-probed with LTS
        # fallback, or codename-agnostic: Caddy any-version, NodeSource
        # nodistro, Chrome stable). Hard-rejecting them at the first gate was
        # the only blocker.
        linuxmint|pop|zorin|elementary|neon)
            ok "Detected OS: $OS_ID $OS_VERSION_ID (Ubuntu/Debian derivative)" ;;
        *)
            if [[ " ${os_like} " == *ubuntu* || " ${os_like} " == *debian* ]]; then
                warn "Untested Ubuntu/Debian derivative '$OS_ID' (ID_LIKE='${os_like}') — continuing best-effort"
            else
                fail "Unsupported OS '$OS_ID'. install.sh requires Ubuntu/Debian (or a derivative)." 65
            fi ;;
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

# detect_cgnat — best-effort CGNAT detection (plan 104-08 hotfix).
# Hybrid mode requires a public IP for inbound LAN-direct connections; if the
# ISP places the host behind CGNAT (typical for apartment/condo/cellular ISPs),
# clients outside the local LAN cannot reach the host and hybrid mode silently
# fails. We curl ifconfig.me to grab the public-facing IP, then test whether it
# falls in the CGNAT shared-address range 100.64.0.0/10 (RFC 6598). On hit, we
# WARN — we don't fail, because: (a) some operators legitimately want hybrid
# for LAN-only Apple support even behind CGNAT (the LE cert is the win), (b)
# the IP probe may falsely flag dual-NAT setups where the user's router is
# *inside* a CGNAT block but they have port-forwards configured. Warning, not
# blocking — operator decides.
#
# Sets CGNAT_DETECTED=1 if a CGNAT IP was observed (consumers can choose to
# print extra guidance in the post-install banner). Silent no-op when offline
# or when ifconfig.me is unreachable (probe has 5s timeout).
CGNAT_DETECTED=0
detect_cgnat() {
    [[ "${MODE:-}" == "hybrid" ]] || return 0  # CGNAT only matters in hybrid mode
    local pub_ip
    pub_ip=$(curl -fsSL --max-time 5 https://ifconfig.me 2>/dev/null || true)
    if [[ -z "$pub_ip" ]]; then
        info "CGNAT check skipped (ifconfig.me unreachable; offline install?)"
        return 0
    fi
    # CGNAT shared-address space per RFC 6598: 100.64.0.0/10
    # i.e. 100.64.x.x through 100.127.x.x
    if [[ "$pub_ip" =~ ^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\. ]]; then
        CGNAT_DETECTED=1
        # Phase 140 — hybrid now uses Cloudflare Tunnel (outbound-only) so CGNAT
        # is FINE. cloudflared dials OUT to CF's edge; no inbound reachability
        # required from the operator's ISP. Demoting from warn→info (informational).
        info "Public IP ${pub_ip} is in the CGNAT range (100.64.0.0/10)."
        info "This is OK since you're behind a Cloudflare Tunnel (Phase 134+)."
        info "cloudflared dials OUT to Cloudflare's edge — no inbound port-forward"
        info "or public-IP-on-your-ISP required. Continuing install."
    else
        ok "CGNAT check: public IP ${pub_ip} is outside 100.64.0.0/10 (OK)"
    fi
}
