#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$AGENT_DIR/dist"
VERSION="0.1.0"
ARCH="amd64"
PKG_NAME="livinity-agent"
OUTPUT_DIR="$DIST_DIR/installer"

echo "=== Building Livinity Agent Linux .deb Package ==="
echo ""

# Step 1: Build SEA binary
echo "Step 1: Building SEA binary..."
cd "$AGENT_DIR"
npm run build:sea
echo ""

# Step 2: Check for fpm
if ! command -v fpm &>/dev/null; then
    echo "ERROR: fpm not found. Install it with: gem install fpm"
    echo "  or: sudo apt install ruby-dev build-essential && sudo gem install fpm"
    exit 1
fi

# Step 3: Verify SEA binary exists
if [ ! -f "$DIST_DIR/livinity-agent" ]; then
    echo "ERROR: SEA binary not found at $DIST_DIR/livinity-agent"
    echo "  build:sea may have failed or produced a different filename."
    exit 1
fi

# Step 4: Create staging directory
echo "Step 2: Creating package structure..."
STAGING="$DIST_DIR/deb-staging"
rm -rf "$STAGING"

# Binary
mkdir -p "$STAGING/usr/local/bin"
cp "$DIST_DIR/livinity-agent" "$STAGING/usr/local/bin/livinity-agent"
chmod +x "$STAGING/usr/local/bin/livinity-agent"

# Native dependencies (systray2 tray binary)
if [ -d "$DIST_DIR/traybin" ]; then
    mkdir -p "$STAGING/usr/local/lib/livinity-agent/traybin"
    cp -R "$DIST_DIR/traybin"/* "$STAGING/usr/local/lib/livinity-agent/traybin/"
fi
if [ -d "$DIST_DIR/node_modules/systray2" ]; then
    mkdir -p "$STAGING/usr/local/lib/livinity-agent/node_modules/systray2"
    cp -R "$DIST_DIR/node_modules/systray2"/* "$STAGING/usr/local/lib/livinity-agent/node_modules/systray2/"
fi

# node-screenshots native module (if present for Linux)
if [ -d "$DIST_DIR/node_modules/node-screenshots" ]; then
    mkdir -p "$STAGING/usr/local/lib/livinity-agent/node_modules/node-screenshots"
    cp -R "$DIST_DIR/node_modules/node-screenshots"/* "$STAGING/usr/local/lib/livinity-agent/node_modules/node-screenshots/"
fi
if [ -d "$DIST_DIR/node_modules/@node-rs" ]; then
    mkdir -p "$STAGING/usr/local/lib/livinity-agent/node_modules/@node-rs"
    cp -R "$DIST_DIR/node_modules/@node-rs"/* "$STAGING/usr/local/lib/livinity-agent/node_modules/@node-rs/"
fi

# Copy any Linux-specific native node-screenshots packages
for pkg in node-screenshots-linux-x64-gnu node-screenshots-linux-x64-musl \
           node-screenshots-linux-arm64-gnu node-screenshots-linux-arm64-musl; do
    if [ -d "$DIST_DIR/node_modules/$pkg" ]; then
        mkdir -p "$STAGING/usr/local/lib/livinity-agent/node_modules/$pkg"
        cp -R "$DIST_DIR/node_modules/$pkg"/* "$STAGING/usr/local/lib/livinity-agent/node_modules/$pkg/"
    fi
done

# Setup UI
if [ -d "$DIST_DIR/setup-ui" ]; then
    mkdir -p "$STAGING/usr/local/lib/livinity-agent/setup-ui"
    cp -R "$DIST_DIR/setup-ui"/* "$STAGING/usr/local/lib/livinity-agent/setup-ui/"
fi

# systemd service file (with placeholder -- postinst replaces __USER__)
mkdir -p "$STAGING/etc/systemd/system"
cp "$SCRIPT_DIR/livinity-agent.service" "$STAGING/etc/systemd/system/livinity-agent.service"

# Step 5: Build .deb with fpm
echo "Step 3: Building .deb package..."
mkdir -p "$OUTPUT_DIR"

fpm \
    --input-type dir \
    --output-type deb \
    --name "$PKG_NAME" \
    --version "$VERSION" \
    --architecture "$ARCH" \
    --description "Livinity Agent - Remote PC control via livinity.io" \
    --url "https://livinity.io" \
    --maintainer "Livinity <support@livinity.io>" \
    --after-install "$SCRIPT_DIR/postinst.sh" \
    --before-remove "$SCRIPT_DIR/prerm.sh" \
    --package "$OUTPUT_DIR/${PKG_NAME}_${VERSION}_${ARCH}.deb" \
    --force \
    --chdir "$STAGING" \
    .

# Clean up staging
rm -rf "$STAGING"

echo ""
echo "SUCCESS: .deb package created at $OUTPUT_DIR/${PKG_NAME}_${VERSION}_${ARCH}.deb"
echo "  Install with: sudo dpkg -i ${PKG_NAME}_${VERSION}_${ARCH}.deb"
