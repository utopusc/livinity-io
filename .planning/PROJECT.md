# Livinity — Self-Hosted AI Server Platform

## What This Is

Livinity is a self-hosted AI-powered home server OS (LivOS) with a central platform (livinity.io) that provides tunnel routing, user registration, and API key management. Users install LivOS on their own hardware, enter an API key from livinity.io, and their server becomes accessible globally via `{username}.livinity.io`. Apps are accessible via `{app}.{username}.livinity.app`. The platform handles DNS, tunnel relay, and user management — the user just runs one command.

## Core Value

**One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.** No port forwarding, no DNS setup, no tunnel configuration — enter your API key and you're live.

## Current Milestone: v11.0 — Nexus Agent Fixes

**Goal:** Fix 27 issues in the Nexus AI agent system — sub-agent scheduling reliability, cron persistence, tool profile accuracy, session cleanup, multi-channel routing, naming consistency, system prompt completeness, and dead code removal.

**Target features:**
- Sub-agent scheduler coupling: schedule+scheduled_task validation, error on missing task
- Cron tool BullMQ migration: restart-persistent scheduled tasks
- Tool profile names aligned with actual registered tools
- MultiAgentManager periodic cleanup for stale sessions
- Multi-channel notification routing (WhatsApp/Telegram/Discord/Web)
- skills→tools naming clarification in SubagentConfig
- Native system prompt with tool awareness and sub-agent guidance
- progress_report multi-channel support
- Miscellaneous: JSON parse safety, dead code removal, atomic ops

## Requirements

### Validated

*All features from v1.0 through v7.2 — see MILESTONES.md*

Key validated capabilities:
- ✓ Web UI with desktop-like windowed interface
- ✓ Docker application management
- ✓ File manager, AI chat, tool system, skill system
- ✓ Multi-user: PostgreSQL, JWT, login screen, invite system
- ✓ Per-user isolation: files, AI, apps, settings, Docker containers
- ✓ Per-user subdomain routing, app gateway middleware
- ✓ Caddy reverse proxy, Cloudflare Tunnel support
- ✓ Onboarding wizard with personalization

### Active (v11.0 — Nexus Agent Fixes)

- [ ] Sub-agent scheduler coupling fix (schedule+scheduled_task validation)
- [ ] Cron tool BullMQ migration (restart-persistent)
- [ ] Tool profile name alignment with registered tools
- [ ] MultiAgentManager periodic stale session cleanup
- [ ] Multi-channel notification routing for scheduled/loop results
- [ ] skills→tools naming fix in SubagentConfig
- [ ] Native system prompt tool awareness + sub-agent guidance
- [ ] progress_report multi-channel support
- [ ] Misc: JSON parse safety, dead code removal, atomic Redis ops

### Out of Scope

- Mobile app — web-first approach, mobile later
- Self-hosted LLM support — Kimi Code only for now
- Payment/billing system — deferred to v8.1 (Stripe/Lemonsqueezy TBD)
- Dark theme for livinity.io — light/premium theme only
- Multi-region tunnel relay — single relay (Server5) for now
- White-label/reseller — direct platform only
- Per-user MCP server settings — deferred

## Context

**Current State (post v7.2):**
- LivOS running on production (Server4: 45.137.194.103, livinity.cloud)
- Mini PC test server (bruce-EQ: 10.69.31.68, livinity.live via CF Tunnel)
- Multi-user fully working: PostgreSQL, JWT, per-user Docker, app gateway
- install.sh one-command installer with PostgreSQL, Caddy, cloudflared
- 350 test cases written, 40/40 automated API tests passing

**Infrastructure:**
- Server4 (45.137.194.103) = LivOS production (livinity.cloud)
- Server5 (45.137.194.102) = Tunnel relay + livinity.io platform
- Mini PC (10.69.31.68) = Test server (livinity.live)

**Technical Environment:**
- LivOS: Node.js 22+, TypeScript, React 18 + Vite, Express + tRPC, Redis, PostgreSQL, Docker, Caddy
- Platform (new): Next.js 15, TypeScript, Tailwind CSS, PostgreSQL, Prisma/Drizzle

## Constraints

- **Server5 resources**: 8GB RAM — must handle tunnel relay + platform API efficiently
- **DNS**: Wildcard DNS for *.livinity.io and *.livinity.app required (Cloudflare DNS)
- **Tunnel protocol**: Must support WebSocket upgrades for tRPC subscriptions and voice
- **Latency**: Tunnel relay adds hop — must keep latency under 100ms for acceptable UX
- **Scale**: Initial target 50-100 concurrent tunnel connections

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Custom tunnel relay (not CF Tunnel) | Full control over routing, subdomain management, bandwidth tracking | Pending |
| Next.js for livinity.io | SSR for landing SEO, API routes for dashboard, React ecosystem | Pending |
| Server5 for relay | Available VPS, isolated from production LivOS | Pending |
| Free: 1 subdomain + 50GB/mo | Low barrier to entry, premium for power users | Pending |
| Payment deferred to v8.1 | Focus on core platform first, monetize after user base | Pending |
| Apple-style premium design | Differentiates from typical dev-tool aesthetic | Pending |
| Users can add custom domains | Via livinity.io dashboard, requires DNS verification | Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-22 — v11.0 milestone started (Nexus Agent Fixes)*
