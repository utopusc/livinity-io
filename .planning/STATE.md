# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** One-command deployment of a personal AI-powered server that just works — now for the whole household.
**Current milestone:** v7.0 — Multi-User Support
**Current focus:** Defining requirements

## Current Position

Milestone: v7.0 (Multi-User Support) — Starting
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-12 — Milestone v7.0 started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

- LivOS acts as dynamic proxy (Caddy wildcard → LivOS → per-user container routing)
- PostgreSQL replaces YAML FileStore for multi-user data
- Domain-wide SSO cookie on .livinity.cloud for seamless subdomain auth
- Same subdomain serves different containers based on authenticated user
- Docker compose files templated per-user (container name, port, volume, network)
- Invite-only user registration (admin generates invite links)
- Shared Kimi API auth, per-user AI data isolation via Redis key namespacing
- Apps declare multiUserMode in manifest: 'shared' (single container) or 'isolated' (per-user)

### Pending Todos

- None — starting fresh

### Blockers/Concerns

- Docker compose files come from GitHub — templating must handle arbitrary compose structures
- 8GB RAM budget limits per-user container count (need resource tracking)
- Existing single-user data must auto-migrate to admin account on first boot

## Session Continuity

Last session: 2026-03-12
Stopped at: Milestone initialized, ready for research/requirements
Resume file: None
