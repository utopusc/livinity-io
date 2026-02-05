#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────
# LivOS — One-command installer
# curl -sSL https://raw.githubusercontent.com/utopusc/livos/main/setup.sh | bash
# ──────────────────────────────────────────────────────────

LIVOS_DIR="/opt/livos"
LIV_DIR="$LIVOS_DIR/packages/liv"
REPO_URL="https://github.com/utopusc/livos.git"

# ── Colors ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }
step()  { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ── 1. Pre-flight ─────────────────────────────────────────
step "Pre-flight checks"

if [[ $EUID -ne 0 ]]; then
  fail "This script must be run as root (sudo)"
fi

if ! grep -qiE 'ubuntu|debian' /etc/os-release 2>/dev/null; then
  warn "This script is tested on Ubuntu/Debian. Continuing anyway..."
fi

info "OS: $(. /etc/os-release && echo "$PRETTY_NAME")"
info "Arch: $(uname -m)"
ok "Pre-flight passed"

# ── 2. System dependencies ───────────────────────────────
step "Installing system dependencies"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# Node.js 22
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 22 ]]; then
  info "Installing Node.js 22..."
  if ! command -v curl &>/dev/null; then apt-get install -y -qq curl; fi
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
  ok "Node.js $(node -v) installed"
else
  ok "Node.js $(node -v) already installed"
fi

# pnpm
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm
  ok "pnpm installed"
else
  ok "pnpm already installed"
fi

# PM2
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2
  ok "PM2 installed"
else
  ok "PM2 already installed"
fi

# Redis
if ! command -v redis-server &>/dev/null; then
  info "Installing Redis..."
  apt-get install -y -qq redis-server
  systemctl enable redis-server
  ok "Redis installed"
else
  ok "Redis already installed"
fi

# Docker
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  ok "Docker installed"
else
  ok "Docker already installed"
fi

# Python 3.11+
if ! command -v python3 &>/dev/null; then
  info "Installing Python 3..."
  apt-get install -y -qq python3 python3-pip python3-venv
  ok "Python3 installed"
else
  ok "Python3 $(python3 --version) already installed"
fi

# Build essentials (for native modules)
apt-get install -y -qq build-essential git

ok "All system dependencies ready"

# ── 3. Clone / update repo ───────────────────────────────
step "Setting up repository"

if [[ -d "$LIVOS_DIR/.git" ]]; then
  info "Repository exists, pulling latest..."
  cd "$LIVOS_DIR"
  git pull --ff-only || warn "Git pull failed, continuing with existing code"
  ok "Repository updated"
else
  info "Cloning repository..."
  git clone "$REPO_URL" "$LIVOS_DIR" 2>/dev/null || {
    if [[ -d "$LIVOS_DIR" ]]; then
      warn "Directory exists but no git repo — skipping clone"
    else
      fail "Failed to clone repository"
    fi
  }
  ok "Repository ready"
fi

cd "$LIVOS_DIR"

# ── 4. Install dependencies ─────────────────────────────
step "Installing dependencies"

# LivOS (pnpm workspaces)
info "Installing LivOS dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "LivOS dependencies installed"

# Liv (npm workspaces — separate from pnpm)
if [[ -d "$LIV_DIR" ]]; then
  info "Installing Liv dependencies..."
  cd "$LIV_DIR"
  npm install --production=false
  cd "$LIVOS_DIR"
  ok "Liv dependencies installed"
fi

# Python memory service venv
MEMORY_DIR="$LIV_DIR/packages/memory"
if [[ -f "$MEMORY_DIR/src/requirements.txt" ]]; then
  info "Setting up Python venv for memory service..."
  if [[ ! -d "$MEMORY_DIR/venv" ]]; then
    python3 -m venv "$MEMORY_DIR/venv"
  fi
  "$MEMORY_DIR/venv/bin/pip" install -q -r "$MEMORY_DIR/src/requirements.txt"
  ok "Python venv ready"
fi

# ── 5. Build ─────────────────────────────────────────────
step "Building projects"

# Build liv TypeScript packages
if [[ -d "$LIV_DIR" ]]; then
  info "Building Liv..."
  cd "$LIV_DIR"
  npm run build
  cd "$LIVOS_DIR"
  ok "Liv built"
fi

# ── 6. Generate credentials ─────────────────────────────
step "Configuring environment"

if [[ ! -f "$LIVOS_DIR/.env" ]]; then
  info "Generating .env with fresh credentials..."

  REDIS_PASS=$(openssl rand -hex 24)
  JWT_SECRET=$(openssl rand -hex 32)
  LIV_KEY=$(openssl rand -hex 32)

  cat > "$LIVOS_DIR/.env" << ENVFILE
# === AI API Keys ===
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# === Database ===
REDIS_URL=redis://:${REDIS_PASS}@localhost:6379
DATABASE_URL=postgresql://liv:liv@localhost:5432/livos

# === Security ===
JWT_SECRET=${JWT_SECRET}
LIV_API_KEY=${LIV_KEY}

# === Liv ===
LIV_API_URL=http://localhost:3200
DAEMON_INTERVAL_MS=30000
DEFAULT_MODEL=gemini-2.0-flash

# === Server Ports ===
MCP_PORT=3100
API_PORT=3200
MEMORY_PORT=3300
ENVFILE

  ok ".env generated with unique secrets"
else
  ok ".env already exists — preserving"
fi

chmod 600 "$LIVOS_DIR/.env"

# Ensure liv .env symlink
if [[ -d "$LIV_DIR" ]] && [[ ! -L "$LIV_DIR/.env" ]]; then
  ln -sf ../../.env "$LIV_DIR/.env"
  ok "Liv .env symlinked"
fi

# ── 7. Configure Redis ──────────────────────────────────
step "Configuring Redis"

# Extract Redis password from REDIS_URL
REDIS_PASS=$(grep '^REDIS_URL=' "$LIVOS_DIR/.env" | sed 's|.*://:\([^@]*\)@.*|\1|')

if [[ -n "$REDIS_PASS" ]]; then
  REDIS_CONF="/etc/redis/redis.conf"
  if [[ -f "$REDIS_CONF" ]]; then
    # Set password
    if grep -q '^requirepass' "$REDIS_CONF"; then
      sed -i "s|^requirepass.*|requirepass $REDIS_PASS|" "$REDIS_CONF"
    else
      echo "requirepass $REDIS_PASS" >> "$REDIS_CONF"
    fi

    # Enable AOF persistence
    if grep -q '^appendonly' "$REDIS_CONF"; then
      sed -i 's|^appendonly.*|appendonly yes|' "$REDIS_CONF"
    else
      echo 'appendonly yes' >> "$REDIS_CONF"
    fi

    systemctl restart redis-server
    ok "Redis configured with password + AOF"
  else
    warn "Redis config not found at $REDIS_CONF"
  fi
else
  warn "Could not extract Redis password from .env"
fi

# ── 8. Create directories ───────────────────────────────
step "Setting up directories"

mkdir -p "$LIVOS_DIR/logs"
mkdir -p "$LIVOS_DIR/data"

ok "Directories ready"

# ── 9. PM2 start ─────────────────────────────────────────
step "Starting services with PM2"

cd "$LIVOS_DIR"

# Source .env for PM2 processes
set -a
source "$LIVOS_DIR/.env"
set +a

pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.cjs --env production
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u root --hp /root 2>/dev/null || true

ok "All services started"

# ── 10. Firewall ─────────────────────────────────────────
step "Configuring firewall"

if command -v ufw &>/dev/null; then
  ufw --force enable 2>/dev/null || true
  ufw allow 22/tcp   2>/dev/null || true
  ufw allow 8080/tcp 2>/dev/null || true
  ufw default deny incoming 2>/dev/null || true
  ufw reload 2>/dev/null || true
  ok "UFW: SSH(22) + LivOS(8080) allowed, rest denied"
else
  warn "UFW not found — skipping firewall config"
fi

# ── 11. Banner ────────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  LivOS installed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  UI:        ${CYAN}http://${SERVER_IP}:8080${NC}"
echo -e "  Liv API: ${CYAN}http://${SERVER_IP}:3200${NC} (internal)"
echo -e "  MCP:       ${CYAN}http://${SERVER_IP}:3100${NC} (internal)"
echo ""
echo -e "  ${YELLOW}Next step:${NC} Open Settings > AI Configuration"
echo -e "  and set your Gemini API key from the browser."
echo ""
echo -e "  pm2 list     — view services"
echo -e "  pm2 logs     — view logs"
echo -e "  pm2 monit    — monitoring dashboard"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
