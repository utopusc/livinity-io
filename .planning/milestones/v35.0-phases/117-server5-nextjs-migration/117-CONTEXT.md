# Phase 117 — Server5 Next.js Platform Migration — CONTEXT

**Status:** SKELETON — written 2026-05-14 alongside v35.0 milestone open. Depends on Phase 116 (`@livinity/design-tokens` package).

## Phase intent

Apply the canonical design system (Phase 116 output) to every Server5 Next.js route. After this phase, Server5's UI surfaces visually match `dashboard.html` end-to-end: same fonts, colors, spacing, themes.

## Reference

- Master plan: `.planning/v35-DESIGN-SYSTEM-MILESTONE.md` § Phase 117
- Inventory (Phase 115 output, must exist before planning): `.planning/phases/115-ui-component-inventory/INVENTORY-SERVER5.md`
- Token spec (Phase 116 output): `livos/packages/design-tokens/`

## What this phase ships

- `app/layout.tsx` injects `tokens.css` + `fonts.css` from `@livinity/design-tokens`
- `tailwind.config.ts` extends design-tokens preset
- `globals.css` replaces bespoke styles with token references
- Restyled routes: 6× `(auth)/*` (login, register, verify, forgot-password, reset-password, device) + dashboard/install (audit, already aligned) + store/[id] + store/profile + download + Next.js dashboard (currently NOT live but should match for future use)
- All 401/error fallback pages styled with canonical tokens

## Locked decisions

| ID | Decision |
|----|----------|
| **D-117-NO-API-CHANGES** | API routes (`/api/**`) and DB schema untouched. UI-only. |
| **D-117-NO-AUTH-FLOW-CHANGES** | Session cookie + getSession + redirect logic untouched. |
| **D-117-CROSS-REPO** | Server5 is NOT a git repo here. Source edits via SSH. `.planning/` artifacts in this repo. Backups (`*.pre-117-NN.bak`) per file. Per Phase 111 cross-repo pattern. |
| **D-117-OPERATOR-CAN-RESTART-AT-WILL** | Each plan is independently deployable + revertable. `pm2 restart web` between plans. |
| **D-117-PRESERVE-DASHBOARD-INSTALL** | `/dashboard/install` already aligns (Phase 111 follow-up 2026-05-14). Audit + patch any drift introduced by Phase 116 token rename, but don't refactor unnecessarily. |

## Plans (5)

- **117-01** — Foundation: install design-tokens in Server5 npm, wire layout.tsx + globals.css + tailwind config
- **117-02** — `(auth)/*` 6 routes restyle
- **117-03** — `/dashboard/install` audit + patch (mostly aligned)
- **117-04** — `/store/[id]` + `/store/profile` restyle
- **117-05** — `/download` + Next.js `/dashboard` polish

## Open questions for discuss-phase

- Server5 web build currently uses Next 16.1.7 + Tailwind ?? — confirm tailwind major version, may need different design-tokens preset variant
- Should we bring `/dashboard/install` (already shipped in Phase 111) under design-tokens, or leave as a one-off? Master plan implies "yes" — confirm.
- `/store` is large; can it be sub-batched if 117-04 grows? Yes, document as deviation if needed.

## What this phase does NOT do

- Modify `/opt/landing/livinity.io/*.html` static pages (Phase 118)
- Modify Mini PC livinityd UI (Phase 120/121)
- Build new components (Phase 119)
- Touch backend code (D-117-NO-API-CHANGES)
