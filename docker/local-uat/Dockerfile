# syntax=docker/dockerfile:1
FROM trfore/docker-ubuntu2404-systemd:latest

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:0 \
    TZ=Europe/Istanbul

# Base deps for install.sh prereqs + GUI stack + Chrome
# (Caddy/dnsmasq/Node/Postgres/Redis are installed by install.sh at runtime to
#  exercise the real install path — keep the Dockerfile thin.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg2 wget jq dnsutils openssl sudo socat \
    xvfb fluxbox x11vnc websockify novnc \
    xfonts-base xfonts-100dpi xfonts-75dpi fonts-liberation fonts-noto-color-emoji \
    dbus-x11 procps net-tools iproute2 systemd \
 && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
 && echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main' > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

COPY docker/local-uat/entrypoint.sh /usr/local/bin/livos-uat-entrypoint.sh
RUN chmod +x /usr/local/bin/livos-uat-entrypoint.sh

# Systemd unit that runs the UAT entrypoint after systemd has booted
RUN cat > /etc/systemd/system/livos-uat.service <<'UNIT' \
 && systemctl enable livos-uat.service
[Unit]
Description=LivOS UAT bootstrap (Xvfb + noVNC + Chrome + install.sh)
After=multi-user.target
Wants=multi-user.target

[Service]
Type=simple
ExecStart=/usr/local/bin/livos-uat-entrypoint.sh
Restart=no
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

EXPOSE 80 443 53/udp 6080 9224

# systemd is PID 1 (provided by trfore base image's ENTRYPOINT/CMD).
# Do NOT override ENTRYPOINT — trfore image already sets it to /sbin/init.
