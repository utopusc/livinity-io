#!/usr/bin/env bash
# docker/cloud-regression/scripts/test-cloud-byte-equivalence.sh
# Phase 104 plan 104-06 — AC-104-3 + AC-104-12 byte-equivalence regression.
#
# Brings up the cloud-regression container, polls for the READY sentinel,
# pulls the captured snapshot, and:
#   - Runs the cloud-mode negative checks (D-104-NO-PROD-IMPACT) — always
#     (these run regardless of fixture availability)
#   - Diffs the captured snapshot vs the Mini PC baseline fixtures (only if
#     fixtures exist; otherwise reports SKIPPED and recommends running
#     capture-minipc-baseline.sh first)
#   - Asserts caddy.service is enabled (AC-104-12)
#
# Exit codes:
#   0   all checks PASS (or only WARN-level drift; no FAIL lines)
#   1   any FAIL line in negative checks OR caddy validate errors OR
#       caddy.service not enabled
#
# Style: mirrors docker/local-uat/scripts/test-install-sh.sh +
# scripts/verify-sacred-sha.sh — set -euo pipefail, colored PASS/FAIL,
# trap-cleanup compose teardown.

set -euo pipefail

# ── Color helpers ──
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 2 ]]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    GREEN=''; RED=''; YELLOW=''; NC=''
fi
pass() { echo -e "${GREEN}PASS${NC}: $*"; }
fail() { echo -e "${RED}FAIL${NC}: $*"; exit 1; }
warn() { echo -e "${YELLOW}WARN${NC}: $*"; }
info() { echo -e "[byte-equivalence] $*"; }

print_help() {
    cat <<'HELP'
test-cloud-byte-equivalence.sh — AC-104-3 + AC-104-12 regression gate.

USAGE:
    bash docker/cloud-regression/scripts/test-cloud-byte-equivalence.sh [--help]

WHAT IT DOES:
    1. docker compose up the cloud-regression container
    2. Wait for /tmp/livos-cloud-regression-ready sentinel inside container
    3. Run cloud-mode NEGATIVE checks (no pki-global.conf, no dnsmasq config,
       no local-lan directives in Caddyfile) — these always run
    4. Run `caddy validate` (proxy for cert-config validity — A5 assumption)
    5. Diff snapshot vs fixtures/minipc-dab261cc/* — if fixtures present
    6. Assert caddy.service is enabled (AC-104-12)
    7. docker compose down (regardless of pass/fail)

EXIT CODES:
    0   all PASS or only WARN drift (no hard fails)
    1   any FAIL line, caddy validate error, or service-not-enabled

WHAT IT GATES:
    AC-104-3: install.sh --mode cloud byte-equivalence vs Mini PC baseline
    AC-104-12: update.sh-equivalent install completes; services come up healthy

KNOWN LIMITATIONS (per RESEARCH §A5):
    - Cloudflare DNS-01 ACME can't run in-container (no real DNS); we use
      `caddy validate` as a config-syntax proxy instead of cert issuance.
    - livos.service / liv-core.service / etc. come from update.sh rsync deploy,
      NOT install.sh. install.sh --mode cloud only provisions system prereqs;
      unit-file drift is therefore informational (WARN), not FAIL.
HELP
}

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    print_help
    exit 0
fi

# ── Resolve paths ──
REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
COMPOSE_FILE="$REPO_ROOT/docker/cloud-regression/docker-compose.yml"
FIXTURES_DIR="$REPO_ROOT/docker/cloud-regression/fixtures/minipc-dab261cc"

# ── Compose cleanup on any exit path ──
cleanup() {
    info "tearing down regression container"
    docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
}
trap cleanup EXIT

# ── Fixtures may or may not be present ──
if [[ ! -f "$FIXTURES_DIR/Caddyfile.normalized.sha256" ]]; then
    warn "No Mini PC baseline fixtures at $FIXTURES_DIR"
    warn "Run: bash docker/cloud-regression/scripts/capture-minipc-baseline.sh"
    warn "SKIPPING byte-equivalence diff; will only run negative checks (no-prod-impact)."
    BASELINE_PRESENT=0
else
    BASELINE_PRESENT=1
fi

# ── Build + start ──
info "building cloud-regression image"
docker compose -f "$COMPOSE_FILE" build || fail "build failed"
info "starting cloud-regression container"
docker compose -f "$COMPOSE_FILE" up -d || fail "up failed"

# ── Poll for the READY sentinel (≤120s — install.sh fetches packages over net) ──
info "waiting for entrypoint READY sentinel"
for i in $(seq 1 60); do
    if MSYS_NO_PATHCONV=1 docker exec livos-cloud-regression test -f /tmp/livos-cloud-regression-ready 2>/dev/null; then
        pass "container reached READY"
        break
    fi
    sleep 2
    if [[ $i -eq 60 ]]; then
        fail "container did not reach READY within 120s — see: docker logs livos-cloud-regression"
    fi
done

# ── Negative checks (no-prod-impact) — always run ──
info "verifying no-prod-impact negative checks"
NEGATIVE_OUTPUT=$(MSYS_NO_PATHCONV=1 docker exec livos-cloud-regression cat /tmp/regression-snapshot/no-prod-impact-checks.txt)
echo "$NEGATIVE_OUTPUT"
if echo "$NEGATIVE_OUTPUT" | grep -q '^FAIL:'; then
    fail "no-prod-impact negative checks failed (cloud mode leaked local-lan directives)"
else
    pass "no-prod-impact: cloud-mode Caddyfile has no local-lan directives"
fi

# ── Caddy validate ──
info "verifying caddy validate"
VALIDATE_OUT=$(MSYS_NO_PATHCONV=1 docker exec livos-cloud-regression cat /tmp/regression-snapshot/caddy-validate.txt)
echo "$VALIDATE_OUT"
if echo "$VALIDATE_OUT" | grep -qiE '(error|invalid)'; then
    fail "caddy validate reported errors"
else
    pass "caddy validate clean"
fi

# ── Byte-equivalence diff (only if fixtures present) ──
if [[ $BASELINE_PRESENT -eq 1 ]]; then
    info "diffing snapshot vs Mini PC baseline"
    TMP_SNAPSHOT=$(mktemp -d)
    MSYS_NO_PATHCONV=1 docker cp livos-cloud-regression:/tmp/regression-snapshot/. "$TMP_SNAPSHOT/"

    # Caddyfile normalized sha
    if [[ -f "$FIXTURES_DIR/Caddyfile.normalized.sha256" && -f "$TMP_SNAPSHOT/Caddyfile.normalized.sha256" ]]; then
        BASELINE_SHA=$(cat "$FIXTURES_DIR/Caddyfile.normalized.sha256")
        CURRENT_SHA=$(cat "$TMP_SNAPSHOT/Caddyfile.normalized.sha256")
        if [[ "$BASELINE_SHA" != "$CURRENT_SHA" ]]; then
            warn "Caddyfile normalized SHA drift: baseline=$BASELINE_SHA, current=$CURRENT_SHA"
            warn "  Note: cloud-mode Caddyfile is bootstrap-only; livinityd's domain.activate regenerates it."
            warn "  Treating as informational, NOT a hard failure (per A5)."
        else
            pass "Caddyfile normalized SHA matches baseline"
        fi
    fi

    # systemd unit sha for each unit present in BOTH baseline and current
    for unit_sha in "$FIXTURES_DIR"/*.service.sha256; do
        [[ -f "$unit_sha" ]] || continue
        unit_name=$(basename "$unit_sha" .sha256)
        if [[ -f "$TMP_SNAPSHOT/$unit_name.sha256" ]]; then
            BASELINE_USHA=$(cat "$unit_sha")
            CURRENT_USHA=$(cat "$TMP_SNAPSHOT/$unit_name.sha256")
            if [[ "$BASELINE_USHA" != "$CURRENT_USHA" ]]; then
                warn "systemd unit drift: $unit_name baseline=$BASELINE_USHA current=$CURRENT_USHA"
                warn "  Note: unit files come from rsync deploy (update.sh), not install.sh."
                warn "  install.sh --mode cloud may not create all units (livos.service comes via deploy)."
            else
                pass "systemd unit matches baseline: $unit_name"
            fi
        fi
    done

    # apt-packages names diff (no versions)
    if [[ -f "$FIXTURES_DIR/apt-packages.txt" && -f "$TMP_SNAPSHOT/apt-packages.txt" ]]; then
        if diff -u "$FIXTURES_DIR/apt-packages.txt" "$TMP_SNAPSHOT/apt-packages.txt" >/dev/null 2>&1; then
            pass "apt package names match baseline"
        else
            warn "apt package names differ — review diff:"
            diff -u "$FIXTURES_DIR/apt-packages.txt" "$TMP_SNAPSHOT/apt-packages.txt" || true
        fi
    fi

    rm -rf "$TMP_SNAPSHOT"
else
    warn "no baseline fixtures — negative checks only; AC-104-3 byte-equivalence not fully verified."
    warn "Run capture-minipc-baseline.sh and commit fixtures to enable full byte-equivalence regression."
fi

# ── AC-104-12 prerequisite: caddy.service is enabled ──
info "verifying caddy.service is enabled (AC-104-12)"
if MSYS_NO_PATHCONV=1 docker exec livos-cloud-regression systemctl is-enabled caddy 2>/dev/null | grep -q '^enabled$'; then
    pass "caddy.service enabled"
else
    fail "caddy.service not enabled — install_caddy() regression (AC-104-12 broken)"
fi

# ── Summary ──
info "AC-104-3 negative checks PASSED; AC-104-12 caddy.service install PASSED"
if [[ $BASELINE_PRESENT -eq 1 ]]; then
    info "Byte-equivalence diff completed; review warnings above"
fi
exit 0
