# Roadmap: LivOS v7.1 — Per-User Isolation Completion

## Overview

Complete per-user isolation across UI settings, integrations, onboarding, and app store. Three phases: wallpaper animation + app store first (UI-only, quick wins), then integration/voice/MCP settings isolation (backend + frontend), finally onboarding personalization (new UI + AI prompt injection). Continues phase numbering from v7.0.

## Phases

- [ ] **Phase 6: Per-User UI Settings** — Wallpaper animation settings to PostgreSQL, App Store per-user visibility
- [ ] **Phase 7: Per-User Integration & Voice Settings** — Telegram, Discord, Gmail, MCP, Voice configs per-user with nexus-core fallback
- [ ] **Phase 8: Onboarding Personalization** — 4 AI personalization questions in onboarding wizard + system prompt injection

## Phase Details

### Phase 6: Per-User UI Settings
**Goal**: Wallpaper animation settings stored per-user in PostgreSQL (not localStorage), App Store shows correct state per user
**Requirements**: UISET-01, UISET-02, UISET-03, UISET-04, UISET-05
**Success Criteria**:
  1. User A changes wallpaper speed to 0.5x, User B still sees 1x — settings isolated
  2. Wallpaper hue/brightness/saturation persist across browser sessions via server
  3. App Store shows "Open" only for apps user has access to
  4. App Store shows "Install" or "Request Access" for apps user doesn't have
  5. Logging in as different user loads that user's wallpaper animation settings

### Phase 7: Per-User Integration & Voice Settings
**Goal**: Each user stores their own Telegram, Discord, Gmail, MCP, and Voice configurations
**Requirements**: INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-05, INTEG-06
**Success Criteria**:
  1. User A configures Telegram bot, User B's Telegram section shows unconfigured
  2. Nexus-core reads per-user integration config when processing messages
  3. Gmail OAuth per-user (each user links own Google account)
  4. MCP servers configurable per-user in Settings
  5. Voice API keys (Deepgram, Cartesia) stored per-user
  6. Admin's existing global configs auto-migrate as their per-user configs

### Phase 8: Onboarding Personalization
**Goal**: New users answer 4 personalization questions during onboarding, AI adapts its responses accordingly
**Requirements**: ONBOARD-01, ONBOARD-02, ONBOARD-03, ONBOARD-04
**Success Criteria**:
  1. Onboarding wizard shows role, use cases, style, tech stack questions after account setup
  2. Answers saved to user_preferences table
  3. AI responses reflect user's stated preferences (e.g., concise style for "brief" preference)
  4. User can edit personalization from Settings > AI section
  5. Users who skip personalization get default AI behavior

## Progress

| Phase | Status | Requirements |
|-------|--------|-------------|
| 6. UI Settings | Planned | UISET-01..05 |
| 7. Integrations & Voice | Planned | INTEG-01..06 |
| 8. Onboarding | Planned | ONBOARD-01..04 |
