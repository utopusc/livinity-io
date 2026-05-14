---
phase: 119-reusable-component-library
plan: 01
subsystem: design-system
tags: [ui-kit, scaffolding, tsup, vite, vitest, storybook, esm, cjs, umd, workspace]
dependency_graph:
  requires:
    - "@livinity/design-tokens (Phase 116, workspace package, already shipped)"
  provides:
    - "@livinity/ui-kit v0.1.0 — empty React component library chassis"
    - "ESM + CJS + UMD build pipelines (tsup + vite UMD)"
    - "Vitest jsdom test runner + @testing-library/jest-dom matchers"
    - "Storybook 8 with design-tokens injected into preview + livTheme global toolbar"
    - "Shared utilities: cn() className merger, applyLivTheme/readLivTheme/LIV_THEMES"
  affects:
    - "Unblocks Wave 2: 119-02 (atoms) + 119-03 (composites)"
    - "Unblocks Wave 3: 119-04 (UMD landing HTML integration smoke test)"
tech_stack:
  added:
    - "tsup ^8.3.0 (resolved 8.5.1) — ESM+CJS+DTS bundler"
    - "vite ^5.4.0 (resolved 5.4.21) — UMD-only build"
    - "vitest ^2.1.9 + jsdom ^25.0.1 — test runner"
    - "@vitejs/plugin-react ^4.3.0 (resolved 4.7.0)"
    - "@testing-library/react ^16.0.0 (resolved 16.3.2)"
    - "@testing-library/jest-dom ^6.5.0 (resolved 6.9.1)"
    - "@testing-library/user-event ^14.5.2 (resolved 14.6.1)"
    - "@storybook/react-vite ^8.3.0 (resolved 8.6.18) + addon-essentials"
    - "clsx ^2.1.1 (peer-light, hard dep)"
    - "@jridgewell/gen-mapping ^0.3.13 + @babel/generator ^7.29.0 (Windows pnpm hoisting helpers — see Deviations)"
  patterns:
    - "Dual-runtime: tsup owns dist/index.* (mjs+cjs+d.ts); vite owns dist/umd/livkit.umd.js (separate config to avoid emptyOutDir collision)"
    - "Side-effect CSS imports in Storybook preview.tsx wire @livinity/design-tokens tokens.css + fonts.css globally"
    - "globalTypes.livTheme toolbar drives applyLivTheme() decorator — every story renders in chosen theme without per-story plumbing"
key_files:
  created:
    - "livos/packages/ui-kit/package.json"
    - "livos/packages/ui-kit/tsconfig.json"
    - "livos/packages/ui-kit/tsup.config.ts"
    - "livos/packages/ui-kit/vite.config.umd.ts"
    - "livos/packages/ui-kit/vitest.config.ts"
    - "livos/packages/ui-kit/.npmrc"
    - "livos/packages/ui-kit/.gitignore"
    - "livos/packages/ui-kit/README.md"
    - "livos/packages/ui-kit/.storybook/main.ts"
    - "livos/packages/ui-kit/.storybook/preview.tsx"
    - "livos/packages/ui-kit/.storybook/manager.ts"
    - "livos/packages/ui-kit/src/index.ts"
    - "livos/packages/ui-kit/src/lib/cn.ts"
    - "livos/packages/ui-kit/src/lib/theme-classes.ts"
    - "livos/packages/ui-kit/src/test/setup.ts"
    - "livos/packages/ui-kit/src/__smoke__/scaffold.test.ts"
    - "livos/packages/ui-kit/src/stories/Scaffold.stories.tsx"
  modified:
    - "livos/pnpm-workspace.yaml (one-line append: packages/ui-kit)"
    - "livos/pnpm-lock.yaml (~80 new entries for tsup/vite/vitest/storybook tree)"
decisions:
  - "Used .npmrc public-hoist-pattern locally (ui-kit package) for @jridgewell/* + @babel/* — workaround for pnpm v10 strict resolution + Storybook 8 Babel internals failing to find transitive deps via esbuild-register on Windows. Did not touch root .npmrc (would have leaked to other packages)."
  - "tsup emptyOutDir true is the default — vite UMD config explicitly sets emptyOutDir: false so the two-step build (build:lib → build:umd) doesn't wipe each other's outputs. UMD writes into dist/umd/ subfolder."
  - "Storybook 8.6 was auto-resolved despite ^8.3 pin — fine since Storybook 8.x is API-stable. Same for Vitest 2.1.9 → 2.1.9 exact (matches Mini PC ui package)."
metrics:
  duration_minutes: 10
  completed_at: "2026-05-14T23:16:28Z"
  tasks_completed: 3
  files_created: 17
  files_modified: 2
  commits: 3
---

# Phase 119 Plan 01: `@livinity/ui-kit` scaffolding Summary

## One-liner

Shipped the `@livinity/ui-kit` workspace package chassis with ESM/CJS (tsup) + UMD (vite) + Vitest (jsdom) + Storybook 8 (with `@livinity/design-tokens` CSS variables injected and a 3-way `livTheme` global toolbar), unblocking Wave 2 (atoms / composites).

## What was built

### Package layout (`livos/packages/ui-kit/`)

```
ui-kit/
├── package.json            (name @livinity/ui-kit v0.1.0, peerDep react ^18)
├── tsconfig.json           (React 18 jsx, strict, ES2020, Bundler resolution)
├── tsup.config.ts          (entry src/index.ts → dist/index.mjs + .cjs + .d.ts)
├── vite.config.umd.ts      (UMD-only: dist/umd/livkit.umd.js, name "LivKit")
├── vitest.config.ts        (jsdom env, @vitejs/plugin-react, setup file)
├── .npmrc                  (public-hoist-pattern for @jridgewell + @babel)
├── .gitignore              (dist/, storybook-static/, node_modules/)
├── README.md               (consumer docs: ESM/CJS/UMD usage)
├── .storybook/
│   ├── main.ts             (@storybook/react-vite + addon-essentials)
│   ├── preview.tsx         (loads design-tokens CSS + livTheme toolbar)
│   └── manager.ts          (placeholder)
└── src/
    ├── index.ts            (placeholder __ui_kit_version__ export)
    ├── lib/
    │   ├── cn.ts           (clsx wrapper)
    │   └── theme-classes.ts (LIV_THEMES + applyLivTheme + readLivTheme)
    ├── test/
    │   └── setup.ts        (jest-dom/vitest matchers)
    ├── __smoke__/
    │   └── scaffold.test.ts (5 assertions — all green)
    └── stories/
        └── Scaffold.stories.tsx (4 accent swatches + canonical card)
```

### Workspace registration

`livos/pnpm-workspace.yaml` now lists `packages/ui-kit` between `ui-next` and
`livinityd`. `pnpm install` resolves `@livinity/design-tokens` from
the workspace (`link:../design-tokens`), confirmed via `pnpm why`.

### Built outputs

After `pnpm --filter @livinity/ui-kit build`:

| Path                                      | Size    | Format |
|-------------------------------------------|---------|--------|
| `dist/index.mjs`                          | 151 B   | ESM    |
| `dist/index.mjs.map`                      | 283 B   | -      |
| `dist/index.cjs`                          | 184 B   | CJS    |
| `dist/index.cjs.map`                      | 285 B   | -      |
| `dist/index.d.ts`                         | 76 B    | DTS    |
| `dist/index.d.cts`                        | 76 B    | DTS    |
| `dist/umd/livkit.umd.js`                  | 360 B   | UMD    |
| `dist/umd/livkit.umd.js.map`              | 310 B   | -      |

After `pnpm --filter @livinity/ui-kit storybook:build`:

- `storybook-static/index.html` ✅ exists
- 17 chunks generated, biggest `DocsRenderer-*.js` at 884 kB (expected — Storybook autodocs)

### Tooling versions (resolved from `livos/pnpm-lock.yaml`)

| Tool                              | Pinned       | Resolved   |
|-----------------------------------|--------------|------------|
| typescript                        | ^5.8.3       | 5.9.3      |
| tsup                              | ^8.3.0       | 8.5.1      |
| vite                              | ^5.4.0       | 5.4.21     |
| vitest                            | ^2.1.9       | 2.1.9      |
| jsdom                             | ^25.0.1      | 25.0.1     |
| @vitejs/plugin-react              | ^4.3.0       | 4.7.0      |
| @testing-library/react            | ^16.0.0      | 16.3.2     |
| @testing-library/jest-dom         | ^6.5.0       | 6.9.1      |
| @testing-library/user-event       | ^14.5.2      | 14.6.1     |
| storybook                         | ^8.3.0       | 8.6.18     |
| @storybook/react-vite             | ^8.3.0       | 8.6.18     |
| @storybook/addon-essentials       | ^8.3.0       | 8.6.14     |
| clsx                              | ^2.1.1       | (latest)   |
| react (devDep + peerDep)          | ^18.2.0      | 18.3.1     |
| @jridgewell/gen-mapping           | ^0.3.13      | 0.3.13     |
| @babel/generator                  | ^7.29.0      | 7.29.1     |

Drift from plan pins:
- `typescript` resolved 5.9.3 (not 5.8.3 exact) — minor bump, no API change.
- `vite` resolved 5.4.21 (matches ^5.4.0).
- `@vitejs/plugin-react` resolved 4.7.0 (not 4.3.0 exact) — minor bump.
- `storybook` resolved 8.6.18 (not 8.3.0 exact) — minor bump within Storybook 8 stable API.
- Extra devDeps not in plan: `@jridgewell/gen-mapping` and `@babel/generator` — see Deviations.

## Verification

| Check                                                      | Result                                  |
|------------------------------------------------------------|-----------------------------------------|
| `pnpm install` resolves new workspace                      | PASS (after `--ignore-scripts`)         |
| `pnpm --filter @livinity/ui-kit exec node -e "name"`       | PASS (`@livinity/ui-kit`)               |
| `pnpm --filter @livinity/ui-kit build:lib` (tsup)          | PASS (151 B esm + 184 B cjs + 76 B dts) |
| `pnpm --filter @livinity/ui-kit build:umd` (vite)          | PASS (360 B UMD with LivKit global)     |
| `pnpm --filter @livinity/ui-kit build` (both)              | PASS                                    |
| `pnpm --filter @livinity/ui-kit test` (vitest)             | PASS (5/5 assertions)                   |
| `pnpm --filter @livinity/ui-kit typecheck` (tsc --noEmit)  | PASS (no errors)                        |
| `pnpm --filter @livinity/ui-kit storybook:build`           | PASS (storybook-static/index.html)      |
| `node -e "require('./dist/index.cjs')"` from livos/        | PASS (logs `0.1.0`)                     |
| UMD file references `LivKit` global                        | PASS                                    |
| `@livinity/design-tokens` resolved via `workspace:*`       | PASS (`link:../design-tokens`)          |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pre-existing Windows postinstall failure in `livos/packages/ui`**
- **Found during:** Task 1, first `pnpm install` from `livos/`
- **Issue:** `livos/packages/ui` has a `postinstall` script using `mkdir -p` (Unix-only) that fails on Windows under cmd.exe. This is **pre-existing breakage** (the `ui` package's postinstall has been broken on Windows since before Phase 119) — not introduced by this plan.
- **Fix (scoped):** Used `pnpm install --ignore-scripts` instead of `pnpm install`. The new `@livinity/ui-kit` workspace registers fine; the broken `ui` postinstall is untouched. Out-of-scope to fix per SCOPE BOUNDARY rule.
- **Files modified:** none.
- **Commit:** (rolled into Task 1 commit `a64160e6`).

**2. [Rule 3 - Blocking] Storybook 8 build fails: `Cannot find module '@jridgewell/gen-mapping'` on Windows + pnpm v10 strict resolution**
- **Found during:** Task 3, first `pnpm --filter @livinity/ui-kit storybook:build`
- **Issue:** Storybook 8.6 loads `@babel/generator` via `esbuild-register` to evaluate the TypeScript `.storybook/main.ts`. Through pnpm's strict symlinks, `@babel/generator/lib/source-map.js` failed to resolve its transitive dependency `@jridgewell/gen-mapping` on Windows. Root cause investigated: the package store entry `node_modules/.pnpm/@jridgewell+gen-mapping@0.3.13/node_modules/@jridgewell/gen-mapping/` was **empty** (corrupt pnpm extract) — Babel's `require()` then failed even though the symlink existed.
- **Fix:**
  1. Added `@jridgewell/gen-mapping ^0.3.13` + `@babel/generator ^7.29.0` as direct devDeps of `@livinity/ui-kit` so they are referenced by the package — this forced pnpm to keep them in the lockfile.
  2. Added `livos/packages/ui-kit/.npmrc` with `public-hoist-pattern[]=*@jridgewell/*` + `@babel/generator` + `@babel/traverse` so the modules end up in `ui-kit/node_modules/` directly (resolvable from any chain).
  3. Ran `pnpm install --force --ignore-scripts` to re-extract the corrupt store entry — this restored the actual `dist/`, `src/`, `types/` files in `@jridgewell/gen-mapping`.
- **Files modified:** `livos/packages/ui-kit/package.json` (devDeps), `livos/packages/ui-kit/.npmrc` (new), `livos/pnpm-lock.yaml`.
- **Commit:** Rolled into Task 3 commit `4ab24bcf`.
- **Why this is Rule 3 and not Rule 4:** No architectural change — the package additions are dev-only tooling helpers for Windows pnpm strict-resolution edge cases. No production code path touched, no consumer change.

### Auth gates

None. Plan fully autonomous.

## Locked decisions honored

| ID                                  | Honored? | Evidence                                                                                          |
|-------------------------------------|----------|---------------------------------------------------------------------------------------------------|
| D-119-DASHBOARD-HTML-IS-SOURCE      | YES      | No new visual tokens invented; scaffold story uses only canonical `var(--accent-*)` + `--card-*`. |
| D-119-NO-CONSUMER-CHANGES           | YES      | `git diff --name-only` shows only `livos/packages/ui-kit/**` + `pnpm-workspace.yaml` + lockfile.  |
| D-119-3-BUILD-TARGETS               | YES      | ESM (`dist/index.mjs`) + CJS (`dist/index.cjs`) + UMD (`dist/umd/livkit.umd.js`) all produced.    |
| D-119-LIGHT-DARK-IRIDESCENT-PARITY  | YES      | `applyLivTheme` toggles `body.dark`/`body.iridescent`; Storybook `livTheme` toolbar wires all 3.  |
| D-119-A11Y-FOCUS-RINGS              | N/A      | No components shipped this plan; Wave 2 enforces a11y per component.                              |

## Commits

| # | Hash       | Message                                                            |
|---|------------|--------------------------------------------------------------------|
| 1 | `a64160e6` | feat(119-01): scaffold @livinity/ui-kit package skeleton           |
| 2 | `468f9802` | feat(119-01): wire tsup ESM+CJS build + Vitest jsdom for ui-kit    |
| 3 | `4ab24bcf` | feat(119-01): wire UMD build (vite) + Storybook 8 with design-tokens injection |

## Known Stubs

None. The `src/index.ts` placeholder export (`__ui_kit_version__`) is **intentional** — 119-02 (atoms) and 119-03 (composites) populate the real exports. The empty namespace is the chassis contract for Wave 2.

## Open carry-overs for Wave 2

- 119-02 must extend `src/index.ts` with atom exports (Button, Card, Pill, Input, PasswordInput).
- 119-03 must extend `src/index.ts` with composite exports (Stepper, CommandBox, Modal, Toast, NavBar, ThemeToggle).
- 119-04 will validate UMD path in a static HTML page (`window.LivKit.Button` smoke).
- `livos/packages/ui-kit/.npmrc` exists for Windows Storybook stability — keep it; do NOT remove in Wave 2.

## Self-Check: PASSED

Verified post-write:

- `livos/packages/ui-kit/package.json` — FOUND
- `livos/packages/ui-kit/tsup.config.ts` — FOUND
- `livos/packages/ui-kit/vite.config.umd.ts` — FOUND
- `livos/packages/ui-kit/vitest.config.ts` — FOUND
- `livos/packages/ui-kit/.storybook/preview.tsx` — FOUND
- `livos/packages/ui-kit/src/index.ts` — FOUND
- `livos/packages/ui-kit/src/lib/cn.ts` — FOUND
- `livos/packages/ui-kit/dist/index.mjs` — FOUND (151 B)
- `livos/packages/ui-kit/dist/index.cjs` — FOUND (184 B)
- `livos/packages/ui-kit/dist/index.d.ts` — FOUND (76 B)
- `livos/packages/ui-kit/dist/umd/livkit.umd.js` — FOUND (360 B, contains `LivKit`)
- `livos/packages/ui-kit/storybook-static/index.html` — FOUND
- Commit `a64160e6` — FOUND in `git log`
- Commit `468f9802` — FOUND in `git log`
- Commit `4ab24bcf` — FOUND in `git log`
