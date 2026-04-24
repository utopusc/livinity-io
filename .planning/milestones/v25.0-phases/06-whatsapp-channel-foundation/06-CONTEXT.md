# Phase 6: WhatsApp Channel Foundation - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Create WhatsAppProvider implementing ChannelProvider interface, using Baileys v6 for WebSocket connection to WhatsApp servers. Auth state persisted to Redis. Echo loop prevention. Register in ChannelManager.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — infrastructure phase following established ChannelProvider pattern.

Key technical decisions from research:
- Use `@whiskeysockets/baileys` v6.7.x (NOT whatsapp-web.js — no Chromium needed)
- Redis-backed auth state (use `useMultiFileAuthState` equivalent with Redis read/write)
- Add `'whatsapp'` to ChannelId union type in types.ts
- Add CHANNEL_META entry for whatsapp (textLimit: 3800)
- fromMe guard on incoming messages to prevent echo loops
- Register WhatsAppProvider in ChannelManager constructor

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- ChannelProvider interface: `nexus/packages/core/src/channels/types.ts` (lines 55-82)
- TelegramProvider as reference: `nexus/packages/core/src/channels/telegram.ts`
- ChannelManager: `nexus/packages/core/src/channels/index.ts` (constructor lines 22-29)
- WhatsApp config schema already exists: `nexus/packages/core/src/config/schema.ts` (lines 182-187)
- Existing WhatsApp code in daemon.ts: sendWhatsAppResponse, getWhatsAppHistory, saveWhatsAppTurn

### Established Patterns
- Each channel: init(redis) → loadConfig from Redis → connect() → onMessage handler
- Redis config key: `nexus:{channel}:config`
- Redis history: `nexus:{channel}_history:{chatId}`
- Config updates via `nexus:channel:updated` pub/sub

### Integration Points
- ChannelManager constructor: add `this.providers.set('whatsapp', new WhatsAppProvider())`
- types.ts ChannelId: add `| 'whatsapp'`
- types.ts CHANNEL_META: add whatsapp entry
- package.json: add `@whiskeysockets/baileys` dependency

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow established ChannelProvider pattern exactly as Telegram/Discord do.

</specifics>

<deferred>
## Deferred Ideas

- QR code UI display (Phase 7)
- Message routing through daemon (Phase 8)
- Legacy daemon.ts WhatsApp code cleanup (Phase 8)

</deferred>
