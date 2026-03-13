# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** One-command deployment of a personal AI-powered server that just works — now for the whole household.
**Current milestone:** Pending — v7.1 and v7.2 complete
**Current focus:** Define next milestone

## Current Position

Milestone: v7.2 (Per-User Docker Isolation & Bugfixes) — Complete
Phase: All complete
Plan: —
Status: Ready for next milestone
Last activity: 2026-03-13 — All per-user isolation + Docker bugs fixed, 24/24 tests pass

Progress: [██████████] 100%

## Accumulated Context

### Decisions

- Per-user settings via user_preferences table (key-value JSONB)
- Per-user Docker containers with dedicated ports (10000+), subdomains (appId-username), and volumes
- INTEG-04 (per-user MCP settings) deferred — requires deeper nexus-core architecture changes
- Global Jellyfin compose fixed (8096:8096 instead of 8096:7359)
- JWT with {loggedIn, userId, role} — shared between livinityd and nexus-core via /data/secrets/jwt

### Pending Todos

- None — all v7.1 + v7.2 work deployed and verified

### Blockers/Concerns

- Nexus-core runs compiled JS — must rebuild after every source change
- Global Redis keys must keep working as fallback for admin
- 8GB RAM server limit with 3-5 users + Docker containers

## Session Continuity

Last session: 2026-03-13
Stopped at: All milestones complete, defining next milestone
Resume file: None
