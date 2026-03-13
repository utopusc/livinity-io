# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** One-command deployment of a personal AI-powered server that just works — now for the whole household.
**Current milestone:** v7.1 — Per-User Isolation Completion
**Current focus:** Planning and executing phases

## Current Position

Milestone: v7.1 (Per-User Isolation Completion) — Starting
Phase: Not started
Plan: —
Status: Defining requirements and roadmap
Last activity: 2026-03-13 — Milestone v7.1 started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

- Per-user settings via user_preferences table (key-value, already exists)
- Wallpaper animation: migrate from localStorage to PostgreSQL user_preferences
- Integration configs: each user stores their own bot tokens (not shared bot routing)
- Nexus-core reads per-user config with fallback to global for backward compat
- Onboarding: 4 questions (role, use cases, style, tech stack) → stored as preferences → injected into AI prompt
- App Store: filter "Open" button based on user_app_access

### Pending Todos

- None — starting fresh

### Blockers/Concerns

- Nexus-core runs compiled JS — must rebuild after every source change
- Global Redis keys must keep working as fallback for admin

## Session Continuity

Last session: 2026-03-13
Stopped at: Milestone initialized, creating requirements and roadmap
Resume file: None
