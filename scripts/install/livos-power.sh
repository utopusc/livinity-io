#!/usr/bin/env bash
# scripts/install/livos-power.sh
# Phase 329 (HW-02) — root-owned power-management wrapper.
#
# Deployed to /usr/local/lib/livos/livos-power.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-power) + update.sh (Step 7.10k). Invoked by
# livinityd's system routes (329-06) via the scoped sudoers grant
# (sudoers.d/livos-power):
#   sudo -n /usr/local/lib/livos/livos-power.sh <action> [args...]
#
# WHY A WRAPPER (clone of the Phase 326 livos-ups.sh + Phase 329 livos-net-expose.sh
# HW/NET template): the privileged surface here is `apt-get install`, writing
# /etc/hdparm.conf + a udev rule, running hdparm/ethtool/rtcwake, and enabling
# systemd units — all root-only. livinityd runs as the unprivileged desktop user. A
# raw NOPASSWD grant on hdparm / ethtool / rtcwake / systemctl would let any process
# that can call `sudo` inject arbitrary flags, device paths, or unit bodies. Instead
# the sudoers grant is on THIS ONE binary path (no glob, no argument wildcard) and the
# wrapper accepts ONLY a fixed 9-action enum. It regex-validates every device / iface /
# time token BEFORE that value reaches a privileged command, and it builds every argv +
# every /etc file body ITSELF — so no caller-supplied string can ever reach a privileged
# command or a config file unvalidated. To change a permitted operation, EDIT THIS
# WRAPPER — do NOT broaden the grant.
#
# Actions (the enum is the ONLY control input; anything else -> exit 2, nothing runs):
#   install                          apt-get install hdparm ethtool (NO WoL magic-packet
#                                    sender package — the box is the WoL TARGET, not a
#                                    sender; sending is out of scope, D-16)
#   status                           report spindown stanzas / schedule state / WoL units
#   spindown-set   <dev> <timeout>   opt-in per-drive HDD spin-down (hdparm.conf + udev),
#                                    NVMe excluded, boot/root disk refused (D-17)
#   spindown-clear <dev>             remove that drive's stanza + udev rule
#   schedule-set   <HH:MM> <HH:MM|secs>  systemd-timer shutdown + rtcwake-armed RTC wake (D-18);
#                                    the wake is resolved to the first occurrence AFTER the
#                                    scheduled shutdown, and the shutdown unit RE-ARMS the next
#                                    wake before every power-off so the recurring daily timer
#                                    never outlives its wake alarm (WR-01/WR-02)
#   schedule-clear                   disarm the shutdown timer + clear the RTC alarm
#   arm-wake       <HH:MM|secs>      INTERNAL: re-arm the next RTC wake (invoked by the shutdown
#                                    unit's ExecStartPre as root, NOT via sudo) so each cycle of
#                                    the recurring shutdown timer is paired with a fresh alarm
#   test-wake                        arm a ~180s rtcwake alarm and report — the recommended
#                                    pre-flight before real arming (D-18)
#   wol-enable     <iface>           ethtool -s <iface> wol g + dedicated systemd oneshot unit (D-19)
#   wol-disable    <iface>           ethtool -s <iface> wol d + disable/remove the unit
#
# HIGHEST LOCKOUT RISK OF THE PHASE (D-18/D-24): a scheduled shutdown whose RTC wake
# fails to fire leaves the box off with NO software revert — physical access is then
# required. Arming is DEFAULT OFF; only `schedule-set` arms; the wrapper NEVER self-enables
# a wake. The live arm/wake cycle is STRICTLY HUMAN-UAT and is never exercised autonomously.
#
# Exit codes: 2 = bad usage / unknown action / invalid argument. Otherwise the underlying
# command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-power] must run as root" >&2; exit 2; }

ACTION="${1:-}"

# ── State locations (all wrapper-owned) ──────────────────────────────────────
HDPARM_CONF="/etc/hdparm.conf"
UDEV_RULES="/etc/udev/rules.d/99-livos-power-spindown.rules"
SHUTDOWN_TIMER="/etc/systemd/system/livos-power-shutdown.timer"
SHUTDOWN_SVC="/etc/systemd/system/livos-power-shutdown.service"
WOL_UNIT="/etc/systemd/system/livos-power-wol@.service"
RTC_WAKEALARM="/sys/class/rtc/rtc0/wakealarm"
# Deployed wrapper path (deploy-livinityd.sh / update.sh install THIS file here, root:root
# 0755). The scheduled-shutdown unit's ExecStartPre calls back into it to re-arm the next
# wake each cycle; hardcoded (not $0) so the unit is invariant to how schedule-set was invoked.
SELF="/usr/local/lib/livos/livos-power.sh"

# ── Validators (run BEFORE any value reaches a privileged command) ───────────

# Bare kernel block-device name for a SATA/SAS HDD: sd + 1-2 lowercase letters.
# Accepts an optional /dev/ prefix and strips it. REJECTS NVMe (/dev/nvme*, which
# has no reliable spin-down control — APST controller instability, D-17) with a
# distinct "not applicable" message so the UI can grey NVMe drives out.
_normalize_dev() {
	local d="${1:-}"
	d="${d#/dev/}"
	if [[ "$d" =~ ^nvme[0-9]+n[0-9]+ ]]; then
		echo "[livos-power] NVMe spin-down is not applicable (no reliable APST control in v1): ${1}" >&2
		return 3
	fi
	[[ "$d" =~ ^sd[a-z]{1,2}$ ]] || {
		echo "[livos-power] invalid block device (expected sd[a-z], e.g. sda): '${1}'" >&2
		return 2
	}
	printf '%s' "$d"
}

# hdparm -S value: integer 0-255 (0 disables; 1-240 => 5s units; 241-251 => 30min
# units; 252-255 special). We only enforce the numeric range; hdparm interprets it.
_valid_timeout() {
	[[ "${1:-}" =~ ^[0-9]+$ ]] && (( 10#$1 >= 0 && 10#$1 <= 255 ))
}

# HH:MM 24h clock (donor: routes.ts osPatchSetOptions rebootTime regex :986-999).
_valid_hhmm() { [[ "${1:-}" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; }

# A positive integer number of seconds (alternative wake argument form).
_valid_secs() { [[ "${1:-}" =~ ^[0-9]+$ ]] && (( 10#$1 >= 1 && 10#$1 <= 604800 )); }

# Network interface name (same shape as livos-network.sh _valid_iface).
_valid_iface() { [[ "${1:-}" =~ ^[A-Za-z0-9._-]{1,15}$ ]]; }

# Resolve the parent kernel disk name backing a mountpoint (e.g. / -> sda), so the
# spin-down path can REFUSE the boot/root disk as defense-in-depth over livinityd's
# listDrives() candidate filtering (D-17). Empty on any failure (fail-safe: an
# unresolved root simply means we cannot prove a match, handled by the caller).
_disk_for_mount() {
	local mp="${1:-}" src pk
	src=$(findmnt -no SOURCE "$mp" 2>/dev/null | head -n1) || return 0
	[[ -n "$src" ]] || return 0
	pk=$(lsblk -no PKNAME "$src" 2>/dev/null | head -n1)
	if [[ -z "$pk" ]]; then
		# Fallback: strip a trailing partition number from a /dev/sdXN source.
		pk=$(basename "$src" 2>/dev/null)
		pk="${pk%%[0-9]*}"
	fi
	printf '%s' "$pk"
}

# Refuse a device that backs / or /boot. Returns non-zero (2) if <dev> is the boot
# or root disk. Wrapper-side belt-and-braces; the route also filters candidates.
_refuse_system_disk() {
	local dev="$1" root_disk boot_disk
	root_disk=$(_disk_for_mount /)
	boot_disk=$(_disk_for_mount /boot)
	if [[ -n "$root_disk" && "$dev" == "$root_disk" ]]; then
		echo "[livos-power] refusing to spin down the ROOT disk (/dev/${dev})" >&2
		return 2
	fi
	if [[ -n "$boot_disk" && "$dev" == "$boot_disk" ]]; then
		echo "[livos-power] refusing to spin down the BOOT disk (/dev/${dev})" >&2
		return 2
	fi
	return 0
}

# Print the epoch of the FIRST occurrence of wake time $2 (HH:MM) STRICTLY AFTER the
# reference epoch $1, rolling forward whole wall-clock days (DST-correct for the wall-clock
# wake time). Used so the wake alarm is always queued for a moment AFTER a given instant —
# the scheduled shutdown epoch (schedule-set) or the current power-off instant (arm-wake) —
# instead of a naive next-from-now that can fire while the box is still on and leave the
# following power-off with no pending alarm (WR-01). Empty output + non-zero on parse failure.
_next_wake_epoch() {
	local ref="${1:-}" hhmm="${2:-}" day t
	day=$(date -d "@${ref}" +%F 2>/dev/null) || return 1
	t=$(date -d "${day} ${hhmm}" +%s 2>/dev/null) || return 1
	while (( t <= ref )); do
		day=$(date -d "${day} +1 day" +%F 2>/dev/null) || return 1
		t=$(date -d "${day} ${hhmm}" +%s 2>/dev/null) || return 1
	done
	printf '%s' "$t"
}

# ── Actions ──────────────────────────────────────────────────────────────────
case "$ACTION" in
	install)
		# hdparm (HDD spin-down control) + ethtool (WoL target enablement). The wrapper
		# builds the exact apt argv itself — no caller string enters any command line.
		# NO WoL magic-packet sender package is pulled: the box is the WoL TARGET, not a
		# sender (sending is out of scope, D-16).
		export DEBIAN_FRONTEND=noninteractive
		apt-get update -qq
		apt-get install -y -qq hdparm ethtool
		echo "installed"
		exit 0
		;;

	spindown-set)
		# spindown-set <dev> <timeout>: opt-in per-drive HDD spin-down. Validate the
		# device (bare sd[a-z]; NVMe -> not-applicable exit 3; anything else -> exit 2),
		# refuse the boot/root disk, then validate the hdparm -S timeout. Persist via BOTH
		# an /etc/hdparm.conf stanza AND a udev rule (add|change re-apply) because
		# hdparm.conf alone is unreliable on modern Ubuntu (D-17).
		DEV_RAW="${2:-}"; TIMEOUT="${3:-}"
		DEV=$(_normalize_dev "$DEV_RAW") || exit $?
		_refuse_system_disk "$DEV" || exit 2
		_valid_timeout "$TIMEOUT" || {
			echo "[livos-power] invalid hdparm -S timeout (expected 0-255): '${TIMEOUT}'" >&2; exit 2; }

		# Apply now (wrapper builds every argv token from validated values).
		hdparm -S "$TIMEOUT" "/dev/${DEV}" || true

		# Persist layer 1: /etc/hdparm.conf per-device stanza, wrapped in sentinels so
		# spindown-clear can excise exactly this drive's block. Rewrite atomically.
		touch "$HDPARM_CONF"
		local_tmp=$(mktemp)
		# Drop any prior block for this dev, then append the fresh one.
		sed "/^# livos-power:${DEV} BEGIN$/,/^# livos-power:${DEV} END$/d" "$HDPARM_CONF" > "$local_tmp" 2>/dev/null || cp -f "$HDPARM_CONF" "$local_tmp"
		{
			echo "# livos-power:${DEV} BEGIN"
			echo "/dev/${DEV} {"
			echo "	spindown_time = ${TIMEOUT}"
			echo "}"
			echo "# livos-power:${DEV} END"
		} >> "$local_tmp"
		install -m 0644 -o root -g root "$local_tmp" "$HDPARM_CONF"
		rm -f "$local_tmp"

		# Persist layer 2: a udev rule that re-applies the timeout on add|change events
		# (hotplug / power-state transitions). One line per drive, sentinel-commented.
		touch "$UDEV_RULES"
		local_tmp=$(mktemp)
		grep -v "^# livos-power:${DEV}$" "$UDEV_RULES" 2>/dev/null | grep -v "KERNEL==\"${DEV}\".*livos-power-spindown" > "$local_tmp" || true
		{
			echo "# livos-power:${DEV}"
			echo "ACTION==\"add|change\", KERNEL==\"${DEV}\", RUN+=\"/sbin/hdparm -S ${TIMEOUT} /dev/%k\" # livos-power-spindown"
		} >> "$local_tmp"
		install -m 0644 -o root -g root "$local_tmp" "$UDEV_RULES"
		rm -f "$local_tmp"

		udevadm control --reload-rules || true
		udevadm trigger --subsystem-match=block || true
		echo "spindown-set ${DEV} ${TIMEOUT}"
		exit 0
		;;

	spindown-clear)
		# spindown-clear <dev>: remove this drive's hdparm.conf stanza + udev rule.
		DEV_RAW="${2:-}"
		DEV=$(_normalize_dev "$DEV_RAW") || exit $?
		if [[ -f "$HDPARM_CONF" ]]; then
			local_tmp=$(mktemp)
			sed "/^# livos-power:${DEV} BEGIN$/,/^# livos-power:${DEV} END$/d" "$HDPARM_CONF" > "$local_tmp" || cp -f "$HDPARM_CONF" "$local_tmp"
			install -m 0644 -o root -g root "$local_tmp" "$HDPARM_CONF"
			rm -f "$local_tmp"
		fi
		if [[ -f "$UDEV_RULES" ]]; then
			local_tmp=$(mktemp)
			grep -v "^# livos-power:${DEV}$" "$UDEV_RULES" 2>/dev/null | grep -v "KERNEL==\"${DEV}\".*livos-power-spindown" > "$local_tmp" || true
			install -m 0644 -o root -g root "$local_tmp" "$UDEV_RULES"
			rm -f "$local_tmp"
		fi
		udevadm control --reload-rules || true
		echo "spindown-clear ${DEV}"
		exit 0
		;;

	schedule-set)
		# schedule-set <HH:MM-shutdown> <HH:MM-or-secs-wake>: create a systemd-timer that
		# powers the box off at the shutdown time AND arm an rtcwake RTC alarm to power it
		# back on at the wake time. DEFAULT posture is OFF — ONLY this action arms; the
		# wrapper never self-enables a wake. HIGHEST lockout risk of the phase (D-18): a
		# wake that fails to fire needs physical access. The route gates this behind the
		# explicit UI ack and recommends `test-wake` first.
		SHUT="${2:-}"; WAKE="${3:-}"
		_valid_hhmm "$SHUT" || { echo "[livos-power] invalid shutdown time (expected HH:MM): '${SHUT}'" >&2; exit 2; }

		# Wake argument may be HH:MM (compute seconds to the next occurrence) or a raw
		# seconds count. Resolve to an absolute alarm delta in seconds.
		if _valid_hhmm "$WAKE"; then
			now_epoch=$(date +%s)
			# Resolve the SHUTDOWN epoch first: the next future occurrence of the shutdown
			# HH:MM, matching the systemd OnCalendar=*-*-* ${SHUT}:00 that fires the power-off.
			shut_epoch=$(date -d "today ${SHUT}" +%s 2>/dev/null) || {
				echo "[livos-power] could not resolve the shutdown epoch: '${SHUT}'" >&2; exit 2; }
			if (( shut_epoch <= now_epoch )); then
				shut_epoch=$(date -d "tomorrow ${SHUT}" +%s 2>/dev/null)
			fi
			# Resolve the WAKE relative to the SHUTDOWN, not to `now`: the first wake occurrence
			# STRICTLY AFTER the shutdown fires. A naive next-from-now wake can elapse while the
			# box is still on (e.g. arm 06:00, shutdown 23:00, wake 07:00 → 07:00 fires today
			# harmlessly, then the 23:00 power-off leaves NO pending alarm → box strands off).
			# Rolling the wake past the shutdown guarantees an alarm is queued for AFTER the
			# power-off (WR-01).
			target_epoch=$(_next_wake_epoch "$shut_epoch" "$WAKE") || {
				echo "[livos-power] could not resolve a wake time after the scheduled shutdown: '${WAKE}'" >&2; exit 2; }
			WAKE_SECS=$(( target_epoch - now_epoch ))
		elif _valid_secs "$WAKE"; then
			WAKE_SECS="$WAKE"
		else
			echo "[livos-power] invalid wake argument (expected HH:MM or 1-604800 seconds): '${WAKE}'" >&2
			exit 2
		fi

		# Shutdown side: a wrapper-owned systemd oneshot service + timer (OnCalendar).
		# ExecStartPre RE-ARMS the next RTC wake immediately before every power-off, so each
		# cycle of the recurring daily timer is paired with a fresh alarm instead of relying on
		# the single alarm armed at schedule-set time (which would only wake the FIRST cycle,
		# then strand the box off on night 2+) — WR-02. arm-wake is passed the ORIGINAL wake
		# argument (HH:MM → next occurrence after the power-off instant; secs → same delta),
		# and it runs as root directly (the unit runs as root; NOT via sudo). ExecStartPre is
		# NOT prefixed with `-`, so if the wake cannot be armed the unit ABORTS and the box does
		# NOT power off — the fail-safe posture against stranding. WAKE is regex-validated HH:MM
		# or a bounded seconds count and SELF is a fixed constant, so the unit body is injection-free.
		cat > "$SHUTDOWN_SVC" <<PWRSVC
[Unit]
Description=LivOS scheduled power-off (HW-02)

[Service]
Type=oneshot
ExecStartPre=${SELF} arm-wake ${WAKE}
ExecStart=/sbin/shutdown -h now
PWRSVC
		cat > "$SHUTDOWN_TIMER" <<PWRTIMER
[Unit]
Description=LivOS scheduled power-off timer (HW-02)

[Timer]
OnCalendar=*-*-* ${SHUT}:00
Persistent=false

[Install]
WantedBy=timers.target
PWRTIMER
		systemctl daemon-reload || true
		systemctl enable --now livos-power-shutdown.timer || true

		# Wake side: arm the RTC alarm for the FIRST cycle now. `-m no` sets the hardware
		# alarm WITHOUT suspending, so the alarm persists across the scheduled power-off and
		# fires it back on. The RTC alarm is absolute in hardware, so arming it now for a
		# future delta is correct even though the box will be off in between. Cycle 2+ are
		# re-armed by the shutdown unit's ExecStartPre (arm-wake) right before each power-off.
		rtcwake -m no -s "$WAKE_SECS" || {
			echo "[livos-power] rtcwake failed to arm the RTC alarm — schedule NOT trusted (run test-wake)" >&2
			exit 1
		}
		echo "schedule-set shutdown=${SHUT} wake_in=${WAKE_SECS}s"
		exit 0
		;;

	schedule-clear)
		# Disarm: stop+disable the shutdown timer, remove the units, and clear the RTC
		# alarm register. Fully fail-tolerant.
		systemctl disable --now livos-power-shutdown.timer 2>/dev/null || true
		rm -f "$SHUTDOWN_TIMER" "$SHUTDOWN_SVC"
		systemctl daemon-reload || true
		# Clearing the wakealarm: write 0 to the RTC alarm sysfs node (rtcwake has no
		# dedicated disarm mode).
		[[ -w "$RTC_WAKEALARM" ]] && echo 0 > "$RTC_WAKEALARM" 2>/dev/null || true
		echo "schedule-clear"
		exit 0
		;;

	arm-wake)
		# INTERNAL re-arm entrypoint invoked by the scheduled-shutdown unit's ExecStartPre
		# (runs as root, directly — NOT via sudo) so each cycle of the recurring daily shutdown
		# timer is paired with a fresh RTC alarm (WR-02). The wake arg is HH:MM (next occurrence
		# STRICTLY after now — i.e. after the power-off instant this runs at) or a raw seconds
		# delta. Fails HARD on any rtcwake error so the calling ExecStartPre aborts the power-off
		# rather than stranding the box off with no pending alarm.
		WAKE="${2:-}"
		if _valid_hhmm "$WAKE"; then
			now_epoch=$(date +%s)
			target_epoch=$(_next_wake_epoch "$now_epoch" "$WAKE") || {
				echo "[livos-power] arm-wake: could not resolve wake time: '${WAKE}'" >&2; exit 2; }
			WAKE_SECS=$(( target_epoch - now_epoch ))
		elif _valid_secs "$WAKE"; then
			WAKE_SECS="$WAKE"
		else
			echo "[livos-power] arm-wake: invalid wake argument (expected HH:MM or 1-604800 seconds): '${WAKE}'" >&2
			exit 2
		fi
		rtcwake -m no -s "$WAKE_SECS" || {
			echo "[livos-power] arm-wake: rtcwake failed to arm the RTC alarm" >&2
			exit 1
		}
		echo "arm-wake wake_in=${WAKE_SECS}s"
		exit 0
		;;

	test-wake)
		# Pre-flight self-check: arm a ~180s RTC alarm with `-m no` (sets the alarm
		# WITHOUT suspending / powering the box off — a real fire test that suspends the
		# machine is operator-run HUMAN-UAT). Report whether the RTC accepted the alarm by
		# reading the wakealarm register back. This is the recommended pre-flight before a
		# real schedule-set arm (D-18).
		if ! rtcwake -m no -s 180 >/dev/null 2>&1; then
			echo "test-wake: FAILED — rtcwake could not arm the RTC alarm (wake likely unsupported)"
			exit 1
		fi
		alarm_val=""
		[[ -r "$RTC_WAKEALARM" ]] && alarm_val=$(cat "$RTC_WAKEALARM" 2>/dev/null || true)
		if [[ -n "$alarm_val" && "$alarm_val" != "0" ]]; then
			echo "test-wake: armed (RTC wakealarm=${alarm_val}) — a ~180s alarm is set; run a live suspend/resume UAT to confirm it fires"
		else
			echo "test-wake: rtcwake returned OK but the RTC wakealarm register is empty — verify hardware RTC alarm support"
		fi
		exit 0
		;;

	wol-enable)
		# wol-enable <iface>: enable Wake-on-LAN (magic packet, `wol g`) on <iface> now,
		# and persist it via a DEDICATED systemd oneshot unit (instanced per-iface,
		# docker-firewall.service shape) that re-applies on every boot. This is the box's
		# OWN unit — it never touches the NET-01-owned network-config file (which carries
		# its own watchdog machinery), so the two subsystems cannot corrupt each other (D-19).
		IFACE="${2:-}"
		_valid_iface "$IFACE" || { echo "[livos-power] invalid interface name: '${IFACE}'" >&2; exit 2; }

		# Apply now.
		ethtool -s "$IFACE" wol g || {
			echo "[livos-power] ethtool could not set wol g on ${IFACE} (NIC may not support WoL)" >&2
			exit 1
		}

		# Persist via a dedicated instanced oneshot unit (%i = the validated iface).
		cat > "$WOL_UNIT" <<'WOLSVC'
[Unit]
Description=LivOS Wake-on-LAN enable for %i (HW-02)
After=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
ExecStart=/sbin/ethtool -s %i wol g
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
WOLSVC
		systemctl daemon-reload || true
		systemctl enable "livos-power-wol@${IFACE}.service" || true
		echo "wol-enable ${IFACE}"
		exit 0
		;;

	wol-disable)
		# wol-disable <iface>: turn WoL off now (`wol d`) + disable/remove the oneshot unit.
		IFACE="${2:-}"
		_valid_iface "$IFACE" || { echo "[livos-power] invalid interface name: '${IFACE}'" >&2; exit 2; }
		ethtool -s "$IFACE" wol d 2>/dev/null || true
		systemctl disable --now "livos-power-wol@${IFACE}.service" 2>/dev/null || true
		systemctl daemon-reload || true
		echo "wol-disable ${IFACE}"
		exit 0
		;;

	status)
		# Read-only. `set -e` is on, so every probe is guarded with `|| true`.
		echo "== livos-power status =="
		echo "-- spin-down (hdparm.conf stanzas) --"
		grep -E '^# livos-power:.* BEGIN$' "$HDPARM_CONF" 2>/dev/null | sed 's/^# livos-power:/  drive /; s/ BEGIN$//' || true
		[[ -f "$UDEV_RULES" ]] && echo "  udev rules: present ($UDEV_RULES)" || echo "  udev rules: none"
		echo "-- scheduled power-off / wake --"
		if systemctl is-enabled livos-power-shutdown.timer >/dev/null 2>&1; then
			systemctl show livos-power-shutdown.timer -p TimersCalendar --value 2>/dev/null | sed 's/^/  shutdown timer: /' || true
		else
			echo "  shutdown timer: disarmed (default OFF)"
		fi
		if [[ -r "$RTC_WAKEALARM" ]]; then
			_wa=$(cat "$RTC_WAKEALARM" 2>/dev/null || true)
			[[ -n "$_wa" && "$_wa" != "0" ]] && echo "  rtc wakealarm: ${_wa}" || echo "  rtc wakealarm: cleared"
		fi
		echo "-- Wake-on-LAN units --"
		systemctl list-units --type=service 'livos-power-wol@*.service' --no-legend 2>/dev/null | awk '{print "  "$1" "$4}' || true
		exit 0
		;;

	*)
		echo "[livos-power] invalid action: '${ACTION}' — expected one of: install status spindown-set spindown-clear schedule-set schedule-clear arm-wake test-wake wol-enable wol-disable" >&2
		exit 2
		;;
esac
