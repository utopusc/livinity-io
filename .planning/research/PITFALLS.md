# Domain Pitfalls: Docker Browser App with KasmVNC + Playwright MCP

**Domain:** Docker-based persistent Chromium browser with KasmVNC viewer, Playwright MCP integration, and proxy support
**Target System:** LivOS self-hosted platform (2-4 CPU, 4-8GB RAM VPS, Caddy reverse proxy)
**Researched:** 2026-02-07
**Milestone:** v1.3 Browser App

---

## Critical Pitfalls

Mistakes that cause security breaches, data loss, or complete feature failure.

### Pitfall 1: CDP Remote Debugging Port Exposed to Network

**What goes wrong:** The linuxserver/chromium container is launched with `--remote-debugging-port=9222 --remote-allow-origins=*` (as currently defined in `builtin-apps.ts` CHROME_CLI). If port 9222 is published on the Docker host or reachable via Docker networking, anyone who can reach that port gains full control of the browser -- reading cookies, session tokens, browsing history, localStorage, and executing arbitrary JavaScript. This is equivalent to handing over all logged-in sessions.

**Why it happens:** Developers enable remote debugging for Playwright MCP connectivity but forget to restrict network access. The `--remote-allow-origins=*` wildcard disables all origin-based access control, and `--remote-debugging-port=9222` opens a powerful unauthed endpoint.

**Consequences:**
- Complete session hijacking -- attacker extracts cookies for Google, Facebook, banking sites
- Arbitrary JavaScript execution in any tab (XSS equivalent)
- File system read access via `file://` protocol navigation
- Chrome 136+ changes mean `--remote-debugging-address=0.0.0.0` is forced to `127.0.0.1` internally, but Docker port mapping circumvents this protection

**Warning signs:**
- `docker port` shows 9222 mapped externally
- `nmap` from another host can reach port 9222
- `/json/version` endpoint returns data from external network

**Prevention:**
1. NEVER publish port 9222 to the host. Use Docker internal networking only.
2. Playwright MCP connects via Docker network name (e.g., `http://chromium-container:9222`), not via published host port.
3. Replace `--remote-allow-origins=*` with `--remote-allow-origins=http://localhost` in the CHROME_CLI env var.
4. If CDP must be externally accessible (it should not be), use a socat relay inside the container and an authenticated proxy in front.
5. Add a firewall rule (`ufw deny 9222`) as defense-in-depth.

**Phase:** Must be addressed in Phase 1 (Docker image + compose). This is a security-critical configuration.

**Confidence:** HIGH -- verified via [Chrome Developer Blog](https://developer.chrome.com/blog/remote-debugging-port), [SpecterOps cookie dumping analysis](https://posts.specterops.io/hands-in-the-cookie-jar-dumping-cookies-with-chromiums-remote-debugger-port-34c4f468844e), and [linuxserver/docker-chromium issue #30](https://github.com/linuxserver/docker-chromium/issues/30).

---

### Pitfall 2: KasmVNC Container Exposed Without Authentication

**What goes wrong:** The linuxserver/chromium container (built on KasmVNC baseimage) has NO authentication by default. The optional `CUSTOM_USER` and `PASSWORD` env vars only enable basic HTTP auth via embedded nginx, suitable only for trusted local networks. When exposed to the internet via Caddy subdomain (e.g., `browser.livinity.cloud`), anyone can access the full browser desktop, open a terminal with passwordless sudo, probe the local Docker network, and install malware.

**Why it happens:** LinuxServer.io published a [security advisory (2024-10-06)](https://info.linuxserver.io/issues/2024-10-06-securing-kasm/) documenting a surge in users exposing KasmVNC containers to the internet without auth. The basic HTTP auth with `CUSTOM_USER`/`PASSWORD` is insufficient for internet exposure because credentials transit as base64-encoded plaintext (mitigated by HTTPS, but still weak).

**Consequences:**
- Full browser access for any internet user
- Terminal access with sudo privileges inside the container
- Lateral movement to other containers on the Docker network
- Cryptocurrency miners or malware installed in the container

**Warning signs:**
- `browser.yourdomain.com` accessible without any login prompt
- Container CPU usage spikes unexpectedly (cryptominer)
- Unknown processes in `docker exec <container> ps aux`

**Prevention:**
1. The Caddy reverse proxy MUST enforce LivOS auth before proxying to KasmVNC. Use LivOS's existing JWT auth as a gatekeeper -- requests to the browser subdomain must carry a valid LivOS session.
2. Additionally set `CUSTOM_USER` and `PASSWORD` env vars as a second auth layer.
3. Never expose ports 3000/3001 directly to the host -- proxy through Caddy only.
4. Consider implementing Caddy `forward_auth` to LivOS auth service, similar to how [Authelia/Authentik integrate with Caddy](https://caddyserver.com/docs/caddyfile/directives/forward_auth).

**Phase:** Must be addressed in Phase 1 (Docker compose) and Phase 4 (frontend viewer auth integration).

**Confidence:** HIGH -- verified via [LinuxServer.io security PSA](https://info.linuxserver.io/issues/2024-10-06-securing-kasm/) and [KasmVNC documentation](https://kasmweb.com/kasmvnc/docs/master/man/vncpasswd.html).

---

### Pitfall 3: Docker /dev/shm Undersized -- Chromium Crashes

**What goes wrong:** Docker containers default to 64MB of shared memory (`/dev/shm`). Chromium's multi-process architecture requires significant shared memory for inter-process communication. With insufficient `/dev/shm`, Chromium silently crashes, fails to render pages, or produces `SIGBUS` errors. This manifests as blank white pages, tab crashes, or the browser failing to start entirely.

**Why it happens:** Docker's 64MB default was designed for simple services, not full desktop applications. Chromium allocates shared memory segments for each renderer process (one per tab/iframe). Even a single complex page like YouTube can exhaust 64MB.

**Consequences:**
- Browser crashes immediately on page load
- Cryptic `Creating shared memory in /dev/shm/... failed: No space left on device` errors in container logs
- Container appears running but browser is non-functional
- Users think the entire feature is broken

**Warning signs:**
- `docker logs <container>` shows SIGBUS or shared memory errors
- `docker exec <container> df -h /dev/shm` shows 100% usage
- Browser works for simple pages but crashes on complex sites

**Prevention:**
1. Set `shm_size: "1gb"` in docker-compose.yml. The linuxserver/chromium docs explicitly state this is mandatory for modern websites.
2. Alternatively, use `--disable-dev-shm-usage` Chrome flag, which forces Chromium to use `/tmp` instead of `/dev/shm`. This is slower but avoids the size limit. However, this flag is less reliable for GUI (non-headless) usage.
3. For a VPS with only 4GB RAM, `shm_size: "512m"` may be sufficient to conserve memory. Monitor and adjust.
4. The existing `nexus/deploy/docker-compose.yml` already uses `shm_size: "1g"` for the Playwright container -- follow the same pattern.

**Phase:** Phase 1 (Docker compose configuration). Simple configuration fix but causes complete feature failure if missed.

**Confidence:** HIGH -- verified via [Chromium bug #715363](https://issues.chromium.org/issues/40517415), [linuxserver/chromium docs](https://docs.linuxserver.io/images/docker-chromium/), and confirmed by existing project config in `nexus/deploy/docker-compose.yml` which already sets `shm_size: "1g"`.

---

### Pitfall 4: Caddy Config Reload Kills KasmVNC WebSocket Sessions

**What goes wrong:** KasmVNC uses persistent WebSocket connections for the VNC stream. When LivOS installs, uninstalls, or updates any app, it calls `applyCaddyConfig()` which writes a new Caddyfile and runs `caddy reload`. By default, Caddy forcibly closes all active WebSocket connections on config reload, sending a Close control frame to both client and upstream. Users see their browser viewer session instantly disconnect whenever ANY app is installed or configuration changes.

**Why it happens:** Caddy holds a reference to the active configuration for each connection. When the config is reloaded, old connections must be closed to free the old config from memory. This is intentional behavior, documented in [Caddy issue #5471](https://github.com/caddyserver/caddy/issues/5471) and [#6420](https://github.com/caddyserver/caddy/issues/6420).

**Consequences:**
- User is actively browsing in KasmVNC viewer, installs another app from App Store, browser viewer disconnects
- Reconnection causes thundering herd if multiple users/sessions are active
- Perceived instability -- users think the browser feature is unreliable
- Loss of unsaved work in browser session (the browser itself keeps running, but the VNC viewer disconnects)

**Warning signs:**
- Browser viewer disconnects whenever Settings or App Store changes are made
- WebSocket close frames appear in browser devtools during Caddy reload
- Users report intermittent disconnections

**Prevention:**
1. Add `stream_close_delay` to the Caddy reverse proxy block for the browser subdomain:
   ```
   browser.example.com {
       reverse_proxy 127.0.0.1:3000 {
           stream_close_delay 5m
       }
   }
   ```
   This keeps WebSocket connections alive for 5 minutes after a config reload, giving the new config time to take over gracefully.
2. The current `generateFullCaddyfile()` in `caddy.ts` generates simple `reverse_proxy` blocks without any subdirectives. It must be extended to support `stream_close_delay` for specific subdomains.
3. KasmVNC client-side has built-in reconnection logic, but the user experience is still jarring. The `stream_close_delay` prevents this entirely.

**Phase:** Phase 2 (Caddy subdomain configuration). Requires modifying the Caddyfile generation in `caddy.ts`.

**Confidence:** HIGH -- verified via [Caddy reverse_proxy docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) and [GitHub issue #6420](https://github.com/caddyserver/caddy/issues/6420).

---

## Moderate Pitfalls

Mistakes that cause degraded functionality, hard-to-debug issues, or integration failures.

### Pitfall 5: Chromium SingletonLock After Container Crash

**What goes wrong:** When the Docker container is killed ungracefully (OOM killer, `docker kill`, host reboot, power loss), Chromium leaves a stale `SingletonLock` symlink in the profile directory at `/config/.config/chromium/SingletonLock`. On the next container start, Chromium sees this lock file, concludes another instance is running, and refuses to start. The container appears to be running but the browser never launches.

**Why it happens:** Chromium's `SingletonLock` is a symlink encoding `hostname-PID`. On container restart, the hostname and PID change, but the old lock file persists on the mounted volume because `/config` is a persistent Docker volume that survives container restarts (which is the entire point of persistent browser sessions).

**Consequences:**
- Browser does not launch after any ungraceful shutdown
- KasmVNC shows a desktop but no browser window
- Users must manually SSH in and delete lock files
- Contradicts the "persistent sessions that survive restarts" value proposition

**Warning signs:**
- Container starts but no Chromium window appears in KasmVNC
- Container logs show `SingletonLock` or "profile in use" errors
- Problem appears after `docker restart` or host reboot but not after clean `docker stop`

**Prevention:**
1. Add a startup script that deletes stale lock files before launching Chromium:
   ```bash
   rm -f /config/.config/chromium/SingletonLock
   rm -f /config/.config/chromium/SingletonSocket
   rm -f /config/.config/chromium/SingletonCookie
   ```
2. In a custom Dockerfile layer on top of linuxserver/chromium, add this cleanup to the entrypoint or use linuxserver's custom script mechanism (s6-overlay custom-cont-init.d scripts).
3. The `--restore-last-session` flag (already in CHROME_CLI) works correctly after lock cleanup, restoring all tabs.
4. For defense-in-depth, implement a health check that detects when the container is running but no Chromium process exists, and trigger automatic restart.

**Phase:** Phase 1 (custom Docker image). Straightforward but absolutely required for the persistent session feature.

**Confidence:** HIGH -- verified via [Chromium bug #612453](https://bugs.chromium.org/p/chromium/issues/detail?id=612453) and [jessfraz/dockerfiles issue #435](https://github.com/jessfraz/dockerfiles/issues/435).

---

### Pitfall 6: linuxserver/chromium Remote Debugging Port Breaks With Volume Mounts

**What goes wrong:** When the linuxserver/chromium container has `/config` volume mounted AND `--remote-debugging-port=9222` in CHROME_CLI, the debugging port becomes inaccessible from within the container. Attempting to query `localhost:9222/json/version` fails with "connection refused". Without the volume mount, it works fine.

**Why it happens:** This is a confirmed but not officially resolved issue ([linuxserver/docker-chromium issue #30](https://github.com/linuxserver/docker-chromium/issues/30)). The root cause appears to be related to how mounted volumes interact with Chromium's process initialization. The issue was closed as "not planned" by the maintainers.

**Consequences:**
- Playwright MCP cannot connect to the browser via CDP
- The entire AI automation feature is non-functional
- Volume mount is required for persistent sessions, so removing it is not an option
- This is a fundamental conflict between two core requirements (persistence + CDP access)

**Warning signs:**
- `curl http://localhost:9222/json/version` returns connection refused inside container
- Playwright MCP connection times out with "CDP endpoint unreachable"
- Works perfectly without volume mount, breaks with it

**Prevention:**
1. Build a custom Docker image that launches Chromium via `wrapped-chromium` or `xterm` directly with the debugging flags, bypassing the default entrypoint behavior that causes the conflict.
2. Alternative: Use `socat` as a relay inside the container to forward the debugging port.
3. Alternative: Start Chromium without `--remote-debugging-port` in CHROME_CLI, then use a custom init script to launch a separate debugging-enabled browser instance or connect to the running instance via D-Bus.
4. Test this exact combination (volume mount + CDP port) during Phase 1 before building any Playwright MCP integration that depends on it.

**Phase:** Phase 1 (Docker image). This is a blocking issue that must be validated and solved before Phase 3 (Playwright MCP integration).

**Confidence:** HIGH -- directly verified via [linuxserver/docker-chromium issue #30](https://github.com/linuxserver/docker-chromium/issues/30). The reporter confirmed "forked and fixed" independently.

---

### Pitfall 7: SOCKS5 Proxy DNS Leaks

**What goes wrong:** When configuring Chromium to use a SOCKS5 proxy (e.g., `--proxy-server="socks5://proxy:1080"`), DNS queries may still be resolved locally by the browser or the container's resolver, bypassing the proxy entirely. This leaks the user's intended browsing destinations to their ISP or local DNS provider, defeating the privacy purpose of using a proxy.

**Why it happens:** Chromium has multiple DNS resolution paths: the standard resolver, the DNS prefetcher, and speculative DNS resolution. While Chromium SOCKS5 natively resolves DNS proxy-side (unlike Firefox), the DNS prefetcher can issue local DNS requests proactively for links on the page.

**Consequences:**
- ISP can see which domains the user visits despite using a proxy
- Geo-unblocking fails because DNS reveals the real location
- Privacy-conscious users lose trust in the feature

**Warning signs:**
- DNS leak test sites (e.g., dnsleaktest.com) show local DNS servers
- `tcpdump` on the host shows DNS queries (port 53) from the container
- Websites detect the user's real location despite proxy configuration

**Prevention:**
1. Use the `--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE <proxy-host>"` flag alongside `--proxy-server` to force all DNS through the proxy:
   ```
   --proxy-server="socks5://proxy:1080" --host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE proxy"
   ```
2. Disable DNS prefetching with `--dns-prefetch-disable` flag.
3. Configure the container's DNS to use the proxy's DNS or a privacy-focused resolver (e.g., 1.1.1.1 or 9.9.9.9) as a fallback.
4. Document to users that DNS leak protection is only active when the proxy is configured -- without a proxy, DNS behaves normally.

**Phase:** Phase 2 (proxy configuration). Must be implemented when proxy support is added.

**Confidence:** MEDIUM -- verified via [Chromium SOCKS proxy design docs](https://www.chromium.org/developers/design-documents/network-stack/socks-proxy/) and community guides. The DNS prefetch leak vector is well-documented but the exact behavior may vary by Chromium version.

---

### Pitfall 8: Playwright MCP CDP Connection Timing Race

**What goes wrong:** When the browser container starts, Chromium takes several seconds to initialize. Playwright MCP tries to connect to the CDP endpoint (`http://chromium:9222`) before Chromium is ready, gets a connection refused error, and fails permanently. The MCP server does not automatically retry after initial connection failure.

**Why it happens:** Docker containers start in dependency order (`depends_on`), but `depends_on` only waits for the container to start, not for the service inside to be ready. Chromium inside the linuxserver/chromium container takes 5-15 seconds to initialize (display server, window manager, then Chromium itself). The Playwright MCP default CDP timeout is 30 seconds, which should be enough -- but only if the connection attempt starts after the container is up, not when the MCP server itself starts.

**Consequences:**
- AI browser automation is non-functional after system boot
- Intermittent connection failures on container restart
- Manual restart of MCP server required after browser container restart
- Race condition makes the issue non-deterministic and hard to reproduce

**Warning signs:**
- Playwright MCP logs show "CDP endpoint connection timeout" or "ECONNREFUSED"
- Browser automation works after manual MCP restart but not on boot
- `depends_on` is configured but still fails

**Prevention:**
1. Implement a health check on the browser container that verifies Chromium's CDP endpoint:
   ```yaml
   healthcheck:
     test: ["CMD", "curl", "-sf", "http://localhost:9222/json/version"]
     interval: 5s
     timeout: 3s
     retries: 10
     start_period: 15s
   ```
2. In the Nexus MCP config manager, implement retry-with-backoff for CDP connections using the `cdpTimeout` parameter (set to 60000ms for initial connection).
3. Use `depends_on` with `condition: service_healthy` (requires Docker Compose v2.1+):
   ```yaml
   playwright-mcp:
     depends_on:
       chromium:
         condition: service_healthy
   ```
4. Since Playwright MCP is auto-registered via LivOS hooks (per PROJECT.md), the registration hook should verify CDP connectivity before marking the MCP server as available.

**Phase:** Phase 3 (Playwright MCP integration). Must be solved for reliable AI automation.

**Confidence:** MEDIUM -- based on [Playwright MCP docs](https://github.com/microsoft/playwright-mcp) confirming 30s default timeout and standard Docker container readiness patterns. The exact retry behavior of Playwright MCP when CDP is unavailable is not fully documented.

---

### Pitfall 9: Browser Container Consumes All VPS Memory

**What goes wrong:** Chromium is notoriously memory-hungry. Without Docker resource limits, a browser container with several tabs open can consume 2-4GB of RAM, starving other LivOS services (Redis, PostgreSQL, Nexus AI, other Docker apps). The Linux OOM killer then terminates random processes -- potentially killing the database or AI service instead of the browser.

**Why it happens:** LivOS runs on VPS with 4-8GB RAM total. The system already runs Caddy, Redis, PostgreSQL, Nexus (Node.js), and potentially Firecrawl (with its own 2GB limit) and other user-installed apps. Chromium's per-tab memory ranges from 50-300MB, and a user with 10+ tabs can easily hit 2GB+. Without explicit limits, Docker allows containers to use all available host memory.

**Consequences:**
- OOM killer terminates Redis (data loss) or PostgreSQL (corruption risk)
- All Docker containers restart simultaneously
- System becomes unresponsive, SSH access lost
- VPS provider may auto-reboot the server

**Warning signs:**
- `docker stats` shows browser container using >50% of total RAM
- `dmesg` shows OOM killer activity
- Other containers restart unexpectedly
- Host `free -m` shows near-zero available memory

**Prevention:**
1. Set hard memory limits in docker-compose.yml:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G
         cpus: '1.5'
       reservations:
         memory: 512M
         cpus: '0.5'
   ```
2. For a 4GB VPS, limit the browser container to 1.5GB max. For 8GB, limit to 2.5GB.
3. Add Chromium flags to limit memory usage:
   ```
   --max-old-space-size=512 --renderer-process-limit=4 --disable-gpu
   ```
   `--renderer-process-limit=4` caps the number of renderer processes (tabs share renderers).
4. Implement a monitoring/alerting hook in the LivOS system health dashboard to show browser container memory usage.
5. Consider implementing a tab limit warning in the frontend viewer component.

**Phase:** Phase 1 (Docker compose) for limits, Phase 4 (frontend) for monitoring/warnings.

**Confidence:** HIGH -- verified via [Docker resource constraints docs](https://docs.docker.com/engine/containers/resource_constraints/) and [Chromium memory backgrounder](https://www.chromium.org/developers/memory-usage-backgrounder/).

---

### Pitfall 10: Volume Permissions Mismatch for Browser Profile

**What goes wrong:** The linuxserver/chromium container uses PUID/PGID environment variables (default 1000:1000) to set the user identity for file operations. If the host directory mounted at `/config` has different ownership (e.g., root:root from a previous container run or from manual creation), Chromium cannot write to its profile directory. This causes silent failures: no bookmarks saved, no sessions persisted, no cookies stored, extensions lost on restart.

**Why it happens:** LivOS creates app data directories in `apps.ts` with `fse.mkdirp(appDataDirectory)`. The directory is created by the livinityd process, which may run as root or a different user than PUID 1000. Docker bind mounts preserve host permissions. If the mounted directory is owned by root, the container process (running as UID 1000) cannot write to it.

**Consequences:**
- "Persistent sessions" feature silently fails -- sessions appear to persist but are lost on restart
- Chromium shows "your profile could not be opened correctly" warnings
- Extensions, bookmarks, and login sessions not saved
- Users blame the feature for being broken but the container runs fine

**Warning signs:**
- `docker exec <container> ls -la /config` shows root:root ownership
- Chromium profile directory is empty or missing expected files after container restart
- "Failed to create directory" errors in container logs
- Works the first time (Docker creates volume with correct permissions) but fails after backup restore or manual directory creation

**Prevention:**
1. In the LivOS app install flow (`apps.ts`), explicitly set ownership after creating the data directory:
   ```bash
   chown -R 1000:1000 /path/to/app-data/chromium
   ```
2. Set PUID and PGID in the Docker compose config to match the host user:
   ```yaml
   environment:
     - PUID=1000
     - PGID=1000
   ```
3. Use linuxserver's s6-overlay init scripts which handle permission fixing on startup, but verify they work with bind mounts (not just named volumes).
4. Add a post-install verification step that checks write permissions inside the container.
5. After backup restore, the `reinstallMissingAppsAfterRestore()` flow in `apps.ts` must also fix permissions.

**Phase:** Phase 1 (Docker image + app install flow).

**Confidence:** HIGH -- verified via [LinuxServer docs](https://docs.linuxserver.io/images/docker-chromium/), Docker community discussions on [volume permissions](https://forums.docker.com/t/how-to-mount-a-docker-volume-so-as-writeable-by-a-non-root-user-within-the-container/144321), and analysis of existing `apps.ts` code.

---

## Minor Pitfalls

Mistakes that cause annoyance, poor UX, or technical debt but are fixable without major rework.

### Pitfall 11: Anti-Detection Flags Conflict with Browser Stability

**What goes wrong:** The CHROME_CLI in `builtin-apps.ts` includes `--disable-blink-features=AutomationControlled` and `--disable-infobars`. Adding more anti-detection flags (e.g., `--disable-extensions`, `--disable-default-apps`, `--no-first-run`, modified user-agent strings) can conflict with each other or with KasmVNC's display requirements, causing rendering glitches, missing UI elements, or extension incompatibility.

**Why it happens:** Anti-detection flags are designed for headless automation, not for interactive GUI browsing. Some flags that help avoid bot detection also disable features users need (like extensions). The `--disable-blink-features=AutomationControlled` flag itself is well-known and [actively detected by advanced anti-bot systems](https://github.com/nicedoc/browser-logos/refs/heads/main/src/chromium/chromium.svg) as a signal that the browser is trying to hide automation.

**Prevention:**
1. Keep anti-detection flags minimal for interactive use: only `--disable-blink-features=AutomationControlled` and `--disable-infobars`.
2. Do NOT add `--disable-extensions` (breaks user-installed extensions).
3. Do NOT modify the user-agent string globally -- let users configure this per-session if needed.
4. Test all flag combinations with KasmVNC rendering before deployment.
5. Document which flags are for anti-detection vs. which are for stability (e.g., `--disable-dev-shm-usage` is stability, not anti-detection).

**Phase:** Phase 1 (Docker image configuration).

**Confidence:** MEDIUM -- based on community discussions and [ZenRows analysis](https://www.zenrows.com/blog/disable-blink-features-automationcontrolled).

---

### Pitfall 12: Caddy Subdomain Block Missing WebSocket-Specific Config

**What goes wrong:** The current `generateFullCaddyfile()` in `caddy.ts` generates simple `reverse_proxy 127.0.0.1:{port}` blocks with no subdirectives. While Caddy v2 handles WebSocket upgrades automatically (unlike v1), KasmVNC requires specific header configurations for proper operation behind a reverse proxy: `X-Forwarded-Port`, TLS skip verify for HTTPS upstreams, and timeouts tuned for long-lived VNC connections.

**Why it happens:** Other LivOS apps (n8n, Portainer, Gitea) work fine with simple reverse proxy blocks because they use standard HTTP request-response patterns. KasmVNC uses persistent WebSocket streams that need header passthrough and extended timeouts.

**Prevention:**
1. Extend `generateFullCaddyfile()` to support per-subdomain configuration options, not just port numbers.
2. For the browser subdomain, generate a Caddy block with:
   ```
   browser.example.com {
       reverse_proxy 127.0.0.1:3000 {
           header_up X-Forwarded-Port {http.request.port}
           stream_close_delay 5m
       }
   }
   ```
3. The `SubdomainConfig` interface in `caddy.ts` needs to be extended with optional config fields like `streamCloseDelay`, `headers`, etc.
4. Do NOT add `tls_insecure_skip_verify` unless proxying to HTTPS port 3001 (prefer HTTP port 3000 for internal traffic).

**Phase:** Phase 2 (Caddy configuration). Requires refactoring `caddy.ts` to support richer per-app proxy config.

**Confidence:** HIGH -- verified via [Kasm reverse proxy docs](https://www.kasmweb.com/docs/develop/how_to/reverse_proxy.html) and [Caddy community thread](https://caddy.community/t/caddyfile-config-for-kasm-websocket/20516).

---

### Pitfall 13: Playwright MCP Name Collision with Reserved Names

**What goes wrong:** When auto-registering the Playwright MCP server in the Nexus MCP config manager, the chosen name must not collide with reserved names. The `McpConfigManager` in `mcp-config-manager.ts` blocks names in the `RESERVED_NAMES` set (including `shell`, `docker`, `files`, `scrape`, `web`, `agent`). Choosing a name like `web` or `agent` for the browser MCP will fail silently or with a confusing error.

**Why it happens:** The reserved names list was designed before the browser app feature was planned. Names like `browser` are not reserved, but if someone chose `web` or `scrape` they would hit the validation.

**Prevention:**
1. Use the name `playwright-browser` or `browser-mcp` for the auto-registered MCP server.
2. Verify the chosen name is not in the RESERVED_NAMES set before implementing auto-registration.
3. Add clear error messaging if registration fails due to name collision.

**Phase:** Phase 3 (Playwright MCP auto-registration).

**Confidence:** HIGH -- verified by direct code inspection of `mcp-config-manager.ts`.

---

### Pitfall 14: Nextcloud Port Collision

**What goes wrong:** The Nextcloud builtin app in `builtin-apps.ts` is configured with port 8080. The linuxserver/chromium container documentation states that port 3000 (HTTP) and 3001 (HTTPS) are the container ports. However, if the published host port is not carefully assigned, it could collide with the LivOS main UI port (also 8080 as shown in `generateFullCaddyfile()`). The current Chromium app uses port 6901, but the linuxserver docs say the actual container listens on 3000/3001 -- port 6901 appears to be from older KasmVNC versions.

**Why it happens:** Port confusion between the container's internal port and the mapped host port. The builtin-apps manifest specifies port 6901 for Chromium, but linuxserver/chromium actually exposes 3000 (HTTP) and 3001 (HTTPS).

**Prevention:**
1. Verify the correct container port for linuxserver/chromium -- it is 3000 (HTTP) or 3001 (HTTPS), NOT 6901.
2. Update the port in `builtin-apps.ts` from 6901 to 3000 (for HTTP through Caddy).
3. Ensure the host port mapping in docker-compose does not collide with other services.
4. Test with `docker exec <container> netstat -tlnp` to verify which ports the container actually listens on.

**Phase:** Phase 1 (Docker compose + manifest fix).

**Confidence:** HIGH -- verified via [linuxserver/chromium docs](https://docs.linuxserver.io/images/docker-chromium/) which explicitly state ports 3000 and 3001.

---

## Integration Pitfalls with Existing LivOS System

Issues specific to adding the browser app to the existing LivOS architecture.

### Pitfall 15: App Install Flow Not Designed for Complex Docker Configs

**What goes wrong:** The current `BuiltinAppManifest` interface in `builtin-apps.ts` supports basic Docker config: `image`, `environment`, `volumes`. But the browser container requires `shm_size`, `deploy.resources.limits`, `healthcheck`, `security_opt`, and potentially `cap_add` for Chromium sandboxing. The install flow in `apps.ts` does not handle these advanced Docker Compose options.

**Why it happens:** The builtin app system was designed for simple single-container apps (n8n, Portainer, Gitea). The browser app is the first builtin app requiring complex Docker configuration.

**Consequences:**
- Browser container launches without shm_size (crashes -- Pitfall 3)
- No memory limits (OOM -- Pitfall 9)
- No health checks (CDP timing -- Pitfall 8)
- Must either extend the manifest schema or hardcode browser-specific logic

**Prevention:**
1. Extend `BuiltinAppManifest.docker` to support:
   ```typescript
   docker: {
     image: string;
     environment?: Record<string, string>;
     volumes?: string[];
     shmSize?: string;        // NEW
     memoryLimit?: string;    // NEW
     cpuLimit?: string;       // NEW
     healthcheck?: {          // NEW
       test: string[];
       interval: string;
       timeout: string;
       retries: number;
     };
     securityOpt?: string[];  // NEW
   }
   ```
2. Update the Docker container creation logic in the app install flow to apply these options.
3. Alternative: Keep the manifest simple and use a custom docker-compose.yml template for complex apps. The app install flow already supports `docker-compose.yml` templates for community apps.

**Phase:** Phase 1 (Docker infrastructure).

**Confidence:** HIGH -- direct code inspection of `builtin-apps.ts` and `apps.ts`.

---

### Pitfall 16: Caddy Generation Does Not Support Per-App Config

**What goes wrong:** The `generateFullCaddyfile()` function in `caddy.ts` generates identical `reverse_proxy` blocks for all subdomains. The browser app needs `stream_close_delay`, custom headers, and potentially `forward_auth`. There is no mechanism to attach per-app Caddy configuration.

**Why it happens:** The subdomain system was designed for uniform reverse proxy blocks. All existing apps only need basic HTTP proxying.

**Prevention:**
1. Extend `SubdomainConfig` interface:
   ```typescript
   export interface SubdomainConfig {
     subdomain: string;
     appId: string;
     port: number;
     enabled: boolean;
     caddyConfig?: {           // NEW
       streamCloseDelay?: string;
       headers?: Record<string, string>;
       forwardAuth?: string;
     };
   }
   ```
2. Update `generateFullCaddyfile()` to render these options.
3. The browser app registers with `caddyConfig: { streamCloseDelay: '5m' }`.

**Phase:** Phase 2 (Caddy integration).

**Confidence:** HIGH -- direct code inspection of `caddy.ts`.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| Phase 1: Docker Image | /dev/shm too small (P3) | Critical | `shm_size: "1gb"` in compose |
| Phase 1: Docker Image | SingletonLock stale files (P5) | Moderate | Cleanup script in entrypoint |
| Phase 1: Docker Image | CDP + volume mount conflict (P6) | Moderate | Custom Dockerfile workaround |
| Phase 1: Docker Image | Wrong port in manifest (P14) | Moderate | Change 6901 to 3000 |
| Phase 1: Docker Compose | No resource limits (P9) | Critical | memory: 2G, cpus: 1.5 |
| Phase 1: Docker Compose | Manifest too simple (P15) | Moderate | Extend BuiltinAppManifest |
| Phase 2: Caddy Config | WebSocket killed on reload (P4) | Critical | stream_close_delay 5m |
| Phase 2: Caddy Config | No per-app config (P16) | Moderate | Extend SubdomainConfig |
| Phase 2: Proxy Support | DNS leaks with SOCKS5 (P7) | Moderate | --host-resolver-rules flag |
| Phase 3: Playwright MCP | CDP connection race (P8) | Moderate | Health check + retry |
| Phase 3: Playwright MCP | MCP name collision (P13) | Minor | Use "playwright-browser" name |
| Phase 4: Frontend | No auth on KasmVNC (P2) | Critical | LivOS JWT auth via forward_auth |
| Phase 4: Frontend | CDP port exposed (P1) | Critical | Never publish port 9222 |
| Phase 1: Docker Image | Volume permissions (P10) | Moderate | chown 1000:1000 in install flow |
| Phase 1: Docker Image | Anti-detection flag conflicts (P11) | Minor | Minimal flag set |

---

## LivOS-Specific Risk Summary

### Highest Risk: Security

The combination of CDP remote debugging (P1) and unauthenticated KasmVNC (P2) means the browser app introduces two separate full-compromise attack vectors if misconfigured. Both must be addressed before any internet exposure.

### Second Highest Risk: Resource Exhaustion

On a 4GB VPS already running LivOS core services, an unconstrained Chromium container (P9) combined with insufficient shared memory (P3) will crash the entire system. The existing Firecrawl worker already reserves 2GB (per `nexus/deploy/docker-compose.yml`). Adding an uncapped browser container on a 4GB VPS is not viable without strict limits.

### Third Highest Risk: Integration Complexity

The existing app infrastructure (`builtin-apps.ts`, `caddy.ts`, `apps.ts`) was designed for simple HTTP apps. The browser app needs advanced Docker config (P15), rich Caddy config (P16), WebSocket persistence (P4), and lifecycle hooks for MCP registration (P8, P13). This is not a "drop another app in the store" task -- it requires extending the app infrastructure itself.

---

## Sources

### Official Documentation (HIGH confidence)
- [LinuxServer Chromium Docker Image](https://docs.linuxserver.io/images/docker-chromium/)
- [Chrome Developer Blog: Remote Debugging Security Changes](https://developer.chrome.com/blog/remote-debugging-port)
- [Caddy reverse_proxy directive](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Kasm Reverse Proxy Configuration](https://www.kasmweb.com/docs/develop/how_to/reverse_proxy.html)
- [Docker Resource Constraints](https://docs.docker.com/engine/containers/resource_constraints/)
- [Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [Chromium SOCKS Proxy Design](https://www.chromium.org/developers/design-documents/network-stack/socks-proxy/)

### Security Advisories (HIGH confidence)
- [LinuxServer.io KasmVNC Security PSA](https://info.linuxserver.io/issues/2024-10-06-securing-kasm/)
- [SpecterOps: Cookie Dumping via Remote Debugger](https://posts.specterops.io/hands-in-the-cookie-jar-dumping-cookies-with-chromiums-remote-debugger-port-34c4f468844e)
- [Embrace The Red: Chrome Remote Control Post-Exploitation](https://embracethered.com/blog/posts/2020/chrome-spy-remote-control/)

### Bug Reports and Issues (HIGH confidence)
- [Chromium Bug #715363: /dev/shm too small](https://issues.chromium.org/issues/40517415)
- [Chromium Bug #612453: Bogus SingletonLock](https://bugs.chromium.org/p/chromium/issues/detail?id=612453)
- [linuxserver/docker-chromium Issue #30: CDP + volume conflict](https://github.com/linuxserver/docker-chromium/issues/30)
- [Caddy Issue #5471: WebSocket close on config reload](https://github.com/caddyserver/caddy/issues/5471)
- [Caddy Issue #6420: Active WebSocket closed on reload](https://github.com/caddyserver/caddy/issues/6420)

### Codebase Analysis (HIGH confidence)
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` -- Chromium app manifest
- `livos/packages/livinityd/source/modules/domain/caddy.ts` -- Caddyfile generation
- `livos/packages/livinityd/source/modules/apps/apps.ts` -- App install flow
- `nexus/packages/core/src/mcp-config-manager.ts` -- MCP server registration
- `nexus/deploy/docker-compose.yml` -- Existing shm_size pattern

---

*Last Updated: 2026-02-07*
*Research compiled for LivOS v1.3 Browser App milestone*
