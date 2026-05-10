// Phase 100-04 — webapp-mode-selector — constants-only module.
//
// **Option (a) locked per CONTEXT G-100-C C1.** The pill segmented control
// (Watch / Teach / Auto / Chat) was deleted; rendering responsibility
// moved to the bottom 4-icon action-bar inside webapp-stream-window.tsx.
//
// This file now exports ONLY:
//   - `WEBAPP_MODE_CHANGE_EVENT`: the namespaced CustomEvent name that
//     Phase 96 (teach) / Phase 97 (auto) listeners subscribe to.
//   - `MODE_ORDER`: canonical mode ordering.
//   - `WebAppMode`: TypeScript discriminated union of mode IDs.
//
// No JSX. No React imports. Importers in 100-04+ pull these constants
// directly; the formerly-exported `WebAppModeSelector` component is
// gone (no `<WebAppModeSelector>` JSX usage survives anywhere in
// livos/packages/ui/src/).

// Phase 100-06: dropped 'watch' mode per user request (only 3 modes ship).
// Phase 100-10-05 D-100-10-G: 'auto' narrowed out — Auto icon button +
// webapp-auto-drawer.tsx were removed from the UI surface entirely. Backend
// P97 auto-mode capability stays untouched (Luse skill replay still uses
// it via mcp__luse__replay_skill from the agent loop).
export type WebAppMode = 'chat' | 'teach'

export const MODE_ORDER: ReadonlyArray<WebAppMode> = ['chat', 'teach']

export const WEBAPP_MODE_CHANGE_EVENT = 'liv-webapp-mode-change'
