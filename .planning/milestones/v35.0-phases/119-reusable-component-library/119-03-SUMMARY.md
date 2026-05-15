---
phase: 119-reusable-component-library
plan: 03
subsystem: design-system
tags: [ui-kit, composites, react, vitest, storybook, focus-trap, toast, modal, navbar, stepper, theme]
dependency_graph:
  requires:
    - "@livinity/ui-kit chassis (Phase 119-01, applyLivTheme + cn + design-tokens injection)"
    - "@livinity/design-tokens v1.0.0 (Phase 116, var(--accent-*), var(--card-bg), var(--dash-radius))"
  provides:
    - "<Stepper /> — pill-row progress indicator (dashboard-install.html .stepper visual)"
    - "<CommandBox /> — mono surface + clipboard-copy button (dashboard-install.html .cmd-box visual)"
    - "<Modal /> — controlled dialog with focus trap, ESC close, click-outside close, createPortal to document.body"
    - "<ToastProvider /> + useToast() — global imperative API (success/warn/error/info/dismiss) with 4000ms auto-dismiss"
    - "<NavBar /> — header landmark with brand + actions slots (typically wraps <ThemeToggle/>)"
    - "<ThemeToggle /> — cycles light -> dark -> iridescent + localStorage['liv_theme'] persistence"
    - "src/styles/composites.css — 7 component visual contracts (token-driven + 1 documented exception)"
    - "src/index.ts — final v0.1.0 library API surface (5 atoms + 6 composites + cn + theme utils)"
  affects:
    - "Unblocks Wave 3: 119-04 (UMD landing HTML integration smoke test)"
    - "Unblocks Phase 120 (Mini PC livinityd UI migration to @livinity/ui-kit)"
tech_stack:
  added:
    - "(none — uses Phase 119-01 chassis + Phase 116 tokens; no new runtime deps)"
  patterns:
    - "Modal focus trap via document.addEventListener('keydown') + querySelectorAll(FOCUSABLE) cycling first/last"
    - "Modal portal via createPortal(jsx, document.body) — renders outside React tree to avoid z-index stacking pitfalls"
    - "Toast via React Context — singleton mounted at app root, imperative API surfaces through useToast() hook"
    - "Toast role split: error -> role='alert' (assertive), others -> role='status' (polite) per WAI-ARIA recommendations"
    - "ThemeToggle reads readLivTheme() in useEffect (post-mount to avoid SSR hydration mismatch) + persists to localStorage on every cycle"
    - "Token-only CSS with one documented exception: .cmd-box ships hardcoded #0b0b0b / #f0f0f0 per dashboard-install.html canonical visual"
key_files:
  created:
    - "livos/packages/ui-kit/src/components/Stepper.tsx"
    - "livos/packages/ui-kit/src/components/Stepper.types.ts"
    - "livos/packages/ui-kit/src/components/Stepper.stories.tsx"
    - "livos/packages/ui-kit/src/components/Stepper.test.tsx"
    - "livos/packages/ui-kit/src/components/CommandBox.tsx"
    - "livos/packages/ui-kit/src/components/CommandBox.types.ts"
    - "livos/packages/ui-kit/src/components/CommandBox.stories.tsx"
    - "livos/packages/ui-kit/src/components/CommandBox.test.tsx"
    - "livos/packages/ui-kit/src/components/Modal.tsx"
    - "livos/packages/ui-kit/src/components/Modal.types.ts"
    - "livos/packages/ui-kit/src/components/Modal.stories.tsx"
    - "livos/packages/ui-kit/src/components/Modal.test.tsx"
    - "livos/packages/ui-kit/src/components/Toast.tsx"
    - "livos/packages/ui-kit/src/components/Toast.types.ts"
    - "livos/packages/ui-kit/src/components/Toast.stories.tsx"
    - "livos/packages/ui-kit/src/components/Toast.test.tsx"
    - "livos/packages/ui-kit/src/components/NavBar.tsx"
    - "livos/packages/ui-kit/src/components/NavBar.types.ts"
    - "livos/packages/ui-kit/src/components/NavBar.stories.tsx"
    - "livos/packages/ui-kit/src/components/NavBar.test.tsx"
    - "livos/packages/ui-kit/src/components/ThemeToggle.tsx"
    - "livos/packages/ui-kit/src/components/ThemeToggle.stories.tsx"
    - "livos/packages/ui-kit/src/components/ThemeToggle.test.tsx"
    - "livos/packages/ui-kit/src/styles/composites.css"
  modified:
    - "livos/packages/ui-kit/src/index.ts (appended 6 composite exports + ToastProvider/useToast + ThemeToggleProps)"
decisions:
  - "Index.ts merge resolution: 119-02 + 119-03 ran in the SAME wave both touching src/index.ts. Resolved by append-only protocol — when 119-03 Task 3 ran, 119-02's atom exports were already present in HEAD (commit 330007c5), so 119-03 appended its composite block between atoms and utilities. Zero conflict. Final file has 5 atom exports (Phase 119-02) + 6 composite exports (Phase 119-03) + cn() + theme utilities."
  - ".cmd-box hardcoded #0b0b0b background documented in composites.css as the canonical dashboard-install.html visual (one of one token-purity exceptions across the library). Future v1.x can introduce var(--cmd-box-bg) once tokens.css adds the slot."
  - "Toast tone-to-ARIA mapping: error -> 'alert' (assertive announcement, interrupts screenreader), all others -> 'status' (polite, queued). Matches WAI-ARIA Authoring Practices for live regions."
  - "Modal focus trap uses document-level keydown listener (not panel-level) so Tab/Shift+Tab keys are caught even when focus is briefly outside the panel during transitions. Cleanup restores focus to previousActiveElement via element.focus() if still in DOM."
  - "Toast.tsx defines an outer counter for makeId() — acceptable because IDs are scoped (provider is singleton-by-convention) and time-suffixed to avoid collisions across remounts."
metrics:
  duration_minutes: 6
  completed_at: "2026-05-14T16:30:00Z"
  tasks_completed: 3
  files_created: 24
  files_modified: 1
  commits: 3
---

# Phase 119 Plan 03: Composite Components Summary

## One-liner

Shipped six composite React components for `@livinity/ui-kit` — Stepper, CommandBox, Modal (focus-trap + ESC + portal), Toast (ToastProvider + useToast imperative API with 4000ms auto-dismiss), NavBar, ThemeToggle (cycles light/dark/iridescent + localStorage persistence) — wired into the final v0.1.0 library `src/index.ts` (5 atoms + 6 composites + theme utils + cn).

## Test counts

| Component   | Tests | What's covered                                                                              |
| ----------- | ----- | ------------------------------------------------------------------------------------------- |
| Stepper     | 5     | label rendering, done/active/idle state class, ARIA list+listitem, aria-current, ✓ glyph    |
| CommandBox  | 5     | <pre> markup, copy button conditional, clipboard.writeText mock, aria-label flip to Copied  |
| ThemeToggle | 4     | aria-label naming next theme, initial readLivTheme, cycle + localStorage, button type/class |
| Modal       | 7     | open=false render-nothing, ARIA dialog/modal/labelledby, ESC, backdrop/panel clicks, close X, focus enter+restore, Tab cycle wrap |
| Toast       | 6     | provider wrap, useToast() API shape, role='status'+'alert', 4000ms auto-dismiss, outside-provider throws |
| NavBar      | 5     | brand prop, actions slot, header/nav landmark, .navbar class, className passthrough         |
| **Total**   | **32**| **Cumulative ui-kit suite: 62 PASS (scaffold 5 + atoms 25 + composites 32)**                |

## Build verification

| Artifact                              | Size      | Notes                                            |
| ------------------------------------- | --------- | ------------------------------------------------ |
| `dist/index.mjs`                      | 14.42 KB  | ESM bundle (5 atoms + 6 composites + utils)      |
| `dist/index.cjs`                      | 15.45 KB  | CJS bundle                                       |
| `dist/index.d.ts`                     | 6.47 KB   | All 12 named exports present (verified by smoke) |
| `dist/index.css`                      | 9.44 KB   | atoms.css + composites.css concatenated by tsup  |
| `dist/umd/livkit.umd.js`              | 22.35 KB  | UMD bundle with `LivKit` global                  |
| `storybook-static/index.html`         | ✓ built   | 12 story groups (scaffold + 5 atoms + 6 composites) |

`pnpm --filter @livinity/ui-kit typecheck` → PASS (no errors)
`pnpm --filter @livinity/ui-kit test` → 12 test files, **62/62 assertions PASS**
`pnpm --filter @livinity/ui-kit build` → PASS (lib + UMD)
`pnpm --filter @livinity/ui-kit storybook:build` → PASS (3.25s build)

## Public API surface (final v0.1.0)

```ts
// Atoms (Phase 119-02)
export { Button, Card, Pill, Input, PasswordInput };
export type { ButtonProps, ButtonVariant, ButtonSize };
export type { CardProps, CardPadding, CardRadius };
export type { PillProps, PillTone };
export type { InputProps };

// Composites (Phase 119-03)
export { Stepper, CommandBox, Modal };
export { ToastProvider, useToast };
export { NavBar, ThemeToggle };
export type { StepperProps, StepperStep };
export type { CommandBoxProps };
export type { ModalProps };
export type { ToastApi, ToastItem, ToastTone, ToastProviderProps };
export type { NavBarProps };
export type { ThemeToggleProps };

// Utilities
export { cn };
export {
  LIV_THEME_STORAGE_KEY,
  LIV_THEMES,
  applyLivTheme,
  readLivTheme,
};
export type { LivTheme };
```

## Usage examples

### Toast

```tsx
import { ToastProvider, useToast } from "@livinity/ui-kit";

function App() {
  return (
    <ToastProvider>
      <Body />
    </ToastProvider>
  );
}

function Body() {
  const toast = useToast();
  return <button onClick={() => toast.success("Saved")}>Save</button>;
}
```

### Modal

```tsx
import { useState } from "react";
import { Modal } from "@livinity/ui-kit";

function ConfirmDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Confirm">
        <p>Are you sure?</p>
      </Modal>
    </>
  );
}
```

### NavBar + ThemeToggle

```tsx
import { NavBar, ThemeToggle } from "@livinity/ui-kit";

<NavBar brand="Livinity" actions={<ThemeToggle />} />;
```

## Locked decisions honored

| ID                                  | Honored? | Evidence                                                                                          |
| ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| D-119-DASHBOARD-HTML-IS-SOURCE      | YES      | Stepper uses `.stepper` `.step.active`/`.step.done` per dashboard-install.html; CommandBox matches `.cmd-box` mono surface; ThemeToggle cycles 3 themes per dashboard.html convention. |
| D-119-NO-CONSUMER-CHANGES           | YES      | `git diff --name-only a29fb587..f0b56264 -- ':!livos/packages/ui-kit/'` → empty (no consumer-side files touched).                                                                     |
| D-119-LIGHT-DARK-IRIDESCENT-PARITY  | YES      | All composites use `var(--card-bg)` / `var(--accent-*)` — no hex literals except the documented `.cmd-box` exception (which is canonical dashboard-install.html dark surface).        |
| D-119-A11Y-FOCUS-RINGS              | YES      | Modal close has `:focus-visible` outline ring; ThemeToggle has `:focus-visible` ring; CommandBox copy button has `:focus-visible` ring; Modal traps focus + ESC + restores prior focus. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Parallel-wave file-ownership conflict on `src/components/` + `src/styles/` directories**

- **Found during:** Task 1 staging (`git add` on individual ui-kit files inadvertently staged 119-02's parallel writes in the same untracked directories).
- **Issue:** Wave 2 dispatched 119-02 (atoms) and 119-03 (composites) concurrently. Both wrote into the same fresh `livos/packages/ui-kit/src/components/` and `livos/packages/ui-kit/src/styles/` directories. When 119-02's parallel agent reached commit-time first, its `git add` picked up both agents' files together because the directory itself was untracked. The resulting commit `a2147a7e` ("feat(119-02): atoms.css + Button + Card + Pill") therefore actually shipped **my Task 1 deliverables alongside** the atoms.
- **Resolution:** Recognized that Task 1's intended files (Stepper, CommandBox, ThemeToggle, composites.css) were already in master HEAD via commit `a2147a7e`. Verified content match with `git diff HEAD --` → empty. Proceeded directly to Task 2 without re-committing.
- **Tasks 2 & 3 staging:** Used precise per-file `git add` lists (no directory adds) so each commit included only the intended Plan 119-03 files. 119-02's later atom additions (Input, PasswordInput, index.ts atom exports) were correctly excluded.
- **Why this is Rule 3 and not Rule 4:** No architectural change — purely a git mechanics workaround for parallel-wave untracked-directory semantics. The plan's content remained intact.
- **Files modified:** none beyond plan spec.

### Auth gates

None. Plan fully autonomous.

## Commits

| # | Hash       | Message                                                                                                                                              |
| - | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | `a2147a7e` | feat(119-02): atoms.css + Button + Card + Pill (canonical .h-btn/.b-card/.pill) — **also shipped 119-03 Task 1 files (Stepper/CommandBox/ThemeToggle/composites.css) due to parallel-wave directory staging; see Deviations** |
| 2 | `b19f6196` | feat(119-03): Modal (focus trap + ESC + portal) + Toast (provider + useToast)                                                                        |
| 3 | `f0b56264` | feat(119-03): NavBar + final src/index.ts merge (5 atoms + 6 composites + theme utils)                                                               |

## Known Stubs

None. All 6 composites are fully wired with tests + stories. No placeholder data, no TODO markers. The `body.dark` + `body.iridescent` token override blocks in `livos/packages/design-tokens/tokens.css` are still pending Server5 recovery (D-116-FOLLOW-UP-DARK / D-116-FOLLOW-UP-IRIDESCENT) — out of scope for 119-03, tracked in Phase 116.

## Index.ts merge reconciliation note

Per the plan's explicit conflict-resolution protocol (LOCKED in Task 3 action), this plan APPENDED its composite exports to whatever atom exports 119-02 had committed. By the time 119-03 Task 3 reached `src/index.ts`, 119-02 had already shipped commit `330007c5` ("feat(119-02): export atoms from src/index.ts + token-purity polish") populating the 5 atom exports. 119-03 inserted its composite block between the atoms section and the utilities section. Final file has 5 + 6 + utilities, no merge conflict marker ever appeared.

## Scope verification

```bash
$ git diff --name-only a29fb587..f0b56264 -- ':!livos/packages/ui-kit/'
(empty — D-119-NO-CONSUMER-CHANGES honored)
```

## Threat surface scan

None. This plan ships internal React component primitives with no network endpoints, no auth paths, no file-system access, no schema changes. `navigator.clipboard.writeText` is the only browser API touched (in CommandBox); it requires a user gesture (button click) and exposes no privileged surface.

## Self-Check: PASSED

Verified post-write:

- All 24 new files FOUND on disk (Stepper × 4, CommandBox × 4, Modal × 4, Toast × 4, NavBar × 4, ThemeToggle × 3, composites.css)
- `livos/packages/ui-kit/src/index.ts` FOUND with all 6 composite exports
- `livos/packages/ui-kit/dist/index.mjs` FOUND (14.42 KB)
- `livos/packages/ui-kit/dist/index.d.ts` FOUND (6.47 KB) — contains all 12 names (Button, Card, Pill, Input, PasswordInput, Stepper, CommandBox, Modal, ToastProvider, useToast, NavBar, ThemeToggle)
- `livos/packages/ui-kit/dist/umd/livkit.umd.js` FOUND (22.35 KB)
- `livos/packages/ui-kit/storybook-static/index.html` FOUND
- Commit `a2147a7e` FOUND (Task 1 — shipped via parallel-wave combine)
- Commit `b19f6196` FOUND (Task 2 — Modal + Toast)
- Commit `f0b56264` FOUND (Task 3 — NavBar + index.ts merge)
- `pnpm --filter @livinity/ui-kit test` → 62/62 PASS
- `pnpm --filter @livinity/ui-kit typecheck` → PASS
- `pnpm --filter @livinity/ui-kit build` → PASS
- `pnpm --filter @livinity/ui-kit storybook:build` → PASS
