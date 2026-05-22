#!/usr/bin/env bash
# Phase 197-03 — Enable pgvector extension on the livos PostgreSQL database.
#
# Idempotent: safe to re-run any number of times. Designed to be invoked by
# install.sh on first install AND by operator manually post-update.sh.
#
# Threat mitigations:
#   T-197-03-01 — idempotent SQL + dpkg -s guard. Re-runs are no-ops, exit 0.
#                 NO destructive (remove-table) statements anywhere.
#   T-197-03-04 — apt-get install network failure exits non-zero with clear msg.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_logging.sh
. "$SCRIPT_DIR/_logging.sh"

info "Phase 197-03 — pgvector extension setup"

# 1. Detect-and-skip apt install (T-197-03-01)
if dpkg -s postgresql-16-pgvector >/dev/null 2>&1; then
    info "postgresql-16-pgvector already installed"
else
    info "Installing postgresql-16-pgvector via apt-get"
    if ! sudo apt-get install -y postgresql-16-pgvector; then
        fail "Phase 197-03 — apt-get install postgresql-16-pgvector FAILED"
        fail "Check network connectivity + apt repository configuration"
        exit 1
    fi
    ok "postgresql-16-pgvector installed"
fi

# 2. Idempotent extension creation
info "Ensuring vector extension on livos database"
if sudo -u postgres psql -d livos -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS vector;' >/dev/null 2>&1; then
    ok "pgvector extension present on livos database"
else
    fail "Phase 197-03 — extension enable FAILED on livos database"
    fail "Check PostgreSQL service status: systemctl is-active postgresql"
    exit 1
fi

info "Phase 197-03 — pgvector-enable.sh complete"
