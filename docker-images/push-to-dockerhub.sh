#!/usr/bin/env bash
# Push livos/* Docker images to Docker Hub.
#
# Pre-requisite: `docker login` as the Docker Hub user that owns the target
# namespace. Default namespace is `livos` (matches what livinityd's
# legacy-compat docker-compose.yml expects). Override with NS=<your-namespace>
# if `livos` is taken on Docker Hub by someone else — see README.md Option B.
#
# Usage:
#   docker login                                  # one-time
#   bash docker-images/push-to-dockerhub.sh       # push as livos/*
#   NS=utopusc bash push-to-dockerhub.sh          # push as utopusc/livos-*

set -euo pipefail

NS="${NS:-livos}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$SCRIPT_DIR")"  # repo root

# ── Pre-flight ──────────────────────────────────────────────────────────────

if ! docker info >/dev/null 2>&1; then
    echo "ERROR: docker daemon not reachable" >&2
    exit 1
fi

# Confirm we're logged in (any registry counts — Docker Hub is the default)
LOGGED_IN=$(docker info 2>/dev/null | grep -oE 'Username: \S+' || true)
if [[ -z "$LOGGED_IN" ]]; then
    echo "ERROR: not logged in to Docker Hub. Run: docker login" >&2
    exit 2
fi
echo "[INFO] Logged in as: $LOGGED_IN"
echo "[INFO] Target namespace: $NS"
echo ""

# ── Ensure local images exist (load from tar if needed) ─────────────────────

ensure_image_present() {
    local img="$1"
    local tarball="$2"
    if docker image inspect "$img" >/dev/null 2>&1; then
        return 0
    fi
    if [[ -f "$tarball" ]]; then
        echo "[INFO] Loading $img from $tarball..."
        gunzip -c "$tarball" | docker load
    else
        echo "ERROR: image $img not present locally and $tarball not found." >&2
        echo "       Regenerate with the commands in docker-images/README.md." >&2
        exit 3
    fi
}

ensure_image_present "livos/auth-server:1.0.5" "docker-images/livos-auth-server-1.0.5.tar.gz"
ensure_image_present "livos/tor:0.4.7.8"       "docker-images/livos-tor.tar.gz"
ensure_image_present "livos/tor:latest"        "docker-images/livos-tor.tar.gz"

# ── Re-tag if pushing under a different namespace ───────────────────────────

if [[ "$NS" != "livos" ]]; then
    echo "[INFO] Re-tagging under namespace '$NS' (livos → $NS/livos-*)..."
    docker tag livos/auth-server:1.0.5 "$NS/livos-auth-server:1.0.5"
    docker tag livos/tor:0.4.7.8       "$NS/livos-tor:0.4.7.8"
    docker tag livos/tor:latest        "$NS/livos-tor:latest"

    AUTH_REPO="$NS/livos-auth-server"
    TOR_REPO="$NS/livos-tor"
else
    AUTH_REPO="livos/auth-server"
    TOR_REPO="livos/tor"
fi

# ── Push ────────────────────────────────────────────────────────────────────

echo ""
echo "[INFO] Pushing $AUTH_REPO:1.0.5..."
docker push "$AUTH_REPO:1.0.5"

echo ""
echo "[INFO] Pushing $TOR_REPO:0.4.7.8..."
docker push "$TOR_REPO:0.4.7.8"

echo ""
echo "[INFO] Pushing $TOR_REPO:latest..."
docker push "$TOR_REPO:latest"

# ── Verification + reminder ─────────────────────────────────────────────────

echo ""
echo "================================================================"
echo "  ✓ Push complete"
echo "================================================================"
echo "  $AUTH_REPO:1.0.5"
echo "  $TOR_REPO:0.4.7.8"
echo "  $TOR_REPO:latest"
echo ""

if [[ "$NS" != "livos" ]]; then
    echo "[NEXT] Since you pushed under '$NS', update the compose file references:"
    echo "       File: livos/packages/livinityd/source/modules/apps/legacy-compat/docker-compose.yml"
    echo "       image: livos/auth-server:1.0.5  →  image: $NS/livos-auth-server:1.0.5"
    echo "       image: livos/tor:0.4.7.8        →  image: $NS/livos-tor:0.4.7.8"
    echo "       Then commit + push the compose-file change."
fi

echo ""
echo "[NEXT] Re-run Phase 105 UAT to confirm livinityd no longer crashes:"
echo "       Apps module 'docker compose up' will now pull these images from Docker Hub."
