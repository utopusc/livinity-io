# Phase 7: WhatsApp QR Code & Settings UI - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add WhatsApp QR code connection flow to Settings > Integrations UI. Backend tRPC routes for QR generation, connection status polling, and disconnect. Frontend WhatsApp tab with QR display (qrcode.react or qrcode npm), connection status, and disconnect button.

</domain>

<decisions>
## Implementation Decisions

### WhatsApp Backend Routes
- New tRPC routes needed: whatsappGetQr, whatsappGetStatus, whatsappDisconnect
- QR code comes from WhatsAppProvider's Baileys 'connection.update' event (qr field)
- Store QR string in Redis with short TTL (~30s, auto-refreshes)
- Status polling: tRPC query that reads WhatsAppProvider.getStatus()
- Disconnect: calls WhatsAppProvider.disconnect() and clears Redis auth state
- Extend updateChannel input type to include 'whatsapp' alongside 'telegram' | 'discord'

### WhatsApp UI
- Add WhatsApp tab to existing IntegrationsSection (alongside Telegram, Discord tabs)
- QR code rendered with qrcode npm package (already installed in nexus, OR use inline SVG generation)
- Auto-refresh QR via polling (refetchInterval: 5000ms while connecting)
- Connected state: show phone number (from Baileys connection info), green status dot, Disconnect button
- Disconnected state: show Connect button, clicking it triggers Baileys connect and shows QR
- Use existing TabsTrigger/TabsContent pattern from IntegrationsSection

### Claude's Discretion
- Exact styling/colors of WhatsApp section — follow existing Telegram/Discord tab aesthetics
- QR code size and layout within the Settings panel
- Error handling UX for failed connections

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- IntegrationsSection: `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` (line ~994)
- Existing Telegram/Discord tab pattern with TabsTrigger/TabsContent
- getChannels tRPC route: `livos/packages/livinityd/source/modules/ai/routes.ts` (line 1131)
- updateChannel tRPC route: same file (line 1170), accepts 'telegram' | 'discord'
- WhatsAppProvider already created in Phase 6: `nexus/packages/core/src/channels/whatsapp.ts`
- CSP already allows data: URLs for images (whatsapp QR): server/index.ts line 255

### Established Patterns
- tRPC routes in ai/routes.ts proxy to Nexus API via fetch
- Nexus exposes REST endpoints that ChannelManager calls
- Settings UI uses trpcReact hooks for data fetching
- Channel status: {enabled, connected, error, lastConnect, botName}

### Integration Points
- IntegrationsSection: add 'whatsapp' tab trigger and content
- ai/routes.ts: add whatsapp-specific tRPC routes (QR, status, disconnect)
- Nexus REST: may need new endpoints for QR retrieval from WhatsAppProvider
- WhatsAppProvider.getStatus() already returns ChannelStatus

</code_context>

<specifics>
## Specific Ideas

- QR code should be large enough to scan easily on mobile (at least 200x200px)
- Auto-refresh polling stops when connected (no unnecessary network requests)
- WhatsApp icon: use TbBrandWhatsapp from react-icons/tb (green color)

</specifics>

<deferred>
## Deferred Ideas

- Pairing code fallback (alternative to QR) — v26.0
- WhatsApp group settings — v26.0
- Rate limiting UI display — Phase 8

</deferred>
