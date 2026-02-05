# Phase 9: Installer - Research

**Researched:** 2026-02-05
**Domain:** Shell Script Installer Development & System Administration
**Confidence:** HIGH

## Summary

This phase creates a unified one-command installer script (`install.sh`) that transforms any Ubuntu/Debian server into a fully-functional LivOS deployment. The research examined patterns from major open source projects (Docker, NVM, Homebrew) and established best practices for shell script installers, interactive configuration wizards, systemd service management, and secure secret generation.

An existing `livos/setup.sh` script (313 lines) provides a solid foundation but needs enhancements for: interactive configuration wizard, improved error handling with cleanup, systemd service units (currently uses PM2 only), and better architecture detection. The existing script already implements many best practices including colored output, pre-flight checks, and credential generation.

The installer must support the prior decisions: LIVOS_ prefix for shared variables, NEXUS_ for Nexus-specific, single canonical .env.example in livos/ root, empty values for secrets, and documented generation commands. The installer should auto-generate secrets using `openssl rand -hex` and offer an interactive wizard for user configuration (domain, AI API keys, optional features).

**Primary recommendation:** Enhance the existing `livos/setup.sh` with: (1) function wrapping for partial download protection, (2) interactive whiptail wizard for configuration, (3) systemd service unit generation, (4) improved `set -euo pipefail` strict mode with ERR trap, and (5) comprehensive OS/architecture detection.

## Current State Analysis

### Existing Setup Scripts

| Script | Lines | Purpose | Quality |
|--------|-------|---------|---------|
| `livos/setup.sh` | 313 | Main LivOS installer | GOOD - needs enhancement |
| `nexus/deploy/setup-server4.sh` | 95 | Nexus server setup | BASIC - server-specific |
| `nexus/deploy/deploy.sh` | N/A | Deployment script | Exists |

### What setup.sh Already Does Well

1. **Pre-flight checks**: Root verification, OS detection (Ubuntu/Debian)
2. **Dependency installation**: Node.js 22, pnpm, PM2, Redis, Docker, Python
3. **Repository management**: Clone/pull with error handling
4. **Credential generation**: Uses `openssl rand -hex` for secrets
5. **Redis configuration**: Password setup, AOF persistence
6. **Colored output**: Consistent info/ok/warn/fail functions
7. **Banner**: Post-install instructions with server IP

### What Needs Enhancement

1. **Strict mode**: Uses `set -euo pipefail` but no ERR trap for cleanup
2. **Interactive wizard**: No user prompts for configuration (non-interactive)
3. **systemd services**: Uses PM2 startup only, no native systemd units
4. **Architecture detection**: Basic `uname -m` but no mapping to package architectures
5. **Partial download protection**: Script not wrapped in function
6. **OS version validation**: Warns but continues on non-Ubuntu/Debian

## Standard Stack

### Core (Shell Script)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Bash | 4.4+ | Shell interpreter | POSIX-compliant, available on all Linux |
| whiptail | (system) | Interactive TUI dialogs | Pre-installed on Debian/Ubuntu, ncurses-based |
| openssl | (system) | Cryptographic secret generation | Standard, CSPRNG-backed |
| systemctl | (system) | Service management | systemd is universal on modern Linux |
| uname | (system) | OS/architecture detection | Standard Unix utility |

### System Dependencies to Install

| Package | Version | Purpose | Installation |
|---------|---------|---------|--------------|
| Node.js | 22.x LTS | JavaScript runtime | NodeSource repository |
| Docker | 24+ | Container runtime | Docker's official repository |
| Redis | 7.x | Caching/pub-sub | System package manager |
| pnpm | Latest | Package manager | npm install -g |
| PM2 | Latest | Process manager | npm install -g |

### No External Libraries Needed

Shell scripts should use system utilities only. No npm packages or external scripts in the installer itself.

## Architecture Patterns

### Pattern 1: Function-Wrapped Main Script

**What:** Wrap entire script in a main function to prevent partial execution
**When to use:** Any `curl | bash` installer
**Why:** Connection interruption during download could execute partial script

```bash
#!/usr/bin/env bash
# Source: Docker install script pattern

main() {
    set -euo pipefail

    # All installation logic here

    echo "Installation complete!"
}

# Execute main function - prevents partial script execution
main "$@"
```

### Pattern 2: ERR Trap with Cleanup

**What:** Trap errors and perform cleanup before exit
**When to use:** Always in production installer scripts

```bash
#!/usr/bin/env bash
# Source: Bash strict mode best practices

set -euo pipefail

cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        echo -e "\n${RED}[ERROR]${NC} Installation failed on line $1"
        echo "Cleaning up partial installation..."
        # Cleanup commands here
    fi
    exit $exit_code
}

trap 'cleanup $LINENO' ERR EXIT
```

### Pattern 3: OS and Architecture Detection

**What:** Detect OS distribution and CPU architecture reliably
**When to use:** Cross-platform installer scripts

```bash
#!/usr/bin/env bash
# Source: Docker and NVM install scripts

detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS_ID="$ID"
        OS_VERSION_ID="$VERSION_ID"
        OS_CODENAME="${VERSION_CODENAME:-}"
    else
        fail "Cannot detect OS - /etc/os-release not found"
    fi
}

detect_arch() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64)  ARCH="amd64" ;;
        aarch64) ARCH="arm64" ;;
        armv7l)  ARCH="armhf" ;;
        *)       fail "Unsupported architecture: $arch" ;;
    esac
}
```

### Pattern 4: Whiptail Interactive Wizard

**What:** TUI dialog boxes for user configuration
**When to use:** When user input is needed during installation

```bash
#!/usr/bin/env bash
# Source: Whiptail documentation

# Check if running interactively
if [[ -t 0 ]]; then
    HAS_TTY=true
else
    HAS_TTY=false
fi

wizard_input() {
    local title="$1"
    local prompt="$2"
    local default="$3"

    if $HAS_TTY && command -v whiptail &>/dev/null; then
        whiptail --title "$title" --inputbox "$prompt" 10 60 "$default" 3>&1 1>&2 2>&3
    else
        read -p "$prompt [$default]: " value
        echo "${value:-$default}"
    fi
}

wizard_yesno() {
    local title="$1"
    local prompt="$2"

    if $HAS_TTY && command -v whiptail &>/dev/null; then
        whiptail --title "$title" --yesno "$prompt" 10 60
        return $?
    else
        read -p "$prompt [y/N]: " answer
        [[ "$answer" =~ ^[Yy] ]]
    fi
}

wizard_password() {
    local title="$1"
    local prompt="$2"

    if $HAS_TTY && command -v whiptail &>/dev/null; then
        whiptail --title "$title" --passwordbox "$prompt" 10 60 3>&1 1>&2 2>&3
    else
        read -sp "$prompt: " value
        echo "$value"
    fi
}
```

### Pattern 5: Systemd Service Unit Generation

**What:** Create systemd service files for persistent services
**When to use:** Production deployments requiring system-level service management

```bash
#!/usr/bin/env bash
# Source: systemd documentation and best practices

create_systemd_service() {
    cat > /etc/systemd/system/livos.service << 'EOF'
[Unit]
Description=LivOS Server
Documentation=https://livinity.io
After=network-online.target redis.service
Wants=network-online.target
Requires=redis.service

[Service]
Type=simple
User=livos
Group=livos
WorkingDirectory=/opt/livos
ExecStart=/usr/bin/node /opt/livos/packages/livinityd/dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/livos/.env

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/livos/data /opt/livos/logs

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable livos.service
}
```

### Pattern 6: Idempotent Installation

**What:** Script can run multiple times without breaking
**When to use:** All installer scripts

```bash
#!/usr/bin/env bash
# Source: Best practices for idempotent scripts

install_if_missing() {
    local cmd="$1"
    local install_fn="$2"

    if command -v "$cmd" &>/dev/null; then
        ok "$cmd already installed"
        return 0
    fi

    info "Installing $cmd..."
    $install_fn
    ok "$cmd installed"
}

# Usage
install_if_missing docker install_docker
install_if_missing node install_nodejs
```

### Recommended Script Structure

```
install.sh
├── Header (shebang, description)
├── Constants (colors, paths, URLs)
├── Helper functions (info, ok, warn, fail)
├── Detection functions (detect_os, detect_arch)
├── Installation functions (install_docker, install_node, etc.)
├── Configuration functions (generate_secrets, create_env)
├── Service functions (create_systemd_service, enable_services)
├── Wizard functions (wizard_input, wizard_yesno)
├── Cleanup function (trap handler)
├── Main function (orchestrates all steps)
└── Entry point (main "$@")
```

### Anti-Patterns to Avoid

- **Unquoted variables:** Always use `"$var"` to prevent word splitting
- **Missing strict mode:** Always use `set -euo pipefail`
- **No cleanup on failure:** Always trap ERR and clean up partial installations
- **Hardcoded paths:** Use variables for all paths
- **Interactive prompts in non-TTY:** Check for TTY before using whiptail
- **Root without sudo:** Check for root explicitly, offer sudo fallback

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret generation | Custom random/date | `openssl rand -hex 32` | CSPRNG, cryptographically secure |
| OS detection | Manual string parsing | `/etc/os-release` sourcing | Standardized format |
| Interactive prompts | Raw read commands | `whiptail` | Better UX, validation, consistent look |
| Service management | Custom daemon scripts | `systemd` | System-standard, auto-restart, journald |
| Node.js install | Manual compile | NodeSource repository | Maintained, versioned, secure |
| Docker install | Manual package | `get.docker.com` script | Official, handles all edge cases |

**Key insight:** Shell installers should orchestrate existing tools, not reinvent them. Every wheel you reinvent is a bug waiting to happen.

## Common Pitfalls

### Pitfall 1: Partial Download Execution

**What goes wrong:** `curl | bash` fails mid-download, partial script executes
**Why it happens:** Network interruption, server error
**How to avoid:** Wrap entire script in a function, execute at end
**Warning signs:** Random failures, missing variables, syntax errors

### Pitfall 2: Unquoted Variables with Spaces

**What goes wrong:** `cd $DIR` fails when DIR="/opt/my app"
**Why it happens:** Word splitting on spaces
**How to avoid:** Always quote: `cd "$DIR"`
**Warning signs:** "No such file or directory" errors

### Pitfall 3: Silent Failures in Pipelines

**What goes wrong:** `command | grep pattern` fails but script continues
**Why it happens:** Only last command's exit code checked
**How to avoid:** `set -o pipefail`
**Warning signs:** Missing data, incorrect state

### Pitfall 4: Interactive Commands in Non-TTY

**What goes wrong:** Script hangs waiting for input when run via `curl | bash`
**Why it happens:** No terminal attached
**How to avoid:** Check `[[ -t 0 ]]` before interactive prompts, provide defaults
**Warning signs:** Script hangs indefinitely

### Pitfall 5: Missing Dependencies

**What goes wrong:** Script assumes curl/wget/git exist
**Why it happens:** Minimal server images lack common tools
**How to avoid:** Check and install prerequisites first
**Warning signs:** "command not found" errors

### Pitfall 6: Hardcoded Ubuntu-isms

**What goes wrong:** Script fails on Debian, CentOS, etc.
**Why it happens:** Using Ubuntu-specific paths/commands
**How to avoid:** Detect OS, use conditionals for distro-specific commands
**Warning signs:** "Package not found" on non-Ubuntu systems

### Pitfall 7: Secrets in Process List

**What goes wrong:** `API_KEY=secret123 ./command` exposes secret
**Why it happens:** Environment visible in /proc
**How to avoid:** Use environment files, not inline variables
**Warning signs:** Secrets visible in `ps auxe`

### Pitfall 8: Root Assumption

**What goes wrong:** Script fails with permission errors
**Why it happens:** Assumes root, run by regular user
**How to avoid:** Check `$EUID`, offer sudo fallback
**Warning signs:** "Permission denied" errors

## Code Examples

### Secure Secret Generation

```bash
#!/usr/bin/env bash
# Source: openssl documentation

generate_secrets() {
    # JWT secret - 256 bits (32 bytes = 64 hex chars)
    JWT_SECRET=$(openssl rand -hex 32)

    # API key - 256 bits
    LIV_API_KEY=$(openssl rand -hex 32)

    # Redis password - 192 bits (readable length)
    REDIS_PASS=$(openssl rand -hex 24)

    # Verify generation succeeded
    if [[ ${#JWT_SECRET} -ne 64 ]] || [[ ${#LIV_API_KEY} -ne 64 ]]; then
        fail "Failed to generate secure secrets"
    fi
}
```

### Node.js Installation via NodeSource

```bash
#!/usr/bin/env bash
# Source: NodeSource documentation

install_nodejs() {
    local node_version="22"

    # Check if already installed with correct version
    if command -v node &>/dev/null; then
        local current_version
        current_version=$(node -v | cut -d. -f1 | tr -d v)
        if [[ "$current_version" -ge "$node_version" ]]; then
            ok "Node.js $(node -v) already installed"
            return 0
        fi
    fi

    info "Installing Node.js ${node_version}.x..."

    # Install prerequisites
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg

    # Add NodeSource GPG key and repository
    mkdir -p /etc/apt/keyrings
    curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" | \
        gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${node_version}.x nodistro main" | \
        tee /etc/apt/sources.list.d/nodesource.list

    apt-get update -qq
    apt-get install -y -qq nodejs

    ok "Node.js $(node -v) installed"
}
```

### Docker Installation

```bash
#!/usr/bin/env bash
# Source: Docker official documentation

install_docker() {
    if command -v docker &>/dev/null; then
        ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') already installed"
        return 0
    fi

    info "Installing Docker..."

    # Remove old versions
    apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

    # Install prerequisites
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl

    # Add Docker GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    # Add repository (handles Ubuntu/Debian via $OS_ID)
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
        https://download.docker.com/linux/$OS_ID $OS_CODENAME stable" | \
        tee /etc/apt/sources.list.d/docker.list

    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin

    systemctl enable docker
    systemctl start docker

    ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installed"
}
```

### Configuration Wizard

```bash
#!/usr/bin/env bash
# Source: Whiptail documentation

run_configuration_wizard() {
    local config_file="$LIVOS_DIR/.env"

    step "Configuration Wizard"

    # Generate secrets first (always)
    generate_secrets

    # Domain configuration
    LIVOS_DOMAIN=$(wizard_input "Domain Setup" \
        "Enter your domain name (or 'localhost' for local access):" \
        "localhost")

    # AI API Key (optional but recommended)
    if wizard_yesno "AI Configuration" \
        "Do you want to configure an AI API key now?\n\nYou can always add this later in Settings."; then
        GEMINI_API_KEY=$(wizard_input "Gemini API Key" \
            "Enter your Google Gemini API key:\n(Get one at https://aistudio.google.com/app/apikey)" \
            "")
    fi

    # HTTPS setup
    if [[ "$LIVOS_DOMAIN" != "localhost" ]]; then
        if wizard_yesno "HTTPS Setup" \
            "Enable automatic HTTPS via Let's Encrypt?\n\nRequires domain DNS to point to this server."; then
            LIVOS_USE_HTTPS=true
        fi
    fi

    # Optional features
    WHATSAPP_ENABLED=false
    if wizard_yesno "WhatsApp Integration" \
        "Enable WhatsApp integration for Nexus AI?\n\n(Requires WhatsApp Business API setup)"; then
        WHATSAPP_ENABLED=true
    fi

    # Write configuration
    write_env_file
}
```

### Environment File Generation

```bash
#!/usr/bin/env bash
# Source: Phase 2 .env.example pattern

write_env_file() {
    local env_file="$LIVOS_DIR/.env"

    cat > "$env_file" << ENVFILE
# ==============================================================================
# LIVINITY ENVIRONMENT CONFIGURATION
# ==============================================================================
# Generated by install.sh on $(date -Iseconds)
# ==============================================================================

# === AI API Keys ===
GEMINI_API_KEY=${GEMINI_API_KEY:-}
ANTHROPIC_API_KEY=

# === Security ===
JWT_SECRET=${JWT_SECRET}
LIV_API_KEY=${LIV_API_KEY}

# === Database ===
REDIS_URL=redis://:${REDIS_PASS}@localhost:6379
DATABASE_URL=

# === Domain ===
LIVOS_DOMAIN=${LIVOS_DOMAIN:-localhost}
LIVOS_USE_HTTPS=${LIVOS_USE_HTTPS:-false}

# === Server Ports ===
MCP_PORT=3100
API_PORT=3200
MEMORY_PORT=3300

# === Daemon Configuration ===
DAEMON_INTERVAL_MS=30000
DEFAULT_MODEL=gemini-2.0-flash

# === Integrations ===
WHATSAPP_ENABLED=${WHATSAPP_ENABLED:-false}

# === Environment ===
NODE_ENV=production
ENVFILE

    chmod 600 "$env_file"
    ok ".env generated with secure permissions"
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `curl \| sh` (unverified) | `curl \| bash` with HTTPS + checksums | 2020+ | Reduced MITM risk |
| Per-user service scripts | systemd service units | systemd adoption | Reliable restarts, journald integration |
| Manual dependency install | Repository-based (NodeSource, Docker repo) | 2018+ | Versioned, secure, maintained |
| Inline secrets | EnvironmentFile directive | Security best practice | Secrets not in ps output |
| Read-based prompts | whiptail/dialog TUI | Better UX | Consistent look, validation |

**Deprecated/outdated:**
- `sysvinit` scripts: Use systemd instead
- Direct `apt-key add`: Use `/etc/apt/keyrings/` directory
- `curl http://` for installers: Always use HTTPS

## Open Questions

1. **PM2 vs systemd as primary?**
   - What we know: Existing script uses PM2, requirement mentions systemd
   - What's unclear: Whether to replace PM2 entirely or offer both
   - Recommendation: Generate systemd units as primary, keep PM2 as optional development mode

2. **Interactive vs non-interactive default?**
   - What we know: `curl | bash` often non-interactive, but user setup needed
   - What's unclear: Whether to require TTY or allow fully non-interactive with defaults
   - Recommendation: Auto-detect TTY, run wizard if interactive, use defaults if not

3. **Single install.sh or separate livos/nexus installers?**
   - What we know: Both livos and nexus have separate setup scripts currently
   - What's unclear: Whether unified or modular is better
   - Recommendation: Single unified install.sh that handles both (project core value is "one-command")

## Sources

### Primary (HIGH confidence)

- **Docker Install Script** (https://get.docker.com/) - Function wrapping, OS detection, dry-run mode
- **NVM Install Script** (https://github.com/nvm-sh/nvm) - Shell detection, profile modification
- **Docker Ubuntu Documentation** (https://docs.docker.com/engine/install/ubuntu/) - Repository setup, GPG keys

### Secondary (MEDIUM confidence)

- [Bash Strict Mode](http://redsymbol.net/articles/unofficial-bash-strict-mode/) - set -euo pipefail patterns
- [DigitalOcean systemd Guide](https://www.digitalocean.com/community/tutorials/understanding-systemd-units-and-unit-files) - Unit file structure
- [Red Hat Whiptail Guide](https://www.redhat.com/en/blog/use-whiptail) - Interactive dialog patterns
- [NodeSource Documentation](https://nodesource.com/blog/installing-node-js-tutorial-ubuntu) - Node.js installation

### Tertiary (LOW confidence)

- [Shell Script Mistakes](http://www.pixelbeat.org/programming/shell_script_mistakes.html) - Common pitfalls
- [Writing Bash Scripts Like A Pro](https://dev.to/unfor19/writing-bash-scripts-like-a-pro-part-2-error-handling-46ff) - Error handling patterns

## Metadata

**Confidence breakdown:**
- Shell patterns: HIGH - Verified with Docker/NVM official scripts
- OS detection: HIGH - Standard /etc/os-release approach
- systemd: MEDIUM - Official docs, but specific service configuration may need tuning
- Wizard (whiptail): MEDIUM - Documentation-based, not extensively tested
- Pitfalls: HIGH - Multiple sources agree on common issues

**Research date:** 2026-02-05
**Valid until:** 2026-04-05 (stable domain, shell best practices rarely change)

## Checklist for Planner

The planner should create tasks for:

1. [ ] Enhance `livos/setup.sh` with function wrapping (main pattern)
2. [ ] Add `set -euo pipefail` with ERR trap and cleanup function
3. [ ] Implement comprehensive OS/architecture detection
4. [ ] Create interactive configuration wizard using whiptail
5. [ ] Generate systemd service units for livos, nexus services
6. [ ] Update .env.example to match all installer-generated variables
7. [ ] Add verification step that tests end-to-end on Ubuntu 22.04
8. [ ] Implement dry-run mode for testing without system changes
