FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:1 \
    HOME=/config \
    CHROME_FLAGS="" \
    TZ=Europe/Istanbul

# Base deps + KasmVNC + Google Chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg2 ca-certificates curl locales xfonts-base xfonts-100dpi xfonts-75dpi \
    dbus-x11 libgbm1 libnss3 libatk-bridge2.0-0 libgtk-3-0 libx11-xcb1 \
    libxcomposite1 libxdamage1 libxrandr2 libasound2t64 libpangocairo-1.0-0 \
    libatspi2.0-0 libcups2 libdrm2 libxshmfence1 fonts-liberation fonts-noto-color-emoji \
    procps && \
    locale-gen en_US.UTF-8 && \
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main' > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && apt-get install -y --no-install-recommends google-chrome-stable && \
    wget -q https://github.com/kasmtech/KasmVNC/releases/download/v1.3.4/kasmvncserver_noble_1.3.4_amd64.deb -O /tmp/kasmvnc.deb && \
    apt-get install -y /tmp/kasmvnc.deb && \
    rm /tmp/kasmvnc.deb && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/*

# Bypass KasmVNC desktop env selector
RUN printf '#!/bin/bash\nexit 0\n' > /usr/lib/kasmvncserver/select-de.sh && \
    chmod +x /usr/lib/kasmvncserver/select-de.sh

# KasmVNC config
COPY <<EOF /etc/kasmvnc/kasmvnc.yaml
desktop:
  resolution:
    width: 1920
    height: 1080
  allow_resize: true
  pixel_depth: 24
network:
  protocol: http
  interface: 0.0.0.0
  websocket_port: 3000
  use_ipv4: true
  use_ipv6: false
  ssl:
    require_ssl: false
runtime_configuration:
  allow_client_to_override_kasm_server_settings: true
  allow_override_standard_vnc_server_settings: true
EOF

# Pre-bake KasmVNC password hash (livos/livos)
RUN printf 'livos:$2b$12$LivOSChromeDefaultPasswd000000000000000000000000000:w\n' > /defaults-kasmpasswd

# Startup script — creates xstartup at runtime (after volume mount)
COPY <<'START' /start.sh
#!/bin/bash
set -e

export HOME=/config

# Fix hostname resolution (Docker containers may not resolve their own hostname)
echo "127.0.0.1 $(hostname)" >> /etc/hosts 2>/dev/null || true

# Create profile dirs
mkdir -p /config/.vnc /config/.chrome-profile

# Create xstartup at runtime (volume mount overwrites build-time files)
cat > /config/.vnc/xstartup << 'XSTARTUP'
#!/bin/bash
exec google-chrome-stable \
  --no-sandbox \
  --disable-dev-shm-usage \
  --no-first-run \
  --disable-infobars \
  --start-maximized \
  --user-data-dir=/config/.chrome-profile \
  --disable-blink-features=AutomationControlled \
  --disable-features=ChromeWhatsNewUI,AutofillServerCommunication \
  --disable-component-update \
  --disable-background-networking \
  --disable-default-apps \
  --lang=en-US \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  ${CHROME_FLAGS} \
  "$@"
XSTARTUP
chmod +x /config/.vnc/xstartup

# Create KasmVNC password at runtime (volume mount wipes build-time files)
if [ ! -f /config/.kasmpasswd ]; then
  printf 'livos\nlivos\n' | kasmvncpasswd -u livos -w 2>/dev/null || cp /defaults-kasmpasswd /config/.kasmpasswd
fi

# Clean stale locks
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true

# Start KasmVNC
exec kasmvncserver :1 \
  -geometry 1920x1080 \
  -depth 24 \
  -websocketPort 3000 \
  -interface 0.0.0.0 \
  -disableBasicAuth \
  -FrameRate 60 \
  -fg
START
RUN chmod +x /start.sh

VOLUME /config
EXPOSE 3000 9222

CMD ["/start.sh"]
