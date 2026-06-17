# Roadmap — Milestone v46.0 Trust, Safety, Compliance & Cost Controls

**6 phases (279–284)** | **31 requirements mapped** | All covered ✓
Phase numbering continues from v45 (last phase 278). Priorities: P0 = platform-fatal, P1 = single-attacker abuse/cost, P2 = cost hygiene.

| # | Phase | Priority | Requirements | Success criteria |
|---|-------|----------|--------------|------------------|
| 279 | Legal & Policy Documents + site integration | — (now) | LEGAL-01..08 | 4 |
| 280 | Abuse Response & CSAM readiness | P0 | ABUSE-01..05 | 4 |
| 281 | Cloudflare Compliance | P0 | CFC-01..03 | 3 |
| 282 | Endpoint Hardening | P1 | HARDEN-01..06 | 3 |
| 283 | Quotas & Provisioning Resilience | P1 | QUOTA-01..04 | 4 |
| 284 | Cost Controls | P2 | COST-01..05 | 5 |

---

## Phase 279: Legal & Policy Documents + site integration

**Goal:** Publish the five core legal/policy documents and wire them into signup + footers so livinity.io is legally covered and the dead Terms/Privacy links are resolved.
**Requirements:** LEGAL-01, LEGAL-02, LEGAL-03, LEGAL-04, LEGAL-05, LEGAL-06, LEGAL-07, LEGAL-08
**Success criteria:**
1. `/legal` hub + `/legal/{terms,privacy,acceptable-use,cookies,refund}` all return 200 with brand-styled, readable content.
2. Signup (`auth.html`) links to the real Terms & Privacy (no `href="#"`) and records explicit consent.
3. Homepage (`sections.jsx`) and docs footers link to the legal pages.
4. All documents are English, US/Delaware governing law, with `[PLACEHOLDER]` entity/address/contact fields; Privacy covers GDPR + KVKK rights and lists sub-processors (Supabase, Vercel, Cloudflare, Stripe, Resend).

## Phase 280: Abuse Response & CSAM readiness (P0)

**Goal:** Stand up abuse handling so a tenant hosting illegal/abusive content cannot get the whole Cloudflare account suspended.
**Requirements:** ABUSE-01, ABUSE-02, ABUSE-03, ABUSE-04, ABUSE-05
**Success criteria:**
1. `abuse@livinity.io` is the CF account abuse contact and is actively monitored.
2. A CF abuse notification produces an internal alert/ticket within minutes (24h SLA path).
3. CF CSAM Scanning is enabled on the `livinity.io` zone.
4. Admin can suspend a tenant (tunnel + DNS disabled) from one action, backed by the AUP suspension right.

## Phase 281: Cloudflare Compliance (P0)

**Goal:** Remove the existential CF account-termination ambiguity (proxy/resell + §2.8 streaming) and gain bandwidth visibility.
**Requirements:** CFC-01, CFC-02, CFC-03
**Success criteria:**
1. Written confirmation (or an Enterprise agreement) that the multi-tenant tunnel/for-SaaS model is permitted — or a documented remediation path.
2. A recorded decision on §2.8 streaming (stay/Enterprise vs. move heavy streaming off the CDN path).
3. Per-tenant CF bandwidth monitoring + anomaly alerting is live.

## Phase 282: Endpoint Hardening (P1)

**Goal:** Stop a single attacker from running up cost/abuse through unprotected endpoints.
**Requirements:** HARDEN-01, HARDEN-02, HARDEN-03, HARDEN-04, HARDEN-05, HARDEN-06
**Success criteria:**
1. `resend-verification`, `forgot-password`, `username-available`, `webapp/preview`, and `app-subdomain` all enforce IP/per-key rate limits (a flood test returns HTTP 429).
2. Transactional email sends are idempotent (a duplicate trigger does not double-send).
3. No regression to legitimate signup / app-install flows.

## Phase 283: Quotas & Provisioning Resilience (P1)

**Goal:** Prevent shared-zone DNS-quota exhaustion and global API 429 blackouts, and clean up orphan records.
**Requirements:** QUOTA-01, QUOTA-02, QUOTA-03, QUOTA-04
**Success criteria:**
1. A per-user app/subdomain cap is enforced before any CF create (exceeding it is rejected).
2. Provisioning runs through a queue with a concurrency cap + backoff (a signup burst does not trigger 429).
3. A daily reconciliation job removes orphan DNS records.
4. A zone DNS-count alert fires at 80% of quota.

## Phase 284: Cost Controls (P2)

**Goal:** Cap and observe spend across Vercel / Supabase / Cloudflare, and harden token storage.
**Requirements:** COST-01, COST-02, COST-03, COST-04, COST-05
**Success criteria:**
1. Vercel Spend Management cap + alert is active.
2. Static docs/legal assets are served via a Cloudflare cache (cache HIT verified).
3. A cleanup cron prunes stale `pending_registrations`.
4. Tunnel tokens use per-user key derivation / a secrets manager.
5. Supabase usage alerts are configured.

---
*Roadmap created: 2026-06-17. Detailed per-phase plans authored via `/gsd-plan-phase [N]`; Phase 279 executed in-session (see `.planning/phases/279-legal-policy-docs/PLAN.md`).*
