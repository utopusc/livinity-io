# Phase 279 — Legal & Policy Documents + site integration

**Milestone:** v46.0 Trust, Safety, Compliance & Cost Controls
**Requirements:** LEGAL-01..08
**Status:** Executing in-session (2026-06-17)
**Surface:** `platform/web` (Next.js 16 / Vercel). All static content (legal text changes rarely → versioned in git, no DB).

## Decisions

- **Governing law:** United States / Delaware. Entity/address/contact = `[PLACEHOLDER]` tokens (operator fills when the entity is finalized).
- **Language:** English.
- **Rendering:** reuse the shipped docs visual system — `docs.css` `.docs-root` / `.docs-prose` + the markdown renderer — via a dedicated `/legal` layout (lightweight nav, no search). Content stored as markdown strings in `src/app/legal/_content/`.
- **No DB / admin editing** for legal docs (unlike `/docs`): legal text is git-versioned for an auditable change history.

## Tasks

1. **Content** — author 5 documents as markdown in `src/app/legal/_content/{terms,privacy,acceptable-use,cookies,refund}.ts`:
   - Terms of Service — acceptance, accounts, subscription/billing, acceptable use (links AUP), user content + tenant responsibility, IP, disclaimers, limitation of liability, indemnity, suspension/termination (immediate on abuse), governing law (Delaware), changes.
   - Privacy Policy — data collected, purposes, legal bases, retention, sub-processors (Supabase, Vercel, Cloudflare, Stripe, Resend), international transfer, security, **GDPR** rights, **KVKK (Türkiye)** rights + data-controller notice, cookies (links Cookie Policy), children, contact.
   - Acceptable Use Policy — prohibited: illegal content, phishing/malware/C2, CSAM (zero tolerance + immediate removal), spam, IP infringement, open proxy/VPN egress, crypto mining, attack traffic / DoS, disproportionate-bandwidth / video abuse through the CDN, reselling. Enforcement + reporting (`abuse@livinity.io`).
   - Cookie Policy — essential session cookie (`liv_session`), what's set, no third-party ad tracking, how to control.
   - Refund & Cancellation — subscription terms, trial, cancel-anytime, refund eligibility, Stripe billing, data export/retention on cancellation.
2. **Pages** — `src/app/legal/layout.tsx` (brand shell reusing `docs.css`) + `src/app/legal/page.tsx` (hub) + `src/app/legal/[doc]/page.tsx` (renders the matching document via the shared markdown renderer, `generateStaticParams` over the 5 slugs, proper `<h1>` + "Last updated" + governing-law line). 404 for unknown slugs.
3. **Wiring** — replace dead `href="#"` Terms/Privacy in `public/auth.html` signup with `/legal/terms` + `/legal/privacy` (+ keep/extend the explicit-consent copy); add a "Legal" cluster to the homepage footer (`public/sections.jsx`) and the docs footer (`src/app/docs/layout.tsx`) linking the legal pages.
4. **Verify & ship** — `tsc --noEmit` + `eslint` clean; commit; push to master; after Vercel deploy curl `/legal` + all 5 docs for 200 and confirm the signup/footers link to real pages.

## Acceptance (maps to success criteria)

- [ ] `/legal` + 5 doc routes → 200, brand-styled, readable (LEGAL-01..06)
- [ ] Signup links resolve to real pages + consent recorded (LEGAL-07)
- [ ] Homepage + docs footers link to `/legal/*` (LEGAL-08)
- [ ] English, Delaware governing law, placeholders present; Privacy covers GDPR + KVKK + sub-processors (LEGAL-02)
