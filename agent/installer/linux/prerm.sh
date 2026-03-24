#!/bin/bash
set -e

# Stop and disable service before removal
if systemctl is-active --quiet livinity-agent.service 2>/dev/null; then
    systemctl stop livinity-agent.service || true
fi
if systemctl is-enabled --quiet livinity-agent.service 2>/dev/null; then
    systemctl disable livinity-agent.service || true
fi
systemctl daemon-reload || true
