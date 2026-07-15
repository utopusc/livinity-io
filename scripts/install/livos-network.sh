#!/usr/bin/env bash
# scripts/install/livos-network.sh
# Phase 325 (NET-01) — root-owned host networking wrapper (hostname / static-IP /
# DNS) with a fail-closed armed-rollback watchdog.
#
# Deployed to /usr/local/lib/livos/livos-network.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-network) + update.sh (Step 7.10g). Invoked by
# livinityd's system routes (325-08) via the scoped sudoers grant
# (sudoers.d/livos-network):
#   sudo -n /usr/local/lib/livos/livos-network.sh <action> [args...]
#
# WHY A WRAPPER (clone of the Phase 313 livos-smartctl.sh + Phase 316
# livos-gpu-install.sh + Phase 326 livos-os-patch.sh HIGH-01 template): the
# privileged surface here is writing /etc/netplan yaml, /etc/hosts, running
# hostnamectl + netplan generate/apply, and arming a root systemd timer.
# livinityd runs as the unprivileged desktop user. A raw NOPASSWD grant on
# netplan / hostnamectl / a text editor would let any process that can call `sudo`
# inject arbitrary flags, write arbitrary netplan config bodies, or point the box
# at an attacker-chosen gateway. Instead the sudoers grant is on THIS ONE binary
# path (no glob, no argument wildcard) and the wrapper accepts ONLY a fixed action
# enum {status|set-hostname|apply-ip|confirm|revert|set-dns}. It regex-validates
# EVERY positional value (RFC-1123 hostname; IPv4 / IPv4-CIDR; IPv4 DNS CSV) BEFORE
# it reaches any privileged command or config file, and it builds the ENTIRE yaml
# body itself, so no caller-supplied string can escape into a flag or a foreign
# config directive (T-325-17). To change a permitted operation, EDIT THIS WRAPPER —
# do NOT broaden the grant.
#
# LOCKOUT-SAFE APPLY (D-09 / T-325-18) — the crux of NET-01:
# A bad static-IP or gateway can sever the box (esp. a remote/headless server).
# We deliberately do NOT use netplan's `try` subcommand (D-09) — it is a TTY-era
# tool with self-admitted unreliable rollback (bridges/bonds cannot revert;
# Canonical LP #1907316). Instead we use the
# Cockpit/NetworkManager-checkpoint pattern, reimplemented for networkd:
#   1. snapshot the current-good /etc/netplan/*.yaml (+ owned state) to
#      /etc/netplan/.livos-backup/ (or note absence);
#   2. write the candidate /etc/netplan/90-livos.yaml (mode 0600, ATOMIC:
#      temp-in-/etc/netplan -> chmod 600 -> rename);
#   3. `netplan generate` (validates the whole config) — abort+restore on failure;
#   4. clear any stale positive-confirm flag (default outcome MUST be revert);
#   5. ARM — BEFORE apply — a detached root watchdog via
#      `systemd-run --on-active=90s --unit=livos-net-revert` that restores the
#      backup + `netplan apply` UNLESS /run/livos/net-confirm exists. It is a
#      SEPARATE process tree (system.slice transient unit) that survives livinityd
#      losing connectivity;
#   6. `netplan apply`.
# The UI reconnects over the NEW address and calls `confirm`, which touches
# /run/livos/net-confirm and cancels the timer. `confirm` is the POSITIVE action ->
# if the operator is locked out and never confirms, the watchdog fires and reverts.
# Fail-closed: the DEFAULT outcome is REVERT.
#
# `set-hostname` also syncs the `127.0.1.1 <name>` line in /etc/hosts (D-09c) —
# hostnamectl alone does NOT, and a missing entry makes every later `sudo` print
# "unable to resolve host <name>". `set-dns` rewrites only the nameservers stanza
# and is NOT watchdog-armed (a DNS change cannot sever the L3 path — low lockout
# risk). WSL2 hiding is handled route-side (325-08 reuses the existing isWsl2) —
# this wrapper is never invoked under WSL, so no WSL branch lives here.
#
# Args (the enum is the ONLY control input; anything else -> exit 2, nothing
# privileged runs):
#   $1  action    — status | set-hostname | apply-ip | confirm | revert | set-dns
#   set-hostname  — $2 <name>            (RFC-1123 label, <=63 chars)
#   apply-ip      — $2 <address/CIDR>  $3 <gateway>   (both IPv4)
#   set-dns       — $2 <csv>            (comma-separated IPv4 servers)
#
# Exit codes: 2 = bad usage / unknown action / failed validation.
#             1 = operation failed (mktemp / no default interface / netplan error).
#             Otherwise the underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-network] must run as root" >&2; exit 2; }

# Absolute deploy path — used to re-invoke ourselves as the armed watchdog unit.
# This is the documented install location (deploy block 2a-network / Step 7.10g).
SELF="/usr/local/lib/livos/livos-network.sh"

OWNED_YAML="/etc/netplan/90-livos.yaml"   # the ONE netplan file this wrapper owns
BACKUP_DIR="/etc/netplan/.livos-backup"    # pre-apply snapshot (hidden; not *.yaml)
STATE="/etc/netplan/.livos-state"          # owned KEY=value state (hidden; not *.yaml)
CONFIRM_FLAG="/run/livos/net-confirm"      # positive-confirm flag (tmpfs, root-only)
REVERT_UNIT="livos-net-revert"             # transient systemd timer/service name

# ── Validators (run BEFORE any value is embedded in a privileged command / file) ──

# Strict IPv4 dotted-quad with per-octet <=255 bound.
_valid_ipv4() {
    local _ip="$1"
    [[ "$_ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
    (( ${BASH_REMATCH[1]} <= 255 && ${BASH_REMATCH[2]} <= 255 \
       && ${BASH_REMATCH[3]} <= 255 && ${BASH_REMATCH[4]} <= 255 ))
}

# IPv4 address with a /0-32 CIDR prefix.
_valid_cidr() {
    local _c="$1"
    [[ "$_c" =~ ^(.+)/([0-9]{1,2})$ ]] || return 1
    _valid_ipv4 "${BASH_REMATCH[1]}" && (( ${BASH_REMATCH[2]} <= 32 ))
}

# Detected interface name — restricted charset (defence-in-depth; it is discovered,
# not caller-supplied, but it still ends up in the yaml body).
_valid_iface() { [[ "$1" =~ ^[A-Za-z0-9._@-]+$ ]]; }

# ── Detection helpers (each ends on a guaranteed-zero command so `set -e` + a
#    `VAR=$(...)` assignment never trips on an empty probe). ──

# Default-route interface (the one a static IP / DNS change applies to).
_detect_iface() {
    ip route show default 2>/dev/null | awk '/default/{print $5; exit}' 2>/dev/null || true
}

# Prefer an existing netplan renderer; else an active NetworkManager; else the
# server default (networkd). We do NOT hardcode networkd (D-09c).
_detect_renderer() {
    local _r
    _r=$(grep -hoE 'renderer:[[:space:]]*(networkd|NetworkManager)' /etc/netplan/*.yaml 2>/dev/null \
         | awk '{print $2}' | head -1 || true)
    if [[ -n "$_r" ]]; then echo "$_r"; return 0; fi
    if systemctl is-active --quiet NetworkManager 2>/dev/null; then echo "NetworkManager"; return 0; fi
    echo "networkd"
}

# Current resolver addresses (preserved across an apply-ip so DNS is not dropped).
_detect_dns() {
    resolvectl dns 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' \
        | sort -u | paste -sd, - 2>/dev/null || true
}

# ── Owned-state load/save (parsed, NOT sourced — no code-exec surface even if the
#    0600 root-only file were somehow tampered). ──
RENDERER=""; IFACE=""; MODE=""; ADDRESS=""; GATEWAY=""; DNS=""

_load_state() {
    [[ -f "$STATE" ]] || return 0
    local k v
    while IFS='=' read -r k v; do
        case "$k" in
            RENDERER) RENDERER="$v" ;;
            IFACE)    IFACE="$v" ;;
            MODE)     MODE="$v" ;;
            ADDRESS)  ADDRESS="$v" ;;
            GATEWAY)  GATEWAY="$v" ;;
            DNS)      DNS="$v" ;;
        esac
    done < "$STATE"
    return 0
}

_save_state() {
    local _tmp
    _tmp=$(mktemp) || { echo "[livos-network] mktemp failed (state)" >&2; exit 1; }
    {
        echo "RENDERER=${RENDERER}"
        echo "IFACE=${IFACE}"
        echo "MODE=${MODE}"
        echo "ADDRESS=${ADDRESS}"
        echo "GATEWAY=${GATEWAY}"
        echo "DNS=${DNS}"
    } > "$_tmp"
    chmod 0600 "$_tmp"
    mv -f "$_tmp" "$STATE"
}

# Render /etc/netplan/90-livos.yaml ENTIRELY from validated state vars (0600,
# atomic temp+rename in /etc/netplan). The wrapper owns every byte of this file.
_render_yaml() {
    local _tmp _dns_yaml
    _tmp=$(mktemp "/etc/netplan/.livos-XXXXXX.tmp") \
        || { echo "[livos-network] mktemp failed (yaml)" >&2; exit 1; }
    {
        echo "# Managed by LivOS (325 NET-01). Owned file — do NOT hand-edit."
        echo "# Regenerated by livos-network.sh; manual changes are overwritten."
        echo "network:"
        echo "  version: 2"
        echo "  renderer: ${RENDERER}"
        echo "  ethernets:"
        echo "    ${IFACE}:"
        if [[ "$MODE" == "static" ]]; then
            echo "      dhcp4: false"
            echo "      addresses:"
            echo "        - ${ADDRESS}"
            echo "      routes:"
            echo "        - to: default"
            echo "          via: ${GATEWAY}"
        else
            echo "      dhcp4: true"
            if [[ -n "$DNS" ]]; then
                # keep DHCP-assigned addresses but let OUR nameservers win.
                echo "      dhcp4-overrides:"
                echo "        use-dns: false"
            fi
        fi
        if [[ -n "$DNS" ]]; then
            _dns_yaml=$(echo "$DNS" | sed 's/,/, /g')
            echo "      nameservers:"
            echo "        addresses: [${_dns_yaml}]"
        fi
    } > "$_tmp"
    chmod 0600 "$_tmp"
    mv -f "$_tmp" "$OWNED_YAML"
}

# Snapshot the CURRENT good netplan set (+ owned state) before a risky apply.
_snapshot_backup() {
    rm -rf "$BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    chmod 0700 "$BACKUP_DIR"
    local f
    for f in /etc/netplan/*.yaml; do
        [[ -e "$f" ]] && cp -a "$f" "$BACKUP_DIR/"
    done
    [[ -f "$STATE" ]] && cp -a "$STATE" "$BACKUP_DIR/livos-state.bak"
    return 0
}

# Restore the snapshot: wipe every top-level yaml (incl. our candidate), put the
# backed-up originals back, restore the owned state. Correct for both first-apply
# (empty backup -> our file simply removed) and re-apply (previous 90-livos.yaml
# restored).
_restore_backup() {
    [[ -d "$BACKUP_DIR" ]] || return 0
    find /etc/netplan -maxdepth 1 -name '*.yaml' -delete 2>/dev/null || true
    local f
    for f in "$BACKUP_DIR"/*.yaml; do
        [[ -e "$f" ]] && cp -a "$f" /etc/netplan/
    done
    rm -f "$STATE"
    [[ -f "$BACKUP_DIR/livos-state.bak" ]] && cp -a "$BACKUP_DIR/livos-state.bak" "$STATE"
    return 0
}

# Cancel any previously-armed watchdog timer/service (idempotent, never fails).
_disarm_watchdog() {
    systemctl stop "${REVERT_UNIT}.timer" 2>/dev/null || true
    systemctl stop "${REVERT_UNIT}.service" 2>/dev/null || true
    systemctl reset-failed "${REVERT_UNIT}.timer" "${REVERT_UNIT}.service" 2>/dev/null || true
}

ACTION="${1:-}"

case "$ACTION" in
    status)
        # Read-only host probes. `set -e` is on, so every no-match/absent path is
        # guarded with `|| true`. Route-side (325-08) adds isWsl2 — not here.
        echo "renderer: $(_detect_renderer)"
        echo "hostname: $(hostname 2>/dev/null || true)"
        echo "networkmanager-active: $(systemctl is-active NetworkManager 2>/dev/null || true)"
        echo "networkd-active: $(systemctl is-active systemd-networkd 2>/dev/null || true)"
        echo "default-iface: $(_detect_iface)"
        echo "nameservers: $(_detect_dns)"
        echo "net-confirm-armed: $([[ -f "$CONFIRM_FLAG" ]] && echo yes || echo no)"
        echo "revert-timer: $(systemctl is-active "${REVERT_UNIT}.timer" 2>/dev/null || true)"
        echo "addresses:"
        ip -brief addr show 2>/dev/null || true
        echo "owned-yaml:"
        cat "$OWNED_YAML" 2>/dev/null || true
        exit 0
        ;;

    set-hostname)
        # Validate the RFC-1123 label (case-insensitive) BEFORE use, set it, THEN
        # sync /etc/hosts 127.0.1.1 (D-09c — else sudo "unable to resolve host").
        NAME="${2:-}"
        [[ -n "$NAME" ]] || { echo "[livos-network] set-hostname needs <name>" >&2; exit 2; }
        [[ "$NAME" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$ ]] \
            || { echo "[livos-network] invalid hostname: '${NAME}'" >&2; exit 2; }
        hostnamectl set-hostname "$NAME"
        # Atomic /etc/hosts rewrite: replace the existing 127.0.1.1 line or append one.
        _hosts_tmp=$(mktemp "/etc/hosts.livos-XXXXXX") \
            || { echo "[livos-network] mktemp failed (hosts)" >&2; exit 1; }
        if grep -qE '^127\.0\.1\.1[[:space:]]' /etc/hosts 2>/dev/null; then
            sed -E "s/^127\.0\.1\.1[[:space:]].*/127.0.1.1\t${NAME}/" /etc/hosts > "$_hosts_tmp"
        else
            cat /etc/hosts > "$_hosts_tmp" 2>/dev/null || true
            printf '127.0.1.1\t%s\n' "$NAME" >> "$_hosts_tmp"
        fi
        chmod 0644 "$_hosts_tmp"
        mv -f "$_hosts_tmp" /etc/hosts
        echo "hostname-set: ${NAME}"
        exit 0
        ;;

    apply-ip)
        # apply-ip <address/CIDR> <gateway> — the lockout-safe static-IP apply.
        # Strict validation FIRST, then snapshot -> render -> generate(validate) ->
        # arm watchdog BEFORE apply -> apply. Default outcome is REVERT.
        ADDR_IN="${2:-}"
        GW_IN="${3:-}"
        [[ -n "$ADDR_IN" && -n "$GW_IN" ]] \
            || { echo "[livos-network] apply-ip needs <address/CIDR> <gateway>" >&2; exit 2; }
        _valid_cidr "$ADDR_IN" \
            || { echo "[livos-network] invalid address/CIDR: '${ADDR_IN}'" >&2; exit 2; }
        _valid_ipv4 "$GW_IN" \
            || { echo "[livos-network] invalid gateway: '${GW_IN}'" >&2; exit 2; }

        _load_state
        [[ -n "$RENDERER" ]] || RENDERER=$(_detect_renderer)
        [[ -n "$IFACE" ]]    || IFACE=$(_detect_iface)
        [[ -n "$DNS" ]]      || DNS=$(_detect_dns)
        [[ -n "$IFACE" ]] \
            || { echo "[livos-network] no default-route interface detected — cannot apply" >&2; exit 1; }
        _valid_iface "$IFACE" \
            || { echo "[livos-network] refusing suspicious interface name: '${IFACE}'" >&2; exit 2; }
        MODE="static"; ADDRESS="$ADDR_IN"; GATEWAY="$GW_IN"

        _snapshot_backup
        _render_yaml
        _save_state

        # Validate the WHOLE netplan config before touching the live network.
        if ! netplan generate 2>&1; then
            echo "[livos-network] netplan generate failed — restoring backup, NOT applying" >&2
            _restore_backup
            netplan generate 2>/dev/null || true
            exit 1
        fi

        # Default outcome MUST be revert: clear any stale positive-confirm flag.
        rm -f "$CONFIRM_FLAG"
        mkdir -p "$(dirname "$CONFIRM_FLAG")"

        # ARM the fail-closed watchdog BEFORE apply. It is a detached root transient
        # unit (system.slice) that survives livinityd losing the network; it reverts
        # UNLESS the positive-confirm flag appears within 90s (see __watchdog-revert).
        # This is the armed-watchdog pattern, NOT netplan's `try` subcommand (D-09).
        _disarm_watchdog
        if ! systemd-run --on-active=90s --unit="$REVERT_UNIT" --collect --quiet \
                --description="LivOS network apply auto-revert (fail-closed)" \
                -- "$SELF" __watchdog-revert 2>/dev/null; then
            echo "[livos-network] could NOT arm revert watchdog — restoring backup, NOT applying" >&2
            _restore_backup
            netplan generate 2>/dev/null || true
            exit 1
        fi

        netplan apply
        echo "applied — confirm within 90s from the new address or it auto-reverts"
        exit 0
        ;;

    confirm)
        # POSITIVE confirm: cancel the armed auto-revert. Reachable route-side only
        # after the UI reconnects over the NEW address (325-08 adminProcedure).
        mkdir -p "$(dirname "$CONFIRM_FLAG")"
        touch "$CONFIRM_FLAG"
        _disarm_watchdog
        echo "confirmed"
        exit 0
        ;;

    revert)
        # Manual immediate revert (operator-triggered rollback before the timer).
        _disarm_watchdog
        _restore_backup
        netplan apply
        echo "reverted"
        exit 0
        ;;

    set-dns)
        # set-dns <csv> — rewrite ONLY the nameservers stanza of the owned yaml.
        # No watchdog: a resolver change cannot sever the L3 path (low lockout risk).
        DNS_IN="${2:-}"
        [[ -n "$DNS_IN" ]] || { echo "[livos-network] set-dns needs <csv>" >&2; exit 2; }
        # Validate every server is IPv4 before it reaches the yaml.
        _IFS_SAVE="$IFS"; IFS=','
        # shellcheck disable=SC2206
        _servers=($DNS_IN)
        IFS="$_IFS_SAVE"
        [[ "${#_servers[@]}" -ge 1 ]] || { echo "[livos-network] set-dns: empty list" >&2; exit 2; }
        for _s in "${_servers[@]}"; do
            _valid_ipv4 "$_s" || { echo "[livos-network] invalid DNS server: '${_s}'" >&2; exit 2; }
        done

        _load_state
        [[ -n "$RENDERER" ]] || RENDERER=$(_detect_renderer)
        [[ -n "$IFACE" ]]    || IFACE=$(_detect_iface)
        [[ -n "$MODE" ]]     || MODE="dhcp"   # DNS-only change keeps the existing addressing mode
        [[ -n "$IFACE" ]] \
            || { echo "[livos-network] no default-route interface detected — cannot set DNS" >&2; exit 1; }
        _valid_iface "$IFACE" \
            || { echo "[livos-network] refusing suspicious interface name: '${IFACE}'" >&2; exit 2; }
        DNS="$DNS_IN"

        _render_yaml
        _save_state
        if ! netplan generate 2>&1; then
            echo "[livos-network] netplan generate failed after set-dns" >&2
            exit 1
        fi
        netplan apply
        echo "dns-set: ${DNS}"
        exit 0
        ;;

    __watchdog-revert)
        # INTERNAL — invoked ONLY by the armed systemd-run timer 90s after apply-ip.
        # Fail-closed: if the operator confirmed (positive flag present) do nothing;
        # otherwise restore the pre-apply backup and re-apply. This runs in its own
        # process tree so it survives livinityd/network loss.
        if [[ -f "$CONFIRM_FLAG" ]]; then
            echo "[livos-network] confirmed — watchdog no-op"
            exit 0
        fi
        echo "[livos-network] no confirm within window — reverting network config"
        _restore_backup
        netplan apply || true
        exit 0
        ;;

    *)
        echo "[livos-network] invalid action: '${ACTION}' — expected one of: status set-hostname apply-ip confirm revert set-dns" >&2
        exit 2
        ;;
esac
