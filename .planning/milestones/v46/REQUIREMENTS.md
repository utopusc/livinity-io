# Requirements: Milestone v46.0 — Trust, Safety, Compliance & Cost Controls

**Defined:** 2026-06-17
**Core Value:** No single tenant can suspend the platform, run up unbounded cost, or expose Livinity to un-papered liability.

## v1 Requirements

### Legal & Policy (LEGAL) — Phase 279

- [x] **LEGAL-01**: Visitor can read the Terms of Service at `/legal/terms`
- [x] **LEGAL-02**: Visitor can read the Privacy Policy (GDPR + KVKK data-subject rights + sub-processor list) at `/legal/privacy`
- [x] **LEGAL-03**: Visitor can read the Acceptable Use Policy at `/legal/acceptable-use`
- [x] **LEGAL-04**: Visitor can read the Cookie Policy at `/legal/cookies`
- [x] **LEGAL-05**: Visitor can read the Refund & Cancellation Policy at `/legal/refund`
- [x] **LEGAL-06**: A `/legal` hub page lists and links every policy document
- [x] **LEGAL-07**: Signup flow links to the real Terms & Privacy (no dead `href="#"`) and records explicit consent
- [x] **LEGAL-08**: Site footers (homepage + docs) link to the legal pages

### Abuse Response & CSAM (ABUSE) — Phase 280 (P0)

- [ ] **ABUSE-01**: A monitored mailbox (`abuse@livinity.io`) is set as the Cloudflare account abuse contact
- [ ] **ABUSE-02**: A Cloudflare abuse notification auto-creates an internal alert/ticket (24-hour response SLA)
- [ ] **ABUSE-03**: Cloudflare CSAM Scanning Tool is enabled on the `livinity.io` zone
- [ ] **ABUSE-04**: Admin can suspend a tenant (disable tunnel + DNS) from a single action
- [ ] **ABUSE-05**: Terms/AUP grant Livinity the right to immediately suspend a tenant on an abuse finding

### Cloudflare Compliance (CFC) — Phase 281 (P0)

- [ ] **CFC-01**: Written confirmation (or Enterprise agreement) that the multi-tenant tunnel / for-SaaS model is permitted under CF's proxy/resell clauses
- [ ] **CFC-02**: A recorded decision on §2.8 streaming (remain/Enterprise vs. move heavy streaming off the orange-cloud CDN path)
- [ ] **CFC-03**: Per-tenant Cloudflare bandwidth monitoring with anomaly alerting

### Endpoint Hardening (HARDEN) — Phase 282 (P1)

- [x] **HARDEN-01**: `resend-verification` is IP- and email-rate-limited
- [x] **HARDEN-02**: `forgot-password` is IP- and email-rate-limited
- [x] **HARDEN-03**: `username-available` is IP-rate-limited (with a reserved-username cache)
- [x] **HARDEN-04**: `webapp/preview` is per-API-key rate-limited and byte-capped
- [x] **HARDEN-05**: `app-subdomain` provisioning is per-API-key rate-limited
- [x] **HARDEN-06**: Transactional email sends are idempotent (idempotency key) to prevent duplicate-send floods

### Quotas & Provisioning Resilience (QUOTA) — Phase 283 (P1)

- [x] **QUOTA-01**: A per-user cap on app subdomains / DNS records is enforced before any Cloudflare create
- [ ] **QUOTA-02**: Provisioning runs through a queue with a concurrency cap and exponential backoff on HTTP 429
- [ ] **QUOTA-03**: A daily reconciliation job deletes orphan DNS records that no longer map to an active subdomain
- [ ] **QUOTA-04**: Zone DNS-record-count monitoring alerts at 80% of quota

### Cost Controls (COST) — Phase 284 (P2)

- [ ] **COST-01**: Vercel Spend Management cap + alert is configured
- [ ] **COST-02**: Static docs/legal assets are served via a Cloudflare cache in front of Vercel
- [ ] **COST-03**: A cleanup cron prunes stale `pending_registrations`
- [ ] **COST-04**: Tunnel-token encryption uses per-user key derivation (HKDF) or a secrets manager
- [ ] **COST-05**: Supabase egress / Realtime / storage usage alerts are configured

## v2 Requirements (deferred)

### Tenant Isolation (ISO)

- **ISO-01**: Each tenant (or cohort) provisioned to its own Cloudflare account/zone to remove the shared-account blast radius
- **ISO-02**: Streaming transport moved off the CF CDN path (Spectrum / direct / WebRTC) if Phase 281 requires it

## Out of Scope

| Feature | Reason |
|---------|--------|
| Counsel-reviewed bespoke contracts | These are professional templates with placeholders; attorney review is a separate, non-engineering step |
| Per-tenant CF account migration | Large architectural change; deferred to v2 (ISO-01) |
| Replacing the VNC/WebSocket streaming transport | Phase 281 records the decision only; any transport swap is its own milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LEGAL-01..08 | Phase 279 | Complete (shipped a056d359 + d1318d19, live-verified) |
| ABUSE-01..05 | Phase 280 | Pending |
| CFC-01..03 | Phase 281 | Pending |
| HARDEN-01..06 | Phase 282 | Complete (e2281ede, live-verified 429) |
| QUOTA-01 | Phase 283 | Complete (fd01d4d2) | | QUOTA-02..04 | Phase 283 | Pending |
| COST-01..05 | Phase 284 | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-17*
