#!/usr/bin/env bash
# docker/cloud-regression/entrypoint.sh
# Phase 104 plan 104-06 — UAT entrypoint for cloud-mode regression.
#
# Runs inside the cloud-regression container as a systemd unit AFTER
# multi-user.target. Its job:
#   1. Run install.sh --mode cloud (exercising the real install path)
#   2. Capture resulting state to /tmp/regression-snapshot/
#   3. Run cloud-mode-specific NEGATIVE checks (D-104-NO-PROD-IMPACT)
#   4. Drop a readiness sentinel for the host-side test harness to poll
#   5. Block forever (systemd manages the process tree)

set -euo pipefail

LOG_PREFIX="[livos-cloud-regression]"
log()  { echo "${LOG_PREFIX} $*"; }
fail() { echo "${LOG_PREFIX} FATAL: $*" >&2; exit 1; }

# ── Pre-flight: cgroup v2 (Pitfall 7 — same gate as docker/local-uat) ──
if ! grep -q '^0::' /proc/self/cgroup; then
    fail "container is on cgroup v1 — systemd will fail. Upgrade WSL to >= 2.5.1, or add 'kernelCommandLine=cgroup_no_v1=all systemd.unified_cgroup_hierarchy=1' to .wslconfig."
fi
log "cgroup v2 OK"

# ── Run install.sh --mode cloud (exercises the path under regression test) ──
log "running install.sh --mode cloud"
if ! bash /livinity-io/scripts/install.sh --mode cloud; then
    log "install.sh --mode cloud exited non-zero — continuing to capture partial state"
fi

# ── Capture state to /tmp/regression-snapshot/ for host to inspect ──
SNAPSHOT_DIR=/tmp/regression-snapshot
mkdir -p "$SNAPSHOT_DIR"

# 1. Caddyfile (raw + normalized: strip trailing whitespace + blank lines)
if [[ -f /etc/caddy/Caddyfile ]]; then
    cp /etc/caddy/Caddyfile "$SNAPSHOT_DIR/Caddyfile"
    sed -E 's/[[:space:]]+$//' /etc/caddy/Caddyfile \
        | sed '/^$/d' > "$SNAPSHOT_DIR/Caddyfile.normalized"
    sha256sum "$SNAPSHOT_DIR/Caddyfile.normalized" \
        | awk '{print $1}' > "$SNAPSHOT_DIR/Caddyfile.normalized.sha256"
fi

# 2. Caddy validate (proves config syntactic validity per RESEARCH §A5 — we
# can't run live ACME inside a container, so `caddy validate` stands in)
if command -v caddy &>/dev/null && [[ -f /etc/caddy/Caddyfile ]]; then
    caddy validate --config /etc/caddy/Caddyfile > "$SNAPSHOT_DIR/caddy-validate.txt" 2>&1 || true
else
    echo "caddy-not-installed-or-no-caddyfile" > "$SNAPSHOT_DIR/caddy-validate.txt"
fi

# 3. systemd unit files (only those install.sh creates or touches)
for unit in caddy.service livos.service liv-core.service liv-worker.service liv-memory.service; do
    if [[ -f /etc/systemd/system/$unit ]]; then
        cp "/etc/systemd/system/$unit" "$SNAPSHOT_DIR/"
        sha256sum "/etc/systemd/system/$unit" \
            | awk '{print $1}' > "$SNAPSHOT_DIR/$unit.sha256"
    fi
done

# 4. apt package names (sorted, no versions)
dpkg -l 2>/dev/null | awk '/^ii/ {print $2}' \
    | grep -E '^(caddy|cloudflared|redis|postgresql|nodejs|nginx|dnsmasq|docker|git)' \
    | sort > "$SNAPSHOT_DIR/apt-packages.txt" || true

# 5. Redis state (or the deferred-keys file if Redis isn't running yet)
if command -v redis-cli &>/dev/null && redis-cli ping 2>/dev/null | grep -q PONG; then
    {
        echo "local_mode=$(redis-cli get livos:domain:local_mode 2>/dev/null)"
        echo "local_tld=$(redis-cli get livos:domain:local_tld 2>/dev/null)"
        echo "host_ip=$(redis-cli get livos:domain:host_ip 2>/dev/null)"
    } > "$SNAPSHOT_DIR/redis.txt"
else
    if [[ -f /var/lib/livos/install-pending-redis-keys.txt ]]; then
        cp /var/lib/livos/install-pending-redis-keys.txt "$SNAPSHOT_DIR/redis-pending.txt"
    else
        echo "no-redis-pending" > "$SNAPSHOT_DIR/redis-pending.txt"
    fi
fi

# 6. Cloud-mode-specific NEGATIVE checks (D-104-NO-PROD-IMPACT enforcement).
# These are the hard invariants — cloud mode MUST NOT produce local-lan
# artifacts (pki-global.conf, dnsmasq config, internal-CA Caddyfile directives).
{
    # /etc/caddy/pki-global.conf is local-lan only
    if [[ -f /etc/caddy/pki-global.conf ]]; then
        echo "FAIL: /etc/caddy/pki-global.conf exists in cloud mode (must not!)"
    else
        echo "PASS: no /etc/caddy/pki-global.conf in cloud mode"
    fi
    # /etc/dnsmasq.d/livinity.conf is local-lan only
    if [[ -f /etc/dnsmasq.d/livinity.conf ]]; then
        echo "FAIL: /etc/dnsmasq.d/livinity.conf exists in cloud mode (must not!)"
    else
        echo "PASS: no dnsmasq config in cloud mode"
    fi
    # Caddyfile MUST NOT contain local-lan internal-CA directives
    if [[ -f /etc/caddy/Caddyfile ]] \
        && grep -qE '(import /etc/caddy/pki-global\.conf|tls internal|ca liv-local)' /etc/caddy/Caddyfile; then
        echo "FAIL: cloud-mode Caddyfile contains local-lan directives"
    else
        echo "PASS: cloud-mode Caddyfile has no local-lan directives"
    fi
} > "$SNAPSHOT_DIR/no-prod-impact-checks.txt"

# Sentinel for the host-side test harness to poll. Format mirrors
# /tmp/livos-uat-ready in docker/local-uat/entrypoint.sh.
echo "done=$(date -u +%FT%TZ)" > /tmp/livos-cloud-regression-ready

log "READY: snapshot at $SNAPSHOT_DIR"
log "test-cloud-byte-equivalence.sh on the host will diff vs fixtures/minipc-dab261cc/"

# Block forever — systemd manages the process tree.
wait
