# Phase 120 — Mini PC livinityd UI Migration — Wave 1 (high-impact) — CONTEXT

**Status:** SKELETON — written 2026-05-14 alongside v35.0 milestone open. Depends on Phase 116 (`@livinity/design-tokens`) + Phase 119 (`@livinity/ui-kit`).

## Phase intent

Migrate the 30 highest-traffic Mini PC UI components to the canonical design system + ui-kit. After this phase, opening Mini PC dashboard shows identical fonts, spacing, and color tokens as `livinity.io/dashboard`. Mini PC is bruce's daily-driver OwnCloud — every change ships deployable + revertable.

## Reference

- Master plan: `.planning/v35-DESIGN-SYSTEM-MILESTONE.md` § Phase 120
- Inventory (Phase 115 output): `.planning/phases/115-ui-component-inventory/INVENTORY-MINI-PC.md` — drives "30 highest-traffic" selection
- Token spec (Phase 116 output): `livos/packages/design-tokens/`
- Component library (Phase 119 output): `livos/packages/ui-kit/`
- Memory: `feedback_minipc_is_owncloud_primary` — Mini PC = bruce's OwnCloud, plans MUST respect daily use

## What this phase ships

- **Foundation (Plan 120-01):**
  - Install `@livinity/design-tokens` + `@livinity/ui-kit` into `livos/packages/ui/`
  - `tailwind.config.ts` extends design-tokens preset
  - `index.css` imports `tokens.css` + `fonts.css`; replace bespoke vars with token refs
  - Theme provider switch body class on `liv_theme` localStorage (light/dark/iridescent)
- **30 highest-traffic components restyled** (split across plans 120-02 to 120-05):
  - Layouts (desktop.tsx, bare layouts)
  - Top-level chrome (dock, spotlight, cmdk, app-icon, window-content, window-manager)
  - Settings shell + 5 most-used Settings panels (general, account, advanced, troubleshoot, software-update)
  - AI Chat surface (chat input, panel, slash-command-menu)
  - App Store window content
  - Login screen
- Visual diff vs Phase 115 baseline (regression check)

## Locked decisions

| ID | Decision |
|----|----------|
| **D-120-NO-FUNCTIONAL-CHANGES** | Restyle visual layer only. Prop APIs untouched. Behavior untouched. |
| **D-120-INCREMENTAL-DEPLOY** | Each plan ships independently and can be reverted. Operator runs `bash /opt/livos/update.sh` between plans to validate. If a plan breaks Mini PC OwnCloud usage, revert and retry without blocking the rest of the wave. |
| **D-120-MINI-PC-OPERATOR-PRIORITY** | Per `feedback_minipc_is_owncloud_primary`: every change respects bruce's daily OwnCloud use. Plans ship deployable + revertable; never break Mini PC mid-flight. |
| **D-120-SACRED-SHA** | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sdk-agent-runner.ts) preserved across every commit. |
| **D-120-WAVE-1-IS-30-COMPONENTS** | Hard-cap. The remaining ~620 components are Phase 121's problem. Don't scope-creep this wave. |

## Plans (5)

- **120-01** — Foundation: design-tokens + ui-kit install + tailwind/css/theme wiring (no component restyle yet)
- **120-02** — Layout + chrome restyle (dock, spotlight, cmdk, app-icon, window manager, login screen)
- **120-03** — Settings shell + 5 panels (general, account, advanced, troubleshoot, software-update)
- **120-04** — AI Chat surface restyle (chat input, panel, slash-command-menu)
- **120-05** — App Store window restyle (app-store-content + dependents)

## Operator UAT checkpoint pattern

After each plan ships:
1. Operator runs `bash /opt/livos/update.sh` on Mini PC
2. Operator browses `https://bruce.livinity.io` (or LAN `10.69.31.68:8080`)
3. Operator confirms: (a) target component visually matches `livinity.io/dashboard` style, (b) functional regression none — clicks work, navigation works, app store works
4. Operator reports PASS/FAIL in chat
5. On PASS: next plan unblocked
6. On FAIL: revert (`git revert <plan-commit>` + redeploy) + diagnose + re-attempt

## Open questions for discuss-phase

- Component selection — "30 highest-traffic" determined by what metric? Page views aren't tracked. Best proxy: components imported by every Mini PC route. Document selection rationale before planning.
- Theme switching UX — add `<ThemeToggle />` from ui-kit (Phase 119) to Mini PC top bar? Or wait for Phase 121?
- Dock visual style — dashboard.html doesn't have a dock equivalent. Match dashboard's bento card visual style as closely as possible; document any improvisation needed.

## What this phase does NOT do

- Migrate the remaining ~620 long-tail components (Phase 121)
- Modify Mini PC backend (livinityd source — UI package only)
- Modify Server5 or landing (Phase 117/118)
