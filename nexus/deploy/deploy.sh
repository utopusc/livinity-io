#!/bin/bash
# Deploy Nexus to Server 4
# Run from local machine: bash deploy/deploy.sh

set -e

SERVER="server4"
SSH_CONFIG="C:/Users/hello/Desktop/Projects/contabo/ssh/config"
LOCAL_DIR="C:/Users/hello/Desktop/Projects/contabo/livinity-io/nexus"
REMOTE_DIR="/opt/nexus/app"

echo "=== Deploying Nexus to $SERVER ==="

# 1. Sync project files
echo "[1/6] Syncing files..."
ssh -F "$SSH_CONFIG" $SERVER "mkdir -p $REMOTE_DIR $REMOTE_DIR/skills"
scp -F "$SSH_CONFIG" -r "$LOCAL_DIR/packages" "$SERVER:$REMOTE_DIR/"
scp -F "$SSH_CONFIG" -r "$LOCAL_DIR/skills" "$SERVER:$REMOTE_DIR/"
scp -F "$SSH_CONFIG" "$LOCAL_DIR/package.json" "$SERVER:$REMOTE_DIR/"
scp -F "$SSH_CONFIG" "$LOCAL_DIR/tsconfig.base.json" "$SERVER:$REMOTE_DIR/"
scp -F "$SSH_CONFIG" "$LOCAL_DIR/setup.ts" "$SERVER:$REMOTE_DIR/" 2>/dev/null || true
scp -F "$SSH_CONFIG" "$LOCAL_DIR/deploy/ecosystem.config.cjs" "$SERVER:$REMOTE_DIR/"
scp -F "$SSH_CONFIG" "$LOCAL_DIR/deploy/docker-compose.yml" "$SERVER:$REMOTE_DIR/"
echo "  Files synced."

# 2. Install dependencies
echo "[2/6] Installing dependencies..."
ssh -F "$SSH_CONFIG" $SERVER "cd $REMOTE_DIR && npm install --production=false"
echo "  Dependencies installed."

# 3. Build TypeScript
echo "[3/6] Building..."
ssh -F "$SSH_CONFIG" $SERVER "cd $REMOTE_DIR && npm run build"
echo "  Build complete."

# 4. Setup .env if not exists
echo "[4/6] Checking .env..."
ssh -F "$SSH_CONFIG" $SERVER "test -f $REMOTE_DIR/.env && echo '  .env exists' || echo '  WARNING: No .env file! Create one.'"

# 5. Restart PM2 services
echo "[5/6] Restarting services..."
ssh -F "$SSH_CONFIG" $SERVER "cd $REMOTE_DIR && pm2 reload ecosystem.config.cjs && pm2 save"
echo "  Services restarted."

# 6. Docker containers
echo "[6/6] Ensuring Docker containers..."
ssh -F "$SSH_CONFIG" $SERVER "cd $REMOTE_DIR && docker compose up -d"
echo "  Docker containers running."

echo ""
echo "=== Deployment Complete ==="
echo "MCP Server: http://45.137.194.103:3100/mcp"
echo "API:        http://45.137.194.103:3200/api/health"
echo "Memory:     http://45.137.194.103:3300/health"
echo ""

# Quick health check
echo "=== Post-deploy Health ==="
sleep 3
ssh -F "$SSH_CONFIG" $SERVER "pm2 list --no-header 2>/dev/null | head -10"
echo ""
