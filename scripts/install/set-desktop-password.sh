#!/usr/bin/env bash
# scripts/install/set-desktop-password.sh
# Phase 306 — privileged helper that (re)generates the LivOS desktop user's OS
# login / sudo password.
#
# Deployed to /usr/local/lib/livos/set-desktop-password.sh (mode 0755, root-owned)
# by update.sh + deploy-livinityd.sh. Invoked WITHOUT arguments by:
#   - livinityd's `system.regenerateDesktopPassword` mutation, via the scoped
#     sudoers grant:  sudo -n /usr/local/lib/livos/set-desktop-password.sh
#   - the install/update one-time bootstrap (run directly as root when
#     /etc/livos/desktop-user-credentials is missing).
#
# Design (security):
# - The password is GENERATED IN THIS SCRIPT, never passed via argv → it can
#   never leak through `ps`/`/proc/<pid>/cmdline` the way a `chpasswd <pw>` arg
#   would. The caller passes NO arguments.
# - The target user is RESOLVED here (never taken from an argument) and is
#   validated to be the box's real desktop user: uid >= 1000 and not root. The
#   script REFUSES to touch root or any system account.
# - The credential snapshot is written 0600, owned by the desktop user, so only
#   that user (which livinityd runs AS — Phase 192) and root can read it.
#
# Idempotent: safe to re-run; each run rotates to a fresh random password and
# rewrites the snapshot atomically.
#
# Exit codes: 0 = success · 1 = error (bad user / chpasswd / write failure)

set -euo pipefail
IFS=$'\n\t'

CREDS_DIR="/etc/livos"
CREDS_FILE="${CREDS_DIR}/desktop-user-credentials"

log() { echo "[set-desktop-password] $*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# Must run as root (we chpasswd + chown + write under /etc).
[[ $EUID -eq 0 ]] || die "Run as root (invoked via sudo by livinityd, or directly at install)"

# --firstboot: ALSO write a one-time copy consumed once by the onboarding done
# screen. ONLY the install/update bootstrap passes this (direct root call); the
# sudo-invoked Regenerate path passes NO args (the sudoers grant matches no-args
# only), so it can never create the first-boot copy.
WRITE_FIRSTBOOT=0
[[ "${1:-}" == "--firstboot" ]] && WRITE_FIRSTBOOT=1

for c in chpasswd id getent install openssl awk grep; do
	command -v "$c" >/dev/null 2>&1 || die "Missing dependency: $c"
done

# ── Resolve the desktop user (NEVER from an argument) ────────────────────────
# Resolution chain (mirrors scripts/capture-liv-assistant-password.sh):
#   1. LIVOS_DESKTOP_USER env (set when the install/update bootstrap calls us
#      directly; sudo strips env on the livinityd path, so this is a no-op there)
#   2. User= of the installed livos.service (source of truth on a live box)
#   3. first real login uid in [1000,65534)
#   4. neutral fallback 'livos' (never 'bruce', never 'root')
DESKTOP_USER="${LIVOS_DESKTOP_USER:-}"
if [[ -z "${DESKTOP_USER}" ]]; then
	DESKTOP_USER="$(grep -oP '^User=\K.*' /etc/systemd/system/livos.service 2>/dev/null | head -1 || true)"
fi
if [[ -z "${DESKTOP_USER}" ]]; then
	DESKTOP_USER="$(getent passwd | awk -F: '$3>=1000 && $3<65534 {print $1; exit}' || true)"
fi
[[ -n "${DESKTOP_USER}" ]] || DESKTOP_USER="livos"

# ── Hard safety: only ever change a real desktop user (uid>=1000, not root) ──
DESKTOP_UID="$(id -u "${DESKTOP_USER}" 2>/dev/null || true)"
[[ -n "${DESKTOP_UID}" ]] || die "Resolved user '${DESKTOP_USER}' does not exist"
[[ "${DESKTOP_USER}" != "root" ]] || die "Refusing to change the root password"
if [[ "${DESKTOP_UID}" -lt 1000 ]]; then
	die "Refusing to change password for system account '${DESKTOP_USER}' (uid=${DESKTOP_UID} < 1000)"
fi
DESKTOP_GROUP="$(id -gn "${DESKTOP_USER}" 2>/dev/null || echo "${DESKTOP_USER}")"

log "Target desktop user: ${DESKTOP_USER} (uid=${DESKTOP_UID})"

# ── Generate a strong 20-char alphanumeric password ─────────────────────────
# Alphanumeric only (no +,/,= or shell metacharacters) so it is trivial to copy,
# type at a console, and pipe to chpasswd without any quoting hazard. 62^20 ≈
# 119 bits of entropy. We over-generate then truncate to 20.
PASSWORD="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 20 || true)"
[[ ${#PASSWORD} -eq 20 ]] || die "Failed to generate a 20-char password (got length ${#PASSWORD})"

# ── Set the OS password ─────────────────────────────────────────────────────
# Here-string pipe to chpasswd: no shell parsing of the password value.
echo "${DESKTOP_USER}:${PASSWORD}" | chpasswd || die "chpasswd failed for ${DESKTOP_USER}"
log "Password set for ${DESKTOP_USER}"

# ── Ensure sudo group membership (so the password actually grants sudo) ──────
# Belt-and-suspenders: deploy-livinityd.sh already adds the user to `sudo`, but a
# box created by the install-phase path may not be a member yet. Non-fatal.
if usermod -aG sudo "${DESKTOP_USER}" 2>/dev/null; then
	log "Ensured ${DESKTOP_USER} is in the 'sudo' group"
else
	log "WARN: could not add ${DESKTOP_USER} to 'sudo' group (non-fatal)"
fi

# ── Persist the credential snapshot atomically (0600, desktop-user-owned) ────
install -d -m 0755 -o root -g root "${CREDS_DIR}"
TMP_FILE="${CREDS_FILE}.tmp.$$"
umask 077
{
	echo "username=${DESKTOP_USER}"
	echo "password=${PASSWORD}"
} > "${TMP_FILE}"
chown "${DESKTOP_USER}:${DESKTOP_GROUP}" "${TMP_FILE}"
chmod 0600 "${TMP_FILE}"
mv -f "${TMP_FILE}" "${CREDS_FILE}"

log "Credentials written to ${CREDS_FILE} ($(stat -c '%a %U:%G' "${CREDS_FILE}" 2>/dev/null || echo '0600'))"

# One-time first-boot copy (consumed + deleted once by the onboarding done
# screen). Settings → Account NEVER reads this — its reveal path is 2FA-gated.
if [[ "${WRITE_FIRSTBOOT}" == "1" ]]; then
	FB_FILE="${CREDS_DIR}/desktop-user-credentials.firstboot"
	FB_TMP="${FB_FILE}.tmp.$$"
	{
		echo "username=${DESKTOP_USER}"
		echo "password=${PASSWORD}"
	} > "${FB_TMP}"
	chown "${DESKTOP_USER}:${DESKTOP_GROUP}" "${FB_TMP}"
	chmod 0600 "${FB_TMP}"
	mv -f "${FB_TMP}" "${FB_FILE}"
	log "First-boot credential copy written to ${FB_FILE} (consumed once by onboarding)"
fi
exit 0
