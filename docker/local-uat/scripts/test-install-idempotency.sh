#!/usr/bin/env bash
# docker/local-uat/scripts/test-install-idempotency.sh
# Proves AC-104-2: install.sh --mode <mode> is idempotent (re-run = same state).
#
# Strategy: snapshot state after run 1, snapshot after run 2, diff. Empty diff
# across all three snapshot kinds (systemctl unit states, file checksums, Redis
# values) = PASS. Any drift = FAIL with full diff dumped to stderr.
#
# Intended to run INSIDE the UAT container (`bash docker/local-uat/scripts/
# test-install-idempotency.sh local-lan` invoked via the host wrapper). Reads
# install.sh from the read-only mount at /livinity-io.
#
# Style mirrors scripts/verify-sacred-sha.sh: set -euo pipefail, explicit exit
# codes, colored PASS/FAIL helpers, machine-parseable single-line outcome.

set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
pass() { echo -e "${GREEN}PASS${NC}: $*"; }
fail() { echo -e "${RED}FAIL${NC}: $*"; exit 1; }

MODE="${1:-local-lan}"
SNAPSHOT_DIR=$(mktemp -d)

snapshot_state() {
    local out="$1"
    # systemctl unit states for the three services install.sh + later plans
    # manage. `is-active` exits non-zero when unit is inactive; we swallow
    # that with || echo so the snapshot file always has one line per unit.
    {
        systemctl is-active caddy 2>/dev/null || echo "inactive"
        systemctl is-active dnsmasq 2>/dev/null || echo "not-installed"
        systemctl is-active redis-server 2>/dev/null || echo "not-installed"
    } > "$out.systemctl"
    # File checksums (only files install.sh writes). Each file is optional;
    # missing files contribute zero lines (consistent across both runs).
    {
        for f in /etc/caddy/Caddyfile /etc/caddy/pki-global.conf \
                 /etc/dnsmasq.d/livinity.conf \
                 /etc/systemd/resolved.conf.d/no-stub.conf \
                 /var/lib/livos/install-pending-redis-keys.txt; do
            if [[ -f "$f" ]]; then
                echo "$f $(sha256sum < "$f" | awk '{print $1}')"
            fi
        done | sort
    } > "$out.files"
    # Redis state (if reachable). Otherwise snapshot a sentinel string so the
    # two runs still diff cleanly when both can't reach Redis.
    if command -v redis-cli &>/dev/null && redis-cli ping 2>/dev/null | grep -q PONG; then
        {
            redis-cli get livos:domain:local_mode 2>/dev/null
            redis-cli get livos:domain:local_tld 2>/dev/null
            redis-cli get livos:domain:host_ip 2>/dev/null
        } > "$out.redis"
    else
        echo "redis-unreachable" > "$out.redis"
    fi
}

echo "[idempotency] run 1: bash scripts/install.sh --mode $MODE"
bash /livinity-io/scripts/install.sh --mode "$MODE" || fail "run 1 install.sh exited non-zero"
snapshot_state "$SNAPSHOT_DIR/run1"

echo "[idempotency] run 2: bash scripts/install.sh --mode $MODE"
bash /livinity-io/scripts/install.sh --mode "$MODE" || fail "run 2 install.sh exited non-zero"
snapshot_state "$SNAPSHOT_DIR/run2"

echo "[idempotency] diffing state snapshots..."
for kind in systemctl files redis; do
    if ! diff -u "$SNAPSHOT_DIR/run1.$kind" "$SNAPSHOT_DIR/run2.$kind"; then
        fail "$kind state differs between run 1 and run 2"
    fi
done

pass "AC-104-2: install.sh --mode $MODE is idempotent across 2 runs"
rm -rf "$SNAPSHOT_DIR"
exit 0
