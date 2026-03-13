# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** One-command deployment of a personal AI-powered server that just works — now for the whole household.
**Current milestone:** v7.1 — Per-User Isolation Completion
**Current focus:** Deploy and verify

## Current Position

Milestone: v7.1 (Per-User Isolation Completion) — Complete
Phase: All phases (6, 7, 8) complete
Plan: —
Status: Ready for deployment
Last activity: 2026-03-13 — All phases implemented and committed

Progress: [██████████] 100%

## Accumulated Context

### Decisions

- Per-user settings via user_preferences table (key-value JSONB, already exists)
- Wallpaper animation: migrated from localStorage to PostgreSQL user_preferences with server sync
- Integration configs: per-user PostgreSQL storage, admin also syncs to global Redis for backward compat
- Nexus-core reads per-user personalization from request body (livinityd reads from PostgreSQL)
- Onboarding: 3 questions (role, use cases, style) → localStorage during invite → synced on first login
- App Store: filter "Open" button based on user_app_access, show "Install" for unowned apps
- INTEG-04 (per-user MCP settings) deferred to v7.2 — requires deeper nexus-core architecture changes

### Pending Todos

- Deploy to production (UI build + nexus-core rebuild + PM2 restart)
- Verify onboarding flow on production

### Blockers/Concerns

- Nexus-core runs compiled JS — must rebuild after every source change
- Global Redis keys must keep working as fallback for admin

## Session Continuity

Last session: 2026-03-13
Stopped at: All phases complete, ready for deployment
Resume file: None
