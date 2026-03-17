# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-17)

**Core value:** One-command deployment of a personal AI-powered server that just works — now accessible globally via livinity.io platform.
**Current milestone:** v8.0 — Livinity Platform
**Current focus:** Defining requirements

## Current Position

Milestone: v8.0 (Livinity Platform)
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-17 — Milestone v8.0 started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

- Livinity.io = separate Next.js app (landing + auth + dashboard)
- Custom tunnel relay on Server5 (45.137.194.102), NOT Cloudflare Tunnel
- Routing: {username}.livinity.io → user's server, {app}.{username}.livinity.app → apps
- Free tier: 1 subdomain + 50GB/mo bandwidth. Premium: custom domain + unlimited
- Payment deferred to v8.1 (Stripe or Lemonsqueezy TBD)
- Apple-style premium landing page design
- Users can also add custom domains via livinity.io dashboard

### Pending Todos

- None

### Blockers/Concerns

- Tunnel relay requires persistent WebSocket/gRPC connections — needs careful architecture
- DNS wildcard for *.livinity.io and *.livinity.app required
- Server5 capacity for relay (8GB RAM, shared with other services?)

## Session Continuity

Last session: 2026-03-17
Stopped at: Starting research phase for v8.0
Resume file: None
