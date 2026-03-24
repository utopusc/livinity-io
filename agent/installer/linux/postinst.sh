#!/bin/bash
set -e

# Detect the installing user (not root)
INSTALL_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"
INSTALL_HOME=$(eval echo "~$INSTALL_USER")

SERVICE_FILE="/etc/systemd/system/livinity-agent.service"

# Replace user placeholder in service file
if [ -f "$SERVICE_FILE" ]; then
    sed -i "s/__USER__/$INSTALL_USER/g" "$SERVICE_FILE"
    sed -i "s|/home/__USER__|$INSTALL_HOME|g" "$SERVICE_FILE"
fi

# Create credentials directory
mkdir -p "$INSTALL_HOME/.livinity"
chown "$INSTALL_USER:$INSTALL_USER" "$INSTALL_HOME/.livinity"

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable livinity-agent.service
systemctl start livinity-agent.service || true

echo ""
echo "Livinity Agent installed successfully!"
echo "  Binary: /usr/local/bin/livinity-agent"
echo "  Service: livinity-agent.service (running as $INSTALL_USER)"
echo "  Config: $INSTALL_HOME/.livinity/"
echo ""
echo "The agent will start automatically on boot."
echo "Run 'livinity-agent status' to check connection status."
