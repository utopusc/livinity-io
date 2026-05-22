#!/usr/bin/env bash
# scripts/install/env-seed.sh
# Phase 196-02 — seed /opt/livos/.env + /opt/livos/data/secrets/jwt.
#
# Idempotency:
#   - /opt/livos/data/secrets directory: created with mode 0700 owner bruce.
#   - /opt/livos/data/secrets/jwt: written ONLY if missing (existing JWTs are
#     never rotated — that would invalidate every active session).
#   - /opt/livos/.env: written ONLY if missing (an existing .env is sacred to
#     operator-customized config; we never overwrite).
#
# STRIDE T-196-02-03 (Information Disclosure): the JWT file is chmod 0600
# bruce:bruce and the contents are never echoed to the install log.
# STRIDE T-196-02-04 (DoS via reset): detect-then-skip preserves existing
# /opt/livos/.env and existing JWT secret.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=_logging.sh
[[ -f "${SCRIPT_DIR}/_logging.sh" ]] && source "${SCRIPT_DIR}/_logging.sh"

step "Phase 196-02 — env + secrets seed"

if [[ $EUID -ne 0 ]]; then
    fail "env-seed: must run as root (writes under /opt/livos with bruce ownership)" 77
fi

# ── Secrets dir ─────────────────────────────────────────────────────────────
_secrets_dir="/opt/livos/data/secrets"
if [[ -d "$_secrets_dir" ]]; then
    ok "✓ ${_secrets_dir} already present"
else
    info "Creating ${_secrets_dir} (mode 0700 owner bruce:bruce)"
    mkdir -p "$_secrets_dir"
fi
# Always reconcile ownership + mode (cheap, defensive).
chown -R bruce:bruce /opt/livos/data 2>/dev/null || true
chmod 0700 "$_secrets_dir" || true

# ── JWT secret ─────────────────────────────────────────────────────────────
_jwt_file="${_secrets_dir}/jwt"
if [[ -s "$_jwt_file" ]]; then
    ok "✓ ${_jwt_file} already present (not rotating)"
else
    info "Generating ${_jwt_file} (64 random bytes, base64)"
    # NEVER echo the contents.
    umask 0177
    head -c 64 /dev/urandom | base64 -w0 > "$_jwt_file"
    umask 0022
    chown bruce:bruce "$_jwt_file"
    chmod 0600 "$_jwt_file"
    ok "JWT secret written ($(wc -c < "$_jwt_file") bytes)"
fi

# ── .env (only if missing) ─────────────────────────────────────────────────
_env_file="/opt/livos/.env"
if [[ -f "$_env_file" ]]; then
    ok "✓ ${_env_file} already present (operator-customized — not overwriting)"
else
    info "Writing default ${_env_file} (CHANGEME passwords — rotate before service-up!)"
    mkdir -p /opt/livos
    cat > "$_env_file" <<'ENV'
# /opt/livos/.env — seeded by scripts/install/env-seed.sh (Phase 196-02)
# IMPORTANT: rotate CHANGEME passwords before starting services in production.

DATABASE_URL=postgresql://livos:CHANGEME@localhost:5432/livos
REDIS_URL=redis://:CHANGEME@localhost:6379
JWT_SECRET_FILE=/opt/livos/data/secrets/jwt
ENV
    chown bruce:bruce "$_env_file"
    chmod 0640 "$_env_file"
    warn "⚠ ${_env_file} contains CHANGEME placeholders — update DATABASE_URL + REDIS_URL passwords before service-up!"
fi

info "✓ env-seed complete"
