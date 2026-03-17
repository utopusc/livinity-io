# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-17)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v8.0 -- Livinity Platform
**Current focus:** Phase 9 -- Relay Server + Tunnel Client

## Current Position

Milestone: v8.0 (Livinity Platform)
Phase: 9 of 14 (Relay Server + Tunnel Client)
Plan: Not started (ready to plan)
Status: Ready to plan
Last activity: 2026-03-17 -- Roadmap created for v8.0, 6 phases (9-14), 51 requirements mapped

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v8.0)
- Average duration: --
- Total execution time: --

## Accumulated Context

### Decisions

- Custom tunnel relay on Server5, NOT Cloudflare Tunnel (full control over routing, metering, auth)
- Next.js 15 + Better Auth + Drizzle ORM for livinity.io platform app
- JSON+base64 message envelope for tunnel protocol (debuggable, binary deferred)
- DNS-only (grey cloud) Cloudflare records -- Caddy handles TLS via Let's Encrypt
- Free tier: 1 subdomain + 50GB/mo bandwidth, premium deferred to v8.1
- Relay and Next.js as separate processes (Next.js lacks native WS server support)
- Redis pub/sub for relay <-> Next.js communication

### Pending Todos

None

### Blockers/Concerns

- Caddy On-Demand TLS + Cloudflare DNS-01 interaction needs verification on Server5
- Let's Encrypt rate limit (50 certs/week) caps onboarding at ~50 new users/week
- Server5 has 8GB RAM shared across relay, Next.js, PostgreSQL, Redis -- memory pressure risk
- Two auth systems (platform account vs LivOS server login) may confuse users

## Session Continuity

Last session: 2026-03-17
Stopped at: Roadmap created for v8.0, ready to plan Phase 9
Resume file: None
