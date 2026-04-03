# Requirements: Livinity v25.0 — Memory & WhatsApp Integration

**Defined:** 2026-04-02
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v25.0 Requirements

### WhatsApp Channel

- [ ] **WA-01**: User can connect WhatsApp by scanning QR code in Settings > Integrations
- [ ] **WA-02**: WhatsApp connection persists across server restarts (Redis auth state)
- [ ] **WA-03**: User can send messages to AI via WhatsApp and receive responses
- [ ] **WA-04**: WhatsApp channel uses ChannelProvider pattern (like Telegram/Discord)
- [ ] **WA-05**: Rate limiting prevents WhatsApp account ban (10 msg/min, randomized delays)
- [ ] **WA-06**: Settings UI shows WhatsApp connection status and disconnect button

### Cross-Session Memory

- [ ] **MEM-01**: AI can search past conversations semantically ("what did we discuss about Docker?")
- [ ] **MEM-02**: Conversation turns persisted to SQLite FTS5 for full-text search
- [ ] **MEM-03**: conversation_search tool registered in ToolRegistry for AI use
- [ ] **MEM-04**: Legacy daemon.ts WhatsApp ad-hoc code consolidated into ChannelManager

### Memory Management UI

- [ ] **UI-01**: Settings > Memory page showing stored memories with search
- [ ] **UI-02**: User can delete individual memories
- [ ] **UI-03**: User can view conversation history from all channels

### Identity

- [ ] **ID-01**: Unified userId mapping across channels (Telegram, WhatsApp, Web UI, Discord)

## v26.0 Requirements (Deferred)

### Advanced Memory

- **MEM-05**: AI can generate conversation summaries and store as high-level memories
- **MEM-06**: Memory importance scoring with user feedback (thumbs up/down)

### WhatsApp Advanced

- **WA-07**: WhatsApp group message support with mention activation
- **WA-08**: Pairing code fallback (alternative to QR code)
- **WA-09**: Media message support (images, voice notes)

## Out of Scope

| Feature | Reason |
|---------|--------|
| PostgreSQL conversation backup | User explicitly excluded — Redis-only for now |
| WhatsApp Business API | Defeats self-hosting philosophy, requires Meta approval |
| Vector database (Qdrant/Pinecone) | SQLite FTS5 + existing Kimi embeddings sufficient |
| End-to-end encryption for memory | Self-hosted, local SQLite is trusted storage |
| Multi-account WhatsApp | Single account per LivOS instance |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WA-01 | — | Pending |
| WA-02 | — | Pending |
| WA-03 | — | Pending |
| WA-04 | — | Pending |
| WA-05 | — | Pending |
| WA-06 | — | Pending |
| MEM-01 | — | Pending |
| MEM-02 | — | Pending |
| MEM-03 | — | Pending |
| MEM-04 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| ID-01 | — | Pending |

**Coverage:**
- v25.0 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after initial definition*
