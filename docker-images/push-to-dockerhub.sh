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

# Confirm we're logged in. Try three signals (in order of reliability):
#   1) `docker info` Username field — works for `docker login -u <user>` mode
#   2) ~/.docker/config.json `auths` field — works for Docker Desktop web-based login
#   3) credsStore=desktop in config — Docker Desktop manages credentials externally
# If ANY signal indicates login, proceed (Docker will give a clear push-time error
# if creds are actually invalid). The previous strict-only-signal-1 check failed
# on Docker Desktop's web-based login flow.
LOGGED_IN_USER=""
if command -v docker >/dev/null 2>&1; then
    LOGGED_IN_USER=$(docker info 2>/dev/null | grep -oE 'Username: \S+' | awk '{print $2}' || true)
fi
DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}/config.json"
HAS_AUTHS=""
HAS_CREDSTORE=""
if [[ -f "$DOCKER_CONFIG" ]]; then
    HAS_AUTHS=$(grep -oE '"auths"[[:space:]]*:[[:space:]]*\{[^}]' "$DOCKER_CONFIG" 2>/dev/null || true)
    HAS_CREDSTORE=$(grep -oE '"credsStore"[[:space:]]*:[[:space:]]*"[a-z]+"' "$DOCKER_CONFIG" 2>/dev/null || true)
fi

if [[ -z "$LOGGED_IN_USER" && -z "$HAS_AUTHS" && -z "$HAS_CREDSTORE" ]]; then
    echo "ERROR: No Docker Hub login detected." >&2
    echo "       Run: docker login" >&2
    echo "       (If Docker Desktop has logged you in but this still errors, run" >&2
    echo "        the docker push commands manually — see docker-images/README.md.)" >&2
    exit 2
fi

if [[ -n "$LOGGED_IN_USER" ]]; then
    echo "[INFO] Logged in as: $LOGGED_IN_USER"
elif [[ -n "$HAS_CREDSTORE" ]]; then
    echo "[INFO] Docker Desktop credential store detected (login managed externally)"
else
    echo "[INFO] Docker config.json contains auths entries — assuming logged in"
fi
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
