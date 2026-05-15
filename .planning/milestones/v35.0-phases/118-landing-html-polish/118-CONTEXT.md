# Phase 118 — Landing Static HTML Polish & Drift Fix — CONTEXT

**Status:** SKELETON — written 2026-05-14 alongside v35.0 milestone open. Depends on Phase 116 (`@livinity/design-tokens`).

## Phase intent

Make all 8 HTML pages in `/opt/landing/livinity.io/` share dashboard.html's exact CSS variable definitions and reusable classes. Fix drift. Extract a common header/nav so all pages share the same chrome.

## Reference

- Master plan: `.planning/v35-DESIGN-SYSTEM-MILESTONE.md` § Phase 118
- Inventory (Phase 115 output): `.planning/phases/115-ui-component-inventory/INVENTORY-LANDING.md`
- Token spec (Phase 116 output): `livos/packages/design-tokens/`
- Canonical reference (DO NOT EDIT mid-phase): `/opt/landing/livinity.io/dashboard.html`

## What this phase ships

- Drift audit + fix on: `index.html`, `auth.html`, `profile.html`, `customize.html`, `download.html`, `forgot-password.html` (6 files; dashboard.html + dashboard-install.html are canonical, audit but don't restyle)
- New: `/opt/landing/livinity.io/_shared/tokens.css` — canonical token CSS, all HTML pages `<link>` it (replaces inline `:root` definitions)
- New: `/opt/landing/livinity.io/_shared/nav.jsx` — reusable React UMD top nav (Livinity brand + theme toggle + sign-in/dashboard link)
- Defense-in-depth: dashboard.html + dashboard-install.html keep inline tokens AND link to `_shared/tokens.css`

## Locked decisions

| ID | Decision |
|----|----------|
| **D-118-CANONICAL-IS-DASHBOARD-HTML** | dashboard.html stays read-only canonical during this phase (changes happen via Phase 116 token spec, then this phase backports). |
| **D-118-CADDY-FILE_SERVER-COMPATIBLE** | `_shared/tokens.css` and `_shared/nav.jsx` must be served by existing Caddy `file_server` block — no new routes needed (just a directory under the existing root). |
| **D-118-OFFLINE-RESILIENT** | Self-hosted Geist .woff2 (Phase 116 ships fonts.css with fallback) — landing pages should reference local woff2 if Google Fonts CDN fails. |
| **D-118-CROSS-REPO** | Source edits via SSH on Server5. Backups (`*.pre-118-NN.bak`) per file. |

## Plans (2)

- **118-01** — Drift audit per file + extract `_shared/tokens.css` + link from all 8 HTML pages
- **118-02** — Reusable `_shared/nav.jsx` component + integration into all 8 pages

## Open questions for discuss-phase

- `index.html` is the marketing landing page (different layout from dashboard) — drift fix scope: just tokens, or also restyle marketing-specific sections? Master plan implies tokens-only; confirm.
- React UMD `_shared/nav.jsx` needs Babel-in-browser compile (matching dashboard.html pattern). Confirm fine vs introducing a build step.

## What this phase does NOT do

- Modify Server5 Next.js (Phase 117)
- Modify Mini PC UI (Phase 120/121)
- Restructure landing page layouts (out of v35.0 scope; future v36 candidate)
