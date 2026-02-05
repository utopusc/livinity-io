# LivOS

**Self-hosted AI-powered home server operating system**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-green.svg)](CONTRIBUTING.md)

---

## What is LivOS?

LivOS is a personal server operating system that transforms any Linux machine into a powerful, AI-enhanced home server. It combines the simplicity of consumer NAS devices with the flexibility of self-hosted solutions, all managed through an intuitive web interface.

At its core, LivOS features **Nexus**, an integrated AI assistant that can be accessed through WhatsApp, Telegram, Discord, or the web UI. Nexus can manage your apps, answer questions about your server, execute automated tasks, and extend its capabilities through a modular skills system. It supports both Google Gemini and Anthropic Claude as AI backends.

For developers, LivOS includes an MCP (Model Context Protocol) server that integrates directly with Claude Desktop and Cursor IDE, allowing AI coding assistants to interact with your server. All data stays on your hardware, ensuring complete privacy and ownership of your information.

---

## Features

### AI Assistant (Nexus)

- Multi-channel access: WhatsApp, Telegram, Discord, and web interface
- Tool execution for server management and automation
- Persistent memory with vector embeddings for context-aware conversations
- Extensible skills system with hot-reload support
- MCP server for Claude Desktop and Cursor IDE integration

### App Management

- Docker-based application deployment
- 200+ pre-configured apps available (Nextcloud, Plex, Home Assistant, Jellyfin, etc.)
- One-click installation with automatic configuration
- App health monitoring and automatic restarts
- Domain routing with automatic SSL via Caddy

### File Manager

- Web-based file browser with upload and download
- Network share support (SMB/CIFS)
- Integrated backup system
- External storage management
- File preview and streaming

### Developer Tools

- MCP server for AI IDE integration
- Hot-reload skills development
- tRPC API for programmatic access
- PM2 process management
- Comprehensive logging system

---

## Quick Start

### Requirements

- Linux server (Ubuntu 22.04+ recommended)
- 2GB+ RAM (4GB recommended)
- Docker 24+ installed
- Node.js 22+

### One-Command Install

```bash
curl -fsSL https://get.livinity.io | bash
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/utopusc/livinity-io.git
cd livinity-io

# Install LivOS dependencies
cd livos
pnpm install
pnpm build

# Configure environment
cp .env.example .env
# Edit .env with your settings (see Configuration section)

# Start services
pm2 start ecosystem.config.cjs

# Install Nexus dependencies (optional, for AI features)
cd ../nexus
npm install
npm run build
pm2 start ecosystem.config.cjs
```

### Access

- **Local**: Open http://localhost:3000 in your browser
- **Remote**: Open https://your-domain after configuring DNS

---

## Requirements

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| Node.js | 22.0+ | 22.x LTS | Required for all services |
| Docker | 24.0+ | Latest | Required for app management |
| Redis | 7.0+ | 7.x | Caching and pub/sub |
| PostgreSQL | 15+ | 16.x | Optional in development |
| RAM | 2GB | 4GB+ | More for running apps |
| Storage | 20GB | 100GB+ | Depends on installed apps |

---

## Configuration

LivOS uses environment variables for configuration. Copy `.env.example` to `.env` and customize:

```bash
cd livos
cp .env.example .env
```

### AI API Keys

At least one AI API key is required for AI features.

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | (empty) | Google Gemini API key. Get from [AI Studio](https://aistudio.google.com/app/apikey) |
| `ANTHROPIC_API_KEY` | (empty) | Anthropic Claude API key. Get from [Console](https://console.anthropic.com/settings/keys) |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | (empty) | JWT signing secret (min 32 bytes). Generate: `openssl rand -hex 32` |
| `LIV_API_KEY` | (empty) | Internal API authentication key. Generate: `openssl rand -hex 32` |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL. URL-encode special chars in password |
| `DATABASE_URL` | (empty) | PostgreSQL connection URL (optional in dev) |

### Server Ports

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_PORT` | `3100` | MCP server port for Claude/Cursor |
| `API_PORT` | `3200` | Nexus API server port |
| `MEMORY_PORT` | `3300` | Memory/embedding service port |

### Daemon Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DAEMON_INTERVAL_MS` | `30000` | AI daemon polling interval in milliseconds |
| `DEFAULT_MODEL` | `gemini-2.0-flash` | Default AI model to use |

### Paths

Override defaults for custom installations.

| Variable | Default | Description |
|----------|---------|-------------|
| `LIVOS_BASE_DIR` | `/opt/livos` | LivOS installation directory |
| `NEXUS_BASE_DIR` | `/opt/nexus` | Nexus installation directory |
| `LIVOS_DATA_DIR` | `$LIVOS_BASE_DIR/data` | App data storage |
| `LIVOS_LOGS_DIR` | `$LIVOS_BASE_DIR/logs` | Log files |
| `LIVOS_SKILLS_DIR` | `$LIVOS_BASE_DIR/skills` | LivOS skill definitions |
| `NEXUS_SKILLS_DIR` | `$NEXUS_BASE_DIR/skills` | Nexus skill definitions |
| `NEXUS_WORKSPACE_DIR` | `$NEXUS_BASE_DIR/workspace` | Nexus working directory |

### Domain Configuration

Domain setup is done through the **Web UI**, not environment variables:

1. Open **Settings** → **Domain Setup**
2. Enter your domain name
3. Configure DNS records as instructed
4. LivOS will automatically configure Caddy for HTTPS

The UI handles:
- DNS validation
- Caddy reverse proxy configuration
- Automatic HTTPS via Let's Encrypt

### Service URLs

Override if services run on different hosts.

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXUS_API_URL` | `http://localhost:3200` | Nexus API endpoint |
| `MEMORY_SERVICE_URL` | `http://localhost:3300` | Memory service endpoint |

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode (`development` or `production`) |

### Notifications (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFICATION_EMAIL` | (empty) | Email for system alerts |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | (empty) | SMTP username |
| `SMTP_PASS` | (empty) | SMTP password |

### Integrations (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `WHATSAPP_ENABLED` | `false` | Enable WhatsApp integration |

---

## Architecture

### Monorepo Structure

```
livinity-io/
├── livos/                     # Main platform (pnpm workspace)
│   ├── packages/
│   │   ├── livinityd/        # Backend daemon (Express + tRPC)
│   │   ├── ui/               # Web UI (React + Vite)
│   │   ├── config/           # Shared config (@livos/config)
│   │   └── marketplace/      # App marketplace definitions
│   └── skills/               # LivOS skill definitions
│
└── nexus/                    # AI Agent (npm workspace)
    ├── packages/
    │   ├── core/             # Agent orchestration
    │   ├── memory/           # Embedding service
    │   ├── mcp-server/       # Claude/Cursor integration
    │   ├── worker/           # Background task processing
    │   └── hooks/            # Lifecycle hooks
    └── skills/               # Nexus skill definitions
```

### Service Architecture

```
                                   ┌─────────────────┐
                                   │   Web Browser   │
                                   └────────┬────────┘
                                            │
                                   ┌────────▼────────┐
                                   │     Caddy       │
                                   │  (Reverse Proxy)│
                                   └────────┬────────┘
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              │                             │                             │
     ┌────────▼────────┐          ┌────────▼────────┐          ┌────────▼────────┐
     │    LivOS UI     │          │   Livinityd     │          │   Nexus API     │
     │   (React/Vite)  │◄────────►│   (Express)     │◄────────►│   (Express)     │
     │   Port: 5173    │          │   Port: 80/443  │          │   Port: 3200    │
     └─────────────────┘          └────────┬────────┘          └────────┬────────┘
                                           │                            │
                                           │                   ┌────────▼────────┐
                                  ┌────────▼────────┐          │  Memory Service │
                                  │     Docker      │          │   Port: 3300    │
                                  │   (App Engine)  │          └────────┬────────┘
                                  └─────────────────┘                   │
                                                               ┌────────▼────────┐
                                                               │     Redis       │
                                                               │   Port: 6379    │
                                                               └─────────────────┘
```

### Key Components

| Component | Description |
|-----------|-------------|
| **Livinityd** | Core backend daemon handling app management, file operations, and system APIs |
| **UI** | React-based web interface with tRPC client for real-time communication |
| **@livos/config** | Shared configuration package with Zod validation schemas |
| **Nexus Core** | AI agent orchestration with intent parsing and skill execution |
| **Memory Service** | Vector embedding service for AI context and conversation history |
| **MCP Server** | Model Context Protocol server for Claude Desktop/Cursor integration |

---

## Tech Stack

| Category | Technologies |
|----------|--------------|
| **Backend** | Node.js 22, TypeScript 5.7, Express, tRPC |
| **Frontend** | React 18, Vite, Tailwind CSS, shadcn/ui |
| **Database** | Redis (caching, pub/sub), PostgreSQL (persistent storage) |
| **AI** | Google Gemini, Anthropic Claude, Vector embeddings |
| **Infrastructure** | Docker, Caddy (reverse proxy), PM2 (process management) |
| **Validation** | Zod schemas for runtime type safety |
| **Testing** | Vitest, React Testing Library |

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting pull requests.

### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Security

Security is a priority for LivOS. If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Read our [Security Policy](SECURITY.md)
3. Report vulnerabilities responsibly via the process described there

### Security Features

- API key authentication for all internal services
- Timing-safe comparison for credential validation
- JWT-based session management
- Configurable secret rotation

---

## License

LivOS is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means:

- You can use, modify, and distribute LivOS freely
- If you modify LivOS and provide it as a service over a network, you must release your modifications under AGPL-3.0
- Network use is considered distribution

See [LICENSE](LICENSE) for the full license text.

---

## Links

- **Website**: https://livinity.io
- **GitHub Issues**: https://github.com/utopusc/livinity-io/issues
- **Discussions**: https://github.com/utopusc/livinity-io/discussions

---

## Acknowledgments

LivOS is built on the shoulders of giants. Special thanks to:

- The Docker community for containerization
- The Node.js and TypeScript teams
- Google and Anthropic for AI APIs
- All open source projects that make this possible
