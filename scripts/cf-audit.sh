#!/usr/bin/env bash
# Phase 216 — Cloudflare audit script.
# Operator runs locally with CF_API_TOKEN + CF_ZONE_ID_LIVINITY_IO set.
# Produces a human summary on stdout + cf-audit-<date>.json archive.
#
# Required env:
#   CF_API_TOKEN              — Bearer token, scopes: Zone.DNS:Read,
#                               Zone.Settings:Read, optionally
#                               Account.SSL and Certificates:Read.
#   CF_ZONE_ID_LIVINITY_IO    — Zone ID for livinity.io.
#
# Optional:
#   CF_ACCOUNT_ID             — Account ID (for cert/SaaS lookups; can be
#                               derived from zone metadata if absent).
#   AUDIT_USER                — username to deep-test (default: bruce).

set -euo pipefail

: "${CF_API_TOKEN:?CF_API_TOKEN env required}"
: "${CF_ZONE_ID_LIVINITY_IO:?CF_ZONE_ID_LIVINITY_IO env required}"

AUDIT_USER="${AUDIT_USER:-bruce}"
ZONE="livinity.io"
OUT_JSON="cf-audit-$(date -u +%Y%m%dT%H%M%SZ).json"

api() {
  local path="$1"
  curl -sS \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4${path}"
}

section() {
  printf '\n\033[1m--- %s ---\033[0m\n' "$1"
}

echo "=== CF audit for ${ZONE} ($(date -u +%FT%TZ)) ==="

section "Zone metadata"
ZONE_META=$(api "/zones/${CF_ZONE_ID_LIVINITY_IO}")
echo "$ZONE_META" | jq '.result | {name, status, paused, type, name_servers}'

DERIVED_ACCOUNT_ID=$(echo "$ZONE_META" | jq -r '.result.account.id // empty')
ACCOUNT_ID="${CF_ACCOUNT_ID:-$DERIVED_ACCOUNT_ID}"
echo "Account: $ACCOUNT_ID"

section "DNS records"
DNS_RECORDS=$(api "/zones/${CF_ZONE_ID_LIVINITY_IO}/dns_records?per_page=200")
echo "$DNS_RECORDS" | jq -r '
  .result[] |
  "\(.type)\t\(.name)\t→\t\(.content)\tproxied=\(.proxied)"
' | column -ts $'\t'

section "Apex Vercel check"
APEX_A=$(echo "$DNS_RECORDS" | jq -r ".result[] | select(.type==\"A\" and .name==\"$ZONE\") | .content")
APEX_AAAA=$(echo "$DNS_RECORDS" | jq -r ".result[] | select(.type==\"AAAA\" and .name==\"$ZONE\") | .content")
WWW_CNAME=$(echo "$DNS_RECORDS" | jq -r ".result[] | select(.type==\"CNAME\" and .name==\"www.$ZONE\") | .content")

echo "apex A:    ${APEX_A:-MISSING}"
echo "apex AAAA: ${APEX_AAAA:-MISSING}"
echo "www CNAME: ${WWW_CNAME:-MISSING}"

case "$APEX_A" in
  "76.76.21.21") echo "✓ apex A matches Vercel" ;;
  "")             echo "✗ apex A MISSING" ;;
  *)              echo "⚠ apex A is $APEX_A (Vercel default is 76.76.21.21 — verify)" ;;
esac

case "$WWW_CNAME" in
  *vercel-dns.com|*vercel-dns.net) echo "✓ www CNAME points at Vercel" ;;
  "")                              echo "✗ www CNAME MISSING" ;;
  *)                               echo "⚠ www CNAME is $WWW_CNAME (Vercel default is cname.vercel-dns.com)" ;;
esac

section "Wildcard subdomain TLS test (${AUDIT_USER}.${ZONE})"
HOST="${AUDIT_USER}.${ZONE}"
if command -v openssl >/dev/null 2>&1; then
  TLS_OUT=$(echo | timeout 10 openssl s_client -connect "${HOST}:443" -servername "${HOST}" 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null || true)
  if [ -n "$TLS_OUT" ]; then
    echo "$TLS_OUT"
  else
    echo "✗ TLS handshake to ${HOST} failed"
  fi
else
  echo "(openssl not installed — skipping TLS test)"
fi

section "HTTP probe (${HOST})"
if command -v curl >/dev/null 2>&1; then
  curl -sI --max-time 10 "https://${HOST}" || echo "✗ probe failed"
fi

section "Custom hostnames (CF for SaaS)"
if [ -n "$ACCOUNT_ID" ]; then
  api "/zones/${CF_ZONE_ID_LIVINITY_IO}/custom_hostnames?per_page=50" \
    | jq -r '.result[]? | "\(.hostname)\t\(.ssl.status // "—")\t\(.status // "—")"' \
    | column -ts $'\t' \
    || echo "(custom_hostnames list failed — token scope?)"
else
  echo "(CF_ACCOUNT_ID unknown — skipping custom_hostnames enumeration)"
fi

section "TXT records (SPF / DMARC / DKIM)"
echo "$DNS_RECORDS" | jq -r '
  .result[] | select(.type=="TXT") |
  "\(.name)\t\(.content)"
' | column -ts $'\t'

section "MX records"
echo "$DNS_RECORDS" | jq -r '
  .result[] | select(.type=="MX") |
  "\(.name)\tprio=\(.priority)\t→ \(.content)"
' | column -ts $'\t'

section "Writing archive"
{
  echo "$ZONE_META" | jq '{kind:"zone_meta", body:.result}'
  echo "$DNS_RECORDS" | jq '{kind:"dns_records", body:.result}'
} | jq -s '.' > "$OUT_JSON"
echo "→ $OUT_JSON"

echo
echo "=== DONE ==="
echo
echo "Next steps (operator):"
echo "  1. Compare apex A/AAAA against Vercel dashboard. Update CF if drifted."
echo "  2. Confirm wildcard handshake succeeds for at least one provisioned user."
echo "  3. Confirm SPF/DMARC/DKIM TXTs are intact (email reputation)."
echo "  4. Record findings in .planning/phases/217-e2e-uat/CF-AUDIT-RESULTS.md."
