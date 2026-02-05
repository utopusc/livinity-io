#!/bin/bash
# Nexus - Server 4 Setup Script
# Run: bash setup-server4.sh

set -e

echo "=== Nexus Server Setup ==="
echo "Server: $(hostname) ($(hostname -I | awk '{print $1}'))"
echo ""

# 1. Create directories
echo "[1/8] Creating directories..."
mkdir -p /opt/nexus/logs
mkdir -p /opt/nexus/whatsapp-auth
mkdir -p /opt/nexus/data

# 2. Install Redis
echo "[2/8] Installing Redis..."
if ! command -v redis-server &> /dev/null; then
    apt-get update -qq
    apt-get install -y -qq redis-server
    # Configure Redis
    sed -i 's/^# requirepass .*/requirepass NexusRedis2024!/' /etc/redis/redis.conf
    sed -i 's/^requirepass .*/requirepass NexusRedis2024!/' /etc/redis/redis.conf
    sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf
    systemctl enable redis-server
    systemctl restart redis-server
    echo "  Redis installed and configured."
else
    echo "  Redis already installed."
fi

# 3. Install PostgreSQL
echo "[3/8] Installing PostgreSQL..."
if ! command -v psql &> /dev/null; then
    apt-get install -y -qq postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql

    # Create database and user
    sudo -u postgres psql -c "CREATE USER nexus WITH PASSWORD 'NexusDB2024!';" 2>/dev/null || echo "  User exists."
    sudo -u postgres psql -c "CREATE DATABASE nexus OWNER nexus;" 2>/dev/null || echo "  Database exists."
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE nexus TO nexus;" 2>/dev/null || true
    echo "  PostgreSQL installed and configured."
else
    echo "  PostgreSQL already installed."
fi

# 4. Install PM2
echo "[4/8] Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    pm2 startup systemd -u root --hp /root 2>/dev/null || true
    echo "  PM2 installed."
else
    echo "  PM2 already installed."
fi

# 5. Install Python + Cognee
echo "[5/8] Setting up Python + Cognee..."
apt-get install -y -qq python3 python3-pip python3-venv 2>/dev/null || true
if [ ! -d "/opt/nexus/venv" ]; then
    python3 -m venv /opt/nexus/venv
    /opt/nexus/venv/bin/pip install cognee fastapi uvicorn pydantic
    echo "  Python venv + Cognee installed."
else
    echo "  Python venv already exists."
fi

# 6. Install git
echo "[6/8] Installing git..."
apt-get install -y -qq git 2>/dev/null || true
echo "  Git ready."

# 7. Pull Docker images
echo "[7/8] Pulling Docker images..."
docker pull mcr.microsoft.com/playwright:v1.49.1-noble 2>/dev/null &
docker pull ghcr.io/devflowinc/firecrawl-simple:latest 2>/dev/null &
docker pull redis:7-alpine 2>/dev/null &
wait
echo "  Docker images pulled."

# 8. Verify
echo ""
echo "=== Verification ==="
echo "Redis:      $(redis-cli -a NexusRedis2024! ping 2>/dev/null || echo 'FAILED')"
echo "PostgreSQL: $(sudo -u postgres psql -c 'SELECT version();' -t 2>/dev/null | head -1 | xargs || echo 'FAILED')"
echo "PM2:        $(pm2 --version 2>/dev/null || echo 'FAILED')"
echo "Python:     $(python3 --version 2>/dev/null || echo 'FAILED')"
echo "Node.js:    $(node --version 2>/dev/null || echo 'FAILED')"
echo "Docker:     $(docker --version 2>/dev/null || echo 'FAILED')"
echo "Disk:       $(df -h / | tail -1 | awk '{print $4 " free"}')"
echo ""
echo "=== Setup Complete ==="
