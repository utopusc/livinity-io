#!/bin/bash
set -euo pipefail

# LivOS Native Chrome Browser Setup
# Installs Google Chrome stable, Xvfb, x11vnc, websockify, and noVNC
# Creates a systemd service for on-demand Chrome streaming via noVNC

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root"
  exit 1
fi

echo "=== LivOS Native Chrome Setup ==="
echo ""

# 1. Install Google Chrome stable
echo "[1/6] Installing Google Chrome stable..."
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt-get update -qq
apt-get install -y google-chrome-stable
echo "  Chrome version: $(google-chrome-stable --version)"

# 2. Install streaming dependencies
echo "[2/6] Installing Xvfb, x11vnc, websockify..."
apt-get install -y xvfb x11vnc websockify

# 3. Install noVNC (web client)
echo "[3/6] Installing noVNC v1.4.0..."
mkdir -p /opt/noVNC
wget -qO- https://github.com/novnc/noVNC/archive/refs/tags/v1.4.0.tar.gz | tar xz --strip-components=1 -C /opt/noVNC
ln -sf /opt/noVNC/vnc.html /opt/noVNC/index.html
echo "  noVNC installed at /opt/noVNC"

# 4. Create Chrome data directory for persistent sessions
echo "[4/6] Creating Chrome data directory..."
mkdir -p /opt/livos/data/chrome-profile

# 5. Create systemd service
echo "[5/6] Creating systemd service livos-chrome.service..."
cat > /etc/systemd/system/livos-chrome.service << 'UNIT'
[Unit]
Description=LivOS Chrome Browser Stream
After=network.target

[Service]
Type=forking
Environment=DISPLAY=:99
Environment=CHROME_DATA_DIR=/opt/livos/data/chrome-profile

ExecStartPre=/bin/bash -c 'Xvfb :99 -screen 0 1920x1080x24 -ac &'

ExecStart=/bin/bash -c '\
  sleep 1 && \
  google-chrome-stable \
    --no-sandbox \
    --disable-gpu \
    --disable-dev-shm-usage \
    --no-first-run \
    --start-maximized \
    --remote-debugging-port=9222 \
    --remote-debugging-address=127.0.0.1 \
    --user-data-dir=${CHROME_DATA_DIR} \
    --display=:99 & \
  sleep 2 && \
  x11vnc -display :99 -nopw -listen 127.0.0.1 -xkb -ncache 10 -forever -bg -rfbport 5900 && \
  websockify --daemon --web /opt/noVNC 6080 127.0.0.1:5900'

ExecStop=/bin/bash -c '\
  pkill -f "websockify.*6080" || true; \
  pkill -f "x11vnc.*:99" || true; \
  pkill -f "google-chrome.*display.*:99" || true; \
  pkill -f "Xvfb.*:99" || true'

Restart=no
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT

# 6. Reload systemd (do NOT start — on-demand only)
echo "[6/6] Reloading systemd daemon..."
systemctl daemon-reload

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Chrome native streaming is ready. It will be started on-demand by LivOS."
echo ""
echo "  Service:    livos-chrome.service"
echo "  noVNC port: 6080 (websocket)"
echo "  VNC port:   5900 (localhost only)"
echo "  Display:    :99"
echo "  Profile:    /opt/livos/data/chrome-profile"
echo ""
echo "Manual commands:"
echo "  Start:  systemctl start livos-chrome"
echo "  Stop:   systemctl stop livos-chrome"
echo "  Status: systemctl status livos-chrome"
