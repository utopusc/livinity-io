#!/usr/bin/env bash
# scripts/install/livos-os-patch.sh
# Phase 326 (OS-01) — root-owned unattended-upgrades (security auto-patching) wrapper.
#
# Deployed to /usr/local/lib/livos/livos-os-patch.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-ospatch) + update.sh (Step 7.10d). Invoked by
# livinityd's system routes (326-07) via the scoped sudoers grant
# (sudoers.d/livos-os-patch):
#   sudo -n /usr/local/lib/livos/livos-os-patch.sh <action>
#
# WHY A WRAPPER (clone of the Phase 313 livos-smartctl.sh + Phase 316
# livos-gpu-install.sh HIGH-01 template): the privileged surface here is writing
# /etc/apt config files and running apt's unattended-upgrade — all root-only.
# livinityd runs as the unprivileged desktop user. A raw NOPASSWD grant on a text
# editor / tee / apt / unattended-upgrade would let any process that can call `sudo`
# inject arbitrary flags, package names, or config bodies into /etc/apt. Instead the
# sudoers grant is on THIS ONE binary path (no glob, no argument wildcard) and the
# wrapper accepts ONLY a fixed action enum
# {status|enable|disable|set-options|dry-run|run-now|report}. It builds every apt
# argv and every config file body ITSELF; for set-options it regex/enum-validates all
# FOUR positional values FIRST, so no caller-supplied flag or free-form string can ever
# reach a privileged command or an /etc/apt file.
# To change a permitted operation, EDIT THIS WRAPPER — do NOT broaden the grant.
#
# This wrapper owns ALL /etc/apt writes for OS-01: only 20auto-upgrades and the LivOS-
# owned drop-in 52unattended-upgrades-livos are ever written. The distro's shipped
# unattended-upgrades conffile and its list-type keys are NEVER touched (apt scalars are
# last-parsed-wins so the owned drop-in overrides them; apt lists append, so a drop-in
# could only extend — never replace — the shipped security-only default). livinityd
# itself never writes /etc/apt or runs apt directly.
#
# Args (the enum is the ONLY input; anything else -> exit 2, nothing privileged runs):
#   $1  action — status | enable | disable | set-options | dry-run | run-now | report
#   set-options additionally takes FOUR validated positional args:
#     $2  automatic-reboot   0|1
#     $3  reboot-time        HH:MM (24h)
#     $4  remove-unused-deps 0|1
#     $5  only-on-ac-power   0|1
#
# Exit codes: 2 = bad usage / failed validation. Otherwise the underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-os-patch] must run as root" >&2; exit 2; }

ACTION="${1:-}"

AUTO='/etc/apt/apt.conf.d/20auto-upgrades'
DROPIN='/etc/apt/apt.conf.d/52unattended-upgrades-livos'

# Build the LivOS-owned drop-in ENTIRELY from four already-validated values (0/1,
# HH:MM, 0/1, 0/1). No free-form caller string reaches this file — the caller only
# ever supplies validated booleans + a regex-checked HH:MM.
_write_dropin() {
	local _ar _rt _ru _ac
	_ar=$([[ "$1" == "1" ]] && echo "true" || echo "false")
	_rt="$2"
	_ru=$([[ "$3" == "1" ]] && echo "true" || echo "false")
	_ac=$([[ "$4" == "1" ]] && echo "true" || echo "false")
	cat > "$DROPIN" <<EOF
// Managed by LivOS (326 OS-01). apt scalars are last-parsed-wins so this owned
// drop-in overrides the distro's shipped unattended-upgrades conffile. NEVER edit
// that shipped conffile; NEVER set list-type keys here (apt lists append, so a
// drop-in can only extend them, never replace the shipped security-only default).
Unattended-Upgrade::Automatic-Reboot "${_ar}";
Unattended-Upgrade::Automatic-Reboot-Time "${_rt}";
Unattended-Upgrade::Remove-Unused-Dependencies "${_ru}";
Unattended-Upgrade::OnlyOnACPower "${_ac}";
EOF
}

case "$ACTION" in
	status)
		# Read-only host probes. `set -e` is on, so every no-match/absent path is
		# guarded with `|| true`.
		echo "reboot-required: $([[ -f /var/run/reboot-required ]] && echo yes || echo no)"
		echo "reboot-required-pkgs:"
		cat /var/run/reboot-required.pkgs 2>/dev/null || true
		echo "auto-upgrades:"
		grep -E 'APT::Periodic::(Update-Package-Lists|Unattended-Upgrade)' "$AUTO" 2>/dev/null || true
		echo "livos-dropin:"
		cat "$DROPIN" 2>/dev/null || true
		echo "periodic-stamps:"
		stat -c '%y %n' /var/lib/apt/periodic/* 2>/dev/null || true
		echo -n "apt-daily-upgrade-last: "
		systemctl show apt-daily-upgrade.timer -p LastTriggerUSec --value 2>/dev/null || true
		exit 0
		;;

	enable)
		# Turn on apt's periodic update + unattended-upgrade. Write 20auto-upgrades
		# verbatim (the wrapper owns the exact body), then keep an existing managed
		# drop-in as-is (idempotent) else seed LivOS defaults (reboot off, 02:00,
		# remove-unused on, AC-only on). set-options is how the operator changes these.
		cat > "$AUTO" <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
		[[ -f "$DROPIN" ]] || _write_dropin 0 "02:00" 1 1
		echo "enabled"
		exit 0
		;;

	disable)
		# Turn off apt's periodic update + unattended-upgrade. The owned drop-in is
		# left in place (harmless when the periodic keys are 0); re-enable restores it.
		cat > "$AUTO" <<'EOF'
APT::Periodic::Update-Package-Lists "0";
APT::Periodic::Unattended-Upgrade "0";
EOF
		echo "disabled"
		exit 0
		;;

	set-options)
		# Every value is enum/regex-validated BEFORE any /etc/apt write, then the
		# drop-in is built entirely from the validated values — no caller free-form
		# string reaches apt (the 313/316 arg-injection-closure discipline).
		AUTO_REBOOT="${2:-}"
		REBOOT_TIME="${3:-}"
		REMOVE_UNUSED="${4:-}"
		ON_AC="${5:-}"
		[[ "$AUTO_REBOOT"   =~ ^[01]$ ]]                        || { echo "[livos-os-patch] invalid option" >&2; exit 2; }
		[[ "$REBOOT_TIME"   =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || { echo "[livos-os-patch] invalid option" >&2; exit 2; }
		[[ "$REMOVE_UNUSED" =~ ^[01]$ ]]                        || { echo "[livos-os-patch] invalid option" >&2; exit 2; }
		[[ "$ON_AC"         =~ ^[01]$ ]]                        || { echo "[livos-os-patch] invalid option" >&2; exit 2; }
		_write_dropin "$AUTO_REBOOT" "$REBOOT_TIME" "$REMOVE_UNUSED" "$ON_AC"
		echo "options-set"
		exit 0
		;;

	dry-run)
		# Simulate the next unattended-upgrades pass. stdout passes through for the
		# route to parse ("Packages that will be upgraded" / "No packages"). Wrapped
		# in a timeout because a held apt lock can block for minutes (D-12); `|| true`
		# so a non-zero simulate exit does not trip `set -e`.
		timeout 120 unattended-upgrade --dry-run --debug 2>&1 || true
		exit 0
		;;

	run-now)
		# Run unattended-upgrades now. Exit code cannot distinguish no-updates from
		# updated-N, so the route parses OUTPUT. Wrapped in a longer timeout (apt lock
		# + real package downloads); `|| true` keeps a non-zero run from tripping set -e.
		timeout 900 unattended-upgrade -v 2>&1 || true
		exit 0
		;;

	report)
		tail -n 60 /var/log/unattended-upgrades/unattended-upgrades.log 2>/dev/null || echo "(no unattended-upgrades log yet)"
		exit 0
		;;

	*)
		echo "[livos-os-patch] invalid action: '${ACTION}' — expected one of: status enable disable set-options dry-run run-now report" >&2
		exit 2
		;;
esac
