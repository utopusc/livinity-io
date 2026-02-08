# Technology Stack: Browser App (v1.3)

**Project:** LivOS Browser App
**Researched:** 2026-02-07
**Overall confidence:** HIGH (verified against official docs and existing codebase)

## Critical Discovery: KasmVNC Has Been Replaced by Selkies

The PROJECT.md and existing builtin-apps.ts reference "KasmVNC" but LinuxServer.io rebased all desktop container images (including `linuxserver/chromium`) from KasmVNC to **Selkies GStreamer** as of mid-2025. The `latest` tag now uses Selkies, not KasmVNC.

**Impact:**
- Higher performance (WebRTC + WebCodecs instead of VNC over WebSocket)
- HTTPS is now mandatory (HTTP access no longer works for the web viewer)
- Web client uses WebRTC streaming, not traditional VNC iframe embedding
- Authentication model is the same (HTTP Basic Auth via `CUSTOM_USER`/`PASSWORD`)
- Embedding approach remains iframe-based through the container's built-in NGINX

**Recommendation:** Update all references from "KasmVNC" to "Selkies" in documentation. The integration approach remains the same (iframe to the container's web UI), but the underlying technology is different and more performant.

**Confidence:** HIGH -- verified via [LinuxServer docs](https://docs.linuxserver.io/images/docker-chromium/), [baseimage-selkies docs](https://docs.linuxserver.io/images/docker-baseimage-selkies/), and [Spring Cleaning announcement](https://www.linuxserver.io/blog/spring-cleaning-new-images-and-rebasing).

---

## Recommended Stack

### 1. Docker Image: linuxserver/chromium

| Property | Value | Rationale |
|----------|-------|-----------|
| Image | `lscr.io/linuxserver/chromium:latest` | Official LinuxServer image, Selkies-based, actively maintained |
| Base | `baseimage-selkies:debiantrixie` | Debian Trixie with Selkies GStreamer web streaming |
| Internal HTTP Port | 3000 | Configurable via `CUSTOM_PORT` |
| Internal HTTPS Port | 3001 | Configurable via `CUSTOM_HTTPS_PORT` (required for Selkies access) |
| Internal WS Port | 8082 | Configurable via `CUSTOM_WS_PORT` |
| Shared Memory | `shm_size: 1gb` | **Required** for modern websites to function |

**Already in codebase:** The existing `builtin-apps.ts` already has a chromium entry (line 240-263). However, it uses port 6901 (old KasmVNC port) and needs updating to 3001 (Selkies HTTPS port).

**Environment Variables:**

```yaml
environment:
  PUID: 1000
  PGID: 1000
  TZ: "${TZ:-Etc/UTC}"
  CUSTOM_USER: ""          # Set during install, empty = no auth
  PASSWORD: ""             # Set during install, empty = no auth
  CHROME_CLI: >-
    --remote-debugging-port=9222
    --remote-debugging-address=0.0.0.0
    --remote-allow-origins=*
    --restore-last-session
    --disable-blink-features=AutomationControlled
    --disable-infobars
    --disable-dev-shm-usage
    --no-first-run
```

**Confidence:** HIGH -- verified via [official LinuxServer chromium docs](https://docs.linuxserver.io/images/docker-chromium/).

### 2. Playwright MCP Server: @playwright/mcp

| Property | Value | Rationale |
|----------|-------|-----------|
| Package | `@playwright/mcp` | Official Microsoft Playwright MCP server |
| Version | `0.0.56+` (latest) | Active development, CDP endpoint support confirmed |
| Transport | `stdio` | Matches existing Nexus MCP client manager (StdioClientTransport) |
| Key Flag | `--cdp-endpoint` | Connects to running Chromium via Chrome DevTools Protocol |

**MCP Config for Nexus registration:**

```json
{
  "name": "browser",
  "transport": "stdio",
  "command": "npx",
  "args": [
    "-y",
    "@playwright/mcp@latest",
    "--cdp-endpoint",
    "http://<chromium-container-ip>:9222"
  ],
  "env": {},
  "enabled": true,
  "description": "Browser automation via Playwright CDP"
}
```

**Integration with existing MCP system:**
- Nexus `McpClientManager` already supports `stdio` transport with `npx` in the allowlist (line 28-29 of `mcp-client-manager.ts`)
- The `McpConfigManager` handles config storage in Redis (`nexus:mcp:config`)
- Tools auto-register as `mcp_browser_*` in the ToolRegistry
- Config changes trigger reconciliation via Redis pub/sub (`nexus:config:updated`)

**CDP Connection Approach:**
1. Chromium container starts with `--remote-debugging-port=9222`
2. Port 9222 is exposed on the Docker bridge network (NOT to host)
3. Playwright MCP connects via `http://<container_ip>:9222`
4. Container IP retrieved via existing `app.getContainerIp(service)` method

**Additional @playwright/mcp options worth noting:**
- `--cdp-header <headers...>` -- custom headers with CDP connect request
- `--cdp-timeout <ms>` -- connection timeout (default 30000ms, set 0 to disable)
- `--browser chrome` -- browser type selection
- `--headless` -- NOT needed since we connect to existing browser via CDP

**Known issue:** [GitHub issue #30](https://github.com/linuxserver/docker-chromium/issues/30) reports remote-debugging-port may conflict with volume mounts in some scenarios. The user who reported it "forked and fixed" it. Many other users report it works fine. Monitor during development and add a custom init script only if needed.

**Confidence:** HIGH for `@playwright/mcp` capabilities -- verified via [npm registry](https://www.npmjs.com/package/@playwright/mcp) and [GitHub](https://github.com/microsoft/playwright-mcp). MEDIUM for CDP reliability with linuxserver/chromium specifically.

### 3. Proxy Configuration for Chromium

| Approach | How | When |
|----------|-----|------|
| Chromium CLI flags | `--proxy-server="socks5://host:port"` | Recommended, most reliable in Docker |
| Bypass list | `--proxy-bypass-list="localhost;127.0.0.1"` | Always pair with proxy-server |
| DNS via proxy | `--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE proxyhost"` | SOCKS5 only, prevents DNS leaks |

**Implementation:**
- Proxy settings are injected via the `CHROME_CLI` environment variable
- The existing `builtin-apps.ts` already supports `docker.environment` overrides
- Proxy config should be a user-facing setting in the browser app's settings panel
- Container restart required to apply proxy changes (Chromium reads flags at launch)

**SOCKS5 proxy example (full CHROME_CLI):**
```
--proxy-server="socks5://proxy-host:1080"
--proxy-bypass-list="localhost;127.0.0.1;*.local"
--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE proxy-host"
--remote-debugging-port=9222
--remote-debugging-address=0.0.0.0
--remote-allow-origins=*
--restore-last-session
--disable-blink-features=AutomationControlled
--disable-infobars
--disable-dev-shm-usage
```

**HTTP proxy example:**
```
--proxy-server="http://proxy-host:8080"
```

**Why CLI flags over environment variables:** [Chromium proxy docs](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md) confirm `--proxy-server` overrides all other proxy settings. Docker environment variables like `http_proxy` are unreliable in Chromium containers ([confirmed by Selenium issue #2953](https://github.com/SeleniumHQ/docker-selenium/issues/2953)).

**Confidence:** HIGH -- verified via [official Chromium proxy documentation](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md).

### 4. Custom Docker Image Build Support

**Current state:** The LivOS install flow ALREADY supports Dockerfile builds.

Evidence from `app-script` line 492:
```bash
compose "${app}" up --detach --build
```

And from `app-environment.ts` line 43:
```typescript
docker compose --project-name livinity --file ${composePath} ${command} --build --detach --remove-orphans
```

**What this means:** If the browser app's `docker-compose.yml` includes a `build:` directive with a `Dockerfile`, the existing install flow will build it automatically. No new infrastructure needed.

**Custom Dockerfile approach (only if needed):**

```dockerfile
FROM lscr.io/linuxserver/chromium:latest

# Custom chromium preferences for anti-detection
COPY chromium-preferences.json /defaults/chromium-preferences.json

# Custom startup wrapper (if needed for remote-debugging-port fix)
COPY custom-init.sh /custom-cont-init.d/99-browser-init
```

**Recommendation:** Start with the plain `lscr.io/linuxserver/chromium:latest` image (no custom Dockerfile). Only add a custom Dockerfile if we encounter the remote-debugging-port issue or need additional packages. Keep it simple.

**Confidence:** HIGH -- verified by reading existing codebase (`app-script`, `app.ts`, `app-environment.ts`).

### 5. Caddy Reverse Proxy for Browser App

**Current Caddy integration:** The existing `caddy.ts` generates simple `reverse_proxy` blocks:

```
browser.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

**Required enhancement for Selkies:** Caddy v2 automatically handles WebSocket upgrades -- no special configuration needed. However, the Selkies container uses a self-signed HTTPS certificate internally, so the reverse_proxy needs TLS skip verification when proxying to the HTTPS port.

**Updated Caddyfile block needed:**

```
browser.${mainDomain} {
    reverse_proxy 127.0.0.1:${port} {
        transport http {
            tls_insecure_skip_verify
        }
    }
}
```

**Changes to `caddy.ts`:** The `generateFullCaddyfile` function (line 48) currently generates simple `reverse_proxy` blocks. For the browser app, it needs to handle the `tls_insecure_skip_verify` option since the Selkies container serves HTTPS internally.

**Two approaches:**
1. **Proxy to HTTP port 3000** -- Simpler, avoids TLS skip. May work if Selkies still serves HTTP. Needs testing.
2. **Proxy to HTTPS port 3001 with tls_insecure_skip_verify** -- Recommended, guaranteed to work with Selkies.

**Recommendation:** Extend `SubdomainConfig` interface to include an optional `tlsBackend: boolean` flag. When true, generate `transport http { tls_insecure_skip_verify }` in the Caddyfile block. Set it for the browser app only.

**WebSocket:** Caddy v2 handles WebSocket upgrade automatically. Unlike nginx where you need explicit upgrade headers, Caddy detects WebSocket connections and proxies them transparently. No additional configuration needed. Verified via [Caddy docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

**Confidence:** HIGH for Caddy WebSocket support. MEDIUM for the exact Selkies reverse proxy approach (test both HTTP and HTTPS during development).

### 6. Frontend: iframe Embedding in LivOS Window System

**Approach:** Embed the Selkies web viewer via iframe in a LivOS window.

**Existing pattern:** The codebase already has iframe embedding in `marketplace-app-window.tsx` (line 101-108). This same pattern works for the browser viewer.

**Browser viewer component structure:**

```tsx
<iframe
  src={`https://browser.${domain}`}
  className="absolute inset-0 h-full w-full border-0"
  title="Browser"
  allow="autoplay; microphone; camera; clipboard-read; clipboard-write"
/>
```

**Authentication handling:**
- Selkies uses HTTP Basic Auth via `CUSTOM_USER`/`PASSWORD` environment variables
- When accessed via subdomain through Caddy, the browser will prompt for Basic Auth if credentials are set
- **Recommended approach:** Disable Selkies-level auth entirely (set empty/no user and password). The app is already behind LivOS authentication (JWT-based) and Caddy HTTPS. The Selkies auth is described by LinuxServer as a convenience to "keep the kids out not the internet"
- Alternative: Generate a deterministic password using the existing `app.deriveDeterministicPassword()` method and embed credentials in the iframe URL

**iframe permissions needed:**
- `autoplay` -- for potential audio
- `clipboard-read`, `clipboard-write` -- clipboard passthrough between LivOS and browser
- `camera`, `microphone` -- optional, only if webcam/mic passthrough desired

**Cross-origin considerations:**
- With subdomain routing (browser.example.com), the iframe is cross-origin from the main LivOS UI (example.com)
- This is fine for Selkies -- it renders independently
- No postMessage communication needed (unlike the marketplace iframe)
- The `IframeChecker` component in `iframe-checker.tsx` prevents LivOS itself from being embedded, but does not affect outgoing iframes

**Current app launch flow:** The existing `useLaunchApp` hook (line 51) opens apps in a new tab via `window.open(url, '_blank')`. For the browser app, we should also support inline iframe viewing within the LivOS window system (similar to marketplace-app-window).

**Confidence:** HIGH -- the existing `marketplace-app-window.tsx` proves the iframe pattern works in the LivOS window system.

---

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| Full Kasm Workspaces | Overkill. LinuxServer's single-container image provides everything needed without the multi-container Kasm orchestration layer |
| noVNC / guacamole | Outdated. Selkies (WebRTC) is faster and more capable than VNC-based approaches |
| Custom VNC client library | Unnecessary. The container serves its own web client at ports 3000/3001 |
| `@mseep/mcp-playwright-cdp` | Community fork. Use official `@playwright/mcp` which now has native `--cdp-endpoint` support |
| `lars-hagen/mcp-playwright-cdp` | Same reason. The official Microsoft package supersedes community forks |
| Playwright inside the container | Run Playwright MCP on the host (Nexus side). It connects to Chromium via CDP over the Docker network. Simpler, less resource usage, no Playwright browser download needed |
| TURN server | Not needed for Docker bridge networking. LinuxServer's Selkies wrapper handles streaming internally via built-in NGINX. TURN is only needed for raw Selkies-GStreamer deployments across NAT boundaries |
| Puppeteer | Playwright MCP is the standard for MCP integration. Puppeteer has no MCP server |
| Separate proxy container (e.g., gluetun) | Overcomplicated for browser-only proxy. Chromium's `--proxy-server` flag handles SOCKS5/HTTP proxy directly. Consider gluetun only if user wants VPN for ALL container traffic |
| Playwright browser extension method | The `--extension` flag requires installing a browser extension and is designed for connecting to desktop browsers, not headless/container instances. CDP endpoint is the correct approach for Docker containers |

---

## Integration Points with Existing LivOS

| Existing System | How Browser App Connects | Changes Needed |
|----------------|--------------------------|----------------|
| `builtin-apps.ts` | Already has chromium entry (line 240-263) | Update port 6901 to 3001, add `shm_size`, update env vars, add `security_opt` |
| `app.ts` install flow | Works as-is, `--build` flag handles Dockerfiles | None |
| `patchComposeFile()` | Will add port mapping and container naming | None (existing logic handles it) |
| `caddy.ts` | Needs TLS skip option for Selkies HTTPS backend | Add `tlsBackend` flag to SubdomainConfig |
| `McpConfigManager` | Use `installServer()` to register Playwright MCP | Call from post-start hook script |
| `McpClientManager` | Auto-connects when config changes via Redis pub/sub | None (existing reconciliation handles it) |
| App hooks (`post-start`, `pre-stop`) | Register/deregister MCP server config | Create hook scripts in app template |
| Docker network (`livinity_main_network`) | Chromium container joins automatically | None (common compose handles it) |
| `app.getContainerIp(service)` | Retrieve chromium container IP for CDP endpoint | Call during MCP registration to get dynamic IP |
| `BuiltinAppManifest` interface | Needs extending for `shm_size` and `security_opt` | Add optional fields to interface |

---

## Installation Requirements

```bash
# No new npm packages needed for the backend
# Playwright MCP runs via npx (already in ALLOWED_COMMANDS list)

# The only "install" is the Docker image pull during app install:
docker pull lscr.io/linuxserver/chromium:latest
# Approximate image size: ~1.5GB (Debian + Chromium + Selkies)

# @playwright/mcp is fetched on-demand by npx during MCP connection
# No pre-installation needed
```

---

## docker-compose.yml for Browser App

This is the target compose file that would live in the app template directory:

```yaml
services:
  server:
    image: lscr.io/linuxserver/chromium:latest
    container_name: chromium_server_1
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=${TZ:-Etc/UTC}
      - CUSTOM_USER=
      - PASSWORD=
      - CHROME_CLI=--remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --remote-allow-origins=* --restore-last-session --disable-blink-features=AutomationControlled --disable-infobars --disable-dev-shm-usage --no-first-run
    volumes:
      - ${APP_DATA_DIR}/config:/config
    ports:
      - "${APP_PORT:-6901}:3001"
    shm_size: "1gb"
    security_opt:
      - seccomp=unconfined
    restart: unless-stopped
    networks:
      default:
        aliases:
          - chromium
```

**Port mapping notes:**
- Internal port 3001 (HTTPS) maps to host port (set by manifest `port` field)
- Port 9222 (CDP) stays internal to Docker network only -- NOT exposed to host
- Port 3000 (HTTP) not mapped -- HTTPS is required for Selkies
- `shm_size: 1gb` is mandatory for modern websites (YouTube, etc.)
- `seccomp=unconfined` is required by Chromium-based applications per LinuxServer docs

---

## App Hooks for MCP Registration

**post-start hook** (`hooks/post-start`):
```bash
#!/bin/bash
# Register Playwright MCP server with Nexus
# Get the chromium container IP on the Docker network
CONTAINER_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' chromium_server_1)

# Register MCP config via Nexus API or Redis
# (Exact mechanism depends on how hooks can communicate with Nexus)
```

**pre-stop hook** (`hooks/pre-stop`):
```bash
#!/bin/bash
# Deregister Playwright MCP server from Nexus
```

**Alternative to hooks:** Instead of bash hooks, register/deregister MCP config directly in the `App.start()` and `App.stop()` methods in `app.ts` by checking if the app is `chromium` and calling `McpConfigManager.installServer()` / `removeServer()` programmatically.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Docker image | linuxserver/chromium | kasmweb/chromium | LinuxServer actively maintained, better LSIO ecosystem compatibility |
| Web streaming | Selkies (latest) | KasmVNC (pinned old tag) | KasmVNC is deprecated in linuxserver images, Selkies is successor |
| Browser automation MCP | @playwright/mcp (official) | executeautomation/mcp-playwright | Official Microsoft package, better maintained, native CDP support |
| Proxy approach | Chrome CLI flags | gluetun sidecar container | Simpler, no extra container, user-configurable per restart |
| Embedding | iframe to subdomain | WebSocket client library | Container provides full web client, no custom client needed |
| Auth | Disable container auth, rely on LivOS | Keep container Basic Auth | Double-auth is bad UX; LivOS auth via JWT is sufficient |

---

## Sources

### HIGH Confidence (Official Documentation)
- [LinuxServer Chromium Docs](https://docs.linuxserver.io/images/docker-chromium/)
- [LinuxServer baseimage-selkies Docs](https://docs.linuxserver.io/images/docker-baseimage-selkies/)
- [Chromium Proxy Configuration](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md)
- [Microsoft Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [Caddy reverse_proxy Docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- Existing codebase: `builtin-apps.ts`, `app.ts`, `app-script`, `caddy.ts`, `mcp-client-manager.ts`, `mcp-config-manager.ts`

### MEDIUM Confidence (Verified via multiple sources)
- [LinuxServer Spring Cleaning Blog (Selkies rebase)](https://www.linuxserver.io/blog/spring-cleaning-new-images-and-rebasing)
- [Kasm iframe Embedding Guide](https://kasm.com/docs/latest/how_to/embed_kasm_in_iframe.html) (applicable concepts for iframe permissions, different product)
- [@playwright/mcp npm](https://www.npmjs.com/package/@playwright/mcp) -- v0.0.56+

### LOW Confidence (Needs Validation During Development)
- Remote debugging port 9222 reliability with linuxserver/chromium volumes ([Issue #30](https://github.com/linuxserver/docker-chromium/issues/30)) -- may need testing
- Whether Selkies HTTP port 3000 works behind Caddy or if HTTPS 3001 with `tls_insecure_skip_verify` is strictly required -- needs testing
- Exact mechanism for hooks to communicate MCP registration to Nexus daemon -- needs architecture decision

---

*Research completed: 2026-02-07*
