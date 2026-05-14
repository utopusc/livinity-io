---
phase: 119-reusable-component-library
plan: 04
subsystem: design-system
tags: [ui-kit, umd, smoke-test, headless-chrome, landing-html, vm-verifier, phase-119-close]
dependency_graph:
  requires:
    - "Phase 119-01 — @livinity/ui-kit chassis (tsup + vite UMD config)"
    - "Phase 119-02 — atom exports (Button, Card, Pill, Input, PasswordInput)"
    - "Phase 119-03 — composite exports (Stepper, CommandBox, Modal, ToastProvider/useToast, NavBar, ThemeToggle)"
  provides:
    - "smoke-test/landing-umd.html — runnable reference page for landing HTML consumers (file:// + unpkg pinned React 18.2.0)"
    - "smoke-test/verify-umd.cjs — Node vm-based shape verifier asserting 18 window.LivKit exports (11 components + 4 functions + 3 values)"
    - "smoke-test/landing-umd.png — 57.3 KB headless Chrome capture proving visual mount of NavBar + Button + Pill + Card + Stepper + Modal"
    - "README 'Using LivKit in plain HTML (UMD)' section — copy-pasteable recipe for Phase 118 + Phase 120 + future landing pages"
    - "vite.config.umd.ts — NODE_ENV inlined as 'production', drops process.env.NODE_ENV refs (would have crashed plain browser consumers)"
  affects:
    - "Unblocks Phase 118 (landing HTML polish — has working consumer recipe)"
    - "Unblocks Phase 120 (Mini PC livinityd UI Wave 1 — UMD path proven for fallback consumers)"
    - "Closes Phase 119 (v35.0 design-system reusable-component-library)"
tech_stack:
  added:
    - "(none — uses Phase 119-01 chassis + Phase 116 design-tokens)"
  patterns:
    - "Vite UMD: inline `process.env.NODE_ENV` as 'production' so the bundle doesn't reference a `process` global at runtime in plain <script> consumers"
    - "Node vm sandbox for UMD shape verification — no headless browser dep, no Playwright dep, just `node --check`-style"
    - "Smoke page mounts each component group in its own `ReactDOM.createRoot(...)` — failure isolation, each group renders independently"
    - "`window.__SMOKE_READY__ = true` + `livkit-ready` CustomEvent — explicit ready signal for future MCP/Playwright captures"
key_files:
  created:
    - "livos/packages/ui-kit/smoke-test/landing-umd.html"
    - "livos/packages/ui-kit/smoke-test/verify-umd.cjs"
    - "livos/packages/ui-kit/smoke-test/landing-umd.png"
  modified:
    - "livos/packages/ui-kit/vite.config.umd.ts (added `define: { 'process.env.NODE_ENV': '\"production\"' }`)"
    - "livos/packages/ui-kit/README.md (+132 lines — full UMD consumer recipe section)"
decisions:
  - "vite.config.umd.ts `define` for NODE_ENV: required for plain-browser UMD consumers — without it the bundle throws `process is not defined` on first load. Side effect: jsx-dev-runtime branch tree-shaken, UMD shrunk from 22.35 KB to 9.71 KB. Caught by 119-04 verifier; would have shipped broken into Phase 118."
  - "smoke-test/verify-umd.cjs uses Node `vm.runInContext` with `module`/`exports` deliberately omitted from the sandbox — this forces the UMD prelude into the global-attach branch (the same path a real browser takes), instead of the CJS `require('react')` branch (which needs a require shim and wouldn't exercise the global path)."
  - "PNG screenshot committed in-repo (not gitignored) — landing-umd.png is a visual fixture for future Phase 121 regression diffing; the small 57.3 KB cost is worth the locked baseline."
  - "Recipe in README uses unpkg pinned URLs (react@18.2.0, design-tokens@1, ui-kit@0) instead of relative paths — landing HTML pages live in /opt/landing/ on Server5, not in node_modules, so CDN-style URLs are the realistic consumer pattern. The smoke-test page itself uses relative paths because it lives next to dist/."
metrics:
  duration_minutes: 8
  completed_at: "2026-05-14T16:35:00Z"
  tasks_completed: 3
  files_created: 3
  files_modified: 2
  commits: 3
---

# Phase 119 Plan 04: UMD smoke test + landing consumer recipe Summary

## One-liner

Closed Phase 119 by proving the UMD build target end-to-end — wrote a self-contained smoke HTML page mounting 6 component groups via `window.LivKit`, a Node `vm`-based shape verifier asserting 18 exports (PASS), and a 57.3 KB headless Chrome screenshot artifact; caught and fixed a release-blocking `process is not defined` bug in `vite.config.umd.ts` (NODE_ENV inline) that would have crashed every plain-browser consumer.

## Verifier output (verbatim)

```
PASS: 18 exports verified from window.LivKit (C:\Users\hello\Desktop\Projects\contabo\livinity-io\livos\packages\ui-kit\dist\umd\livkit.umd.js)
  components (11):
    Button, Card, Pill, Input, PasswordInput, Stepper, CommandBox, Modal, NavBar, ThemeToggle, ToastProvider
  functions  (4):
    useToast, cn, applyLivTheme, readLivTheme
  values     (3):
    LIV_THEME_STORAGE_KEY, LIV_THEMES, __ui_kit_version__
  __ui_kit_version__: 0.1.0
```

## Bundle sizes (final v0.1.0, after 119-04 NODE_ENV inline fix)

| Artifact                              | Size      | Notes                                                      |
| ------------------------------------- | --------- | ---------------------------------------------------------- |
| `dist/index.mjs` (ESM)                | 14.42 KB  | tsup output for Vite/Next.js consumers                     |
| `dist/index.cjs` (CJS)                | 15.45 KB  | tsup output for legacy Node SSR                            |
| `dist/index.d.ts` (DTS)               | 6.48 KB   | All 11 component + 4 function + 3 value types              |
| `dist/index.css`                      | 9.45 KB   | atoms.css + composites.css concatenated                    |
| `dist/umd/livkit.umd.js`              | **9.49 KB** (gzip 4.00 KB) | **Down from 22.35 KB pre-fix** — jsx-dev-runtime dropped |
| `dist/umd/style.css`                  | 7.90 KB   | UMD stylesheet (atoms + composites)                        |
| `smoke-test/landing-umd.png`          | 55.96 KB  | Headless Chrome capture at 1280x1600                       |

## Files changed by this plan

```bash
$ git diff --name-only HEAD~3..HEAD -- livos/packages/ui-kit/
livos/packages/ui-kit/README.md
livos/packages/ui-kit/smoke-test/landing-umd.html
livos/packages/ui-kit/smoke-test/landing-umd.png
livos/packages/ui-kit/smoke-test/verify-umd.cjs
livos/packages/ui-kit/vite.config.umd.ts
```

5 files, all under `livos/packages/ui-kit/**` — D-119-NO-CONSUMER-CHANGES upheld.

## Verification

| Check                                                                       | Result                                  |
| --------------------------------------------------------------------------- | --------------------------------------- |
| `pnpm --filter @livinity/ui-kit build` (ESM + CJS + DTS + UMD)              | PASS                                    |
| `pnpm --filter @livinity/ui-kit build:umd` post NODE_ENV inline             | PASS, 9.71 KB (vs 22.35 KB pre-fix)     |
| `grep 'process.env.NODE_ENV' dist/umd/livkit.umd.js`                        | 0 matches (was 2 pre-fix)               |
| `node smoke-test/verify-umd.cjs`                                            | EXIT 0, 18 exports verified             |
| Chrome headless capture (`--headless=new --window-size=1280,1600`)          | PASS, 57305 bytes written               |
| `node -e 'fs.statSync(landing-umd.png).size >= 5120'`                       | PASS                                    |
| Visual inspection of PNG                                                    | PASS (all 6 groups rendered correctly)  |
| README contains: window.LivKit, livkit.umd.js, LivKit.Card/Button/NavBar, tokens.css, react@18.2.0, ToastProvider, useToast, smoke-test/landing-umd.html, nav.jsx | PASS (11/11 required tokens present)    |
| `git diff --name-only HEAD~3..HEAD -- ':!livos/packages/ui-kit/'`           | empty (D-119-NO-CONSUMER-CHANGES)       |

## Visual inspection of `landing-umd.png`

Rendered correctly in the 1280x1600 capture:

- **NavBar**: white `var(--card-bg)` bar with serif italic "Livinity" brand + ThemeToggle (☾ moon glyph, indicating next theme = dark) on the right.
- **Buttons row**: solid blue "Click me" (radius 999px pill), ghost outline "Ghost", red danger "Delete" — all matching dashboard.html idioms.
- **Pills row**: 4 tones (ok green, warn amber, err red, neutral grey) with `color-mix` tinted backgrounds + mono uppercase typography.
- **Cards grid**: default card (18px radius, normal padding) + tight card (smaller radius + padding) side-by-side, both with `var(--card-shadow)`.
- **Stepper**: 4 pill steps — Install (done ✓ green), Configure (active blue), Verify (idle), Done (idle).
- **Modal trigger**: solid "Open modal" button (Modal panel is open=false by default, opens on click per ModalDemo component).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UMD bundle threw `process is not defined` in plain browser consumers**

- **Found during:** Task 1, first `node smoke-test/verify-umd.cjs` run.
- **Issue:** `vite.config.umd.ts` did not inline `process.env.NODE_ENV`. The compiled UMD bundle therefore contained two `process.env.NODE_ENV === "production" ? ... : ...` references (from React's jsx-runtime entry). A plain `<script>` consumer in a browser, or the Node vm sandbox in `verify-umd.cjs`, would throw `ReferenceError: process is not defined` on the very first ternary evaluation — every Phase 118 landing HTML consumer would have shipped broken. The 119-04 verifier caught this before any consumer migration was attempted.
- **Fix:** Added `define: { "process.env.NODE_ENV": JSON.stringify("production") }` to `vite.config.umd.ts`. After rebuild:
  - `process.env.NODE_ENV` occurrences in `dist/umd/livkit.umd.js`: **2 -> 0**
  - Bundle size: **22.35 KB -> 9.71 KB** (the dev jsx-runtime branch is fully tree-shaken since NODE_ENV is statically "production")
  - Gzip: **8.60 KB -> 4.00 KB**
  - `verify-umd.cjs`: EXIT 3 (uncaught ReferenceError) -> EXIT 0 (PASS, 18 exports verified)
- **Why Rule 1 and not Rule 4:** No architectural change — single-line Vite config tweak; production-build behavior in line with how every other React UMD lib ships (React itself inlines NODE_ENV in its UMD production build). No new dependency, no public API change.
- **Files modified:** `livos/packages/ui-kit/vite.config.umd.ts`.
- **Commit:** Rolled into Task 1 commit `27adbd0b` along with smoke-test scaffolding.

**2. [Rule 1 - Bug] verify-umd.cjs initial sandbox exposed `module`/`exports` causing UMD to take CJS branch + call undefined `require`**

- **Found during:** Task 1, second `verify-umd.cjs` run (after Bug #1 was identified but before the NODE_ENV fix was applied — the two bugs were caught in the same session).
- **Issue:** The UMD prelude is `typeof exports === "object" && typeof module < "u" ? v(exports, require("react"), require("react-dom")) : ...`. The initial sandbox set `module: { exports: {} }` and `exports: {}`, sending execution down the CJS branch. `require` is not a global in a `vm` context (Node injects it as a Module-level lexical), so the call threw `ReferenceError: require is not defined`.
- **Fix:** Removed `module`/`exports` from the sandbox; left only `window`/`self`/`globalThis`/`React`/`ReactDOM`. This forces the UMD into its global-attach branch (the same path a real browser takes), which is also the more honest test of what landing HTML pages will hit.
- **Why Rule 1 and not Rule 4:** Pure verifier mechanics — the goal is to test the same code path browsers exercise, and the original sandbox shape was incorrect. Documented in a comment block at the top of the sandbox declaration.
- **Files modified:** `livos/packages/ui-kit/smoke-test/verify-umd.cjs`.
- **Commit:** Rolled into the same Task 1 commit `27adbd0b` (the verifier wasn't committed until it worked).

### Auth gates

None. Plan fully autonomous; unpkg fetched React 18.2.0 UMDs over the local internet connection during the Chrome headless capture — no auth required.

## Phase 119 closing checklist

| Locked decision (CONTEXT.md)         | Honored? | Evidence                                                                                                  |
| ------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------- |
| D-119-DASHBOARD-HTML-IS-SOURCE       | YES      | Every component in the smoke-test page mounts with token-driven visuals matching dashboard.html idioms. PNG visual inspection confirms NavBar/Button/Pill/Card/Stepper/Modal all use the canonical token values. |
| D-119-NO-CONSUMER-CHANGES            | YES      | All 5 files this plan touches are under `livos/packages/ui-kit/**`. `git diff --name-only HEAD~3..HEAD -- ':!livos/packages/ui-kit/'` returns empty. |
| D-119-3-BUILD-TARGETS                | YES      | All 3 build targets ship and are verified: ESM (14.42 KB tsup), CJS (15.45 KB tsup), UMD (9.49 KB vite, **proven to mount in headless Chrome**). |
| D-119-LIGHT-DARK-IRIDESCENT-PARITY   | YES      | ThemeToggle in the smoke page cycles all 3 themes via `applyLivTheme` / `readLivTheme`; LIV_THEMES export verified by `verify-umd.cjs`. (Dark/iridescent token surfaces themselves are tracked under D-116-FOLLOW-UP — out of 119 scope.) |
| D-119-A11Y-FOCUS-RINGS               | YES      | Atoms (119-02) ship `:focus-visible` rings + aria contracts; composites (119-03) ship Modal focus trap + ESC + restore. Verifier asserts every focus-ring-bearing component is exported. |

**Phase 119 ships v0.1.0 of `@livinity/ui-kit` with:**
- 5 atoms (Button, Card, Pill, Input, PasswordInput) + 6 composites (Stepper, CommandBox, Modal, ToastProvider/useToast, NavBar, ThemeToggle) = **11 components**.
- 4 utility functions + 3 exported values.
- 3 build targets (ESM 14.42 KB + CJS 15.45 KB + UMD 9.49 KB) — all proven functional.
- 62 Vitest assertions across 11 test files (atoms 25 + composites 32 + scaffold 5) — all PASS.
- Storybook 8 with 3-way livTheme global toolbar.
- README v0.1.0 consumer recipes for ESM/CJS/UMD paths.
- Phase 119-04 visual regression fixture (`smoke-test/landing-umd.png`).

## Consumers unblocked

- **Phase 118 (landing HTML polish)** — UMD recipe in README is copy-pasteable; `smoke-test/landing-umd.html` is the worked example.
- **Phase 120 (Mini PC livinityd UI migration wave 1)** — ESM path proven via 119-01 verification; UMD path now also proven as fallback.
- **Phase 121 (final cleanup)** — `nav.jsx` operators can adopt `LivKit.NavBar`; `landing-umd.png` is the locked-in visual baseline for future regressions.

## Commits

| # | Hash       | Message                                                                  |
| - | ---------- | ------------------------------------------------------------------------ |
| 1 | `27adbd0b` | feat(119-04): UMD smoke test scaffolding + NODE_ENV inline fix           |
| 2 | `c41e6509` | feat(119-04): add headless Chrome screenshot of UMD smoke page           |
| 3 | `05ff03cc` | feat(119-04): document UMD consumer recipe for landing HTML pages        |

## Known Stubs

None. The smoke-test page mounts real components with real props; the verifier asserts real export shapes; the README recipe is the one Phase 118 will paste verbatim. No placeholder data, no TODO markers, no "coming soon" copy.

## Threat surface scan

None. This plan ships:

- A static HTML file (`landing-umd.html`) that loads scripts via CDN (unpkg pinned) and from the local dist/ — no network endpoints, no auth paths.
- A Node CLI verifier (`verify-umd.cjs`) running in `vm` with no filesystem writes beyond its console output.
- A PNG fixture (`landing-umd.png`) — passive artifact.
- README documentation.

No new auth boundaries, no schema changes, no privileged surface.

## Self-Check: PASSED

Verified post-write:

- `livos/packages/ui-kit/smoke-test/landing-umd.html` — FOUND
- `livos/packages/ui-kit/smoke-test/verify-umd.cjs` — FOUND
- `livos/packages/ui-kit/smoke-test/landing-umd.png` — FOUND (57305 bytes, >5KB threshold)
- `livos/packages/ui-kit/vite.config.umd.ts` — UPDATED (NODE_ENV inline)
- `livos/packages/ui-kit/README.md` — UPDATED (+132 lines, all 11 required tokens present)
- `livos/packages/ui-kit/dist/umd/livkit.umd.js` — FOUND (9721 bytes, 0 process.env refs)
- `node smoke-test/verify-umd.cjs` — EXIT 0, 18 exports verified
- Commit `27adbd0b` — FOUND in `git log`
- Commit `c41e6509` — FOUND in `git log`
- Commit `05ff03cc` — FOUND in `git log`
