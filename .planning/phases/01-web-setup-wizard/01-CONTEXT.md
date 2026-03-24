# Phase 1: Web Setup Wizard - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the CLI-only `livinity-agent setup` with a web-based setup wizard. When the agent runs for the first time (no credentials), it starts a local HTTP server, opens the user's browser, and shows a polished React UI that guides through the OAuth device flow. After success, the page auto-closes and the agent continues running. The existing CLI `setup` command becomes the fallback — the web wizard is the primary path.

</domain>

<decisions>
## Implementation Decisions

### Local Web Server
- Agent starts an Express server on port 19191 (or next available) when setup is needed
- Serves a pre-built React SPA from `agent/setup-ui/dist/`
- Server provides API endpoints: `GET /api/status`, `POST /api/start-setup`, `GET /api/poll-status`
- After setup completes, server sends a "done" event and shuts down after 5 seconds
- Use `open` npm package to auto-open browser to `http://localhost:19191`

### Setup UI (React SPA)
- Separate build inside agent: `agent/setup-ui/` with its own package.json, Vite, React, Tailwind
- Build output goes to `agent/setup-ui/dist/` — the Express server serves this as static files
- Pre-built during `npm run build` so the SEA binary includes the static files

### UI Flow (4 screens)
1. **Welcome** — "Set up Livinity Agent" with device name auto-detected, "Connect Account" button
2. **Connecting** — Shows the user code (XXXX-XXXX) prominently, link to livinity.io/device, "Waiting for approval..." with spinner, auto-polls every 5s
3. **Success** — "Connected!" with green checkmark, device name, "This window will close automatically"
4. **Error** — "Something went wrong" with retry button, error details

### Design
- Apple-style minimal design with white background, centered card, subtle shadows
- Livinity branding (logo at top)
- Match livinity.io premium aesthetic
- Responsive but optimized for desktop (800x600 window area)
- Use Inter font (or system font stack)

### Integration with Existing Agent
- `agent/src/cli.ts` `startCommand()`: check if credentials exist → if not, start web setup first, wait for completion, then connect
- `agent/src/cli.ts` `setupCommand()`: add `--web` flag (default) and `--cli` flag for terminal-only setup
- The existing `deviceFlowSetup()` in auth.ts remains unchanged — the web server calls it internally

### Build Integration
- `agent/setup-ui/` is built separately: `cd setup-ui && npm run build`
- Main agent esbuild bundles the dist/ as embedded assets
- Or: esbuild copies dist/ alongside the bundle, Express serves from relative path

### Claude's Discretion
- Exact port selection strategy
- Animation details
- How to embed the React build in the SEA binary (copy alongside vs embed)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent/src/auth.ts` — `deviceFlowSetup()` handles the full OAuth flow (register, poll, store token)
- `agent/src/cli.ts` — `setupCommand()` and `startCommand()` entry points
- `agent/src/state.ts` — `readCredentials()` / `writeCredentials()` for checking if setup is done
- `agent/src/config.ts` — PLATFORM_URL constant for livinity.io

### Established Patterns
- Agent uses TypeScript with esbuild bundling
- OAuth flow: POST /api/device/register → display code → poll /api/device/token
- Credentials stored at ~/.livinity/credentials.json

### Integration Points
- `cli.ts` startCommand: add web setup flow before connecting
- `cli.ts` setupCommand: add --web/--cli flag routing
- New: `agent/src/setup-server.ts` — Express server for web setup
- New: `agent/setup-ui/` — React SPA project

</code_context>

<specifics>
## Specific Ideas

- The setup page should feel like a premium product — not a dev tool
- The user code should be HUGE on screen so it's easy to type on another device
- Auto-open browser is essential — the user shouldn't have to copy a URL
- A small animation when "Connected!" appears would feel polished

</specifics>

<deferred>
## Deferred Ideas

- Electron wrapper for the setup UI — overkill, browser is fine
- Custom browser window (chromeless) — too complex for v14.1
- QR code for mobile approval — nice but not needed for v14.1

</deferred>
