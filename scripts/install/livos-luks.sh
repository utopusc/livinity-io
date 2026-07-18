#!/usr/bin/env bash
# scripts/install/livos-luks.sh
# Phase 339 (STORD-02, D-339-2) — root-owned whole-disk LUKS2 encryption wrapper.
#
# Deployed to /usr/local/lib/livos/livos-luks.sh (mode 0755, root-owned) by
# update.sh (Step 7.10y). Invoked by livinityd's system routes (339-02 runLuks)
# via the scoped sudoers grant (sudoers.d/livos-luks):
#   sudo -n /usr/local/lib/livos/livos-luks.sh <action> <dev>
#
# WHY A WRAPPER (blend of the Phase 318 livos-pool.sh device gates + the Phase 325
# livos-crypto.sh stdin-secret discipline + the Phase 338 livos-recycle-bin.sh
# post-mkdir realpath re-verify): the privileged surface here is the HIGHEST-STAKES
# kind — `cryptsetup luksFormat` IRREVERSIBLY DESTROYS a whole disk. livinityd runs
# as the unprivileged desktop user. A raw NOPASSWD grant on cryptsetup/mkfs/mount
# would let any process that can call `sudo` format an arbitrary disk or mount over
# an arbitrary path. Instead the sudoers grant is on THIS ONE binary path (no glob,
# no argument wildcard) and the wrapper accepts ONLY a fixed action enum
# {format|open|close|status}. It builds every cryptsetup/mkfs/mount argv ITSELF, and
# EVERY state-changing action re-validates its target device INSIDE the script
# against THREE independent gates (device-shape regex + OS/boot/EFI refusal +
# USB/removable refusal) BEFORE any privileged command runs — belt-and-braces on top
# of the TS-side root-disk.ts / assertNotOsDisk filtering (the wrapper never relies
# on it). To change a permitted operation, EDIT THIS WRAPPER — do NOT broaden the
# grant.
#
# SECRET DISCIPLINE (clone of livos-crypto.sh + runCrypto): the operator passphrase
# (keyslot 0) and the daemon-generated recovery key (keyslot 1) arrive on STDIN
# (fd 0), NEVER as argv (would be `ps`-visible via /proc/<pid>/cmdline). `format`
# reads TWO newline-separated lines; `open` reads ONE (passphrase OR recovery key —
# either unlocks). After the wrapper's own `read -r` calls have drained stdin into
# private env vars, stdin is at EOF — so cryptsetup is fed NOT via the stdin
# sentinel key-file (a lone dash, which would then read an EMPTY key) but via
# process-substitution fds `--key-file=<(printf '%s' "$_VAR")`, which put only a
# `/dev/fd/N` path in argv, never the secret, and never a real tmpfile. The stdin
# sentinel key-file form appears NOWHERE in this script.
#
# WRAPPER-OWNED DERIVED NAMES (no caller free-text in any path/argv): the dm-crypt
# mapper name is livos-luks-<dev> and the mountpoint is /mnt/encrypted/<dev> — both
# shaped ONLY by the validated <dev>, an injection-free construction. After mkdir the
# mountpoint is realpath-re-verified (338 lesson): an ancestor swapped to a symlink
# between validation and mount would redirect the root mount — refused here.
#
# NO crypttab, NO keyfile on disk, NOTHING auto-mounts at boot (lockout-safe default,
# D-339-2): after a reboot the disk is LOCKED until the operator re-enters the
# passphrase via `open`. TRIM/allow-discards is OFF (not passed).
#
# Args (the enum is the ONLY control input; anything else -> exit 2, nothing
# privileged runs; secrets arrive on stdin, NOT argv):
#   $1  action — format | open | close | status
#   $2  dev    — bare kernel whole-disk name (sd* / nvme* / mmcblk*), optional /dev/ prefix
#
# Exit codes: 2 = bad usage / unknown action / invalid device / OS-disk or
#             USB/removable refusal / empty secret / WSL2 refusal / symlinked
#             mountpoint. 1 = operation failed (e.g. close while busy). Otherwise the
#             underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-luks] must run as root" >&2; exit 2; }

# ── Wrapper-owned constants (no caller string ever reaches these) ─────────────
readonly MAPPER_PREFIX="livos-luks-"
readonly MOUNT_BASE="/mnt/encrypted"

# ── Validators & device-safety gates (run BEFORE any value reaches a privileged command) ──

# gate 1 — bare kernel whole-disk name (DEVICE_ID_RE shape). Accepts an optional
# /dev/ prefix and strips it; prints the normalized name; returns 2 on a bad shape.
# Clone of livos-pool.sh:104-112.
_valid_dev() {
	local d="${1:-}"
	d="${d#/dev/}"
	[[ "$d" =~ ^(sd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$ ]] || {
		echo "[livos-luks] invalid block device (expected sd*/nvme*/mmcblk*): '${1:-}'" >&2
		return 2
	}
	printf '%s' "$d"
}

# Resolve the WHOLE PHYSICAL disk name(s) backing a mountpoint (CR-01). Prints one
# disk name per line (mdadm backs / from MULTIPLE disks — ALL emitted so ALL get
# refused). findmnt SOURCE -> lsblk -rsno NAME,TYPE (every TYPE=disk row); `lsblk -s`
# walks the INVERSE dependency tree down through any LVM/LUKS/mdadm layer to the
# physical disk — NOT the intermediate backing PARTITION (the PKNAME CR-01 hole).
# Clone of livos-pool.sh:131-156.
_disk_for_mount() {
	local mp="${1:-}" src base pk
	src=$(findmnt -no SOURCE "$mp" 2>/dev/null | head -n1) || return 0
	[[ -n "$src" ]] || return 0
	local disks
	disks=$(lsblk -rsno NAME,TYPE "$src" 2>/dev/null | awk '$NF=="disk"{print $1}' || true)
	if [[ -n "$disks" ]]; then
		printf '%s\n' "$disks"
		return 0
	fi
	base=$(basename "$src" 2>/dev/null)
	case "$base" in
		nvme[0-9]*n[0-9]*p[0-9]*) pk="${base%p[0-9]*}" ;;
		mmcblk[0-9]*p[0-9]*)      pk="${base%p[0-9]*}" ;;
		sd[a-z]*[0-9]*)           pk="${base%%[0-9]*}" ;;
		*)                        pk="" ;;
	esac
	[[ -n "$pk" ]] && printf '%s\n' "$pk"
	return 0
}

# True (return 0) if whole-disk name $1 appears in the newline-separated list $2.
# Clone of livos-pool.sh:161-167 (a mount can be backed by SEVERAL disks — mdadm).
_dev_in_list() {
	local needle="$1" line
	while IFS= read -r line; do
		[[ -n "$line" && "$line" == "$needle" ]] && return 0
	done <<< "$2"
	return 1
}

# gate 2 — refuse a device that backs / OR /boot OR /boot/efi. Returns 2 on a match.
# Clone of livos-pool.sh:174-192. Wrapper-side belt-and-braces; the TS route ALSO
# filters (root-disk.ts / assertNotOsDisk), but this never trusts that.
_refuse_system_disk() {
	local dev="$1" root_disks boot_disks efi_disks
	root_disks=$(_disk_for_mount /)
	boot_disks=$(_disk_for_mount /boot)
	efi_disks=$(_disk_for_mount /boot/efi)
	if _dev_in_list "$dev" "$root_disks"; then
		echo "[livos-luks] refusing the ROOT disk (/dev/${dev}) — it backs /" >&2
		return 2
	fi
	if _dev_in_list "$dev" "$boot_disks"; then
		echo "[livos-luks] refusing the BOOT disk (/dev/${dev}) — it backs /boot" >&2
		return 2
	fi
	if _dev_in_list "$dev" "$efi_disks"; then
		echo "[livos-luks] refusing the EFI system-partition disk (/dev/${dev}) — it backs /boot/efi" >&2
		return 2
	fi
	return 0
}

# gate 3 — refuse a USB-transport OR removable device. Returns 4 on a match.
# Clone of livos-pool.sh:198-211.
_refuse_non_internal() {
	local dev="$1" tran rm
	tran=$(lsblk -dno TRAN "/dev/${dev}" 2>/dev/null | head -n1 | tr -d '[:space:]')
	rm=$(lsblk -dno RM "/dev/${dev}" 2>/dev/null | head -n1 | tr -d '[:space:]')
	if [[ "$tran" == "usb" ]]; then
		echo "[livos-luks] refusing USB-transport device (/dev/${dev}) — internal drives only" >&2
		return 4
	fi
	if [[ "$rm" == "1" ]]; then
		echo "[livos-luks] refusing REMOVABLE device (/dev/${dev}) — internal drives only" >&2
		return 4
	fi
	return 0
}

# All THREE gates for ONE device, in order. Prints the normalized name; returns
# non-zero on ANY failure so an action does `dev=$(_guard "$raw") || exit 2` and
# refuses BEFORE any cryptsetup/mkfs/mount. Clone of livos-pool.sh:217-223.
_guard() {
	local d
	d=$(_valid_dev "$1") || return 2      # gate 1: device-shape regex
	_refuse_system_disk "$d" || return 2  # gate 2: OS / boot / EFI disk refusal
	_refuse_non_internal "$d" || return 4 # gate 3: USB / removable refusal
	printf '%s' "$d"
}

# Refuse destructive actions under WSL2 (no real internal disks; block-device
# topology is a Windows-owned illusion). Clone of livos-pool.sh:226-231.
_refuse_wsl2() {
	if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
		echo "[livos-luks] refusing destructive LUKS action under WSL2 (no real internal disks)" >&2
		exit 2
	fi
}

# Read the operator passphrase (keyslot 0) + the recovery key (keyslot 1) from
# stdin into PRIVATE env vars. `|| true` guards the EOF-without-newline case under
# `set -e`. Reject an empty passphrase/recovery before it can reach cryptsetup.
_read_two_secrets() {
	IFS= read -r _LUKS_PASS || true
	IFS= read -r _LUKS_RECOVERY || true
	[[ -n "${_LUKS_PASS:-}" ]] || { echo "[livos-luks] no passphrase on stdin" >&2; exit 2; }
	[[ -n "${_LUKS_RECOVERY:-}" ]] || { echo "[livos-luks] no recovery key on stdin" >&2; exit 2; }
}

# Read ONE unlock secret (passphrase OR recovery key — either unlocks) from stdin.
_read_one_secret() {
	IFS= read -r _LUKS_KEY || true
	[[ -n "${_LUKS_KEY:-}" ]] || { echo "[livos-luks] no key on stdin" >&2; exit 2; }
}

# Create /mnt/encrypted/<dev> and re-verify AFTER mkdir that it is still the exact
# intended path — never a symlink, never resolving elsewhere (the 338 lesson: an
# ancestor swapped to a symlink between validation and mount would redirect the
# root mount). Prints the verified mountpoint on stdout.
_prepare_mountpoint() {
	local dev="$1" mp real
	mp="${MOUNT_BASE}/${dev}"
	mkdir -p -- "$mp"
	[[ ! -L "$mp" ]] || { echo "[livos-luks] mountpoint is a symlink, refusing: '${mp}'" >&2; exit 2; }
	real="$(realpath -- "$mp")" \
		|| { echo "[livos-luks] cannot resolve mountpoint: '${mp}'" >&2; exit 2; }
	[[ "$real" == "$mp" ]] \
		|| { echo "[livos-luks] mountpoint resolves outside the intended path, refusing: '${real}'" >&2; exit 2; }
	printf '%s' "$mp"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
ACTION="${1:-}"
[[ $# -gt 0 ]] && shift || true

case "$ACTION" in
	format)
		# DESTRUCTIVE — irreversibly LUKS2-formats the whole disk. WSL2-refuse +
		# 3-gate _guard BEFORE any privileged command. Keyslot 0 = operator
		# passphrase (stdin line 1); keyslot 1 = daemon recovery key (stdin line 2).
		# EVERY cryptsetup key input uses a process-substitution fd (NEVER the
		# stdin-sentinel key-file — stdin is already drained by the read -r calls above).
		_refuse_wsl2
		_dev=$(_guard "${1:-}") || exit 2
		_read_two_secrets
		_mapper="${MAPPER_PREFIX}${_dev}"
		# keyslot 0 = passphrase.
		cryptsetup luksFormat --type luks2 --batch-mode \
			--key-file=<(printf '%s' "$_LUKS_PASS") "/dev/${_dev}"
		# keyslot 1 = recovery key (existing-key via the passphrase fd, new-key via
		# the recovery fd — a positional new-key-file, still never a secret in argv).
		cryptsetup luksAddKey \
			--key-file=<(printf '%s' "$_LUKS_PASS") "/dev/${_dev}" <(printf '%s' "$_LUKS_RECOVERY")
		# open the mapper with the passphrase, mkfs.ext4, then mount under the
		# re-verified /mnt/encrypted/<dev>.
		cryptsetup luksOpen \
			--key-file=<(printf '%s' "$_LUKS_PASS") "/dev/${_dev}" "$_mapper"
		mkfs.ext4 -F "/dev/mapper/${_mapper}"
		_mp=$(_prepare_mountpoint "$_dev")
		mount "/dev/mapper/${_mapper}" "$_mp"
		unset _LUKS_PASS _LUKS_RECOVERY
		echo "formatted ${_dev} ${_mp}"
		exit 0
		;;

	open)
		# Unlock an already-formatted LUKS disk with ONE secret (passphrase OR
		# recovery key — same keyslots). _guard re-validates the device; the key
		# reaches cryptsetup via a process-substitution fd, never argv or the stdin sentinel.
		_dev=$(_guard "${1:-}") || exit 2
		_read_one_secret
		_mapper="${MAPPER_PREFIX}${_dev}"
		cryptsetup luksOpen \
			--key-file=<(printf '%s' "$_LUKS_KEY") "/dev/${_dev}" "$_mapper"
		unset _LUKS_KEY
		_mp=$(_prepare_mountpoint "$_dev")
		mount "/dev/mapper/${_mapper}" "$_mp"
		echo "unlocked ${_dev} ${_mp}"
		exit 0
		;;

	close)
		# Lock: umount then luksClose. On EBUSY (open files / busy mapping) FAIL
		# LOUDLY (exit 1) — NEVER force (mirror livos-crypto.sh lock:149-163).
		_dev=$(_guard "${1:-}") || exit 2
		_mapper="${MAPPER_PREFIX}${_dev}"
		_mp="${MOUNT_BASE}/${_dev}"
		if mountpoint -q "$_mp"; then
			if ! umount "$_mp"; then
				echo "[livos-luks] umount failed for '${_mp}' (files still open?)" >&2
				exit 1
			fi
		fi
		if cryptsetup status "$_mapper" >/dev/null 2>&1; then
			if ! cryptsetup luksClose "$_mapper"; then
				echo "[livos-luks] luksClose failed for '${_mapper}' (mapping busy?)" >&2
				exit 1
			fi
		fi
		echo "locked ${_dev}"
		exit 0
		;;

	status)
		# READ-ONLY — report unlocked|locked from the mapper existence + mount state.
		# Shape-validate the device (mapper/mount names are wrapper-derived); no
		# OS-disk refusal needed for a non-destructive probe.
		_dev=$(_valid_dev "${1:-}") || exit 2
		_mapper="${MAPPER_PREFIX}${_dev}"
		_mp="${MOUNT_BASE}/${_dev}"
		if cryptsetup status "$_mapper" >/dev/null 2>&1 && mountpoint -q "$_mp"; then
			echo "unlocked"
		else
			echo "locked"
		fi
		exit 0
		;;

	*)
		echo "[livos-luks] invalid action: '${ACTION}' — expected one of: format open close status" >&2
		exit 2
		;;
esac
