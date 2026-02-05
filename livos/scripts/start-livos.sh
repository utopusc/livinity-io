#!/bin/bash
# Livos (livinityd) Startup Script
# Sources environment from /opt/livos/.env and starts livinityd

set -a
source /opt/livos/.env
set +a

cd /opt/livos/livos
exec npx tsx packages/livinityd/source/cli.ts --data-directory /opt/livos/data --port 8080
