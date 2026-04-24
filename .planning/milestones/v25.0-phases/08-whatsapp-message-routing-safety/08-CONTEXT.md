# Phase 8: WhatsApp Message Routing & Safety - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire WhatsApp messages through the standard ChannelManager → daemon agent pipeline. Add rate limiting to prevent WhatsApp account bans. Remove legacy daemon.ts WhatsApp ad-hoc code (sendWhatsAppResponse, getWhatsAppHistory, saveWhatsAppTurn, wa_outbox).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — infrastructure phase.

Key technical decisions:
- WhatsApp messages must flow through ChannelManager.onMessage → daemon handleIncomingMessage (same as Telegram/Discord)
- Rate limiter: 10 msg/min, 80 msg/hour, randomized delays (1-3s between messages)
- Rate limiter implementation: Redis sliding window (ZRANGEBYSCORE pattern) or simple token bucket
- Legacy cleanup: remove sendWhatsAppResponse, getWhatsAppHistory, saveWhatsAppTurn, wa_outbox/wa_pending Redis patterns from daemon.ts
- WhatsApp responses should go through WhatsAppProvider.sendMessage() not legacy outbox
- Keep whatsapp_send tool functional but route through WhatsAppProvider

</decisions>

<code_context>
## Existing Code Insights

### Legacy Code to Remove (daemon.ts)
- sendWhatsAppResponse (~lines 3235-3282): chunks text, uses wa_pending/wa_outbox Redis
- getWhatsAppHistory (~lines 3327-3369): queries all wa_history:* keys
- saveWhatsAppTurn (~lines 3372-3386): Redis list with 24h TTL
- wa_outbox/wa_pending Redis keys: legacy polling delivery mechanism
- whatsapp_send tool (~lines 1658-1706): conditional registration

### Standard Flow (Telegram reference)
- TelegramProvider.onMessage → handler → daemon.handleIncomingMessage
- Daemon creates InboxItem with source, from, conversationHistory
- Agent processes task → response sent via channel.sendMessage()

### Integration Points
- WhatsAppProvider already has onMessage handler from Phase 6
- daemon.ts handleIncomingMessage already handles 'whatsapp' source
- Rate limiter should wrap WhatsAppProvider.sendMessage()

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow standard channel message flow.

</specifics>

<deferred>
## Deferred Ideas

- WhatsApp group message support — v26.0
- Media message support (images, voice) — v26.0

</deferred>
