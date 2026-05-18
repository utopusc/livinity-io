#!/usr/bin/env bash
# Section F autonomous probe — install n8n via tRPC mutation (no browser).
# Runs on Mini PC as root (sudo). Mints a legacy single-user JWT against
# /opt/livos/data/secrets/jwt (shape: {loggedIn:true}, HS256), POSTs
# /trpc/apps.install with appId=n8n, polls until installed, verifies Server5
# row + Caddyfile + Redis.
set +e
LOG=/tmp/uat-144-sec-f.log
exec > "$LOG" 2>&1
echo "=== Section F — n8n install via tRPC mutation ==="
date

JWT_SECRET_FILE=/opt/livos/data/secrets/jwt
if [[ ! -r "$JWT_SECRET_FILE" ]]; then
    echo "FAIL: JWT secret not readable at $JWT_SECRET_FILE (need root)"
    exit 1
fi
JWT_SECRET=$(cat "$JWT_SECRET_FILE" | tr -d '\n')
echo "JWT secret loaded (len=${#JWT_SECRET})"

# Mint HS256 JWT: header.payload.signature (URL-safe base64, no padding)
header_b64=$(printf '{"alg":"HS256","typ":"JWT"}' | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
payload_b64=$(printf '{"loggedIn":true,"iat":%d}' "$(date +%s)" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
unsigned="${header_b64}.${payload_b64}"
signature_b64=$(printf '%s' "$unsigned" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
JWT="${unsigned}.${signature_b64}"
echo "JWT minted (len=${#JWT})"

# Sanity ping: list-store-apps (which is publicProcedure — no auth needed; confirms tRPC reachable)
echo "=== Sanity: tRPC reachable (system.status) ==="
curl -s http://127.0.0.1:8080/trpc/system.status 2>&1 | head -c 200
echo

# Try the install mutation
echo "=== F1: trigger apps.install for n8n ==="
INSTALL_RESP=$(curl -s -X POST "http://127.0.0.1:8080/trpc/apps.install" \
    -H "Content-Type: application/json" \
    -H "Cookie: LIVINITY_SESSION=${JWT}" \
    -d '{"json":{"appId":"n8n"}}')
echo "$INSTALL_RESP" | head -c 1500
echo

# If install accepted, poll for completion via getInstalledApps
echo "=== F1b: poll apps.getInstalledApps for n8n appearance ==="
for i in {1..60}; do
    sleep 5
    STATE=$(curl -s -X POST "http://127.0.0.1:8080/trpc/apps.getInstalledApps" \
        -H "Content-Type: application/json" \
        -H "Cookie: LIVINITY_SESSION=${JWT}" \
        -d '{"json":null}' 2>/dev/null)
    # n8n appearing in installed list = install succeeded
    if echo "$STATE" | grep -qE '"appId":"n8n"|"id":"n8n"|"n8n".*"installed"|n8n.*running'; then
        echo "F1 OK: n8n appears in installed list after $((i*5))s"
        break
    fi
    if [[ $i -eq 60 ]]; then
        echo "FAIL: n8n install timeout after 300s — last 400 chars of state:"
        echo "$STATE" | head -c 400
    fi
done

echo
echo "=== F2 — Server5 user_app_subdomains row ==="
# (this runs ON Mini PC; Server5 query is separate — Mini PC can't query Server5 PG directly)
echo "  (Server5 query deferred — must run from Windows side)"

echo
echo "=== F3 — Caddyfile carries n8n-socinity host ==="
grep -n "n8n" /etc/caddy/Caddyfile | head -10 2>&1 || echo "  no n8n in Caddyfile yet"

echo
echo "=== F4 — Redis subdomains.host populated ==="
REDIS_PASS=$(grep -oP 'REDIS_URL=redis://[^:]*:\K[^@]+' /opt/livos/.env | head -1)
redis-cli -a "$REDIS_PASS" --no-auth-warning get livos:domain:subdomains | head -c 800
echo

echo
echo "=== F5 — public URL hit ==="
curl -s -o /dev/null -w "  n8n-socinity %{http_code}\n" --max-time 10 https://n8n-socinity.livinity.io

echo
echo "=== DONE ==="
date
