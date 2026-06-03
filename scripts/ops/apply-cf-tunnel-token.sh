#!/usr/bin/env bash
# apply-cf-tunnel-token.sh — safely swap this device's Cloudflare Tunnel token.
#
# Rotating a tunnel = new secret on the SAME tunnel ID (DNS unchanged), so the
# device's hostnames keep working and the OLD (e.g. leaked) token stops working.
# This script ONLY applies a NEW token to the local cloudflared systemd unit; the
# rotation itself (generating the new token) is a Cloudflare-account operation —
# see docs/security/cloudflare-tunnel-rotation-runbook.md (Runbook A).
#
# Usage:  sudo bash apply-cf-tunnel-token.sh "<NEW_TUNNEL_TOKEN>"
# Safe:   backs up the unit, verifies the tunnel reconnects, auto-rolls-back on failure.
set -euo pipefail

NEW_TOKEN="${1:-}"
UNIT="/etc/systemd/system/cloudflared.service"
VERIFY_HOST="${LIVOS_VERIFY_HOST:-}"   # optional: e.g. bruce.livinity.io for an external 200 check

err() { echo "[apply-cf-token] ERROR: $*" >&2; exit 1; }
log() { echo "[apply-cf-token] $*"; }

[ -n "$NEW_TOKEN" ] || err "no token given. Usage: sudo bash $0 \"<NEW_TUNNEL_TOKEN>\""
[ "$(id -u)" = "0" ] || err "must run as root (sudo)."
[ -f "$UNIT" ] || err "cloudflared unit not found at $UNIT"
# Cloudflare tunnel tokens are base64 of {"a":...,"t":...,"s":...} → start with eyJhIjoi
echo "$NEW_TOKEN" | grep -qE '^eyJhIjoi[A-Za-z0-9+/=_-]+$' || err "that does not look like a CF tunnel token (expected eyJhIjoi…)."

# Decode tunnel ID for the log (no secret printed)
TID=$(echo "$NEW_TOKEN" | sed 's/-/+/g; s/_/\//g' | base64 -d 2>/dev/null | sed -nE 's/.*"t":"([0-9a-f-]+)".*/\1/p' || true)
log "new token tunnelID: ${TID:-<unparsed>}"

BACKUP="${UNIT}.bak.$(cat /proc/sys/kernel/random/uuid 2>/dev/null | cut -c1-8)"
cp -a "$UNIT" "$BACKUP"
log "backed up unit → $BACKUP"

# Replace the --token value on the ExecStart line (token is the last arg).
# Match `--token <anything>` up to end-of-line and substitute.
sed -i -E "s|(--token )([A-Za-z0-9+/=_-]+)|\1${NEW_TOKEN}|" "$UNIT"
grep -qF "$NEW_TOKEN" "$UNIT" || { cp -a "$BACKUP" "$UNIT"; err "token substitution failed — unit restored, no change made."; }
log "unit ExecStart updated."

systemctl daemon-reload
systemctl restart cloudflared
log "cloudflared restarted; waiting for a healthy connector registration…"

OK=""
for i in $(seq 1 20); do
  if journalctl -u cloudflared --since "30 seconds ago" --no-pager 2>/dev/null \
       | grep -qiE "Registered tunnel connection|Connection .* registered|connected to"; then
    OK=1; break
  fi
  sleep 3
done

if [ -z "$OK" ]; then
  log "connector did NOT register within ~60s — ROLLING BACK."
  cp -a "$BACKUP" "$UNIT"
  systemctl daemon-reload
  systemctl restart cloudflared
  err "rollback complete (old token restored). Check the new token + 'journalctl -u cloudflared'."
fi
log "connector registered ✓"

if [ -n "$VERIFY_HOST" ]; then
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://${VERIFY_HOST}/" 2>/dev/null || echo 000)
  log "external check https://${VERIFY_HOST}/ → HTTP ${CODE}"
  [ "$CODE" = "200" ] || [ "$CODE" = "302" ] || log "WARN: unexpected status ${CODE} — verify manually (tunnel up, but app/login may differ)."
fi

log "DONE. The OLD token is now dead. Keep $BACKUP until you've confirmed everything, then delete it."
