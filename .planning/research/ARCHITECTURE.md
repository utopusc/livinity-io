# Architecture: Browser App Integration with LivOS

**Domain:** Persistent Docker-based Chromium browser with KasmVNC, Playwright MCP, and proxy support
**Researched:** 2026-02-07
**Confidence:** HIGH (based on direct codebase analysis + verified external sources)

---

## 1. System Overview

The browser app integrates into LivOS as a **multi-service Docker Compose application** within the existing app lifecycle. It touches five major integration points: Docker container management (livinityd), Caddy reverse proxy, MCP server registration (Nexus), frontend window/launch system, and the app store catalog.

```
User
  |
  v
LivOS UI (React)  ----window.open()---->  browser.domain.com
  |                                            |
  | tRPC (install/start/stop)                  | HTTPS (Caddy auto-TLS)
  v                                            v
livinityd (Express+tRPC :8080)            Caddy Reverse Proxy
  |                                            |
  | docker compose up/down                     | reverse_proxy 127.0.0.1:6901
  v                                            v
Docker Engine                              KasmVNC Web Interface (port 6901)
  |                                            |
  +-- chromium container (KasmVNC :3000/:3001)  | WebSocket (auto-upgraded)
  |     +-- Chromium browser (:9222 CDP)        v
  |     +-- /config volume (session data)   Chromium Desktop GUI
  |
  +-- proxy container (SOCKS5 :1080, HTTP :8118)  [companion service]
  |
  +-- playwright-mcp (stdio on host via npx)
       +-- connects to chromium:9222 via CDP
```

## 2. Existing Architecture Analysis

### 2.1 App Install Flow (Current)

Based on codebase analysis of `apps.ts`, `app.ts`, and the `app-script` bash script:

```
1. User clicks Install in App Store UI
2. tRPC mutation: apps.install({appId})
3. Apps.install(appId) in apps.ts:
   a. appStore.getAppTemplateFilePath(appId)  -- finds template in gallery repo
   b. rsync template files to ${dataDirectory}/app-data/${appId}/
   c. app.install() in app.ts:
      i.   patchComposeFile() -- removes app_proxy, adds port mapping, container names
      ii.  pull() -- pulls Docker images
      iii. appScript('install', appId) -- runs bash install script
           - sources env, applies templates, pulls compose images
           - compose up --detach --build
           - executes hooks/post-start, hooks/post-install
   d. registerAppSubdomain(appId, port) -- adds to Caddy config
4. App is running, accessible at subdomain.domain.com
```

**Critical finding:** The install flow expects template files in a **gallery repository** (git-based), not in builtin-apps.ts. The `BuiltinAppManifest` in `builtin-apps.ts` is used only for the app store **listing/catalog** and icon resolution -- it does NOT drive installation. The actual template (docker-compose.yml, livinity-app.yml, hooks/) must exist in a cloned gallery repo directory.

### 2.2 Caddy Reverse Proxy (Current)

From `caddy.ts`:

```typescript
// generateFullCaddyfile produces:
// subdomain.mainDomain {
//   reverse_proxy 127.0.0.1:${port}
// }
```

**Key constraint:** The current Caddy config generator produces a **simple reverse_proxy** directive per subdomain. It does NOT include:
- WebSocket-specific configuration (though Caddy v2 handles WebSocket upgrades automatically)
- TLS backend settings (needed for KasmVNC's self-signed cert)
- Custom headers

**Good news:** Caddy v2 automatically handles WebSocket upgrade requests. No special `ws` directive is needed. The `reverse_proxy` directive transparently proxies WebSocket connections. However, KasmVNC serves over HTTPS with self-signed certs, so the Caddy config needs `transport http { tls_insecure_skip_verify }` to connect to the backend.

### 2.3 MCP Integration (Current)

From `mcp-config-manager.ts`, `mcp-client-manager.ts`, `mcp-types.ts`:

```
Redis key: nexus:mcp:config
Redis channel: nexus:config:updated (message: 'mcp_config')

McpServerConfig {
  name: string
  transport: 'stdio' | 'streamableHttp'
  command?: string       // stdio
  args?: string[]        // stdio
  url?: string           // streamableHttp
  headers?: Record<string, string>
  enabled: boolean
  description?: string
  installedFrom?: string
  installedAt: number
}
```

The McpClientManager listens on `nexus:config:updated` channel and calls `reconcile()` to connect/disconnect MCP servers. Tools are auto-discovered via `client.listTools()` and registered as `mcp_{serverName}_{toolName}` in the ToolRegistry.

**Transport options for Playwright MCP:**
- `stdio`: Spawns a child process. Allowed commands: npx, node, python, python3, uvx, docker, deno, bun. This works if Playwright MCP runs on the host.
- `streamableHttp`: HTTP-based transport. Has SSRF protection blocking localhost/private IPs. This is problematic for connecting to a local Docker container.

**Critical issue:** The `streamableHttp` transport blocks private IPs (127.x, 10.x, 192.168.x, localhost). The Playwright MCP container would be on an internal Docker network. Either:
1. Use `stdio` transport with `npx @playwright/mcp --cdp-endpoint ws://localhost:9222` (command allowlist includes `npx`, port 9222 mapped to host)
2. Modify SSRF protection to allow specific internal addresses for MCP servers
3. Expose the Playwright MCP SSE endpoint on a host-bound port and use a non-blocked address

**Recommendation:** Use `stdio` transport. The command `npx` is in the allowlist. The CDP endpoint connects to the Chromium container via a host-mapped port (9222). This avoids SSRF issues entirely and requires zero changes to McpClientManager.

### 2.4 Frontend App Launch (Current)

From `use-launch-app.ts` and `misc.ts`:

```typescript
// appToUrl builds: ${protocol}//${subdomain}.${baseDomain}
// useLaunchApp calls: window.open(url, '_blank')
```

Apps open in a **new browser tab**, not in an iframe within the LivOS window system. The `IframeChecker` component actively blocks LivOS itself from being embedded. The window manager (`window-manager.tsx`) manages internal LivOS windows (app store, settings, files, AI chat) but not external Docker apps.

**Implication:** The browser app will open via `window.open()` to `browser.domain.com` in a new tab, showing the KasmVNC interface directly. No iframe embedding is needed or desirable for the initial version.

### 2.5 Docker Network (Current)

From `docker-compose.yml` (legacy-compat):

```yaml
networks:
  default:
    name: livinity_main_network
    ipam:
      driver: default
      config:
        - subnet: "10.21.0.0/16"
```

All app containers join `livinity_main_network` via `docker-compose.common.yml`. The browser app's companion services (proxy) need to be on this network to communicate with the browser container.

## 3. New Components Needed

### 3.1 App Template Directory

A new gallery repo entry containing:

```
chromium/
  livinity-app.yml          # App manifest (port, name, description, etc.)
  docker-compose.yml        # Multi-service compose (browser + proxy)
  hooks/
    post-start              # Register Playwright MCP server in Redis
    pre-stop                # Deregister Playwright MCP server from Redis
```

### 3.2 Docker Compose (Multi-Service)

```yaml
version: '3.7'

services:
  browser:
    image: lscr.io/linuxserver/chromium:latest
    container_name: chromium_browser_1
    environment:
      CUSTOM_USER: ""
      PASSWORD: ""
      CHROME_CLI: >-
        --remote-debugging-port=9222
        --remote-allow-origins=*
        --restore-last-session
        --disable-blink-features=AutomationControlled
        --disable-infobars
        --disable-dev-shm-usage
      TZ: "Europe/Istanbul"
    volumes:
      - ./data/config:/config
    ports:
      - "6901:3000"        # KasmVNC HTTP -> host port 6901
      - "9222:9222"        # CDP for Playwright MCP
    shm_size: "2gb"         # Prevent Chromium crashes from shared memory limits
    restart: unless-stopped

  proxy:
    image: wernight/dante:latest
    container_name: chromium_proxy_1
    restart: unless-stopped
    # SOCKS5 on port 1080, accessible from browser container via Docker DNS
```

**Important notes on LinuxServer Chromium:**
- Exposes port **3000** (HTTP) and **3001** (HTTPS), NOT port 6901
- The KasmVNC/Selkies web interface is on these ports
- `CUSTOM_PORT` env var changes the HTTP port (default 3000)
- `CUSTOM_HTTPS_PORT` env var changes the HTTPS port (default 3001)
- Self-signed certs are used by default, requiring `tls_insecure_skip_verify` in reverse proxy if proxying to HTTPS backend
- HTTPS is required for full functionality (WebCodecs, clipboard, etc.)
- Proxying to the HTTP port (3000) avoids the self-signed cert issue; Caddy provides HTTPS to the user

### 3.3 Caddy Config Enhancement

The current `generateFullCaddyfile()` in `caddy.ts` generates:

```
subdomain.domain {
  reverse_proxy 127.0.0.1:PORT
}
```

For KasmVNC proxied via HTTP port 3000 (mapped to host 6901), the basic `reverse_proxy` works because Caddy handles WebSocket upgrades automatically. No special configuration is needed if we proxy to the HTTP port.

If proxying to the HTTPS port (3001) instead, we would need:

```
browser.domain {
  reverse_proxy https://127.0.0.1:6901 {
    transport http {
      tls_insecure_skip_verify
    }
  }
}
```

**Recommendation:** Proxy to the HTTP port (3000 mapped to host 6901). This avoids any need to modify the Caddy config generator. The existing `generateFullCaddyfile()` works as-is. Caddy's auto-HTTPS ensures the user-facing connection is encrypted.

**WebSocket proxying:** Caddy v2 handles WebSocket upgrades automatically within `reverse_proxy`. No additional configuration is needed. The KasmVNC client initiates a WebSocket upgrade, and Caddy transparently proxies it.

### 3.4 MCP Registration Hooks

**hooks/post-start:**
```bash
#!/bin/bash
# Register Playwright MCP server in Redis for Nexus
# This makes browser automation tools available to the AI

# Wait for Chromium CDP to be ready
for i in $(seq 1 30); do
  if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo "Chromium CDP is ready"
    break
  fi
  sleep 1
done

REDIS_CLI=$(which redis-cli 2>/dev/null || echo "/usr/bin/redis-cli")

# Read current MCP config
CURRENT_CONFIG=$($REDIS_CLI GET "nexus:mcp:config")
if [ -z "$CURRENT_CONFIG" ] || [ "$CURRENT_CONFIG" = "(nil)" ]; then
  CURRENT_CONFIG='{"mcpServers":{}}'
fi

# Add playwright-browser MCP server entry
UPDATED_CONFIG=$(echo "$CURRENT_CONFIG" | jq --arg now "$(date +%s)" '.mcpServers["playwright-browser"] = {
  "name": "playwright-browser",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@playwright/mcp", "--cdp-endpoint", "ws://127.0.0.1:9222"],
  "enabled": true,
  "description": "Browser automation via Playwright (connected to persistent Chromium)",
  "installedFrom": "chromium-app",
  "installedAt": ($now | tonumber)
}')

$REDIS_CLI SET "nexus:mcp:config" "$UPDATED_CONFIG"
$REDIS_CLI PUBLISH "nexus:config:updated" "mcp_config"

echo "Playwright MCP server registered"
```

**hooks/pre-stop:**
```bash
#!/bin/bash
# Deregister Playwright MCP server from Redis
REDIS_CLI=$(which redis-cli 2>/dev/null || echo "/usr/bin/redis-cli")

CURRENT_CONFIG=$($REDIS_CLI GET "nexus:mcp:config")
if [ -z "$CURRENT_CONFIG" ] || [ "$CURRENT_CONFIG" = "(nil)" ]; then
  exit 0
fi

UPDATED_CONFIG=$(echo "$CURRENT_CONFIG" | jq 'del(.mcpServers["playwright-browser"])')

$REDIS_CLI SET "nexus:mcp:config" "$UPDATED_CONFIG"
$REDIS_CLI PUBLISH "nexus:config:updated" "mcp_config"

echo "Playwright MCP server deregistered"
```

**Recommendation:** Use the hooks approach. It follows the existing pattern, keeps the browser app self-contained, and does not require changes to livinityd core code. The CDP endpoint uses `ws://127.0.0.1:9222` because port 9222 is mapped from the container to the host, and npx runs on the host where 127.0.0.1 resolves correctly.

### 3.5 Proxy Container Architecture

For SOCKS5/HTTP proxy support, two options:

**Option A: Companion service in docker-compose.yml (recommended)**
```yaml
proxy:
  image: wernight/dante:latest
  container_name: chromium_proxy_1
  restart: unless-stopped
```
Chromium is configured to use `proxy:1080` as SOCKS5 proxy via `CHROME_CLI` flags:
```
--proxy-server=socks5://proxy:1080
```

**Option B: Separate toggleable service**
The proxy runs alongside but is only connected when the user enables it. This requires a tRPC endpoint to toggle proxy on/off by modifying the Chromium container's `CHROME_CLI` env and restarting.

**Recommendation:** Option A for initial implementation. The proxy container always runs but is lightweight (microsocks is <2MB). Making it toggleable is a Phase 2 enhancement.

## 4. Integration Points Summary

| Integration Point | Component | What Changes | Confidence |
|---|---|---|---|
| App Store catalog | `builtin-apps.ts` | Already has chromium entry, port value should match host-mapped port (6901) | HIGH |
| App template | Gallery repo | New directory: docker-compose.yml, livinity-app.yml, hooks/ | HIGH |
| Docker Compose | livinityd `app.ts` | No changes needed, existing flow handles multi-service compose | HIGH |
| Caddy reverse proxy | `caddy.ts` | No changes needed if proxying to HTTP port 3000 (Caddy auto-handles WebSocket) | HIGH |
| MCP registration | hooks/post-start | New hook script, uses existing Redis pub/sub pattern | HIGH |
| MCP deregistration | hooks/pre-stop | New hook script, mirrors post-start | HIGH |
| Frontend launch | `use-launch-app.ts` | No changes, existing window.open() to subdomain works | HIGH |
| Frontend display | `routes.ts` | No changes, existing app list includes subdomain field | HIGH |
| Docker network | `docker-compose.common.yml` | No changes, browser joins livinity_main_network automatically | HIGH |
| Port mapping | `app.ts` patchComposeFile | May need attention: internal port detection for LSIO Chromium | MEDIUM |

## 5. Data Flow

### 5.1 Normal Usage (User browsing)

```
User Browser Tab
  |
  | HTTPS request to browser.example.com
  v
Caddy (auto-TLS, Let's Encrypt)
  |
  | reverse_proxy 127.0.0.1:6901
  | (WebSocket upgrades handled automatically)
  v
Chromium Container (KasmVNC HTTP on :3000 mapped to host :6901)
  |
  | KasmVNC renders Chromium desktop via WebSocket + WebRTC
  v
User sees Chromium browser in their browser tab
  |
  | (Optional) Chromium routes traffic through proxy container
  v
Proxy Container (SOCKS5 :1080) -> Internet
```

### 5.2 AI Automation (Playwright MCP)

```
User sends chat message: "Go to example.com and click the login button"
  |
  v
Nexus AI Daemon (Gemini API)
  |
  | Selects tool: mcp_playwright-browser_navigate (or similar)
  v
McpClientManager
  |
  | stdio transport: npx -y @playwright/mcp --cdp-endpoint ws://127.0.0.1:9222
  v
Playwright MCP Server (running on host via npx, spawned by McpClientManager)
  |
  | Chrome DevTools Protocol (CDP) over WebSocket
  v
Chromium Container (:9222 remote debugging, mapped to host)
  |
  | Playwright executes actions on the live browser
  v
User sees changes reflected in KasmVNC viewer in real-time
```

### 5.3 Session Persistence

```
Chromium Container
  |
  | /config volume mounted to host: ${dataDirectory}/app-data/chromium/data/config
  v
Host Filesystem
  |
  | Contains: browser profile, cookies, localStorage, bookmarks, extensions
  | Persists across: container restarts, app stops/starts, system reboots
  | Backed up by: LivOS backup system (Kopia)
  v
User sessions survive indefinitely
```

## 6. Patterns to Follow

### Pattern 1: Multi-Service App with Hooks

The browser app should follow the established LivOS pattern where:
- `docker-compose.yml` defines all services
- `hooks/post-start` runs after all containers are up
- `hooks/pre-stop` runs before containers are stopped
- The first non-proxy service is detected as the "main" service by `patchComposeFile()`

### Pattern 2: Redis Pub/Sub for Dynamic Config

MCP registration via Redis follows the established Nexus pattern:
- Write config to `nexus:mcp:config` key
- Publish `mcp_config` to `nexus:config:updated` channel
- McpClientManager.reconcile() auto-detects changes

### Pattern 3: Caddy Subdomain Auto-Registration

After install, `registerAppSubdomain()` automatically:
- Creates SubdomainConfig entry
- Rebuilds full Caddyfile
- Reloads Caddy (zero-downtime)

## 7. Anti-Patterns to Avoid

### Anti-Pattern 1: Iframe Embedding

Do NOT embed KasmVNC in an iframe within the LivOS window system. Reasons:
- LivOS explicitly blocks iframe embedding (IframeChecker component)
- KasmVNC requires HTTPS and specific security headers
- Cross-origin iframe restrictions break clipboard, keyboard, and mouse capture
- Performance overhead of nested browsing contexts
- The existing app launch pattern (window.open to subdomain) works perfectly

### Anti-Pattern 2: Custom Install Flow

Do NOT create a separate install mechanism for the browser app. The existing flow (gallery template -> rsync -> docker compose up -> hooks) handles everything. The `BuiltinAppManifest` in `builtin-apps.ts` is for catalog display only.

### Anti-Pattern 3: Modifying SSRF Protection

Do NOT weaken the SSRF protection in McpClientManager to allow localhost/private IPs for the streamableHttp transport. Use stdio transport instead, which avoids the issue entirely and requires zero changes to existing security code.

### Anti-Pattern 4: Hardcoding Browser-Specific Logic in livinityd

Do NOT add browser-specific code paths in `apps.ts`, `app.ts`, or `caddy.ts`. Keep the browser app self-contained in its template directory. The existing app lifecycle handles everything generically.

## 8. Component Boundaries

| Component | Responsibility | Communicates With |
|---|---|---|
| Browser App Template | Docker Compose definition, hooks, manifest | livinityd (via template files) |
| Chromium Container | Runs browser, exposes KasmVNC + CDP | Caddy (KasmVNC port), Playwright MCP (CDP port), Proxy (SOCKS5) |
| Proxy Container | SOCKS5/HTTP proxy for Chromium traffic | Chromium (via Docker DNS), Internet |
| Playwright MCP (stdio) | Browser automation tools for AI | Nexus (stdio transport), Chromium (CDP WebSocket via host-mapped port) |
| caddy.ts | Caddyfile generation | Caddy process (reload). No changes needed for basic HTTP backend. |
| hooks/post-start | MCP registration in Redis | Redis (nexus:mcp:config key, nexus:config:updated channel) |
| hooks/pre-stop | MCP deregistration from Redis | Redis (nexus:mcp:config key, nexus:config:updated channel) |
| builtin-apps.ts | App store catalog entry | Frontend (display only) |

## 9. Suggested Build Order

Based on dependency analysis of the existing architecture:

### Phase 1: Core Browser Container
**Build first because:** Everything else depends on a working Chromium container.
1. Create app template directory structure (livinity-app.yml, docker-compose.yml)
2. Configure LinuxServer Chromium with correct env vars, volume mounts, and port mappings
3. Add `shm_size: "2gb"` to prevent Chromium OOM crashes
4. Get `docker compose up` working manually
5. Verify KasmVNC is accessible on the mapped host port
6. Verify session persistence (cookies survive container restart)

### Phase 2: Caddy Integration + App Store
**Build second because:** Without reverse proxy, the browser is only accessible via IP:port.
1. Add chromium template to the gallery repo so `getAppTemplateFilePath()` can find it
2. Test full install flow: click Install -> rsync -> docker compose up -> Caddy registered
3. Verify subdomain access: browser.domain.com -> KasmVNC
4. Verify WebSocket proxying works through Caddy (KasmVNC viewer loads and is interactive)
5. Verify uninstall flow: docker compose down -> Caddy deregistered -> data removed
6. Update builtin-apps.ts catalog entry if port/config changed from current values

### Phase 3: MCP + Playwright Integration
**Build third because:** AI automation is additive, not blocking.
1. Create hooks/post-start script for MCP registration via Redis
2. Create hooks/pre-stop script for MCP deregistration via Redis
3. Map CDP port 9222 from container to host
4. Test: install browser -> Nexus auto-discovers Playwright tools via McpClientManager.reconcile()
5. Test: AI can navigate, click, type via Playwright MCP tools through stdio transport
6. Verify CDP connection: `npx @playwright/mcp --cdp-endpoint ws://127.0.0.1:9222` works from host

### Phase 4: Proxy Support
**Build last because:** Optional feature, not required for core functionality.
1. Add proxy container (microsocks or dante) to docker-compose.yml
2. Configure Chromium to route traffic through proxy via `--proxy-server` flag in CHROME_CLI
3. Test: Chromium traffic routes through SOCKS5 proxy (verify external IP changes)
4. (Future) Add tRPC endpoint to toggle proxy on/off by restarting with modified CHROME_CLI

## 10. patchComposeFile() Interaction

The `patchComposeFile()` method in `app.ts` does several things that affect the browser app:

1. **Removes `app_proxy` service** -- Not present in browser compose, no issue.
2. **Detects main service** -- Looks for service named `server`, `app`, or `web`, falls back to first service. The browser compose should name its main service `browser` or `app` to be detected correctly. Since none of the expected names match, it will fall back to the first service (`browser`), which is correct.
3. **Port mapping** -- Detects internal port from existing port mappings, expose directives, or a hardcoded lookup table. The browser service has explicit port mapping (`6901:3000`), so `patchComposeFile()` will detect internal port 3000 from the `ports` array. It will then add `6901:3000` mapping (which is already present, so it may duplicate -- this needs testing).
4. **Container naming** -- Forces `container_name` to `${appId}_${serviceName}_1` format. If we set `container_name: chromium_browser_1` explicitly, this step is skipped. The hook scripts reference the container by name, so the explicit name is important.
5. **Volume migration** -- Replaces old storage paths. Not relevant for browser app.

**Key risk:** The port duplication in step 3. The browser compose already has `ports: ["6901:3000"]`, and `patchComposeFile()` may add another `6901:3000` entry. This needs testing. If it causes issues, either:
- Set the port in `livinity-app.yml` manifest to match the host port (6901) and let patchComposeFile handle it
- Or ensure the existing port mapping format is recognized by the deduplication logic

## 11. Scalability Considerations

| Concern | Single User | Multiple Users (future) |
|---|---|---|
| Memory | ~500MB-1GB per Chromium instance | Need per-user containers |
| Storage | /config volume grows with browser data | Per-user volumes |
| Network | Single proxy container sufficient | Per-user proxy containers |
| Ports | One host port per service (6901, 9222) | Dynamic port allocation needed |
| MCP | One Playwright MCP connection per Chromium | Multiple CDP endpoints |

For the current single-user LivOS deployment, these are non-issues. The architecture supports a single persistent browser instance per LivOS installation.

## 12. Risk Areas Requiring Deeper Research

| Risk | Phase | Why |
|---|---|---|
| patchComposeFile port duplication | Phase 1 | Existing port mapping in compose may conflict with auto-added mapping |
| Playwright MCP stdio + CDP via host port | Phase 3 | npx runs on host, CDP target is localhost:9222 (host-mapped) -- should work but needs verification |
| `shm_size` support in compose flow | Phase 1 | Chromium crashes without sufficient shared memory; verify docker-compose `shm_size` works through the app-script flow |
| hooks/ execution context | Phase 3 | Hooks run via bash -- need to verify `redis-cli` and `jq` are available on the LivOS host |
| KasmVNC clipboard/keyboard through Caddy | Phase 2 | Full functionality requires HTTPS; Caddy provides this, but WebRTC/WebCodecs may need specific headers |
| LinuxServer Chromium anti-detection | Phase 1 | `--disable-blink-features=AutomationControlled` flag effectiveness with KasmVNC overlay |

## Sources

- Direct codebase analysis: `builtin-apps.ts`, `caddy.ts`, `apps.ts`, `app.ts`, `app-script`, `mcp-client-manager.ts`, `mcp-config-manager.ts`, `mcp-types.ts`, `use-launch-app.ts`, `window-manager.tsx`, `iframe-checker.tsx`, `misc.ts`
- [LinuxServer Chromium Docker documentation](https://docs.linuxserver.io/images/docker-chromium/) -- Ports are 3000/3001, not 6901
- [Kasm Reverse Proxy documentation](https://www.kasmweb.com/docs/develop/how_to/reverse_proxy.html)
- [Caddy reverse_proxy directive](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) -- WebSocket support is automatic in v2
- [Playwright MCP Server (Microsoft)](https://github.com/microsoft/playwright-mcp) -- `--cdp-endpoint` flag for connecting to existing browsers
- [Caddy Community: Kasm WebSocket config](https://caddy.community/t/caddyfile-config-for-kasm-websocket/20516)
- [wernight/dante Docker SOCKS5 proxy](https://github.com/wernight/docker-dante)
