#!/bin/bash
# Deploy ui-next to server4 (livinity.cloud)
# Usage: bash scripts/deploy.sh

set -e

SERVER="root@45.137.194.103"
SSH_KEY="C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master"
SSH="/c/Windows/System32/OpenSSH/ssh.exe -i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
SCP="/c/Windows/System32/OpenSSH/scp.exe -i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
REMOTE_DIR="/opt/livos/livos/packages/ui-next"

echo "==> Building ui-next..."
cd "$(dirname "$0")/.."
npx next build

echo "==> Deploying to server4..."

# 1. Git pull on server (gets source + config)
$SSH $SERVER "cd /opt/livos && git pull origin master" 2>&1

# 2. Install dependencies on server
$SSH $SERVER "cd /opt/livos/livos && source /root/.profile && pnpm install --filter ui-next" 2>&1

# 3. Build on server
$SSH $SERVER "cd $REMOTE_DIR && source /root/.profile && npx next build" 2>&1

# 4. Copy static files for standalone
$SSH $SERVER "cp -r $REMOTE_DIR/public $REMOTE_DIR/.next/standalone/packages/ui-next/public 2>/dev/null || true" 2>&1
$SSH $SERVER "cp -r $REMOTE_DIR/.next/static $REMOTE_DIR/.next/standalone/packages/ui-next/.next/static 2>/dev/null || true" 2>&1

# 5. Set LIVINITY_UI_PROXY for livinityd
$SSH $SERVER "grep -q LIVINITY_UI_PROXY /opt/livos/livos/.env 2>/dev/null || echo 'LIVINITY_UI_PROXY=http://localhost:3001' >> /opt/livos/livos/.env" 2>&1

# 6. Start/restart ui-next with PM2
$SSH $SERVER "cd $REMOTE_DIR && source /root/.profile && pm2 delete ui-next 2>/dev/null; PORT=3001 HOSTNAME=0.0.0.0 NODE_ENV=production pm2 start .next/standalone/packages/ui-next/server.js --name ui-next && pm2 save" 2>&1

# 7. Restart livinityd to pick up LIVINITY_UI_PROXY
$SSH $SERVER "source /root/.profile && pm2 restart livos" 2>&1

echo "==> Done! ui-next deployed to livinity.cloud"
echo "==> Check: https://livinity.cloud"
