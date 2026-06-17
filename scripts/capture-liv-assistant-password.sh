#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Target credential file: /etc/livos/liv-assistant-credentials
# (mode 0600, owned by the LivOS desktop user — NOT hardcoded bruce).
CREDS_DIR="/etc/livos"
CREDS_FILE="${CREDS_DIR}/liv-assistant-credentials"
SERVICE="liv-assistant"

# Phase 278: derive the owning user from the install env (mirrors
# install-liv-assistant.sh:51). Resolution chain, neutral last-resort:
#   1. LIVOS_DESKTOP_USER (set by parse-cli.sh)
#   2. DESKTOP_USER (alternate install env)
#   3. User= of the installed livos.service (the source of truth on a live box)
#   4. first real login uid>=1000
# This file is chowned to <user>:<group>; a non-bruce box no longer mis-owns it.
DESKTOP_USER_RESOLVED="${LIVOS_DESKTOP_USER:-${DESKTOP_USER:-}}"
if [[ -z "${DESKTOP_USER_RESOLVED}" ]]; then
  DESKTOP_USER_RESOLVED="$(grep -oP '^User=\K.*' /etc/systemd/system/livos.service 2>/dev/null | head -1 || true)"
fi
if [[ -z "${DESKTOP_USER_RESOLVED}" ]]; then
  DESKTOP_USER_RESOLVED="$(getent passwd | awk -F: '$3>=1000 && $3<65534 {print $1; exit}' || true)"
fi
[[ -n "${DESKTOP_USER_RESOLVED}" ]] || DESKTOP_USER_RESOLVED="livos"
BRUCE_USER="${DESKTOP_USER_RESOLVED}"
# Primary group of the resolved user (falls back to the username, the Ubuntu
# useradd default where the user has an eponymous group).
BRUCE_GROUP="$(id -gn "${BRUCE_USER}" 2>/dev/null || echo "${BRUCE_USER}")"

log() { echo "[capture-liv-assistant-password] $*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# Require root (we chown + chmod 0600 + write under /etc)
[[ $EUID -eq 0 ]] || die "Run as root (use sudo)"

# Dependencies
for c in journalctl grep awk install id; do
  command -v "$c" >/dev/null || die "Missing dependency: $c"
done

# Bootstrap /etc/livos if missing
if [[ ! -d "${CREDS_DIR}" ]]; then
  install -d -m 0755 -o root -g root "${CREDS_DIR}"
  log "Created ${CREDS_DIR}"
fi

# Idempotent: if file exists, is mode 0600, owned by bruce, and contains a non-empty password=... line, no-op.
if [[ -s "${CREDS_FILE}" ]]; then
  EXISTING_PW="$(grep -E '^password=' "${CREDS_FILE}" | head -n1 | cut -d= -f2-)"
  if [[ -n "${EXISTING_PW}" ]]; then
    log "Credentials already captured at ${CREDS_FILE} (password length=${#EXISTING_PW}); no-op"
    exit 0
  fi
fi

# Scrape journald for the first-boot password line.
# AionUi format (verified in 222-SPIKE.md): "[aionui-web] Generated initial admin password: <pw>"
# We take the FIRST occurrence (oldest entry) — that is the original first-boot value.
# If `resetpass` was run later, those lines appear AFTER and we ignore them here (operator
# would re-run the reset flow + this script to re-capture).
PASSWORD_LINE="$(journalctl -u "${SERVICE}" --no-pager -o cat 2>/dev/null \
  | grep -E 'Generated initial admin password:' \
  | head -n1 || true)"

if [[ -z "${PASSWORD_LINE}" ]]; then
  log "First-boot password line not yet in journald for unit ${SERVICE}. Service may still be starting; caller should retry."
  exit 0
fi

# Extract the password — everything after "Generated initial admin password: "
PASSWORD="$(echo "${PASSWORD_LINE}" | sed -nE 's/.*Generated initial admin password:[[:space:]]+(.*)$/\1/p' | tr -d '\r')"

if [[ -z "${PASSWORD}" ]]; then
  die "Found marker line but failed to extract password: ${PASSWORD_LINE}"
fi

# Write atomically: write to .tmp, chmod, chown, rename.
TMP_FILE="${CREDS_FILE}.tmp.$$"
umask 077
{
  echo "username=admin"
  echo "password=${PASSWORD}"
} > "${TMP_FILE}"
chown "${BRUCE_USER}:${BRUCE_GROUP}" "${TMP_FILE}"
chmod 0600 "${TMP_FILE}"
mv -f "${TMP_FILE}" "${CREDS_FILE}"

log "Captured first-boot admin password to ${CREDS_FILE} (password length=${#PASSWORD})"
log "File: $(stat -c '%a %U:%G' "${CREDS_FILE}") ${CREDS_FILE}"
exit 0
