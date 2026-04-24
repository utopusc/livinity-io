# Phase 10: Unified Identity & Memory Management UI - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Create cross-channel userId mapping table so the same person is recognized across Telegram, WhatsApp, Web UI, and Discord. Add Settings > Memory page for browsing, searching, and deleting stored memories and conversation history.

</domain>

<decisions>
## Implementation Decisions

### Unified userId Mapping
- PostgreSQL table: `channel_identity_map` (userId, channel, channelUserId, linkedAt)
- When a channel message arrives, lookup channelUserId → get canonical userId
- If no mapping exists, create one (auto-link for same user on multiple channels)
- Admin can manually link identities in Settings (future, but table structure supports it)
- DmPairing already maps Telegram users — extend concept to all channels

### Memory Management UI
- New Settings section: "Memory" (alongside Account, Theme, Language, etc.)
- Shows two tabs: "Memories" (extracted facts) and "Conversations" (archived turns)
- Memories tab: list of stored memories with search, delete button per item
- Conversations tab: list of conversations grouped by channel with search, channel icon
- tRPC routes to proxy memory service endpoints (GET /memories/:userId, DELETE /memories/:id, POST /conversation-search)
- Mobile responsive (follow Phase 24 patterns — single column, touch targets)

### Claude's Discretion
- Exact layout and styling of Memory page
- How conversations are grouped/displayed (by date vs by channel vs flat list)
- Pagination approach

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Settings section pattern: `settings-content.tsx` (SettingsContent, SectionContent, menu items)
- Memory service API: port 3300, /memories/:userId, /search, /conversation-search
- DmPairing: `nexus/packages/core/src/dm-pairing.ts` — existing identity mapping for Telegram
- PostgreSQL pool: `livos/packages/livinityd/source/modules/database/` — getPool()
- trpcReact hooks in UI for data fetching

### Established Patterns
- Settings sections registered in menuItems array with id, icon, label, description
- Each section renders via SectionContent switch
- tRPC routes proxy to Nexus REST or direct Redis/PostgreSQL
- Mobile: useIsMobile() for responsive conditional rendering

### Integration Points
- settings-content.tsx: add 'memory' section to menuItems, add MemorySection component
- ai/routes.ts: add tRPC routes for memory listing, deletion, conversation search
- PostgreSQL schema: add channel_identity_map table
- ChannelManager: lookup canonical userId before passing to daemon

</code_context>

<specifics>
## Specific Ideas

- Memory page icon: TbBrain or TbDatabase from react-icons
- Channel icons next to conversation entries (TbBrandTelegram, TbBrandWhatsapp, etc.)

</specifics>

<deferred>
## Deferred Ideas

- Manual identity linking UI — future
- Memory export/import — future
- Conversation deletion from archive — future (only memory deletion for now)

</deferred>
