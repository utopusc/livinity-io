# Phase 19: postMessage Bridge Protocol - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement bidirectional postMessage communication between apps.livinity.io/store (iframe) and LivOS parent window. Store sends install/uninstall/open commands, LivOS sends status updates and confirmations. Origin validation on both sides.

</domain>

<decisions>
## Implementation Decisions

### Message Types (Store → LivOS)
- `{type: 'install', appId: string, composeUrl: string}` — request app installation
- `{type: 'uninstall', appId: string}` — request app removal
- `{type: 'open', appId: string}` — open app in subdomain
- `{type: 'ready'}` — store iframe loaded, ready to receive status

### Message Types (LivOS → Store)
- `{type: 'status', apps: Array<{id: string, status: 'running'|'stopped'|'not_installed'}>}` — current app states
- `{type: 'installed', appId: string, success: boolean, error?: string}` — install result
- `{type: 'uninstalled', appId: string, success: boolean}` — uninstall result

### Origin Validation
- Store side: only accept messages from `*.livinity.io` origins
- LivOS side: only accept messages from `https://livinity.io` or `https://apps.livinity.io`
- Both sides check `event.origin` before processing

### Store Side Implementation
- `usePostMessage()` hook in store-provider.tsx
- Sends messages via `window.parent.postMessage()`
- Listens for status updates from parent
- Install button in app-detail calls `sendInstall(appId)`
- Updates UI based on received status (show "Installed" vs "Install")

### LivOS Side Implementation (Phase 20)
- This phase only implements the Store side
- LivOS side (listener + executor) is Phase 20

### Claude's Discretion
- TypeScript type definitions for message protocol
- Error handling for failed postMessage
- Fallback when not in iframe (standalone mode)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `platform/web/src/app/store/store-provider.tsx` — context provider, will add postMessage hook
- `platform/web/src/app/store/[id]/app-detail-client.tsx` — has placeholder Install button
- `platform/web/src/app/store/types.ts` — app types

### Integration Points
- Install button in app-detail-client.tsx needs to call postMessage
- store-provider.tsx needs to listen for status messages
- App cards need to show installed/running state

</code_context>

<specifics>
## Specific Ideas

- When standalone (not in iframe), Install button should show "Open in LivOS" or be disabled
- Detect iframe: `window.self !== window.top`

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
