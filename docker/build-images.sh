#!/usr/bin/env bash
# Build LivOS Docker images from Umbrel sources
# Usage: ./build-images.sh [push]

set -euo pipefail

DOCKER_ORG="${DOCKER_ORG:-livos}"
UMBREL_REPO="https://github.com/getumbrel/umbrel.git"
TEMP_DIR="/tmp/umbrel-source"

# Image versions
AUTH_VERSION="1.0.5"
TOR_VERSION="0.4.7.8"

echo "Building LivOS Docker images..."

# Clone Umbrel repo (sparse checkout for containers only)
if [[ -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
fi

echo "Cloning Umbrel containers..."
git clone --depth 1 --filter=blob:none --sparse "$UMBREL_REPO" "$TEMP_DIR"
cd "$TEMP_DIR"
git sparse-checkout set containers

# Build auth-server
echo "Building $DOCKER_ORG/auth-server:$AUTH_VERSION..."
cd "$TEMP_DIR/containers/app-auth"
docker build -t "$DOCKER_ORG/auth-server:$AUTH_VERSION" .
docker tag "$DOCKER_ORG/auth-server:$AUTH_VERSION" "$DOCKER_ORG/auth-server:latest"

# Build tor
echo "Building $DOCKER_ORG/tor:$TOR_VERSION..."
cd "$TEMP_DIR/containers/tor"
docker build -t "$DOCKER_ORG/tor:$TOR_VERSION" .
docker tag "$DOCKER_ORG/tor:$TOR_VERSION" "$DOCKER_ORG/tor:latest"

echo ""
echo "Images built successfully:"
docker images | grep "$DOCKER_ORG"

# Push if requested
if [[ "${1:-}" == "push" ]]; then
    echo ""
    echo "Pushing images to Docker Hub..."
    docker push "$DOCKER_ORG/auth-server:$AUTH_VERSION"
    docker push "$DOCKER_ORG/auth-server:latest"
    docker push "$DOCKER_ORG/tor:$TOR_VERSION"
    docker push "$DOCKER_ORG/tor:latest"
    echo "Images pushed!"
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "Done!"
