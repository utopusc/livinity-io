#!/usr/bin/env bash
# scripts/install/livos-pool.sh
# Phase 318 (POOL-02 / POOL-04) — root-owned multi-drive storage-pooling wrapper.
#
# Deployed to /usr/local/lib/livos/livos-pool.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-storage-pool) + update.sh (Step 7.10n). Invoked by
# livinityd's storage-pool routes (318 Wave-2/3) via the scoped sudoers grant
# (sudoers.d/livos-pool):
#   sudo -n /usr/local/lib/livos/livos-pool.sh <action> [args...]
#
# WHY A WRAPPER (clone of the Phase 329 livos-power.sh multi-action + Phase 324
# livos-rclone.sh pinned-.deb + fuse.conf template): the privileged surface here is the
# HIGHEST-STAKES in the milestone — installing mergerfs/snapraid, and WIPING / FORMATTING
# / MOUNTING physical disks. A wrong device selection does not break a feature, it DESTROYS
# THE OS INSTALL. livinityd runs as the unprivileged desktop user. A raw NOPASSWD grant on
# mkfs / wipefs / parted / mount would let any process that can call `sudo` format an
# arbitrary disk. Instead the sudoers grant is on THIS ONE binary path (no glob, no argument
# wildcard) and the wrapper accepts ONLY a fixed action enum. It builds every apt/curl/mkfs/
# mount argv ITSELF, and EVERY destructive action re-validates its target device INSIDE the
# script against THREE independent gates before any privileged command runs:
#   gate 1  device-shape regex  (^(sd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$)
#   gate 2  OS-disk refusal      (_refuse_system_disk — / AND /boot AND /boot/efi backing disk)
#   gate 3  transport/removable  (_refuse_non_internal — lsblk TRAN=usb OR RM=1)
# so that even a BUGGY or COMPROMISED livinityd caller cannot format the OS disk or a
# USB/removable device (318-CONTEXT D-17, 318-PLAN-CHECK W-1 — belt-and-braces: the TS side
# ALSO filters, but the wrapper never relies on it). To change a permitted operation, EDIT
# THIS WRAPPER — do NOT broaden the grant.
#
# SUPPLY-CHAIN PIN (318-CONTEXT D-02 / Trap 14): `install` downloads the PINNED mergerfs
# 2.42.0 native ubuntu-noble/jammy .deb + the snapraid 14.8 amd64 .deb from their GitHub
# Releases and sha256-verifies each against the LITERAL vendor digest BEFORE installing; a
# mismatch aborts (exit 2) and nothing is installed. arm64 snapraid has NO prebuilt asset, so
# it is BUILT FROM the pinned source tarball (`./configure && make && make install`; deps
# covered by the unconditional build-essential at deploy-livinityd.sh:181). It NEVER pulls a
# distro apt package and NEVER pipes a remote script into a shell.
#
# NO LIVE EXECUTION ON THE DEV HOST (D-16): acceptance for this wrapper is `bash -n` +
# structural grep ONLY. install / format / mount are exercised exclusively on a disposable
# test box in 318-HUMAN-UAT.md (destructive, operator-greenlit, TEST BOX FIRST).
#
# Actions (the enum is the ONLY control input; anything unmatched -> `*) exit 2` BEFORE any
# privileged command runs; snapraid.conf body arrives on STDIN, NOT in argv):
#   install                             arch+codename-conditional pinned mergerfs/snapraid install
#   list-eligible                       READ-ONLY JSON of internal, non-removable, non-OS disks
#   create-pool  --dev N [--dev N] [--parity N]   format each data disk (+ parity at /mnt/parity1)
#   format-disk  --dev N [--dev N ...]  wipe+GPT+mkfs.ext4 one or more data disks
#   mount-data-disk --dev N --target /mnt/diskN   mount an already-formatted data disk (idempotent)
#   add-disk     --dev N --target /mnt/diskN       mount-data-disk + live mergerfs branch add
#   mount                               write the D-05 mergerfs fstab line (idempotent) + mount /mnt/pool
#   unmount                             umount /mnt/pool
#   write-snapraid-conf                 write /etc/snapraid.conf 0644 from STDIN (idempotent)
#   snapraid     [args...]              run snapraid (charset-validated argv) --conf --log
#   replace-fix   --disk dN             snapraid fix -d dN   (disk-scoped rebuild)
#   replace-check --disk dN             snapraid check -d dN (simulate BEFORE trusting — D-11)
#   replace-sync                        snapraid sync        (bring parity current)
# Any action not in this list -> `*) exit 2` (default-reject) before any privileged command runs.
#
# Exit codes: 2 = bad usage / unknown action / invalid device / OS-disk or USB/removable
#             refusal / sha256 mismatch / WSL2 destructive refusal. Otherwise the underlying
#             command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-pool] must run as root" >&2; exit 2; }

# ── Wrapper-owned constants (no caller string ever reaches these) ─────────────
# Pinned mergerfs 2.42.0 + snapraid 14.8 GitHub-Release assets and the vendor-published
# sha256 digests (318-RESEARCH §Installation, verified 2026-07-15). URL pattern:
#   https://github.com/{trapexit/mergerfs,amadvance/snapraid}/releases/download/{2.42.0,v14.8}/{asset}
readonly MERGERFS_VERSION="2.42.0"
readonly MERGERFS_URL_BASE="https://github.com/trapexit/mergerfs/releases/download/${MERGERFS_VERSION}"
readonly MERGERFS_SHA_NOBLE_AMD64="7161ac65fb12cda88832a32226451d2dd83d1f56b84f3ed18f3e303233bc7760"
readonly MERGERFS_SHA_NOBLE_ARM64="114bbb6b7a83248e2784679eb43533ad91a976373862e8e6530b0696e262be88"
readonly MERGERFS_SHA_JAMMY_AMD64="2fded6b274721e89f7ac89f6063f6e6cf7684519c6562e4461157edad2cb2d53"
readonly MERGERFS_SHA_JAMMY_ARM64="4086caa2f81273bf49659d681bdc968eea7a1e96908721ed579a7097520ce18c"
readonly SNAPRAID_VERSION="14.8"
readonly SNAPRAID_URL_BASE="https://github.com/amadvance/snapraid/releases/download/v${SNAPRAID_VERSION}"
readonly SNAPRAID_DEB="snapraid_14.8-1_amd64.deb"
readonly SNAPRAID_SHA_AMD64="c0e00a25b9bce40ff74f5a55401c3bfedac1881fd99aaa90a692f5858d417f7d"
readonly SNAPRAID_SRC="snapraid-14.8.tar.gz"
readonly SNAPRAID_SRC_URL="${SNAPRAID_URL_BASE}/${SNAPRAID_SRC}"

# Pool paths. Data disks mount at /mnt/disk2..N; parity at /mnt/parity1 which deliberately
# does NOT match the /mnt/disk* glob so it can never become a mergerfs data branch (Trap 3).
readonly POOL_MOUNT="/mnt/pool"
readonly PARITY_MOUNT="/mnt/parity1"
readonly SNAPRAID_CONF="/etc/snapraid.conf"

# The single mergerfs fstab line (318-CONTEXT D-05). Written verbatim by the `mount` action.
#   category.create=mfs is a DELIBERATE override of upstream's `pfrd` default (317 lock,
#     Trap 4) — chosen for the heterogeneous-disk use case; NEVER "fix" it back to pfrd.
#   branches-mount-timeout-fail=true is NON-NEGOTIABLE (Trap 5): a member disk that fails to
#     mount before mergerfs starts must be a LOUD, alertable systemd mount failure — never a
#     silent fall-through that writes to the (empty) mountpoint on the OS disk.
readonly POOL_FSTAB_LINE='/mnt/disk* /mnt/pool mergerfs cache.files=off,category.create=mfs,func.getattr=newest,dropcacheonclose=false,minfreespace=20G,moveonenospc=true,branches-mount-timeout=30,branches-mount-timeout-fail=true,x-systemd.mount-timeout=45s,fsname=livinity-pool,allow_other 0 0'

# ── Validators & device-safety gates (run BEFORE any value reaches a privileged command) ──

# gate 1 — bare kernel whole-disk name. Accepts an optional /dev/ prefix and strips it.
# Prints the normalized name on stdout; returns 2 on a bad shape (donor: livos-power.sh
# _normalize_dev distinct-exit pattern, widened to the DEVICE_ID_RE shape used across the TS
# module — sd[a-z]+ / nvme[0-9]+n[0-9]+ / mmcblk[0-9]+).
_valid_dev() {
	local d="${1:-}"
	d="${d#/dev/}"
	[[ "$d" =~ ^(sd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$ ]] || {
		echo "[livos-pool] invalid block device (expected sd*/nvme*/mmcblk*): '${1:-}'" >&2
		return 2
	}
	printf '%s' "$d"
}

# Partition suffix for a whole-disk name (nvme/mmcblk use pN; sd uses N).
_part_suffix() {
	case "$1" in
		nvme*|mmcblk*) printf 'p1' ;;
		*) printf '1' ;;
	esac
}

# Resolve the WHOLE PHYSICAL disk name(s) backing a mountpoint (CR-01). Prints one disk name
# per line (a mdadm array backs / from MULTIPLE disks — ALL are emitted so ALL get refused).
#   findmnt -no SOURCE <mp>  ->  lsblk -rsno NAME,TYPE <src>  (take every TYPE=disk row)
# `lsblk -s` walks the INVERSE dependency tree down through any LVM/LUKS/mdadm layer to the
# physical disk, so a stacked root (/dev/mapper/vg-root, /dev/mapper/cryptroot, /dev/md0,
# /dev/nvme0n1p2) resolves to its actual disk name(s) (sda, nvme0n1) — NOT the intermediate
# backing PARTITION (sda3) that `lsblk -no PKNAME` returns (the CR-01 OS-destroy hole).
# Empty on any failure (fail-safe: an unresolved mount simply means we cannot prove a match,
# and the caller keeps the belt-and-braces posture).
_disk_for_mount() {
	local mp="${1:-}" src base pk
	src=$(findmnt -no SOURCE "$mp" 2>/dev/null | head -n1) || return 0
	[[ -n "$src" ]] || return 0
	# Primary: every TYPE=disk ancestor (raw output, no tree chars) — the physical disk(s).
	# `|| true` keeps a transient lsblk failure from tripping errexit (fail-safe: fall through
	# to the basename strip / empty rather than aborting the whole guard).
	local disks
	disks=$(lsblk -rsno NAME,TYPE "$src" 2>/dev/null | awk '$NF=="disk"{print $1}' || true)
	if [[ -n "$disks" ]]; then
		printf '%s\n' "$disks"
		return 0
	fi
	# Fallback (only when lsblk emits no disk ancestor): nvme/mmcblk-aware partition strip on
	# the /dev/... basename. nvme0n1p2 -> nvme0n1 ; mmcblk0p1 -> mmcblk0 ; sda3 -> sda. A
	# mapper/lvm/crypt basename yields nothing (never a bogus disk name).
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

# True (return 0) if whole-disk name $1 appears in the newline-separated list $2. Used because
# _disk_for_mount can emit MULTIPLE disks (a mdadm-backed mount), so a plain string `==` would
# miss all but the concatenated blob (CR-01).
_dev_in_list() {
	local needle="$1" line
	while IFS= read -r line; do
		[[ -n "$line" && "$line" == "$needle" ]] && return 0
	done <<< "$2"
	return 1
}

# gate 2 — refuse a device that backs / OR /boot OR /boot/efi. Returns 2 on a match.
# Ported from livos-power.sh:127-140 (_refuse_system_disk), EXTENDED to also reject the EFI
# system-partition backing disk when /boot/efi is a distinct mount (Trap 10) and to handle a
# mount backed by SEVERAL whole disks (mdadm — every one is refused, CR-01). Wrapper-side
# belt-and-braces; the TS route ALSO filters candidates, but this never trusts that.
_refuse_system_disk() {
	local dev="$1" root_disks boot_disks efi_disks
	root_disks=$(_disk_for_mount /)
	boot_disks=$(_disk_for_mount /boot)
	efi_disks=$(_disk_for_mount /boot/efi)
	if _dev_in_list "$dev" "$root_disks"; then
		echo "[livos-pool] refusing the ROOT disk (/dev/${dev}) — it backs /" >&2
		return 2
	fi
	if _dev_in_list "$dev" "$boot_disks"; then
		echo "[livos-pool] refusing the BOOT disk (/dev/${dev}) — it backs /boot" >&2
		return 2
	fi
	if _dev_in_list "$dev" "$efi_disks"; then
		echo "[livos-pool] refusing the EFI system-partition disk (/dev/${dev}) — it backs /boot/efi" >&2
		return 2
	fi
	return 0
}

# gate 3 — refuse a USB-transport OR removable device (318-PLAN-CHECK W-1). NEW helper (no
# direct donor; same shape as _refuse_system_disk): `lsblk -dno TRAN/RM` on the whole disk.
# Called INSIDE every destructive action — gate 3 must NOT live only in list-eligible, so the
# wrapper never relies solely on the TS-side membership set. Returns 4 on a match.
_refuse_non_internal() {
	local dev="$1" tran rm
	tran=$(lsblk -dno TRAN "/dev/${dev}" 2>/dev/null | head -n1 | tr -d '[:space:]')
	rm=$(lsblk -dno RM "/dev/${dev}" 2>/dev/null | head -n1 | tr -d '[:space:]')
	if [[ "$tran" == "usb" ]]; then
		echo "[livos-pool] refusing USB-transport device (/dev/${dev}) — internal drives only" >&2
		return 4
	fi
	if [[ "$rm" == "1" ]]; then
		echo "[livos-pool] refusing REMOVABLE device (/dev/${dev}) — internal drives only" >&2
		return 4
	fi
	return 0
}

# All THREE gates for ONE device, in order. Prints the normalized name; returns non-zero on
# ANY failure so a destructive arm does `dev=$(_guard "$raw") || exit 2` and refuses BEFORE
# any mkfs/wipefs/mount. This is the single choke point every destructive action funnels its
# target device args through (D-17 belt-and-braces).
_guard() {
	local d
	d=$(_valid_dev "$1") || return 2          # gate 1: device-shape regex
	_refuse_system_disk "$d" || return 2      # gate 2: OS / boot / EFI disk refusal
	_refuse_non_internal "$d" || return 4     # gate 3: USB / removable refusal
	printf '%s' "$d"
}

# Refuse destructive actions under WSL2 (no real internal disks; livos-power.sh precedent).
_refuse_wsl2() {
	if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
		echo "[livos-pool] refusing destructive pool action under WSL2 (no real internal disks)" >&2
		exit 2
	fi
}

# Validate a snapraid disk name (the `dN` label from snapraid.conf `data dN ...`).
_valid_disk_name() {
	[[ "${1:-}" =~ ^[A-Za-z0-9_-]{1,32}$ ]]
}

# Validate a single snapraid argv token (defense in depth — exec uses an argv array so no
# shell metachar is interpreted, but we still refuse anything outside a conservative set).
_valid_snapraid_arg() {
	[[ "${1:-}" =~ ^[A-Za-z0-9._:/=-]+$ ]]
}

# ── Shared arg parser for the device-taking actions ──────────────────────────
# Collects repeated --dev into DEVS[], plus optional --target /mnt/diskN and --parity <dev>
# and --disk dN. Rejects any unexpected token (exit 2) BEFORE it can reach a command.
DEVS=()
TARGET=""
PARITY=""
DISK=""
_parse_args() {
	while [[ $# -gt 0 ]]; do
		case "$1" in
			--dev)
				[[ -n "${2:-}" ]] || { echo "[livos-pool] --dev needs a value" >&2; exit 2; }
				DEVS+=("$2"); shift 2 ;;
			--target)
				[[ -n "${2:-}" ]] || { echo "[livos-pool] --target needs a value" >&2; exit 2; }
				TARGET="$2"; shift 2 ;;
			--parity)
				[[ -n "${2:-}" ]] || { echo "[livos-pool] --parity needs a value" >&2; exit 2; }
				PARITY="$2"; shift 2 ;;
			--disk)
				[[ -n "${2:-}" ]] || { echo "[livos-pool] --disk needs a value" >&2; exit 2; }
				DISK="$2"; shift 2 ;;
			*)
				echo "[livos-pool] unexpected argument: '$1'" >&2; exit 2 ;;
		esac
	done
}

# Format ONE already-guarded whole disk: wipe any old signatures, lay a single GPT ext4
# partition, and mkfs.ext4 it. The caller MUST have run it through _guard first. Mirrors the
# external-storage.ts destructive sequence (sgdisk --zap-all -> wipefs -a -> parted mklabel
# gpt mkpart -> partprobe -> udevadm settle -> mkfs.ext4 -F).
_format_one() {
	local dev="$1" psuf
	psuf=$(_part_suffix "$dev")
	sgdisk --zap-all "/dev/${dev}" 2>/dev/null || true
	wipefs -a "/dev/${dev}"
	parted -s "/dev/${dev}" mklabel gpt mkpart primary ext4 0% 100%
	partprobe "/dev/${dev}" 2>/dev/null || true
	udevadm settle 2>/dev/null || true
	mkfs.ext4 -F "/dev/${dev}${psuf}"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
ACTION="${1:-}"
[[ $# -gt 0 ]] && shift || true

case "$ACTION" in
	install)
		# arch+codename-conditional pinned install, mirroring the kopia recipe
		# (deploy-livinityd.sh:196-224). warn-not-fail on an install error (never a hard
		# abort that bricks a deploy); a sha256 mismatch IS a hard abort (supply-chain guard).
		export DEBIAN_FRONTEND=noninteractive
		# shellcheck disable=SC1091
		. /etc/os-release 2>/dev/null || true
		_codename="${VERSION_CODENAME:-}"
		case "$(uname -m)" in
			x86_64)  _arch="amd64" ;;
			aarch64) _arch="arm64" ;;
			*)       _arch="" ;;
		esac
		if [[ -z "$_arch" ]]; then
			echo "[livos-pool] unsupported arch $(uname -m) — pooling packages not installed" >&2
			exit 0
		fi

		# mergerfs: pick the native ubuntu-<codename>_<arch> asset + its pinned digest.
		_mfs_deb=""; _mfs_sha=""
		case "${_codename}:${_arch}" in
			noble:amd64) _mfs_deb="mergerfs_${MERGERFS_VERSION}.ubuntu-noble_amd64.deb"; _mfs_sha="$MERGERFS_SHA_NOBLE_AMD64" ;;
			noble:arm64) _mfs_deb="mergerfs_${MERGERFS_VERSION}.ubuntu-noble_arm64.deb"; _mfs_sha="$MERGERFS_SHA_NOBLE_ARM64" ;;
			jammy:amd64) _mfs_deb="mergerfs_${MERGERFS_VERSION}.ubuntu-jammy_amd64.deb"; _mfs_sha="$MERGERFS_SHA_JAMMY_AMD64" ;;
			jammy:arm64) _mfs_deb="mergerfs_${MERGERFS_VERSION}.ubuntu-jammy_arm64.deb"; _mfs_sha="$MERGERFS_SHA_JAMMY_ARM64" ;;
			*)           _mfs_deb="" ;;
		esac

		apt-get update -qq || true

		if [[ -n "$_mfs_deb" ]]; then
			_mfs_tmp="$(mktemp -d)"
			trap 'rm -rf "$_mfs_tmp"' EXIT
			_mfs_path="${_mfs_tmp}/${_mfs_deb}"
			if curl -fsSL "${MERGERFS_URL_BASE}/${_mfs_deb}" -o "$_mfs_path" \
				&& printf '%s  %s\n' "$_mfs_sha" "$_mfs_path" | sha256sum -c - >/dev/null 2>&1; then
				apt-get install -y -qq "$_mfs_path" || echo "[livos-pool] mergerfs install failed (warn — pool unavailable until fixed)" >&2
			else
				echo "[livos-pool] mergerfs sha256 mismatch / download failure for ${_mfs_deb} — refusing to install (supply-chain guard)" >&2
				exit 2
			fi
		else
			echo "[livos-pool] no pinned mergerfs asset for ${_codename}/${_arch} — skipping mergerfs (warn)" >&2
		fi

		# snapraid: amd64 -> pinned .deb (same verify recipe); arm64 -> build from the pinned
		# source tarball (NO prebuilt arm64 asset exists; deps from the unconditional
		# build-essential at deploy-livinityd.sh:181).
		if [[ "$_arch" == "amd64" ]]; then
			_sr_tmp="$(mktemp -d)"
			_sr_path="${_sr_tmp}/${SNAPRAID_DEB}"
			if curl -fsSL "${SNAPRAID_URL_BASE}/${SNAPRAID_DEB}" -o "$_sr_path" \
				&& printf '%s  %s\n' "$SNAPRAID_SHA_AMD64" "$_sr_path" | sha256sum -c - >/dev/null 2>&1; then
				apt-get install -y -qq "$_sr_path" || echo "[livos-pool] snapraid install failed (warn)" >&2
			else
				echo "[livos-pool] snapraid sha256 mismatch / download failure for ${SNAPRAID_DEB} — refusing to install (supply-chain guard)" >&2
				rm -rf "$_sr_tmp"
				exit 2
			fi
			rm -rf "$_sr_tmp"
		else
			# arm64: build from source. warn-not-fail (a build failure must not brick a deploy).
			_srb_tmp="$(mktemp -d)"
			if curl -fsSL "$SNAPRAID_SRC_URL" -o "${_srb_tmp}/${SNAPRAID_SRC}" \
				&& tar xzf "${_srb_tmp}/${SNAPRAID_SRC}" -C "$_srb_tmp"; then
				( cd "${_srb_tmp}/snapraid-${SNAPRAID_VERSION}" && ./configure && make && make install ) \
					|| echo "[livos-pool] snapraid build-from-source failed (warn — arm64 pool parity unavailable until fixed)" >&2
			else
				echo "[livos-pool] snapraid source download / extract failed (warn)" >&2
			fi
			rm -rf "$_srb_tmp"
		fi

		# `user_allow_other` lets the Samba single-account daemon + Docker read the pool mount
		# (fstab uses allow_other). Idempotent grep-append — REUSED VERBATIM from
		# livos-rclone.sh:161-167 (D-05, Don't Hand-Roll): a prior rclone/crypto install may
		# already carry the line, so the grep-guard keeps this a no-op in that case.
		if [[ -f /etc/fuse.conf ]]; then
			grep -qE '^[[:space:]]*user_allow_other[[:space:]]*$' /etc/fuse.conf \
				|| echo 'user_allow_other' >> /etc/fuse.conf
		else
			echo 'user_allow_other' > /etc/fuse.conf
			chmod 0644 /etc/fuse.conf
		fi
		echo installed
		exit 0
		;;

	list-eligible)
		# READ-ONLY. Emit a JSON array of candidate internal disks — the D-10 gate-2 source
		# for livinityd (which RE-VALIDATES every returned device before any destructive
		# call). Applies the SAME transport/removable exclusion (gate 3) here, but that is a
		# convenience for the UI list; the destructive actions re-check it via
		# _refuse_non_internal so we never rely solely on this set (W-1). No mutation.
		_root_disk=$(_disk_for_mount /)
		_boot_disk=$(_disk_for_mount /boot)
		_efi_disk=$(_disk_for_mount /boot/efi)
		_first=1
		printf '['
		for _name in $(lsblk -dn -o NAME,TYPE 2>/dev/null | awk '$2=="disk"{print $1}'); do
			_tran=$(lsblk -dno TRAN "/dev/${_name}" 2>/dev/null | head -n1 | tr -d '[:space:]')
			_rm=$(lsblk -dno RM "/dev/${_name}" 2>/dev/null | head -n1 | tr -d '[:space:]')
			# exclude usb transport + removable + the / , /boot , /boot/efi backing disks.
			[[ "$_tran" == "usb" ]] && continue
			[[ "$_rm" == "1" ]] && continue
			# _disk_for_mount can emit MULTIPLE disks (mdadm) — membership-test each list (CR-01).
			_dev_in_list "$_name" "$_root_disk" && continue
			_dev_in_list "$_name" "$_boot_disk" && continue
			_dev_in_list "$_name" "$_efi_disk" && continue
			_size=$(lsblk -dno SIZE -b "/dev/${_name}" 2>/dev/null | head -n1 | tr -d '[:space:]')
			_pkname=$(lsblk -dno PKNAME "/dev/${_name}" 2>/dev/null | head -n1 | tr -d '[:space:]')
			# Strip JSON-hostile chars from vendor-supplied model/serial before emitting.
			_model=$(lsblk -dno MODEL "/dev/${_name}" 2>/dev/null | head -n1 | sed 's/[[:space:]]*$//; s/["\\]//g')
			_serial=$(lsblk -dno SERIAL "/dev/${_name}" 2>/dev/null | head -n1 | tr -d '[:space:]' | sed 's/["\\]//g')
			[[ $_first -eq 1 ]] || printf ','
			_first=0
			printf '{"name":"%s","tran":"%s","rm":"%s","size":"%s","model":"%s","serial":"%s","pkname":"%s"}' \
				"$_name" "$_tran" "$_rm" "$_size" "$_model" "$_serial" "$_pkname"
		done
		printf ']\n'
		exit 0
		;;

	create-pool)
		# DESTRUCTIVE. Format each selected data disk (+ an optional parity disk mounted at
		# /mnt/parity1). EVERY device is funnelled through _guard (gate 1 shape + gate 2
		# _refuse_system_disk + gate 3 _refuse_non_internal) BEFORE any wipe/mkfs — belt-and-
		# braces even against a buggy/compromised caller (D-17, W-1). Data-disk mounts + the
		# fstab pool line are finalized via mount-data-disk + mount.
		_refuse_wsl2
		_parse_args "$@"
		(( ${#DEVS[@]} >= 1 )) || { echo "[livos-pool] create-pool needs at least one --dev" >&2; exit 2; }
		for _d in "${DEVS[@]}"; do
			_dev=$(_guard "$_d") || exit 2      # gate 1+2+3 on every target device
			_format_one "$_dev"
		done
		if [[ -n "$PARITY" ]]; then
			_pdev=$(_guard "$PARITY") || exit 2  # gate 1+2+3 on the parity device too
			_format_one "$_pdev"
			mkdir -p "$PARITY_MOUNT"
			# Parity mounts at /mnt/parity1 — OUTSIDE the /mnt/disk* glob (Trap 3) so it is
			# never picked up as a mergerfs data branch.
			if ! findmnt -no TARGET "$PARITY_MOUNT" >/dev/null 2>&1; then
				mount "/dev/${_pdev}$(_part_suffix "$_pdev")" "$PARITY_MOUNT"
			fi
		fi
		echo "pool-disks-created"
		exit 0
		;;

	format-disk)
		# DESTRUCTIVE. Wipe + GPT + mkfs.ext4 one or more data disks. Every --dev is guarded
		# (gate 1 _valid_dev + gate 2 _refuse_system_disk + gate 3 _refuse_non_internal) via
		# _guard before mkfs runs.
		_refuse_wsl2
		_parse_args "$@"
		(( ${#DEVS[@]} >= 1 )) || { echo "[livos-pool] format-disk needs at least one --dev" >&2; exit 2; }
		for _d in "${DEVS[@]}"; do
			_dev=$(_guard "$_d") || exit 2      # gate 1+2+3 on every target device
			_format_one "$_dev"
		done
		echo "formatted"
		exit 0
		;;

	mount-data-disk)
		# DESTRUCTIVE-ADJACENT (mounts, does not format). The NAMED helper the replacement
		# runbook's "mount at the SAME /mnt/diskN" step uses (W-4). Re-validates dev shape +
		# _refuse_system_disk + _refuse_non_internal via _guard, then mounts an ALREADY-
		# formatted data disk at an EXPLICIT /mnt/diskN target. Idempotent (already mounted at
		# target = success).
		_refuse_wsl2
		_parse_args "$@"
		(( ${#DEVS[@]} == 1 )) || { echo "[livos-pool] mount-data-disk needs exactly one --dev" >&2; exit 2; }
		[[ "$TARGET" =~ ^/mnt/disk[0-9]+$ ]] || { echo "[livos-pool] mount-data-disk needs --target /mnt/diskN" >&2; exit 2; }
		_dev=$(_guard "${DEVS[0]}") || exit 2   # gate 1+2+3 on the target device
		mkdir -p "$TARGET"
		if findmnt -no TARGET "$TARGET" >/dev/null 2>&1; then
			echo "already-mounted"
			exit 0
		fi
		mount "/dev/${_dev}$(_part_suffix "$_dev")" "$TARGET"
		echo "mounted"
		exit 0
		;;

	add-disk)
		# DESTRUCTIVE-ADJACENT. mount-data-disk semantics + the Pattern-3 live mergerfs branch
		# add (in-memory; the glob picks it up on the next remount/reboot regardless). Guarded
		# via _guard (gate 1+2+3).
		_refuse_wsl2
		_parse_args "$@"
		(( ${#DEVS[@]} == 1 )) || { echo "[livos-pool] add-disk needs exactly one --dev" >&2; exit 2; }
		[[ "$TARGET" =~ ^/mnt/disk[0-9]+$ ]] || { echo "[livos-pool] add-disk needs --target /mnt/diskN" >&2; exit 2; }
		_dev=$(_guard "${DEVS[0]}") || exit 2   # gate 1+2+3 on the target device
		mkdir -p "$TARGET"
		if ! findmnt -no TARGET "$TARGET" >/dev/null 2>&1; then
			mount "/dev/${_dev}$(_part_suffix "$_dev")" "$TARGET"
		fi
		# Pattern 3: live in-memory branch add (trapexit runtime_interface). Target is
		# regex-validated /mnt/diskN, so no flag/space can be smuggled into the xattr value.
		setfattr -n user.mergerfs.branches -v "+>${TARGET}" "${POOL_MOUNT}/.mergerfs"
		echo "disk-added"
		exit 0
		;;

	mount)
		# Write the SINGLE mergerfs fstab line (D-05, POOL_FSTAB_LINE — category.create=mfs
		# override + branches-mount-timeout-fail=true both baked in) idempotently, then mount
		# the pool. Not per-device destructive; the member disks are formatted/mounted by
		# create-pool + mount-data-disk first.
		_refuse_wsl2
		mkdir -p "$POOL_MOUNT"
		touch /etc/fstab
		if ! grep -qF 'fsname=livinity-pool' /etc/fstab; then
			_ftmp=$(mktemp)
			grep -vF 'fsname=livinity-pool' /etc/fstab > "$_ftmp" || true
			printf '%s\n' "$POOL_FSTAB_LINE" >> "$_ftmp"
			install -m 0644 -o root -g root "$_ftmp" /etc/fstab
			rm -f "$_ftmp"
		fi
		systemctl daemon-reload 2>/dev/null || true
		mount "$POOL_MOUNT" 2>/dev/null || mount -a
		echo "pool-mounted"
		exit 0
		;;

	unmount)
		umount "$POOL_MOUNT" 2>/dev/null || true
		echo "pool-unmounted"
		exit 0
		;;

	write-snapraid-conf)
		# Write /etc/snapraid.conf from the whole-file body on STDIN (never argv — the conf is
		# regenerated render-time from pool state, samba.ts precedent). 0644 root-owned via
		# mktemp + cmp-s idempotency.
		_cf_tmp=$(mktemp)
		cat > "$_cf_tmp"
		if [[ ! -f "$SNAPRAID_CONF" ]] || ! cmp -s "$_cf_tmp" "$SNAPRAID_CONF"; then
			install -m 0644 -o root -g root "$_cf_tmp" "$SNAPRAID_CONF"
		fi
		rm -f "$_cf_tmp"
		echo "snapraid-conf-written"
		exit 0
		;;

	snapraid)
		# Run snapraid with the caller-supplied verb + a STRICT allowlist of verb-flags, always
		# with --conf /etc/snapraid.conf + --log ">&1" (D-04 structured-tag parsing contract).
		#
		# WR-04 + NEW-01 HARDENING: the wrapper injects BOTH --conf and --log itself and a
		# caller may NOT override either, nor reach ANY other file. snapraid honours the LAST
		# --conf/-c on the line, so a permitted `snapraid -c evil.conf fix` (or the long
		# `--conf`) would let a grant-holder point snapraid at an attacker-controlled config and
		# get root-level writes via `fix` into arbitrary `data` paths. Rejecting only `--*`
		# long options (WR-04) left the equivalent SHORT aliases open — `-c`=--conf, `-l`=--log,
		# plus `-C`/`-F`/… — since a single-dash CWD-relative filename passes an `--*`-only /
		# `*/*`-only filter (NEW-01). We therefore ALLOWLIST instead of blocklist: (a) the first
		# token MUST be a known verb, and (b) the ONLY tokens permitted after it are
		# `-d <label>` (disk scope) and `-p <percent|new>` (scrub scope), each with a
		# charset-validated value; ANY other token — short OR long option, path, sentinel — is
		# refused. livinityd's snapraid-cli only ever forwards `<verb>`, `-d <label>`, or
		# `-p <int>`, so this is a no-op for the legitimate caller and a hard stop for a
		# buggy/compromised one.
		case "${1:-}" in
			diff|sync|scrub|status|check|fix) ;;
			*) echo "[livos-pool] snapraid: first arg must be a known verb (diff|sync|scrub|status|check|fix), got: '${1:-}'" >&2; exit 2 ;;
		esac
		# Build the forwarded argv from the verb + only allowlisted flag pairs. The array always
		# holds at least the verb, so its expansion is never empty (safe under `set -u`).
		_sr_argv=("$1"); shift
		while [[ $# -gt 0 ]]; do
			case "$1" in
				-d)
					[[ -n "${2:-}" ]] || { echo "[livos-pool] snapraid: -d needs a <label> value" >&2; exit 2; }
					_valid_disk_name "$2" || { echo "[livos-pool] snapraid: invalid -d disk label '$2'" >&2; exit 2; }
					_sr_argv+=("-d" "$2"); shift 2 ;;
				-p)
					[[ -n "${2:-}" ]] || { echo "[livos-pool] snapraid: -p needs a <percent|new> value" >&2; exit 2; }
					[[ "$2" =~ ^([0-9]+|new)$ ]] || { echo "[livos-pool] snapraid: invalid -p scrub value '$2' (expected an integer percent or 'new')" >&2; exit 2; }
					_sr_argv+=("-p" "$2"); shift 2 ;;
				*)
					# Everything else — including the short config/log aliases -c/-C/-l/-F, any
					# other short or long option, path, or `--` sentinel — is refused. Config +
					# log paths are fixed and injected below; nothing else may be reached.
					echo "[livos-pool] snapraid: refusing argument '$1' (only '-d <label>' and '-p <percent|new>' are permitted after the verb; config + log paths are fixed)" >&2; exit 2 ;;
			esac
		done
		exec snapraid --conf "$SNAPRAID_CONF" --log ">&1" "${_sr_argv[@]}"
		;;

	replace-fix)
		# Disk-scoped rebuild: snapraid fix -d <name> (never whole-pool). D-11 runbook step.
		_parse_args "$@"
		_valid_disk_name "$DISK" || { echo "[livos-pool] replace-fix needs --disk <name>" >&2; exit 2; }
		exec snapraid --conf "$SNAPRAID_CONF" --log ">&1" fix -d "$DISK"
		;;

	replace-check)
		# Simulate-only verification BEFORE trusting a rebuild (D-11 / Trap 12 — the caller
		# HARD-STOPS on summary:error_unrecoverable>0 and never auto-chains into sync).
		_parse_args "$@"
		_valid_disk_name "$DISK" || { echo "[livos-pool] replace-check needs --disk <name>" >&2; exit 2; }
		exec snapraid --conf "$SNAPRAID_CONF" --log ">&1" check -d "$DISK"
		;;

	replace-sync)
		# Bring parity current again after a verified fix (D-11 final step).
		exec snapraid --conf "$SNAPRAID_CONF" --log ">&1" sync
		;;

	*)
		# Closed enum default-reject: any action not matched above is refused here with
		# `exit 2` BEFORE any privileged command can run.
		echo "[livos-pool] invalid action: '${ACTION}' — expected one of: install list-eligible create-pool add-disk format-disk mount mount-data-disk unmount write-snapraid-conf snapraid replace-fix replace-check replace-sync" >&2
		exit 2
		;;
esac
