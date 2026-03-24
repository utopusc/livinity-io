#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$AGENT_DIR/dist"
APP_NAME="Livinity Agent"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
DMG_OUTPUT="$DIST_DIR/installer/LivinityAgent.dmg"

echo "=== Building Livinity Agent macOS DMG ==="
echo ""

# Step 1: Build SEA binary
echo "Step 1: Building SEA binary..."
cd "$AGENT_DIR"
npm run build:sea
echo ""

# Step 2: Create .app bundle structure
echo "Step 2: Creating .app bundle..."
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"
mkdir -p "$APP_BUNDLE/Contents/Resources/node_modules"

# Copy Info.plist
cp "$SCRIPT_DIR/Info.plist" "$APP_BUNDLE/Contents/Info.plist"

# Copy SEA binary
cp "$DIST_DIR/livinity-agent" "$APP_BUNDLE/Contents/MacOS/livinity-agent"
chmod +x "$APP_BUNDLE/Contents/MacOS/livinity-agent"

# Create launcher script (starts agent with 'start --background')
cat > "$APP_BUNDLE/Contents/MacOS/livinity-agent-launcher" << 'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/livinity-agent" start --background
LAUNCHER
chmod +x "$APP_BUNDLE/Contents/MacOS/livinity-agent-launcher"

# Copy native dependencies
if [ -d "$DIST_DIR/node_modules/systray2" ]; then
    cp -R "$DIST_DIR/node_modules/systray2" "$APP_BUNDLE/Contents/Resources/node_modules/systray2"
fi
if [ -d "$DIST_DIR/traybin" ]; then
    cp -R "$DIST_DIR/traybin" "$APP_BUNDLE/Contents/MacOS/traybin"
fi
if [ -d "$DIST_DIR/node_modules/node-screenshots" ]; then
    cp -R "$DIST_DIR/node_modules/node-screenshots" "$APP_BUNDLE/Contents/Resources/node_modules/node-screenshots"
fi
if [ -d "$DIST_DIR/node_modules/@node-rs" ]; then
    mkdir -p "$APP_BUNDLE/Contents/Resources/node_modules/@node-rs"
    cp -R "$DIST_DIR/node_modules/@node-rs"/* "$APP_BUNDLE/Contents/Resources/node_modules/@node-rs/"
fi

# Copy platform-specific native node-screenshots packages
for pkg in "$DIST_DIR"/node_modules/node-screenshots-darwin-*; do
    if [ -d "$pkg" ]; then
        pkg_name="$(basename "$pkg")"
        cp -R "$pkg" "$APP_BUNDLE/Contents/Resources/node_modules/$pkg_name"
    fi
done

# Copy setup-ui
if [ -d "$DIST_DIR/setup-ui" ]; then
    cp -R "$DIST_DIR/setup-ui" "$APP_BUNDLE/Contents/Resources/setup-ui"
fi

echo ""

# Step 3: Create DMG
echo "Step 3: Creating DMG..."
mkdir -p "$DIST_DIR/installer"
rm -f "$DMG_OUTPUT"

# Create a temporary directory for DMG contents
DMG_TMP="$DIST_DIR/dmg-staging"
rm -rf "$DMG_TMP"
mkdir -p "$DMG_TMP"
cp -R "$APP_BUNDLE" "$DMG_TMP/"
ln -s /Applications "$DMG_TMP/Applications"

# Use hdiutil to create DMG (available on all macOS)
hdiutil create -volname "Livinity Agent" \
    -srcfolder "$DMG_TMP" \
    -ov -format UDZO \
    "$DMG_OUTPUT"

# Clean up staging
rm -rf "$DMG_TMP"

echo ""
echo "SUCCESS: DMG created at $DMG_OUTPUT"
echo "  App bundle: $APP_BUNDLE"
echo "  DMG size: $(du -h "$DMG_OUTPUT" | cut -f1)"
