#!/usr/bin/env bash
# scripts/install/livos-net-expose.sh
# Phase 329 (NET-04) — root-owned raw TCP/UDP port-exposure wrapper.
#
# Deployed to /usr/local/lib/livos/livos-net-expose.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-net-expose) + update.sh (Step 7.10j). Invoked by
# livinityd's system routes (329-06) via the scoped sudoers grant
# (sudoers.d/livos-net-expose):
#   sudo -n /usr/local/lib/livos/livos-net-expose.sh <action> [args...]
#
# WHY A WRAPPER (clone of the Phase 325 livos-network.sh own-the-file idiom + the
# livos-ups.sh enum/root-guard template): the privileged surface here is REGENERATING
# and re-executing /etc/livos/docker-firewall.sh — the script that programs the
# DOCKER-USER iptables chain (install.sh owns the baseline). Docker publishes ports by
# inserting DNAT rules that bypass UFW; the DOCKER-USER chain is the official hook for
# user-defined rules, and its default posture DROPs all external inbound. Opening a raw
# TCP/UDP port (e.g. a game server) means inserting a `-j RETURN` for that proto/port
# BEFORE the drop-all. livinityd runs as the unprivileged desktop user. A raw NOPASSWD
# grant on iptables / a text editor would let any process that can call `sudo` inject
# arbitrary chain rules or rewrite the whole firewall. Instead the sudoers grant is on
# THIS ONE binary path (no glob, no argument wildcard) and the wrapper accepts ONLY a
# fixed action enum {status|open|close|list}. It regex-validates EVERY positional value
# (proto ∈ {tcp,udp}; port strict int 1-65535; optional strict-CIDR src) BEFORE any value
# reaches a privileged command or the firewall file, keeps the openings as a PARSED (never
# sourced) state file, and REGENERATES THE WHOLE /etc/livos/docker-firewall.sh from the
# baseline + validated state, building every `-A DOCKER-USER ...` line itself. To change a
# permitted operation, EDIT THIS WRAPPER — do NOT broaden the grant.
#
# OWN-THE-FILE + RE-EXEC (D-09):
# The service `livos-docker-firewall.service` is a boot-only oneshot (RemainAfterExit) —
# a `systemctl restart` will NOT usefully re-run it. So after regenerating the script the
# wrapper RE-EXECUTES it directly (`bash /etc/livos/docker-firewall.sh`) to apply the
# new rule set immediately. Older boxes may lack the file entirely — because we regenerate
# the WHOLE file from the baseline template every time, the baseline is (re)created for
# free. NO armed-revert timer machinery is cloned from livos-network.sh: a firewall OPENING has
# no lockout risk (it only ADDS a RETURN before the drop-all; the L3 path is never severed).
#
# Openings do NOT appear in `ufw status` (they live in the DOCKER-USER chain), and router
# NAT/port-forwarding is a SEPARATE user step — the UI (329-10) states both (D-10).
#
# Args (the enum is the ONLY control input; anything else -> exit 2, nothing privileged runs):
#   $1  action  — status | open | close | list
#   open   — $2 <proto tcp|udp>  $3 <port 1-65535>  [$4 <src CIDR>]
#   close  — $2 <proto tcp|udp>  $3 <port 1-65535>  [$4 <src CIDR>]
#
# Exit codes: 2 = bad usage / unknown action / failed validation.
#             1 = operation failed (mktemp / firewall re-exec error).
#             Otherwise the underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-net-expose] must run as root" >&2; exit 2; }

FW_SCRIPT="/etc/livos/docker-firewall.sh"                       # regenerated firewall script (owned)
STATE_LIST="/etc/livos/docker-firewall-openings.list"          # parsed openings state (NOT sourced)

# ── Validators (run BEFORE any value reaches the firewall file / a privileged command) ──

# Proto closed enum.
_valid_proto() { [[ "$1" =~ ^(tcp|udp)$ ]]; }

# Strict integer port in the 1-65535 range (no leading +, no whitespace, no ranges).
_valid_port() {
    [[ "$1" =~ ^[0-9]+$ ]] || return 1
    (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

# Strict IPv4 dotted-quad with per-octet <=255 bound.
_valid_ipv4() {
    local _ip="$1"
    [[ "$_ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
    (( ${BASH_REMATCH[1]} <= 255 && ${BASH_REMATCH[2]} <= 255 \
       && ${BASH_REMATCH[3]} <= 255 && ${BASH_REMATCH[4]} <= 255 ))
}

# Optional source restriction: strict IPv4 address with a /0-32 CIDR prefix.
_valid_cidr() {
    local _c="$1"
    [[ "$_c" =~ ^(.+)/([0-9]{1,2})$ ]] || return 1
    _valid_ipv4 "${BASH_REMATCH[1]}" && (( ${BASH_REMATCH[2]} <= 32 ))
}

# ── Openings state file (parsed line-by-line "proto port [cidr]", NEVER sourced) ──

# Append a validated opening iff an identical line is not already present (dedupe).
_add_opening() {
    local _key="$1 $2${3:+ $3}"
    mkdir -p /etc/livos
    touch "$STATE_LIST"
    grep -qxF "$_key" "$STATE_LIST" 2>/dev/null || echo "$_key" >> "$STATE_LIST"
    chmod 0644 "$STATE_LIST"
}

# Remove the matching opening line (atomic temp+rename).
_remove_opening() {
    local _key="$1 $2${3:+ $3}"
    [[ -f "$STATE_LIST" ]] || return 0
    local _tmp
    _tmp=$(mktemp) || { echo "[livos-net-expose] mktemp failed (state)" >&2; exit 1; }
    grep -vxF "$_key" "$STATE_LIST" > "$_tmp" 2>/dev/null || true
    chmod 0644 "$_tmp"
    mv -f "$_tmp" "$STATE_LIST"
}

# Regenerate the WHOLE /etc/livos/docker-firewall.sh from the baseline template + the
# parsed openings state (own-the-file idiom; atomic temp+rename). The wrapper owns every
# byte: each opening line is built here from RE-VALIDATED tokens (defense-in-depth), and
# every `-A DOCKER-USER ... -j RETURN` opening is inserted strictly BEFORE the
# `-i $EXT_IF -j DROP` so the drop-all posture is preserved for everything not opened.
_regenerate_firewall() {
    local _tmp _p _port _cidr
    mkdir -p /etc/livos
    _tmp=$(mktemp "/etc/livos/.docker-firewall-XXXXXX.tmp") \
        || { echo "[livos-net-expose] mktemp failed (firewall)" >&2; exit 1; }
    {
        echo '#!/bin/bash'
        echo '# LivOS Docker firewall — block external inbound to Docker-published ports.'
        echo '# Managed by livos-net-expose.sh (NET-04). Owned file — do NOT hand-edit;'
        echo '# openings live in /etc/livos/docker-firewall-openings.list and are'
        echo '# regenerated into this script (each -j RETURN is inserted BEFORE the DROP).'
        echo ''
        echo 'EXT_IF=$(ip route show default | awk '\''{print $5}'\'')'
        echo ''
        echo 'iptables -F DOCKER-USER 2>/dev/null || true'
        echo 'iptables -A DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN'
        echo 'iptables -A DOCKER-USER -s 127.0.0.0/8 -j RETURN            # localhost (Caddy)'
        echo 'iptables -A DOCKER-USER -s 172.16.0.0/12 -j RETURN           # Docker networks'
        echo 'iptables -A DOCKER-USER -i docker0 -j RETURN                  # Docker bridge'
        # ── LivOS-managed openings (NET-04) — inserted BEFORE the drop-all ──
        if [[ -f "$STATE_LIST" ]]; then
            while read -r _p _port _cidr; do
                [[ -n "$_p" ]] || continue
                _valid_proto "$_p" || continue
                _valid_port "$_port" || continue
                if [[ -n "$_cidr" ]]; then
                    _valid_cidr "$_cidr" || continue
                    echo "iptables -A DOCKER-USER -p $_p --dport $_port -s $_cidr -j RETURN   # LivOS opening"
                else
                    echo "iptables -A DOCKER-USER -p $_p --dport $_port -j RETURN   # LivOS opening"
                fi
            done < "$STATE_LIST"
        fi
        echo 'iptables -A DOCKER-USER -i $EXT_IF -j DROP                    # Block external inbound'
        echo 'iptables -A DOCKER-USER -j RETURN                              # Allow everything else'
    } > "$_tmp"
    chmod 0755 "$_tmp"
    mv -f "$_tmp" "$FW_SCRIPT"
}

# Re-execute the regenerated firewall script directly (the systemd unit is boot-only
# RemainAfterExit — a restart would not usefully re-run it).
_reexec_firewall() {
    bash "$FW_SCRIPT"
}

ACTION="${1:-}"

case "$ACTION" in
    status)
        # Read-only report: firewall script presence + opening count. `set -e` is on,
        # so the count probe is fully guarded.
        echo "docker-firewall-script: $([[ -f "$FW_SCRIPT" ]] && echo present || echo absent)"
        if [[ -f "$STATE_LIST" ]]; then
            echo "openings-count: $(grep -cvE '^[[:space:]]*$' "$STATE_LIST" 2>/dev/null || echo 0)"
        else
            echo "openings-count: 0"
        fi
        exit 0
        ;;

    open)
        # open <proto> <port> [cidr] — validate FIRST, then record + regenerate + re-exec.
        PROTO="${2:-}"; PORT="${3:-}"; SRC="${4:-}"
        [[ -n "$PROTO" && -n "$PORT" ]] \
            || { echo "[livos-net-expose] open needs <proto tcp|udp> <port 1-65535> [src-cidr]" >&2; exit 2; }
        _valid_proto "$PROTO" \
            || { echo "[livos-net-expose] invalid proto: '${PROTO}' (expected tcp|udp)" >&2; exit 2; }
        _valid_port "$PORT" \
            || { echo "[livos-net-expose] invalid port: '${PORT}' (expected int 1-65535)" >&2; exit 2; }
        if [[ -n "$SRC" ]]; then
            _valid_cidr "$SRC" \
                || { echo "[livos-net-expose] invalid src CIDR: '${SRC}'" >&2; exit 2; }
        fi
        _add_opening "$PROTO" "$PORT" "$SRC"
        _regenerate_firewall
        _reexec_firewall
        echo "opened: ${PROTO}/${PORT}${SRC:+ from ${SRC}}"
        exit 0
        ;;

    close)
        # close <proto> <port> [cidr] — validate FIRST, then remove + regenerate + re-exec.
        PROTO="${2:-}"; PORT="${3:-}"; SRC="${4:-}"
        [[ -n "$PROTO" && -n "$PORT" ]] \
            || { echo "[livos-net-expose] close needs <proto tcp|udp> <port 1-65535> [src-cidr]" >&2; exit 2; }
        _valid_proto "$PROTO" \
            || { echo "[livos-net-expose] invalid proto: '${PROTO}' (expected tcp|udp)" >&2; exit 2; }
        _valid_port "$PORT" \
            || { echo "[livos-net-expose] invalid port: '${PORT}' (expected int 1-65535)" >&2; exit 2; }
        if [[ -n "$SRC" ]]; then
            _valid_cidr "$SRC" \
                || { echo "[livos-net-expose] invalid src CIDR: '${SRC}'" >&2; exit 2; }
        fi
        _remove_opening "$PROTO" "$PORT" "$SRC"
        _regenerate_firewall
        _reexec_firewall
        echo "closed: ${PROTO}/${PORT}${SRC:+ from ${SRC}}"
        exit 0
        ;;

    list)
        # Print the openings state file (guarded — absent file is not an error).
        cat "$STATE_LIST" 2>/dev/null || true
        exit 0
        ;;

    *)
        echo "[livos-net-expose] invalid action: '${ACTION}' — expected one of: status open close list" >&2
        exit 2
        ;;
esac
