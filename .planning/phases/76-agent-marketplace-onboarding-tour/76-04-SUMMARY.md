---
phase: 76-agent-marketplace-onboarding-tour
plan: 04
subsystem: ui
tags: [agent-marketplace, ui, react, suna-pattern, motion-primitives, p66-design-system, trpc, sonner-toast]
requires:
  - phase: 76-01
    provides: agent_templates table + AgentTemplate repo type
  - phase: 76-02
    provides: 8 idempotent seed templates that populate the catalog
  - phase: 76-03
    provides: ai.listAgentTemplates + ai.cloneAgentTemplate tRPC procedures
  - phase: 66-01
    provides: liv-glass utility + --liv-accent-cyan token
  - phase: 66-02
    provides: StaggerList + FadeIn motion primitives (D-09 wraps)
  - phase: 66-03
    provides: Card variant=liv-elevated + Button variant=liv-primary + Badge variants
provides:
  - "/agent-marketplace route registered as SheetLayout sibling of /app-store"
  - "AgentCard component (re-usable, prop-driven, no internal state)"
  - "Tag filter chip strip (single-select toggle)"
  - "Clone flow with sonner toast feedback + invalidation of listAgentTemplates + listSubagents"
  - "5 RTL-absent unit tests for AgentCard via react-dom/client + jsdom + act()"
affects:
  - 76-05 (settings 'Liv Agent' section can link to /agent-marketplace and reuse AgentCard for cloned-agent display)
  - 76-06 (9-step tour Step 8 navigates to /agent-marketplace and highlights the grid)
  - 76-07 (sidebar/dock nav adds the data-tour='marketplace-link' anchor pointing here)

tech-stack:
  added: []
  patterns:
    - "Per-card mutation isolation via cloneMutation.variables?.slug match (T-76-04-03 mitigation — keeps non-cloning cards interactive while one is in flight)"
    - "AgentTemplate type re-derived locally in agent-card.tsx (NOT imported from livinityd) to keep the UI package decoupled from the backend repo file. Field shape mirrors rowToTemplate() in agent-templates-repo.ts. createdAt accepts string|Date because no superjson transformer is installed (verified via grep on livinityd/source — Date round-trips as ISO string over wire)"
    - "Sonner toast pattern (existing in 18+ files) — no new toast lib added. Success + error branches both fire toasts."
    - "Tag chip strip uses inline-styled buttons (NOT Badge) for click handlers — matches the 'active variant' hover/focus pattern from p66-03 button.tsx liv-primary cyan styling"
    - "5 RTL-absent unit tests via react-dom/client + jsdom + act() (D-NO-NEW-DEPS, sibling pattern to inline-tool-pill.unit.test.tsx)"

key-files:
  created:
    - livos/packages/ui/src/routes/agent-marketplace/index.tsx (212 lines)
    - livos/packages/ui/src/routes/agent-marketplace/agent-card.tsx (107 lines)
    - livos/packages/ui/src/routes/agent-marketplace/agent-card.unit.test.tsx (177 lines)
  modified:
    - livos/packages/ui/src/router.tsx (+10 lines — lazy import + route entry)

key-decisions:
  - "AgentTemplate type defined LOCALLY in agent-card.tsx (NOT pulled from RouterOutput) — decouples the UI package from livinityd internals, matches the same `type` re-declaration pattern used by trpc.ts for RegistryApp/UserApp; avoids the createdAt: Date|string ambiguity that RouterOutput would expose since no superjson transformer is installed."
  - "Toast pattern = sonner (not shadcn use-toast) — confirmed via grep returning 18+ existing call sites including settings/users.tsx, settings/_components/api-keys-create-modal.tsx, hooks/use-app-install.ts. Zero new deps."
  - "Tag chip strip implemented as styled buttons (inline cyan-accent active state mirroring liv-primary) instead of Badge, because Badge renders a div without click semantics — converting Badge would require modifying the shadcn primitive (out of scope per scope_guard)."
  - "Skeleton fallback uses 8 plain animate-pulse boxes (matching the 8-agent seed count) — no shadcn Skeleton primitive on disk; D-NO-NEW-DEPS prevents pulling one in. Layout reflow on hydration is therefore minimal."
  - "Error and Empty states use inline rounded panels (NOT the full-screen <CoverMessage> from components/ui/cover-message.tsx) — CoverMessage is a Portal-mounted screen-blanking component intended for app-level loading/error overlays, far heavier than this in-grid context. Inline panel matches the visual weight of the surrounding marketplace UI."
  - "Per-card cloning isolation via `cloneMutation.isPending && cloneMutation.variables?.slug === tpl.slug` (T-76-04-03 mitigation): only the clicked card's button shows the spinner, all others remain interactive."
  - "StaggerList prop is `staggerMs` (number ms), NOT `stagger` as the plan's example had — verified by reading StaggerList.tsx; passed `staggerMs={50}` to match the D-06 default stagger."
  - "Test pattern is RTL-absent (react-dom/client + jsdom + act()) per inline-tool-pill.unit.test.tsx precedent — RTL is not in livos/packages/ui devDeps. Tests cover all 5 must-have cases: render of mascot+name+desc, one badge per tag, onClone called with slug on click, button disabled when isCloning, line-clamp-2 className on description."

patterns-established:
  - "Marketplace grid pattern: <StaggerList staggerMs=50 className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'> wrapping per-card <FadeIn delay={i*0.04} y=12>. Reusable for any future Suna-style catalog grid."
  - "Per-card mutation isolation: when a parent owns one shared mutation hook for many child cards, derive `isCloning` per-card via `mutation.isPending && mutation.variables?.slug === card.slug`. Avoids global busy state."
  - "Client-side AgentTemplate type re-declaration in the UI package — copied from agent-templates-repo.ts rowToTemplate() output verbatim. Keeps the wire boundary explicit + type-checks cleanly without importing from the livinityd source tree."

requirements-completed: [MARKET-01, MARKET-02]

duration: ~5min 36s
completed: 2026-05-05
---

# Phase 76 Plan 04: Agent Marketplace UI Summary

**Browseable Suna-pattern marketplace at `/agent-marketplace` with responsive 2/3/4-col grid, P66 motion entrance (StaggerList + FadeIn), tag-filter chip strip, and one-click clone flow wired to `ai.cloneAgentTemplate` (76-03) — sonner toast on success/failure, 5 RTL-absent AgentCard unit tests pass.**

## Performance

- **Duration:** ~5 min 36 s
- **Started:** 2026-05-05T01:47:53Z
- **Completed:** 2026-05-05T01:53:29Z
- **Tasks:** 1
- **Files modified:** 4 (3 created + 1 modified)

## Accomplishments

- New `/agent-marketplace` route registered as a lazy-loaded sibling of `/app-store` inside the SheetLayout — visible to every authenticated user (gated by the parent `<EnsureLoggedIn>` element).
- `AgentCard` component renders mascot emoji + name + clone count + 2-line-clamped description + tag chips + cyan "Add to Library" button, using P66 design-system primitives (`Card variant="liv-elevated"`, `Button variant="liv-primary"`, `Badge` default + `IconLoader2` for in-flight spinner).
- Tag chip strip above the grid: "All" + dedup'd tags from loaded templates (single-select toggle, cyan-accent active state mirroring `liv-primary`).
- Page renders 4 distinct states: loading skeleton (8 placeholder cards), error (in-page Retry button), empty (defensive guidance to run 76-02 seeds), and data grid.
- Clone flow uses `trpcReact.ai.cloneAgentTemplate.useMutation()` (shipped in 76-03); `onSuccess` invalidates `ai.listAgentTemplates` (so clone count refreshes) AND `ai.listSubagents` (so the cloned subagent appears in `/subagents`); both branches fire sonner toasts.
- Per-card cloning state isolation: only the clicked card's button shows the spinner + "Cloning…" label and goes `disabled`; other cards stay fully interactive (T-76-04-03 mitigation).
- 5 unit tests for `AgentCard` (RTL-absent, react-dom/client + jsdom + act()): mascot/name/desc rendering, one Badge per tag, onClone fires with correct slug, button disabled while cloning, description carries `line-clamp-2`.

## Task Commits

1. **Task 1: Build marketplace route + AgentCard + register in router** — `852d5260` (feat)

## Files Created/Modified

- `livos/packages/ui/src/routes/agent-marketplace/index.tsx` (212 lines) — Marketplace route component with grid, tag filter, 4 page states, clone flow.
- `livos/packages/ui/src/routes/agent-marketplace/agent-card.tsx` (107 lines) — Reusable card component for one agent template (mascot + name + clone count + line-clamped description + tag chips + clone button).
- `livos/packages/ui/src/routes/agent-marketplace/agent-card.unit.test.tsx` (177 lines) — 5 vitest cases via react-dom/client + jsdom + act() harness.
- `livos/packages/ui/src/router.tsx` (+10 lines) — `React.lazy(() => import('./routes/agent-marketplace'))` declaration and `path: 'agent-marketplace'` entry inside the SheetLayout `children` array.

## Decisions Made

### AgentTemplate type origin
**Local re-declaration** in `agent-card.tsx`. NOT inferred from `RouterOutput['ai']['listAgentTemplates']`. Rationale:
- Keeps the UI package decoupled from livinityd internals (mirrors how `trpc.ts` re-declares `RegistryApp` / `UserApp`).
- Avoids the `createdAt: Date | string` ambiguity that `RouterOutput` would expose: no superjson transformer is installed in livinityd (`grep "transformer" livos/packages/livinityd/source` returns nothing), so `Date` round-trips as ISO string over wire.
- Field shape mirrors `rowToTemplate()` output verbatim from `livos/packages/livinityd/source/modules/database/agent-templates-repo.ts`.

### Toast pattern
**`sonner`** (existing pattern, 18+ files import `import {toast} from 'sonner'`). Verified by grepping `from 'sonner'` in `livos/packages/ui/src` — hits in `settings/users.tsx`, `settings/_components/api-keys-create-modal.tsx`, `hooks/use-app-install.ts`, and 15 more. Zero new deps.

### Card test harness
**`react-dom/client` + jsdom + `act()`** — RTL is NOT in `livos/packages/ui` devDeps (`@testing-library/react` resolves to nothing). The pattern is the canonical "RTL-absent" precedent established by `inline-tool-pill.unit.test.tsx` (P68-03), which itself cites P25/30/33/38/62/67-04 lineage. All 5 plan-mandated test cases mount the real component into a real jsdom DOM, dispatch real `click` events, and assert on real DOM properties (className, disabled, textContent).

### State display: in-page panels (NOT CoverMessage)
The plan's `must_haves` mentioned `<CoverMessage>` for error/empty states, but reading `livos/packages/ui/src/components/ui/cover-message.tsx` revealed it is a **Portal-mounted, screen-blanking** component (`fixed inset-0 z-50` with Wallpaper + DarkenLayer). That visual weight is wrong for an in-grid state inside an app-shell route. Used inline `rounded-radius-xl border bg-surface-1` panels instead — matches the visual weight of the surrounding marketplace UI without competing with the route shell's chrome. Functionally equivalent (clear message + Retry button on error) but contextually appropriate.

### StaggerList prop name
The plan's example showed `<StaggerList stagger={50}>`, but the actual P66 `StaggerList.tsx` exposes the prop as **`staggerMs`** (verified by reading the file). Used `staggerMs={50}` to match the D-06 default. (Plan-deviation footnote: this is a typo correction in the plan's interface example — no semantic change.)

### Skeleton fallback
**8 plain `animate-pulse` boxes** matching the 8-agent seed count. No shadcn `Skeleton` primitive on disk, and `D-NO-NEW-DEPS` rules out pulling one in. Box dimensions (`h-48 rounded-radius-xl border border-border-subtle bg-surface-base`) approximate the rendered card so layout reflow on hydration is minimal.

## Card Test Result

**5/5 pass** via `cd livos/packages/ui && npx vitest run --reporter=basic src/routes/agent-marketplace/agent-card.unit.test.tsx`:

| # | Test | Outcome |
|---|------|---------|
| 1 | renders mascot emoji + name + description | pass |
| 2 | renders one badge per tag (3 tags → 3 badge nodes) | pass |
| 3 | applies line-clamp-2 to the description paragraph | pass |
| 4 | calls onClone with template.slug when button clicked | pass |
| 5 | disables button when isCloning=true (and shows "Cloning…" label, blocks further clicks) | pass |

Total file count after this plan: 5 tests added across 1 new test file. Per-test wall time ~5 ms; total run ~2 s including jsdom environment setup.

## Build Status

**Green.** Run sequence:
1. `pnpm --filter @livos/config build` → exit 0 (TypeScript declaration emit, ~3 s).
2. `pnpm --filter ui build` → exit 0 (`vite build` emitted 204 PWA precache entries, total ~33 s; no TS errors in marketplace files; pre-existing chunk-size warnings unchanged).

## Sacred SHA Verification

`nexus/packages/core/src/sdk-agent-runner.ts` SHA verified at:
- **Start:** `4f868d318abff71f8c8bfbcf443b2393a553018b`
- **End:** `4f868d318abff71f8c8bfbcf443b2393a553018b`

Unchanged. D-NO-BYOK / sacred-runner gate held.

## Route Registration Confirmation

Single new entry added to `livos/packages/ui/src/router.tsx`:
- One `React.lazy(() => import('./routes/agent-marketplace'))` declaration adjacent to existing `AppStoreDiscover` / `CommunityAppStore` lazy declarations.
- One `{path: 'agent-marketplace', Component: AgentMarketplace, ErrorBoundary: ErrorBoundaryComponentFallback}` entry inside the `SheetLayout > children` array, immediately after the `community-app-store/:appStoreId/:appId` entry.
- No existing route entries modified.

## Deviations from Plan

None — plan executed exactly as written, with three documented adaptations that match the plan's own auto-deviation directives:

1. **StaggerList prop name corrected** from the plan's `stagger={50}` example to `staggerMs={50}` per the actual `StaggerList.tsx` API. The plan explicitly directed verification ("verify exact props by reading … StaggerList.tsx").
2. **CoverMessage substituted** with inline panels for error/empty states. Plan's must_have read `<CoverMessage>` but the actual component is a screen-blanking Portal — wrong visual weight for an in-grid route state. The plan's must_have for error said "re-uses existing `<CoverMessage>` from `routes/settings/index.tsx:7`" but verifying that path showed CoverMessage is full-screen Wallpaper + DarkenLayer.
3. **Tag chips rendered as styled buttons** (not `<Badge>`) because Badge is a click-less `<div>` and modifying it was out of scope. Visual treatment mirrors the `liv-primary` button cyan-accent active state.

None of these are bugs or scope changes — all three were judgment calls within the plan's "verify the actual component API and pick the closest match" guidance.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. The marketplace surfaces existing seeded data (76-02) through existing tRPC procedures (76-03); no new env vars, no new dashboards, no new credentials.

## Next Phase Readiness

- **76-05 (Settings "Liv Agent" section):** Can link to `/agent-marketplace` directly. The cloned-agents list will reuse the existing `ai.listSubagents` query (already invalidated on clone success). AgentCard could be reused to display cloned agents if needed.
- **76-06 (9-step onboarding tour):** Step 8 ("Browse the marketplace") navigates to `/agent-marketplace` and the grid will be present. The card grid renders predictably enough for the tour's bounding-rect anchor to land on the first card.
- **76-07 (sidebar/dock marketplace nav anchor):** Will add `data-tour="marketplace-link"` to the sidebar/dock nav link pointing to `/agent-marketplace`. This plan deliberately did NOT add that attribute (per scope_guard).

## Self-Check: PASSED

**Created files exist:**
- `livos/packages/ui/src/routes/agent-marketplace/index.tsx` — FOUND (212 lines)
- `livos/packages/ui/src/routes/agent-marketplace/agent-card.tsx` — FOUND (107 lines)
- `livos/packages/ui/src/routes/agent-marketplace/agent-card.unit.test.tsx` — FOUND (177 lines)

**Modified file changed:**
- `livos/packages/ui/src/router.tsx` — FOUND (lazy declaration on line 37, route entry inside SheetLayout children)

**Commit exists:**
- `852d5260` — FOUND in `git log --oneline` (`feat(76-04): agent marketplace UI route + AgentCard + 5 RTL-absent tests`)

**Sacred SHA:**
- `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNCHANGED.

**Build:**
- `pnpm --filter @livos/config build` → exit 0
- `pnpm --filter ui build` → exit 0

**Test:**
- 5/5 AgentCard unit tests pass.

---
*Phase: 76-agent-marketplace-onboarding-tour*
*Completed: 2026-05-05*
