#!/usr/bin/env bash
# docker/local-uat/entrypoint.sh
# Runs inside the UAT container as a systemd unit AFTER multi-user.target.
# Source: 104-RESEARCH.md §Example 3 (lines 781-826).

set -euo pipefail

LOG_PREFIX="[livos-uat]"
log()  { echo "${LOG_PREFIX} $*"; }
fail() { echo "${LOG_PREFIX} FATAL: $*" >&2; exit 1; }

# ── Pre-flight: verify cgroup v2 (Pitfall 7) ──
if ! grep -q '^0::' /proc/self/cgroup; then
    fail "container is on cgroup v1 — systemd will fail. Upgrade WSL to >= 2.5.1, or add 'kernelCommandLine=cgroup_no_v1=all systemd.unified_cgroup_hierarchy=1' to .wslconfig."
fi
log "cgroup v2 OK"

# ── Start X stack ──
log "starting Xvfb :0 1280x720x24"
Xvfb :0 -screen 0 1280x720x24 &
sleep 1
log "starting fluxbox"
DISPLAY=:0 fluxbox &
sleep 1
log "starting x11vnc on :5900"
x11vnc -display :0 -nopw -shared -forever -bg -rfbport 5900
log "starting websockify (noVNC) on :6080 -> :5900"
websockify --web=/usr/share/novnc 6080 localhost:5900 &
sleep 1

# ── Run install.sh (or scaffold-only fallback if it doesn't exist yet) ──
INSTALL_SH=/livinity-io/scripts/install.sh
MODE="${LIVOS_UAT_MODE:-local-lan}"
if [[ -f "$INSTALL_SH" ]]; then
    log "running install.sh --mode ${MODE}"
    bash "$INSTALL_SH" --mode "$MODE" || log "install.sh exited non-zero (continuing scaffold smoke test)"
else
    log "SCAFFOLD-ONLY MODE: $INSTALL_SH not present yet (plan 104-02 creates it)"
    log "proceeding to launch Chrome so AC-104-1 + AC-104-13 + AC-104-14 can be smoke-tested"
fi

# ── Launch Chrome with CDP on 0.0.0.0 (D-104-UAT-CDP-BIND) ──
log "launching Chrome on CDP :9223 (--remote-debugging-address=0.0.0.0)"
google-chrome \
    --remote-debugging-port=9223 \
    --remote-debugging-address=0.0.0.0 \
    --user-data-dir=/tmp/uat-chrome \
    --no-sandbox \
    --disable-dev-shm-usage \
    --display=:0 \
    "about:blank" &

# ── Readiness sentinel: write a file the test harness can wait on ──
# walk.mjs polls for this file to know the entrypoint is past Chrome launch.
sleep 3
echo "ready=$(date -u +%FT%TZ)" > /tmp/livos-uat-ready
log "READY: noVNC http://<host>:6080/vnc.html, CDP http://<host>:9223"

# ── Block forever; systemd manages process tree ──
wait
