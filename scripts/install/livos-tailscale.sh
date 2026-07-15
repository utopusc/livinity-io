#!/usr/bin/env bash
# scripts/install/livos-tailscale.sh
# Phase 325 (NET-02) — root-owned Tailscale VPN install/login/toggle wrapper.
#
# Deployed to /usr/local/lib/livos/livos-tailscale.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-tailscale) + update.sh (Step 7.10h). Invoked by
# livinityd's system routes (325-10) via the scoped sudoers grant
# (sudoers.d/livos-tailscale):
#   sudo -n /usr/local/lib/livos/livos-tailscale.sh <action>
#
# WHY A WRAPPER (clone of the Phase 326 livos-ups.sh + Phase 325 livos-network.sh
# closed-enum root-wrapper template): the privileged surface here is adding the
# Tailscale apt repo, `apt-get install tailscale`, `tailscale login/set/down`, a
# UFW rule, WRITING the /opt/livos/.env EnvironmentFile, and restarting
# livos.service / cloudflared — all root-only. livinityd runs as the unprivileged
# desktop user. A raw NOPASSWD grant on apt-get / tailscale / ufw / systemctl /
# tee would let any process that can call `sudo` inject arbitrary flags, package
# names, or /opt/livos/.env content. Instead the sudoers grant is on THIS ONE
# binary path (no glob, no argument wildcard) and the wrapper accepts ONLY a fixed
# action enum {install|login|set|down|status}. It builds every apt/tailscale/ufw/
# systemctl argv AND the fixed `LIVOS_TAILSCALE_BIND=<validated tailscale ip -4>`
# .env line ITSELF, so no caller-supplied string can ever reach a privileged
# command or the EnvironmentFile.
# To change a permitted operation, EDIT THIS WRAPPER — do NOT broaden the grant.
#
# D-11 (MagicDNS/cloudflared-1033 house fix): the `set` action uses
# `tailscale set --accept-dns=false` — NEVER `tailscale up`. `tailscale up` RESETS
# every unspecified flag to its default (footgun); `set` changes ONLY what you
# pass. `--accept-dns=false` is the confirmed fix for the recurring
# MagicDNS→resolv.conf→cloudflared error-1033 pitfall
# ([[feedback_tailscale_magicdns_breaks_cloudflared_1033]]).
#
# D-12 (additive overlay bind persistence): on `login` reaching Running the
# wrapper resolves the overlay IP (`tailscale ip -4`), validates it, and
# READ-MERGEs it into /opt/livos/.env as `LIVOS_TAILSCALE_BIND=<ip>` (preserving
# every OTHER var — never truncate/clobber), then `systemctl restart livos.service`
# so systemd re-reads the EnvironmentFile and the server's ADDITIVE overlay
# listener (server/index.ts) binds the tailnet IP on the next boot of the unit.
# `down` removes/blanks that one line + restarts, dropping the overlay listener.
# The loopback listener is NEVER touched (Caddy 127.0.0.1:8080 + liv-core survive).
#
# WR-01 (guided-login AuthURL delivery): the browser AuthURL/QR MUST be shown while
# the login is still PENDING, not after Running is reached. So the login flow is split
# into `login-start` (spawn a DETACHED `tailscale login`, poll only for the AuthURL,
# print it, and return immediately) and `login-finish` (called once the UI's `status`
# poll shows Running — resolves+persists the overlay bind + restarts the unit). The
# legacy blocking `login` action is retained for direct install-test only.
#
# Args (the enum is the ONLY input; anything else -> exit 2, nothing privileged runs):
#   $1  action — install | login | login-start | login-finish | set | down | status
#
# Exit codes: 2 = bad usage / unknown action. Otherwise the underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-tailscale] must run as root" >&2; exit 2; }

ACTION="${1:-}"

# Absolute path to this script — used to persist the overlay bind + restart the unit.
LIVOS_ENV_FILE='/opt/livos/.env'
TS_KEYRING='/usr/share/keyrings/tailscale-archive-keyring.gpg'
TS_SOURCES_LIST='/etc/apt/sources.list.d/tailscale.list'
TS_KEYRING_URL='https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg'

# ── helpers ────────────────────────────────────────────────────────────────

# Strict IPv4 validation (per-octet <= 255) — the ONLY value that reaches the
# .env body is a `tailscale ip -4` result, and it is validated here first so a
# compromised tailscale binary still cannot inject an arbitrary .env line
# (T-325-26 arg/content-injection closure).
_valid_ipv4() {
	local ip="${1:-}" o
	[[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
	for o in "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" "${BASH_REMATCH[4]}"; do
		((o <= 255)) || return 1
	done
	return 0
}

# Extract a top-level JSON STRING field value from `tailscale status --json`
# without a jq dependency. Reads stdin; $1 = key. Returns the first match's
# unquoted value (empty if absent). Tailscale emits these as `"Key": "value"`.
_json_str() {
	local key="$1"
	grep -oE "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -n1 \
		| sed -E "s/^\"${key}\"[[:space:]]*:[[:space:]]*\"//; s/\"$//"
}

# READ-MERGE a KEY=value line into /opt/livos/.env, preserving EVERY other var
# (D-12; never truncate/clobber). $1 = key, $2 = value. An EMPTY value REMOVES
# the key's line (toggle-off). Atomic temp-in-same-dir + rename; the existing
# file's mode+owner are preserved onto the temp so the EnvironmentFile keeps its
# permissions.
_env_merge() {
	local key="$1" val="${2:-}" f="$LIVOS_ENV_FILE" d tmp
	d="$(dirname "$f")"
	mkdir -p "$d"
	[[ -f "$f" ]] || : > "$f"
	tmp="$(mktemp "${d}/.env.livos.XXXXXX")"
	# Copy every line EXCEPT the managed key (read-merge: unrelated vars survive).
	grep -vE "^[[:space:]]*${key}=" "$f" > "$tmp" || true
	if [[ -n "$val" ]]; then
		printf '%s=%s\n' "$key" "$val" >> "$tmp"
	fi
	# Preserve the existing EnvironmentFile's mode+owner onto the replacement.
	chmod --reference="$f" "$tmp" 2>/dev/null || chmod 0640 "$tmp"
	chown --reference="$f" "$tmp" 2>/dev/null || true
	mv -f "$tmp" "$f"
}

case "$ACTION" in
	install)
		# Add the official Tailscale apt repo PINNED to noble (24.04). The wrapper
		# builds the exact keyring + source-list itself — no caller string enters any
		# command line (mirrors the livos-gpu-install.sh dearmor+signed-by convention).
		export DEBIAN_FRONTEND=noninteractive
		mkdir -p /usr/share/keyrings /etc/apt/sources.list.d
		# noble.noarmor.gpg is already dearmored — install it directly as the keyring.
		curl -fsSL "$TS_KEYRING_URL" -o "$TS_KEYRING"
		chmod 0644 "$TS_KEYRING"
		# Pinned-to-noble source list (built here, not fetched — deterministic).
		printf 'deb [signed-by=%s] https://pkgs.tailscale.com/stable/ubuntu noble main\n' \
			"$TS_KEYRING" > "$TS_SOURCES_LIST"
		chmod 0644 "$TS_SOURCES_LIST"
		apt-get update -qq
		apt-get install -y -qq tailscale

		# The deploy blanket `ufw deny 8080/tcp` (deploy-livinityd.sh:2585) otherwise
		# blocks the overlay path to livinityd. Allow 8080 ONLY on the tailscale0
		# interface — scoped to the overlay, not re-exposing the LAN (T-325-28). ufw
		# may be inactive/absent on some boxes; never fail the install for it.
		if command -v ufw >/dev/null 2>&1; then
			ufw allow in on tailscale0 2>/dev/null || true
		fi
		echo "installed"
		exit 0
		;;

	login-start)
		# WR-01 fix — decouple AuthURL delivery from the Running-poll. Spawn
		# `tailscale login` DETACHED via setsid (new session, so the pending login
		# survives THIS wrapper exiting; tailscaled holds the login state and
		# completes it when the browser auth lands, even if the CLI client is gone).
		# Poll ONLY for the AuthURL (~30s @ 2s) and PRINT it IMMEDIATELY, then return
		# so the UI can render the link/QR right away and poll `status` for Running,
		# calling `login-finish` once up. No auth secret is ever echoed.
		setsid tailscale login >/dev/null 2>&1 </dev/null &
		_auth_url=''
		for _i in $(seq 1 15); do
			_auth_url="$(tailscale status --json 2>/dev/null | _json_str AuthURL)"
			if [[ -n "$_auth_url" ]]; then
				echo "AuthURL: ${_auth_url}"
				exit 0
			fi
			# Already-authenticated boxes go straight to Running with no AuthURL.
			if [[ "$(tailscale status --json 2>/dev/null | _json_str BackendState)" == "Running" ]]; then
				echo "already-running"
				exit 0
			fi
			sleep 2
		done
		# Timed out resolving an AuthURL — STILL exit 0 (never discard the flow): the
		# UI falls back to polling `status`, which surfaces AuthURL while pending.
		echo "auth-url-pending"
		exit 0
		;;

	login-finish)
		# WR-01 fix — called by the UI once its `status` poll shows Running. Verify
		# Running (short bounded poll ~30s @ 2s), then resolve + VALIDATE the overlay
		# IP and PERSIST it (D-12): read-merge LIVOS_TAILSCALE_BIND into /opt/livos/.env
		# and restart the unit so the additive overlay listener binds the tailnet IP.
		_state=''
		for _i in $(seq 1 15); do
			_state="$(tailscale status --json 2>/dev/null | _json_str BackendState)"
			[[ "$_state" == "Running" ]] && break
			sleep 2
		done
		if [[ "$_state" != "Running" ]]; then
			echo "[livos-tailscale] login has not reached Running yet (state: ${_state:-unknown})" >&2
			exit 1
		fi
		_overlay_ip="$(tailscale ip -4 2>/dev/null | head -n1 | tr -d '[:space:]')"
		if ! _valid_ipv4 "$_overlay_ip"; then
			echo "[livos-tailscale] could not resolve a valid overlay IPv4 (got: '${_overlay_ip}')" >&2
			exit 1
		fi
		_env_merge LIVOS_TAILSCALE_BIND "$_overlay_ip"
		systemctl restart livos.service 2>/dev/null || true
		echo "logged-in overlay=${_overlay_ip}"
		exit 0
		;;

	login)
		# Legacy blocking flow (install-test only; the UI uses login-start/login-finish).
		# Guided login-URL flow (D-11): spawn `tailscale login` (NOT `up`, which would
		# reset unspecified flags) in the background, then poll `tailscale status --json`
		# for the top-level AuthURL (empty until a login attempt is initiated —
		# tailscale/tailscale#1858) and PRINT it to stdout so the route can surface the
		# link/QR. No auth secret is ever echoed. Then poll until BackendState=Running.
		tailscale login >/dev/null 2>&1 &

		# Poll for the AuthURL (bounded: ~30s @ 2s cadence).
		_auth_url=''
		for _i in $(seq 1 15); do
			_auth_url="$(tailscale status --json 2>/dev/null | _json_str AuthURL)"
			if [[ -n "$_auth_url" ]]; then
				echo "AuthURL: ${_auth_url}"
				break
			fi
			# Already authenticated boxes go straight to Running with no AuthURL.
			if [[ "$(tailscale status --json 2>/dev/null | _json_str BackendState)" == "Running" ]]; then
				break
			fi
			sleep 2
		done

		# Poll until the backend reaches Running (bounded: ~5min @ 3s cadence — the
		# user must complete the browser auth in this window).
		_state=''
		for _i in $(seq 1 100); do
			_state="$(tailscale status --json 2>/dev/null | _json_str BackendState)"
			[[ "$_state" == "Running" ]] && break
			sleep 3
		done
		if [[ "$_state" != "Running" ]]; then
			echo "[livos-tailscale] login did not reach Running (state: ${_state:-unknown})" >&2
			exit 1
		fi

		# Resolve + VALIDATE the overlay IP, then PERSIST it (D-12): read-merge
		# LIVOS_TAILSCALE_BIND into /opt/livos/.env and restart the unit so the
		# additive overlay listener binds the tailnet IP.
		_overlay_ip="$(tailscale ip -4 2>/dev/null | head -n1 | tr -d '[:space:]')"
		if ! _valid_ipv4 "$_overlay_ip"; then
			echo "[livos-tailscale] could not resolve a valid overlay IPv4 (got: '${_overlay_ip}')" >&2
			exit 1
		fi
		_env_merge LIVOS_TAILSCALE_BIND "$_overlay_ip"
		systemctl restart livos.service 2>/dev/null || true
		echo "logged-in overlay=${_overlay_ip}"
		exit 0
		;;

	set)
		# MagicDNS→cloudflared-1033 house fix (D-11): `tailscale set --accept-dns=false`
		# — NOT `tailscale up` (up resets every unspecified flag). Then bounce
		# cloudflared so it re-reads a clean /etc/resolv.conf (guarded — cloudflared
		# may not be a unit on every box).
		tailscale set --accept-dns=false
		systemctl restart cloudflared 2>/dev/null || true
		echo "dns-fixed"
		exit 0
		;;

	down)
		# Toggle-off = `tailscale down` (keeps the node REGISTERED for fast re-enable —
		# NOT `logout`). Then read-merge REMOVE the LIVOS_TAILSCALE_BIND line and restart
		# the unit so the additive overlay listener drops (loopback is unaffected).
		tailscale down 2>/dev/null || true
		_env_merge LIVOS_TAILSCALE_BIND ""
		systemctl restart livos.service 2>/dev/null || true
		echo "down"
		exit 0
		;;

	status)
		# The route parses BackendState / Self.TailscaleIPs from the JSON; the trailing
		# `tailscale ip -4` line surfaces the overlay IPv4 directly. UNAVAILABLE = the
		# tailscale binary/daemon is not present yet.
		if command -v tailscale >/dev/null 2>&1; then
			tailscale status --json 2>/dev/null || echo '{"BackendState":"NoState"}'
			tailscale ip -4 2>/dev/null || true
		else
			echo '{"BackendState":"NotInstalled"}'
		fi
		exit 0
		;;

	*)
		echo "[livos-tailscale] invalid action: '${ACTION}' — expected one of: install login login-start login-finish set down status" >&2
		exit 2
		;;
esac
