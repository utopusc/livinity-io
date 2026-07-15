#!/usr/bin/env bash
# scripts/install/livos-samba-user.sh
# Phase 324 (FILES-02, D-09/D-17) — root-owned per-user Samba provisioning wrapper.
#
# Deployed to /usr/local/lib/livos/livos-samba-user.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-samba-user) + update.sh (Step 7.10l). Invoked by
# livinityd's system routes (runSambaUser) via the scoped sudoers grant
# (sudoers.d/livos-samba-user):
#   sudo -n /usr/local/lib/livos/livos-samba-user.sh <action>
#
# WHY A WRAPPER (clone of the Phase 325 livos-crypto.sh + Phase 329 livos-webdav.sh
# template): the privileged surface here is creating a synthetic Unix account
# (`useradd --system`), running `smbpasswd -a` / `smbpasswd -x` / `userdel`, and
# reading `pdbedit -L` — all root-only. livinityd runs as the unprivileged desktop
# user. A raw NOPASSWD grant on useradd / smbpasswd / userdel would let any process
# that can call `sudo` create arbitrary accounts, set arbitrary Samba passwords, or
# delete system users. Instead the sudoers grant is on THIS ONE binary path (no
# glob, no argument wildcard) and the wrapper accepts ONLY a fixed action enum
# {add-user|set-password|remove-user|status}. It charset-validates the username
# BEFORE it reaches useradd/smbpasswd/userdel, and it builds every privileged argv
# ITSELF, so no caller-supplied string can escape into a flag or a foreign account.
# To change a permitted operation, EDIT THIS WRAPPER — do NOT broaden the grant.
#
# WHY SAMBA NEEDS A REAL UNIX ACCOUNT + A SECONDARY PASSWORD (files/webdav.ts:13-34
# divergence): unlike SFTPGo/WebDAV, stock Samba has NO external_auth_hook — it
# cannot delegate auth to livinityd's PG bcrypt table at login time. NTLM also
# cannot be derived from a bcrypt hash (different, non-invertible KDFs), so LivOS
# CANNOT sync the login password into Samba. Per-user Samba therefore structurally
# requires (a) a real (synthetic, login-less) Unix account so the file server has a
# uid to map on-disk access to, and (b) a SECONDARY, generate-once Samba password
# stored in the smbpasswd/NTLM database — never the login password. This wrapper
# provisions exactly (a) + (b); the secondary password reaches smbpasswd on STDIN.
#
# PASSWORD DISCIPLINE (T-324-11/T-324-13 / mirrors livos-crypto.sh _read_passphrase
# and samba.ts:143-145 `$({input}).smbpasswd`): the Samba SECONDARY password for
# add-user/set-password arrives on STDIN (fd 0), which the never-throw route helper
# writes to the child's stdin. It is NEVER a positional/argv element (would be
# `ps`-visible via /proc/<pid>/cmdline), is NEVER echoed, and is NEVER logged.
# smbpasswd is fed the password TWICE (new + confirm) on its stdin via `-s` (silent
# stdin mode) — exactly the shape samba.ts already uses for the shared account.
#
# Args (the enum is the ONLY control input; anything else -> exit 2, nothing
# privileged runs; the secondary password for add-user/set-password arrives on
# stdin, NOT in argv):
#   $1  action   — add-user | set-password | remove-user | status
#   $2  username — the LivOS (login) username; the synthetic account is livos-<username>
#
# Exit codes: 2 = bad usage / unknown action / invalid username / empty password.
#             Otherwise the underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-samba-user] must run as root" >&2; exit 2; }

# The synthetic-account prefix. Each LivOS user <username> maps to the login-less
# Unix + Samba account livos-<username> so the per-user file-server identity is
# unambiguously namespaced and can never collide with a real interactive account.
readonly ACCOUNT_PREFIX="livos-"

# Validate a caller-supplied LivOS username BEFORE it reaches any privileged
# command. Restricted charset (lowercase alnum + '-'/'_'), non-empty, length-capped;
# rejects anything that could inject a flag or escape into useradd/smbpasswd argv
# (T-324-11). Runs before $ACCOUNT is ever constructed.
_validate_username() {
	local _u="$1"
	[[ -n "$_u" ]] || { echo "[livos-samba-user] empty username" >&2; exit 2; }
	[[ "${#_u}" -le 32 ]] || { echo "[livos-samba-user] username too long: '${_u}'" >&2; exit 2; }
	[[ "$_u" =~ ^[a-z0-9_-]+$ ]] \
		|| { echo "[livos-samba-user] invalid username (allowed: a-z 0-9 _ -): '${_u}'" >&2; exit 2; }
}

# Read the Samba SECONDARY password from stdin (fd 0) into a PRIVATE var. The route
# helper writes it to the child's stdin; it never appears in argv. `|| true` guards
# the EOF-without-newline case under `set -e`. Reject an empty password (exit 2)
# before it can reach smbpasswd. NEVER echoed / logged.
_read_password() {
	IFS= read -r _SMB_PASS || true
	[[ -n "${_SMB_PASS:-}" ]] \
		|| { echo "[livos-samba-user] no password on stdin" >&2; exit 2; }
}

ACTION="${1:-}"

case "$ACTION" in
	add-user)
		# add-user <username> — provision the synthetic Unix account (idempotent) then
		# set its Samba secondary password (read on stdin, never argv). The Unix account
		# is login-less: --system (no reserved uid range clash), --no-create-home (files
		# live under the LivOS data root, not a home dir), --shell /usr/sbin/nologin.
		USERNAME="${2:-}"
		_validate_username "$USERNAME"
		ACCOUNT="${ACCOUNT_PREFIX}${USERNAME}"
		_read_password
		# Create the synthetic account only if it does not already exist (idempotent).
		if ! id "$ACCOUNT" >/dev/null 2>&1; then
			useradd --system --no-create-home --shell /usr/sbin/nologin "$ACCOUNT"
		fi
		# `smbpasswd -a -s` adds (or updates) the Samba entry reading new+confirm from
		# stdin. Feed the password TWICE (smbpasswd -s expects new then confirm).
		printf '%s\n%s\n' "$_SMB_PASS" "$_SMB_PASS" | smbpasswd -a -s "$ACCOUNT"
		unset _SMB_PASS
		echo "provisioned ${ACCOUNT}"
		exit 0
		;;

	set-password)
		# set-password <username> — rotate ONLY the Samba secondary password for the
		# existing livos-<username> account (new password on stdin, never argv).
		USERNAME="${2:-}"
		_validate_username "$USERNAME"
		ACCOUNT="${ACCOUNT_PREFIX}${USERNAME}"
		_read_password
		printf '%s\n%s\n' "$_SMB_PASS" "$_SMB_PASS" | smbpasswd -s "$ACCOUNT"
		unset _SMB_PASS
		echo "password-set ${ACCOUNT}"
		exit 0
		;;

	remove-user)
		# remove-user <username> — deprovision: drop the Samba entry then the synthetic
		# Unix account. Both guarded (`|| true`) so a partial state (only one present)
		# still converges to removed and never aborts under `set -e`.
		USERNAME="${2:-}"
		_validate_username "$USERNAME"
		ACCOUNT="${ACCOUNT_PREFIX}${USERNAME}"
		smbpasswd -x "$ACCOUNT" 2>/dev/null || true
		userdel "$ACCOUNT" 2>/dev/null || true
		echo "removed ${ACCOUNT}"
		exit 0
		;;

	status)
		# status — list the provisioned Samba accounts (livos-* only). Read-only probe
		# the route parses. `pdbedit -L` prints `<account>:<uid>:...`; filter to the
		# livos- prefix. Guarded so a Samba-less box (no pdbedit) still exits 0.
		pdbedit -L 2>/dev/null | grep "^${ACCOUNT_PREFIX}" || true
		exit 0
		;;

	*)
		echo "[livos-samba-user] invalid action: '${ACTION}' — expected one of: add-user set-password remove-user status" >&2
		exit 2
		;;
esac
