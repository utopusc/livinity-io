# Phase 20: LivOS iframe Embedding - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace LivOS's React-based App Store window content with an iframe embedding apps.livinity.io/store. LivOS listens for postMessage install/uninstall commands from the iframe, executes them (Docker pull/up, Caddy config), and sends status updates back.

</domain>

<decisions>
## Implementation Decisions

### iframe Embedding
- Replace content of App Store window with a single iframe element
- iframe URL: `https://livinity.io/store?token=${LIVINITY_API_KEY}&instance=${hostname}`
- API key from process.env.LIVINITY_API_KEY (already in .env)
- Instance hostname from domain config or system hostname
- iframe should have no border, fill the window, allow scrolling

### postMessage Listener (LivOS side)
- Listen for messages from iframe (origin: livinity.io)
- Handle 'install': download compose from composeUrl → write to app-data → docker compose up → update Caddy
- Handle 'uninstall': docker compose down → remove app data → update Caddy
- Handle 'open': navigate to app subdomain
- Handle 'ready': send current app statuses

### Status Updates
- On iframe 'ready' message: send all installed app statuses
- After install/uninstall: send result confirmation
- Periodically (or on docker events): send updated statuses

### Claude's Discretion
- Exact file to modify for App Store window content
- How to get API key and hostname in the UI context
- Error handling for failed installs

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livos/packages/ui/src/modules/window/app-contents/app-store-routes/` — existing App Store UI (to be replaced with iframe)
- `livos/packages/ui/src/providers/available-apps.tsx` — current app data provider
- `livos/packages/livinityd/source/modules/apps/app-store.ts` — backend app store logic
- `livos/packages/livinityd/source/modules/apps/app.ts` — App.install() method
- `livos/packages/livinityd/source/modules/server/index.ts` — Express server
- `livos/packages/livinityd/source/modules/domain/caddy.ts` — Caddy config management

### Integration Points
- Window content rendering: window-content.tsx routes to app store components
- tRPC routes for app install/uninstall already exist
- Caddy config updates happen in domain/caddy.ts
- postMessage types defined in Phase 19 (on store side)

</code_context>

<specifics>
## Specific Ideas

- The simplest approach: modify the App Store window component to render an iframe instead of the current React components
- Install command from iframe → call existing tRPC app install mutation
- Status: query installed apps from existing tRPC queries

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
