# CLI Installer Patterns for Self-Hosted Software

## Research Summary

This document outlines best practices and patterns for implementing a single-command installer (`curl -fsSL https://get.livos.io | bash`) for LivOS, based on analysis of Docker, Homebrew, NVM, Rustup, Coolify, and other popular self-hosted software installers.

---

## 1. How Popular Projects Implement curl|bash Installers

### Docker (`get.docker.com`)

**Key Features:**
- Multi-layered OS detection using `/etc/os-release`
- Handles forked distributions (e.g., Linux Mint -> Ubuntu)
- Version-aware package selection
- GPG key verification for repositories
- Dry-run capability (`--dry-run`)
- 20-second warning if Docker already exists

```bash
# OS Detection Pattern
get_distribution() {
    lsb_dist=""
    if [ -r /etc/os-release ]; then
        lsb_dist="$(. /etc/os-release && echo "$ID")"
    fi
    echo "$lsb_dist"
}

# Privilege Escalation
sh_c='sh -c'
if [ "$user" != 'root' ]; then
    if command_exists sudo; then
        sh_c='sudo -E sh -c'
    elif command_exists su; then
        sh_c='su -c'
    fi
fi
```

**Source:** [Docker Install Script](https://get.docker.com/) | [GitHub](https://github.com/docker/docker-install)

---

### Homebrew

**Key Features:**
- Interactive confirmation before execution
- Non-interactive mode via `NONINTERACTIVE=1` or `CI` environment variable
- Refuses to run as root (security)
- Retry mechanism with exponential backoff
- Detailed abort messages with exact failed command

```bash
# Non-interactive Mode Detection
if [[ -z "${NONINTERACTIVE-}" ]]; then
    if [[ -n "${CI-}" ]]; then
        warn 'Running in non-interactive mode because `$CI` is set.'
    fi
fi

# User Confirmation
wait_for_user() {
    echo "Press RETURN/ENTER to continue..."
    getc c
}

# Retry with Backoff
retry() {
    local tries="$1" pause=2
    shift
    if ! "$@"; then
        while [[ $((--n)) -gt 0 ]]; do
            ((pause *= 2))
            if "$@"; then return; fi
        done
        abort "Failed ${tries} times doing: $(shell_join "$@")"
    fi
}
```

**Source:** [Homebrew Install Script](https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)

---

### NVM (Node Version Manager)

**Key Features:**
- Shell profile detection and auto-update
- Multiple installation methods (git clone vs. script download)
- Duplicate entry prevention in profile files
- Clean exit codes for different failure types

```bash
# Shell Profile Detection
if [ "${SHELL#*bash}" != "$SHELL" ]; then
    if [ -f "$HOME/.bashrc" ]; then
        DETECTED_PROFILE="$HOME/.bashrc"
    fi
elif [ "${SHELL#*zsh}" != "$SHELL" ]; then
    if [ -f "$HOME/.zshrc" ]; then
        DETECTED_PROFILE="$HOME/.zshrc"
    fi
fi

# Prevent Duplicate Entries
if ! command grep -qc '/nvm.sh' "$NVM_PROFILE"; then
    # Append NVM initialization
fi

# Exit Codes
# 1 = General installation failure
# 2 = Repository/checkout operations
# 3 = Permission/file operation errors
```

**Source:** [NVM GitHub](https://github.com/nvm-sh/nvm)

---

### Rustup

**Key Features:**
- Platform/architecture detection with normalization
- Dual downloader support (curl with wget fallback)
- TLS enforcement with strong cipher suites
- Function wrapping for atomic execution

```bash
# Platform Detection
_ostype="$(uname -s)"
_cputype="$(uname -m)"

# Rosetta Detection on macOS
if [ "$_ostype" = "Darwin" ] && [ "$_cputype" = "x86_64" ]; then
    if sysctl hw.optional.arm64 2>/dev/null | grep -q ': 1'; then
        _cputype="aarch64"
    fi
fi

# TLS Enforcement
curl --proto '=https' --tlsv1.2 --ciphers "$_ciphersuites" \
     --silent --show-error --fail --location "$1" --output "$2"

# Helper Functions
ensure() {
    if ! "$@"; then
        err "command failed: $*"
        exit 1
    fi
}

need_cmd() {
    if ! command -v "$1" > /dev/null 2>&1; then
        err "need '$1' (command not found)"
        exit 1
    fi
}
```

**Source:** [Rustup Install Script](https://github.com/rust-lang/rustup/blob/main/rustup-init.sh)

---

### Coolify

**Key Features:**
- Comprehensive dependency checking
- Docker installation with fallback methods
- Cryptographic secret generation
- SSH key generation for container-host communication
- Environment variable management with existing value preservation

```bash
# Package Validation
all_packages_installed() {
    for pkg in curl wget git jq openssl; do
        if ! command -v "$pkg" >/dev/null 2>&1; then
            return 1
        fi
    done
    return 0
}

# Docker Installation with Fallback
install_docker() {
    curl -s https://releases.rancher.com/install-docker/${DOCKER_VERSION}.sh | sh 2>&1 || true
    if ! [ -x "$(command -v docker)" ]; then
        curl -s https://get.docker.com | sh -s -- --version ${DOCKER_VERSION} 2>&1
    fi
}

# Secret Generation
APP_KEY=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -hex 16)
```

**Source:** [Coolify Install Script](https://cdn.coollabs.io/coolify/install.sh)

---

## 2. Security Best Practices

### MUST-HAVE Security Measures

| Practice | Description | Implementation |
|----------|-------------|----------------|
| **HTTPS Only** | Always use TLS for downloads | `curl --proto '=https' --tlsv1.2` |
| **Function Wrapping** | Prevent partial script execution | Wrap entire script in `main()` function |
| **Checksum Verification** | Verify downloaded binaries | `sha256sum -c checksums.txt` |
| **GPG Signing** | Sign install scripts and releases | `gpg --verify install.sh.asc install.sh` |
| **Fail Fast** | Exit on first error | `set -euo pipefail` |
| **Root Check** | Verify/refuse root as appropriate | Check `$EUID` or `id -u` |
| **Backup Before Modify** | Backup config files before changes | `cp file file.backup.$(date +%s)` |

### Script Security Template

```bash
#!/bin/bash
set -euo pipefail

# Wrap everything in main() to prevent partial execution
main() {
    # Your installation logic here
    echo "Installation complete"
}

# Only execute main if script is complete
main "$@"
```

### Certificate and Key Best Practices

```bash
# Generate cryptographically secure secrets
generate_secret() {
    openssl rand -hex 32
}

# Generate base64-encoded key
generate_app_key() {
    openssl rand -base64 32
}

# Generate Ed25519 SSH key
generate_ssh_key() {
    ssh-keygen -t ed25519 -f "$KEY_PATH" -N "" -C "livos@$(hostname)"
}
```

### References
- [Sysdig: Friends Don't Let Friends Curl|Bash](https://www.sysdig.com/blog/friends-dont-let-friends-curl-bash)
- [Sandstorm: Is curl|bash Insecure?](https://sandstorm.io/news/2015-09-24-is-curl-bash-insecure-pgp-verified-install)
- [DEV: Trustworthy curl pipe bash workflow](https://dev.to/operous/how-to-build-a-trustworthy-curl-pipe-bash-workflow-4bb)

---

## 3. Installer Feature Implementation

### 3.1 Dependency Checking

```bash
# Check for required commands
check_dependencies() {
    local missing=()

    for cmd in curl git docker node npm; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "Missing dependencies: ${missing[*]}"
        return 1
    fi
    return 0
}

# Check version requirements
check_node_version() {
    local required="18.0.0"
    local current
    current=$(node -v | sed 's/^v//')

    if ! version_gte "$current" "$required"; then
        echo "Node.js $required or higher required (found $current)"
        return 1
    fi
}

# Version comparison helper
version_gte() {
    printf '%s\n%s' "$2" "$1" | sort -V -C
}
```

### 3.2 OS Detection

```bash
detect_os() {
    OS=""
    OS_ID=""
    OS_VERSION=""

    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS_ID="$ID"
        OS_VERSION="${VERSION_ID:-}"

        # Normalize derivative distros
        case "$OS_ID" in
            linuxmint|neon|pop|elementary)
                OS_ID="ubuntu"
                ;;
            manjaro|endeavouros|cachyos)
                OS_ID="arch"
                ;;
        esac
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS_ID="macos"
        OS_VERSION=$(sw_vers -productVersion)
    fi

    OS="$OS_ID"
}

# Architecture detection
detect_arch() {
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        armv7l)
            ARCH="armv7"
            ;;
        *)
            echo "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
}

# Check if running in container
detect_container() {
    if [[ -f /.dockerenv ]] || grep -q docker /proc/1/cgroup 2>/dev/null; then
        RUNNING_IN_CONTAINER=true
    else
        RUNNING_IN_CONTAINER=false
    fi
}
```

### 3.3 Configuration Wizard

**Option A: Simple Read-based Prompts**
```bash
# Interactive configuration
configure_livos() {
    echo "=== LivOS Configuration ==="

    # Domain
    read -rp "Enter your domain (e.g., my.livos.io): " LIVOS_DOMAIN
    LIVOS_DOMAIN="${LIVOS_DOMAIN:-localhost}"

    # Port
    read -rp "Enter HTTP port [80]: " LIVOS_PORT
    LIVOS_PORT="${LIVOS_PORT:-80}"

    # Admin email
    read -rp "Enter admin email: " ADMIN_EMAIL

    # Generate secrets
    echo "Generating security keys..."
    APP_KEY=$(openssl rand -base64 32)
    DB_PASSWORD=$(openssl rand -hex 16)
}
```

**Option B: Whiptail/Dialog TUI**
```bash
# Check for whiptail/dialog
get_dialog_tool() {
    if command -v whiptail &>/dev/null; then
        echo "whiptail"
    elif command -v dialog &>/dev/null; then
        echo "dialog"
    else
        echo ""
    fi
}

# Whiptail-based configuration
configure_with_whiptail() {
    local DIALOG
    DIALOG=$(get_dialog_tool)

    if [[ -z "$DIALOG" ]]; then
        # Fall back to simple prompts
        configure_livos
        return
    fi

    # Domain input
    LIVOS_DOMAIN=$($DIALOG --inputbox "Enter your domain:" 8 60 "my.livos.io" 3>&1 1>&2 2>&3)

    # Port selection
    LIVOS_PORT=$($DIALOG --menu "Select HTTP port:" 12 40 3 \
        "80" "Standard HTTP" \
        "8080" "Alternative" \
        "custom" "Enter custom port" \
        3>&1 1>&2 2>&3)

    # Feature selection
    FEATURES=$($DIALOG --checklist "Select features to install:" 15 60 5 \
        "docker" "Docker Engine" ON \
        "caddy" "Caddy Reverse Proxy" ON \
        "backups" "Automatic Backups" OFF \
        3>&1 1>&2 2>&3)
}
```

**Option C: Environment Variables for Non-Interactive**
```bash
# Support both interactive and non-interactive modes
configure() {
    if [[ -n "${LIVOS_NONINTERACTIVE:-}" ]] || [[ -n "${CI:-}" ]]; then
        # Use environment variables or defaults
        LIVOS_DOMAIN="${LIVOS_DOMAIN:-localhost}"
        LIVOS_PORT="${LIVOS_PORT:-80}"
        ADMIN_EMAIL="${ADMIN_EMAIL:-admin@localhost}"
    else
        configure_with_whiptail
    fi
}
```

### 3.4 Service Setup

**systemd Service (Recommended)**
```bash
setup_systemd_service() {
    cat > /etc/systemd/system/livos.service << 'EOF'
[Unit]
Description=LivOS Server
Documentation=https://livos.io/docs
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=livos
Group=livos
WorkingDirectory=/opt/livos
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/livos/server/index.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=livos

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/livos/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable livos
    systemctl start livos
}
```

**PM2 Alternative (for Node.js-centric deployments)**
```bash
setup_pm2_service() {
    # Install PM2 globally
    npm install -g pm2

    # Create ecosystem file
    cat > /opt/livos/ecosystem.config.js << 'EOF'
module.exports = {
    apps: [{
        name: 'livos',
        script: './server/index.js',
        cwd: '/opt/livos',
        instances: 'max',
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'production'
        },
        max_memory_restart: '1G',
        error_file: '/var/log/livos/error.log',
        out_file: '/var/log/livos/out.log'
    }]
};
EOF

    # Start and save
    pm2 start /opt/livos/ecosystem.config.js
    pm2 save

    # Generate startup script (uses systemd under the hood)
    pm2 startup systemd -u livos --hp /home/livos
}
```

**Recommendation:** Use systemd directly for single-process applications. It provides:
- Native integration with the OS
- Zero additional dependencies
- Better logging via journalctl
- Built-in security hardening options

### 3.5 Updates and Migrations

```bash
# Version management
CURRENT_VERSION=""
LATEST_VERSION=""

get_current_version() {
    if [[ -f /opt/livos/VERSION ]]; then
        CURRENT_VERSION=$(cat /opt/livos/VERSION)
    else
        CURRENT_VERSION="0.0.0"
    fi
}

get_latest_version() {
    LATEST_VERSION=$(curl -fsSL https://api.livos.io/version)
}

# Update mechanism
update_livos() {
    get_current_version
    get_latest_version

    if [[ "$CURRENT_VERSION" == "$LATEST_VERSION" ]]; then
        echo "Already at latest version ($CURRENT_VERSION)"
        return 0
    fi

    echo "Updating from $CURRENT_VERSION to $LATEST_VERSION"

    # Backup current installation
    backup_installation

    # Download new version
    download_release "$LATEST_VERSION"

    # Run migrations if needed
    run_migrations "$CURRENT_VERSION" "$LATEST_VERSION"

    # Restart service
    systemctl restart livos

    echo "Update complete!"
}

# Migration runner
run_migrations() {
    local from_version="$1"
    local to_version="$2"

    # Find and run migration scripts in order
    for migration in /opt/livos/migrations/*.sh; do
        local migration_version
        migration_version=$(basename "$migration" .sh)

        if version_gte "$migration_version" "$from_version" && \
           version_gte "$to_version" "$migration_version"; then
            echo "Running migration: $migration_version"
            bash "$migration"
        fi
    done
}

# Backup before update
backup_installation() {
    local backup_dir="/opt/livos-backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    # Backup data (not node_modules)
    cp -r /opt/livos/data "$backup_dir/"
    cp /opt/livos/.env "$backup_dir/"
    cp /opt/livos/VERSION "$backup_dir/"

    echo "Backup saved to $backup_dir"
}
```

---

## 4. Anti-Patterns to Avoid

### Critical Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| **No function wrapping** | Partial downloads execute incomplete code | Wrap script in `main()` called at end |
| **Using `-k` with curl** | Disables TLS verification, enables MITM | Never use `-k`/`--insecure` |
| **HTTP instead of HTTPS** | No encryption, vulnerable to tampering | Always use HTTPS |
| **Running as root when unnecessary** | Security risk | Drop privileges after setup |
| **Hardcoded secrets** | Credentials in public scripts | Generate secrets at install time |
| **No error handling** | Silent failures | Use `set -euo pipefail` |
| **Assuming distribution** | Breaks on variants | Use `/etc/os-release` detection |
| **Not checking exit codes** | Proceeding after failures | Check `$?` or use `set -e` |
| **Modifying PATH unsafely** | Breaking user environment | Only append, never replace |
| **No dry-run option** | Can't preview changes | Implement `--dry-run` flag |

### Bad Examples to Avoid

```bash
# BAD: No TLS verification
curl -k https://example.com/install.sh | bash

# BAD: No error handling
cd /nonexistent
rm -rf *  # This runs in current directory!

# BAD: Assuming sudo exists
sudo apt-get install package  # Fails if sudo not installed

# BAD: Hardcoded credentials
DB_PASSWORD="supersecret123"

# BAD: No function wrapping (partial download risk)
apt-get update
apt-get install -y docker
# If download stops here, partial execution occurs
```

### Good Examples

```bash
# GOOD: Proper TLS and error handling
set -euo pipefail

main() {
    check_root
    detect_os
    install_dependencies
    configure
    setup_service
    echo "Installation complete!"
}

# Only run if script fully downloaded
main "$@"
```

---

## 5. Example LivOS Installer Structure

```bash
#!/bin/bash
#
# LivOS Installer
# Usage: curl -fsSL https://get.livos.io | bash
#
# Environment variables for non-interactive mode:
#   LIVOS_DOMAIN     - Domain name (default: localhost)
#   LIVOS_PORT       - HTTP port (default: 80)
#   LIVOS_ADMIN_EMAIL - Admin email
#   LIVOS_NONINTERACTIVE - Skip prompts if set
#

set -euo pipefail

# ============================================================================
# CONSTANTS
# ============================================================================
LIVOS_VERSION="1.0.0"
LIVOS_REPO="https://github.com/livinity/livos"
LIVOS_INSTALL_DIR="/opt/livos"
LIVOS_DATA_DIR="/opt/livos/data"
LIVOS_USER="livos"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

abort() {
    log_error "$*"
    exit 1
}

command_exists() {
    command -v "$1" &>/dev/null
}

version_gte() {
    printf '%s\n%s' "$2" "$1" | sort -V -C
}

# ============================================================================
# SYSTEM DETECTION
# ============================================================================
detect_os() {
    OS_ID=""
    OS_VERSION=""

    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS_ID="$ID"
        OS_VERSION="${VERSION_ID:-}"

        # Normalize derivatives
        case "$OS_ID" in
            linuxmint|pop|elementary|neon|zorin)
                OS_ID="ubuntu"
                ;;
            manjaro|endeavouros|garuda)
                OS_ID="arch"
                ;;
        esac
    else
        abort "Cannot detect OS. /etc/os-release not found."
    fi

    log_info "Detected OS: $OS_ID $OS_VERSION"
}

detect_arch() {
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64|amd64) ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        armv7l) ARCH="armv7" ;;
        *) abort "Unsupported architecture: $ARCH" ;;
    esac
    log_info "Detected architecture: $ARCH"
}

# ============================================================================
# DEPENDENCY MANAGEMENT
# ============================================================================
check_dependencies() {
    local missing=()

    log_info "Checking dependencies..."

    for cmd in curl git; do
        if ! command_exists "$cmd"; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_warn "Missing dependencies: ${missing[*]}"
        install_dependencies "${missing[@]}"
    fi
}

install_dependencies() {
    log_info "Installing dependencies..."

    case "$OS_ID" in
        ubuntu|debian)
            apt-get update -qq
            apt-get install -y -qq "$@"
            ;;
        centos|rhel|fedora)
            dnf install -y "$@"
            ;;
        arch)
            pacman -Sy --noconfirm "$@"
            ;;
        *)
            abort "Unsupported OS for automatic dependency installation: $OS_ID"
            ;;
    esac
}

check_docker() {
    if ! command_exists docker; then
        log_info "Docker not found. Installing..."
        install_docker
    fi

    # Verify Docker is running
    if ! docker info &>/dev/null; then
        abort "Docker is not running. Please start Docker and try again."
    fi

    log_success "Docker is ready"
}

install_docker() {
    log_info "Installing Docker..."

    # Try official convenience script
    curl -fsSL https://get.docker.com | sh

    # Add current user to docker group
    if [[ -n "${SUDO_USER:-}" ]]; then
        usermod -aG docker "$SUDO_USER"
    fi

    # Start and enable Docker
    systemctl enable docker
    systemctl start docker
}

check_node() {
    local required_version="18.0.0"

    if ! command_exists node; then
        log_info "Node.js not found. Installing..."
        install_node
    fi

    local current_version
    current_version=$(node -v | sed 's/^v//')

    if ! version_gte "$current_version" "$required_version"; then
        abort "Node.js $required_version or higher required (found $current_version)"
    fi

    log_success "Node.js $current_version is ready"
}

install_node() {
    # Use NodeSource for Node.js 20.x LTS
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
}

# ============================================================================
# CONFIGURATION
# ============================================================================
configure() {
    log_info "Configuring LivOS..."

    if [[ -n "${LIVOS_NONINTERACTIVE:-}" ]] || [[ -n "${CI:-}" ]]; then
        configure_noninteractive
    else
        configure_interactive
    fi

    # Generate secrets
    generate_secrets
}

configure_noninteractive() {
    LIVOS_DOMAIN="${LIVOS_DOMAIN:-localhost}"
    LIVOS_PORT="${LIVOS_PORT:-80}"
    LIVOS_ADMIN_EMAIL="${LIVOS_ADMIN_EMAIL:-admin@localhost}"
}

configure_interactive() {
    echo ""
    echo "=== LivOS Configuration ==="
    echo ""

    # Domain
    read -rp "Enter your domain [localhost]: " LIVOS_DOMAIN
    LIVOS_DOMAIN="${LIVOS_DOMAIN:-localhost}"

    # Port
    read -rp "Enter HTTP port [80]: " LIVOS_PORT
    LIVOS_PORT="${LIVOS_PORT:-80}"

    # Admin email
    read -rp "Enter admin email: " LIVOS_ADMIN_EMAIL
    LIVOS_ADMIN_EMAIL="${LIVOS_ADMIN_EMAIL:-admin@localhost}"

    echo ""
}

generate_secrets() {
    log_info "Generating security keys..."

    LIVOS_APP_KEY=$(openssl rand -base64 32)
    LIVOS_DB_PASSWORD=$(openssl rand -hex 16)
    LIVOS_JWT_SECRET=$(openssl rand -hex 32)
}

# ============================================================================
# INSTALLATION
# ============================================================================
create_user() {
    if ! id "$LIVOS_USER" &>/dev/null; then
        log_info "Creating livos user..."
        useradd --system --home-dir "$LIVOS_INSTALL_DIR" --shell /bin/bash "$LIVOS_USER"
    fi
}

create_directories() {
    log_info "Creating directories..."

    mkdir -p "$LIVOS_INSTALL_DIR"
    mkdir -p "$LIVOS_DATA_DIR"
    mkdir -p /var/log/livos

    chown -R "$LIVOS_USER:$LIVOS_USER" "$LIVOS_INSTALL_DIR"
    chown -R "$LIVOS_USER:$LIVOS_USER" /var/log/livos
}

download_release() {
    log_info "Downloading LivOS $LIVOS_VERSION..."

    local download_url="$LIVOS_REPO/releases/download/v$LIVOS_VERSION/livos-$LIVOS_VERSION.tar.gz"

    curl -fsSL "$download_url" -o /tmp/livos.tar.gz
    tar -xzf /tmp/livos.tar.gz -C "$LIVOS_INSTALL_DIR"
    rm /tmp/livos.tar.gz

    # Save version
    echo "$LIVOS_VERSION" > "$LIVOS_INSTALL_DIR/VERSION"
}

write_env_file() {
    log_info "Writing configuration..."

    cat > "$LIVOS_INSTALL_DIR/.env" << EOF
# LivOS Configuration
# Generated on $(date)

NODE_ENV=production
LIVOS_DOMAIN=$LIVOS_DOMAIN
LIVOS_PORT=$LIVOS_PORT
LIVOS_ADMIN_EMAIL=$LIVOS_ADMIN_EMAIL

# Security (auto-generated)
APP_KEY=$LIVOS_APP_KEY
JWT_SECRET=$LIVOS_JWT_SECRET

# Database
DB_TYPE=sqlite
DB_PATH=$LIVOS_DATA_DIR/livos.db

# Or use PostgreSQL:
# DB_TYPE=postgres
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=livos
# DB_USER=livos
# DB_PASSWORD=$LIVOS_DB_PASSWORD
EOF

    chmod 600 "$LIVOS_INSTALL_DIR/.env"
    chown "$LIVOS_USER:$LIVOS_USER" "$LIVOS_INSTALL_DIR/.env"
}

install_npm_dependencies() {
    log_info "Installing npm dependencies..."

    cd "$LIVOS_INSTALL_DIR"
    sudo -u "$LIVOS_USER" npm ci --production
}

# ============================================================================
# SERVICE SETUP
# ============================================================================
setup_systemd() {
    log_info "Setting up systemd service..."

    cat > /etc/systemd/system/livos.service << EOF
[Unit]
Description=LivOS Server
Documentation=https://livos.io/docs
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=$LIVOS_USER
Group=$LIVOS_USER
WorkingDirectory=$LIVOS_INSTALL_DIR
EnvironmentFile=$LIVOS_INSTALL_DIR/.env
ExecStart=/usr/bin/node $LIVOS_INSTALL_DIR/server/index.js
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=livos

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$LIVOS_DATA_DIR /var/log/livos
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable livos
    systemctl start livos

    log_success "LivOS service started"
}

# ============================================================================
# POST-INSTALL
# ============================================================================
verify_installation() {
    log_info "Verifying installation..."

    sleep 3

    if systemctl is-active --quiet livos; then
        log_success "LivOS is running!"
    else
        log_error "LivOS failed to start. Check logs with: journalctl -u livos -f"
        exit 1
    fi
}

print_success_message() {
    echo ""
    echo "============================================"
    echo -e "${GREEN}LivOS Installation Complete!${NC}"
    echo "============================================"
    echo ""
    echo "Access your LivOS instance at:"
    echo "  http://$LIVOS_DOMAIN:$LIVOS_PORT"
    echo ""
    echo "Useful commands:"
    echo "  systemctl status livos    - Check status"
    echo "  systemctl restart livos   - Restart service"
    echo "  journalctl -u livos -f    - View logs"
    echo ""
    echo "Configuration file: $LIVOS_INSTALL_DIR/.env"
    echo "Data directory: $LIVOS_DATA_DIR"
    echo ""
}

# ============================================================================
# MAIN
# ============================================================================
main() {
    echo ""
    echo "================================"
    echo "  LivOS Installer v$LIVOS_VERSION"
    echo "================================"
    echo ""

    # Require root
    if [[ $EUID -ne 0 ]]; then
        abort "This script must be run as root. Use: sudo bash install.sh"
    fi

    # Detect system
    detect_os
    detect_arch

    # Check and install dependencies
    check_dependencies
    check_docker
    check_node

    # Configure
    configure

    # Install
    create_user
    create_directories
    download_release
    write_env_file
    install_npm_dependencies

    # Setup service
    setup_systemd

    # Verify
    verify_installation
    print_success_message
}

# Execute main function only when script is complete
main "$@"
```

---

## 6. Recommended Installer Features for LivOS

### Minimum Viable Installer
- [ ] OS detection (Ubuntu, Debian primary)
- [ ] Dependency checking (Docker, Node.js)
- [ ] Configuration wizard (domain, email)
- [ ] Secret generation
- [ ] systemd service setup
- [ ] Basic error handling

### Enhanced Installer
- [ ] Architecture detection (amd64, arm64)
- [ ] Multiple OS support (Ubuntu, Debian, RHEL, Arch)
- [ ] Whiptail/Dialog TUI wizard
- [ ] Non-interactive mode for automation
- [ ] Dry-run mode
- [ ] Update/migration support
- [ ] Backup before update
- [ ] Rollback capability

### Production-Ready Installer
- [ ] GPG-signed scripts
- [ ] Checksum verification
- [ ] Health checks post-install
- [ ] SSL/TLS setup (Caddy/Let's Encrypt)
- [ ] Firewall configuration (ufw)
- [ ] Log rotation setup
- [ ] Uninstaller script
- [ ] Telemetry opt-in (anonymous usage)

---

## 7. References

### Official Install Scripts
- [Docker Install Script](https://get.docker.com/) - [GitHub](https://github.com/docker/docker-install)
- [Homebrew Install Script](https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)
- [NVM Install Script](https://github.com/nvm-sh/nvm)
- [Rustup Install Script](https://github.com/rust-lang/rustup/blob/main/rustup-init.sh)
- [Coolify Install Script](https://cdn.coollabs.io/coolify/install.sh)

### Security Resources
- [Sysdig: Friends Don't Let Friends Curl|Bash](https://www.sysdig.com/blog/friends-dont-let-friends-curl-bash)
- [DEV: Trustworthy curl pipe bash workflow](https://dev.to/operous/how-to-build-a-trustworthy-curl-pipe-bash-workflow-4bb)
- [Sandstorm: Is curl|bash Insecure?](https://sandstorm.io/news/2015-09-24-is-curl-bash-insecure-pgp-verified-install)
- [cURL Security Anti-Patterns](https://blog.pan-net.cloud/posts/curl-security-anti-patterns/)

### Interactive Dialog Tools
- [Red Hat: How to use whiptail](https://www.redhat.com/en/blog/use-whiptail)
- [Wikibooks: Bash Shell Scripting/Whiptail](https://en.wikibooks.org/wiki/Bash_Shell_Scripting/Whiptail)

### Service Management
- [PM2 Startup Script](https://pm2.keymetrics.io/docs/usage/startup/)
- [Running Node.js on Linux with systemd](https://www.cloudbees.com/blog/running-node-js-linux-systemd)
