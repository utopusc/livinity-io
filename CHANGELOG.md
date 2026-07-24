# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-07-24

### Added
- **Interrupted-backup recovery** — if the server crashes or restarts mid-backup,
  boot now recovers automatically: app containers left paused by the backup are
  unpaused (before anything else can get stuck on them), leftover temporary
  staging files are cleaned, and the interrupted run is honestly recorded as
  failed instead of silently vanishing.

### Fixed
- System updates no longer fail silently on fresh installations. On a box that
  had never changed its release channel, the updater crashed with no output
  right after "Pulling latest code" (reported by an external beta tester —
  thank you, Andrew). The updater now tolerates the missing setting.
- The update-failure dialog no longer shows raw terminal color codes.

## [1.0.1] - 2026-07-24

### Fixed
- Settings now shows the correct installed version. The version label was resolved
  from GitHub's tag listing, which sorts alphabetically — after the SemVer
  migration `v1.0.0` sorted below the legacy `v45.x` tags and the UI fell back to
  a stale pre-release label. The version is now read from the box's own deployment
  record, which is always exact.

## [1.0.0] - 2026-07-23

**First stable release.** LivOS is a self-hosted AI home-server operating system:
run your own apps, virtual machines, files, and AI assistant on your own hardware,
reachable from anywhere through your own domain. This release marks the move to
strict [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`) and
consolidates the large feature line built since 0.9.0.

### Added
- **Virtual Machines** — a native "Virtual Machine" app that runs full Windows and
  Linux guests (via dockur/qemus containers), managed programmatically by the
  server: create, start/stop, per-VM Settings (RAM/CPU/disk-grow), live CPU/RAM/disk
  usage, native full-window screen, desktop shortcuts, and guest username setup.
- **Low-latency encoded VM streaming** — view a running VM's screen as a host-side
  hardware-encoded (iGPU VAAPI H.264) browser stream: an MSE player with a
  live-edge latency chase, honest fall-back to the standard noVNC view when no
  encoder is available, and interactive keyboard/mouse/scroll input over the same
  connection. Multi-viewer capable.
- **Backups** — repository-based backup/restore of apps and data.
- **App catalog** — 830+ self-hostable apps installable in one click, with
  per-user Docker isolation and automatic subdomain routing.
- **Free self-hosting** — run entirely on your own Cloudflare zone at no cost,
  with a guided in-product setup for domain + tunnel + SSL.
- **Livinity Desktop** — a Windows desktop app (Electron) for a zero-terminal
  install: sign in, auto-provision the Cloudflare tunnel/DNS, and install LivOS
  in WSL2 with tray supervision.
- **AI assistant** — Claude-powered assistant integrated across the OS.
- **Multi-user** — per-user isolation, admin RBAC, and per-user app installs.
- Comprehensive README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, and
  AGPL-3.0 licensing for the open-source release; `@livos/config` package for
  centralized configuration.

### Changed
- **Versioning** — adopted strict 3-part Semantic Versioning. Release tags are now
  `vMAJOR.MINOR.PATCH` (e.g. `v1.0.0`), pre-releases `vX.Y.Z-beta.N`. Stable-channel
  boxes update automatically; boxes on the older beta channel should switch to the
  stable channel to receive `v1.0.0`.
- All hardcoded paths (`/opt/livos`, `/opt/nexus`) and domains now use environment
  variables / configurable values; error handling hardened with proper TypeScript
  typing and a `formatErrorMessage()` helper.

### Security
- API authentication on the memory service (port 3300) and Nexus API (port 3200),
  `timingSafeEqual` API-key comparison, and secret rotation for GEMINI_API_KEY /
  JWT_SECRET / LIV_API_KEY. Health endpoints remain public for load-balancer checks.
- The VM screen/stream and input surfaces are admin-gated, loopback-bound, and
  never publicly exposed; the encoded stream added no new external attack surface.

### Known limitations
- Encoded VM streaming is verified on **Ubuntu/Linux guests**. On **Windows guests**
  the cursor may appear jittery — this is a guest-OS/driver behaviour, not a defect
  in the streaming pipeline; the standard view remains available as a fallback.

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
