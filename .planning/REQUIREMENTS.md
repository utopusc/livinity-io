# Requirements: LivOS v1.3 Browser App

**Defined:** 2026-02-08
**Core Value:** One-command deployment of a personal AI-powered server that just works.

## v1.3 Requirements

### Container Foundation

- [ ] **CONT-01**: Custom Dockerfile extends linuxserver/chromium with Node.js 22 and @playwright/mcp
- [ ] **CONT-02**: docker-compose.yml with shm_size 1gb, mem_limit, security_opt seccomp:unconfined
- [ ] **CONT-03**: Persistent browser sessions via Docker volume mapping (/config)
- [ ] **CONT-04**: Stale lock file cleanup script (SingletonLock/Socket/Cookie) on container init
- [ ] **CONT-05**: Container restart policy (on-failure) with health check

### App Store Integration

- [ ] **STORE-01**: livinity-app.yml manifest with correct metadata (name, icon, category, port)
- [ ] **STORE-02**: builtin-apps.ts entry for featured listing in App Store UI
- [ ] **STORE-03**: User can install Chromium Browser from App Store
- [ ] **STORE-04**: User can assign subdomain and access browser at browser.domain.com

### MCP Integration

- [ ] **MCP-01**: hooks/post-start registers Playwright MCP server in Redis (nexus:mcp:config)
- [ ] **MCP-02**: hooks/pre-stop deregisters Playwright MCP server from Redis
- [ ] **MCP-03**: Playwright MCP connects via CDP (--cdp-endpoint ws://container:9222)
- [ ] **MCP-04**: AI agent can navigate, click, type, screenshot via Playwright MCP tools
- [ ] **MCP-05**: CDP remote-debugging-port 9222 enabled via CHROME_CLI flags (internal only)

### Proxy Support

- [ ] **PROXY-01**: SOCKS5 proxy configuration via Chromium --proxy-server flag
- [ ] **PROXY-02**: HTTP proxy configuration via Chromium --proxy-server flag
- [ ] **PROXY-03**: Proxy settings configurable via environment variables in docker-compose.yml

### Anti-Detection & Security

- [ ] **SEC-01**: Anti-detection flags (--disable-blink-features=AutomationControlled, --disable-infobars)
- [ ] **SEC-02**: --disable-dev-shm-usage flag for Docker compatibility
- [ ] **SEC-03**: CDP port 9222 NOT exposed to host (internal container only)
- [ ] **SEC-04**: KasmVNC/Selkies password protection via CUSTOM_USER and PASSWORD env vars

## Future Requirements

### Advanced Browser Features
- **ADV-01**: Multiple browser profiles
- **ADV-02**: Download manager integration with LivOS file manager
- **ADV-03**: Bookmark sync across sessions
- **ADV-04**: Browser extension management

### Advanced Proxy
- **PROXY-ADV-01**: Tor integration as a proxy option
- **PROXY-ADV-02**: Proxy rotation for web scraping
- **PROXY-ADV-03**: Per-tab proxy configuration

## Out of Scope

| Feature | Reason |
|---------|--------|
| iframe/window embedding in LivOS UI | Browser accessed via subdomain, no UI integration needed |
| Multiple browser instances | Single-user home server, one browser sufficient |
| Browser extension marketplace | Too complex, users can install manually |
| Built-in VPN | SOCKS5/HTTP proxy sufficient for v1.3 |
| Screen recording | Not core to browser app purpose |
| Firefox/Safari alternatives | Chromium only for v1.3 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONT-01 | Phase 1 | Pending |
| CONT-02 | Phase 1 | Pending |
| CONT-03 | Phase 1 | Pending |
| CONT-04 | Phase 1 | Pending |
| CONT-05 | Phase 1 | Pending |
| STORE-01 | Phase 1 | Pending |
| STORE-02 | Phase 1 | Pending |
| STORE-03 | Phase 1 | Pending |
| STORE-04 | Phase 1 | Pending |
| MCP-01 | Phase 2 | Pending |
| MCP-02 | Phase 2 | Pending |
| MCP-03 | Phase 2 | Pending |
| MCP-04 | Phase 2 | Pending |
| MCP-05 | Phase 2 | Pending |
| PROXY-01 | Phase 3 | Pending |
| PROXY-02 | Phase 3 | Pending |
| PROXY-03 | Phase 3 | Pending |
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 2 | Pending |
| SEC-04 | Phase 1 | Pending |

**Coverage:**
- v1.3 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-08*
*Last updated: 2026-02-08 after initial definition*
