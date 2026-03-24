# Phase 52: My Devices UI - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds the "My Devices" UI panel in LivOS, showing connected remote PCs with their status, and allowing device management (rename, remove). Uses device state from Redis (set by DeviceBridge in Phase 49) and tRPC routes for operations.

</domain>

<decisions>
## Implementation Decisions

### Backend — tRPC Devices Router
- New tRPC router: `devices` in livinityd
- Routes:
  - `devices.list` — query: returns all devices for current user from Redis + PostgreSQL
  - `devices.rename` — mutation: update device name in Redis and platform DB
  - `devices.remove` — mutation: revoke device token (mark revoked in platform DB), disconnect from relay, clean Redis
- Device data source: Redis keys `livos:devices:{userId}:{deviceId}` (set by DeviceBridge on connect/disconnect)
- For offline devices: query platform PostgreSQL `devices` table for registered-but-offline devices
- Combine Redis (online devices with tools, lastSeen) + DB (all registered devices) for complete list
- Add to httpOnlyPaths in common.ts (tRPC mutations must use HTTP, not WebSocket)

### Frontend — My Devices Panel
- New window/panel accessible from LivOS desktop (like Server Management)
- Component: `MyDevicesPanel` with device card grid
- Each device card shows:
  - Device name (editable)
  - OS icon (Windows/Mac/Linux via @tabler/icons-react: IconDeviceDesktop, IconBrandApple, IconBrandUbuntu)
  - Connection status: green dot = online, gray dot = offline
  - Last seen timestamp (relative: "2 minutes ago", "3 hours ago")
  - Available tools count badge
- Device detail drawer/modal on click:
  - Device info (name, OS, platform, connected since, IP if available)
  - Available tools list
  - Rename button with inline edit
  - Remove button with confirmation dialog
- Empty state: "No devices connected. Install the Livinity agent on your PC to get started." with install instructions link

### Design
- Follow existing LivOS UI patterns: shadcn/ui components, Tailwind, Framer Motion
- Card grid layout similar to App Store cards
- Status indicators: green pulse animation for online (Framer Motion), static gray for offline
- Match the Apple-style premium aesthetic of the rest of LivOS

### Desktop Integration
- Register "My Devices" as a LivOS window/app (similar to Server Management, Settings, etc.)
- Icon: IconDevices2 from @tabler/icons-react
- Accessible from desktop dock or app launcher

### Claude's Discretion
- Exact card layout dimensions and spacing
- Animation timing and easing
- Detail drawer vs modal for device info
- How to display the install instructions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livos/packages/livinityd/source/modules/devices/device-bridge.ts` — DeviceBridge sets Redis device state (Phase 49)
- `livos/packages/ui/src/routes/server-control/` — Server Management UI pattern (tabbed layout, cards, drawers)
- shadcn/ui components: Card, Badge, Button, Dialog, Input, Sheet
- @tabler/icons-react for device type icons
- Framer Motion for animations

### Established Patterns
- tRPC routers in livinityd: thin routes + domain functions pattern
- httpOnlyPaths in common.ts for mutations
- LivOS windows: registered in app registry, opened from dock/launcher
- UI data fetching: tRPC hooks (useQuery, useMutation) with React Query

### Integration Points
- New tRPC router merged into livinityd's appRouter
- New UI route/component in livos/packages/ui/src/routes/
- Register as window in app registry
- Add to httpOnlyPaths for mutations

</code_context>

<specifics>
## Specific Ideas

- The panel should feel like a dashboard showing your connected machines
- Online devices should feel "alive" with subtle pulse animation on the status indicator
- Offline devices should still show but clearly grayed out
- Remove device should feel consequential — confirmation dialog with device name typed

</specifics>

<deferred>
## Deferred Ideas

- Per-device permission controls — v14.1
- Quick actions from device card (open terminal, take screenshot, browse files) — v14.1
- Device grouping/categorization — v15+
- Notification when device connects/disconnects — v14.1

</deferred>
