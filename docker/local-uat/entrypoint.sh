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

# ── Launch Chrome on CDP :9223 (forced to 127.0.0.1 in Chrome 121+) ──
# D-104-UAT-CDP-BIND: Chrome 121+ silently ignores --remote-debugging-address=0.0.0.0
# and binds 127.0.0.1 anyway. We bridge :9224 → 127.0.0.1:9223 via socat below.
# The compose port-map exposes container :9224 as host :9223.
log "launching Chrome on CDP 127.0.0.1:9223 (Chrome 121+ ignores 0.0.0.0 flag)"
google-chrome \
    --remote-debugging-port=9223 \
    --user-data-dir=/tmp/uat-chrome \
    --no-sandbox \
    --disable-dev-shm-usage \
    --display=:0 \
    "about:blank" &

# Wait for Chrome's CDP socket before starting the bridge
for i in $(seq 1 30); do
    if ss -tlnp 2>/dev/null | grep -q '127.0.0.1:9223'; then break; fi
    sleep 0.5
done

# ── CDP bridge: socat 0.0.0.0:9224 → 127.0.0.1:9223 (D-104-UAT-CDP-BIND) ──
log "starting socat bridge 0.0.0.0:9224 → 127.0.0.1:9223 for host CDP access"
nohup socat TCP-LISTEN:9224,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:9223 \
    >/var/log/livos-uat-cdp-bridge.log 2>&1 &

# ── Readiness sentinel: write a file the test harness can wait on ──
# walk.mjs polls for this file to know the entrypoint is past Chrome launch.
sleep 2
echo "ready=$(date -u +%FT%TZ)" > /tmp/livos-uat-ready
log "READY: noVNC http://<host>:6080/vnc.html, CDP http://<host>:9223 (via socat bridge → 127.0.0.1:9223)"

# ── Block forever; systemd manages process tree ──
wait
