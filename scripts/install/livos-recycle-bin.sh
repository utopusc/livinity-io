#!/usr/bin/env bash
# scripts/install/livos-recycle-bin.sh
# Phase 338 (RECYCLE-01, D-338-1) — root-owned `.Recycle.Bin` provisioning wrapper.
#
# Deployed to /usr/local/lib/livos/livos-recycle-bin.sh (mode 0755, root-owned) by
# update.sh (Step 7.10x). Invoked by livinityd's samba module (#ensureRecycleBin,
# fail-soft) via the scoped sudoers grant (sudoers.d/livos-recycle-bin):
#   sudo -n /usr/local/lib/livos/livos-recycle-bin.sh ensure-dir <abs-share-path>
#
# WHY A WRAPPER (clone of the Phase 332 livos-waf.sh + Phase 324 livos-samba-user.sh
# template): the privileged surface here is creating a ROOT-OWNED directory with
# mode 1770 and group `livinity` inside an arbitrary share path — root-only work
# (livinityd runs as the unprivileged desktop user and must not own the bin: the
# top-level `.Recycle.Bin` has to be root:livinity 1770 so every `livos-*` account
# can CREATE its own `%U` subdir but never traverse a sibling's — without this
# pre-provisioning, the first SMB deleter's 0700 auto-created dir fail-closed-blocks
# every other user's recycle, RESEARCH §3.1). A raw NOPASSWD grant on mkdir/chown/
# chmod would let any process that can call `sudo` re-own or re-mode ARBITRARY
# paths. Instead the sudoers grant is on THIS ONE binary path (no glob, no argument
# wildcard), the wrapper accepts ONLY a fixed action enum {ensure-dir|status}, and
# the single caller-supplied path is validated (absolute, charset, no `..`
# components, canonicalized via realpath -m) against a conservative ALLOWLIST of
# share roots BEFORE any privileged command runs (T-324-11 argv-injection guard
# applied to a directory path; W1/W4 plan-check bindings).
# To change a permitted operation, EDIT THIS WRAPPER — do NOT broaden the grant.
#
# Args (the enum is the ONLY control input; anything else -> exit 2, nothing
# privileged runs):
#   $1  action — ensure-dir | status
#   $2  path   — (ensure-dir only) ABSOLUTE share system path under an allowlisted
#                root; the wrapper creates <path>/.Recycle.Bin as 1770 root:livinity.
#
# Exit codes: 2 = bad usage / unknown action / invalid path. Otherwise the
# underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-recycle-bin] must run as root" >&2; exit 2; }

# Wrapper-owned constants (no caller string ever reaches these).
readonly RECYCLE_DIRNAME=".Recycle.Bin"
# The share group every per-user block sets via `force group = livinity`
# (samba.ts perUserShareConfig) — group-rwx on the bin lets each livos-* account
# create its own %U subdir; sticky (1) stops cross-user deletion at the top level.
readonly RECYCLE_GROUP="livinity"
readonly RECYCLE_MODE="1770"

# Validate the caller-supplied share path BEFORE it reaches mkdir/chown/chmod
# (W1/W4 plan-check bindings + T-324-11). Order matters:
#   1. non-empty, length-capped, ABSOLUTE, safe charset (no globs/quotes/control).
#   2. reject any `.`/`..` path COMPONENT (before canonicalization — substring
#      checks alone are insufficient, W4).
#   3. canonicalize with `realpath -m` (resolves symlinked ancestors lexically+
#      physically; -m tolerates a not-yet-existing leaf).
#   4. prefix-check the CANONICAL path against the conservative allowlist:
#        /opt/livos/data/…  — the LivOS data root (files.ts baseDirectories:
#                             home/trash/external/network/cloud/users/... all live
#                             under it)
#        /mnt/pool[/…]      — the mergerfs pool union mountpoint (files.ts
#                             POOL_MOUNTPOINT — the primary multi-user share case,
#                             W1). NEVER /mnt/diskN branches or /mnt/parity1.
# On success sets _CANON to the canonical path. Anything else -> exit 2.
_validate_path() {
	local _p="$1"
	[[ -n "$_p" ]] || { echo "[livos-recycle-bin] empty path" >&2; exit 2; }
	[[ "${#_p}" -le 1024 ]] || { echo "[livos-recycle-bin] path too long" >&2; exit 2; }
	[[ "$_p" == /* ]] || { echo "[livos-recycle-bin] path must be absolute: '${_p}'" >&2; exit 2; }
	local _charset='^[A-Za-z0-9._/ -]+$'
	[[ "$_p" =~ $_charset ]] \
		|| { echo "[livos-recycle-bin] invalid path charset (allowed: A-Z a-z 0-9 . _ / space -): '${_p}'" >&2; exit 2; }
	# W4: reject `.`/`..` COMPONENTS before any prefix logic.
	local IFS='/' _seg
	for _seg in $_p; do
		if [[ "$_seg" == ".." || "$_seg" == "." ]]; then
			echo "[livos-recycle-bin] path contains a '.'/'..' component: '${_p}'" >&2
			exit 2
		fi
	done
	# Canonicalize, then prefix-check the canonical form (W4 ordering).
	_CANON="$(realpath -m -- "$_p")" \
		|| { echo "[livos-recycle-bin] cannot canonicalize path: '${_p}'" >&2; exit 2; }
	case "$_CANON" in
		/opt/livos/data/?*) : ;;      # data root (must have a child component)
		/mnt/pool | /mnt/pool/*) : ;; # pool union mountpoint (W1)
		*)
			echo "[livos-recycle-bin] path outside allowed share roots (/opt/livos/data/, /mnt/pool): '${_CANON}'" >&2
			exit 2
			;;
	esac
}

ACTION="${1:-}"

case "$ACTION" in
	ensure-dir)
		# ensure-dir <abs-share-path> — idempotently create <path>/.Recycle.Bin as
		# 1770 root:livinity. mkdir -p tolerates an existing bin; chown/chmod re-assert
		# the contract on every call (heals a bin Samba auto-created with the first
		# deleter's uid). Group chown is best-effort with a root:root fallback so a box
		# somehow missing the `livinity` group still converges (fail-closed for
		# siblings — never a leak).
		TARGET="${2:-}"
		_validate_path "$TARGET"
		BIN_DIR="${_CANON}/${RECYCLE_DIRNAME}"
		mkdir -p -- "$BIN_DIR"
		chown "root:${RECYCLE_GROUP}" -- "$BIN_DIR" 2>/dev/null || chown root:root -- "$BIN_DIR"
		chmod "$RECYCLE_MODE" -- "$BIN_DIR"
		echo "ensured"
		exit 0
		;;

	status)
		# status — read-only probe: print the wrapper contract so a route/UAT can
		# confirm the deployed wrapper's constants without touching the filesystem.
		echo "recycle.dirname: ${RECYCLE_DIRNAME}"
		echo "recycle.group: ${RECYCLE_GROUP}"
		echo "recycle.mode: ${RECYCLE_MODE}"
		exit 0
		;;

	*)
		echo "[livos-recycle-bin] invalid action: '${ACTION}' — expected one of: ensure-dir status" >&2
		exit 2
		;;
esac
