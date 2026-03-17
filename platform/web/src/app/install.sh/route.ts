import { NextResponse } from 'next/server';

const INSTALL_SCRIPT = `#!/bin/bash
set -euo pipefail

# Livinity LivOS Installer
# Usage: curl -sSL https://livinity.io/install.sh | sudo bash
# With API key: curl -sSL https://livinity.io/install.sh | sudo bash -s -- --api-key YOUR_KEY

BOLD="\\033[1m"
GREEN="\\033[0;32m"
YELLOW="\\033[0;33m"
RED="\\033[0;31m"
NC="\\033[0m"

API_KEY=""

# Parse arguments
while [[ \$# -gt 0 ]]; do
  case \$1 in
    --api-key) API_KEY="\$2"; shift 2 ;;
    *) echo -e "\${RED}Unknown option: \$1\${NC}"; exit 1 ;;
  esac
done

echo -e "\${BOLD}Livinity LivOS Installer\${NC}"
echo ""

# Check root
if [ "\$(id -u)" -ne 0 ]; then
  echo -e "\${RED}Error: This script must be run as root (use sudo)\${NC}"
  exit 1
fi

# Check OS
if [ ! -f /etc/os-release ]; then
  echo -e "\${RED}Error: Cannot detect OS. LivOS requires Ubuntu 22.04+\${NC}"
  exit 1
fi

. /etc/os-release
if [ "\$ID" != "ubuntu" ] && [ "\$ID" != "debian" ]; then
  echo -e "\${YELLOW}Warning: LivOS is designed for Ubuntu. Your OS (\$ID) may have issues.\${NC}"
fi

echo -e "\${GREEN}[1/5]\${NC} Installing dependencies..."
apt-get update -qq
apt-get install -y -qq curl wget git jq > /dev/null 2>&1

echo -e "\${GREEN}[2/5]\${NC} Installing Node.js 22..."
if ! command -v node &> /dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
fi
echo "  Node.js \$(node -v)"

echo -e "\${GREEN}[3/5]\${NC} Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh > /dev/null 2>&1
fi
echo "  Docker \$(docker --version | cut -d' ' -f3 | tr -d ',')"

echo -e "\${GREEN}[4/5]\${NC} Installing LivOS..."
if [ ! -d /opt/livos ]; then
  git clone --depth 1 https://github.com/livinity/livos.git /opt/livos > /dev/null 2>&1 || {
    echo -e "\${YELLOW}  Clone failed — creating directory for manual setup\${NC}"
    mkdir -p /opt/livos
  }
fi

echo -e "\${GREEN}[5/5]\${NC} Configuring..."
if [ -n "\$API_KEY" ]; then
  # Install Redis if not present (needed for tunnel client)
  if ! command -v redis-cli &> /dev/null; then
    apt-get install -y -qq redis-server > /dev/null 2>&1
    systemctl enable redis-server > /dev/null 2>&1
    systemctl start redis-server > /dev/null 2>&1
  fi

  # Set API key for tunnel client
  redis-cli SET livos:platform:api_key "\$API_KEY" > /dev/null 2>&1
  redis-cli SET livos:platform:enabled "1" > /dev/null 2>&1
  echo -e "  \${GREEN}API key configured — your server will connect to Livinity automatically\${NC}"
fi

echo ""
echo -e "\${BOLD}\${GREEN}Installation complete!\${NC}"
echo ""
if [ -n "\$API_KEY" ]; then
  echo "  Your server will be accessible at your livinity.io subdomain"
  echo "  once LivOS starts and connects to the relay."
else
  echo "  To connect to Livinity, run:"
  echo "    redis-cli SET livos:platform:api_key YOUR_API_KEY"
  echo ""
  echo "  Get your API key at: https://livinity.io/dashboard"
fi
echo ""
`;

export async function GET() {
  return new NextResponse(INSTALL_SCRIPT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
