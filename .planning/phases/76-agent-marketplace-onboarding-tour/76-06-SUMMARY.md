---
phase: 76-agent-marketplace-onboarding-tour
plan: 06
subsystem: settings-ui
tags: [settings, liv-agent, replay-tour, ui, p66, thin-section]
requires:
  - "76-04 (agent-marketplace route — link target; pending wave-3 plan)"
  - "Existing /subagents route at livos/packages/ui/src/routes/subagents/index.tsx"
  - "Existing ai.listSubagents tRPC query at livos/packages/livinityd/source/modules/ai/routes.ts:850"
  - "P66 Liv Design System: Card variant='liv-elevated', Button variant='liv-primary'"
provides:
  - "Settings → Liv Agent thin section (3 cards: Marketplace, My Agents, Replay Tour)"
  - "ROADMAP P76 success criterion #4: tour replayable from Settings (Replay button clears liv-tour-completed)"
  - "MARKET-07 implementation"
affects:
  - "Settings nav menu (1 new entry between Memory and Users; per-user — NOT admin-only)"
  - "Settings route registry (1 new <Route path='/liv-agent' /> sibling to /ai-config)"
tech-stack:
  added: []
  patterns:
    - "Thin settings section that re-uses existing surfaces (D-12)"
    - "localStorage flag-clear + navigate as a tour-replay trigger"
    - "P66 liv-elevated Card + liv-primary Button variants"
key-files:
  created:
    - "livos/packages/ui/src/routes/settings/liv-agent.tsx (143 LOC)"
  modified:
    - "livos/packages/ui/src/routes/settings/index.tsx (+3 LOC: lazy import + Route)"
    - "livos/packages/ui/src/routes/settings/_components/settings-content.tsx (+8 LOC: TbRobot import + LivAgentLazy + SettingsSection union member + MENU_ITEMS entry + SectionContent case)"
decisions:
  - "Card import path resolved to '@/components/ui/card' (Phase 66 DESIGN-07 file with variant prop), NOT shadcn-components/ui/card (which doesn't exist) — matches the P66 ai-config.tsx + agent-marketplace plan pattern."
  - "Card variant prop confirmed exists per livElevatedClass in '@/components/ui/card' (lines 10/17/32). Used `variant='liv-elevated'` directly per the locked plan layout."
  - "SubagentRow type declared locally as a minimal interface — `RouterOutputs['ai']['listSubagents'][number]` resolves to `any` because the tRPC procedure returns `await response.json()` (untyped pass-through from nexus /api/subagents). Local type documents the consumed shape (id/name/tier/description/status) without adding fake type safety."
  - "Settings nav entry placed adjacent to 'Memory' (between Memory and Users) — kept in the per-user-visible block, NOT admin-only. End-users need to clone/manage their agents and replay the tour; D-12 confirms thin section is for end users."
  - "`TbRobot` icon imported from `react-icons/tb` (consistent with the rest of the file — every other icon in MENU_ITEMS is `Tb*` from react-icons/tb). The page itself uses `IconRobot` from `@tabler/icons-react` because that's what the locked plan layout specifies and what /subagents/index.tsx already uses."
  - "SettingsPageLayout used (not raw Card chrome) — matches ai-config.tsx pattern verbatim. The page renders inside the SectionContent switch under SettingsDetailView's outer Card, but mirroring ai-config keeps drift minimal; both pages will look identical from the user's perspective."
  - "Used `size='sm'` for both Buttons. Plan layout snippet didn't specify size, but the existing button-styles.css `liv-primary` variant has 36px md default — small variant matches the inline-with-h2 spacing better and aligns with ai-config's existing buttons."
  - "Replay handler is fully synchronous (window.localStorage.removeItem + navigate); no async work, no tRPC call, no server round-trip. Per CONTEXT D-13 the tour state is browser-local."
  - "aria-live='polite' wrapper on the My Agents list per plan task step 3 — screen readers announce the list when data loads or empty state appears."
  - "Route path registered as `/liv-agent` (with leading slash) to match the existing `path='/ai-config'` convention in routes/settings/index.tsx — plan must-have grep was tolerant to both `path='liv-agent'` and `path='/liv-agent'`."
metrics:
  duration: "~22 minutes"
  completed: "2026-05-04"
  tasks: 1
  files_created: 1
  files_modified: 2
  loc_added: 154
  build_time: "33.13s"
---

# Phase 76 Plan 06: Liv Agent Settings Section Summary

Wired up Settings → Liv Agent — a deliberately thin section per CONTEXT D-12 that exposes agent discovery + management without duplicating the full per-agent edit UI that already lives at `/subagents`. Three cards (Marketplace link, My Agents list, Replay Tour button) plus one settings nav entry. ROADMAP P76 success criterion #4 (tour replayable from Settings) implemented via localStorage flag clear + navigate to `/ai-chat`.

## Files Created / Modified

| File | Status | LOC |
|------|--------|-----|
| `livos/packages/ui/src/routes/settings/liv-agent.tsx` | NEW | 143 |
| `livos/packages/ui/src/routes/settings/index.tsx` | MODIFIED (+3) | n/a |
| `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` | MODIFIED (+8) | n/a |

Total delta: 154 insertions, 0 deletions.

## Card Variant Confirmation

Plan asked: `variant='liv-elevated'` vs `className='liv-elevated'`?

**Resolved:** `variant='liv-elevated'` (the prop). `livos/packages/ui/src/components/ui/card.tsx` lines 10–17 declare `variant?: CardVariant` where `CardVariant = 'default' | 'liv-elevated'`. Plan-layout snippet honored verbatim. Card import path corrected from the plan-skeleton's `@/shadcn-components/ui/card` (does not exist) to `@/components/ui/card` (the P66 DESIGN-07 file).

## Subagent Row Type Origin

Used a local minimal type:

```ts
type SubagentRow = {
  id: string
  name?: string
  tier?: string
  description?: string
  status?: string
}
```

Tried `RouterOutputs['ai']['listSubagents'][number]` first per plan suggestion, but `ai.listSubagents` returns `await response.json()` from nexus — tRPC infers it as `any`, so the typed approach buys nothing. The local type documents the shape we actually consume and matches the existing `/subagents` route's row rendering (`agent.name || agent.id`, `agent.tier || 'sonnet'`).

## Build Status

`pnpm --filter ui build` exits 0 in 33.13s. PWA precache emits 202 entries (~7MB). The new route is lazy-loaded via `React.lazy(() => import('@/routes/settings/liv-agent'))` so it ships as its own chunk.

## Sacred SHA Verification

`git hash-object nexus/packages/core/src/sdk-agent-runner.ts` →
`4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ unchanged before, during, and after the plan.

## Manual Smoke Result

`needs-human-walk` — UI dev server not started in this autonomous executor environment. The plan's 7-step manual smoke (visit `/settings/liv-agent`, click Browse → `/agent-marketplace`, set localStorage flag, click Replay, verify navigate + flag cleared) requires a human in front of a browser. Walk steps:

1. Start dev server: `pnpm --filter ui dev` (port 3000) **or** deploy: `ssh ... bruce@10.69.31.68 'sudo bash /opt/livos/update.sh'`
2. Log in, open Settings, scroll the menu — verify "Liv Agent" entry appears between "Memory" and the admin-only "Users" block, with the robot icon.
3. Click "Liv Agent" → page renders with 3 cards (Marketplace, My Agents, Onboarding Tour).
4. Click "Browse" — should navigate to `/agent-marketplace` (NOTE: returns 404 / blank until 76-04 ships the marketplace route — this is expected mid-Phase-76).
5. Open DevTools console: `localStorage.setItem('liv-tour-completed','1')` → return to settings, click "Replay Tour" → verify URL changes to `/ai-chat` AND `localStorage.getItem('liv-tour-completed')` returns `null`.
6. With no cloned subagents, "My Agents" should show "No cloned agents yet — visit the marketplace." After cloning one (later, via 76-04), the row should appear with a "sonnet" badge.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Card import path correction**
- **Found during:** Task 1, while building the page
- **Issue:** Plan layout snippet imported `Card` from `@/shadcn-components/ui/card`, but that file does not exist in the codebase. The P66 DESIGN-07 Card lives at `@/components/ui/card` (verified via Glob).
- **Fix:** Imported from `@/components/ui/card` instead — same file `ai-config.tsx`, `settings-page-layout.tsx`, and 17 other files use.
- **Files modified:** `livos/packages/ui/src/routes/settings/liv-agent.tsx`
- **Commit:** `f04537d7`

**2. [Rule 3 - Blocker] SettingsSection switch case + lazy import**
- **Found during:** Task 1 step 4
- **Issue:** Plan's interfaces text said "find the nav array... add a sibling entry" — but the `_components/settings-content.tsx` file is structured as both a `SettingsSection` discriminated union AND a `MENU_ITEMS` array AND a `SectionContent` switch. To wire a new section, all THREE need a new entry; just appending to MENU_ITEMS would crash at the `case 'liv-agent':` discriminator check + TypeScript would fail to compile.
- **Fix:** Added `'liv-agent'` to the union (line 135), added `MENU_ITEMS` entry with TbRobot icon (line 174-175), added `case 'liv-agent':` in SectionContent switch (lines 459-460), added the LivAgentLazy import (line 120).
- **Files modified:** `livos/packages/ui/src/routes/settings/_components/settings-content.tsx`
- **Commit:** `f04537d7`

### Decisions made under plan permission

**3. Icon imports split between two libraries**
- **Why:** The settings-content.tsx uses `react-icons/tb` (TbRobot, TbBrain, etc.) — the file's existing convention. The new liv-agent.tsx uses `@tabler/icons-react` (IconRobot, IconExternalLink, IconRefresh) — matches the plan's locked layout snippet and matches `/subagents/index.tsx`'s existing convention. Both icon libs are already deps; no D-NO-NEW-DEPS violation.

**4. Plan grep tolerance for path syntax**
- **Why:** Plan verify grep accepts `path='liv-agent'`/`path="liv-agent"` (no leading slash) but the existing `routes/settings/index.tsx` convention uses `path='/ai-config'` (with leading slash). Used the leading-slash form to match the convention; verify grep was generic enough to accept it (substring match on `liv-agent`).

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-76-06-01 (listSubagents leaks other users' agents) | mitigated — `ai.listSubagents` already scopes by ctx.currentUser via privateProcedure; reused unchanged. No code path here can bypass that. |
| T-76-06-02 (subagent name renders unsafe HTML) | mitigated — `{sa.name ?? sa.id}` renders as text node, React escapes by default. Names server-validated at create time per existing nexus contract. |
| T-76-06-03 (tour replay state lost across browsers) | accepted per D-17. Per-browser by design. Server-side flag deferred to BACKLOG. |

No new threat surface introduced. No network endpoints, no auth paths, no schema changes.

## Decisions Made

(See frontmatter `decisions:` block — 9 entries.)

## Authentication Gates

None. No auth gates encountered. tRPC procedures used (`ai.listSubagents`) are existing privateProcedures — already authenticated via the Settings page wrapper.

## Self-Check: PASSED

- [x] `livos/packages/ui/src/routes/settings/liv-agent.tsx` exists (143 LOC, contains `LivAgentSettings`, `listSubagents`, `removeItem`, `liv-tour-completed`, `/agent-marketplace`, `navigate`, `Replay`)
- [x] `livos/packages/ui/src/routes/settings/index.tsx` modified (LivAgentSettings lazy import + `path='/liv-agent'` Route)
- [x] `livos/packages/ui/src/routes/settings/_components/settings-content.tsx` modified (`liv-agent` token in 4 places: union, MENU_ITEMS, switch case, LivAgentLazy import)
- [x] Commit `f04537d7` exists in `git log --oneline -3`
- [x] `pnpm --filter ui build` exits 0 (33.13s)
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged
- [x] No existing settings page or route removed (git diff shows pure `+` lines, zero `-` lines on the modified files)
