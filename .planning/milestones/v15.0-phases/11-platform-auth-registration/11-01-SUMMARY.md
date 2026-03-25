---
phase: 11-platform-auth-registration
plan: 01
status: complete
---

# 11-01 Summary: Platform Auth & Registration

## What was built
Full auth system: registration, login, logout, email verification, password reset, sessions.
Next.js 15 app deployed on Server5 at livinity.io.

## Files created
- `platform/web/` — Next.js 15 project with App Router, Tailwind CSS
- `platform/web/src/lib/db.ts` — PostgreSQL pool
- `platform/web/src/lib/auth.ts` — bcrypt, sessions, username validation, reserved words
- `platform/web/src/lib/email.ts` — Resend integration with dev console fallback
- 7 API routes: register, login, logout, me, verify-email, forgot-password, reset-password
- 6 UI pages: login, register, verify, forgot-password, reset-password, dashboard
- `platform/web/ecosystem.config.cjs` — PM2 config for Server5

## Files modified
- `platform/relay/src/schema.sql` — Added sessions table, auth token columns
- `platform/relay/Caddyfile` — Split: livinity.io → :3000, *.livinity.io → :4000

## Infrastructure changes
- Cloudflare: `livinity.io` A record updated to 45.137.194.102 (DNS only)
- Server5: web app running on port 3000 via PM2
- Caddy: routes bare domain to Next.js, subdomains to relay

## E2E Verification
- `https://livinity.io/login` → 200 (login page)
- Register user "alice" → success (UUID assigned, session created)
- Login → success (session cookie set)
- `https://testuser.livinity.io` → 503 offline page (correct, no tunnel)
- Email verification: dev mode (console log, no RESEND_API_KEY set yet)

## Requirements covered
- AUTH-01: Register with email + password ✅
- AUTH-02: Email verification via Resend ✅ (dev mode, needs API key for production)
- AUTH-03: Unverified users cannot generate API keys ✅ (emailVerified flag tracked)
- AUTH-04: Login with 30d httpOnly secure cookie ✅
- AUTH-05: Password reset via email link ✅
- AUTH-06: Username validation (3-30, alphanumeric+hyphens, reserved words) ✅
