#!/bin/bash
cd /opt/livos
JWT_SECRET=$(cat /opt/livos/data/secrets/jwt)

# Use node_modules from livinityd which has jsonwebtoken
TOKEN=$(node -e "
  const path = require('path');
  const jwt = require(path.join('/opt/livos/node_modules/.pnpm/jsonwebtoken@9.0.2/node_modules/jsonwebtoken'));
  console.log(jwt.sign({loggedIn:true}, '$JWT_SECRET', {algorithm:'HS256'}));
" 2>&1)

if [[ "$TOKEN" == *"Error"* ]]; then
  # Try finding it differently
  JWF=$(find /opt/livos/node_modules -path '*/jsonwebtoken/index.js' -not -path '*.pnpm*' | head -1)
  if [[ -n "$JWF" ]]; then
    TOKEN=$(node -e "const jwt=require('$(dirname $JWF)'); console.log(jwt.sign({loggedIn:true}, '$JWT_SECRET', {algorithm:'HS256'}))")
  else
    echo "Cannot find jsonwebtoken, trying with pnpm"
    TOKEN=$(cd /opt/livos && npx -y jsonwebtoken 2>/dev/null || echo "FAIL")
  fi
fi

echo "Token: ${TOKEN:0:30}..."
echo "Installing n8n..."
RESULT=$(curl -s --max-time 60 -X POST http://localhost:8080/trpc/apps.install \
  -H 'Content-Type: application/json' \
  -H "Cookie: token=$TOKEN" \
  -d '{"json":{"id":"n8n"}}' 2>&1)
echo "Result: $RESULT"
echo "Waiting 15s for container..."
sleep 15
echo "=== DOCKER ==="
docker ps -a --format '{{.Names}} {{.Status}}' | grep n8n
echo "=== PERMISSIONS ==="
ls -la /opt/livos/data/app-data/n8n/data/ 2>/dev/null || echo "no data dir"
echo "=== N8N LOG ==="
docker logs n8n_server_1 --tail 5 2>&1
