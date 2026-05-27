#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Target credential file: /etc/livos/liv-assistant-credentials (mode 0600, owner bruce:bruce)
CREDS_DIR="/etc/livos"
CREDS_FILE="${CREDS_DIR}/liv-assistant-credentials"
SERVICE="liv-assistant"
BRUCE_USER="bruce"
BRUCE_GROUP="bruce"

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
