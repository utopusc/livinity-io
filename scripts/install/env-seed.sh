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
    info "Writing default ${_env_file} (auto-generated secrets)"
    mkdir -p /opt/livos
    # R9 part 3: generate real secrets (mirror Path A deploy-livinityd.sh:_dld_write_env_file).
    # URL-safe (no @ / : / / which would break the redis:// and postgres:// URLs).
    _pg_pass=$(openssl rand -hex 24)
    _redis_pass=$(openssl rand -hex 24)
    umask 0177
    cat > "$_env_file" <<ENV
# /opt/livos/.env — seeded by scripts/install/env-seed.sh (Phase 196-02; secrets auto-generated Phase 252 R9)
DATABASE_URL=postgresql://livos:${_pg_pass}@localhost:5432/livos
REDIS_URL=redis://:${_redis_pass}@localhost:6379
JWT_SECRET_FILE=/opt/livos/data/secrets/jwt
ENV
    umask 0022
    chown bruce:bruce "$_env_file"
    chmod 0640 "$_env_file"
    # NEVER echo the generated secrets — only confirm they were written.
    unset _pg_pass _redis_pass
    ok "✓ ${_env_file} written with auto-generated DATABASE_URL + REDIS_URL secrets"
fi

info "✓ env-seed complete"
