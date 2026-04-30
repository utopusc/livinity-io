---
plan: 38-02-danger-zone-button
phase: 38-ui-factory-reset
status: complete
completed_at: 2026-04-29
requirements_addressed: [FR-UI-01, FR-UI-07]
---

# Plan 38-02 Summary — Danger Zone Button + Admin Gate

## What was built

A new "Danger Zone" section in Settings > Advanced (both mobile Drawer and desktop Dialog variants) below the existing settings. Admin users see a red destructive Factory Reset button with a shield-warning icon; non-admin users see an explanatory `<p>` note instead. The section has its own visual treatment (red border, muted background, warning icon header) per D-UI-01.

The button currently links to `/factory-reset` — the legacy bridge route updated in Wave 1 (which calls `useReset({preserveApiKey: true})` as a safe default). Plan 03 will replace this with the proper modal flow.

### Files

| Path | Change |
|------|--------|
| `livos/packages/ui/src/routes/settings/_components/danger-zone.tsx` | NEW (93 lines) — DangerZone component + decideDangerZoneVisibility helper |
| `livos/packages/ui/src/routes/settings/_components/danger-zone.unit.test.tsx` | NEW (80 lines) — 7 unit tests |
| `livos/packages/ui/src/routes/settings/advanced.tsx` | MODIFIED — integrate `<DangerZone />` below existing Advanced settings (both Drawer and Dialog variants); remove legacy inline factory-reset row |
| `livos/packages/ui/public/locales/en.json` | MODIFIED — 4 new i18n keys: `danger-zone`, `danger-zone.description`, `factory-reset.button`, `factory-reset.non-admin-note` |

## Locked decisions honored

- **D-UI-01** Danger Zone visual: red border + muted bg + warning icon header
- **D-UI-02** Button visual: shadcn/ui destructive variant + TbShieldExclamation icon LEFT of label
- **D-UI-03** Non-admin fallback: plain `<p>` note (NOT a faded button)
- **D-BE-02** Admin-only render: gates on `useCurrentUser().isAdmin`; non-admin users never see the button (it's not in DOM, not just disabled)

## Tests (7 passing)

In `danger-zone.unit.test.tsx`:

- DangerZone smoke (FR-UI-01) — module exports DangerZone and decideDangerZoneVisibility
- 5 helper tests covering exhaustive states: `loading | admin-button | non-admin-note`
- Server4/Server5 negative-assertion: button text + non-admin note text contain NO `Server4` or `Server5` substring (per project memory hard rule)

All 7 tests pass via `pnpm --filter ui exec vitest run src/routes/settings/_components/danger-zone.unit.test.tsx`.

## What did NOT happen here

- The button click currently navigates to `/factory-reset` (legacy bridge from Wave 1). The proper modal flow lands in Plan 03.
- Pre-flight blocking checks (D-PF-01 update-in-progress, D-PF-02 network reachability) are NOT wired in this plan — they go in the modal layer (Plan 03).
- No `livos/packages/livinityd/` modifications.
- No Server4 references anywhere in source.

## Wave 2 commits

- `5b12ae31` — feat(38-02): add DangerZone component + admin-gate helper + unit tests
- `5dc3a45e` — feat(38-02): integrate DangerZone into Settings > Advanced

## Wave 2 acceptance criteria status

| Criterion | Status |
|-----------|--------|
| Settings > Advanced contains "Danger Zone" section below existing settings | ✅ |
| Section renders Factory Reset button (red destructive, shield/warning icon) for admins | ✅ |
| Section renders explanatory note (no faded button) for non-admins | ✅ |
| Button click navigates somewhere (legacy bridge); Plan 03 will wire modal | ✅ |
| Tests: admin renders button, non-admin renders note, no Server4 substring | ✅ |
| `tsc --noEmit` passes | ✅ |
| Each task committed individually | ✅ (2 atomic commits) |
| No livos/packages/livinityd/ modifications | ✅ |
| No Server4 references | ✅ |

## Open hand-off to Plan 03

- DangerZone's button currently links to `/factory-reset` (legacy bridge route from Wave 1). Plan 03 deletes the legacy route entirely and replaces with: button click opens the new confirmation modal directly (no route navigation).
- The 4 i18n keys added in en.json are ready for Plan 03 to consume. Plan 03 will add additional keys for the modal contents (deletion list items, radio options, type-to-confirm prompt, error tooltips).

## Notes from rate-limit recovery

This plan was originally executed by a single executor agent that hit the per-org Anthropic rate limit mid-task. The agent had already committed 5b12ae31 (DangerZone component + tests) but left the advanced.tsx integration uncommitted in the working tree. The orchestrator picked up the uncommitted diff, ran tsc + vitest to confirm correctness, then committed it as 5dc3a45e + wrote this SUMMARY. No work was lost.
