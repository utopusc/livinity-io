#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# LivOS One-Command Installer
# Usage: curl -sSL https://... | bash
# ──────────────────────────────────────────────────────────

main() {
    set -euo pipefail

    # ── Constants ─────────────────────────────────────────────
    LIVOS_DIR="/opt/livos"
    NEXUS_DIR="/opt/nexus"
    REPO_URL="https://github.com/utopusc/livinity-io.git"

    # ── OS/Arch variables (set by detect_os/detect_arch) ──────
    OS_ID=""
    OS_VERSION_ID=""
    OS_CODENAME=""
    OS_PRETTY_NAME=""
    ARCH=""

    # ── Colors ────────────────────────────────────────────────
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    NC='\033[0m'

    # ── Helper functions ──────────────────────────────────────
    info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
    ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
    warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
    fail()  { echo -e "${RED}[FAIL]${NC}  $*"; cleanup_on_error; exit 1; }
    step()  { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

    # ── Setup ERR trap ────────────────────────────────────────
    trap 'cleanup_on_error $LINENO' ERR

    # ── Detection functions ───────────────────────────────────
    detect_os() {
        if [[ -f /etc/os-release ]]; then
            . /etc/os-release
            OS_ID="${ID:-unknown}"
            OS_VERSION_ID="${VERSION_ID:-unknown}"
            OS_CODENAME="${VERSION_CODENAME:-}"
            OS_PRETTY_NAME="${PRETTY_NAME:-Unknown OS}"
        else
            fail "Cannot detect OS - /etc/os-release not found"
        fi

        # Validate supported OS
        case "$OS_ID" in
            ubuntu|debian)
                ok "Detected: $OS_PRETTY_NAME"
                ;;
            *)
                warn "OS '$OS_ID' not officially supported. Continuing anyway..."
                warn "Tested on: Ubuntu 22.04+, Debian 11+"
                ;;
        esac
    }

    detect_arch() {
        local raw_arch
        raw_arch=$(uname -m)

        case "$raw_arch" in
            x86_64)  ARCH="amd64" ;;
            aarch64) ARCH="arm64" ;;
            armv7l)  ARCH="armhf" ;;
            *)       fail "Unsupported architecture: $raw_arch" ;;
        esac

        ok "Architecture: $ARCH ($raw_arch)"
    }

    check_root() {
        if [[ $EUID -ne 0 ]]; then
            fail "This script must be run as root (use: sudo bash install.sh)"
        fi
        ok "Running as root"
    }

    # ── Wizard Helpers ────────────────────────────────────────

    # Detect if running interactively
    detect_tty() {
        if [[ -t 0 ]] && [[ -t 1 ]]; then
            HAS_TTY=true
        else
            HAS_TTY=false
            info "Non-interactive mode detected - using defaults"
        fi
    }

    # Check if whiptail is available
    check_whiptail() {
        if command -v whiptail &>/dev/null; then
            HAS_WHIPTAIL=true
        else
            HAS_WHIPTAIL=false
            if $HAS_TTY; then
                info "whiptail not found - using text prompts"
            fi
        fi
    }

    # Input dialog - returns user input or default
    wizard_input() {
        local title="$1"
        local prompt="$2"
        local default="$3"

        if $HAS_TTY && $HAS_WHIPTAIL; then
            local result
            result=$(whiptail --title "$title" --inputbox "$prompt" 10 60 "$default" 3>&1 1>&2 2>&3) || true
            echo "${result:-$default}"
        elif $HAS_TTY; then
            local value
            read -rp "$prompt [$default]: " value
            echo "${value:-$default}"
        else
            echo "$default"
        fi
    }

    # Password input - hidden characters
    wizard_password() {
        local title="$1"
        local prompt="$2"

        if $HAS_TTY && $HAS_WHIPTAIL; then
            local result
            result=$(whiptail --title "$title" --passwordbox "$prompt" 10 60 3>&1 1>&2 2>&3) || true
            echo "$result"
        elif $HAS_TTY; then
            local value
            read -rsp "$prompt: " value
            echo ""  # newline after hidden input
            echo "$value"
        else
            echo ""  # empty in non-interactive
        fi
    }

    # Yes/No dialog - returns 0 for yes, 1 for no
    wizard_yesno() {
        local title="$1"
        local prompt="$2"
        local default="${3:-no}"  # default to no

        if $HAS_TTY && $HAS_WHIPTAIL; then
            if [[ "$default" == "yes" ]]; then
                whiptail --title "$title" --yesno "$prompt" 10 60 --defaultno
                return $?
            else
                whiptail --title "$title" --yesno "$prompt" 10 60
                return $?
            fi
        elif $HAS_TTY; then
            local answer
            if [[ "$default" == "yes" ]]; then
                read -rp "$prompt [Y/n]: " answer
                [[ ! "$answer" =~ ^[Nn] ]]
            else
                read -rp "$prompt [y/N]: " answer
                [[ "$answer" =~ ^[Yy] ]]
            fi
        else
            [[ "$default" == "yes" ]]
        fi
    }

    # Info message box
    wizard_msgbox() {
        local title="$1"
        local message="$2"

        if $HAS_TTY && $HAS_WHIPTAIL; then
            whiptail --title "$title" --msgbox "$message" 12 60
        elif $HAS_TTY; then
            echo -e "\n$title\n$message\n"
            read -rp "Press Enter to continue..."
        fi
    }

    # ── Dependency installation functions ─────────────────────
    install_build_tools() {
        info "Installing build tools..."
        apt-get install -y -qq build-essential git curl
        ok "Build tools ready"
    }

    install_yq() {
        if command -v yq &>/dev/null; then
            ok "yq already installed"
            return 0
        fi

        info "Installing yq..."
        wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
        chmod +x /usr/local/bin/yq
        ok "yq installed"
    }

    install_nodejs() {
        local required_version=22

        if command -v node &>/dev/null; then
            local current
            current=$(node -v | cut -d. -f1 | tr -d v)
            if [[ "$current" -ge "$required_version" ]]; then
                ok "Node.js $(node -v) already installed"
                return 0
            fi
        fi

        info "Installing Node.js ${required_version}.x..."

        apt-get install -y -qq ca-certificates curl gnupg

        mkdir -p /etc/apt/keyrings
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | \
            gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

        echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${required_version}.x nodistro main" | \
            tee /etc/apt/sources.list.d/nodesource.list

        apt-get update -qq
        apt-get install -y -qq nodejs

        ok "Node.js $(node -v) installed"
    }

    install_pnpm() {
        if command -v pnpm &>/dev/null; then
            ok "pnpm already installed"
            return 0
        fi

        info "Installing pnpm..."
        npm install -g pnpm
        ok "pnpm installed"
    }

    install_pm2() {
        if command -v pm2 &>/dev/null; then
            ok "PM2 already installed"
            return 0
        fi

        info "Installing PM2..."
        npm install -g pm2
        ok "PM2 installed"
    }

    install_redis() {
        if command -v redis-server &>/dev/null; then
            ok "Redis already installed"
            return 0
        fi

        info "Installing Redis..."
        apt-get install -y -qq redis-server
        systemctl enable redis-server
        ok "Redis installed"
    }

    install_docker() {
        if command -v docker &>/dev/null; then
            ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') already installed"
            return 0
        fi

        info "Installing Docker..."

        # Remove old versions
        apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

        apt-get update -qq
        apt-get install -y -qq ca-certificates curl

        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" -o /etc/apt/keyrings/docker.asc
        chmod a+r /etc/apt/keyrings/docker.asc

        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
            https://download.docker.com/linux/${OS_ID} ${OS_CODENAME} stable" | \
            tee /etc/apt/sources.list.d/docker.list

        apt-get update -qq
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
            docker-buildx-plugin docker-compose-plugin

        systemctl enable docker
        systemctl start docker

        ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installed"
    }

    setup_docker_images() {
        info "Setting up LivOS Docker images..."

        # Pull Umbrel images and retag as livos/
        # This allows us to use branded images without needing a Docker Hub org

        local images=(
            "getumbrel/auth-server:1.0.5|livos/auth-server:1.0.5"
            "getumbrel/tor:0.4.7.8|livos/tor:0.4.7.8"
        )

        for entry in "${images[@]}"; do
            local src="${entry%%|*}"
            local dst="${entry##*|}"

            # Check if destination image already exists
            if docker image inspect "$dst" &>/dev/null; then
                ok "Image $dst already exists"
                continue
            fi

            info "Pulling $src..."
            if ! docker pull "$src"; then
                warn "Failed to pull $src - will retry on first use"
                continue
            fi

            info "Tagging as $dst..."
            docker tag "$src" "$dst"

            # Also tag as latest
            local dst_latest="${dst%%:*}:latest"
            docker tag "$src" "$dst_latest"

            ok "Image $dst ready"
        done

        ok "LivOS Docker images configured"
    }

    install_python() {
        if command -v python3 &>/dev/null; then
            ok "Python3 $(python3 --version | cut -d' ' -f2) already installed"
            return 0
        fi

        info "Installing Python3..."
        apt-get install -y -qq python3 python3-pip python3-venv
        ok "Python3 installed"
    }

    # ── Fail2ban ────────────────────────────────────────────────

    install_fail2ban() {
        if command -v fail2ban-client &>/dev/null; then
            ok "fail2ban already installed"
        else
            info "Installing fail2ban..."
            apt-get install -y -qq fail2ban
        fi

        # Create jail.local for SSH protection
        cat > /etc/fail2ban/jail.local << 'JAIL'
[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 5
bantime  = 1h
findtime = 10m
backend  = systemd
JAIL

        systemctl enable --now fail2ban
        ok "fail2ban configured: SSH jail active (maxretry=5, bantime=1h)"
    }

    # ── SSH Hardening ──────────────────────────────────────────

    harden_ssh() {
        step "Hardening SSH"

        local drop_in="/etc/ssh/sshd_config.d/99-livos-hardening.conf"
        mkdir -p /etc/ssh/sshd_config.d

        # Ensure sshd_config includes drop-in directory
        if ! grep -q "^Include /etc/ssh/sshd_config.d/\*.conf" /etc/ssh/sshd_config 2>/dev/null; then
            echo "Include /etc/ssh/sshd_config.d/*.conf" >> /etc/ssh/sshd_config
            info "Added Include directive to sshd_config"
        fi

        # Detect if any SSH keys are installed
        local has_keys=false
        for keyfile in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
            if [[ -f "$keyfile" ]] && [[ -s "$keyfile" ]]; then
                has_keys=true
                break
            fi
        done

        # Write hardening config
        cat > "$drop_in" << SSHCONF
# LivOS SSH hardening — auto-generated by install.sh
PermitRootLogin prohibit-password
MaxAuthTries 5
LoginGraceTime 30
X11Forwarding no
SSHCONF

        if $has_keys; then
            echo "PasswordAuthentication no" >> "$drop_in"
            ok "SSH keys detected — password auth disabled"
        else
            warn "No SSH keys found — password auth remains enabled"
            warn "Add your SSH key and re-run to disable password auth"
        fi

        # Neutralize cloud-init SSH overrides that conflict with our hardening
        local cloud_init="/etc/ssh/sshd_config.d/50-cloud-init.conf"
        if [[ -f "$cloud_init" ]] && grep -q "PasswordAuthentication" "$cloud_init" 2>/dev/null; then
            echo "# Disabled by LivOS — see 99-livos-hardening.conf" > "$cloud_init"
            info "Neutralized cloud-init SSH override"
        fi

        # Validate before applying — prevent lockout
        if sshd -t 2>/dev/null; then
            systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || true
            ok "SSH hardened (drop-in: $drop_in)"
        else
            rm -f "$drop_in"
            warn "SSH config validation failed — drop-in removed to prevent lockout"
        fi
    }

    # ── Configuration Wizard ──────────────────────────────────

    run_configuration_wizard() {
        step "Configuration Wizard"

        # Initialize defaults
        CONFIG_DOMAIN="localhost"
        CONFIG_USE_HTTPS="false"
        CONFIG_GEMINI_KEY=""
        CONFIG_WHATSAPP="false"

        if ! $HAS_TTY; then
            info "Using default configuration (non-interactive)"
            return 0
        fi

        # Welcome message
        wizard_msgbox "LivOS Installer" \
            "Welcome to LivOS!\n\nThis wizard will help you configure your installation.\n\nYou can change these settings later in the Settings panel."

        # Domain configuration
        CONFIG_DOMAIN=$(wizard_input "Domain Setup" \
            "Enter your domain name:\n\n(Use 'localhost' for local-only access)" \
            "localhost")

        # HTTPS configuration (only if not localhost)
        if [[ "$CONFIG_DOMAIN" != "localhost" ]]; then
            if wizard_yesno "HTTPS Setup" \
                "Enable automatic HTTPS via Let's Encrypt?\n\nRequires:\n- Domain DNS pointing to this server\n- Ports 80/443 open"; then
                CONFIG_USE_HTTPS="true"
            fi
        fi

        # AI API Key
        if wizard_yesno "AI Configuration" \
            "Configure a Gemini API key now?\n\n(You can also add this later in Settings > AI Configuration)\n\nGet a key at: https://aistudio.google.com/app/apikey"; then
            CONFIG_GEMINI_KEY=$(wizard_input "Gemini API Key" \
                "Enter your Gemini API key:" \
                "")
        fi

        # Optional features
        if wizard_yesno "WhatsApp Integration" \
            "Enable WhatsApp integration?\n\n(Requires WhatsApp Business API setup)\n\nMost users skip this initially." \
            "no"; then
            CONFIG_WHATSAPP="true"
        fi

        # Summary
        local summary="Configuration Summary:\n\n"
        summary+="Domain: $CONFIG_DOMAIN\n"
        summary+="HTTPS: $CONFIG_USE_HTTPS\n"
        summary+="Gemini API Key: $([ -n "$CONFIG_GEMINI_KEY" ] && echo "Configured" || echo "Not set")\n"
        summary+="WhatsApp: $CONFIG_WHATSAPP"

        wizard_msgbox "Configuration Complete" "$summary"

        ok "Configuration collected"
    }

    # ── Secret Generation ─────────────────────────────────────

    generate_secrets() {
        info "Generating secure secrets..."

        # 256-bit secrets (64 hex chars)
        SECRET_JWT=$(openssl rand -hex 32)
        SECRET_API_KEY=$(openssl rand -hex 32)
        SECRET_REDIS=$(openssl rand -hex 24)

        # Verify generation
        if [[ ${#SECRET_JWT} -ne 64 ]] || [[ ${#SECRET_API_KEY} -ne 64 ]]; then
            fail "Failed to generate secure secrets - openssl error"
        fi

        ok "Secrets generated"
    }

    # ── Environment File ──────────────────────────────────────

    write_env_file() {
        local env_file="$LIVOS_DIR/.env"

        if [[ -f "$env_file" ]]; then
            if $HAS_TTY; then
                if wizard_yesno "Existing Configuration" \
                    "An existing .env file was found.\n\nOverwrite with new configuration?\n\n(Backup will be created as .env.backup)"; then
                    cp "$env_file" "${env_file}.backup"
                    info "Backup created: .env.backup"
                else
                    ok "Preserving existing .env"
                    return 0
                fi
            else
                ok "Preserving existing .env (non-interactive)"
                return 0
            fi
        fi

        info "Writing .env configuration..."

        cat > "$env_file" << ENVFILE
# ==============================================================================
# LIVINITY ENVIRONMENT CONFIGURATION
# ==============================================================================
# Generated by install.sh on $(date -Iseconds)
# ==============================================================================

# === AI API Keys ===
GEMINI_API_KEY=${CONFIG_GEMINI_KEY:-}
ANTHROPIC_API_KEY=

# === Security ===
JWT_SECRET=${SECRET_JWT}
LIV_API_KEY=${SECRET_API_KEY}

# === Database ===
REDIS_URL=redis://:${SECRET_REDIS}@localhost:6379
DATABASE_URL=

# === Domain ===
LIVOS_DOMAIN=${CONFIG_DOMAIN:-localhost}
LIVOS_USE_HTTPS=${CONFIG_USE_HTTPS:-false}

# === Server Ports ===
MCP_PORT=3100
API_PORT=3200
MEMORY_PORT=3300

# === Service Bind Address ===
API_HOST=127.0.0.1
MCP_HOST=127.0.0.1
MEMORY_HOST=127.0.0.1

# === Daemon Configuration ===
DAEMON_INTERVAL_MS=30000
DEFAULT_MODEL=gemini-2.0-flash

# === Service URLs ===
NEXUS_API_URL=http://localhost:3200
MEMORY_SERVICE_URL=http://localhost:3300

# === Integrations ===
WHATSAPP_ENABLED=${CONFIG_WHATSAPP:-false}

# === Environment ===
NODE_ENV=production
ENVFILE

        chmod 600 "$env_file"
        ok ".env created with secure permissions (600)"
    }

    # ── Repository Setup ──────────────────────────────────────

    setup_repository() {
        step "Setting up repository"

        local temp_dir="/tmp/livinity-io-$$"

        if [[ -d "$LIVOS_DIR/packages" ]]; then
            info "Repository exists, pulling latest..."
            cd "$LIVOS_DIR"
            git pull --ff-only 2>/dev/null || warn "Git pull failed, continuing with existing code"
            ok "Repository updated"
        else
            info "Cloning repository..."
            rm -rf "$temp_dir"
            git clone --depth 1 "$REPO_URL" "$temp_dir" || fail "Failed to clone repository"

            # Move livos contents to /opt/livos
            rm -rf "$LIVOS_DIR"
            mv "$temp_dir/livos" "$LIVOS_DIR"

            # Move nexus to /opt/nexus (required dependency)
            rm -rf /opt/nexus
            mv "$temp_dir/nexus" /opt/nexus

            # Cleanup
            rm -rf "$temp_dir"

            ok "Repository ready"
        fi

        cd "$LIVOS_DIR"
    }

    # ── Build Project ─────────────────────────────────────────

    build_project() {
        step "Building project"

        cd "$LIVOS_DIR"
        local nexus_dir="/opt/nexus"

        # Install LivOS dependencies (pnpm workspaces)
        info "Installing LivOS dependencies..."
        pnpm install --frozen-lockfile 2>/dev/null || pnpm install
        ok "LivOS dependencies installed"

        # Build @livos/config package
        info "Building @livos/config..."
        cd "$LIVOS_DIR/packages/config"
        npx tsc
        cd "$LIVOS_DIR"
        ok "@livos/config built"

        # Build UI
        info "Building UI (this may take a few minutes)..."
        cd "$LIVOS_DIR/packages/ui"
        npm run build 2>&1 | tail -5
        cd "$LIVOS_DIR"

        # Symlink UI dist to expected location
        ln -sf "$LIVOS_DIR/packages/ui/dist" "$LIVOS_DIR/packages/livinityd/ui"
        ok "UI built"

        # Install Nexus dependencies
        if [[ -d "$nexus_dir" ]]; then
            info "Installing Nexus dependencies..."
            cd "$nexus_dir"
            npm install --production=false 2>/dev/null || npm install
            cd "$LIVOS_DIR"
            ok "Nexus dependencies installed"

            # Build Nexus packages individually (skip failures)
            info "Building Nexus packages..."
            cd "$nexus_dir"

            # Build core (required)
            cd packages/core && npx tsc && cd ../..
            ok "Nexus core built"

            # Build worker (optional)
            cd packages/worker && npx tsc 2>/dev/null && cd ../.. || cd ../..

            # Build mcp-server (optional)
            cd packages/mcp-server && npx tsc 2>/dev/null && cd ../.. || cd ../..

            cd "$LIVOS_DIR"
            ok "Nexus packages built"

            # Copy nexus dist to pnpm symlink location
            local pnpm_nexus_dir
            pnpm_nexus_dir=$(find "$LIVOS_DIR/node_modules/.pnpm" -maxdepth 1 -name '@nexus+core*' -type d 2>/dev/null | head -1)
            if [[ -n "$pnpm_nexus_dir" ]] && [[ -d "$nexus_dir/packages/core/dist" ]]; then
                cp -r "$nexus_dir/packages/core/dist" "$pnpm_nexus_dir/node_modules/@nexus/core/"
                ok "Nexus dist linked to pnpm store"
            fi
        fi

        # Python venv for memory service
        local memory_dir="$nexus_dir/packages/memory"
        if [[ -f "$memory_dir/src/requirements.txt" ]]; then
            info "Setting up Python venv for memory service..."
            if [[ ! -d "$memory_dir/venv" ]]; then
                python3 -m venv "$memory_dir/venv"
            fi
            "$memory_dir/venv/bin/pip" install -q -r "$memory_dir/src/requirements.txt"
            ok "Python venv ready"
        fi

        # Symlink .env for Nexus
        if [[ -d "$nexus_dir" ]] && [[ ! -L "$nexus_dir/.env" ]]; then
            ln -sf /opt/livos/.env "$nexus_dir/.env"
            ok "Nexus .env symlinked"
        fi

        # Create directories
        mkdir -p "$LIVOS_DIR/logs"
        mkdir -p "$LIVOS_DIR/data"
        ok "Directories created"

        # Make app-script executable
        chmod +x "$LIVOS_DIR/packages/livinityd/source/modules/apps/legacy-compat/app-script" 2>/dev/null || true
    }

    # ── Redis Configuration ───────────────────────────────────

    configure_redis() {
        step "Configuring Redis"

        local redis_conf="/etc/redis/redis.conf"

        if [[ ! -f "$redis_conf" ]]; then
            warn "Redis config not found at $redis_conf - skipping"
            return 0
        fi

        # Set password
        if grep -q '^requirepass' "$redis_conf"; then
            sed -i "s|^requirepass.*|requirepass $SECRET_REDIS|" "$redis_conf"
        else
            echo "requirepass $SECRET_REDIS" >> "$redis_conf"
        fi

        # Enable AOF persistence
        if grep -q '^appendonly' "$redis_conf"; then
            sed -i 's|^appendonly.*|appendonly yes|' "$redis_conf"
        else
            echo 'appendonly yes' >> "$redis_conf"
        fi

        systemctl restart redis-server

        # Clear old data for fresh install
        sleep 1
        redis-cli -a "$SECRET_REDIS" FLUSHALL 2>/dev/null || true

        ok "Redis configured with password + AOF"
    }

    # ── Systemd Services ──────────────────────────────────────

    create_systemd_service() {
        step "Creating systemd services"

        # Create livos user if not exists
        if ! id -u livos &>/dev/null; then
            useradd --system --create-home --home-dir /home/livos --shell /bin/false livos
            ok "Created livos system user"
        fi

        # Ensure home dir exists (for npx cache used by MCP servers)
        mkdir -p /home/livos
        chown livos:livos /home/livos

        # Set ownership
        chown -R livos:livos "$LIVOS_DIR"
        chown -R livos:livos /opt/nexus

        # Create main service unit (runs as root for Docker/chown operations)
        cat > /etc/systemd/system/livos.service << 'UNIT'
[Unit]
Description=LivOS Server
Documentation=https://github.com/utopusc/livos
After=network-online.target redis.service docker.service
Wants=network-online.target
Requires=redis.service

[Service]
Type=simple
User=root
WorkingDirectory=/
ExecStart=/usr/bin/npx tsx /opt/livos/packages/livinityd/source/cli.ts --data-directory /opt/livos/data --port 8080
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/livos/.env

[Install]
WantedBy=multi-user.target
UNIT

        # Create liv-core service (Nexus AI daemon)
        # Runs as root so MCP child processes (Playwright, npx, etc.) have full system access
        cat > /etc/systemd/system/liv-core.service << 'UNIT'
[Unit]
Description=Liv AI Core
After=network-online.target redis.service livos.service
Wants=network-online.target
Requires=redis.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/nexus
ExecStart=/usr/bin/node packages/core/dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=DAEMON_INTERVAL_MS=30000
EnvironmentFile=/opt/livos/.env

[Install]
WantedBy=multi-user.target
UNIT

        # Create liv-memory service (Node.js)
        cat > /etc/systemd/system/liv-memory.service << 'UNIT'
[Unit]
Description=Liv Memory Service
After=network-online.target redis.service
Wants=network-online.target
Requires=redis.service

[Service]
Type=simple
User=livos
Group=livos
WorkingDirectory=/opt/nexus/packages/memory
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=MEMORY_PORT=3300
EnvironmentFile=/opt/livos/.env

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/livos/data /opt/livos/logs /opt/nexus /home/livos

[Install]
WantedBy=multi-user.target
UNIT

        # Create liv-worker service
        cat > /etc/systemd/system/liv-worker.service << 'UNIT'
[Unit]
Description=Liv Worker
After=network-online.target redis.service liv-core.service
Wants=network-online.target
Requires=redis.service

[Service]
Type=simple
User=livos
Group=livos
WorkingDirectory=/opt/nexus
ExecStart=/usr/bin/node packages/worker/dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/livos/.env

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/livos/data /opt/livos/logs /opt/nexus /home/livos

[Install]
WantedBy=multi-user.target
UNIT

        # Reload and enable services
        systemctl daemon-reload
        systemctl enable livos.service liv-core.service liv-memory.service liv-worker.service

        ok "Systemd services created and enabled"
    }

    start_services() {
        step "Starting services"

        systemctl start liv-memory.service
        systemctl start livos.service
        systemctl start liv-core.service
        systemctl start liv-worker.service

        # Check if services started
        sleep 2
        if systemctl is-active --quiet livos.service; then
            ok "LivOS service running"
        else
            warn "LivOS service may not have started correctly - check: journalctl -u livos.service"
        fi

        ok "All services started"
    }

    # ── Firewall Configuration ────────────────────────────────

    configure_firewall() {
        step "Configuring firewall"

        # ── UFW rules ──
        if ! command -v ufw &>/dev/null; then
            apt-get install -y -qq ufw
        fi

        ufw default deny incoming 2>/dev/null || true
        ufw allow 22/tcp   2>/dev/null || true   # SSH
        ufw allow 80/tcp   2>/dev/null || true   # HTTP (Caddy)
        ufw allow 443/tcp  2>/dev/null || true   # HTTPS (Caddy)
        ufw allow 8080/tcp 2>/dev/null || true   # LivOS UI direct access
        ufw --force enable 2>/dev/null || true
        ufw reload 2>/dev/null || true
        ok "UFW: SSH(22) + HTTP(80) + HTTPS(443) + LivOS(8080) allowed"

        # ── Docker DOCKER-USER chain (defense-in-depth) ──
        # Docker publishes ports by inserting DNAT rules that bypass UFW.
        # The DOCKER-USER chain is the official hook for user-defined rules.
        mkdir -p /etc/livos

        cat > /etc/livos/docker-firewall.sh << 'FWSCRIPT'
#!/bin/bash
# LivOS Docker firewall — block external access to Docker-published ports
# Docker's DOCKER-USER chain is evaluated before container routing rules.

iptables -F DOCKER-USER 2>/dev/null || true
iptables -A DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A DOCKER-USER -s 127.0.0.0/8 -j RETURN            # localhost (Caddy)
iptables -A DOCKER-USER -s 172.16.0.0/12 -j RETURN           # Docker networks
iptables -A DOCKER-USER -i docker0 -j RETURN                  # Docker bridge
iptables -A DOCKER-USER -j DROP                                # Block external
FWSCRIPT
        chmod +x /etc/livos/docker-firewall.sh

        # Systemd service for persistence across reboots
        cat > /etc/systemd/system/livos-docker-firewall.service << 'FWSVC'
[Unit]
Description=LivOS Docker firewall rules (DOCKER-USER chain)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/etc/livos/docker-firewall.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
FWSVC

        systemctl daemon-reload
        systemctl enable livos-docker-firewall.service 2>/dev/null || true

        # Apply rules now if Docker is running
        if systemctl is-active --quiet docker; then
            /etc/livos/docker-firewall.sh
            ok "Docker DOCKER-USER chain: external access blocked"
        else
            info "Docker not running yet — firewall rules will apply on next boot"
        fi
    }

    # ── Final Banner ──────────────────────────────────────────

    show_banner() {
        local server_ip
        server_ip=$(hostname -I | awk '{print $1}')

        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}  LivOS installed successfully!${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo -e "  Web UI:      ${CYAN}http://${server_ip}:8080${NC}"
        if [[ "${CONFIG_DOMAIN:-localhost}" != "localhost" ]]; then
            local protocol="http"
            [[ "${CONFIG_USE_HTTPS:-false}" == "true" ]] && protocol="https"
            echo -e "  Domain:      ${CYAN}${protocol}://${CONFIG_DOMAIN}${NC}"
        fi
        echo ""
        echo -e "  ${YELLOW}Service Management:${NC}"
        echo -e "    systemctl status livos        - check status"
        echo -e "    systemctl restart livos       - restart"
        echo -e "    journalctl -u livos -f        - view logs"
        echo ""
        if [[ -z "${CONFIG_GEMINI_KEY:-}" ]]; then
            echo -e "  ${YELLOW}Next step:${NC} Open Settings > AI Configuration"
            echo -e "  and add your Gemini API key."
            echo ""
        fi
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    }

    # ══════════════════════════════════════════════════════════
    # MAIN EXECUTION FLOW
    # ══════════════════════════════════════════════════════════

    # === Pre-flight ===
    step "Pre-flight checks"
    check_root
    detect_os
    detect_arch
    detect_tty
    check_whiptail
    ok "Pre-flight passed"

    # === Dependencies ===
    step "Installing system dependencies"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq

    install_build_tools
    install_yq
    install_nodejs
    install_pnpm
    install_pm2
    install_redis
    install_docker
    setup_docker_images
    install_python
    install_fail2ban
    ok "All system dependencies ready"

    # === Configuration ===
    run_configuration_wizard
    generate_secrets

    # === Repository ===
    setup_repository

    # === Environment ===
    write_env_file

    # === Redis ===
    configure_redis

    # === Build ===
    build_project

    # === Symlink .env for Liv ===
    local liv_dir="$LIVOS_DIR/packages/liv"
    if [[ -d "$liv_dir" ]] && [[ ! -L "$liv_dir/.env" ]]; then
        ln -sf ../../.env "$liv_dir/.env"
        ok "Liv .env symlinked"
    fi

    # === Services ===
    create_systemd_service
    start_services

    # === Firewall ===
    configure_firewall

    # === SSH Hardening ===
    harden_ssh

    # === Done ===
    show_banner
}

# ── Cleanup on error (outside main for trap access) ───────────
cleanup_on_error() {
    local line_no="${1:-unknown}"
    echo -e "\n\033[0;31m[ERROR]\033[0m Installation failed at line $line_no"
    echo "Partial installation may exist. Check /opt/livos for cleanup."
    # Don't auto-remove - user may want to inspect
}

# Execute main - prevents partial script execution from curl | bash
main "$@"
