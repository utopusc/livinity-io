#!/usr/bin/env bash
# scripts/install/livos-landns.sh
# Phase 347 (LANDNS-01, D-347-3/4/5) — root-owned LAN-DNS / mDNS wrapper.
#
# Deployed to /usr/local/lib/livos/livos-landns.sh (mode 0755, root-owned) by
# update.sh (Step 7.10z). Invoked by livinityd's system routes (347-03) via the
# scoped sudoers grant (sudoers.d/livos-landns):
#   sudo -n /usr/local/lib/livos/livos-landns.sh <action> [args...]
#
# WHY A WRAPPER (clone of the Phase 329 livos-power.sh HW/NET template): the
# privileged surface here is `apt-get install`, writing /etc/dnsmasq.d, and enabling
# systemd units (dnsmasq / avahi-daemon) — all root-only. livinityd runs as the
# unprivileged desktop user. A raw NOPASSWD grant on apt / systemctl / a config path
# would let any process that can call `sudo` inject arbitrary flags, config bodies, or
# unit names. Instead the sudoers grant is on THIS ONE binary path (no glob, no argument
# wildcard) and the wrapper accepts ONLY a fixed closed action enum. It regex-validates
# every ip / domain token BEFORE that value reaches a privileged command, and it builds
# every argv + every /etc file body ITSELF — so no caller-supplied string can ever reach
# a privileged command or a config file unvalidated. To change a permitted operation,
# EDIT THIS WRAPPER — do NOT broaden the grant.
#
# OPT-IN, DEFAULT-OFF, NEVER-THE-SOLE-RESOLVER: enable writes a dnsmasq *drop-in*
# (/etc/dnsmasq.d/livos-landns.conf) with `bind-dynamic` — it does NOT seize the LAN as
# the sole resolver and NEVER touches /etc/resolv.conf. The box answers DNS only for
# clients the operator explicitly points at it (router/DHCP DNS). Nothing here auto-enables.
#
# DISJOINT FROM THE CF/PORTAL PATH BY CONSTRUCTION (D-347-5): this wrapper references
# NOTHING of the Cloudflare/portal path — no hybrid-token secret, no CF API, no portal
# domain-mode Redis key, no Caddy config file. It owns its OWN config namespace
# (/etc/dnsmasq.d/livos-landns.conf). A box in portal (CF) mode and LANDNS mode coexist
# without either writing the other's state. `.local` is REJECTED for split-horizon
# (mirrors caddy.ts:1165 validatePortalDomain) — dnsmasq split-horizon is ONLY for the
# box's REAL public-cert FQDN; `.local` is avahi discovery-only (a .local TLD can never
# get a public cert, which would reintroduce the retired internal-CA problem).
#
# Actions (the enum is the ONLY control input; anything else -> exit 2, nothing runs):
#   install                     apt-get install dnsmasq + avahi-daemon (non-fatal per-pkg)
#   enable   <hostIp> <domain>  write the split-horizon drop-in (address=/<domain>/<hostIp>)
#                               + reload dnsmasq. Both args regex-validated; `.local` rejected.
#   disable                     remove the drop-in + reload dnsmasq. Fully fail-tolerant.
#   status                      read-only report of the drop-in / dnsmasq / avahi / tool presence
#   mdns-enable                 enable avahi-daemon (publishes <hostname>.local -> box IP for box
#                               DISCOVERY ONLY — never app .local vhosts, D-347-4)
#   mdns-disable                disable avahi-daemon
#
# Exit codes: 2 = bad usage / unknown action / invalid argument. Otherwise the underlying
# command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-landns] must run as root" >&2; exit 2; }

ACTION="${1:-}"

# ── State locations (all wrapper-owned) ──────────────────────────────────────
# dnsmasq split-horizon drop-in. dnsmasq reads /etc/dnsmasq.d/*.conf; this file is the
# ONLY thing LANDNS writes there, so disable can excise it cleanly.
DNSMASQ_CONF="/etc/dnsmasq.d/livos-landns.conf"

# ── Validators (run BEFORE any value reaches a privileged command) ───────────

# Strict IPv4: four dot-separated octets, each 0-255 (mirrors the routes.ts IPV4_RE shape).
_valid_ipv4() {
	local ip="${1:-}" o
	[[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
	for o in "${BASH_REMATCH[@]:1}"; do
		(( 10#$o >= 0 && 10#$o <= 255 )) || return 1
	done
	return 0
}

# A real (public-cert-bearing) FQDN. Lowercase labels, hyphen-internal, >=2 labels, no
# leading/trailing dot, no `..`, no `/`, length <= 253. REJECTS anything ending in
# `.local` — the disjointness discipline mirroring caddy.ts:1165 validatePortalDomain:
# dnsmasq split-horizon is ONLY for real FQDNs that already have a valid public cert;
# `.local` is avahi discovery-only.
_valid_domain() {
	local d="${1:-}"
	[[ -n "$d" ]] || return 2
	(( ${#d} <= 253 )) || return 2
	[[ "$d" == *".."* ]] && return 2
	[[ "$d" == *"/"* ]] && return 2
	[[ "$d" == *.local ]] && return 2
	[[ "$d" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || return 2
	return 0
}

# ── Actions ──────────────────────────────────────────────────────────────────
case "$ACTION" in
	install)
		# dnsmasq (split-horizon LAN resolver) + avahi-daemon (mDNS box discovery). The
		# wrapper builds the exact apt argv itself — no caller string enters any command
		# line. avahi-daemon is best-effort: a failure there does not block dnsmasq.
		export DEBIAN_FRONTEND=noninteractive
		apt-get update -qq || true
		apt-get install -y -qq dnsmasq || {
			echo "[livos-landns] apt could not install dnsmasq — LAN-DNS unavailable until fixed" >&2; exit 1; }
		apt-get install -y -qq avahi-daemon || \
			echo "[livos-landns] apt could not install avahi-daemon (non-fatal — mDNS box discovery unavailable until fixed)" >&2
		echo "installed"
		exit 0
		;;

	enable)
		# enable <hostIp> <domain>: write the split-horizon drop-in resolving the box's
		# REAL FQDN space to the LAN box IP, then reload dnsmasq. BOTH args are validated
		# (IPv4 + real-FQDN, `.local` rejected) BEFORE they reach the file; the wrapper
		# builds every config line from the validated values, so no caller string reaches
		# the file unvalidated. OPT-IN: this only writes a drop-in + `bind-dynamic` — it does
		# NOT make the box the sole LAN resolver and NEVER touches /etc/resolv.conf. The
		# operator must point clients/router-DHCP at the box for it to take effect.
		HOST_IP="${2:-}"; DOMAIN="${3:-}"
		_valid_ipv4 "$HOST_IP" || {
			echo "[livos-landns] invalid host IP (expected IPv4, e.g. 192.168.1.10): '${HOST_IP}'" >&2; exit 2; }
		_valid_domain "$DOMAIN" || {
			echo "[livos-landns] invalid domain (expected a real FQDN; .local is discovery-only and rejected): '${DOMAIN}'" >&2; exit 2; }

		# Atomically write the drop-in. Every line is built from the two validated values;
		# the revived retired split-horizon body (Phase 142, minus the internal CA):
		#   address=/<domain>/<hostIp>  wildcard-resolve the FQDN space to the box IP
		#   local=/<domain>/            never forward this domain upstream
		#   no-resolv                   ignore /etc/resolv.conf; use only the servers below
		#   server=1.1.1.1 / 1.0.0.1    upstream forwarders for everything else
		#   bind-dynamic                bind per-interface as they appear — do NOT seize all
		#   stop-dns-rebind             drop upstream answers that map to private ranges
		_tmp=$(mktemp)
		{
			echo "# Generated by livos-landns.sh (Phase 347 LANDNS-01) — opt-in split-horizon"
			echo "# Resolves the box's REAL FQDN space to the LAN box IP. Default-OFF; the box"
			echo "# NEVER auto-becomes the sole LAN resolver — point your router/DHCP DNS here."
			echo "address=/${DOMAIN}/${HOST_IP}"
			echo "local=/${DOMAIN}/"
			echo "no-resolv"
			echo "server=1.1.1.1"
			echo "server=1.0.0.1"
			echo "bind-dynamic"
			echo "stop-dns-rebind"
		} > "$_tmp"
		install -m 0644 -o root -g root "$_tmp" "$DNSMASQ_CONF"
		rm -f "$_tmp"

		systemctl reload dnsmasq 2>/dev/null || systemctl restart dnsmasq || true
		systemctl enable dnsmasq 2>/dev/null || true
		echo "enable ${DOMAIN} -> ${HOST_IP} (point your router/DHCP DNS or LAN clients at this box to use it — LivOS never auto-becomes your LAN resolver)"
		exit 0
		;;

	disable)
		# Remove the split-horizon drop-in + reload dnsmasq so the box stops answering for
		# the FQDN space. Fully fail-tolerant (the drop-in / unit may already be gone).
		rm -f "$DNSMASQ_CONF"
		systemctl reload dnsmasq 2>/dev/null || systemctl restart dnsmasq 2>/dev/null || true
		echo "disable"
		exit 0
		;;

	mdns-enable)
		# Enable avahi-daemon. avahi publishes `<hostname>.local -> host IP` by DEFAULT, so
		# no service file is written here — box DISCOVERY ONLY (D-347-4). We deliberately do
		# NOT publish any app `.local` vhost service files: a `.local` TLD can never get a
		# public cert, which would reintroduce the retired internal-CA problem.
		systemctl enable --now avahi-daemon 2>/dev/null || true
		echo "mdns-enable"
		exit 0
		;;

	mdns-disable)
		# Stop + disable avahi-daemon (box discovery off). Fully fail-tolerant.
		systemctl disable --now avahi-daemon 2>/dev/null || true
		echo "mdns-disable"
		exit 0
		;;

	status)
		# Read-only. `set -e` is on, so every probe is guarded with `|| true`.
		echo "== livos-landns status =="
		echo "-- LAN-DNS (dnsmasq split-horizon) --"
		if [[ -f "$DNSMASQ_CONF" ]]; then
			grep -E '^address=/' "$DNSMASQ_CONF" 2>/dev/null | sed 's/^/  split-horizon: /' || true
		else
			echo "  dnsmasq: disabled (default OFF)"
		fi
		if command -v dnsmasq >/dev/null 2>&1; then
			systemctl is-active dnsmasq 2>/dev/null | sed 's/^/  dnsmasq unit: /' || echo "  dnsmasq unit: unknown"
		else
			echo "  dnsmasq: not installed (run install)"
		fi
		echo "-- mDNS (avahi box discovery) --"
		if command -v avahi-daemon >/dev/null 2>&1; then
			systemctl is-active avahi-daemon 2>/dev/null | sed 's/^/  mdns(avahi): /' || echo "  mdns(avahi): unknown"
		else
			echo "  mdns(avahi): not installed (run install)"
		fi
		exit 0
		;;

	*)
		echo "[livos-landns] invalid action: '${ACTION}' — expected one of: install enable disable status mdns-enable mdns-disable" >&2
		exit 2
		;;
esac
