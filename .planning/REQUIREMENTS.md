# Requirements: v7.1 — Per-User Isolation Completion

**Milestone:** v7.1
**Created:** 2026-03-13
**Status:** Active
**Core Value:** Every user has fully isolated settings, integrations, and personalized AI experience.

---

## v1 Requirements

### Per-User UI Settings (UISET)

- [ ] **UISET-01**: Wallpaper animation settings (speed, hueRotate, brightness, saturation, paused) stored in PostgreSQL user_preferences instead of localStorage
- [ ] **UISET-02**: WallpaperProvider loads settings from server via tRPC query and saves via mutation
- [ ] **UISET-03**: Settings UI wallpaper section reads/writes server-backed animation settings
- [ ] **UISET-04**: App Store "Open" button only shown for apps user has access to (via myApps data)
- [ ] **UISET-05**: App Store shows "Install" for globally-installed apps user doesn't have access to

### Per-User Integration Settings (INTEG)

- [ ] **INTEG-01**: Livinityd AI integration routes store configs per-user in Redis (nexus:u:{userId}:telegram:config etc.)
- [ ] **INTEG-02**: Nexus-core integration bootstrap reads per-user config with fallback to global key
- [ ] **INTEG-03**: Per-user Gmail OAuth credentials stored in user_preferences
- [ ] **INTEG-04**: Per-user MCP server settings stored in user_preferences
- [ ] **INTEG-05**: Per-user Voice settings (Deepgram API key, Cartesia API key) stored in user_preferences
- [ ] **INTEG-06**: Settings UI integration sections show per-user state (each user's own config)

### Onboarding Personalization (ONBOARD)

- [ ] **ONBOARD-01**: Onboarding wizard includes 4 personalization questions (role, use cases, communication style, tech stack)
- [ ] **ONBOARD-02**: Personalization answers stored in user_preferences (ai_role, ai_use_cases, ai_response_style, ai_tech_stack)
- [ ] **ONBOARD-03**: getUserContextPromptModifier() in nexus agent.ts reads preferences and prepends to AI system prompt
- [ ] **ONBOARD-04**: Settings > AI section allows editing personalization preferences after onboarding

---

## Future Requirements (Deferred to v7.2+)

- Per-user Docker container isolation (compose templating per user)
- Dynamic App Gateway proxy (same subdomain → different container per user)
- Per-user storage quotas
- Per-user AI token usage quotas
- Per-user Docker network isolation

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
| UISET-01..UISET-05 | Phase 6 | Pending |
| INTEG-01..INTEG-06 | Phase 7 | Pending |
| ONBOARD-01..ONBOARD-04 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*15 requirements across 3 categories, mapped to 3 phases*
