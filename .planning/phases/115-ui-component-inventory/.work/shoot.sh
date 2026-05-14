#!/bin/bash
# Headless Chrome screenshot harness — fallback for Chrome DevTools MCP unavailable
# Produces baseline PNGs for Phase 115-03

set -u
SHOT_DIR="$(pwd)/.planning/phases/115-ui-component-inventory/baseline-screenshots"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
mkdir -p "$SHOT_DIR"

# route_slug<TAB>url
ROUTES=$(cat <<'EOF'
index	https://livinity.io/
dashboard	https://livinity.io/dashboard
dashboard-install	https://livinity.io/dashboard/install
login	https://livinity.io/login
register	https://livinity.io/register
forgot-password	https://livinity.io/forgot-password
store	https://livinity.io/store
download	https://livinity.io/download
profile	https://livinity.io/profile
customize	https://livinity.io/customize
minipc-root	https://bruce.livinity.io/
minipc-login	https://bruce.livinity.io/login
EOF
)

shoot() {
  local slug="$1" url="$2" width="$3" height="$4" theme="$5"
  local out="$SHOT_DIR/${slug}-${width}-${theme}.png"
  local dark_flag=""
  if [ "$theme" = "dark" ]; then dark_flag="--force-dark-mode --enable-features=WebUIDarkMode"; fi
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-sandbox \
    --window-size=${width},${height} \
    --virtual-time-budget=4000 \
    $dark_flag \
    --screenshot="$out" \
    "$url" 2>/dev/null
  if [ -f "$out" ] && [ "$(wc -c < "$out")" -gt 1000 ]; then
    echo "OK  ${slug}-${width}-${theme}  $(wc -c < "$out") bytes"
  else
    echo "FAIL ${slug}-${width}-${theme}"
  fi
}

echo "$ROUTES" | while IFS=$'\t' read -r slug url; do
  [ -z "$slug" ] && continue
  shoot "$slug" "$url" 1920 1080 light
  shoot "$slug" "$url" 1920 1080 dark
  shoot "$slug" "$url" 375 812 light
  shoot "$slug" "$url" 375 812 dark
done
