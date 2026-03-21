# Phase 22: App Store Integration Fix - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix five integration gaps in the App Store iframe bridge between LivOS desktop UI and the livinity.io/store iframe. All changes are bugfixes/enhancements to the existing postMessage bridge protocol.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure/bugfix phase with clear requirements from user.

Tasks:
1. **Desktop refresh after install** — Bridge `handleInstall` already calls `utils.apps.list.invalidate()` and `utils.apps.state.invalidate()`, but the desktop grid needs to refresh immediately. May need additional invalidation or window-level event.
2. **reportEvent URL fix** — Change `https://apps.livinity.io/api/install-event` to `https://livinity.io/api/install-event` in `use-app-store-bridge.ts`.
3. **Progress reporting** — Bridge should poll `apps.state` during install for `progress` value and send `progress` messages to iframe. Store iframe needs to handle `progress` message type and show percentage on install button.
4. **Credentials dialog** — After install completes, bridge should fetch app credentials from `apps.list` response and send them to iframe. Store iframe should show credentials dialog.
5. **App status updates** — Bridge should send status updates after install/uninstall, not just on `ready` event. Add `installing` status to bridge protocol.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `use-app-store-bridge.ts` — LivOS-side bridge hook with install/uninstall/status handlers
- `use-post-message.ts` — Store-side bridge hook with message listeners
- `store-provider.tsx` — Store context with bridge state
- `app-detail-client.tsx` — Detail page with install/uninstall/open buttons
- `use-app-install.ts` — Existing LivOS polling hook (2s interval during install states) with progress tracking
- `apps/routes.ts` — tRPC routes returning `{state, progress}` from `app.stateProgress` and credentials from manifest
- `app.ts` — App class with `stateProgress` field updated during `pull()` (0-99%)

### Established Patterns
- postMessage bridge: LivOS sends typed messages, store listens and updates React state
- Origin validation on receive side (*.livinity.io + localhost in dev)
- Imperative `trpcClient` for mutations in event handlers
- `useRef` to prevent stale closures in message handlers
- Fire-and-forget for non-critical operations (reportEvent)

### Integration Points
- Bridge protocol types duplicated in both LivOS (`use-app-store-bridge.ts`) and platform (`types.ts`)
- New message types need adding to both sides
- `app-detail-client.tsx` renders install button — needs installing state + progress
- `app-card.tsx` shows status badges — needs installing state

</code_context>

<specifics>
## Specific Ideas

- User wants install to immediately appear on desktop without page refresh
- Progress should show as "Installing 45%" style on the button
- Credentials (username/password) shown after install completes
- reportEvent URL must be livinity.io not apps.livinity.io

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
