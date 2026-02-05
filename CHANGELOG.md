# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive README.md with installation guide and configuration reference
- CONTRIBUTING.md with development setup for both pnpm and npm workspaces
- CODE_OF_CONDUCT.md based on Contributor Covenant 2.1
- SECURITY.md with vulnerability reporting process
- AGPL-3.0 license for open source release
- `@livos/config` package for centralized configuration

### Changed
- All hardcoded paths (`/opt/livos`, `/opt/nexus`) now use environment variables
- All hardcoded domains replaced with configurable values
- Error handling improved with proper TypeScript typing
- Catch blocks now use `formatErrorMessage()` helper

### Security
- API authentication added to memory service (port 3300)
- API authentication added to Nexus API (port 3200)
- `timingSafeEqual` used for API key comparison
- Health endpoints remain public for load balancer checks
- Secret rotation capability for GEMINI_API_KEY, JWT_SECRET, LIV_API_KEY

## [0.9.0] - 2026-02-04

### Added
- Web UI with desktop-like windowed interface
- Docker application management (install, start, stop, remove)
- File manager with upload, download, rename, delete
- User authentication with JWT
- AI chat via web UI with SSE streaming
- WhatsApp bot integration
- Telegram bot integration
- Discord bot integration
- MCP server for Claude Desktop / Cursor integration
- Background job processing with BullMQ
- Memory service with embeddings
- Tool system (shell, docker, files, scrape, etc.)
- Skill system with hot-reload
- Reverse proxy with Caddy (auto HTTPS)

### Notes
- This version represents the pre-release codebase snapshot
- Contains hardcoded values that are being migrated to configuration
- For production use, wait for v1.0.0 release

---

[Unreleased]: https://github.com/utopusc/livinity-io/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/utopusc/livinity-io/releases/tag/v0.9.0
