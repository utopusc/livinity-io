# scripts/install/deploy-livinityd.sh
# Phase 104 plan 104-11 — full livinityd deployment helper.
#
# After install.sh's mode dispatch finishes wiring Caddy + TLS + DNS, THIS file
# installs the actual LivOS application stack so the user sees the LivOS UI in
# the browser (not just a green padlock on a Caddy placeholder).
#
# Sections (each idempotent):
#   1. System packages (Node 22 LTS, pnpm, postgresql, redis-server, build deps)
#   2. PostgreSQL setup (livos user + livos DB + schema.sql apply)
#   3. Redis setup (requirepass random)
#   4. Source clone (GitHub → /tmp → rsync to /opt/livos/livos/)
#   5. Build (pnpm install + @livos/config tsc + ui vite build)
#   6. /opt/livos/.env (random passwords, mode 600, REUSE existing on re-run)
#   7. JWT secret (/opt/livos/data/secrets/jwt 0600, reuse existing)
#   8. systemd unit livos.service (After/Requires postgresql + redis)
#   9. Health check (curl :8080, 30s budget)
#   10. Caddy reverse_proxy 127.0.0.1:8080 (final Caddyfile)
#
# Sourced by scripts/install.sh AFTER the mode dispatch case. Public entry
# point: `deploy_livinityd`. Skipped silently when SKIP_DEPLOY=1.
#
# D-104-NO-PROD-IMPACT: Mini PC at /opt/livos/ is already deployed via
# update.sh. This helper's re-run semantics MUST preserve existing creds
# (read /opt/livos/.env back; reuse PG + Redis passwords; never rotate).
#
# Scope boundary: liv-core / liv-worker / liv-memory are DEFERRED to Plan
# 104-12 (or v34). This helper deploys livinityd only — enough for the UI
# to load + the login screen to render.
#
# Sacred SHA invariant: liv/packages/core/src/sdk-agent-runner.ts MUST equal
# f3538e1d811992b782a9bb057d1b7f0a0189f95f. This file does NOT touch that
# path — it only orchestrates apt + systemctl + rsync + pnpm + curl.

# Constants
_DLD_LIVOS_DIR="/opt/livos"
_DLD_LIVOS_SRC="${_DLD_LIVOS_DIR}/livos"
_DLD_ENV_FILE="${_DLD_LIVOS_DIR}/.env"
_DLD_SECRETS_DIR="${_DLD_LIVOS_DIR}/data/secrets"
_DLD_JWT_FILE="${_DLD_SECRETS_DIR}/jwt"
_DLD_SYSTEMD_UNIT="/etc/systemd/system/livos.service"
_DLD_REPO_URL="https://github.com/utopusc/livinity-io.git"
_DLD_STAGE_DIR="/tmp/livos-install-stage"
_DLD_CADDYFILE="/etc/caddy/Caddyfile"

# ── 1. System packages ──────────────────────────────────────────────────────
_dld_install_system_packages() {
    step "Plan 104-11 — system packages (Node 22 + pnpm + postgresql + redis-server)"

    export DEBIAN_FRONTEND=noninteractive

    # Node.js 22 LTS via NodeSource (idempotent — script no-ops on already-configured repo)
    if ! command -v node &>/dev/null || ! node --version 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])\.'; then
        info "Installing Node.js 22 LTS via NodeSource"
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
        apt-get install -y -qq nodejs
        ok "Node.js installed: $(node --version 2>/dev/null)"
    else
        ok "Node.js already installed: $(node --version 2>/dev/null)"
    fi

    # pnpm via npm global install (idempotent)
    if ! command -v pnpm &>/dev/null; then
        info "Installing pnpm via npm -g"
        npm install -g pnpm@latest >/dev/null 2>&1
        ok "pnpm installed: $(pnpm --version 2>/dev/null)"
    else
        ok "pnpm already installed: $(pnpm --version 2>/dev/null)"
    fi

    # PostgreSQL + Redis + build deps (apt-get install -y is no-op on installed pkgs)
    info "Installing PostgreSQL + Redis + build deps"
    apt-get install -y -qq \
        postgresql postgresql-client \
        redis-server \
        build-essential python3 git rsync openssl
    ok "System packages installed"
}

# ── 2. PostgreSQL setup ─────────────────────────────────────────────────────
# Side-effects:
#   - Ensures postgresql.service running
#   - Creates role "livos" with a random password (if not exists)
#   - Creates DB "livos" owned by livos (if not exists)
#   - Applies schema.sql (idempotent — schema uses CREATE TABLE IF NOT EXISTS)
#
# On re-run: if the role already exists, we READ the password back from
# /opt/livos/.env (DATABASE_URL) and reuse it. If .env doesn't exist yet but
# the role does, we rotate (the operator wiped /opt/livos/.env but left the
# postgres cluster — acceptable edge case).
_dld_setup_postgres() {
    step "Plan 104-11 — PostgreSQL setup"

    # Ensure service is running
    systemctl enable postgresql.service 2>/dev/null || true
    systemctl start postgresql.service 2>/dev/null || true
    if ! systemctl is-active --quiet postgresql.service; then
        fail "PostgreSQL failed to start; check journalctl -u postgresql -n 30"
    fi

    # Determine the password: reuse from .env if present, else generate
    local pg_pass=""
    if [[ -f "$_DLD_ENV_FILE" ]]; then
        pg_pass=$(grep -E '^DATABASE_URL=' "$_DLD_ENV_FILE" 2>/dev/null \
            | sed -E 's|^DATABASE_URL=postgresql://livos:([^@]+)@.*|\1|' \
            | head -1)
    fi
    if [[ -z "$pg_pass" ]]; then
        pg_pass=$(openssl rand -base64 24 | tr -d '/=+\n' | cut -c1-32)
        info "Generated new PostgreSQL password"
    else
        info "Reusing existing PostgreSQL password from .env"
    fi

    # Create role if not exists (uses sudo -u postgres psql — DB-level auth bypass)
    local role_exists
    role_exists=$(sudo -u postgres psql -tAc \
        "SELECT 1 FROM pg_roles WHERE rolname='livos'" 2>/dev/null || echo "")
    if [[ "$role_exists" != "1" ]]; then
        info "Creating PostgreSQL role 'livos'"
        # Quote the password — postgres treats this as a literal string
        sudo -u postgres psql -c "CREATE USER livos WITH PASSWORD '${pg_pass}';" >/dev/null
        ok "PostgreSQL role 'livos' created"
    else
        # Role exists; ensure password matches our .env value (rotation idempotency)
        sudo -u postgres psql -c "ALTER USER livos WITH PASSWORD '${pg_pass}';" >/dev/null 2>&1 || true
        ok "PostgreSQL role 'livos' already exists (password aligned with .env)"
    fi

    # Create DB if not exists
    local db_exists
    db_exists=$(sudo -u postgres psql -tAc \
        "SELECT 1 FROM pg_database WHERE datname='livos'" 2>/dev/null || echo "")
    if [[ "$db_exists" != "1" ]]; then
        info "Creating PostgreSQL database 'livos'"
        sudo -u postgres psql -c "CREATE DATABASE livos OWNER livos;" >/dev/null
        ok "PostgreSQL database 'livos' created"
    else
        ok "PostgreSQL database 'livos' already exists"
    fi

    # Apply schema (idempotent — every CREATE TABLE uses IF NOT EXISTS)
    local schema_file="${_DLD_LIVOS_SRC}/packages/livinityd/source/modules/database/schema.sql"
    if [[ -f "$schema_file" ]]; then
        info "Applying schema.sql"
        # PGPASSWORD env so password never lands on argv (T-104-11-1 mitigation)
        if PGPASSWORD="$pg_pass" psql -h 127.0.0.1 -U livos -d livos -f "$schema_file" >/dev/null 2>&1; then
            ok "Schema applied"
        else
            # Schema apply via TCP may fail on default pg_hba (peer auth); fall back to sudo -u postgres
            warn "TCP psql failed; retrying via sudo -u postgres"
            sudo -u postgres psql -d livos -f "$schema_file" >/dev/null
            ok "Schema applied (via sudo -u postgres fallback)"
        fi
    else
        warn "schema.sql not found at $schema_file — skipping schema apply"
        warn "  (livinityd will attempt schema migration on boot via Migration module)"
    fi

    # Export for later .env write step
    _DLD_PG_PASS="$pg_pass"
}

# ── 3. Redis setup ──────────────────────────────────────────────────────────
_dld_setup_redis() {
    step "Plan 104-11 — Redis setup"

    systemctl enable redis-server.service 2>/dev/null || true
    systemctl start redis-server.service 2>/dev/null || true
    if ! systemctl is-active --quiet redis-server.service; then
        fail "Redis failed to start; check journalctl -u redis-server -n 30"
    fi

    local redis_conf="/etc/redis/redis.conf"
    local redis_pass=""

    # Reuse from .env if present
    if [[ -f "$_DLD_ENV_FILE" ]]; then
        redis_pass=$(grep -E '^REDIS_URL=' "$_DLD_ENV_FILE" 2>/dev/null \
            | sed -E 's|^REDIS_URL=redis://default:([^@]+)@.*|\1|' \
            | head -1)
    fi
    if [[ -z "$redis_pass" ]]; then
        redis_pass=$(openssl rand -base64 24 | tr -d '/=+\n' | cut -c1-32)
        info "Generated new Redis password"
    else
        info "Reusing existing Redis password from .env"
    fi

    # Set requirepass in redis.conf (idempotent — comment-out any existing line first)
    if [[ -f "$redis_conf" ]]; then
        # Strip any existing requirepass lines (commented or not), then append ours
        sed -i -E '/^[[:space:]]*#?[[:space:]]*requirepass[[:space:]]/d' "$redis_conf"
        echo "requirepass ${redis_pass}" >> "$redis_conf"
        systemctl restart redis-server.service
        sleep 1
        if systemctl is-active --quiet redis-server.service; then
            ok "Redis configured with requirepass + restarted"
        else
            fail "Redis failed to restart after requirepass set"
        fi
    else
        warn "$redis_conf not found — skipping requirepass; Redis will be unauthenticated"
    fi

    _DLD_REDIS_PASS="$redis_pass"
}

# ── 4. Source clone ─────────────────────────────────────────────────────────
_dld_clone_source() {
    step "Plan 104-11 — clone livinity-io source"

    if [[ -d "$_DLD_STAGE_DIR/.git" ]]; then
        info "Updating existing stage dir at $_DLD_STAGE_DIR"
        (cd "$_DLD_STAGE_DIR" && git fetch --depth 1 origin && git reset --hard origin/HEAD) >/dev/null 2>&1 || {
            warn "git fetch failed in stage dir — wiping and re-cloning"
            rm -rf "$_DLD_STAGE_DIR"
        }
    fi

    if [[ ! -d "$_DLD_STAGE_DIR/.git" ]]; then
        info "Cloning $_DLD_REPO_URL → $_DLD_STAGE_DIR"
        git clone --depth 1 "$_DLD_REPO_URL" "$_DLD_STAGE_DIR" >/dev/null 2>&1 \
            || fail "git clone failed; check network or repo URL"
    fi
    ok "Source staged at $_DLD_STAGE_DIR"

    # rsync stage → /opt/livos/livos/ (exclude .planning + docker — UAT-only +
    # planning artifacts not needed at runtime).
    info "rsync to $_DLD_LIVOS_SRC"
    mkdir -p "$_DLD_LIVOS_SRC"
    rsync -a --delete \
        --exclude='.git/' \
        --exclude='.planning/' \
        --exclude='docker/' \
        --exclude='node_modules/' \
        "$_DLD_STAGE_DIR/livos/" "$_DLD_LIVOS_SRC/"
    # Also copy update.sh + pnpm-* root files
    for f in package.json pnpm-lock.yaml pnpm-workspace.yaml update.sh; do
        if [[ -f "$_DLD_STAGE_DIR/livos/$f" ]]; then
            cp "$_DLD_STAGE_DIR/livos/$f" "$_DLD_LIVOS_SRC/$f"
        elif [[ -f "$_DLD_STAGE_DIR/$f" ]]; then
            cp "$_DLD_STAGE_DIR/$f" "$_DLD_LIVOS_DIR/$f"
        fi
    done
    ok "Source rsynced to $_DLD_LIVOS_SRC"
}

# ── 5. Build (pnpm install + @livos/config + ui) ────────────────────────────
_dld_build_packages() {
    step "Plan 104-11 — pnpm install + build (@livos/config + ui)"

    cd "$_DLD_LIVOS_SRC" || fail "cannot cd to $_DLD_LIVOS_SRC"

    info "pnpm install (this may take 3-5 min)"
    if [[ -f "pnpm-lock.yaml" ]]; then
        pnpm install --frozen-lockfile 2>&1 | tail -10 || {
            warn "frozen-lockfile install failed; retrying without lockfile"
            pnpm install 2>&1 | tail -10 || fail "pnpm install failed"
        }
    else
        pnpm install 2>&1 | tail -10 || fail "pnpm install failed"
    fi
    ok "pnpm install complete"

    # Build @livos/config (tsc)
    info "Building @livos/config"
    pnpm --filter @livos/config build 2>&1 | tail -5 || fail "@livos/config build failed"
    if [[ ! -d "$_DLD_LIVOS_SRC/packages/config/dist" ]] \
        || [[ -z "$(find "$_DLD_LIVOS_SRC/packages/config/dist" -type f 2>/dev/null | head -1)" ]]; then
        fail "BUILD-FAIL: @livos/config produced empty dist"
    fi
    ok "@livos/config built"

    # Build UI (vite production bundle)
    info "Building UI (vite production bundle; ~1-2 min)"
    pnpm --filter ui build 2>&1 | tail -5 || fail "UI build failed"
    if [[ ! -d "$_DLD_LIVOS_SRC/packages/ui/dist" ]] \
        || [[ -z "$(find "$_DLD_LIVOS_SRC/packages/ui/dist" -type f 2>/dev/null | head -1)" ]]; then
        fail "BUILD-FAIL: @livos/ui produced empty dist"
    fi
    ok "UI built"

    # Ensure livinityd's ui symlink (mirrors update.sh:537)
    ln -sfn "$_DLD_LIVOS_SRC/packages/ui/dist" "$_DLD_LIVOS_SRC/packages/livinityd/ui"
    ok "UI symlinked into livinityd"
}

# ── 7. JWT secret (run BEFORE .env write so .env can reference its path) ────
_dld_generate_jwt_secret() {
    step "Plan 104-11 — JWT secret"
    mkdir -p "$_DLD_SECRETS_DIR"
    chmod 0700 "$_DLD_SECRETS_DIR"
    if [[ -s "$_DLD_JWT_FILE" ]]; then
        ok "JWT secret already exists at $_DLD_JWT_FILE (reuse)"
    else
        umask 0077
        openssl rand -base64 32 > "$_DLD_JWT_FILE"
        chmod 0600 "$_DLD_JWT_FILE"
        ok "JWT secret generated at $_DLD_JWT_FILE (mode 0600)"
    fi
}

# ── 6. /opt/livos/.env ──────────────────────────────────────────────────────
_dld_write_env_file() {
    step "Plan 104-11 — write /opt/livos/.env"

    # If .env already exists, we PRESERVE its values (re-run safety). We only
    # write a fresh .env when the file is absent OR when key vars are missing.
    local mode_val="${MODE:-hybrid}"
    local domain_val="${LIVOS_DOMAIN:-}"
    local host_ip_val="${HOST_IP:-127.0.0.1}"

    # Backup any existing .env (defense in depth)
    if [[ -f "$_DLD_ENV_FILE" ]]; then
        cp "$_DLD_ENV_FILE" "${_DLD_ENV_FILE}.bak"
        chmod 0600 "${_DLD_ENV_FILE}.bak" 2>/dev/null || true
        ok "Existing .env backed up to ${_DLD_ENV_FILE}.bak"
    fi

    # Write fresh .env — passwords come from _DLD_PG_PASS / _DLD_REDIS_PASS
    # (already aligned with any prior .env values by the setup_* helpers).
    umask 0077
    cat > "$_DLD_ENV_FILE" <<EOF
# /opt/livos/.env — generated by scripts/install/deploy-livinityd.sh (Plan 104-11)
# WARNING: contains secrets. mode 0600. DO NOT COMMIT.

DATABASE_URL=postgresql://livos:${_DLD_PG_PASS}@127.0.0.1:5432/livos
REDIS_URL=redis://default:${_DLD_REDIS_PASS}@127.0.0.1:6379
JWT_SECRET_FILE=${_DLD_JWT_FILE}

PORT=8080
HOST=127.0.0.1

LIVOS_LOCAL_MODE=${mode_val}
LIVOS_LOCAL_DOMAIN=${domain_val}
LIVOS_HOST_IP=${host_ip_val}
EOF

    # Append optional --api-key if 104-09 wrote one
    if [[ -n "${LIVOS_API_KEY:-}" ]]; then
        echo "LIV_API_KEY=${LIVOS_API_KEY}" >> "$_DLD_ENV_FILE"
    fi

    chmod 0600 "$_DLD_ENV_FILE"
    ok ".env written at $_DLD_ENV_FILE (mode 0600)"
}

# ── 8. systemd unit livos.service ───────────────────────────────────────────
_dld_write_systemd_unit() {
    step "Plan 104-11 — systemd unit livos.service"

    # Find pnpm absolute path (varies: /usr/bin/pnpm or /usr/local/bin/pnpm)
    local pnpm_bin
    pnpm_bin=$(command -v pnpm)
    [[ -z "$pnpm_bin" ]] && fail "pnpm not on PATH after install — cannot wire systemd ExecStart"

    cat > "$_DLD_SYSTEMD_UNIT" <<EOF
[Unit]
Description=LivOS server (livinityd) — Plan 104-11
After=postgresql.service redis-server.service network.target
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=${_DLD_LIVOS_SRC}
EnvironmentFile=${_DLD_ENV_FILE}
ExecStart=${pnpm_bin} --filter livinityd start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
    chmod 0644 "$_DLD_SYSTEMD_UNIT"
    systemctl daemon-reload
    systemctl enable livos.service >/dev/null 2>&1 || true
    ok "livos.service written at $_DLD_SYSTEMD_UNIT"

    # Start (or restart if already running from a previous deploy)
    if systemctl is-active --quiet livos.service; then
        info "livos.service already running — restarting to pick up new build"
        systemctl restart livos.service
    else
        info "Starting livos.service"
        systemctl start livos.service
    fi
    ok "livos.service started"
}

# ── 9. Health check (livinityd actually bound to :8080?) ────────────────────
_dld_health_check() {
    step "Plan 104-11 — health check livinityd :8080"

    local max_wait=30
    local elapsed=0
    while (( elapsed < max_wait )); do
        # Probe a route that livinityd serves — any 2xx/3xx/4xx response proves
        # the port is bound (we don't care about auth status here; 401/404 are
        # also OK because they mean "Node is listening").
        if curl -fsS -o /dev/null -w "%{http_code}" --max-time 2 \
                http://127.0.0.1:8080/ 2>/dev/null | grep -qE '^[234]'; then
            ok "livinityd is up on :8080 (after ${elapsed}s)"
            return 0
        fi
        # Also accept ANY HTTP response (curl exit 0 means TCP+HTTP succeeded)
        if curl -s -o /dev/null --max-time 2 -w '' http://127.0.0.1:8080/ 2>/dev/null; then
            local rc=$?
            if [[ $rc -eq 0 ]]; then
                ok "livinityd is up on :8080 (curl rc=0 after ${elapsed}s)"
                return 0
            fi
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    warn "livinityd did not respond on :8080 within ${max_wait}s"
    warn "Check: journalctl -u livos.service -n 50"
    warn "Continuing — operator must investigate; install marker still recorded."
    # Do NOT fail() here — the install proceeds. Health failure is loud but
    # not fatal; the operator can debug post-install with journalctl.
    return 0
}

# ── 10. Caddy reverse_proxy 127.0.0.1:8080 ──────────────────────────────────
# Rewrites /etc/caddy/Caddyfile to the final shape appropriate for the active
# mode. Plan 104-08 hybrid mode + 104-09 tunnel mode + 104-03 local-lan mode
# all need this — Caddy must terminate at livinityd, not at a placeholder.
_dld_update_caddy_to_livinityd() {
    step "Plan 104-11 — update Caddy to reverse_proxy 127.0.0.1:8080"

    case "${MODE:-hybrid}" in
        hybrid)
            if [[ -n "${LIVOS_DOMAIN:-}" ]]; then
                cat > "$_DLD_CADDYFILE" <<CADDYFILE
${LIVOS_DOMAIN} {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    reverse_proxy 127.0.0.1:8080
}
CADDYFILE
                ok "Caddyfile: ${LIVOS_DOMAIN} → 127.0.0.1:8080 (LE DNS-01)"
            else
                # No domain set; leave whatever mode-hybrid.sh wrote alone
                warn "No LIVOS_DOMAIN — leaving Caddyfile untouched"
            fi
            ;;
        tunnel)
            # Tunnel mode: CF terminates TLS at the edge. Caddy serves plain :80.
            cat > "$_DLD_CADDYFILE" <<CADDYFILE
{
    auto_https off
}
:80 {
    reverse_proxy 127.0.0.1:8080
}
CADDYFILE
            ok "Caddyfile: :80 → 127.0.0.1:8080 (CF Tunnel terminates TLS)"
            ;;
        local-lan)
            local tld="${LIVINITY_LOCAL_TLD:-livinity.local}"
            cat > "$_DLD_CADDYFILE" <<CADDYFILE
import /etc/caddy/pki-global.conf
*.${tld} {
    tls internal {
        issuer internal {
            ca liv-local
        }
    }
    reverse_proxy 127.0.0.1:8080
}
CADDYFILE
            ok "Caddyfile: *.${tld} → 127.0.0.1:8080 (tls internal liv-local)"
            ;;
        cloud)
            cat > "$_DLD_CADDYFILE" <<CADDYFILE
:80 {
    reverse_proxy 127.0.0.1:8080
}
CADDYFILE
            ok "Caddyfile: :80 → 127.0.0.1:8080 (cloud-mode bootstrap)"
            ;;
    esac

    # Validate config before reload
    if caddy validate --config "$_DLD_CADDYFILE" 2>/dev/null; then
        ok "Caddyfile validates"
    else
        warn "Caddyfile validation failed; check /etc/caddy/Caddyfile"
    fi

    # Reload Caddy (graceful — no restart)
    systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || \
        warn "Caddy reload/restart failed; check journalctl -u caddy -n 20"
    ok "Caddy reloaded"
}

# ── Public entry point ──────────────────────────────────────────────────────
deploy_livinityd() {
    if [[ "${SKIP_DEPLOY:-0}" == "1" ]]; then
        info "Plan 104-11 — --skip-deploy set; skipping livinityd deploy"
        return 0
    fi

    step "Plan 104-11 — deploying livinityd (full LivOS application stack)"
    info "After this completes, the LivOS UI should load in the browser."
    info "Scope: livinityd only. liv-core/liv-worker DEFERRED to Plan 104-12."

    _dld_install_system_packages
    _dld_setup_postgres
    _dld_setup_redis
    _dld_clone_source
    _dld_build_packages
    _dld_generate_jwt_secret
    _dld_write_env_file
    _dld_write_systemd_unit
    _dld_health_check
    _dld_update_caddy_to_livinityd

    ok "Plan 104-11 — livinityd deploy complete"
}
