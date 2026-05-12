# syntax=docker/dockerfile:1
# docker/cloud-regression/Dockerfile
# Phase 104 plan 104-06 — UAT container for cloud-mode regression (AC-104-3).
#
# Differs from docker/local-uat/Dockerfile:
#   - No GUI stack (no Xvfb / fluxbox / x11vnc / novnc / Chrome) — cloud-mode
#     regression is config-shape verification, not visual UAT
#   - Different entrypoint (livos-cloud-regression-entrypoint.sh) that runs
#     install.sh --mode cloud and captures snapshot state, then waits forever
#   - Different ports to avoid collision with docker/local-uat/ (8090 + 8453)
#
# D-104-UAT-IMAGE: same base image as docker/local-uat/ (Phase 104 lock).
# D-104-NO-PROD-IMPACT: this container is the CI gate that proves install.sh
# --mode cloud is byte-equivalent to the Mini PC baseline at SHA dab261cc.

FROM trfore/docker-ubuntu2404-systemd:latest

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Europe/Istanbul

# Minimal toolset — install.sh's common-deps installs Caddy + the rest at runtime
# to exercise the real install path. dnsutils included so `dig` is available for
# any diagnostic the snapshot wants.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg2 wget jq dnsutils openssl sudo \
    procps net-tools iproute2 systemd \
    redis-tools \
 && rm -rf /var/lib/apt/lists/*

COPY docker/cloud-regression/entrypoint.sh /usr/local/bin/livos-cloud-regression-entrypoint.sh
RUN chmod +x /usr/local/bin/livos-cloud-regression-entrypoint.sh

# Systemd unit that runs the entrypoint after multi-user.target.
# Source: 104-RESEARCH.md §Example 3 (same shape as docker/local-uat/).
RUN cat > /etc/systemd/system/livos-cloud-regression.service <<'UNIT' \
 && systemctl enable livos-cloud-regression.service
[Unit]
Description=LivOS Cloud Regression Bootstrap (install.sh --mode cloud)
After=multi-user.target
Wants=multi-user.target

[Service]
Type=simple
ExecStart=/usr/local/bin/livos-cloud-regression-entrypoint.sh
Restart=no
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

EXPOSE 80 443

# systemd is PID 1 (provided by trfore base image's ENTRYPOINT/CMD).
# Do NOT override ENTRYPOINT — trfore image already sets it to /sbin/init.
