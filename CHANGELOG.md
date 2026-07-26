# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.13] - 2026-07-25

### Added
- **Back up to this device.** If you don't have a USB drive or a NAS, you can now
  back up to the storage pool or to a folder on the box itself — there's a new
  "This device" option when you set up a backup. You give the folder a name and
  LivOS puts it somewhere safe; you don't have to know any paths.
  LivOS is honest about what this protects you from: a backup on the same disk as
  LivOS guards against mistakes, accidental deletion and a bad update, but not
  against that disk failing. So it never shows as fully protected, and the
  reminder to add a drive or a NAS keeps appearing. It does back up on the same
  hourly schedule as everything else.
- **Automatic hourly backups to the box itself, on by default.** LivOS now keeps
  its own local snapshots with no setup at all, thinned automatically so they
  can't grow without bound. This was previously available only on the Beta
  channel. Two things are deliberately left out to keep it from filling your
  disk: browser caches (which regenerate anyway — your logins and settings are
  still backed up) and virtual-machine disk images, which are very large and
  change constantly. VM disk images are a switch you can turn on in
  Settings → Backups if you want them included; your VM settings are always
  backed up either way.

### Fixed
- **A backup set up to an external drive that wasn't plugged in went to the wrong
  place.** LivOS would create the backup on its own system disk instead — inside
  the very data being backed up, where it counted as a real backup, stopped the
  "no backups configured" reminder, and would have been deleted by the restore it
  was meant to serve. LivOS now checks the drive is actually connected first.
- **Backups can no longer fill the system disk while running.** The space check
  only ran before a backup started, so a backup that began with room could still
  run the disk down mid-way and take the system with it. LivOS now watches while
  the backup runs and stops it if space gets critically low. The next hourly run
  simply tries again.

## [1.1.12] - 2026-07-25

_Cut from 1.1.1 plus the fixes below only — it deliberately does not include the
Safety Snapshots pre-release, which stays on the Beta channel until its snapshot
scope and disk handling are finished._

### Fixed
- **Setup could get stuck on the two-factor screen and never reach the desktop.**
  Entering the *correct* code switched two-factor on but did not continue, and
  every code tried afterwards was refused — because the account was already
  enrolled, though the screen only said the code was wrong. There was no Back,
  Skip or Continue, so there was no way out. Two people testing LivOS hit this
  and never got to see the product. Setup now shows your recovery codes and
  carries on, tells you when two-factor is already on, and can always be
  continued.
- **Two-factor is now optional during setup.** It is still offered and still
  recommended, but you can skip it and turn it on later from Settings → 2FA.
- **Recovery codes can now actually be used to sign in.** The sign-in screen only
  accepted six digits, so the recovery codes handed out when two-factor is
  enabled — which are longer and contain letters — could not be typed in at all.
  If you lost access to your authenticator there was no way back into your own
  box. There is now a "Use a recovery code" option on the sign-in screen.
- **A wrong-looking code now says when the real problem is the clock.** If the
  server's clock has drifted more than a few minutes, no authenticator code can
  ever match. Instead of repeating "incorrect code", LivOS now tells you the
  clock is off and by roughly how much. (Common on virtual machines without time
  sync.) How codes are checked is unchanged.
- **A rare valid code is no longer rejected.** Roughly one code in twenty
  thousand was refused because of a flaw in the library used to check them; the
  check is now done directly and is verified against the published standard.

> **If you are already locked out:** this release fixes new installations, but it
> cannot recover an account that was enrolled through the broken screen — that
> account has two-factor switched on with codes that were never shown. Those
> boxes need the two-factor reset on the server, or a reinstall.

## [1.1.11-beta.1] - 2026-07-25

_Pre-release: available on the Beta channel only. Requires v1.1.1 or newer._

### Added
- **Safety Snapshots (on by default)** — the box now backs itself up to its own
  internal disk every hour with zero setup: automatic snapshot repository,
  aggressive thinning (a day of hourlies, a week of dailies), and a disk-space
  guard so backups can never fill the system disk. The UI is honest about what
  this protects against: mistakes (accidental deletion, a bad update) — not
  hardware failure — so the "add a real backup destination" reminder stays, and
  backup health never shows green on local-only protection. Can be turned off.

## [1.1.1] - 2026-07-24

### Fixed
- **Beta release channel could offer a much older version.** After the move to
  semantic versioning, the Beta channel compared the new `1.x` releases against
  the legacy `45.x` tags numerically and picked the legacy one — so a box
  switched to Beta was offered an outdated pre-release instead of the current
  version. Both the in-app check and the updater now consider only proper
  three-part version tags. Stable-channel boxes were never affected.

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
