# Phase 115 — UI Component Inventory & Visual Baseline — CONTEXT

**Status:** SKELETON — written 2026-05-14 alongside v35.0 milestone open. Awaits `/gsd-discuss-phase 115` (or skip_discuss=true autonomous flow) → `/gsd-plan-phase 115` → `/gsd-execute-phase 115`.

## Phase intent

Foundation phase for the v35.0 design system milestone. We need a complete A→Z inventory of every UI component on every surface BEFORE we can confidently migrate any of them. Without this map, "restyle the dashboard" becomes "restyle 654 random files in random order and hope nothing breaks."

This phase ships pure documentation + visual baseline screenshots. Zero source code changes.

## Reference

- Master plan: `.planning/v35-DESIGN-SYSTEM-MILESTONE.md` § Phase 115 + § Surface inventory
- ROADMAP entry: `.planning/ROADMAP.md` → "Phase 115: UI Component Inventory & Visual Baseline"

## What this phase ships (artifacts)

| File | Owner | Content |
|---|---|---|
| `INVENTORY-MINI-PC.md` | Plan 115-01 | Every TSX file in `livos/packages/ui/src/` — file path, primary purpose, route/feature it powers, current visual idiom, migration tag |
| `INVENTORY-SERVER5.md` | Plan 115-02 | Same for `/opt/platform/web/src/` (via SSH) |
| `INVENTORY-LANDING.md` | Plan 115-03 | Same for `/opt/landing/livinity.io/*.html` |
| `COMPONENT-MAP.md` | Plan 115-03 | Cross-surface component identity map: same conceptual element on each surface (button, card, stepper, modal) — feeds Phase 119 ui-kit selection |
| `baseline-screenshots/` | Plan 115-03 | Chrome DevTools MCP captures of every public route, both light and dark theme, both desktop (1920px) and mobile (375px) breakpoints |

## Migration tag taxonomy

Each inventoried component gets one of:
- `canonical` — already matches dashboard.html design language; no migration needed
- `needs-migration` — functional component, needs visual restyle to canonical tokens
- `replace-with-library` — duplicates a primitive that should be replaced by `@livinity/ui-kit` after Phase 119 ships
- `wontfix` — out-of-scope for v35 (rare; document why)
- `unknown` — agent can't classify; needs operator decision

## Locked decisions

| ID | Decision |
|----|----------|
| **D-115-READ-ONLY** | Pure documentation phase. Zero source code changes. No commits to `livos/`, `liv/`, `/opt/platform/web/`, or `/opt/landing/livinity.io/`. Only `.planning/phases/115-*/` files. |
| **D-115-SCREENSHOT-EVERY-PUBLIC-ROUTE** | Baseline screenshots cover everything reachable without dev/admin auth — login, register, forgot-password, dashboard, dashboard/install, store, profile, download, all landing HTML pages. Mini PC requires authed Chrome DevTools session — operator-walked or skipped (mark as deferred). |
| **D-115-PARALLEL-WAVE-OK** | Plans 115-01, 115-02, 115-03 touch disjoint surfaces — safe to wave-parallel. |

## Plans

- **115-01** — Mini PC inventory (`livos/packages/ui/`). Agent walks the tree, reads file headers, classifies. ~654 files → ~600 lines of inventory.
- **115-02** — Server5 inventory (`/opt/platform/web/`). SSH-based file walk + classification. ~140 files → ~150 lines.
- **115-03** — Landing inventory + visual baseline. 8 HTML files inventoried + Chrome DevTools MCP runs to capture screenshots of every public route across surfaces.

## Open questions for discuss-phase

- Mini PC dashboard requires authentication — are we OK including it in screenshots (which means a fresh login + cookie capture per session)? Operator-walked alternative is to take screenshots manually.
- Migration tagging requires SOME visual judgment — can the agent make this call from CSS class inspection alone, or do we need the operator to manually tag a sample first?
- Component-map "same conceptual element across surfaces" — purely automated (string-match component names) vs needs operator review for fuzzy matches?

## What this phase does NOT do

- Migrate any component (Phase 117+)
- Write any design tokens (Phase 116)
- Run any visual regression tests (Phase 121)
- Modify any source code (D-115-READ-ONLY)
