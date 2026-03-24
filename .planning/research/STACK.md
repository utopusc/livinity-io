# Technology Stack

**Project:** Remote PC Control Agent (v14.0)
**Researched:** 2026-03-23

## Recommended Stack

### Remote Agent Binary

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js SEA | 22+ | Cross-platform single executable | Same language as LivOS/Nexus, shared protocol types, fast iteration |
| TypeScript | 5.5+ | Agent source code | Type safety, shared interfaces with relay protocol |
| ws | 8.x | WebSocket client to relay | Same library used in relay server and LivOS tunnel client |
| node-screenshots | 0.x | Desktop screenshot capture | Zero-dependency native addon, Win/Mac/Linux support |
| clipboardy | 4.x | Clipboard read/write | Cross-platform, no native deps, well-maintained |
| systeminformation | 5.x | CPU, RAM, disk, OS info | Already used in LivOS livinityd, proven cross-platform |
| nanoid | 5.x | Request ID generation | Same as relay, collision-resistant, URL-safe |
| esbuild | 0.24+ | Bundle TS to single JS for SEA | Fast bundler, already used in Nexus build pipeline |

### Relay Server Extensions (on Server5)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Existing relay codebase | -- | Add /device/connect WebSocket endpoint | Zero new dependencies, extend existing TypeScript code |
| jsonwebtoken | 9.x | Device JWT token validation | Already used in relay for tunnel token validation |

### LivOS Integration -- DeviceBridge

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Existing tRPC | v11 | New `devices` router for My Devices UI | Consistent with all 16 existing LivOS tRPC routers |
| ioredis | 5.x | Ephemeral device state in Redis | Already used, fits the ephemeral nature of connection state |
| Existing ToolRegistry | -- | Dynamic proxy tool registration | No new deps, existing `register()`/`unregister()` API |
| Existing TunnelClient | -- | Forward device messages through tunnel WS | Already connected to relay, add new message type handlers |

### livinity.io Device OAuth Endpoints

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js 15 API routes | 15.x | `/api/device/register`, `/api/device/token`, `/api/device/approve` | Already the platform framework |
| Drizzle ORM | 0.36+ | `devices` table CRUD | Already the platform ORM, schema-first migrations |
| Better Auth | -- | Validate user session during device approval | Already the platform auth system |
| jsonwebtoken | 9.x | Issue long-lived device JWT tokens | Standard JWT, relay validates with same library |

### LivOS UI -- My Devices Panel

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React 18 | 18.x | My Devices panel, device cards, permission UI | Existing LivOS UI framework |
| shadcn/ui | -- | Cards, drawers, toggles, badges for device status | Existing component library, consistent design |
| @tabler/icons-react | 3.x | Device type icons (desktop, laptop, server) | Already in UI, has device-type icons |
| Framer Motion | 10.x | Connection status pulse animation, list transitions | Already used throughout LivOS UI |

### Build & Distribution

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js SEA (--build-sea) | 22+ | Compile agent to single executable per platform | Native Node.js feature since v19.7, stable in v22+ |
| Docker | -- | Cross-platform builds in CI (linux-x64 from macOS) | Needed because SEA builds are platform-specific |
| GitHub Actions | -- | CI/CD: build Win/Mac/Linux binaries on git push | Automated matrix build across 3 platforms |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Agent language | Node.js (TypeScript) | Rust | Different toolchain, no code sharing; consider for v15.0 binary size optimization |
| Agent language | Node.js (TypeScript) | Go | No shared types with existing TS codebase |
| Agent packaging | Node.js SEA | pkg (vercel/pkg) | Deprecated and archived since 2024 |
| Agent packaging | Node.js SEA | nexe | Less maintained than native SEA |
| Agent packaging | Node.js SEA | Electron / Tauri | 100MB+ for what is a background daemon with no GUI |
| Screenshot lib | node-screenshots | desktop-screenshot (npm) | Shells out to external tools (nircmd, screencapture), fragile |
| Clipboard lib | clipboardy | copy-paste (npm) | Unmaintained since 2018 |
| NAT traversal | WebSocket relay (existing) | WireGuard mesh | Requires kernel module on 3 platforms, relay already solves this |
| NAT traversal | WebSocket relay (existing) | STUN/TURN (WebRTC) | 10-30% of connections still need relay; WebRTC is wrong abstraction for tool calls |
| Device auth | OAuth Device Grant (RFC 8628) | Manual API key paste | Poor UX for non-technical users |
| Device auth | OAuth Device Grant (RFC 8628) | QR code only | Not all CLI terminals render images |
| Tool integration | Proxy tools in ToolRegistry | MCP server per device | Adds protocol overhead (JSON-RPC, capability negotiation) for no benefit |
| Tool integration | Proxy tools in ToolRegistry | Separate REST API per device | Would bypass the AI tool system entirely |

## Installation

### Remote Agent (on user's PC)

```bash
# Proposed one-line installer
curl -fsSL https://livinity.io/install-agent.sh | sh

# Or direct download per platform:
# Windows: livinity-agent-win-x64.exe
# macOS (Apple Silicon): livinity-agent-darwin-arm64
# macOS (Intel): livinity-agent-darwin-x64
# Linux: livinity-agent-linux-x64

# First-time setup (OAuth Device Authorization Grant)
./livinity-agent setup
# Output: "Visit livinity.io/device and enter code: ABCD-1234"
# User approves in browser, agent receives token

# Start daemon (auto-connects to relay)
./livinity-agent start

# Check status
./livinity-agent status
```

### Development Dependencies (agent workspace)

```bash
# Create agent package in monorepo or separate repo
mkdir agent && cd agent
npm init -y

# Runtime
npm install ws clipboardy systeminformation nanoid

# Native addon (screenshot)
npm install node-screenshots

# Build tools
npm install -D esbuild @types/ws @types/node typescript

# No new packages needed for relay or LivOS -- all reuse existing deps
```

## Node.js SEA Build Process

```bash
# 1. Bundle with esbuild (single JS file, no node_modules needed)
npx esbuild src/index.ts --bundle --platform=node --target=node22 --outfile=dist/agent.js

# 2. Create SEA config
echo '{"main":"dist/agent.js","output":"dist/sea-prep.blob"}' > sea-config.json

# 3. Generate SEA blob
node --experimental-sea-config sea-config.json

# 4. Copy node binary and inject blob
cp $(which node) dist/livinity-agent
npx postject dist/livinity-agent NODE_SEA_BLOB dist/sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
```

**Cross-platform note:** SEA builds must run on the target platform. Use GitHub Actions matrix:
- `ubuntu-latest` -> linux-x64
- `macos-14` -> darwin-arm64 (Apple Silicon)
- `macos-13` -> darwin-x64 (Intel)
- `windows-latest` -> win-x64

**Native addon handling:** `node-screenshots` is a native addon (napi-rs). Node.js SEA can embed native addons via the `assets` field in the SEA config. The addon `.node` file must be extracted at runtime.

## Sources

- [Node.js SEA Documentation](https://nodejs.org/api/single-executable-applications.html) -- Official SEA docs (HIGH confidence)
- [Improving SEA Building for Node.js (2026)](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/) -- Recent improvements (HIGH confidence)
- [node-screenshots GitHub](https://github.com/nashaofu/node-screenshots) -- Zero-dep native screenshot library (MEDIUM confidence -- less popular, but the API is simple)
- [clipboardy npm](https://www.npmjs.com/package/clipboardy) -- Cross-platform clipboard (HIGH confidence)
- [RFC 8628 - OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628) -- Standard for headless device auth (HIGH confidence)
- [Build Multi-Platform SEA Binaries](https://dev.to/zavoloklom/how-to-build-multi-platform-executable-binaries-in-nodejs-with-sea-rollup-docker-and-github-d0g) -- CI/CD patterns (MEDIUM confidence)
- Existing codebase: `platform/relay/src/`, `nexus/packages/core/src/tool-registry.ts`, `livos/packages/livinityd/source/modules/platform/tunnel-client.ts`
