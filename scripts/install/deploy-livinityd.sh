# scripts/install/deploy-livinityd.sh
# Phase 104 plans 104-11 (initial) + 104-12 (path-bug hotfix + liv-stack).
#
# 105-01 (this plan): Pipeline refactor in preparation for 1:1 update.sh port.
# - Extracted _dld_verify_build helper (105-01) — was inlined in 3 sites.
# - Fixed anchored --exclude='/docker/' (was 'docker/' — D-105-STEP2-EXCLUDE-ANCHORED).
# - Reordered deploy_livinityd to write secrets BEFORE pnpm install.
# - NO new behavior beyond the bug fix + extraction. See 105-CONTEXT.md.
#
# After install.sh's mode dispatch finishes wiring Caddy + TLS + DNS, THIS file
# installs the actual LivOS application stack so the user sees the LivOS UI in
# the browser (not just a green padlock on a Caddy placeholder).
#
# Sections (each idempotent):
#   1. System packages (Node 22 LTS, pnpm, postgresql, redis-server, build deps)
#   2. PostgreSQL setup (livos user + livos DB + schema.sql apply)
#   3. Redis setup (requirepass random)
#   4. Source clone (GitHub → /tmp → rsync `livos/` → /opt/livos/ + `liv/` → /opt/liv/)
#   5. Build livos (pnpm install + @livos/config tsc + ui vite build)
#   5b. Build liv (npm install + tsc per package: core, worker, mcp-server, memory) [104-12]
#   5c. Copy liv dist into pnpm-store resolution dirs for livinityd [104-12]
#   6. /opt/livos/.env (random passwords, mode 600, REUSE existing on re-run)
#   7. JWT secret (/opt/livos/data/secrets/jwt 0600, reuse existing)
#   8. systemd units: livos.service + liv-core.service + liv-worker.service +
#      liv-memory.service (mcp-server is spawned on-demand by livinityd) [104-12]
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
# ── 104-12 path-bug fix ────────────────────────────────────────────────────
# Plan 104-11 originally rsynced `livos/` → /opt/livos/livos/ (NESTED) which
# broke livinityd's `@liv/core: "file:../../../liv/packages/core"` dep — the
# relative path resolves from /opt/livos/packages/livinityd/, three levels up
# is /opt/liv/. The nested layout pointed `../../../liv` at /liv (which does
# not exist) and broke `pnpm install` with ENOENT.
#
# Correct layout (matches Mini PC + Phase 65 rename memory):
#   /opt/livos/packages/{livinityd,ui,config}/   ← livos/ contents (FLAT)
#   /opt/liv/packages/{core,worker,mcp-server,memory}/   ← liv/ sibling
#
# All path constants now reflect this. The legacy nested $_DLD_LIVOS_SRC
# var is retired; use _DLD_LIVOS_DIR everywhere.
#
# ── 104-12 liv-stack scope ─────────────────────────────────────────────────
# 104-12 also extends this helper to deploy the liv/ sibling packages and
# write systemd units for liv-core / liv-worker / liv-memory — closing the
# scope boundary that 104-11 documented as deferred. mcp-server is built but
# NOT given a systemd unit; livinityd spawns it on-demand.
#
# Sacred SHA invariant: liv/packages/core/src/sdk-agent-runner.ts MUST equal
# f3538e1d811992b782a9bb057d1b7f0a0189f95f. This file does NOT touch that
# path — it only orchestrates apt + systemctl + rsync + pnpm + npm + curl.

# Constants — 104-12 flat layout (livos/ contents → /opt/livos/, liv/ → /opt/liv/)
_DLD_LIVOS_DIR="${_DLD_LIVOS_DIR:-/opt/livos}"
_DLD_LIV_DIR="/opt/liv"
_DLD_ENV_FILE="${_DLD_LIVOS_DIR}/.env"
_DLD_SECRETS_DIR="${_DLD_LIVOS_DIR}/data/secrets"
_DLD_JWT_FILE="${_DLD_SECRETS_DIR}/jwt"
_DLD_SYSTEMD_UNIT="/etc/systemd/system/livos.service"
_DLD_SYSTEMD_LIV_CORE_UNIT="/etc/systemd/system/liv-core.service"
_DLD_SYSTEMD_LIV_WORKER_UNIT="/etc/systemd/system/liv-worker.service"
_DLD_SYSTEMD_LIV_MEMORY_UNIT="/etc/systemd/system/liv-memory.service"
_DLD_REPO_URL="https://github.com/utopusc/livinity-io.git"
_DLD_STAGE_DIR="/tmp/livos-install-stage"
# 105-01: alias matching update.sh:174-178 naming convention; persistent semantics preserved.
# Plan 105-02 (G7) will swap to PID-scoped /tmp/livinity-update-$$ + add cleanup.
_DLD_TEMP_DIR="$_DLD_STAGE_DIR"
_DLD_CADDYFILE="/etc/caddy/Caddyfile"
# 106 Bug #10: desktop session user (sudo + docker groups, NOPASSWD sudoers).
# The human-friendly login the operator uses for GUI sessions + sudo elevation,
# AND the User= the livos/liv-* systemd units run as.
_DLD_DESKTOP_USER="${_DLD_DESKTOP_USER:-bruce}"
_DLD_DESKTOP_UID="${_DLD_DESKTOP_UID:-1000}"

# UAT 252 G7: owner for chown -R of /opt/livos + /opt/liv. MUST equal the
# systemd unit User= (the desktop user) — otherwise bruce-run services fail to
# chdir into a root-owned WorkingDirectory (status=200/CHDIR crash loop on a
# fresh install). Previously defaulted to root "to match update.sh", which is
# exactly why the Mini PC needed a manual post-install chown; defaulting to the
# desktop user makes a fresh curl|bash install come up with zero manual steps.
_DLD_LIVOS_USER="${_DLD_LIVOS_USER:-$_DLD_DESKTOP_USER}"

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
    # Phase 106 Bug #8: samba + samba-common-bin required for livinityd Files
    # module (smbpasswd binary + /etc/samba/smb.conf management). Mini PC has
    # these from initial bootstrap; fresh VPS does not.
    info "Installing PostgreSQL + Redis + build deps + samba (Bug #8)"
    apt-get install -y -qq \
        postgresql postgresql-client \
        redis-server \
        build-essential python3 git rsync openssl \
        samba samba-common-bin \
        bubblewrap tinyproxy
    ok "System packages installed"

    # ── Phase 256-01 (WS-A): egress allowlist proxy for the bwrap'd agent ──────
    # tinyproxy default-deny + hostname allowlist. The agent's bwrap child gets
    # HTTPS_PROXY=http://127.0.0.1:13128 (set in sandbox.ts buildScrubbedEnv) so
    # all egress transits this filter — breaks the lethal-trifecta exfil leg.
    # bwrap is the hard requirement; the proxy is defense-in-depth (shell.ts
    # scrubs env even without it), so every step here is warn-not-fail.
    info "Phase 256-01: writing livos-egress allowlist proxy config + unit"
    cat > /etc/tinyproxy/livos-egress.conf <<'EGRESS_CONF' || warn "livos-egress.conf write failed (non-fatal)"
Port 13128
Listen 127.0.0.1
Allow 127.0.0.1
FilterDefaultDeny Yes
Filter /etc/tinyproxy/livos-egress.filter
ConnectPort 443
EGRESS_CONF
    cat > /etc/tinyproxy/livos-egress.filter <<'EGRESS_FILTER' || warn "livos-egress.filter write failed (non-fatal)"
^api\.anthropic\.com$
^generativelanguage\.googleapis\.com$
^github\.com$
\.githubusercontent\.com$
^registry\.npmjs\.org$
^registry\.npmjs\.com$
EGRESS_FILTER
    cat > /etc/systemd/system/livos-egress.service <<'EGRESS_UNIT' || warn "livos-egress.service write failed (non-fatal)"
[Unit]
Description=LivOS egress allowlist proxy (tinyproxy)
After=network.target

[Service]
ExecStart=/usr/bin/tinyproxy -d -c /etc/tinyproxy/livos-egress.conf
Restart=on-failure

[Install]
WantedBy=multi-user.target
EGRESS_UNIT
    systemctl daemon-reload 2>/dev/null || warn "daemon-reload failed (non-fatal)"
    systemctl enable --now livos-egress 2>/dev/null || warn "livos-egress enable failed (non-fatal)"
    ok "livos-egress proxy configured"

    # ── Phase 256-02 (WS-B): cred-egress-proxy CA material (LIVOS-001) ─────────
    # The host credential-injecting egress proxy (cred-egress-proxy.ts) MITM-
    # terminates the AI hosts to inject the operator OAuth bearer at the wire.
    # The container trusts that leg via a PUBLIC CA cert mounted read-only
    # (credproxy-ca.pem). Generate the CA once here (cert + 0600 key); the key
    # never leaves the host, the cert is mounted into containers (not a secret).
    # This is a DISTINCT region from the 256-01 tinyproxy block above — a
    # different proxy (in-process node service, not an apt package). All steps
    # warn-not-fail (the inject degrades gracefully if the CA is absent).
    info "Phase 256-02: generating cred-egress-proxy CA material (if absent)"
    _CREDPROXY_SECRETS="${_DLD_LIVOS_DIR}/data/secrets"
    _CREDPROXY_CA="${_CREDPROXY_SECRETS}/credproxy-ca.pem"
    _CREDPROXY_KEY="${_CREDPROXY_SECRETS}/credproxy-ca.key"
    mkdir -p "$_CREDPROXY_SECRETS" 2>/dev/null || warn "credproxy secrets dir mkdir failed (non-fatal)"
    if [[ ! -s "$_CREDPROXY_CA" ]]; then
        openssl req -x509 -newkey rsa:2048 -nodes \
            -keyout "$_CREDPROXY_KEY" -out "$_CREDPROXY_CA" \
            -days 3650 -subj "/CN=livinity-credproxy" 2>/dev/null \
            && chmod 0600 "$_CREDPROXY_KEY" 2>/dev/null \
            && chmod 0644 "$_CREDPROXY_CA" 2>/dev/null \
            && ok "cred-egress-proxy CA generated at $_CREDPROXY_CA" \
            || warn "cred-egress-proxy CA generation failed (non-fatal — inject degrades)"
    else
        ok "cred-egress-proxy CA already present at $_CREDPROXY_CA (reuse)"
    fi

    # Phase 106 Bug #7: mender-client4 silences `spawn mender ENOENT` log spam
    # emitted by livinityd's periodic update-check. WARN-not-FAIL — some Ubuntu
    # derivatives lack mender-client4 in universe; absence is non-fatal (the
    # log line is verbose-level, not critical).
    info "Installing mender-client4 (Bug #7 — silences ENOENT log spam)"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mender-client4 2>&1 | tail -3 \
        || warn "mender-client4 install failed (non-fatal — ENOENT log spam will persist)"
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
    # 104-12 path fix: flat layout — schema lives at /opt/livos/packages/...
    local schema_file="${_DLD_LIVOS_DIR}/packages/livinityd/source/modules/database/schema.sql"
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
            | sed -E 's|^REDIS_URL=redis://(default)?:([^@]+)@.*|\2|' \
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

# ── 3b. Desktop session user (Phase 106 Bug #10 — bruce + sudoers + groups) ──
# Creates the human-friendly login `bruce` (configurable via _DLD_DESKTOP_USER)
# with sudo + docker group membership and a NOPASSWD sudoers drop-in.
# Without this, livinityd's Streaming module crashes with `sudo: unknown user
# bruce` on per-host display features. fluxbox is already installed by
# _dld_install_streaming_packages — no apt install here.
#
# Idempotent:
#   - `id -u "$user"` short-circuits when user exists
#   - `usermod -aG` is no-op when membership already present
#   - sudoers drop-in overwritten unconditionally (single-line, we control content)
#   - visudo -cf validates BEFORE leaving the file in place; failure → rm + warn
_dld_create_desktop_user() {
    step "Phase 106 Bug #10 — create desktop user (sudo + docker + NOPASSWD sudoers)"

    local user="${_DLD_DESKTOP_USER:-bruce}"
    local uid="${_DLD_DESKTOP_UID:-1000}"
    local sudoers_file="/etc/sudoers.d/99-${user}"

    # Sanity: useradd only available on Linux. Skip silently on non-Linux hosts.
    if ! command -v useradd >/dev/null 2>&1; then
        info "useradd not available — skipping desktop user creation (non-Linux host)"
        return 0
    fi

    # Create user if not exists (idempotent).
    if id -u "$user" >/dev/null 2>&1; then
        ok "Desktop user '${user}' already exists (uid=$(id -u "$user"))"
    else
        info "Creating desktop user '${user}' (uid=${uid})"
        # -m: create home dir, -s: shell, -u: explicit uid (allows :1000 if free)
        if useradd -m -u "$uid" -s /bin/bash "$user" 2>&1; then
            ok "Desktop user '${user}' created (uid=${uid})"
        else
            # uid may be taken — retry without explicit uid
            warn "useradd with uid=${uid} failed — retrying with auto-assigned uid"
            useradd -m -s /bin/bash "$user" 2>&1 \
                || { warn "Failed to create user '${user}' — Bug #10 NOT fixed on this host"; return 0; }
            ok "Desktop user '${user}' created (auto-assigned uid=$(id -u "$user"))"
        fi
    fi

    # Add to sudo + docker groups. usermod -aG is no-op on existing membership.
    # `docker` group may not exist yet if Docker isn't installed — getent guard.
    local groups_to_add="sudo"
    if getent group docker >/dev/null 2>&1; then
        groups_to_add="${groups_to_add},docker"
    else
        info "docker group not yet present — adding ${user} to sudo only (docker group will be created on Docker install)"
    fi
    if usermod -aG "$groups_to_add" "$user" 2>&1; then
        ok "Desktop user '${user}' in groups: $(id -nG "$user" 2>/dev/null)"
    else
        warn "Failed to add ${user} to groups ${groups_to_add} (non-fatal)"
    fi

    # Phase 106-02 hotfix: defensive chown of /home/${user}.
    # `useradd -m` alone is NOT sufficient — if ${user} was pre-existing from a
    # manual `useradd ${user}` (no -m flag, e.g. Phase 105 on-server hotfix),
    # OR if /home/${user} was racily created by another root process (chrome
    # crashpad_handler / fluxbox mkdir) before useradd ran, the dir is left
    # root-owned and ${user} cannot write to its own home. Symptom: WebApp
    # Launcher chrome spawns then dies with SIGTRAP on first write to
    # ~/.config/google-chrome/Crash Reports; fluxbox fails with Permission
    # denied on ~/.fluxbox; xdotool can't find the window → /webapp.input.click
    # returns 500. See memory: feedback_bruce_home_ownership.md.
    if [[ -d "/home/$user" ]]; then
        if chown -R "$user:$user" "/home/$user" 2>&1; then
            ok "Home dir /home/${user} ownership normalized to ${user}:${user}"
        else
            warn "Failed to chown /home/${user} — WebApp Launcher Chrome may SIGTRAP"
        fi
    else
        warn "/home/${user} missing — useradd may have failed; WebApp Launcher will not work"
    fi

    # NOPASSWD sudoers drop-in. Write to a tmp file first, validate with
    # `visudo -cf`, then mv to /etc/sudoers.d/. visudo failure → rm tmp + warn
    # (do NOT leave a broken sudoers file in place — that bricks sudo).
    local tmp_sudoers
    tmp_sudoers=$(mktemp /tmp/sudoers-${user}-XXXXXX) || {
        warn "mktemp failed — skipping sudoers drop-in for '${user}'"
        return 0
    }
    printf '%s\n' "${user} ALL=(ALL) NOPASSWD:ALL" > "$tmp_sudoers"
    chmod 0440 "$tmp_sudoers"

    if visudo -cf "$tmp_sudoers" >/dev/null 2>&1; then
        mv "$tmp_sudoers" "$sudoers_file"
        chmod 0440 "$sudoers_file"
        chown root:root "$sudoers_file" 2>/dev/null || true
        ok "Sudoers drop-in written: ${sudoers_file} (validated by visudo -cf)"
    else
        warn "visudo -cf failed on tmp file — sudoers drop-in NOT installed for '${user}'"
        rm -f "$tmp_sudoers"
    fi
}

# ── 4. Source clone ─────────────────────────────────────────────────────────
# 104-12 path fix: rsync `repo/livos/` → /opt/livos/ (FLAT, not nested at
# /opt/livos/livos/). Plus rsync `repo/liv/` → /opt/liv/ for the sibling
# packages (104-12 scope addition).
_dld_clone_source() {
    step "Plan 104-11/104-12 — clone livinity-io source"

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

    # rsync stage `livos/` subdir → /opt/livos/ (FLAT — packages/{livinityd,ui,config}/
    # land directly under /opt/livos/, NOT nested at /opt/livos/livos/).
    # See Phase 65 rename memory + Mini PC layout reference. Exclude .planning
    # + docker (UAT-only + planning artifacts not needed at runtime).
    info "rsync repo/livos/ → $_DLD_LIVOS_DIR/ (flat layout)"
    mkdir -p "$_DLD_LIVOS_DIR"
    # 105-01: anchored — was 'docker/' which over-matched packages/ui/src/routes/docker/
    rsync -a \
        --exclude='.git/' \
        --exclude='.planning/' \
        --exclude='/docker/' \
        --exclude='node_modules/' \
        --exclude='/.env' \
        --exclude='/.env.bak' \
        --exclude='/data/' \
        --exclude='/update.sh' \
        "$_DLD_STAGE_DIR/livos/" "$_DLD_LIVOS_DIR/"
    # Also copy update.sh + pnpm-* root files (update.sh lives at repo root,
    # NOT under livos/; the existing livos/ rsync above skips it explicitly).
    for f in package.json pnpm-lock.yaml pnpm-workspace.yaml; do
        if [[ -f "$_DLD_STAGE_DIR/livos/$f" ]]; then
            cp "$_DLD_STAGE_DIR/livos/$f" "$_DLD_LIVOS_DIR/$f"
        fi
    done
    # 105-02 (G3): atomic self-rsync of update.sh — port update.sh:425-430 verbatim.
    # cp to .new sibling then mv ensures running bash on a re-run won't read partial
    # new content through its open fd and crash mid-run. Same inode → atomic.
    if [[ -f "$_DLD_STAGE_DIR/update.sh" ]]; then
        info "Updating update.sh (atomic .new + mv)..."
        cp "$_DLD_STAGE_DIR/update.sh" "$_DLD_LIVOS_DIR/update.sh.new"
        chmod +x "$_DLD_LIVOS_DIR/update.sh.new"
        mv "$_DLD_LIVOS_DIR/update.sh.new" "$_DLD_LIVOS_DIR/update.sh"
        ok "update.sh updated (next run will use new version)"
    else
        warn "update.sh not in stage dir — skipping self-update"
    fi
    ok "livos source rsynced to $_DLD_LIVOS_DIR/ (flat)"

    # 104-12: rsync stage `liv/` subdir → /opt/liv/ (sibling). Required because
    # livinityd's package.json declares `"@liv/core": "file:../../../liv/packages/core"`
    # — that relative path resolves from /opt/livos/packages/livinityd/ to
    # /opt/liv/packages/core/. Without this rsync, `pnpm install` fails with
    # ENOENT (the live mainserver 154.53.56.75 failure mode that triggered 104-12).
    info "rsync repo/liv/ → $_DLD_LIV_DIR/ (sibling, sacred SHA preserved)"
    mkdir -p "$_DLD_LIV_DIR"
    rsync -a \
        --exclude='.git/' \
        --exclude='node_modules/' \
        --exclude='dist/' \
        --exclude='*.log' \
        "$_DLD_STAGE_DIR/liv/" "$_DLD_LIV_DIR/"
    ok "liv source rsynced to $_DLD_LIV_DIR/"

    # G12 (fresh-install, 2026-05-30): the CLI-installer shell scripts live at
    # repo-root scripts/install/cli/<name>.sh — NOT under livos/. The livos/
    # rsync above therefore never deploys them, so the cliInstaller.install()
    # tRPC mutation spawns `bash /opt/livos/scripts/install/cli/<name>.sh`
    # against a MISSING file → bash exit 127 → onboarding "CLI Tools" step shows
    # "Failed" for all 5 agents ("Unexpected token '<' … is not valid JSON" in
    # the browser). resolveInstallScript() (cli-installer/install-scripts.ts)
    # expects them at $LIVOS_ROOT/scripts/install/cli/, so copy them there.
    # Also copy _logging.sh (the scripts source ../_logging.sh; they fall back to
    # inline loggers if absent, but ship it for parity with the repo layout).
    if [[ -d "$_DLD_STAGE_DIR/scripts/install/cli" ]]; then
        info "deploy repo/scripts/install/cli/ → $_DLD_LIVOS_DIR/scripts/install/cli/ (G12 CLI-installer scripts)"
        mkdir -p "$_DLD_LIVOS_DIR/scripts/install/cli"
        rsync -a "$_DLD_STAGE_DIR/scripts/install/cli/" "$_DLD_LIVOS_DIR/scripts/install/cli/"
        [[ -f "$_DLD_STAGE_DIR/scripts/install/_logging.sh" ]] \
            && cp "$_DLD_STAGE_DIR/scripts/install/_logging.sh" "$_DLD_LIVOS_DIR/scripts/install/_logging.sh"
        # G16 — openclaw.sh delegates to ../install-openclaw-cli.sh (a SIBLING of
        # cli/, not under it), so the cli/ rsync above misses it → openclaw install
        # fails "delegate script not found". Deploy the delegate too.
        [[ -f "$_DLD_STAGE_DIR/scripts/install/install-openclaw-cli.sh" ]] \
            && install -m 0755 "$_DLD_STAGE_DIR/scripts/install/install-openclaw-cli.sh" "$_DLD_LIVOS_DIR/scripts/install/install-openclaw-cli.sh"
        chmod +x "$_DLD_LIVOS_DIR/scripts/install/cli/"*.sh 2>/dev/null || true
        ok "CLI-installer scripts deployed ($(ls "$_DLD_LIVOS_DIR/scripts/install/cli/"*.sh 2>/dev/null | wc -l) scripts)"
    else
        warn "repo/scripts/install/cli/ not in stage dir — CLI Tools onboarding installs will exit 127 (G12)"
    fi
}

# ── 4c. LivOS Docker images (Phase 105-05 UAT Bug #6 fix) ───────────────────
# Mirror of Mini PC's livos/install.sh:408-443 setup_docker_images() helper.
# legacy-compat/docker-compose.yml references `livos/auth-server:1.0.5` and
# `livos/tor:0.4.7.8` by image: field. These images don't exist on Docker Hub
# under the `livos/` namespace — they're local re-tags of Umbrel's official
# images. Without this helper, livinityd's Apps module crashes on first
# `docker compose up` (UAT Bug #6 from Phase 105 mainserver test 2026-05-12).
#
# Upstream provenance (both MIT, byte-identical):
#   getumbrel/auth-server:1.0.5  →  livos/auth-server:1.0.5  +  :latest alias
#   getumbrel/tor:0.4.7.8        →  livos/tor:0.4.7.8        +  :latest alias
#
# Idempotent: if `livos/<name>:<tag>` already exists locally, skip pull/retag.
# FAIL hard on pull failure — these images are required for livinityd Apps
# module startup; first-install cannot proceed without them.
_dld_setup_docker_images() {
    step "Plan 105-05 Bug #6 — setup LivOS Docker images (livos/auth-server + livos/tor)"

    if ! command -v docker >/dev/null 2>&1; then
        fail "docker CLI not on PATH — install Docker first or use a system that already has it"
    fi
    if ! docker info >/dev/null 2>&1; then
        fail "Docker daemon not reachable — start docker.service before re-running install"
    fi

    # Pull-and-retag table: source-image|destination-image (Mini PC pattern,
    # livos/install.sh:412-414 verbatim equivalent).
    local images=(
        "getumbrel/auth-server:1.0.5|livos/auth-server:1.0.5"
        "getumbrel/tor:0.4.7.8|livos/tor:0.4.7.8"
    )

    for entry in "${images[@]}"; do
        local src="${entry%%|*}"
        local dst="${entry##*|}"

        if docker image inspect "$dst" >/dev/null 2>&1; then
            ok "Image $dst already present — skipping pull"
            continue
        fi

        info "Pulling $src..."
        if ! docker pull "$src" 2>&1 | tail -3; then
            fail "Failed to pull $src — check internet egress to Docker Hub or retry"
        fi

        info "Tagging $src → $dst"
        docker tag "$src" "$dst" || fail "Failed to tag $src as $dst"

        # Also alias as :latest so docker-compose `image: livos/<name>` (no tag)
        # references resolve. Mirrors Mini PC line 437.
        local dst_latest="${dst%%:*}:latest"
        docker tag "$src" "$dst_latest" || true
        ok "Image $dst (+ ${dst_latest}) ready"
    done

    ok "LivOS Docker images configured"
}

# ── 4b. Streaming subsystem apt packages (105-02 G2 — update.sh:339-405) ────
# Idempotent apt-install for ffmpeg, x11/xdotool, ydotool, xvfb, fluxbox,
# gstreamer, websockify, VAAPI userspace + ydotoold systemd unit.
# Closes RESEARCH gap G2 — without these, Master Chrome / WebApp Launcher
# (Phase 100+) silently fail on fresh VPS hosts.
# Verbatim port of update.sh:339-404 — DEBIAN_FRONTEND=noninteractive ensures
# unattended install. WARN-not-FAIL on VAAPI (no Intel iGPU → libx264 fallback).
_dld_install_streaming_packages() {
    step "105-02 (G2) — streaming subsystem dependencies (update.sh:339-405)"

    if [[ ! -x /usr/bin/apt-get ]] || ! command -v apt-get >/dev/null 2>&1; then
        info "apt-get not available — skipping streaming subsystem install"
        return 0
    fi

    info "Ensuring streaming subsystem apt packages are installed..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        x11vnc xdotool x11-xserver-utils \
        ydotool maim scrot gnome-screenshot \
        websockify vncsnapshot \
        ffmpeg \
        gstreamer1.0-tools \
        gstreamer1.0-plugins-good \
        gstreamer1.0-plugins-bad \
        gstreamer1.0-plugins-ugly \
        xdg-desktop-portal-gnome \
        xvfb fluxbox \
        2>&1 | tail -5 || warn "Some streaming packages failed to install (non-fatal)"

    # VAAPI userspace — separate group so an Intel-iGPU-less host doesn't fail the run.
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        libva-utils intel-media-va-driver libdrm-intel1 \
        2>&1 | tail -5 || warn "VAAPI userspace install failed — libx264 fallback will be used"

    # Phase 252 portability — luse display-lifecycle + terminal binaries the
    # v44/250-hotfix code now hard-requires but were never on the apt list.
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        xserver-xephyr xterm gnome-terminal x11-utils xclip wmctrl \
        2>&1 | tail -5 || warn "Some luse display/terminal packages failed (non-fatal)"

    # Verify the critical streaming binaries are present after install
    local streaming_missing=()
    local bin
    for bin in ffmpeg gst-launch-1.0 dbus-send xdotool maim Xvfb fluxbox Xephyr xterm bwrap; do
        if ! command -v "$bin" >/dev/null 2>&1; then
            streaming_missing+=("$bin")
        fi
    done
    if (( ${#streaming_missing[@]} > 0 )); then
        warn "Streaming binaries still missing after apt: ${streaming_missing[*]}"
    else
        ok "Streaming subsystem binaries verified"
    fi

    # Provision ydotoold systemd unit if ydotoold is now available
    if command -v ydotoold >/dev/null 2>&1 && [[ ! -f /etc/systemd/system/ydotoold.service ]]; then
        local desktop_user_p93 desktop_uid_p93
        desktop_user_p93=$(getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 {print $1; exit}')
        if [[ -n "${desktop_user_p93:-}" ]]; then
            desktop_uid_p93=$(id -u "$desktop_user_p93" 2>/dev/null || echo 1000)
            cat > /etc/systemd/system/ydotoold.service << UNIT
[Unit]
Description=LivOS ydotoold input daemon (Phase 93 streaming subsystem)
After=graphical.target
Wants=graphical.target

[Service]
Type=simple
ExecStart=/usr/bin/ydotoold --socket-path=/tmp/.ydotool_socket --socket-own=${desktop_uid_p93}:${desktop_uid_p93}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=graphical.target
UNIT
            systemctl daemon-reload 2>/dev/null || true
            systemctl enable ydotoold.service 2>/dev/null && \
                ok "ydotoold systemd unit installed (user=${desktop_user_p93})" || \
                warn "ydotoold unit written but enable failed"
        else
            info "No desktop user (UID≥1000) found — ydotoold unit skipped (caveat for fresh VPS without operator account)"
        fi
    fi
}

# ── 4d. Google Chrome stable (Phase 106 Bug #9 — WebApp Launcher blocker) ──
# FATAL on fresh VPS without this: livinityd's Streaming module spawns
# `google-chrome` → ENOENT → unhandled error event → livinityd process
# crashes and systemd restart-loops it. This is the #1 mainserver flap cause.
#
# Pattern mirrors Mini PC's livos/install.sh approach: signed apt repo, keyring
# in /usr/share/keyrings/ (NOT the deprecated apt-key), DEBIAN_FRONTEND noninteractive,
# WARN-not-FAIL (some libc environments — minimal Alpine-derived images —
# may not support chrome stable; the streaming subsystem will fall back to
# chromium where available).
#
# Idempotent:
#   - gpg --dearmor --yes overwrites existing keyring without prompt
#   - sources.list overwrite is unconditional (cheaper than grep-then-append;
#     content is a single line we control)
#   - apt-get install is re-entrant (no-op on already-installed)
_dld_install_google_chrome() {
    step "Phase 106 Bug #9 — install google-chrome-stable (WebApp Launcher blocker)"

    if [[ ! -x /usr/bin/apt-get ]] || ! command -v apt-get >/dev/null 2>&1; then
        info "apt-get not available — skipping google-chrome install (non-Debian-family host)"
        return 0
    fi

    # Short-circuit if already installed (re-run cache)
    if command -v google-chrome >/dev/null 2>&1 || command -v google-chrome-stable >/dev/null 2>&1; then
        ok "google-chrome already installed: $(google-chrome --version 2>/dev/null || google-chrome-stable --version 2>/dev/null)"
        return 0
    fi

    info "Adding Google Chrome stable apt repo (signed keyring)"
    # Dearmor signing key into a dedicated keyring (apt-key is deprecated).
    # --yes overwrites existing keyring without prompt → idempotent on re-run.
    if ! curl -fsSL https://dl-ssl.google.com/linux/linux_signing_key.pub \
            | gpg --dearmor --yes -o /usr/share/keyrings/google-chrome.gpg 2>/dev/null; then
        warn "Failed to download/dearmor Google Chrome signing key — skipping chrome install (Bug #9 will recur)"
        return 0
    fi
    chmod 0644 /usr/share/keyrings/google-chrome.gpg 2>/dev/null || true

    # Sources list overwrite (single-line, unconditional — same content every run).
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list
    chmod 0644 /etc/apt/sources.list.d/google-chrome.list 2>/dev/null || true

    info "Updating apt index + installing google-chrome-stable"
    DEBIAN_FRONTEND=noninteractive apt-get update -qq 2>&1 | tail -3 \
        || warn "apt-get update failed after chrome repo add (non-fatal — install may still succeed from cached metadata)"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq google-chrome-stable 2>&1 | tail -5 \
        || warn "google-chrome-stable install failed — Streaming module will crash with ENOENT (Bug #9 NOT fixed on this host)"

    # Verify install — log version, but do not FAIL the deploy.
    if command -v google-chrome >/dev/null 2>&1; then
        ok "google-chrome installed: $(google-chrome --version 2>/dev/null)"
    elif command -v google-chrome-stable >/dev/null 2>&1; then
        ok "google-chrome-stable installed: $(google-chrome-stable --version 2>/dev/null)"
    else
        warn "google-chrome binary NOT on PATH after install — Bug #9 will recur (operator must debug)"
    fi
}

# ── 4c. Write pnpm .npmrc with block-exotic-subdeps=false (104-13 hotfix) ───
# Plan 104-13: pnpm 11+'s `blockExoticSubdeps` (enabled-by-default supply-chain
# safety check) refuses to install `libsignal` — a legitimate `baileys` WhatsApp
# integration subdep (Phase 25) that is resolved from a git-repository URL
# rather than an npm-published version. The Mini PC ships with an older pnpm
# that does NOT enforce this gate, so `bash /opt/livos/update.sh` works there;
# fresh Ubuntu 24.04 hosts (mainserver 154.53.56.75) installing pnpm via
# `npm install -g pnpm@latest` get pnpm 11.1.1+ and fail at `pnpm install`
# with `[ERR_PNPM_EXOTIC_SUBDEP] Exotic dependency "libsignal" ... not allowed
# in subdependencies when blockExoticSubdeps is enabled`.
#
# SECURITY NOTE: setting `block-exotic-subdeps=false` relaxes pnpm's
# supply-chain safety for ALL git-resolved subdeps in the dep tree, not
# just the `libsignal` one we actually need. A production audit MUST:
#   (a) Review every git-resolved subdep in pnpm-lock.yaml — confirm each
#       is a known good upstream (no typo-squat / takeover risk).
#   (b) Pin `baileys` to a libsignal-free version when one becomes available
#       (or switch to the npm-published `libsignal-client` package).
#   (c) Consider a wrapper / vendored copy of libsignal so the check can be
#       re-enabled.
# Deferred review tracked in .planning/phases/104-local-install-and-docker-uat/104-13-SUMMARY.md.
#
# Idempotent: if the directive is already present (any value), we leave it.
_dld_write_pnpm_npmrc() {
    step "Plan 104-13 — write pnpm .npmrc (block-exotic-subdeps=false for baileys → libsignal)"

    local npmrc="${_DLD_LIVOS_DIR}/.npmrc"
    if [[ -f "$npmrc" ]] && grep -q "^block-exotic-subdeps=" "$npmrc"; then
        ok ".npmrc already has block-exotic-subdeps directive at $npmrc"
        return 0
    fi
    cat >> "$npmrc" <<'EOF'
# Plan 104-13: allow baileys → libsignal git-repository subdep (Phase 25 WhatsApp).
# SECURITY: relaxes pnpm's supply-chain safety for ALL git-resolved subdeps.
# See 104-13-SUMMARY.md for the deferred audit checklist.
block-exotic-subdeps=false
EOF
    ok "Wrote block-exotic-subdeps=false to $npmrc"
}

# ── _dld_verify_build helper (105-01: extracted from inlined checks) ─────────
# Ports update.sh:287-295 verbatim. Assert a build produced non-empty output.
# Call AFTER every build invocation. Failure prints `BUILD-FAIL: <pkg> produced
# empty <dir>` to stderr and exits 1 — matches update.sh's silent-success guard.
# Usage: _dld_verify_build "@livos/config" "/opt/livos/packages/config/dist"
_dld_verify_build() {
    local pkg="$1"
    local outdir="$2"
    if [[ ! -d "$outdir" ]] || [[ -z "$(find "$outdir" -type f 2>/dev/null | head -1)" ]]; then
        echo "BUILD-FAIL: $pkg produced empty $outdir" >&2
        exit 1
    fi
    echo "[VERIFY] $pkg dist OK ($outdir)"
}

# ── 5. Build livos (pnpm install + @livos/config + ui) ─────────────────────
# 104-12 path fix: cd into _DLD_LIVOS_DIR (flat) instead of the retired
# _DLD_LIVOS_SRC (nested). pnpm install resolves `@liv/core: "file:../../../liv/packages/core"`
# from /opt/livos/packages/livinityd/, three levels up = /opt/liv/packages/core.
_dld_build_packages() {
    step "Plan 104-11/104-12 — pnpm install + build (@livos/config + ui)"

    cd "$_DLD_LIVOS_DIR" || fail "cannot cd to $_DLD_LIVOS_DIR"

    # 104-12 pre-flight: ensure /opt/liv/ exists with packages/core/ at minimum.
    # Without it, pnpm install fails with ENOENT on the file:../../../liv URL.
    if [[ ! -d "$_DLD_LIV_DIR/packages/core" ]]; then
        fail "PRE-FLIGHT-FAIL: $_DLD_LIV_DIR/packages/core missing — _dld_clone_source did not rsync liv/. Cannot resolve @liv/core file dep."
    fi

    info "pnpm install (this may take 3-5 min)"
    # Phase 132 Bug #13: --config.dangerously-allow-all-builds=true was added in
    # Plan 105-05 Bug #1 to silence pnpm 11+'s ERR_PNPM_IGNORED_BUILDS prompt. But
    # in pnpm 10 it internally sets neverBuiltDependencies=[], which conflicts with
    # the package.json `pnpm.onlyBuiltDependencies` allowlist → fatal
    # ERR_PNPM_CONFIG_CONFLICT_BUILT_DEPENDENCIES. The allowlist alone is sufficient:
    # 11 explicit packages get build scripts run; everything else is silently skipped
    # (warning, not error). Removing the flag fixes Bug #13 without re-introducing
    # the pnpm-11 prompt (CI/non-TTY runs default to skip silently when no flag).
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
    _dld_verify_build "@livos/config" "$_DLD_LIVOS_DIR/packages/config/dist"
    ok "@livos/config built"

    # Phase 132 Bug #15: build @livinity/ui-kit BEFORE @livos/ui because
    # ui/src/index.css imports @livinity/ui-kit/dist/index.css via PostCSS.
    # If ui-kit/dist doesn't exist when vite builds ui, build fails with:
    #   ENOENT: no such file or directory, open '@livinity/ui-kit/dist/index.css'
    # ui-kit's build script is `pnpm build:lib && pnpm build:umd` (tsup + vite).
    if [[ -d "$_DLD_LIVOS_DIR/packages/ui-kit" ]]; then
        info "Building @livinity/ui-kit (tsup + vite UMD)"
        pnpm --filter @livinity/ui-kit build 2>&1 | tail -5 || fail "@livinity/ui-kit build failed"
        _dld_verify_build "@livinity/ui-kit" "$_DLD_LIVOS_DIR/packages/ui-kit/dist"
        ok "@livinity/ui-kit built"
    fi

    # Build UI (vite production bundle)
    # 105-02 (G8): rm -rf dist BEFORE build forces vite to regenerate from source.
    # Phase 51 v29.5 A2 defensive fresh-build — prevents stale dist surviving
    # deploys when vite's cache hash matches by accident OR when a prior build
    # silently failed.
    info "Building UI (vite production bundle; ~1-2 min)"
    rm -rf "$_DLD_LIVOS_DIR/packages/ui/dist"
    pnpm --filter ui build 2>&1 | tail -5 || fail "UI build failed"
    _dld_verify_build "@livos/ui" "$_DLD_LIVOS_DIR/packages/ui/dist"
    ok "UI built"

    # Ensure livinityd's ui symlink (mirrors update.sh:537)
    ln -sfn "$_DLD_LIVOS_DIR/packages/ui/dist" "$_DLD_LIVOS_DIR/packages/livinityd/ui"
    ok "UI symlinked into livinityd"
}

# ── 5b. Build liv stack (104-12: core, worker, mcp-server, memory) ──────────
# Mirrors update.sh:493-562 — liv uses npm (NOT pnpm) per the canonical Mini PC
# layout. Each package builds via `npm run build` (which is `tsc` per their
# package.json scripts). mcp-server is built but does NOT get a systemd unit;
# livinityd spawns it on-demand as a child process.
_dld_build_liv_packages() {
    step "Plan 104-12 — npm install + build liv stack (core, worker, mcp-server, memory)"

    if [[ ! -d "$_DLD_LIV_DIR" ]]; then
        warn "$_DLD_LIV_DIR not found — skipping liv build (clone step may have failed)"
        return 0
    fi

    cd "$_DLD_LIV_DIR" || fail "cannot cd to $_DLD_LIV_DIR"

    info "npm install for liv stack (this may take 2-3 min)"
    # --omit=optional reduces install time on hosts that don't need optional
    # native deps. Mirrors update.sh:504 `npm install --production=false` (we
    # need devDeps because we build via tsc which IS a devDep).
    if [[ -f "package-lock.json" ]]; then
        npm install --omit=optional 2>&1 | tail -10 || {
            warn "liv npm install --omit=optional failed; retrying plain"
            npm install 2>&1 | tail -10 || fail "liv npm install failed"
        }
    else
        npm install 2>&1 | tail -10 || fail "liv npm install failed"
    fi
    ok "liv npm install complete"

    # Build each package via its `build` script (tsc). 104-12 closes the
    # update.sh:548 bug where memory was never built (per project memory:
    # "liv-memory.service in restart loop because dist/index.js never compiled").
    local pkg
    for pkg in core worker mcp-server memory; do
        local pkg_dir="$_DLD_LIV_DIR/packages/${pkg}"
        if [[ ! -f "$pkg_dir/package.json" ]]; then
            warn "liv/${pkg}: package.json missing — skipping"
            continue
        fi
        info "Building @liv/${pkg} (tsc)..."
        if (cd "$pkg_dir" && npm run build 2>&1 | tail -5); then
            _dld_verify_build "@liv/${pkg}" "$pkg_dir/dist"
            ok "@liv/${pkg} built"
        else
            fail "@liv/${pkg} build failed; check $pkg_dir for errors"
        fi
    done
    ok "All liv packages built"
}

# ── 5c. Sync liv dist into pnpm-store resolution dirs (104-12 pitfall fix) ──
# Per project memory: "update.sh pnpm-store quirk: copies liv dist into the
# FIRST @liv+core* dir matched by find -maxdepth 1. If pnpm has multiple
# resolution dirs (sharp version drift), it can copy to the wrong one and
# livinityd still imports the stale dist."
#
# Our pattern: iterate ALL matching dirs (not just `head -1`) so livinityd's
# pnpm-store symlink ALWAYS resolves to fresh dist regardless of which store
# dir it picked. This is the canonical Phase 31 BUILD-02 multi-dir pattern
# from update.sh:564-593, applied to all four liv packages (104-12 extension).
_dld_sync_liv_dist_into_pnpm_store() {
    step "Plan 104-12 — sync liv dist into livinityd's pnpm-store"

    local pkg
    local total_synced=0
    for pkg in core worker mcp-server memory; do
        local dist_src="$_DLD_LIV_DIR/packages/${pkg}/dist"
        if [[ ! -d "$dist_src" ]] \
            || [[ -z "$(find "$dist_src" -type f 2>/dev/null | head -1)" ]]; then
            warn "@liv/${pkg}: dist empty or missing — skipping pnpm-store sync"
            continue
        fi

        local synced_count=0
        # Iterate ALL @liv+<pkg>* dirs (NOT head -1 — the canonical fix).
        for store_dir in "$_DLD_LIVOS_DIR/node_modules/.pnpm/@liv+${pkg}"*/; do
            [[ -d "$store_dir" ]] || continue
            local target_parent="${store_dir}node_modules/@liv/${pkg}"
            local target="${target_parent}/dist"
            mkdir -p "$target_parent"
            # rsync --delete to ensure stale files from prior builds are purged.
            rsync -a --delete "$dist_src/" "$target/" 2>/dev/null \
                || { warn "rsync to $target failed"; continue; }
            if [[ -z "$(find "$target" -type f 2>/dev/null | head -1)" ]]; then
                warn "post-rsync target $target is empty"
                continue
            fi
            synced_count=$((synced_count + 1))
        done

        if (( synced_count == 0 )); then
            info "@liv/${pkg}: no @liv+${pkg}* dir in pnpm store yet (livinityd may not import this pkg directly — non-fatal)"
        else
            ok "@liv/${pkg} dist synced to ${synced_count} pnpm-store dir(s)"
            total_synced=$((total_synced + synced_count))
        fi
    done
    ok "liv dist sync complete (${total_synced} total store dirs updated)"
}

# ── 5d. Verify livinityd's @liv/core import path actually resolves (132-05) ──
# Bug #6 ground-truth: livinityd boots, imports `@liv/core`, the pnpm symlink
# resolves to either /opt/liv/packages/core (via file: protocol) or to a
# pnpm-store dir. EITHER WAY, the resolved dir MUST contain `dist/lib.js`.
# If the build/sync chain silently misses (e.g. wrong store dir picked,
# stale dist, pnpm re-link race), the unit boots and dies ERR_MODULE_NOT_FOUND.
#
# This helper resolves the symlink livinityd will actually walk and asserts
# `<resolved>/dist/lib.js` exists. Fails LOUDLY (not silently) before
# systemd unit write so the operator sees the real diagnostic, not a
# restart loop hours later.
_dld_verify_liv_dist_reachable() {
    step "Phase 132-05 — verify livinityd's @liv/core import path"

    local livinityd_liv_link="$_DLD_LIVOS_DIR/packages/livinityd/node_modules/@liv/core"
    if [[ ! -e "$livinityd_liv_link" ]]; then
        warn "$livinityd_liv_link missing — pnpm install may not have linked @liv/core yet"
        warn "  (livinityd boot will ERR_MODULE_NOT_FOUND on first start)"
        return 0
    fi

    # Resolve symlink to canonical absolute path
    local resolved
    resolved=$(readlink -f "$livinityd_liv_link" 2>/dev/null || echo "")
    if [[ -z "$resolved" ]]; then
        warn "Could not resolve $livinityd_liv_link symlink — pnpm link broken?"
        return 0
    fi
    info "livinityd's @liv/core resolves to: $resolved"

    # The critical file livinityd imports
    local target="${resolved}/dist/lib.js"
    if [[ -f "$target" ]]; then
        ok "@liv/core/dist/lib.js exists at resolved path (livinityd boot will succeed)"
        return 0
    fi

    # MISSING — this is exactly Bug #6. Fail loudly with diagnostic.
    warn "MISSING: ${target}"
    warn "  Bug #6 detected pre-emptively: livinityd would ERR_MODULE_NOT_FOUND."
    warn "  Falling back: copying /opt/liv/packages/core/dist into resolved path."
    if [[ -d "$_DLD_LIV_DIR/packages/core/dist" ]] \
        && [[ -n "$(find "$_DLD_LIV_DIR/packages/core/dist" -type f 2>/dev/null | head -1)" ]]; then
        mkdir -p "${resolved}/dist"
        rsync -a --delete "$_DLD_LIV_DIR/packages/core/dist/" "${resolved}/dist/" \
            && ok "Recovery rsync complete — $target now exists" \
            || fail "Recovery rsync FAILED — manual intervention required (build /opt/liv/packages/core first)"
    else
        fail "Cannot recover: /opt/liv/packages/core/dist is empty/missing. Re-run _dld_build_liv_packages."
    fi
}

# ── 7. JWT secret (run BEFORE .env write so .env can reference its path) ────
# Phase 106 Bug #11: format MUST be exactly 64 hex chars (no newline).
# validateSecret in livos/packages/livinityd/source/modules/jwt.ts:29-36 enforces
#   /^[0-9a-fA-F]+$/ AND secret.length === 64
# The pre-106 helper wrote `openssl rand -base64 32` (44 b64 chars + newline =
# 45 bytes, with non-hex `+`/`/`/`=` chars) → BOTH checks fail → livinityd
# crashes at startup with "Invalid JWT secret, expected 256bit hex string".
#
# Format check on REUSE: if an old base64 secret exists from a prior pre-106
# install, detect format mismatch and ROTATE to hex. Rotation forces a re-login
# of all active sessions (week-long JWTs), which is far better than continued
# livinityd crash-loop. Rotation only fires when the existing file fails the
# 64-char hex check — operators with already-correct hex secrets see no rotation.
_dld_generate_jwt_secret() {
    step "Plan 104-11 / 106 Bug #11 — JWT secret (64-hex, no newline)"
    mkdir -p "$_DLD_SECRETS_DIR"
    chmod 0700 "$_DLD_SECRETS_DIR"

    local needs_generate=1
    if [[ -s "$_DLD_JWT_FILE" ]]; then
        # Existing file — check format. 64 bytes EXACTLY (no newline) AND all hex.
        local byte_count
        byte_count=$(wc -c < "$_DLD_JWT_FILE" 2>/dev/null | tr -d ' ')
        if [[ "$byte_count" == "64" ]] && grep -qE '^[0-9a-fA-F]{64}$' "$_DLD_JWT_FILE" 2>/dev/null; then
            ok "JWT secret already in 64-hex format at $_DLD_JWT_FILE (reuse)"
            needs_generate=0
        else
            warn "JWT secret at $_DLD_JWT_FILE is wrong format (${byte_count} bytes, may be old base64) — ROTATING to 64-hex"
            warn "  → All active sessions will be invalidated (forced re-login on next request)"
            cp "$_DLD_JWT_FILE" "${_DLD_JWT_FILE}.pre-106.bak" 2>/dev/null || true
            chmod 0600 "${_DLD_JWT_FILE}.pre-106.bak" 2>/dev/null || true
        fi
    fi

    if [[ "$needs_generate" == "1" ]]; then
        umask 0077
        # Hex32 no-newline. tr -d '\n' strips the trailing newline openssl
        # appends; the resulting file is exactly 64 bytes (one 64-char line
        # with no terminator) — matches validateSecret's length === 64 check.
        openssl rand -hex 32 | tr -d '\n' > "$_DLD_JWT_FILE"
        chmod 0600 "$_DLD_JWT_FILE"
        # Post-write self-check — fail loudly if for any reason the file is wrong
        local post_count
        post_count=$(wc -c < "$_DLD_JWT_FILE" 2>/dev/null | tr -d ' ')
        if [[ "$post_count" != "64" ]] || ! grep -qE '^[0-9a-fA-F]{64}$' "$_DLD_JWT_FILE" 2>/dev/null; then
            fail "JWT post-write self-check FAILED: ${post_count} bytes (expected 64 hex chars no newline). livinityd will crash — abort install."
        fi
        ok "JWT secret generated at $_DLD_JWT_FILE (64 hex chars, no newline, mode 0600)"
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

# Phase 134 user-directive (2026-05-17): Luse computer-use MCP server is
# enabled by default on fresh installs. Provides the global "luse" MCP
# (screen capture + xdotool input forwarding via mcp/server.ts) so AI chat
# can see + click + type into running apps out of the box.
# Pre-Phase-134 default-off (D-NATIVE-10) is overridden here because every
# real user expects this functionality without manual env edits.
# To disable on a specific install: edit this file post-install + restart livos.
LUSE_MCP_ENABLED=true
EOF

    # Append optional --api-key if 104-09 wrote one
    if [[ -n "${LIVOS_API_KEY:-}" ]]; then
        echo "LIV_API_KEY=${LIVOS_API_KEY}" >> "$_DLD_ENV_FILE"
    fi

    chmod 0600 "$_DLD_ENV_FILE"
    ok ".env written at $_DLD_ENV_FILE (mode 0600)"
}

# ── 7. Phase 109 — auto-seed liv:mcp:config (sequential-thinking + luse) ────
# Seeds Redis key `liv:mcp:config` from scripts/install/seeds/mcp-servers.json
# so a fresh install boots with 2 MCP servers registered (AI Chat shows them
# without operator-initiated Marketplace setup).
#
# Phase 219 T1 — writes as HASH (HSET per entry) instead of a single STRING.
# The historical SET write produced a Redis STRING, but the runtime router
# (livos/packages/livinityd/.../mcp-config-router.ts) uses HASH operations,
# so the first UI add threw WRONGTYPE → "Add failed (HTTP 500)" with no
# operator-visible cause. Phase 218 T6 added a STRING→HASH self-heal in
# liv-core's McpConfigManager and Phase 219 T1 added the equivalent self-heal
# to the tRPC router, but ALSO: stop writing STRING in the first place so
# fresh installs land in the correct primitive.
#
# Idempotency (D-109-IDEMPOTENT):
#   - SKIP if liv:mcp:config already exists in Redis. This protects user
#     customizations made via Marketplace/UI and survives re-runs of update.sh.
#
# Templating (D-109-PASSWORD-NEVER-IN-REPO):
#   - Seed file ships with literal `__LIVOS_REDIS_URL__` placeholder.
#   - This helper substitutes it with the host's actual REDIS_URL value
#     (read from /opt/livos/.env which _dld_write_env_file produced earlier
#     in the pipeline). Substitution uses `|` as sed delimiter — REDIS_URL
#     contains `/` so `s/.../.../` would collide.
#
# Fail-soft (D-109-FAIL-SOFT):
#   - Missing seed file → info + return 0 (older repo SHA without the seed
#     file should not break new installs)
#   - python3 missing → warn + return 0
#   - redis-cli failure → warn + return 0 (install should still ship a
#     working LivOS even if MCP seed fails)
_dld_seed_mcp_servers() {
    step "Phase 109 — seed liv:mcp:config (HASH, sequential-thinking + luse)"

    # Phase 109-02 hotfix: multi-candidate seed file lookup.
    # `scripts/install/seeds/` lives in the repo root, NOT in the `livos/`
    # subtree that gets rsync'd to `/opt/livos/`. So `${_DLD_LIVOS_DIR}/...`
    # never finds the file on a fresh install. Use BASH_SOURCE dirname first
    # (resolves to wherever install.sh sourced us from — e.g. /tmp/livos-fresh/
    # scripts/install/), fall back to the post-rsync path for forward-compat
    # in case a future plan also copies seeds/ into /opt/livos/.
    local seed_file=""
    local candidate
    for candidate in \
        "$(dirname "${BASH_SOURCE[0]}")/seeds/mcp-servers.json" \
        "${_DLD_LIVOS_DIR}/scripts/install/seeds/mcp-servers.json"; do
        if [[ -f "$candidate" ]]; then
            seed_file="$candidate"
            break
        fi
    done
    if [[ -z "$seed_file" ]]; then
        # Phase 252 (UAT G4): on a `curl | bash` self-bootstrap install the
        # seed file is NOT among the downloaded helpers, so both local candidates
        # miss. Fetch it from GitHub-raw (mirrors livos/install.sh:seed_mcp_servers)
        # so a fresh install still seeds liv:mcp:config instead of silently skipping.
        local _seed_raw_url="https://raw.githubusercontent.com/utopusc/livinity-io/master/scripts/install/seeds/mcp-servers.json"
        local _seed_tmp
        _seed_tmp="$(mktemp -t mcp-servers-XXXXXX.json 2>/dev/null)" || _seed_tmp="/tmp/mcp-servers.$$.json"
        if command -v curl >/dev/null 2>&1 && curl -fsSL "$_seed_raw_url" -o "$_seed_tmp" 2>/dev/null && [[ -s "$_seed_tmp" ]]; then
            seed_file="$_seed_tmp"
            info "Seed file fetched from GitHub-raw (self-bootstrap fallback): $seed_file"
        else
            info "Seed file not found locally and GitHub-raw fetch failed — skipping MCP seed (forward-compat)"
            return 0
        fi
    fi

    # Read REDIS_URL from .env (already written by _dld_write_env_file).
    local redis_url=""
    if [[ -f "$_DLD_ENV_FILE" ]]; then
        redis_url=$(grep -E '^REDIS_URL=' "$_DLD_ENV_FILE" 2>/dev/null \
            | sed -E 's|^REDIS_URL=(.*)$|\1|' \
            | head -1)
    fi
    if [[ -z "$redis_url" ]]; then
        warn "Could not read REDIS_URL from $_DLD_ENV_FILE — skipping MCP seed"
        return 0
    fi

    # Extract the bare password for redis-cli auth.
    local redis_pass
    redis_pass=$(echo "$redis_url" | sed -E 's|^redis://(default)?:([^@]+)@.*|\2|')
    if [[ -z "$redis_pass" || "$redis_pass" == "$redis_url" ]]; then
        warn "Could not extract Redis password from REDIS_URL — skipping MCP seed"
        return 0
    fi

    # Phase 219 T1 — gate against the canonical HASH primitive specifically.
    # If the key exists and is already a HASH, preserve operator customizations.
    # If it's a STRING (legacy from pre-219 installs), DEL and re-seed as HASH
    # so the runtime router stops throwing WRONGTYPE on the next Add click.
    local existing_type
    existing_type=$(redis-cli -a "$redis_pass" --no-auth-warning TYPE liv:mcp:config 2>/dev/null || echo "none")
    if [[ "$existing_type" == "hash" ]]; then
        ok "liv:mcp:config already present as HASH (reuse — preserves user customizations)"
        return 0
    elif [[ "$existing_type" == "string" ]]; then
        warn "liv:mcp:config exists as STRING (legacy pre-219 install) — re-seeding as HASH"
        if ! redis-cli -a "$redis_pass" --no-auth-warning DEL liv:mcp:config >/dev/null 2>&1; then
            warn "redis-cli DEL of STRING liv:mcp:config failed — install continues, runtime will self-heal"
            return 0
        fi
    elif [[ "$existing_type" != "none" ]]; then
        warn "liv:mcp:config exists as unexpected type '$existing_type' — skipping MCP seed (manual fix needed)"
        return 0
    fi

    # Phase 245.1: read LIV_API_KEY from .env (written by _dld_write_env_file
    # when 104-09 produced a key, or absent if no key was generated).
    local liv_api_key=""
    if [[ -f "$_DLD_ENV_FILE" ]]; then
        liv_api_key=$(grep -E '^LIV_API_KEY=' "$_DLD_ENV_FILE" 2>/dev/null \
            | sed -E 's|^LIV_API_KEY=(.*)$|\1|' \
            | head -1)
    fi
    if [[ -z "$liv_api_key" ]]; then
        warn "LIV_API_KEY missing from $_DLD_ENV_FILE — liv-* MCPs will spawn with empty API key. They'll surface 401 to the agent until operator wires a key via UI."
        # leave placeholder unsubstituted on purpose; the runtime resolver's
        # 'env-thread incomplete' warning is the documented signal for this case.
    fi

    # Phase 245.1: single-user v43 — slug defaults to 'bruce', domain to
    # 'livinity.io'. Multi-user v44+ should plumb these from per-user context.
    local user_slug="${LIVOS_USER_SLUG:-bruce}"
    local domain_root="${LIVOS_DOMAIN_ROOT:-livinity.io}"

    # Phase 252 (R6) — resolve the desktop user's DISPLAY + Xauthority at seed time
    # instead of baking uid-1000/GDM literals. The displays luse spawns use `-ac`
    # (disable-access-control), so DISPLAY=:1 is the working host display; the
    # Xauthority is resolved from the actual desktop user's runtime dir.
    local _desktop_user="${_DLD_DESKTOP_USER:-bruce}"
    local _desktop_uid
    _desktop_uid=$(id -u "$_desktop_user" 2>/dev/null || echo 1000)
    local luse_display=":1"
    local luse_xauthority
    # `|| true`: on a fresh box /run/user/<uid> may not exist yet → find exits
    # non-zero → under `set -euo pipefail` the bare assignment would abort the
    # whole install (UAT 252 G5 — only reachable once the seed actually runs).
    luse_xauthority=$(find "/run/user/${_desktop_uid}" -maxdepth 2 -name 'Xauthority' 2>/dev/null | head -1 || true)
    if [[ -z "$luse_xauthority" ]]; then
        luse_xauthority="/home/${_desktop_user}/.Xauthority"
    fi

    # Substitute the placeholders with the host's values.
    # Pipe delimiter: none of the substitution values contain `|` (Redis URL
    # contains `/` and `:`, the API key is base64-ish alphanumeric, slug is
    # plain ASCII, domain is dotted DNS).
    local substituted_json
    substituted_json=$(sed \
        -e "s|__LIVOS_REDIS_URL__|${redis_url}|g" \
        -e "s|__LIVOS_LIV_API_KEY__|${liv_api_key}|g" \
        -e "s|__LIVOS_USER_SLUG__|${user_slug}|g" \
        -e "s|__LIVOS_DOMAIN_ROOT__|${domain_root}|g" \
        -e "s|__LIVOS_DISPLAY__|${luse_display}|g" \
        -e "s|__LIVOS_XAUTHORITY__|${luse_xauthority}|g" \
        "$seed_file")
    if [[ -z "$substituted_json" ]]; then
        warn "Seed substitution produced empty JSON — skipping MCP seed"
        return 0
    fi

    # Phase 219 T1 — emit one HSET per server using python3 to safely traverse
    # the JSON and quote values for redis-cli. python3 is part of every Ubuntu
    # 24.04 base image we target (also a hard dep of livinityd's tsx runtime).
    if ! command -v python3 >/dev/null 2>&1; then
        warn "python3 not found — cannot emit HSET commands. Skipping MCP seed."
        return 0
    fi

    # python3 prints `<name>\t<json>` rows (TAB-separated; names are
    # `[a-zA-Z0-9_-]+`, never contain TAB). Bash reads each row and HSETs it.
    # Stdin: the substituted JSON. Stdout: the rows. Errors → fail-soft.
    local rows
    if ! rows=$(printf '%s' "$substituted_json" | python3 -c '
import json, sys
data = json.load(sys.stdin)
servers = data.get("mcpServers") or data.get("servers") or {}
for name, entry in servers.items():
    if not isinstance(entry, dict):
        continue
    # Strip seed-only metadata (installedAt, installedFrom) — runtime contract
    # is McpServerConfig without these fields. description is allowed to flow
    # through; the Phase 219 T2 catalog uses it.
    clean = {k: v for k, v in entry.items() if k not in ("installedAt", "installedFrom")}
    sys.stdout.write(name + "\t" + json.dumps(clean, separators=(",", ":")) + "\n")
' 2>&1); then
        warn "python3 JSON parse of seed failed — install continues without MCP seed"
        warn "python3 stderr: $rows"
        return 0
    fi

    local count=0
    while IFS=$'\t' read -r entry_name entry_json; do
        if [[ -z "$entry_name" || -z "$entry_json" ]]; then continue; fi
        if redis-cli -a "$redis_pass" --no-auth-warning HSET liv:mcp:config "$entry_name" "$entry_json" >/dev/null 2>&1; then
            count=$((count + 1))
        else
            warn "redis-cli HSET liv:mcp:config '$entry_name' failed — entry skipped"
        fi
    done <<< "$rows"

    # Verify the HSET landed as the right primitive.
    local verify_type
    verify_type=$(redis-cli -a "$redis_pass" --no-auth-warning TYPE liv:mcp:config 2>/dev/null || echo "none")
    if [[ "$verify_type" != "hash" ]]; then
        warn "liv:mcp:config not a HASH after HSET (got '$verify_type') — install continues without MCP seed"
        return 0
    fi

    ok "Seeded liv:mcp:config with $count MCP server(s) as HASH — substituted REDIS_URL"
}

# ── 7c. Phase 112 — seed livos:domain:config from local_mode keys ───────────
# FIX FOR: fresh `install.sh --mode hybrid|tunnel` runs left `livos:domain:config`
# unset, which caused the App Gateway at server/index.ts:321-324 to short-circuit
# with `next()` for every subdomain request → livinityd's UI served at
# `n8n.test.livinity.live` instead of n8n container. Discovered v34 mainserver UAT
# 2026-05-13T22:03Z. Sister fix is the boot-time fallback in livinityd's
# `start()` (sub-change 2b) — that one survives accidental `redis-cli DEL`.
#
# Idempotency (D-112-IDEMPOTENT-SEED): EXISTS livos:domain:config short-circuits;
# operator's manual Settings-wizard edits or tunnel-client auto-bootstrap survive.
# Fail-soft (D-112-WARN-NOT-FAIL): every redis-cli error → warn + return 0
# (a failed domain seed must NOT brick install).
_dld_seed_domain_config() {
    step "Phase 112 — seed livos:domain:config from local_mode keys"

    # 1. Read REDIS_URL from .env (already written by _dld_write_env_file).
    local redis_url=""
    if [[ -f "$_DLD_ENV_FILE" ]]; then
        redis_url=$(grep -E '^REDIS_URL=' "$_DLD_ENV_FILE" 2>/dev/null \
            | sed -E 's|^REDIS_URL=(.*)$|\1|' \
            | head -1)
    fi
    if [[ -z "$redis_url" ]]; then
        warn "Could not read REDIS_URL from $_DLD_ENV_FILE — skipping domain-config seed"
        return 0
    fi

    local redis_pass
    redis_pass=$(echo "$redis_url" | sed -E 's|^redis://(default)?:([^@]+)@.*|\2|')
    if [[ -z "$redis_pass" || "$redis_pass" == "$redis_url" ]]; then
        warn "Could not extract Redis password from REDIS_URL — skipping domain-config seed"
        return 0
    fi

    # 2. Idempotency gate (D-112-IDEMPOTENT-SEED) with Phase 132 Bug #14 override.
    #
    # Original semantics: skip if operator already configured via Settings wizard
    # or tunnel-client auto-bootstrap (preserve operator intent on rerun).
    #
    # Bug #14 (UAT 2026-05-17): when the install script is RE-RUN with an
    # explicit --domain flag (e.g. switching from tunnel to hybrid mode), the
    # preserve gate keeps the stale OLD domain in livos:domain:config and
    # livinityd returns "No app configured for this domain" 503 for the new
    # domain. An explicit --domain flag from the operator IS operator intent
    # to override, so force-update in that case.
    local existing
    existing=$(redis-cli -a "$redis_pass" --no-auth-warning EXISTS livos:domain:config 2>/dev/null || echo "0")
    if [[ "$existing" == "1" ]]; then
        # Read current domain from Redis vs the install-mode-specific domain key
        # we're about to seed below. If they DIFFER and the operator passed --domain
        # (DOMAIN env var, set by parse-cli.sh), the operator's intent is to switch
        # → override. If they MATCH or no explicit DOMAIN, preserve.
        local current_domain mode_domain
        current_domain=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:config 2>/dev/null \
            | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('domain',''))" 2>/dev/null || echo "")

        # The intended new domain is whatever we'd seed below per local_mode.
        # Peek it (mirror of step 3 below, dup'd intentionally to avoid restructure).
        # Phase 134 Bug #17: prefer explicit --domain flag (LIVOS_DOMAIN env)
        # over Redis-derived value, mirroring the seed-step logic so the
        # override-vs-preserve decision is symmetric.
        local peek_mode peek_domain
        local explicit_domain="${LIVOS_DOMAIN:-${DOMAIN:-}}"
        if [[ -n "$explicit_domain" ]]; then
            peek_domain="$explicit_domain"
            peek_mode="${MODE:-hybrid}"
        else
            peek_mode=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:local_mode 2>/dev/null || echo "")
            case "$peek_mode" in
                hybrid)
                    # Phase 134: hybrid → tunnel_domain (with hybrid_subdomain fallback)
                    peek_domain=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:tunnel_domain 2>/dev/null || echo "")
                    if [[ -z "$peek_domain" ]]; then
                        peek_domain=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:hybrid_subdomain 2>/dev/null || echo "")
                    fi
                    ;;
                tunnel)    peek_domain=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:tunnel_domain 2>/dev/null || echo "") ;;
                local-lan) peek_domain=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:local_tld 2>/dev/null || echo "") ;;
            esac
        fi

        if [[ -n "$explicit_domain" ]] && [[ -n "$peek_domain" ]] && [[ "$peek_domain" != "$current_domain" ]]; then
            warn "Bug #14/#17 override: --domain '${explicit_domain}' supplied, current livos:domain:config='${current_domain}' differs from new '${peek_domain}' → force-update"
            # Fall through to seed step below (skip the preserve return)
        else
            ok "livos:domain:config already present (reuse — preserves operator config)"
            return 0
        fi
    fi

    # 3. Derive domain. Phase 132 Bug #16: prefer explicit --domain CLI flag
    # (LIVOS_DOMAIN env var, set by parse-cli.sh) over Redis-key derivation.
    # Reason: on fresh install, mode-hybrid.sh "queues" config values that
    # won't reach Redis until livinityd boots and drains the queue — but
    # this seed runs BEFORE that boot. So Redis appears empty and the
    # local_mode='unset' branch silently skips, leaving livinityd with no
    # domain config → "No app configured for this domain" 503.
    # Solution: when LIVOS_DOMAIN is explicitly provided, trust it directly.
    #
    # Phase 134 UAT (Bug #17, 2026-05-17): the original variable name `DOMAIN`
    # was a mismatch — parse-cli.sh exports `LIVOS_DOMAIN`, not `DOMAIN`. The
    # check silently fell through to Redis-derived lookup, which ALSO failed
    # in Phase 134 hybrid mode because mode-hybrid.sh now delegates to mode-
    # tunnel.sh (no `livos:domain:hybrid_subdomain` key written) while install.sh
    # writes `local_mode=hybrid` (user-facing name). Result: tunnel-client raced
    # in with `assignedUrl` (e.g. bruce.livinity.io) and clobbered the operator's
    # actual domain (burak.livinity.live), causing cookie Domain mismatch +
    # LIVINITY_SESSION reject + WS auth fail. See project_phase_134_complete
    # memory for the full chain. Fix: honour both LIVOS_DOMAIN and legacy DOMAIN;
    # in hybrid Redis fallback, also peek tunnel_domain (Phase 134 source of truth).
    local local_mode domain=""
    local resolved_domain="${LIVOS_DOMAIN:-${DOMAIN:-}}"
    if [[ -n "$resolved_domain" ]]; then
        domain="$resolved_domain"
        local_mode="${MODE:-hybrid}"
        info "Bug #16/#17: using explicit --domain '${domain}' (mode=${local_mode}) instead of Redis-derived value"
    else
        local_mode=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:local_mode 2>/dev/null || echo "")
        case "$local_mode" in
            hybrid)
                # Phase 134: hybrid delegates to tunnel internally, so the
                # canonical Redis key is tunnel_domain (written by
                # _persist_tunnel_mode_redis). Fall back to hybrid_subdomain
                # for pre-Phase-134 installs that still wrote it.
                domain=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:tunnel_domain 2>/dev/null || echo "")
                if [[ -z "$domain" ]]; then
                    domain=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:hybrid_subdomain 2>/dev/null || echo "")
                fi
                ;;
            tunnel)
                domain=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:tunnel_domain 2>/dev/null || echo "")
                ;;
            local-lan)
                # local-lan uses ${HOST_IP}.{LIVINITY_LOCAL_TLD} for host-prefixed access;
                # the gateway's main-domain check works equally well on the bare TLD because
                # subdomains under it match the same suffix-check pattern.
                domain=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:domain:local_tld 2>/dev/null || echo "")
                ;;
            cloud|"")
                info "local_mode='${local_mode:-unset}' — no domain to seed, skipping (cloud mode has no subdomain routing)"
                return 0
                ;;
            *)
                warn "Unknown local_mode='${local_mode}' — skipping domain-config seed"
                return 0
                ;;
        esac
    fi

    if [[ -z "$domain" ]]; then
        warn "Could not resolve domain for local_mode='${local_mode}' — skipping domain-config seed"
        return 0
    fi

    # 4. Build JSON envelope matching DomainConfig interface in
    # livos/packages/livinityd/source/modules/domain/routes.ts:27-31.
    local activated_at
    activated_at=$(date +%s)000
    local json
    json=$(printf '{"domain":"%s","active":true,"activatedAt":%s,"source":"install-112"}' \
        "$domain" "$activated_at")

    # 5. SET (D-112-WARN-NOT-FAIL on error).
    if ! redis-cli -a "$redis_pass" --no-auth-warning SET livos:domain:config "$json" >/dev/null 2>&1; then
        warn "redis-cli SET livos:domain:config failed — install continues without domain-config seed"
        return 0
    fi

    # 6. Verify the SET landed.
    local verify
    verify=$(redis-cli -a "$redis_pass" --no-auth-warning EXISTS livos:domain:config 2>/dev/null || echo "0")
    if [[ "$verify" != "1" ]]; then
        warn "livos:domain:config not present after SET — install continues"
        return 0
    fi

    ok "Seeded livos:domain:config domain=${domain} active=true source=install-112"
}

# ── 7a2. Phase 252 (R10) — seed the v43 terminal-panel feature flag ─────────
# The /livos/terminal/ws handler (Gate 2) + the dock terminal entry both gate
# on `livos:v43:terminal_panel === 'true'`. The code default is OFF (safe), so
# a fresh box hides the terminal + 4403s the WS until an operator sets the key
# by hand. Seed it ON at install time. Idempotent: SET is harmless if already
# true. Fail-soft: any Redis error → warn + return 0.
_dld_seed_terminal_panel_flag() {
    step "Phase 252 (R10) — seed livos:v43:terminal_panel=true"

    # Read Redis password from .env (mirror _dld_seed_platform_api_key idiom).
    local redis_url=""
    if [[ -f "$_DLD_ENV_FILE" ]]; then
        redis_url=$(grep -E '^REDIS_URL=' "$_DLD_ENV_FILE" 2>/dev/null \
            | sed -E 's|^REDIS_URL=(.*)$|\1|' \
            | head -1)
    fi
    if [[ -z "$redis_url" ]]; then
        warn "Could not read REDIS_URL from $_DLD_ENV_FILE — skipping terminal_panel seed"
        return 0
    fi

    local redis_pass
    redis_pass=$(echo "$redis_url" | sed -E 's|^redis://(default)?:([^@]+)@.*|\2|')
    if [[ -z "$redis_pass" || "$redis_pass" == "$redis_url" ]]; then
        warn "Could not extract Redis password from REDIS_URL — skipping terminal_panel seed"
        return 0
    fi

    if redis-cli -a "$redis_pass" --no-auth-warning SET livos:v43:terminal_panel "true" 2>&1 | head -1 | grep -q "^OK$"; then
        ok "livos:v43:terminal_panel set to true"
    else
        warn "Failed to SET livos:v43:terminal_panel — terminal dock entry will be hidden until set by hand"
    fi
}

# ── 7b. v34 — auto-seed livos:platform:api_key from --api-key install flag ──
# When operator runs `bash install.sh --api-key liv_k_...` (a key issued by
# livinity.io dashboard), this helper writes the key DIRECTLY into Redis as
# `livos:platform:api_key` + sets `livos:platform:enabled=1`. Without this,
# the App Store window (livos/packages/ui/.../app-store-content.tsx) reads
# `domain.platform.getApiKey` → returns null → renders "Connect to Livinity
# Platform" prompt forcing the user to manually paste the key in Settings.
#
# This mirrors what the `domain.platform.setApiKey` tRPC mutation does at
# routes.ts:25-33 (redis.set api_key + redis.set enabled='1'), but skips the
# `tunnelClient.connect()` call (which is best-effort and not required for
# the App Store iframe URL to load — Server5 just validates `?token=...`).
#
# Existing helper `_write_api_key_secret_if_provided` in mode-tunnel.sh
# already writes the key to /etc/livos/secrets/api-key + sets
# `livos:account:api_key_path` pointer. That pair is used by the 104-10
# heartbeat client (livos/packages/livinityd/source/modules/account/). We
# ADD the platform-key seed here (NOT in mode-tunnel.sh) so it covers ALL
# install modes (hybrid, tunnel, local-lan, cloud).
#
# Idempotency: if `livos:platform:api_key` already equals the provided
# value, skip (no-op). If it differs, update (operator may have rotated
# their key on the dashboard).
#
# Fail-soft: any Redis error → warn + return 0. App Store will fall back
# to the Settings-prompt path (existing behavior).
_dld_seed_platform_api_key() {
    if [[ -z "${LIVOS_API_KEY:-}" ]]; then
        info "No --api-key provided — App Store will require manual entry in Settings (skipping platform key seed)"
        return 0
    fi

    step "v34 — seed livos:platform:api_key from --api-key flag"

    # Read Redis password from .env (already written by _dld_write_env_file)
    local redis_url=""
    if [[ -f "$_DLD_ENV_FILE" ]]; then
        redis_url=$(grep -E '^REDIS_URL=' "$_DLD_ENV_FILE" 2>/dev/null \
            | sed -E 's|^REDIS_URL=(.*)$|\1|' \
            | head -1)
    fi
    if [[ -z "$redis_url" ]]; then
        warn "Could not read REDIS_URL from $_DLD_ENV_FILE — skipping platform API key seed"
        return 0
    fi

    local redis_pass
    redis_pass=$(echo "$redis_url" | sed -E 's|^redis://(default)?:([^@]+)@.*|\2|')
    if [[ -z "$redis_pass" || "$redis_pass" == "$redis_url" ]]; then
        warn "Could not extract Redis password — skipping platform API key seed"
        return 0
    fi

    # Idempotency: if existing key equals provided value, skip
    local existing
    existing=$(redis-cli -a "$redis_pass" --no-auth-warning GET livos:platform:api_key 2>/dev/null || echo "")
    if [[ "$existing" == "$LIVOS_API_KEY" ]]; then
        ok "livos:platform:api_key already matches provided value (idempotent skip)"
        return 0
    fi

    # SET the platform API key + enabled flag (mirrors setApiKey tRPC mutation,
    # minus tunnelClient.connect() which is not needed for App Store iframe).
    if redis-cli -a "$redis_pass" --no-auth-warning SET livos:platform:api_key "$LIVOS_API_KEY" 2>&1 | head -1 | grep -q "^OK$"; then
        redis-cli -a "$redis_pass" --no-auth-warning SET livos:platform:enabled "1" >/dev/null 2>&1
        ok "Seeded livos:platform:api_key + livos:platform:enabled=1 (App Store iframe will load from livinity.io/store)"
    else
        warn "Failed to SET livos:platform:api_key — App Store will require manual entry in Settings"
    fi
}

# ── 8. systemd unit livos.service ───────────────────────────────────────────
# 104-12 path fix: WorkingDirectory=/opt/livos (flat, not nested).
_dld_write_systemd_unit() {
    step "Plan 104-11/104-12/105-05 — systemd unit livos.service"

    # Plan 105-05 Bug #5: ExecStart MUST match Mini PC's pattern (livos/install.sh:1332):
    #   /usr/bin/npx tsx /opt/livos/packages/livinityd/source/cli.ts --data-directory /opt/livos/data --port 8080
    # The previous `pnpm --filter livinityd start` invocation runs ./source/cli.ts WITHOUT
    # the --data-directory/--port flags → livinityd constructor crashes at
    # `path.resolve(undefined)` (source/index.ts:267). Switching to direct npx-tsx with
    # explicit args matches the working Mini PC convention.
    # _DLD_LIVOS_DATA_DIR defaults to ${_DLD_LIVOS_DIR}/data (e.g., /opt/livos/data).
    local livos_data_dir="${_DLD_LIVOS_DATA_DIR:-${_DLD_LIVOS_DIR}/data}"
    local livos_port="${_DLD_LIVOS_PORT:-8080}"
    mkdir -p "$livos_data_dir"

    cat > "$_DLD_SYSTEMD_UNIT" <<EOF
[Unit]
Description=LivOS server (livinityd) — Plan 104-11/104-12/105-05
After=postgresql.service redis-server.service liv-core.service network.target
Requires=postgresql.service redis-server.service

[Service]
Type=simple
# Phase 192-02 — livinityd runs as bruce (was root, see 192-CONTEXT.md).
# Root cause of v38.2 bug class (claude --dangerously-skip-permissions refusal
# under uid=0, vault path split between /root/ and /home/bruce/). Migration
# script chowns /opt/livos/data + .env* to bruce:bruce before this unit starts.
User=bruce
Group=bruce
WorkingDirectory=${_DLD_LIVOS_DIR}
EnvironmentFile=${_DLD_ENV_FILE}
# Phase 173-04 — v38 vault rename: Phase 171 vault-root-resolver.ts reads LIV_VAULT_ROOT; default fallback /root/livinity-vault is now a back-compat symlink (Plan 173-01)
Environment=LIV_VAULT_ROOT=/root/liv
ExecStart=/usr/bin/npx tsx ${_DLD_LIVOS_DIR}/packages/livinityd/source/cli.ts --data-directory ${livos_data_dir} --port ${livos_port}
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
    ok "livos.service written at $_DLD_SYSTEMD_UNIT (WorkingDirectory=${_DLD_LIVOS_DIR})"

    # ── Phase 132-05: reset-failed + restart with active-wait ─────────────────
    # Mirror of 132-06 Caddy fix: previous flow's `restart` silently no-op'd
    # against failed-state units (e.g. a prior install left livos.service
    # failed due to bug #6 ERR_MODULE_NOT_FOUND). Now: explicit reset-failed
    # first so the unit is eligible to start, then restart, then wait up to
    # 30s for active (livinityd's PG migration + Redis connect + MCP seed
    # boot path takes 5-15s on cold start).
    systemctl reset-failed livos.service 2>/dev/null || true
    info "Starting livos.service (reset-failed first to defeat sticky failed-state)"
    systemctl restart livos.service 2>/dev/null || \
        warn "livos.service restart failed; check journalctl -u livos -n 30"

    local livos_wait_i
    for livos_wait_i in $(seq 1 30); do
        if systemctl is-active --quiet livos.service; then
            ok "livos.service active after ${livos_wait_i}s"
            break
        fi
        sleep 1
    done

    if ! systemctl is-active --quiet livos.service; then
        warn "livos.service did not reach active state in 30s. Tail logs:"
        warn "  journalctl -u livos --no-pager -n 50"
        warn "Install will continue but the LivOS UI will not load until livos.service starts."
    fi
}

# ── 8b. systemd units for liv-core, liv-worker, liv-memory (104-12) ─────────
# Each unit follows the same template: After=postgresql+redis+network,
# EnvironmentFile=/opt/livos/.env (shared env), ExecStart=node dist/index.js
# (per their package.json "start" script — verified from liv/packages/*/package.json).
# Reference: Mini PC has these as `liv-core.service`, `liv-worker.service`,
# `liv-memory.service` (post Phase 65 rename from nexus-*). update.sh:629-655
# is the canonical Mini PC restart logic — we mirror its service names exactly.
#
# mcp-server: deliberately NO systemd unit. livinityd spawns it on-demand as a
# child process (per memory: project_v31_p77_complete.md — `additionalMcpServers`
# config option in SdkAgentRunner spawns bytebot MCP child process).
_dld_write_liv_systemd_units() {
    step "Plan 104-12 — systemd units for liv-core/liv-worker/liv-memory"

    local node_bin
    node_bin=$(command -v node)
    [[ -z "$node_bin" ]] && fail "node not on PATH after install — cannot wire liv systemd ExecStart"

    local pkg
    local unit_path
    for pkg in core worker memory; do
        local pkg_dir="$_DLD_LIV_DIR/packages/${pkg}"
        local entry="${pkg_dir}/dist/index.js"
        case "$pkg" in
            core)   unit_path="$_DLD_SYSTEMD_LIV_CORE_UNIT"   ;;
            worker) unit_path="$_DLD_SYSTEMD_LIV_WORKER_UNIT" ;;
            memory) unit_path="$_DLD_SYSTEMD_LIV_MEMORY_UNIT" ;;
        esac

        if [[ ! -f "$entry" ]]; then
            warn "liv-${pkg}: entry $entry missing — build did not emit dist/index.js (skipping systemd unit)"
            continue
        fi

        cat > "$unit_path" <<EOF
[Unit]
Description=Liv ${pkg} (@liv/${pkg}) — Plan 104-12
After=postgresql.service redis-server.service network.target
Requires=postgresql.service redis-server.service

[Service]
Type=simple
# Phase 192-02 — liv-${pkg} runs as bruce (shares /opt/livos/.env via EnvironmentFile)
User=bruce
Group=bruce
WorkingDirectory=${pkg_dir}
EnvironmentFile=${_DLD_ENV_FILE}
ExecStart=${node_bin} ${entry}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
        chmod 0644 "$unit_path"
        ok "liv-${pkg}.service written at $unit_path"
    done

    systemctl daemon-reload

    # Enable + start in dependency-friendly order: memory → worker → core.
    # (core depends on memory + worker being available for bullmq queues +
    # memory lookups; the exact ordering is via After= rather than hard deps so
    # a single missing service doesn't cascade-fail.)
    local svc
    for svc in liv-memory liv-worker liv-core; do
        local unit_file="/etc/systemd/system/${svc}.service"
        if [[ ! -f "$unit_file" ]]; then
            info "${svc}.service unit not written (entry was missing) — skipping enable/start"
            continue
        fi
        systemctl enable "${svc}.service" >/dev/null 2>&1 || true
        if systemctl is-active --quiet "${svc}.service"; then
            info "${svc}.service already running — restarting to pick up new build"
            systemctl restart "${svc}.service" 2>/dev/null || warn "${svc}.service restart failed"
        else
            info "Starting ${svc}.service"
            systemctl start "${svc}.service" 2>/dev/null || warn "${svc}.service failed to start; check journalctl -u ${svc} -n 30"
        fi
    done
    ok "liv-core/liv-worker/liv-memory systemd units installed + started"
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

# ── 9c. Phase 223/225/226 — install liv-assistant (AionUi :3020) + /liv ──────
# UAT 252: the fresh curl|bash installer (a pre-Phase-223 port of update.sh)
# never deployed Liv AI, so https://<host>/liv/ returned "Cannot GET /liv/" and
# the surface was absent on a fresh box. Mirror update.sh's chain (install at
# :625-639 + unit at :1229-1263) using the staged clone, then enable+start the
# unit so :3020 is UP before _dld_update_caddy_to_livinityd validates the
# Caddyfile that proxies /liv to it. Non-fatal: a Liv-AI failure must not brick
# the core install.
_dld_install_liv_assistant() {
    step "Phase 223/225 — install liv-assistant (vendored AionUi :3020) + unit"

    local installer="$_DLD_STAGE_DIR/scripts/install-liv-assistant.sh"
    if [[ ! -f "$installer" ]]; then
        warn "install-liv-assistant.sh not in stage dir ($_DLD_STAGE_DIR) — skipping Liv AI install (/liv will 404)"
        return 0
    fi
    if bash "$installer" 2>&1 | tail -10; then
        ok "liv-assistant binary installed (/opt/liv-assistant/current)"
    else
        warn "install-liv-assistant.sh failed — Liv AI (/liv) unavailable until re-run (SHA/network/disk?)"
        return 0
    fi

    local unit_src="$_DLD_STAGE_DIR/systemd/liv-assistant.service"
    local unit_dst="/etc/systemd/system/liv-assistant.service"
    if [[ ! -f "$unit_src" ]]; then
        warn "liv-assistant.service unit not in stage dir — skipping unit install"
        return 0
    fi
    if [[ ! -f "$unit_dst" ]] || ! cmp -s "$unit_src" "$unit_dst"; then
        install -m 0644 -o root -g root "$unit_src" "$unit_dst"
        systemctl daemon-reload
    fi
    # UAT 252 (G10): the unit's ReadWritePaths binds /home/<user>/.claude +
    # .cache + .bun under ProtectHome=read-only. systemd fails the start with
    # status=226/NAMESPACE if any of those dirs is MISSING (fresh box has no
    # ~/.claude until Claude Code runs). install-liv-assistant.sh creates .bun;
    # pre-create the rest bruce-owned so the mount namespace sets up.
    local _bru_home
    _bru_home=$(getent passwd "$_DLD_DESKTOP_USER" 2>/dev/null | cut -d: -f6 || true)
    [[ -n "$_bru_home" ]] || _bru_home="/home/$_DLD_DESKTOP_USER"
    mkdir -p "$_bru_home/.claude" "$_bru_home/.cache" "$_bru_home/.bun" 2>/dev/null || true
    chown "$_DLD_DESKTOP_USER:$_DLD_DESKTOP_USER" "$_bru_home/.claude" "$_bru_home/.cache" "$_bru_home/.bun" 2>/dev/null || true

    systemctl enable liv-assistant.service >/dev/null 2>&1 || true
    if systemctl restart liv-assistant.service 2>/dev/null; then
        ok "liv-assistant.service enabled + started (:3020)"
    else
        warn "liv-assistant.service failed to start — check journalctl -u liv-assistant -n 30 (/liv will 502 until fixed)"
    fi
}

# ── 10. Caddy reverse_proxy 127.0.0.1:8080 ──────────────────────────────────
# Rewrites /etc/caddy/Caddyfile to the final shape appropriate for the active
# mode. Plan 104-08 hybrid mode + 104-09 tunnel mode + 104-03 local-lan mode
# all need this — Caddy must terminate at livinityd, not at a placeholder.
_dld_update_caddy_to_livinityd() {
    step "Plan 104-11 — update Caddy to reverse_proxy 127.0.0.1:8080"

    # UAT 252 (Liv AI /liv): the fresh-install Caddyfile must serve the Liv
    # Assistant surface (/liv → AionUi :3020) + branding + WS + terminal handles.
    # The /liv route otherwise exists ONLY in the runtime caddy.ts generator,
    # which is invoked at app-install — never at boot — so on a fresh box GET
    # /liv/ fell through to livinityd → "Cannot GET /liv/". This block byte-
    # mirrors caddy.ts generateFullCaddyfile's :80 ordering (Phase 226-04 /
    # 237 split WS matchers / 243 terminal / 232 branding). Quoted heredoc so
    # the @liv_api_subresource Referer regex's trailing `$` stays literal.
    local _DLD_LIV_AI_HANDLES
    read -r -d '' _DLD_LIV_AI_HANDLES <<'LIVAI_HANDLES' || true
    @livaiSubapp path /liv-ai-app /liv-ai-app/*
    handle @livaiSubapp {
        reverse_proxy 127.0.0.1:3010 {
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
    }
    handle /liv/branding/* {
        uri strip_prefix /liv/branding
        root * /etc/liv-assistant/branding
        file_server
    }
    @webapp_stream_ws path /ws/stream/*
    handle @webapp_stream_ws {
        reverse_proxy 127.0.0.1:8080 {
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
    }
    @liv_ws path /ws /ws/*
    handle @liv_ws {
        reverse_proxy 127.0.0.1:3020 {
            header_down -X-Frame-Options
            header_down -Content-Security-Policy
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
    }
    @liv_api_subresource {
        header_regexp Referer ^https?://[^/]+/liv(/|$)
        path /api/*
    }
    handle @liv_api_subresource {
        reverse_proxy 127.0.0.1:3020 {
            header_down -X-Frame-Options
            header_down -Content-Security-Policy
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
        header Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
    }
    @livos_terminal_ws path /livos/terminal/ws
    handle @livos_terminal_ws {
        reverse_proxy 127.0.0.1:8080 {
            header_down -X-Frame-Options
            header_down -Content-Security-Policy
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
    }
    @liv path /liv /liv/*
    handle @liv {
        uri strip_prefix /liv
        reverse_proxy 127.0.0.1:3020 {
            header_down -X-Frame-Options
            header_down -Content-Security-Policy
            flush_interval -1
            transport http {
                versions 1.1
            }
        }
        header Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
    }
LIVAI_HANDLES

    case "${MODE:-hybrid}" in
        hybrid|tunnel)
            # Phase 134 — hybrid + tunnel both use CF Tunnel transport. CF
            # terminates TLS at the edge; Caddy serves plain HTTP on :80.
            # Pre-134 the hybrid branch wrote a LE DNS-01 Caddyfile expecting
            # CLOUDFLARE_API_TOKEN env — incompatible with Phase 134 (no
            # cf-token in tunnel-mode install; Caddy would fail to start).
            #
            # Phase 201-06 → Phase 203-03 (D-203-05) → Phase 203-09 — Liv AI
            # surface routing is now SPLIT:
            #   /liv-ai-app/openclawos[/*]  → :18789 (openclaw claw-gateway, strip_prefix via handle_path)
            #   /liv-ai-app/*                → :3010 (Next.js Phase 202 dashboard subapp)
            # Both handles are placed ABOVE the catch-all so Caddy's matcher-
            # specificity rules steer Liv AI traffic away from the livinityd
            # app gateway. The runtime generator in
            # livos/packages/livinityd/.../domain/caddy.ts emits the same
            # split for per-user vhosts (bruce.livinity.io/liv-ai-app/*).
            cat > "$_DLD_CADDYFILE" <<CADDYFILE
{
    auto_https off
}
:80 {
${_DLD_LIV_AI_HANDLES}
    handle {
        reverse_proxy 127.0.0.1:8080
    }
}
CADDYFILE
            ok "Caddyfile: :80 → 127.0.0.1:8080 (CF Tunnel terminates TLS — D-134-MODE; /openclawos/handshake → :8080; /liv-ai-app/liv-ai + /liv-ai-app/openclawos → :18789; /liv-ai-app/* → :3010)"
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
${_DLD_LIV_AI_HANDLES}
    handle {
        reverse_proxy 127.0.0.1:8080
    }
}
CADDYFILE
            ok "Caddyfile: *.${tld} → 127.0.0.1:8080 (tls internal liv-local; /openclawos/handshake → :8080; /liv-ai-app/liv-ai + /liv-ai-app/openclawos → :18789; /liv-ai-app/* → :3010)"
            ;;
        cloud)
            cat > "$_DLD_CADDYFILE" <<CADDYFILE
:80 {
${_DLD_LIV_AI_HANDLES}
    handle {
        reverse_proxy 127.0.0.1:8080
    }
}
CADDYFILE
            ok "Caddyfile: :80 → 127.0.0.1:8080 (cloud-mode bootstrap; /openclawos/handshake → :8080; /liv-ai-app/liv-ai + /liv-ai-app/openclawos → :18789; /liv-ai-app/* → :3010)"
            ;;
    esac

    # Plan 105-05 Bug #4: Caddyfile MUST be world-readable. By default, `cat > /etc/caddy/Caddyfile`
    # inherits umask 0077 on freshly-provisioned VPS (root umask), producing 0600 root:root.
    # Caddy systemd unit runs as `caddy` user → permission denied reading the config.
    # 0644 makes it readable by caddy without exposing write to anyone.
    chmod 0644 "$_DLD_CADDYFILE" 2>/dev/null || true
    # Phase 218 T1 follow-up: livinityd writes the Caddyfile from app install
    # / boot regen paths (Apps#rebuildCaddyFromState). Phase 86 moved
    # livinityd from root → bruce, but the Caddyfile stayed root-owned, so
    # every dynamic regen has been silently EACCES'ing since. Hand ownership
    # to bruce so the regen path actually lands; Caddy reads via 0644 either
    # way. Defensive: only chown if `bruce` exists (factory-reset runs first
    # on fresh installs and may pre-stage this script before user creation).
    if id bruce >/dev/null 2>&1; then
        chown bruce:bruce "$_DLD_CADDYFILE" 2>/dev/null || true
    fi

    # Validate config before reload
    if caddy validate --config "$_DLD_CADDYFILE" 2>/dev/null; then
        ok "Caddyfile validates"
    else
        warn "Caddyfile validation failed; check /etc/caddy/Caddyfile"
    fi

    # ── Phase 132-06: Caddy reset + start with active-wait ────────────────────
    # Without this, an install on a box where Caddy was previously failed
    # (common: install retries, leftover prior partial installs) leaves
    # Caddy in `failed` state — TLS + Caddyfile valid, port 443 unbound.
    # The old `systemctl reload || restart` two-liner silently no-op'd in
    # that case because reload doesn't reset a unit out of failed-state.
    info "Ensuring Caddy is started and reachable"
    systemctl reset-failed caddy 2>/dev/null || true
    systemctl daemon-reload
    systemctl enable caddy 2>/dev/null || true
    systemctl restart caddy 2>/dev/null || \
        warn "Caddy restart failed; check journalctl -u caddy -n 20"

    # Wait up to 30s for Caddy to come active (LE DNS-01 first cert
    # acquisition can take 5-20s on a fresh domain).
    local caddy_wait_i
    for caddy_wait_i in $(seq 1 30); do
        if systemctl is-active --quiet caddy; then
            ok "Caddy active after ${caddy_wait_i}s"
            break
        fi
        sleep 1
    done

    if ! systemctl is-active --quiet caddy; then
        warn "Caddy did not reach active state in 30s. Tail logs:"
        warn "  journalctl -u caddy --no-pager -n 50"
        warn "Install will continue but HTTPS may be down until Caddy starts."
    fi
}

# ── 11. Gallery cache (105-02 G5 — update.sh:596-610) ───────────────────────
# Idempotent git pull on /opt/livos/data/app-stores/*livinity-apps* clone.
# Graceful skip if cache dir or .git is absent (lazy-created on first store access).
_dld_update_gallery_cache() {
    step "105-02 (G5) — update gallery cache (update.sh:596-610)"

    local gallery_cache_dir
    # Plan 105-05 Bug #2: When /opt/livos/data/app-stores/ doesn't exist (fresh VPS),
    # `find` exits 1. Under `set -o pipefail`, that propagates through `head -1`, and the
    # `local x=$(...)` assignment fails set -e → entire deploy_livinityd aborts silently.
    # Append `|| true` so missing-dir is tolerated (the `[[ -n "$gallery_cache_dir" ]]`
    # check below already handles empty-string case).
    gallery_cache_dir=$(find "${_DLD_LIVOS_DIR}/data/app-stores/" -maxdepth 1 -name '*livinity-apps*' -type d 2>/dev/null | head -1) || true
    if [[ -n "$gallery_cache_dir" ]] && [[ -d "$gallery_cache_dir/.git" ]]; then
        info "Updating gallery cache at $gallery_cache_dir..."
        cd "$gallery_cache_dir"
        git config --global --add safe.directory "$gallery_cache_dir" 2>/dev/null || true
        git fetch origin 2>/dev/null || true
        git reset --hard origin/main 2>/dev/null || git reset --hard origin/master 2>/dev/null || warn "Gallery cache update failed"
        cd "$_DLD_LIVOS_DIR"
        ok "Gallery cache updated"
    else
        info "No gallery cache found - will be created on first App Store access"
    fi
}

# ── 12. Permissions (105-02 G6 — update.sh:612-622) ─────────────────────────
# chmod +x legacy-compat app-script + chown -R both trees to $_DLD_LIVOS_USER.
# app-script chmod closes the tRPC apps-router 500 that fires when the script
# isn't executable on first-install hosts.
_dld_fix_permissions() {
    step "105-02 (G6) — fix permissions (update.sh:612-622)"

    local livos_user="${_DLD_LIVOS_USER:-root}"

    # Make app-script executable (legacy-compat path required by tRPC apps router)
    chmod +x "$_DLD_LIVOS_DIR/packages/livinityd/source/modules/apps/legacy-compat/app-script" 2>/dev/null || true

    # Plan 105-05 Bug #3: Make cli.ts executable. After rsync, source/cli.ts inherits
    # 0600 (rsync -a preserves source mode = repo's tracked mode). systemd ExecStart
    # invokes ./source/cli.ts directly via shebang; without +x → Permission denied.
    chmod +x "$_DLD_LIVOS_DIR/packages/livinityd/source/cli.ts" 2>/dev/null || true

    # Set ownership (default root:root; configurable via _DLD_LIVOS_USER env)
    chown -R "${livos_user}:${livos_user}" "$_DLD_LIVOS_DIR" 2>/dev/null || true
    if [[ -d "$_DLD_LIV_DIR" ]]; then
        chown -R "${livos_user}:${livos_user}" "$_DLD_LIV_DIR" 2>/dev/null || true
    fi

    # UAT 252: livinityd boot drains /var/lib/livos/install-pending-redis-keys.txt
    # (written here as the install user). It runs as ${livos_user}, so that dir
    # must be readable by it — otherwise the Phase 141-01 drain EACCESes (non-fatal
    # but logs an error and skips queued seeds).
    if [[ -d /var/lib/livos ]]; then
        chown -R "${livos_user}:${livos_user}" /var/lib/livos 2>/dev/null || true
    fi

    ok "Permissions fixed (owner=${livos_user})"
}

# ── 8b'. Phase 192-02 — bruce-user ownership flip + sudoers install ─────────
# Idempotent migration: chowns /opt/livos/data + .env* to bruce:bruce, adds
# bruce to docker group, installs scripts/install/sudoers.d/livinityd →
# /etc/sudoers.d/livinityd (0440 root:root). MUST run BEFORE the systemd unit
# write so when systemd later starts livos.service as User=bruce, all paths
# the daemon touches are already bruce-owned. Re-runs detect marker + exit 0.
_dld_run_bruce_migration() {
    step "Phase 192-02 — bruce user migration (idempotent)"
    local migration_script="${_DLD_LIVOS_DIR}/scripts/migrate-to-bruce-user.sh"
    if [[ -f "$migration_script" ]]; then
        if REPO_ROOT="${_DLD_LIVOS_DIR}" bash "$migration_script"; then
            ok "bruce migration applied"
        else
            warn "migrate-to-bruce-user.sh exited non-zero — proceeding (systemd unit may fail with User=bruce until script is re-run successfully)"
        fi
    else
        warn "migrate-to-bruce-user.sh missing at $migration_script — skipping migration (livos.service will fail with User=bruce until script lands)"
    fi
}

# ── 8c. Phase 173-01 — v35 → v38 vault rename (idempotent) ──────────────────
# Renames /root/livinity-vault → /root/liv and creates a backward-compat
# symlink. Safe to run on fresh installs (no-op) and on already-migrated
# boxes (already-migrated short-circuit). MUST run BEFORE the systemd unit
# is written so Plan 173-04's `Environment=LIV_VAULT_ROOT=/root/liv` lands
# against the renamed directory.
_dld_run_vault_v35_to_v38_migration() {
    step "Phase 173-01 — v35 → v38 vault rename (idempotent)"
    local migrate_script="${_DLD_LIVOS_DIR}/scripts/migrate-v35-to-v38.sh"
    if [[ ! -f "$migrate_script" ]]; then
        warn "migrate-v35-to-v38.sh not found at $migrate_script — skipping vault rename"
        return 0
    fi
    if ! bash "$migrate_script"; then
        warn "migrate-v35-to-v38.sh returned non-zero — see log above"
        warn "deploy will continue; vault path may need manual repair"
        return 0
    fi
    ok "Phase 173-01 — vault rename migration script completed"
}

# ── 13. Cleanup + .deployed-sha (105-02 G7+G9 — update.sh:657-682) ──────────
# Stage dir preservation matches 104-11 reuse semantics (faster re-runs).
# Operators wanting strict update.sh parity: `export _DLD_CLEAR_STAGE=1` to
# purge. Also writes /opt/livos/.deployed-sha forward-compat with update.sh's
# Phase 30 UPD-03 SHA-tracking — without it, first `bash /opt/livos/update.sh`
# logs FROM_SHA=unknown (cosmetic).
_dld_cleanup_temp_dir() {
    step "105-02 (G7+G9) — cleanup + .deployed-sha (update.sh:657-682)"

    # G9: .deployed-sha write — read SHA from stage dir BEFORE optional purge
    if [[ -d "$_DLD_STAGE_DIR/.git" ]]; then
        local deployed_sha
        deployed_sha=$(cd "$_DLD_STAGE_DIR" && git rev-parse HEAD 2>/dev/null || echo "")
        if [[ -n "$deployed_sha" ]]; then
            echo "$deployed_sha" > "$_DLD_LIVOS_DIR/.deployed-sha"
            chmod 644 "$_DLD_LIVOS_DIR/.deployed-sha" 2>/dev/null || true
            ok ".deployed-sha recorded ($(echo "$deployed_sha" | cut -c1-7))"
        else
            warn "Could not extract HEAD SHA from stage dir"
        fi
    fi

    # G7: cleanup (gated on _DLD_CLEAR_STAGE for re-run cache preservation)
    if [[ "${_DLD_CLEAR_STAGE:-0}" == "1" ]]; then
        if [[ -d "$_DLD_STAGE_DIR" ]]; then
            rm -rf "$_DLD_STAGE_DIR"
            ok "Stage dir purged ($_DLD_STAGE_DIR)"
        fi
    else
        info "Stage dir preserved at $_DLD_STAGE_DIR (re-run cache; export _DLD_CLEAR_STAGE=1 to purge)"
    fi

    # update.sh's completion sentinel (forward-compat with future phase33_finalize trap)
    export LIVOS_UPDATE_COMPLETED=1
}

# ── Public entry point ──────────────────────────────────────────────────────
# 105-02 (this plan): closes RESEARCH gaps G2 (apt streaming + ydotoold unit),
# G3 (atomic update.sh self-rsync), G5 (gallery cache), G6 (chown + app-script
# chmod), G7 (cleanup), G8 (UI rm -rf dist), G9 (.deployed-sha forward-compat).
# Pipeline now matches CONTEXT.md §"Pipeline Order" 16-step canonical sequence.
#
# 104-12 + 104-13 + 105-01: extended pipeline now also builds liv stack + writes
# liv-core/liv-worker/liv-memory systemd units AND writes /opt/livos/.npmrc to
# allow baileys → libsignal git-repository subdep on pnpm 11+. Order matters:
#   1. system pkgs → postgres → redis (infra ready)
#   2. clone (both livos + liv) — now also does atomic update.sh self-rsync (105-02 G3)
#   3. streaming apt packages + ydotoold unit (105-02 G2)
#   4. JWT + .env (105-01: moved BEFORE pnpm install per CONTEXT pipeline order;
#      secrets must exist before any pnpm step that might inspect env)
#   5. write .npmrc (104-13 — BEFORE pnpm install)
#      → build livos (pnpm; UI build now `rm -rf dist` first per 105-02 G8) → build liv (npm)
#   6. sync liv dist into livinityd's pnpm-store (closes Mini PC pitfall)
#   7. gallery cache (105-02 G5) + permissions (105-02 G6)
#   8. liv systemd units FIRST (so livos.service `After=liv-core` is satisfied)
#   9. livos systemd unit (the cap-stone)
#  10. health-check + caddy reload
#  11. cleanup + .deployed-sha write (105-02 G7+G9)
#
# 105-01 refactor:
#   - _dld_verify_build helper extracted (was inlined in 3 sites)
#   - Anchored --exclude='/docker/' (was 'docker/' — D-105-STEP2-EXCLUDE-ANCHORED)
#   - Pipeline reorder: secrets moved BEFORE pnpm install
deploy_livinityd() {
    if [[ "${SKIP_DEPLOY:-0}" == "1" ]]; then
        info "Plan 104-11 — --skip-deploy set; skipping livinityd deploy"
        return 0
    fi

    step "Plan 104-11/104-12/105-02 / 109 / 112 — deploying livinityd + liv stack (full LivOS application stack)"
    info "After this completes, the LivOS UI should load in the browser."
    info "Scope: livinityd (Plan 104-11) + liv-core/liv-worker/liv-memory (Plan 104-12) + update.sh 1:1 port (105-02) + MCP seed (109) + domain-config seed (112)."

    _dld_install_system_packages
    _dld_setup_postgres
    _dld_setup_redis
    _dld_create_desktop_user              # 106 Bug #10 — bruce user + sudo + docker groups + NOPASSWD sudoers
    _dld_clone_source
    _dld_install_streaming_packages       # 105-02 G2 — streaming apt + ydotoold unit
    _dld_install_google_chrome            # 106 Bug #9 — google-chrome-stable (WebApp Launcher blocker)
    _dld_setup_docker_images              # 105-05 Bug #6 — pull+retag getumbrel/* → livos/* (Mini PC pattern)
    _dld_generate_jwt_secret              # 105-01: moved earlier — secrets BEFORE pnpm install per CONTEXT pipeline order
    _dld_write_env_file                   # 105-01: moved earlier
    _dld_seed_mcp_servers                 # Phase 109 — auto-seed liv:mcp:config (sequential-thinking + luse)
    _dld_seed_terminal_panel_flag         # Phase 252 (R10) — seed livos:v43:terminal_panel=true (terminal dock entry + WS gate)
    _dld_seed_domain_config               # Phase 112 — seed livos:domain:config from local_mode keys (App Gateway gate)
    _dld_seed_platform_api_key            # v34 — auto-seed livos:platform:api_key from --api-key flag (App Store no-prompt UX)
    _dld_write_pnpm_npmrc
    _dld_build_packages
    _dld_build_liv_packages
    _dld_sync_liv_dist_into_pnpm_store
    _dld_verify_liv_dist_reachable        # 132-05 — pre-boot verify + auto-recover Bug #6
    _dld_update_gallery_cache             # 105-02 G5 — gallery cache git pull
    _dld_fix_permissions                  # 105-02 G6 — chown + app-script chmod
    _dld_run_bruce_migration              # Phase 192-02 — bruce user ownership flip + sudoers install BEFORE systemd unit write
    _dld_run_vault_v35_to_v38_migration   # Phase 173-01 — vault rename BEFORE systemd unit write
    _dld_write_liv_systemd_units
    _dld_write_systemd_unit
    _dld_health_check
    _dld_install_liv_assistant            # UAT 252 — install Liv AI (AionUi :3020) + unit so /liv resolves
    _dld_update_caddy_to_livinityd
    _dld_cleanup_temp_dir                 # 105-02 G7+G9 — cleanup + .deployed-sha

    ok "Plan 104-11/104-12/104-13/105-01/105-02 / 109 / 112 — livinityd + liv stack deploy complete"
}
