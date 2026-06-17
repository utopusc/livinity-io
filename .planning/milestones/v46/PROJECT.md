# Milestone v46.0 — Trust, Safety, Compliance & Cost Controls

**Opened:** 2026-06-17
**Runs alongside:** v45.0 Security Hardening (in-flight; v46 does NOT close v45 — phase numbering continues 279+).
**Driver:** The session's *Cloudflare & Cost Risk Report* for the multi-tenant livinity.io architecture, plus an operator request for the user agreement and required legal documents.

## Goal

Close the legal and platform-risk exposure created by livinity.io's **single shared Cloudflare account + zone** multi-tenant model, and bound the per-user cost/abuse surface — so no single tenant can get the whole platform suspended, run up unbounded cost, or expose Livinity to liability for which there is no published policy.

## Why now (key context)

- **Single point of failure:** every tenant tunnel + per-app subdomain lives in ONE Cloudflare account/zone (`platform/web/src/lib/cf-saas.ts`). Any account/zone-level enforcement = total platform outage.
- **§2.8 / streaming:** per-app VNC desktop frames + WebApp video stream over WebSocket through Caddy → CF Tunnel → CF edge (verified: `caddy.ts` WS transport, `vnc-bridge.ts` WS↔TCP bridge). This is exactly the video / disproportionate-non-HTML profile CF's CDN terms restrict.
- **Legal gap:** the signup flow (`platform/web/public/auth.html:951`) already states users "agree to our Terms and Privacy", but both links are dead (`href="#"`). We are taking consent to documents that do not exist.
- **Cost/abuse:** unauthenticated/un-rate-limited endpoints (`resend-verification`, `forgot-password`, `username-available`, `webapp/preview`, `app-subdomain`) let one actor flood email (Resend $ + reputation), exhaust the shared DNS quota, or drive egress.

## Target features

- Five published, brand-styled legal/policy documents wired into signup + footers (Terms, Privacy w/ GDPR+KVKK rights + sub-processors, Acceptable Use, Cookies, Refund/Cancellation).
- Abuse-response capability (monitored CF abuse contact, 24h intake pipeline, CSAM scanning, one-action tenant suspension).
- Cloudflare compliance posture (written multi-tenant authorization, a recorded §2.8 streaming decision, per-tenant bandwidth monitoring).
- Endpoint rate-limiting + email idempotency.
- Per-user DNS/app quotas + a resilient provisioning queue + orphan reconciliation.
- Spend caps, CF caching of static assets, cleanup crons, per-user tunnel-token encryption.

## Locked decisions (operator, 2026-06-17)

- **Scope:** legal documents + the full P0/P1/P2 technical hardening roadmap.
- **Governing law:** United States / Delaware. Entity name, address, and contact are `[PLACEHOLDER]` until the legal entity is finalized.
- **Language:** English.
- **Document set:** Terms of Service, Privacy Policy (covers GDPR + KVKK data-subject rights and the sub-processor list), Acceptable Use Policy, Cookie Policy, Refund & Cancellation Policy.
- **Site placement:** `platform/web` (Next.js / Vercel) — a `/legal` hub plus `/legal/terms`, `/legal/privacy`, `/legal/acceptable-use`, `/legal/cookies`, `/legal/refund`, brand-styled to match `/docs`. Dead `auth.html` Terms/Privacy links + footers wired to the real pages; explicit consent recorded at signup.

## Out of scope (this milestone)

- Drafting bespoke contracts reviewed by counsel — the documents are professional, comprehensive templates with placeholders; a licensed attorney should review before relying on them in a dispute.
- Migrating tenants to per-account Cloudflare isolation (a larger architectural effort; tracked as a future consideration).
- Replacing the VNC/WebSocket streaming transport (Phase 281 only records the §2.8 decision; any transport change is a separate milestone).

---
*Last updated: 2026-06-17 — v46.0 opened.*
