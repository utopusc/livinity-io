# Feature Landscape: Browser App

**Domain:** Self-hosted persistent browser with web-based access
**Researched:** 2026-02-07
**Confidence:** MEDIUM

## Executive Summary

Self-hosted browser apps in 2026 are split between two paradigms:

1. **Headless automation browsers** (Browserless, Puppeteer/Playwright) — API-driven, no UI, for scraping/testing
2. **Remote desktop browsers** (KasmVNC, Neko, LinuxServer Chromium) — VNC-based, full UI streaming, for human interaction

LivOS Browser App is a **hybrid**: VNC-based web viewer for human use + Playwright MCP for AI automation. This is relatively novel — most solutions pick one paradigm.

Key insight: **Persistent sessions are the hardest part.** Docker containers are ephemeral by nature. Making browser state (cookies, localStorage, login sessions) survive container restarts requires careful volume mounting and understanding of browser profile directories.

## Table Stakes

Features users expect from a self-hosted browser app. Missing any of these makes the product feel incomplete or broken.

| Feature | Why Expected | Complexity | Phase Impact |
|---------|--------------|------------|--------------|
| **Persistent browser sessions** | Users expect to stay logged into Gmail, Facebook, etc. across restarts | HIGH | CRITICAL — requires volume mounts for /config, understanding of Chromium profile structure, testing persistence across container recreation |
| **Web-based access** | Self-hosted means "access from any device" — no client install | LOW | Already solved — KasmVNC provides web viewer |
| **Password protection** | Browser contains logged-in sessions — unprotected = full account access | MEDIUM | Should use HTTP Basic Auth via Caddy reverse proxy (already exists in LivOS) or KasmVNC built-in auth |
| **Start/stop/restart controls** | Docker containers need lifecycle management | LOW | Already exists — LivOS has docker app management |
| **Crash recovery** | Browser tabs crash, containers OOM kill — must recover gracefully | MEDIUM | Docker restart policy (always/unless-stopped) + health checks + stale lock file cleanup |
| **Reasonable performance** | Laggy remote desktop = unusable. Must feel responsive for basic browsing | MEDIUM | Depends on: WebRTC/WebSocket streaming quality, network latency, hardware acceleration, shared memory size (--shm-size) |
| **Copy/paste (clipboard sync)** | Users expect clipboard to work between local machine and remote browser | MEDIUM | KasmVNC includes clipboard sync — must be enabled and tested |
| **File download** | Downloading files from browser must work | MEDIUM | Requires volume mount for downloads directory + mechanism to retrieve files (LivOS file manager can access mounted volume) |
| **Resolution scaling** | Browser should adapt to user's window size | LOW | KasmVNC supports dynamic resolution — verify it works |

## Differentiators

Features that set LivOS Browser App apart. Not expected, but highly valued.

| Feature | Value Proposition | Complexity | Phase Impact |
|---------|-------------------|------------|--------------|
| **AI-controlled automation via Playwright MCP** | Unique value: "Let Nexus AI use this browser." User asks AI to fill forms, scrape sites, automate tasks. Browser is now an AI tool, not just a remote desktop. | MEDIUM | Requires Playwright + MCP server in Docker image, auto-registration with LivOS on app start, CDP connection to running browser instance |
| **SOCKS5/HTTP proxy support** | Privacy-conscious self-hosters want to route browser through VPN/Tor/proxy for geo-unblocking or anonymity | MEDIUM | Proxy configuration via environment variables, passed to Chromium flags (--proxy-server=), verify IP changes |
| **Anti-detection/stealth mode** | Users automating with AI don't want sites to detect it's a bot. Stealth flags + fingerprint randomization. | HIGH | Requires puppeteer-extra-plugin-stealth or manual flags (--disable-blink-features=AutomationControlled), testing against detection sites like CreepJS, Fingerprint.js |
| **Persistent browser with AI memory** | Browser history, cookies, sessions persist AND the AI can remember "I logged you into Gmail yesterday." Combines browser persistence with LivOS memory embeddings. | MEDIUM | Requires persistent volumes + AI tool to query browser state (cookies, history via CDP) + embedding browser activity into memory |
| **One-click App Store install** | Most self-hosted browsers require manual Docker setup. LivOS makes it "click Install in App Store, assign subdomain, done." | LOW | Integration work — gallery manifest, featured listing, app lifecycle hooks |
| **Always-on cloud browser** | Unlike Chrome Remote Desktop (requires desktop running), this is a server-side browser that's always accessible. Use from phone, tablet, anywhere. | LOW | Architecture decision already made — Docker container runs independently |

## Anti-Features

Features to explicitly **NOT** build. Common mistakes or tempting ideas that hurt the product.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Multiple browser instances per user** | Complexity explosion: which browser is the AI using? Where are my sessions? Resource waste. | Single browser instance per LivOS installation. Clear, simple, resource-efficient. If users want multiple browsers, they can install multiple LivOS instances. |
| **Embedding browser in LivOS window via iframe** | Iframe embedding breaks clipboard, file downloads, full-screen, authentication. KasmVNC viewer has special requirements. | Access browser via subdomain (browser.domain.com) directly. LivOS App Store just opens link in new tab. Cleaner separation. |
| **Browser extension marketplace** | Browser extensions + container isolation = permissions nightmare. Security risk. Maintenance burden. | Pre-install essential extensions (uBlock Origin, privacy tools) in Docker image. Users can manually add more if needed (persistent profile saves them). |
| **Built-in VPN/proxy service** | Scope creep. Users who want VPN already have solutions. Bundling VPN adds complexity, legal issues, support burden. | Provide SOCKS5/HTTP proxy **configuration** (env vars) so users can point to their existing proxy/VPN. Integration, not bundling. |
| **Multi-user browser sessions** | LivOS is single-user home server. Multi-user browsers need session isolation, user management, resource quotas — different product. | Single browser per LivOS instance. Clear positioning as personal home server, not shared infrastructure. |
| **Screen recording/session replay** | Privacy red flag. Users are logging into personal accounts. Recording sessions = liability. | Don't record. Provide real-time viewing only. AI can take screenshots via Playwright if explicitly asked. |
| **Custom browser UI/chrome** | Users expect standard Chromium UI. Custom UI = learning curve, maintenance, breakage on Chromium updates. | Use stock Chromium UI. Focus on infrastructure (persistence, AI control, proxy), not UI customization. |

## Feature Dependencies

Dependencies between features and existing LivOS capabilities:

```
Persistent Sessions
  └─ Requires: Docker volume mounts (/config, /downloads)
  └─ Requires: Understanding of Chromium --user-data-dir
  └─ Blocks: AI browser control (AI needs stable session)

Password Protection
  └─ Requires: Caddy reverse proxy with basicauth directive
  └─ OR: KasmVNC built-in auth (BASIC_AUTH_PASSWORD env var)
  └─ Already exists: Caddy is deployed in LivOS

AI Browser Control (Playwright MCP)
  └─ Requires: Persistent sessions (can't re-login every time)
  └─ Requires: CDP endpoint exposed (--remote-debugging-port=9222)
  └─ Requires: MCP server auto-registration with LivOS
  └─ Already exists: MCP server registration system in Nexus

Proxy Configuration
  └─ Requires: Environment variables (PROXY_SERVER, PROXY_TYPE)
  └─ Requires: Chromium launch flags (--proxy-server=)
  └─ Independent: Works with or without AI control

Anti-Detection/Stealth
  └─ Requires: Playwright with stealth plugin (if using automation)
  └─ Requires: Chromium flags (--disable-blink-features=AutomationControlled, etc.)
  └─ Conflicts: Some flags may break normal browsing or KasmVNC viewer

App Store Integration
  └─ Requires: Gallery manifest JSON
  └─ Requires: Featured app listing in builtin gallery
  └─ Already exists: App Store system, gallery repos, featured apps

Crash Recovery
  └─ Requires: Docker restart policy (always)
  └─ Requires: Health check (curl http://localhost:3000)
  └─ Requires: Stale lock file cleanup on start
```

## Feature Complexity Breakdown

### LOW Complexity (1-2 days implementation)
- App Store integration (manifest + listing)
- Docker restart policy for crash recovery
- Subdomain access (already supported via Caddy)
- Basic password protection via Caddy basicauth

### MEDIUM Complexity (3-5 days implementation)
- Persistent browser sessions (volume mounting + testing)
- Playwright MCP auto-registration (lifecycle hooks)
- SOCKS5/HTTP proxy configuration (env vars + flags)
- Clipboard sync verification (KasmVNC feature)
- File download mechanism (volume mount + file manager access)

### HIGH Complexity (5-10 days implementation)
- Anti-detection/stealth mode (flag tuning + testing against detection)
- AI browser control with persistent state (CDP connection + session management)
- Custom Docker image build (linuxserver/chromium + Node.js + Playwright)
- Performance optimization (WebRTC tuning, shared memory, hardware acceleration)

## MVP Recommendation

For v1.3 Browser App milestone, prioritize:

### Phase 1: Core Browser (Must Have)
1. **Persistent sessions** — Table stakes. Browser that forgets logins is useless.
2. **Web-based access via subdomain** — Architecture decision already made.
3. **Password protection** — Security requirement for logged-in sessions.
4. **Basic crash recovery** — Docker restart policy + health check.
5. **App Store integration** — Installation mechanism.

### Phase 2: AI Integration (Differentiator)
1. **Playwright MCP auto-registration** — Core value prop: AI-controlled browser.
2. **CDP connection to running browser** — Enables AI to control existing session.
3. **Basic AI actions** — Navigate, click, fill forms, take screenshots.

### Phase 3: Privacy/Advanced (Nice to Have)
1. **SOCKS5/HTTP proxy support** — Common user request for self-hosters.
2. **Anti-detection flags** — Prevents bot detection during AI automation.
3. **Performance tuning** — Optimize WebRTC, shared memory, resolution.

## Defer to Post-MVP

Features to explicitly defer until after v1.3:

- **Multiple browser instances** — Anti-feature, don't build
- **Browser extension marketplace** — Anti-feature, don't build
- **Screen recording** — Privacy concern, anti-feature
- **Advanced fingerprint randomization** — Complex, diminishing returns
- **Hardware-accelerated video decode** — Performance optimization, not critical
- **Mobile touch controls** — KasmVNC handles this, verify it works
- **Multi-monitor support** — Edge case for self-hosted browser

## Known Pitfalls from Research

### Critical Issues

1. **Persistent session volume mounts**
   - **Problem:** Docker containers are ephemeral. Browser profiles stored in container = lost on restart.
   - **Solution:** Mount `/config` volume to host. Map to Chromium `--user-data-dir=/config/chromium-profile`.
   - **Gotcha:** LinuxServer images use `/config`, Kasm images use `/profile`, Browserless uses custom paths. Must verify correct path for chosen base image.

2. **Playwright connecting to running browser**
   - **Problem:** Most MCP servers launch new browser instances (clean state). We need to connect to existing VNC browser.
   - **Solution:** Use CDP (Chrome DevTools Protocol) with `--remote-debugging-port=9222`. Playwright connects via `browserWSEndpoint`.
   - **Gotcha:** CDP must be exposed internally (not internet-facing). Security risk if exposed.

3. **Shared memory size (--shm-size)**
   - **Problem:** Docker default shared memory is 64MB. Chromium needs more or crashes with "Aw, Snap!" errors.
   - **Solution:** Set `--shm-size=2g` in docker run command or use `/dev/shm` mount.
   - **Source:** Multiple reports in LinuxServer, Kasm, Browserless issues.

4. **Clipboard sync limitations**
   - **Problem:** Browser clipboard (Ctrl+C in Chromium) != VNC clipboard != local clipboard. Chain of sync can break.
   - **Solution:** KasmVNC has clipboard API. Verify it's enabled. Warn users clipboard is one-way (local → remote) in some browsers.

5. **Authentication conflicts**
   - **Problem:** Caddy basicauth + KasmVNC auth = double password prompt or auth loop.
   - **Solution:** Choose ONE auth layer. Recommend Caddy basicauth (consistent with LivOS) + disable KasmVNC auth.

### Moderate Issues

6. **Anti-detection flag conflicts**
   - **Problem:** Stealth flags (--disable-blink-features=AutomationControlled) can break normal browsing or VNC viewer rendering.
   - **Solution:** Test with and without flags. May need conditional flags (only when AI is controlling).

7. **File download paths**
   - **Problem:** Browser downloads to `/home/user/Downloads` inside container. User can't access files.
   - **Solution:** Mount `/downloads` volume + symlink to Chromium downloads dir. LivOS file manager accesses mounted volume.

8. **Resolution changes disconnect VNC**
   - **Problem:** Some VNC implementations crash or disconnect when browser changes resolution (e.g., entering fullscreen).
   - **Solution:** KasmVNC handles this. Test fullscreen, zoom, resolution changes.

9. **Browser update mechanism**
   - **Problem:** Chromium updates inside container = lost on restart (ephemeral).
   - **Solution:** Base image (linuxserver/chromium) handles updates. Rebuild Docker image periodically or use auto-update tags.

## Research Quality Assessment

### HIGH Confidence Areas
- Persistent session requirements (multiple sources confirm volume mounting)
- Docker crash recovery (standard restart policies documented)
- KasmVNC vs noVNC capabilities (official docs, LinuxServer docs)
- Playwright MCP architecture (Microsoft official repo, community examples)

### MEDIUM Confidence Areas
- Anti-detection effectiveness (sources from 2025-2026, but detection evolves)
- Proxy configuration (documented but implementation varies by base image)
- Clipboard sync reliability (feature exists but user reports mixed)
- Performance tuning (hardware-dependent, requires real-world testing)

### LOW Confidence Areas
- Fingerprint randomization best practices (conflicting advice, cat-and-mouse game)
- Optimal shared memory size (varies by use case, no definitive answer)
- AI browser control UX patterns (emerging area, few established patterns)

## Open Questions for Implementation

1. **Which base Docker image?**
   - LinuxServer/chromium (well-maintained, popular)
   - Kasm Chromium (enterprise-grade, more features)
   - Custom build from scratch (full control, more work)
   - Recommendation: Start with LinuxServer/chromium, add Node.js + Playwright layer.

2. **Where to run Playwright MCP server?**
   - Inside browser container (same network namespace, easier CDP access)
   - Separate sidecar container (cleaner separation, harder networking)
   - Recommendation: Inside browser container. Simpler, fewer networking issues.

3. **How to handle MCP server registration?**
   - Auto-register on container start (Docker healthcheck → webhook to LivOS)
   - Manual registration via App Store UI (user clicks "Enable AI Control")
   - Recommendation: Auto-register. Less user friction. Use container lifecycle hooks.

4. **Proxy configuration: environment variables or UI?**
   - Environment variables (standard Docker pattern, works with install script)
   - LivOS App Store UI (user-friendly, requires backend API)
   - Recommendation: Environment variables for MVP. Add UI in post-MVP if needed.

5. **How aggressive to be with anti-detection?**
   - Full stealth mode (puppeteer-extra-plugin-stealth, fingerprint randomization)
   - Basic flags only (--disable-blink-features=AutomationControlled)
   - No stealth (let sites detect automation)
   - Recommendation: Basic flags for MVP. Full stealth is HIGH complexity with diminishing returns.

## Sources

### Browser Containerization & Persistence
- [LinuxServer Kasm Documentation](https://docs.linuxserver.io/images/docker-kasm/)
- [Kasm Web Browsers in Docker](https://dbushell.com/2023/07/07/kasm-web-browsers-in-docker/)
- [LinuxServer Chromium Docker Image](https://hub.docker.com/r/linuxserver/chromium)
- [KasmVNC Official Documentation](https://kasmweb.com/kasmvnc/docs/1.0.0/index.html)
- [LinuxServer KasmVNC Base Images GitHub](https://github.com/linuxserver/docker-baseimage-kasmvnc)

### Headless Browser Automation
- [Browserless Chrome Docker Image](https://hub.docker.com/r/browserless/chrome)
- [Browserless GitHub Repository](https://github.com/browserless/browserless)
- [Browserless Documentation](https://docs.browserless.io/)
- [Browserless Sessions API Guide](https://www.browserless.io/blog/browserless-persisting-sessions-api-guide)

### AI Browser Control (Playwright MCP)
- [Microsoft Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [Playwright MCP AI Test Automation Guide](https://www.testleaf.com/blog/playwright-mcp-ai-test-automation-2026/)
- [Browser-Use: Closer to the Metal - CDP vs Playwright](https://browser-use.com/posts/playwright-to-cdp)
- [Lars Hagen MCP Playwright CDP Server on Glama](https://glama.ai/mcp/servers/@lars-hagen/mcp-playwright-cdp)

### Anti-Detection & Fingerprinting
- [Browser Fingerprint Detection Guide 2026](https://www.coronium.io/blog/browser-fingerprint-detection-guide)
- [Chameleon: Browser Detection & Fingerprinting 2026](https://chameleonmode.com/browser-detection-fingerprinting-2026/)
- [ScrapingBee: Best Antidetect Browsers 2026](https://www.scrapingbee.com/blog/anti-detect-browser/)
- [Browserless: Browser Fingerprinting Guide](https://www.browserless.io/blog/device-fingerprinting)
- [GitHub: Browser Fingerprinting Analysis](https://github.com/niespodd/browser-fingerprinting)

### VNC Web Viewer (Clipboard, Resolution, Input)
- [KasmVNC Official Site](https://kasm.com/kasmvnc)
- [noVNC GitHub Repository](https://github.com/novnc/noVNC)
- [RealVNC Viewer Parameter Reference](https://help.realvnc.com/hc/en-us/articles/360002254618-RealVNC-Viewer-Parameter-Reference)

### Proxy Configuration
- [HTTP Toolkit: Docker SOCKS Tunnel GitHub](https://github.com/httptoolkit/docker-socks-tunnel)
- [Mullvad Proxy: Docker with HTTP + SOCKS5](https://github.com/bernardko/mullvad-proxy)
- [Docker SOCKS5 Proxy Images on Docker Hub](https://hub.docker.com/r/serjs/go-socks5-proxy/)

### Docker Security & Authentication
- [Baeldung: Securing Passwords in Docker](https://www.baeldung.com/ops/docker-securing-passwords)
- [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/)
- [Password Protect Dockerized Nginx](https://dev.to/kevinlien/password-protect-a-dockerized-nginx-server-step-by-step-3oie)

### Resource Management & Crash Recovery
- [OneUpTime: Docker Restart Policies Guide](https://oneuptime.com/blog/post/2026-01-16-docker-restart-policies/view)
- [Docker Resource Constraints Documentation](https://docs.docker.com/engine/containers/resource_constraints/)
- [BetterLink: Docker Resource Limits Guide](https://eastondev.com/blog/en/posts/dev/20251218-docker-resource-limits-guide/)
- [Mozilla Bug: Memory-Constrained Docker Container Crash](https://bugzilla.mozilla.org/show_bug.cgi?id=1464690)

### Browser Persistence & Sessions
- [Browserless GitHub Issue: userDataDir Persistence](https://github.com/browserless/browserless/issues/4913)
- [DEV: Data Persistence (Cookies, Sessions, LocalStorage)](https://dev.to/samirabawad/data-persistence-cookies-sessions-tokens-localstorage-and-sessionstorage-1jbf)
- [Stytch: localStorage vs sessionStorage vs Cookies](https://stytch.com/blog/localstorage-vs-sessionstorage-vs-cookies/)

### Cloud Browser & Remote Desktop Features
- [Apache Guacamole Official Site](https://guacamole.apache.org/)
- [Kasm Workspaces Platform](https://kasm.com/)
- [Neko: Self-Hosted Virtual Browser on GitHub](https://github.com/m1k1o/neko)
- [RustDesk: Open-Source Remote Desktop](https://rustdesk.com)

### Chrome Remote Desktop Alternatives
- [Splashtop: Chrome Remote Desktop Alternative 2026](https://www.splashtop.com/blog/chrome-remote-desktop-alternative)
- [G2: Top Chrome Remote Desktop Alternatives 2026](https://www.g2.com/products/chrome-remote-desktop/competitors/alternatives)
- [Zoho Assist: Chrome Remote Desktop Alternative](https://www.zoho.com/assist/chrome-remote-desktop-alternative.html)

---

**Confidence Assessment:** MEDIUM overall. Strong understanding of technical requirements (HIGH confidence on Docker, VNC, Playwright). Moderate uncertainty on anti-detection effectiveness and optimal configuration (MEDIUM confidence). Implementation details need validation through testing (LOW confidence until verified).

**Next Steps:** Use this feature landscape to inform phase structure in roadmap. Prioritize persistent sessions and basic browser access (table stakes) before AI integration (differentiators). Flag anti-detection and performance tuning as "may need deeper research" during implementation.
