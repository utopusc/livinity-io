#!/usr/bin/env bash
# docker/local-uat/scripts/test-install-sh.sh
# Wrapper: docker compose up --build, run walk.mjs, docker compose down.
# Source: pattern from scripts/verify-sacred-sha.sh.

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
COMPOSE_FILE="$REPO_ROOT/docker/local-uat/docker-compose.yml"
WALK_MJS="$REPO_ROOT/docker/local-uat/uat-driver/walk.mjs"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "[test-install-sh] $*"; }
pass() { echo -e "${GREEN}PASS${NC}: $*"; }
fail() { echo -e "${RED}FAIL${NC}: $*"; exit 1; }

cleanup() {
    log "tearing down compose stack"
    docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
}
trap cleanup EXIT

log "building UAT image"
docker compose -f "$COMPOSE_FILE" build || fail "docker compose build failed"

log "starting UAT container"
docker compose -f "$COMPOSE_FILE" up -d || fail "docker compose up failed"

log "waiting for readiness sentinel (/tmp/livos-uat-ready inside container)"
for i in $(seq 1 30); do
    if docker exec livos-uat test -f /tmp/livos-uat-ready 2>/dev/null; then
        pass "container reached READY state"
        break
    fi
    sleep 2
    [[ $i -eq 30 ]] && fail "container did not reach READY within 60s — see: docker logs livos-uat"
done

log "running walk.mjs from host (node --test)"
if node --test "$WALK_MJS"; then
    pass "walk.mjs passed"
    exit 0
else
    fail "walk.mjs failed — see logs above + docker logs livos-uat"
fi
