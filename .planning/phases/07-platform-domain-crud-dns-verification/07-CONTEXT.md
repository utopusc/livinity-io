# Phase 07: Platform Domain CRUD + DNS Verification - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers custom domain registration and DNS verification on the livinity.io platform (Next.js app at `platform/web/`). Users add domains on the dashboard, receive DNS instructions, and the platform verifies ownership. No LivOS integration, no tunnel sync, no Caddy config — those are Phase 08-09.

</domain>

<decisions>
## Implementation Decisions

### Database Schema Design
- 6 domain status states: `pending_dns`, `dns_verified`, `dns_failed`, `active`, `dns_changed`, `error`
- TXT record at `_livinity-verification.{domain}` — industry convention (_-prefix subdomain)
- Verification token: `crypto.randomBytes(32).toString('hex')` — 64-char hex string
- Free tier limit: 3 domains per user

### DNS Verification Logic
- Polling: 30s for first hour after domain addition, then 5min intervals — fast initial feedback
- DNS resolvers: system resolver (`dns.resolve4()`) + cross-check via Cloudflare 1.1.1.1 DoH
- Verification timeout: 48 hours — domain goes to `dns_failed` after timeout, user can retry
- Re-verification: every 12 hours for verified/active domains — catches DNS changes

### Dashboard UI Layout
- New "Domains" section on existing `/dashboard` page — single-page simplicity
- Inline add form: domain input + Add button → DNS instructions card appears below
- Colored status badges: green=active, yellow=pending, red=error
- DNS instructions: copy-to-clipboard cards ("A Record → 45.137.194.102", "TXT Record → token")

### Claude's Discretion
- Drizzle migration file naming and numbering
- Error message wording for DNS failures
- Exact polling implementation (setInterval vs cron-like)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `platform/web/src/db/schema.ts` — Drizzle schema with existing tables (apps, devices, etc.)
- `platform/web/src/db/migrations/` — 5 existing migrations (0000-0004)
- `platform/web/src/lib/auth.ts` — Session auth with `getUser()` helper
- `platform/web/src/lib/api-auth.ts` — API key auth via X-Api-Key header
- `platform/web/src/app/dashboard/page.tsx` — Existing dashboard page to extend
- Custom motion primitives (38 components) for animations

### Established Patterns
- Next.js App Router with file-based routing (`app/api/` for API routes)
- Drizzle ORM with PostgreSQL for all data
- Session-based auth with `liv_session` cookie (30-day expiry)
- API routes use `getUser()` for auth, return JSON responses
- Tailwind CSS v4 with custom design tokens (teal primary, Space Grotesk font)
- Lucide React icons, Motion library for animations
- Apple Store aesthetic, light-only, minimal design

### Integration Points
- Dashboard page at `app/dashboard/page.tsx` — add Domains section here
- API routes at `app/api/` — add `domains/` route directory
- DB schema at `db/schema.ts` — add `customDomains` table
- DB migrations at `db/migrations/` — add migration 0005

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing platform patterns.

</specifics>

<deferred>
## Deferred Ideas

- CNAME record support (v20+)
- Wildcard domain support (v20+)
- Domain transfer between users
- Premium tier with higher domain limits

</deferred>
