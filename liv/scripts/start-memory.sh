#!/bin/bash
# Memory Service Startup Script
# Sources environment from /opt/livos/.env and starts the memory service

set -a
source /opt/livos/.env
set +a

# Override REDIS_URL with URL-encoded password if needed
# The .env should already have URL-encoded special characters
cd /opt/livos/nexus/packages/memory
exec node dist/index.js
