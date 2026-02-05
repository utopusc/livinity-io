#!/bin/bash
# Nexus Core Startup Script
# Sources environment from /opt/livos/.env and starts the core service

set -a
source /opt/livos/.env
set +a

cd /opt/nexus/app
exec node packages/core/dist/index.js
