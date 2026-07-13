#!/usr/bin/env bash
# scripts/install/livos-smartctl.sh
# Phase 313 (SMART-01..04) — root-owned smartctl wrapper (code-review HIGH-01 fix).
#
# Deployed to /usr/local/lib/livos/livos-smartctl.sh (mode 0755, root-owned) by
# deploy-livinityd.sh + update.sh. Invoked by livinityd's smart.ts via the scoped
# sudoers grant (sudoers.d/livos-smart):
#   sudo -n /usr/local/lib/livos/livos-smartctl.sh <device> <mode> [sat]
#
# WHY A WRAPPER (HIGH-01): the previous grant listed raw `smartctl ... /dev/*`
# shapes. sudoers wildcard matching joins the command line into ONE string and
# `*` does NOT stop at whitespace, so a process that can call `sudo` directly
# (bypassing smart.ts) could append extra flags after the device path — e.g.
#   sudo -n smartctl -a -j /dev/sda -s off        (firmware SMART toggle)
#   sudo -n smartctl -t short /dev/sda -t vendor,0x40
# — all matching the trailing `/dev/*`. This wrapper takes ONLY a regex-validated
# device id + a fixed mode enum, then builds the exact smartctl argv ITSELF, so no
# caller-supplied flag can ever reach smartctl. The sudoers grant is on this ONE
# binary path (no glob), which closes the injection surface entirely.
#
# (Tempering context: the desktop user is in the `docker` group and is thus already
# root-equivalent via the docker socket, so this closes a defense-in-depth deviation
# from the file's own stated model rather than a brand-new privilege class. It still
# matters: the daemon can toggle drive firmware without ever touching the socket.)
#
# Args (all validated; anything else -> exit 2 and smartctl is NEVER run):
#   $1  device  — kernel name, must match ^(sd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$
#                 (byte-identical to smart.ts DEVICE_ID_RE / external-storage.ts)
#   $2  mode    — read | selftest-short | selftest-long
#   $3  passthrough — optional literal 'sat' (USB-SATA bridge -> adds -d sat)
#
# smartctl's stdout / stderr / exit-status pass through UNCHANGED (exec), so
# smart.ts parses the same JSON body + bitmask exit it did against the raw grant.
# The argv shapes below are the load-bearing contract (were the sudoers Cmnd_Alias
# shapes; now internal to this root-owned wrapper).
#
# Exit codes (before exec): 2 = bad usage / failed validation. After exec: smartctl's own.

set -euo pipefail

SMARTCTL='/usr/sbin/smartctl'

DEVICE="${1:-}"
MODE="${2:-}"
PASSTHROUGH="${3:-}"

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-smartctl] must run as root" >&2; exit 2; }

# Device id: EXACT same guard as smart.ts DEVICE_ID_RE. Rejects any id carrying a
# shell metacharacter, a space, or a path traversal before it can reach an argv.
[[ "$DEVICE" =~ ^(sd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$ ]] \
	|| { echo "[livos-smartctl] invalid device id" >&2; exit 2; }

# Build the exact smartctl argv for the requested mode. No caller string other than
# the validated device id + the fixed 'sat' literal ever enters the argv.
ARGS=()
case "$MODE" in
	read)           ARGS=(-a -j) ;;
	selftest-short) ARGS=(-t short) ;;
	selftest-long)  ARGS=(-t long) ;;
	*)              echo "[livos-smartctl] invalid mode" >&2; exit 2 ;;
esac

# Passthrough: ONLY the literal 'sat' (or empty) is accepted.
if [[ -n "$PASSTHROUGH" ]]; then
	[[ "$PASSTHROUGH" == "sat" ]] || { echo "[livos-smartctl] invalid passthrough" >&2; exit 2; }
	ARGS+=(-d sat)
fi

ARGS+=("/dev/${DEVICE}")

exec "$SMARTCTL" "${ARGS[@]}"
