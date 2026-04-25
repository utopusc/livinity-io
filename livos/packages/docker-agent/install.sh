#!/bin/bash
# LivOS Docker Agent installer (Phase 22 MH-04).
#
# Usage:
#   curl -fsSL https://livinity.cloud/install-agent.sh | bash -s -- \
#     --token <T> --server wss://livinity.cloud/agent/connect
#
# Installs the agent to /opt/livos-docker-agent and starts a systemd service
# `livos-docker-agent.service` that holds the persistent WS to livinityd.

set -euo pipefail

TOKEN=""
SERVER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)  TOKEN="$2";  shift 2 ;;
    --server) SERVER="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: install.sh --token <T> --server <wss://...>"
      exit 0 ;;
    *)
      echo "Unknown arg: $1"
      echo "Usage: install.sh --token <T> --server <wss://...>"
      exit 1 ;;
  esac
done

if [[ -z "$TOKEN" || -z "$SERVER" ]]; then
  echo "Both --token and --server are required."
  echo "Usage: install.sh --token <T> --server <wss://...>"
  exit 1
fi

INSTALL_DIR="/opt/livos-docker-agent"
BINARY_URL="https://livinity.cloud/agent/livos-docker-agent.tar.gz"

# Require root
if [[ $EUID -ne 0 ]]; then
  echo "This installer must run as root (use sudo)."
  exit 1
fi

# Require Node.js 20+
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required but not installed. Get it from https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node.js 20+ required (you have $(node -v)). Please upgrade."
  exit 1
fi

# Require Docker access
if ! docker info >/dev/null 2>&1; then
  echo "Cannot access Docker daemon at /var/run/docker.sock."
  echo "Make sure Docker is installed and this user is in the 'docker' group (or run as root)."
  exit 1
fi

mkdir -p "$INSTALL_DIR"

echo "Downloading agent binary tarball from $BINARY_URL ..."
curl -fsSL "$BINARY_URL" -o /tmp/livos-docker-agent.tar.gz
tar -xzf /tmp/livos-docker-agent.tar.gz -C "$INSTALL_DIR"
rm -f /tmp/livos-docker-agent.tar.gz

# Install dependencies if package.json + node_modules don't exist yet
if [[ -f "$INSTALL_DIR/package.json" && ! -d "$INSTALL_DIR/node_modules" ]]; then
  echo "Installing agent dependencies (npm install --omit=dev) ..."
  (cd "$INSTALL_DIR" && npm install --omit=dev)
fi

# Write systemd unit
UNIT_PATH="/etc/systemd/system/livos-docker-agent.service"
cat > "$UNIT_PATH" <<EOF
[Unit]
Description=LivOS Docker Agent — outbound WS proxy to livinityd
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
Environment="LIVOS_AGENT_TOKEN=$TOKEN"
Environment="LIVOS_AGENT_SERVER=$SERVER"
ExecStart=/usr/bin/env node $INSTALL_DIR/dist/index.js
Restart=always
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now livos-docker-agent.service

echo ""
echo "LivOS Docker Agent installed and started."
echo "  Status: systemctl status livos-docker-agent"
echo "  Logs:   journalctl -u livos-docker-agent -f"
echo ""
echo "If the agent fails to authenticate (auth code 4401 in logs), the token"
echo "is invalid or has been revoked. Generate a new one in Settings > Environments."
