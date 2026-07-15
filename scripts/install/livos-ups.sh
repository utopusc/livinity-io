#!/usr/bin/env bash
# scripts/install/livos-ups.sh
# Phase 326 (HW-01) — root-owned NUT (UPS) install/config wrapper.
#
# Deployed to /usr/local/lib/livos/livos-ups.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-ups) + update.sh (Step 7.10e). Invoked by
# livinityd's system routes (326-08) via the scoped sudoers grant
# (sudoers.d/livos-ups):
#   sudo -n /usr/local/lib/livos/livos-ups.sh <action>
#
# WHY A WRAPPER (clone of the Phase 313 livos-smartctl.sh + Phase 316
# livos-gpu-install.sh + Phase 326 livos-os-patch.sh HIGH-01 template): the
# privileged surface here is `apt-get install`, writing the /etc/nut config files,
# reloading udev, and enabling systemd services — all root-only. livinityd runs as
# the unprivileged desktop user. A raw NOPASSWD grant on apt-get / tee / systemctl
# would let any process that can call `sudo` inject arbitrary flags, package names,
# or config bodies. Instead the sudoers grant is on THIS ONE binary path (no glob,
# no argument wildcard) and the wrapper accepts ONLY a fixed action enum
# {detect|install|configure|status|remove}. It builds every apt/systemctl/nut argv
# and every /etc/nut file body ITSELF, so no caller-supplied string can ever reach a
# privileged command or an /etc/nut file.
# To change a permitted operation, EDIT THIS WRAPPER — do NOT broaden the grant.
#
# This wrapper OWNS all NUT install + config: livinityd never writes /etc/nut and
# never runs apt/systemctl directly. NUT is configured in `standalone` mode (the
# UPS is USB-attached to this one box): the 5 /etc/nut files are written root:nut
# 0640 (the upsmon password lives in two of them and must not be world-readable —
# T-326-10). upsmon's native FSD flow (POLLFREQ 5s + SHUTDOWNCMD) owns the
# power-loss shutdown decision; the scheduler ups-watch job only mirrors status to
# the notification bell (D-16).
#
# Args (the enum is the ONLY input; anything else -> exit 2, nothing privileged runs):
#   $1  action — detect | install | configure | status | remove
#
# Exit codes: 2 = bad usage / unknown action. Otherwise the underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-ups] must run as root" >&2; exit 2; }

ACTION="${1:-}"

case "$ACTION" in
	detect)
		# Read-only host probe. `set -e` is on, so every no-match/absent-tool path
		# is guarded with `|| true`. nut-scanner enumerates attached UPS units; the
		# lsusb VID hints surface a known UPS even before the `nut` package is present
		# (051d APC, 0764 CyberPower, 0463 Eaton/MGE, 09ae Tripp Lite, 0665 PowerWalker).
		echo "== livos-ups detect =="
		if command -v nut-scanner >/dev/null 2>&1; then
			nut-scanner -U 2>/dev/null || true
		else
			echo "nut-scanner: not installed"
		fi
		echo "-- lsusb known-UPS VID hints --"
		lsusb 2>/dev/null | grep -iE '051d|0764|0463|09ae|0665' || echo "(no known UPS VID on USB)"
		exit 0
		;;

	install)
		# The `nut` metapackage pulls in nut-server + nut-client. The wrapper builds
		# the exact apt argv itself — no caller string enters any command line.
		export DEBIAN_FRONTEND=noninteractive
		apt-get update -qq
		apt-get install -y -qq nut
		echo "installed"
		exit 0
		;;

	configure)
		# Generate a random per-box upsmon password. It is NEVER echoed and NEVER
		# logged (T-326-10). `cut -c1-24` (not `head -c 24`) drains the pipe so
		# pipefail can never SIGPIPE-abort the upstream tr on early pipe close.
		_UPS_PW="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-24)"

		# Write the 5 standalone-mode /etc/nut files. Bodies are fully wrapper-owned;
		# only the two password-bearing files use an unquoted heredoc (to interpolate
		# the generated password) — the rest are literal.
		cat > /etc/nut/nut.conf <<'EOF'
MODE=standalone
EOF

		cat > /etc/nut/ups.conf <<'EOF'
[ups]
  driver = usbhid-ups
  port = auto
EOF

		cat > /etc/nut/upsd.conf <<'EOF'
LISTEN 127.0.0.1 3493
EOF

		cat > /etc/nut/upsd.users <<EOF
[upsmon]
  password = ${_UPS_PW}
  upsmon primary
EOF

		cat > /etc/nut/upsmon.conf <<EOF
MONITOR ups@localhost 1 upsmon ${_UPS_PW} primary
MINSUPPLIES 1
POLLFREQ 5
POLLFREQALERT 5
SHUTDOWNCMD "/usr/local/lib/livos/livos-ups-shutdown.sh"
RUN_AS_USER nut
EOF

		# root:nut 0640 — the password lives in upsd.users + upsmon.conf, so these must
		# not be world-readable but must stay group-readable by the nut daemon. The nut
		# group is created by the `nut` package (installed first via `install`).
		for _f in nut.conf ups.conf upsd.conf upsd.users upsmon.conf; do
			chown root:nut "/etc/nut/${_f}"
			chmod 0640 "/etc/nut/${_f}"
		done

		# 24.04 gotcha: reload udev so the USB-HID UPS node permissions apply without a
		# replug, THEN enable + start the services. We deliberately do NOT invoke the
		# driver directly via `upsdrvctl` — nut-server + nut-driver-enumerator own the
		# driver lifecycle on 24.04 and a manual driver start conflicts with them.
		udevadm control --reload-rules || true
		udevadm trigger || true
		systemctl enable --now nut-server nut-monitor
		echo "configured"
		exit 0
		;;

	status)
		# The route parses ups.status / battery.charge / battery.runtime from this
		# key:value output. UNAVAILABLE = NUT not configured or no UPS attached.
		upsc ups@localhost 2>/dev/null || echo "ups.status: UNAVAILABLE"
		exit 0
		;;

	remove)
		# Disable + stop the NUT services. The /etc/nut files are left in place
		# (harmless with the services down); `configure` restores a working setup.
		systemctl disable --now nut-monitor nut-server 2>/dev/null || true
		echo "removed"
		exit 0
		;;

	*)
		echo "[livos-ups] invalid action: '${ACTION}' — expected one of: detect install configure status remove" >&2
		exit 2
		;;
esac
