# Requirements: v7.1 — Per-User Isolation Completion

**Milestone:** v7.1
**Created:** 2026-03-13
**Status:** Complete
**Core Value:** Every user has fully isolated settings, integrations, and personalized AI experience.

---

## v1 Requirements

### Per-User UI Settings (UISET)

- [x] **UISET-01**: Wallpaper animation settings (speed, hueRotate, brightness, saturation, paused) stored in PostgreSQL user_preferences instead of localStorage
- [x] **UISET-02**: WallpaperProvider loads settings from server via tRPC query and saves via mutation
- [x] **UISET-03**: Settings UI wallpaper section reads/writes server-backed animation settings
- [x] **UISET-04**: App Store "Open" button only shown for apps user has access to (via myApps data)
- [x] **UISET-05**: App Store shows "Install" for globally-installed apps user doesn't have access to

### Per-User Integration Settings (INTEG)

- [x] **INTEG-01**: Livinityd AI integration routes store configs per-user in PostgreSQL user_preferences
- [x] **INTEG-02**: Admin config sync writes to both PostgreSQL and global Redis for nexus-core backward compat
- [x] **INTEG-03**: Per-user Gmail OAuth credentials stored in user_preferences
- [ ] **INTEG-04**: Per-user MCP server settings stored in user_preferences (deferred — requires deeper nexus-core changes)
- [x] **INTEG-05**: Per-user Voice settings (Deepgram API key, Cartesia API key) stored in user_preferences
- [x] **INTEG-06**: Settings UI integration sections show per-user state (each user's own config)

### Onboarding Personalization (ONBOARD)

- [x] **ONBOARD-01**: Onboarding wizard includes personalization questions (role, use cases, communication style)
- [x] **ONBOARD-02**: Personalization answers stored in user_preferences (ai_role, ai_use_cases, ai_response_style)
- [x] **ONBOARD-03**: getUserPersonalizationPromptModifier() in nexus agent.ts reads preferences and injects into AI system prompt
- [x] **ONBOARD-04**: Settings > Nexus AI Settings includes PersonalizationCard for editing preferences after onboarding

---

## Future Requirements (Deferred to v7.2+)

- Per-user Docker container isolation (compose templating per user)
- Dynamic App Gateway proxy (same subdomain → different container per user)
- Per-user storage quotas
- Per-user AI token usage quotas
- Per-user Docker network isolation
- Per-user MCP server settings (INTEG-04)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Shared bot routing | Each user has own bot token, no multi-tenant message routing |
| Per-user Docker containers | Deferred to v7.2, requires compose templating |
| Dark theme | Light theme only |
| Mobile app | Web-first approach |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UISET-01..UISET-05 | Phase 6 | Complete |
| INTEG-01..INTEG-06 | Phase 7 | Complete (INTEG-04 deferred) |
| ONBOARD-01..ONBOARD-04 | Phase 8 | Complete |

**Coverage:**
- v1 requirements: 15 total
- Complete: 14
- Deferred: 1 (INTEG-04)

---
*15 requirements across 3 categories, 14 complete, 1 deferred*
