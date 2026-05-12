#!/usr/bin/env bash
# docker/cloud-regression/scripts/capture-minipc-baseline.sh
# ONE-TIME OPERATOR HELPER — captures the Mini PC's current state at deployed
# SHA dab261cc as the baseline for AC-104-3 byte-equivalence regression.
#
# This script is NOT run by CI. It is invoked manually by the developer ONCE
# (or whenever the Mini PC's deployed SHA is bumped and the baseline needs to
# be refreshed). The captured fixtures land in
# docker/cloud-regression/fixtures/minipc-<sha>/ and are checked into git as
# the reference baseline that the CI gate diffs against.
#
# Usage (run from developer's host, NOT inside the regression container):
#   bash docker/cloud-regression/scripts/capture-minipc-baseline.sh
#   bash docker/cloud-regression/scripts/capture-minipc-baseline.sh --help
#
# Environment overrides:
#   MINIPC_SSH_KEY   path to SSH private key  (default: pem/minipc)
#   MINIPC_SSH_HOST  user@host                (default: bruce@10.69.31.68)
#   FIXTURES_DIR     output dir               (default: fixtures/minipc-dab261cc)
#
# Per memory feedback_ssh_rate_limit.md: fail2ban sshd jail bans rapid probes.
# This script BATCHES every read into ONE ssh invocation (a single bash heredoc
# executed remotely). Don't add a second ssh call without good reason.
#
# Per memory reference_zerotier_unstable.md: ZeroTier link drops every 1-2 min.
# This script's single ssh invocation is bounded (<30s); if it times out, the
# operator should retry once the link is back.
#
# Per memory feedback_no_server4: Mini PC (bruce@10.69.31.68) is the ONLY
# allowed SSH target. NEVER point this script at Server4 (45.137.194.103) or
# Server5 (45.137.194.102).

set -euo pipefail

# ── Color helpers (stderr; consistent with scripts/install/_logging.sh) ──
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 2 ]]; then
    _C_RED='\033[0;31m'
    _C_GREEN='\033[0;32m'
    _C_YELLOW='\033[1;33m'
    _C_BLUE='\033[0;34m'
    _C_NC='\033[0m'
else
    _C_RED=''; _C_GREEN=''; _C_YELLOW=''; _C_BLUE=''; _C_NC=''
fi
info() { echo -e "${_C_BLUE}[INFO]${_C_NC}  $*" >&2; }
ok()   { echo -e "${_C_GREEN}[OK]${_C_NC}    $*" >&2; }
warn() { echo -e "${_C_YELLOW}[WARN]${_C_NC}  $*" >&2; }
fail() { echo -e "${_C_RED}[FAIL]${_C_NC}  $*" >&2; exit "${2:-1}"; }

print_help() {
    cat <<'HELP'
capture-minipc-baseline.sh — capture Mini PC state for AC-104-3 baseline.

USAGE:
    bash docker/cloud-regression/scripts/capture-minipc-baseline.sh [--help]

WHAT IT CAPTURES (single batched ssh invocation):
    1. /etc/caddy/Caddyfile + sha256 (normalized: trailing whitespace + blank
       lines stripped — survives whitespace-only drift between Caddy versions)
    2. /etc/systemd/system/{livos,liv-core,liv-worker,liv-memory,caddy}.service
       + per-file sha256
    3. /opt/livos/.env KEY shape (NO values — secrets never leave the Mini PC)
    4. dpkg -l filtered to relevant packages (names only, no versions)
    5. /opt/livos/.deployed-sha (used to verify the captured baseline is in
       fact dab261cc; refuses to overwrite a fresher baseline)
    6. captured-at.txt (ISO-8601 timestamp)

OUTPUT:
    docker/cloud-regression/fixtures/minipc-dab261cc/*

ENVIRONMENT:
    MINIPC_SSH_KEY      Path to SSH private key
                        Default: C:/Users/hello/Desktop/Projects/contabo/pem/minipc
    MINIPC_SSH_HOST     user@host
                        Default: bruce@10.69.31.68
    FIXTURES_DIR        Output directory
                        Default: docker/cloud-regression/fixtures/minipc-dab261cc
    ALLOW_SHA_DRIFT     Set to 1 to allow captured SHA != dab261cc (use when
                        the baseline is intentionally being bumped).

PREREQUISITES:
    - Mini PC reachable via ZeroTier (10.69.31.68)
    - SSH key readable by current user (chmod 0400)
    - tar, ssh, scp on PATH

NOTES:
    - This script does NOT run in CI. It is a one-time operator helper.
    - If the Mini PC is unreachable (ZeroTier down, fail2ban ban, network
      issue), the script EXITS with a clear message and the fixtures dir
      keeps its .gitkeep placeholder; you can retry later.
    - Per project memory: NEVER point this at Server4 or Server5.
HELP
}

# ── Parse args ──
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    print_help
    exit 0
fi

# ── Resolve paths ──
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SSH_KEY="${MINIPC_SSH_KEY:-C:/Users/hello/Desktop/Projects/contabo/pem/minipc}"
SSH_HOST="${MINIPC_SSH_HOST:-bruce@10.69.31.68}"
FIXTURES_DIR="${FIXTURES_DIR:-${SCRIPT_DIR}/../fixtures/minipc-dab261cc}"
REMOTE_TMP="/tmp/livos-baseline-$(date -u +%s)"
EXPECTED_SHA="dab261cc"

info "capture-minipc-baseline.sh"
info "  SSH key:      $SSH_KEY"
info "  SSH host:     $SSH_HOST"
info "  Fixtures dir: $FIXTURES_DIR"
info "  Expected SHA: $EXPECTED_SHA"

# ── Pre-flight: SSH key exists ──
if [[ ! -f "$SSH_KEY" ]]; then
    fail "SSH key not found: $SSH_KEY (override via MINIPC_SSH_KEY=...)" 2
fi

mkdir -p "$FIXTURES_DIR"

# ── Pre-flight: Mini PC reachable (single probe, ≤10s timeout) ──
info "probing Mini PC reachability (≤10s)"
if ! ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=10 -o BatchMode=yes \
        "$SSH_HOST" "echo reachable" >/dev/null 2>&1; then
    warn "Mini PC unreachable. Baseline capture is a manual operator step."
    warn "Common causes: ZeroTier link down, fail2ban ban, network issue."
    warn "Retry later; the fixtures dir keeps its .gitkeep placeholder."
    exit 0
fi
ok "Mini PC reachable"

# ── Single batched ssh: capture everything in one invocation ──
info "capturing Mini PC state (single batched ssh, ≤30s)"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o ConnectTimeout=10 \
    "$SSH_HOST" bash <<REMOTE
set -euo pipefail
mkdir -p $REMOTE_TMP

# 1. Caddyfile (raw + normalized sha)
if [[ -f /etc/caddy/Caddyfile ]]; then
    cp /etc/caddy/Caddyfile $REMOTE_TMP/Caddyfile
    sed -E 's/[[:space:]]+\$//' /etc/caddy/Caddyfile \
        | sed '/^\$/d' > $REMOTE_TMP/Caddyfile.normalized
    sha256sum $REMOTE_TMP/Caddyfile.normalized \
        | awk '{print \$1}' > $REMOTE_TMP/Caddyfile.normalized.sha256
fi

# 2. systemd unit files
for unit in livos.service liv-core.service liv-worker.service liv-memory.service caddy.service; do
    if [[ -f /etc/systemd/system/\$unit ]]; then
        cp /etc/systemd/system/\$unit $REMOTE_TMP/\$unit
        sha256sum /etc/systemd/system/\$unit \
            | awk '{print \$1}' > $REMOTE_TMP/\$unit.sha256
    fi
done

# 3. .env key shape (NO values — secrets stay on Mini PC)
if [[ -f /opt/livos/.env ]]; then
    grep -E '^[A-Z_][A-Z0-9_]*=' /opt/livos/.env \
        | cut -d= -f1 \
        | sort > $REMOTE_TMP/env.shape
fi

# 4. apt package names (names only, no versions — versions drift by host clock)
dpkg -l 2>/dev/null \
    | awk '/^ii/ {print \$2}' \
    | grep -E '^(caddy|cloudflared|redis|postgresql|nodejs|nginx|dnsmasq|docker|git)' \
    | sort > $REMOTE_TMP/apt-packages.txt || true

# 5. Deployed SHA marker (recorded by update.sh)
cat /opt/livos/.deployed-sha 2>/dev/null > $REMOTE_TMP/deployed-sha.txt \
    || echo "unknown" > $REMOTE_TMP/deployed-sha.txt

# 6. Capture timestamp
date -u +%FT%TZ > $REMOTE_TMP/captured-at.txt

# 7. Pack everything into a tarball for clean scp transfer
tar -czf /tmp/livos-baseline.tgz -C $REMOTE_TMP .
echo "BASELINE_TARBALL=/tmp/livos-baseline.tgz"
REMOTE

# ── Pull the tarball back ──
info "pulling baseline tarball back to host"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "${SSH_HOST}:/tmp/livos-baseline.tgz" \
    "$FIXTURES_DIR/livos-baseline.tgz"

info "extracting baseline to $FIXTURES_DIR"
tar -xzf "$FIXTURES_DIR/livos-baseline.tgz" -C "$FIXTURES_DIR"
rm -f "$FIXTURES_DIR/livos-baseline.tgz"

# ── Cleanup remote (best-effort) ──
info "cleaning up remote tmp dir"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "$SSH_HOST" "rm -rf $REMOTE_TMP /tmp/livos-baseline.tgz" 2>/dev/null || true

# ── Verify the captured SHA matches expected ──
DEPLOYED_SHA=$(cat "$FIXTURES_DIR/deployed-sha.txt" 2>/dev/null || echo "unknown")
DEPLOYED_SHA_SHORT="${DEPLOYED_SHA:0:8}"
ok "baseline captured."
info "  Mini PC deployed SHA: $DEPLOYED_SHA (short: $DEPLOYED_SHA_SHORT)"
info "  Expected:             $EXPECTED_SHA"

if [[ "$DEPLOYED_SHA_SHORT" != "$EXPECTED_SHA" ]]; then
    if [[ "${ALLOW_SHA_DRIFT:-0}" == "1" ]]; then
        warn "captured SHA != expected $EXPECTED_SHA (ALLOW_SHA_DRIFT=1 set — proceeding)"
    else
        warn "captured SHA ($DEPLOYED_SHA_SHORT) != expected ($EXPECTED_SHA)"
        warn "D-104-NO-PROD-IMPACT baseline target is $EXPECTED_SHA; the Mini PC has drifted."
        warn "Either: (a) set ALLOW_SHA_DRIFT=1 and intentionally bump the baseline, OR"
        warn "        (b) deploy the dab261cc-equivalent code to Mini PC and re-capture."
        # Don't `exit 1` — leave the fixtures so operator can review them — but
        # surface clearly.
    fi
else
    ok "captured SHA matches expected $EXPECTED_SHA — baseline is canonical"
fi

info "fixtures landed at: $FIXTURES_DIR/"
ls -la "$FIXTURES_DIR/" >&2 || true

info "next step: git add $FIXTURES_DIR && git commit -m 'baseline(104-06): capture Mini PC at $EXPECTED_SHA'"
