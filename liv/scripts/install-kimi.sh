#!/bin/bash
# =============================================================================
# Kimi CLI Installation Script for LivOS Production Server
# =============================================================================
# Purpose: Install Python 3.12+, uv package manager, and Kimi CLI
# Target:  Server4 (45.137.194.103) - production
# Usage:   SSH into server, then: bash /opt/nexus/app/scripts/install-kimi.sh
#          Or run locally after scp: bash install-kimi.sh
#
# This script is idempotent -- safe to run multiple times.
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "\n${GREEN}==>${NC} $1"; }

# =============================================================================
# Step 1: Check current Python version
# =============================================================================
log_step "Step 1: Checking Python version..."

PYTHON_OK=false
if command -v python3 &>/dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
    PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
    PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
    log_info "Found Python $PYTHON_VERSION"
    if [[ "$PYTHON_MAJOR" -ge 3 ]] && [[ "$PYTHON_MINOR" -ge 12 ]]; then
        log_info "Python $PYTHON_VERSION meets requirement (3.12+). Skipping installation."
        PYTHON_OK=true
    else
        log_warn "Python $PYTHON_VERSION is below 3.12. Will install Python 3.12."
    fi
else
    log_warn "Python 3 not found. Will install Python 3.12."
fi

# =============================================================================
# Step 2: Install Python 3.12 (if needed)
# =============================================================================
if [[ "$PYTHON_OK" == "false" ]]; then
    log_step "Step 2: Installing Python 3.12..."

    # Try system repo first
    apt-get update -qq

    if apt-cache show python3.12 &>/dev/null; then
        log_info "Python 3.12 available in system repos."
        apt-get install -y python3.12 python3.12-venv python3.12-dev
    else
        log_info "Adding deadsnakes PPA for Python 3.12..."
        apt-get install -y software-properties-common
        add-apt-repository -y ppa:deadsnakes/ppa
        apt-get update -qq
        apt-get install -y python3.12 python3.12-venv python3.12-dev
    fi

    # Set python3.12 as default python3 if not already
    if command -v python3.12 &>/dev/null; then
        update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1 2>/dev/null || true
        # If other versions exist, set 3.12 as highest priority
        update-alternatives --set python3 /usr/bin/python3.12 2>/dev/null || true
    fi

    # Verify
    INSTALLED_VERSION=$(python3 --version 2>&1)
    log_info "Installed: $INSTALLED_VERSION"
else
    log_step "Step 2: Skipping Python installation (already 3.12+)."
fi

# =============================================================================
# Step 3: Install uv package manager
# =============================================================================
log_step "Step 3: Installing uv package manager..."

if command -v uv &>/dev/null; then
    UV_VERSION=$(uv --version 2>&1)
    log_info "uv already installed: $UV_VERSION"
else
    log_info "Installing uv via official installer..."
    curl -LsSf https://astral.sh/uv/install.sh | bash

    # Source the path updates
    export PATH="/root/.local/bin:$PATH"

    if command -v uv &>/dev/null; then
        UV_VERSION=$(uv --version 2>&1)
        log_info "uv installed successfully: $UV_VERSION"
    else
        log_error "uv installation failed. Check output above."
        exit 1
    fi
fi

# =============================================================================
# Step 4: Install Kimi CLI
# =============================================================================
log_step "Step 4: Installing Kimi CLI..."

# Ensure uv is on PATH
export PATH="/root/.local/bin:$PATH"

if command -v kimi &>/dev/null; then
    KIMI_VERSION=$(kimi --version 2>&1)
    log_info "Kimi CLI already installed: $KIMI_VERSION"
else
    log_info "Installing Kimi CLI via uv tool install..."
    uv tool install kimi-code

    # uv tool install puts binaries in ~/.local/bin (or ~/.local/share/uv/tools/...)
    # Re-export path to pick up new binary
    export PATH="/root/.local/bin:$PATH"

    if command -v kimi &>/dev/null; then
        KIMI_VERSION=$(kimi --version 2>&1)
        log_info "Kimi CLI installed successfully: $KIMI_VERSION"
    else
        # Try the official installer as fallback
        log_warn "uv tool install didn't put kimi on PATH. Trying official installer..."
        curl -LsSf https://code.kimi.com/install.sh | bash
        export PATH="/root/.local/bin:$PATH"

        if command -v kimi &>/dev/null; then
            KIMI_VERSION=$(kimi --version 2>&1)
            log_info "Kimi CLI installed via official installer: $KIMI_VERSION"
        else
            log_error "Kimi CLI installation failed via both methods."
            log_error "Try manually: uv tool install kimi-code"
            exit 1
        fi
    fi
fi

# =============================================================================
# Step 5: Ensure PATH is available to PM2 processes
# =============================================================================
log_step "Step 5: Configuring PATH for PM2 processes..."

KIMI_PATH=$(which kimi 2>/dev/null || echo "")
if [[ -z "$KIMI_PATH" ]]; then
    log_error "Cannot find kimi binary. Installation may have failed."
    exit 1
fi

KIMI_DIR=$(dirname "$KIMI_PATH")
log_info "Kimi binary located at: $KIMI_PATH"
log_info "Kimi bin directory: $KIMI_DIR"

# Ensure /root/.local/bin is in /root/.profile (if not already)
PROFILE_FILE="/root/.profile"
if ! grep -q '/root/.local/bin' "$PROFILE_FILE" 2>/dev/null; then
    log_info "Adding /root/.local/bin to $PROFILE_FILE"
    echo '' >> "$PROFILE_FILE"
    echo '# Added by install-kimi.sh: uv and kimi tools' >> "$PROFILE_FILE"
    echo 'export PATH="/root/.local/bin:$PATH"' >> "$PROFILE_FILE"
else
    log_info "/root/.local/bin already in $PROFILE_FILE"
fi

# Also ensure .bashrc has it (for interactive shells)
BASHRC_FILE="/root/.bashrc"
if ! grep -q '/root/.local/bin' "$BASHRC_FILE" 2>/dev/null; then
    log_info "Adding /root/.local/bin to $BASHRC_FILE"
    echo '' >> "$BASHRC_FILE"
    echo '# Added by install-kimi.sh: uv and kimi tools' >> "$BASHRC_FILE"
    echo 'export PATH="/root/.local/bin:$PATH"' >> "$BASHRC_FILE"
else
    log_info "/root/.local/bin already in $BASHRC_FILE"
fi

# If kimi is somewhere else (e.g., uv tools directory), add that too
if [[ "$KIMI_DIR" != "/root/.local/bin" ]]; then
    if ! grep -q "$KIMI_DIR" "$PROFILE_FILE" 2>/dev/null; then
        log_info "Adding $KIMI_DIR to $PROFILE_FILE"
        echo "export PATH=\"$KIMI_DIR:\$PATH\"" >> "$PROFILE_FILE"
    fi
fi

# Source profile to apply changes
source "$PROFILE_FILE" 2>/dev/null || true

# =============================================================================
# Step 6: Restart PM2 nexus-core to pick up new PATH
# =============================================================================
log_step "Step 6: Restarting PM2 nexus-core..."

# Source nvm if available (PM2 needs node)
if [[ -f /root/.profile ]]; then
    source /root/.profile 2>/dev/null || true
fi

if command -v pm2 &>/dev/null; then
    pm2 restart nexus-core 2>/dev/null && log_info "PM2 nexus-core restarted." || log_warn "PM2 nexus-core restart failed (may not be running)."
else
    log_warn "PM2 not found. You may need to source ~/.profile first and restart manually."
fi

# =============================================================================
# Verification
# =============================================================================
log_step "Running verification checks..."

echo ""
PASS=0
FAIL=0

# Check 1: Python version
PYTHON_VER=$(python3 --version 2>&1)
if echo "$PYTHON_VER" | grep -qP '3\.(1[2-9]|[2-9][0-9])'; then
    log_info "PASS: python3 --version = $PYTHON_VER"
    ((PASS++))
else
    log_error "FAIL: python3 --version = $PYTHON_VER (need 3.12+)"
    ((FAIL++))
fi

# Check 2: uv version
UV_VER=$(uv --version 2>&1 || echo "NOT FOUND")
if [[ "$UV_VER" != "NOT FOUND" ]]; then
    log_info "PASS: uv --version = $UV_VER"
    ((PASS++))
else
    log_error "FAIL: uv not found"
    ((FAIL++))
fi

# Check 3: kimi version
KIMI_VER=$(kimi --version 2>&1 || echo "NOT FOUND")
if [[ "$KIMI_VER" != "NOT FOUND" ]]; then
    log_info "PASS: kimi --version = $KIMI_VER"
    ((PASS++))
else
    log_error "FAIL: kimi not found"
    ((FAIL++))
fi

# Check 4: kimi on PATH (sourced profile)
source /root/.profile 2>/dev/null || true
KIMI_WHICH=$(which kimi 2>/dev/null || echo "NOT FOUND")
if [[ "$KIMI_WHICH" != "NOT FOUND" ]]; then
    log_info "PASS: which kimi = $KIMI_WHICH"
    ((PASS++))
else
    log_error "FAIL: kimi not on PATH after sourcing .profile"
    ((FAIL++))
fi

echo ""
echo "============================================="
if [[ $FAIL -eq 0 ]]; then
    log_info "All $PASS checks passed! Kimi CLI is ready."
    echo "============================================="
    echo ""
    log_info "Next steps:"
    log_info "  1. Kimi API key will be configured in Phase 02 (Settings UI)"
    log_info "  2. KimiAgentRunner will be implemented in Plan 03-02"
    log_info "  3. Do NOT run 'kimi login' -- auth is handled via API key"
else
    log_error "$FAIL of $((PASS + FAIL)) checks failed."
    echo "============================================="
    echo ""
    log_error "Please review the errors above and re-run the script."
    exit 1
fi
