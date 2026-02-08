# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-08)

**Core value:** One-command deployment of a personal AI-powered server that just works.
**Current milestone:** v1.3 — Browser App
**Current focus:** Defining requirements

## Current Position

Milestone: v1.3 (Browser App)
Phase: v1.3-03-proxy-anti-detection (1 of 1 plans complete)
Plan: 03-01-PLAN.md completed
Status: Phase complete
Last activity: 2026-02-08 — Completed v1.3-03-01-PLAN.md (Proxy Anti-Detection)

Progress: ████░░░░░░ 4/10 plans (40%)

## Accumulated Context

### Decisions

v1.3 decisions:
- [Milestone]: Browser published as App Store app (not hardcoded into UI)
- [Milestone]: Access via subdomain (browser.domain.com) — no iframe/window embedding in LivOS UI
- [Milestone]: Playwright MCP for AI browser automation
- [Milestone]: SOCKS5/HTTP proxy support for privacy
- [Milestone]: Custom Docker image extending linuxserver/chromium
- [Tech]: Gallery hooks (post-start/pre-stop) for MCP registration
- [Tech]: Anti-detection flags (disable-blink-features, disable-infobars)
- [Tech]: Persistent sessions via Docker volume mapping
- [v1.3-01-01]: Selkies web viewer on port 3000 (not KasmVNC on 6901)
- [v1.3-01-01]: Health checks monitor Selkies availability with 30s interval
- [v1.3-01-01]: Removed deprecated docker-compose version: line for modern compatibility
- [v1.3-01-02]: Port 3000 used for Selkies web viewer (was 6901 for KasmVNC)
- [v1.3-01-02]: Subdomain 'browser' configured for browser.domain.com access
- [v1.3-01-02]: commonPorts map entry ensures correct port detection when docker-compose.yml has no explicit ports/expose directives
- [v1.3-02-01]: Sleep 3 for CDP readiness instead of explicit curl check (MCP client has 30s timeout)
- [v1.3-02-01]: --remote-debugging-address=0.0.0.0 required for docker exec CDP access
- [v1.3-02-01]: Include name and description fields in MCP config for McpServerConfig compliance
- [v1.3-03-01]: Remove hardcoded CHROME_CLI, build dynamically at runtime via init script
- [v1.3-03-01]: Use s6-overlay /run/s6/container_environment/ for runtime environment variable setting
- [v1.3-03-01]: PROXY_URL empty by default, user-configurable at install time via environmentOverrides
- [v1.3-03-01]: DNS leak prevention for SOCKS5 via --host-resolver-rules

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-08
Stopped at: Completed v1.3-03-01-PLAN.md (Proxy Anti-Detection)
Resume file: None
