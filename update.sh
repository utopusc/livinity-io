#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# LivOS Safe Update Script
# Updates code, UI, and services WITHOUT touching user data
# Usage: bash update.sh
# ──────────────────────────────────────────────────────────

set -euo pipefail

# ── Constants ─────────────────────────────────────────────
LIVOS_DIR="/opt/livos"
NEXUS_DIR="/opt/nexus"
REPO_URL="https://github.com/utopusc/livinity-io.git"

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

# ── Pre-flight checks ────────────────────────────────────
step "Pre-flight checks"

if [[ $EUID -ne 0 ]]; then
    fail "Must run as root"
fi

if [[ ! -d "$LIVOS_DIR" ]]; then
    fail "LivOS not installed at $LIVOS_DIR - run install.sh first"
fi

if [[ ! -f "$LIVOS_DIR/.env" ]]; then
    fail ".env not found - installation seems broken"
fi

ok "Pre-flight passed"

# ── Step 1: Pull latest code from GitHub ──────────────────
step "Pulling latest code"

TEMP_DIR="/tmp/livinity-update-$$"
rm -rf "$TEMP_DIR"

info "Cloning latest from GitHub..."
git clone --depth 1 "$REPO_URL" "$TEMP_DIR" || fail "Failed to clone repository"

ok "Latest code fetched"

# ── Step 2: Update LivOS source files ─────────────────────
step "Updating LivOS source files"

# Update livinityd source (tsx runs directly, no compile needed)
info "Updating livinityd source..."
rsync -a --delete \
    "$TEMP_DIR/livos/packages/livinityd/source/" \
    "$LIVOS_DIR/packages/livinityd/source/"
ok "livinityd source updated"

# Update package.json files (for dependency changes)
info "Updating package manifests..."
cp "$TEMP_DIR/livos/package.json" "$LIVOS_DIR/package.json"
cp "$TEMP_DIR/livos/pnpm-lock.yaml" "$LIVOS_DIR/pnpm-lock.yaml" 2>/dev/null || true
cp "$TEMP_DIR/livos/pnpm-workspace.yaml" "$LIVOS_DIR/pnpm-workspace.yaml" 2>/dev/null || true
cp "$TEMP_DIR/livos/packages/livinityd/package.json" "$LIVOS_DIR/packages/livinityd/package.json"
cp "$TEMP_DIR/livos/packages/ui/package.json" "$LIVOS_DIR/packages/ui/package.json"
cp "$TEMP_DIR/livos/packages/config/package.json" "$LIVOS_DIR/packages/config/package.json" 2>/dev/null || true
ok "Package manifests updated"

# Update UI source
info "Updating UI source..."
rsync -a --delete \
    "$TEMP_DIR/livos/packages/ui/src/" \
    "$LIVOS_DIR/packages/ui/src/"
# Also copy vite config, tailwind config, index.html etc.
for f in vite.config.ts tailwind.config.js postcss.config.js tsconfig.json tsconfig.app.json tsconfig.node.json index.html components.json; do
    if [[ -f "$TEMP_DIR/livos/packages/ui/$f" ]]; then
        cp "$TEMP_DIR/livos/packages/ui/$f" "$LIVOS_DIR/packages/ui/$f"
    fi
done
ok "UI source updated"

# Update config package source
info "Updating config package..."
rsync -a --delete \
    "$TEMP_DIR/livos/packages/config/" \
    "$LIVOS_DIR/packages/config/"
ok "Config package updated"

# ── Step 3: Update Nexus source files ─────────────────────
step "Updating Nexus source files"

if [[ -d "$NEXUS_DIR" ]]; then
    # Update nexus packages source
    for pkg in core worker mcp-server memory; do
        if [[ -d "$TEMP_DIR/nexus/packages/$pkg" ]]; then
            info "Updating nexus/$pkg..."
            rsync -a --delete \
                "$TEMP_DIR/nexus/packages/$pkg/" \
                "$NEXUS_DIR/packages/$pkg/"
        fi
    done

    # Update nexus root files
    cp "$TEMP_DIR/nexus/package.json" "$NEXUS_DIR/package.json"
    cp "$TEMP_DIR/nexus/package-lock.json" "$NEXUS_DIR/package-lock.json" 2>/dev/null || true
    cp "$TEMP_DIR/nexus/tsconfig.json" "$NEXUS_DIR/tsconfig.json" 2>/dev/null || true

    ok "Nexus source updated"
else
    info "Nexus not found, copying fresh..."
    cp -r "$TEMP_DIR/nexus" "$NEXUS_DIR"
    ok "Nexus installed fresh"
fi

# ── Step 4: Install dependencies ──────────────────────────
step "Installing dependencies"

info "Installing LivOS dependencies..."
cd "$LIVOS_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "LivOS dependencies installed"

if [[ -d "$NEXUS_DIR" ]]; then
    info "Installing Nexus dependencies..."
    cd "$NEXUS_DIR"
    npm install --production=false 2>/dev/null || npm install
    ok "Nexus dependencies installed"
fi

# ── Step 5: Build packages ────────────────────────────────
step "Building packages"

# Build @livos/config
info "Building @livos/config..."
cd "$LIVOS_DIR/packages/config"
npx tsc
cd "$LIVOS_DIR"
ok "@livos/config built"

# Build UI
info "Building UI (this may take a minute)..."
cd "$LIVOS_DIR/packages/ui"
npm run build 2>&1 | tail -5
cd "$LIVOS_DIR"

# Ensure UI symlink
ln -sf "$LIVOS_DIR/packages/ui/dist" "$LIVOS_DIR/packages/livinityd/ui"
ok "UI built and linked"

# Build Nexus packages
if [[ -d "$NEXUS_DIR" ]]; then
    info "Building Nexus core..."
    cd "$NEXUS_DIR/packages/core" && npx tsc && cd "$NEXUS_DIR"
    ok "Nexus core built"

    info "Building Nexus worker..."
    cd "$NEXUS_DIR/packages/worker" && npx tsc 2>/dev/null && cd "$NEXUS_DIR" || cd "$NEXUS_DIR"

    info "Building Nexus mcp-server..."
    cd "$NEXUS_DIR/packages/mcp-server" && npx tsc 2>/dev/null && cd "$NEXUS_DIR" || cd "$NEXUS_DIR"

    # Copy nexus dist to pnpm symlink location
    local_pnpm_nexus=$(find "$LIVOS_DIR/node_modules/.pnpm" -maxdepth 1 -name '@nexus+core*' -type d 2>/dev/null | head -1)
    if [[ -n "$local_pnpm_nexus" ]] && [[ -d "$NEXUS_DIR/packages/core/dist" ]]; then
        cp -r "$NEXUS_DIR/packages/core/dist" "$local_pnpm_nexus/node_modules/@nexus/core/"
        ok "Nexus dist linked to pnpm store"
    fi
fi

# ── Step 6: Update gallery cache ──────────────────────────
step "Updating gallery cache"

GALLERY_CACHE_DIR=$(find "$LIVOS_DIR/data/app-stores/" -maxdepth 1 -name '*livinity-apps*' -type d 2>/dev/null | head -1)
if [[ -n "$GALLERY_CACHE_DIR" ]] && [[ -d "$GALLERY_CACHE_DIR/.git" ]]; then
    info "Updating gallery cache at $GALLERY_CACHE_DIR..."
    cd "$GALLERY_CACHE_DIR"
    git config --global --add safe.directory "$GALLERY_CACHE_DIR" 2>/dev/null || true
    git fetch origin 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || git reset --hard origin/master 2>/dev/null || warn "Gallery cache update failed"
    cd "$LIVOS_DIR"
    ok "Gallery cache updated"
else
    info "No gallery cache found - will be created on first App Store access"
fi

# ── Step 7: Fix permissions ───────────────────────────────
step "Fixing permissions"

# Make app-script executable
chmod +x "$LIVOS_DIR/packages/livinityd/source/modules/apps/legacy-compat/app-script" 2>/dev/null || true

# Set ownership (livos user for most, root runs the service)
chown -R root:root "$LIVOS_DIR" 2>/dev/null || true
chown -R root:root "$NEXUS_DIR" 2>/dev/null || true

ok "Permissions fixed"

# ── Step 8: Restart services ─────────────────────────────
step "Restarting services"

systemctl daemon-reload

info "Restarting livos..."
systemctl restart livos.service
sleep 2

info "Restarting liv-core..."
systemctl restart liv-core.service
sleep 1

info "Restarting liv-worker..."
systemctl restart liv-worker.service 2>/dev/null || true

info "Restarting liv-memory..."
systemctl restart liv-memory.service 2>/dev/null || true

# Verify services
sleep 3
if systemctl is-active --quiet livos.service; then
    ok "LivOS service running"
else
    warn "LivOS service may not have started - check: journalctl -u livos -n 30"
fi

if systemctl is-active --quiet liv-core.service; then
    ok "Liv-core service running"
else
    warn "Liv-core service may not have started - check: journalctl -u liv-core -n 30"
fi

# ── Step 9: Cleanup ───────────────────────────────────────
step "Cleanup"

rm -rf "$TEMP_DIR"
ok "Temp files cleaned"

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  LivOS updated successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${YELLOW}What was updated:${NC}"
echo -e "    - livinityd source code"
echo -e "    - UI (rebuilt from source)"
echo -e "    - Nexus AI packages (core, worker, mcp-server)"
echo -e "    - Gallery app cache"
echo -e "    - Dependencies"
echo ""
echo -e "  ${YELLOW}What was preserved:${NC}"
echo -e "    - .env (secrets, API keys, config)"
echo -e "    - Redis data (all settings, conversations)"
echo -e "    - App data volumes (installed apps, user files)"
echo -e "    - Systemd service configurations"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
