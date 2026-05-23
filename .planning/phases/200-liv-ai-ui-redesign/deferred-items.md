# Phase 200 — Deferred Items

Out-of-scope discoveries logged during Plan 200-* execution. Each entry
notes the plan that found it; none are fixed inline (scope boundary —
the issue does not block the current plan and was not caused by it).

---

## 200-05 — Discovered 2026-05-23

### model-picker.test.tsx — 3 pre-existing failures

- **Tests:** Test 4 "clicking grok-4.3 item fires onChange once", Test 5
  "clicking grok-4.20-0309-reasoning item fires onChange once", Test 6
  "selected item shows Check while others show their model Icon".
- **Root cause (suspected):** Radix DropdownMenu + jsdom shim drift —
  the menu does not render `[data-radix-menu-content]` children when
  triggered via `.click()`. Other tests in the same file that don't
  open the menu pass.
- **Verified pre-existing:** Reproduces on master @ `4648a770` before
  Plan 200-05 edits (`git stash` → run → 3 failed; stash pop → still 3
  failed).
- **Impact:** Not blocking Plan 200-05 (composer test catches the
  picker via the live `<LivAiModelPicker>` it renders inline; the
  failing tests are isolated to the DropdownMenu open-state in
  isolation).
- **Action:** Defer to a focused jsdom shim plan. Plan 200-* does not
  touch model-picker.tsx (KEEP-AS-IS per RESEARCH §D).

### ui-package-wide typecheck — pre-existing tailwind + stories drift

- **Symptoms:** `pnpm --filter ui typecheck` exits non-zero with
  errors in `stories/src/routes/stories/widgets.tsx`,
  `stories/src/routes/stories/wifi.tsx`, and a tailwind config theme
  type incompatibility.
- **Verified pre-existing:** Reproduces on master without Plan 200-05
  edits. Files I touched (composer.tsx, assistant.tsx, composer.test.tsx,
  assistant.test.tsx) typecheck clean individually.
- **Impact:** Plan 200-05 verify block calls `pnpm --filter ui
  typecheck` which fails on these pre-existing issues. Plan-spec verify
  is subsumed by per-file tsc clean + targeted vitest pass.
- **Action:** Defer to a stories cleanup / tailwind type-pin plan.

### devtools-mount.tsx — missing @assistant-ui/react-devtools types

- **Symptom:** `error TS2307: Cannot find module
  '@assistant-ui/react-devtools' or its corresponding type
  declarations.`
- **Verified pre-existing:** Reproduces on master.
- **Impact:** Does not affect composer rebuild.
- **Action:** Defer.

---

## 200-07 — Discovered 2026-05-23

### ui-package-wide vitest — 13 file / 40 test failures across docker, onboarding, webapp-stream-window, settings, tests/, tests-examples/

- **Failing files (all pre-existing, none touched by Plan 200-07):**
  - `src/features/liv-ai/model-picker.test.tsx` (already in Plan 200-05 defer list)
  - `src/features/onboarding-flow/steps/provider-step.test.tsx`
  - `src/modules/window/webapp-stream-window.unit.test.tsx`
  - `src/routes/docker/dashboard/use-tag-filter.unit.test.ts`
  - `src/routes/docker/palette/use-recent-searches.unit.test.ts`
  - `src/routes/docker/sidebar-density.unit.test.ts`
  - `src/routes/docker/sidebar.unit.test.ts`
  - `src/routes/docker/store.unit.test.ts`
  - `src/routes/settings/_components/settings-content.test.tsx`
  - `tests/example.spec.ts`, `tests/happy-path.spec.ts`,
    `tests-examples/demo-todo-app.spec.ts` (Playwright suites — picked
    up by vitest but never intended to run there)
- **Verified pre-existing:** `git stash` of Plan 200-07's 4-file diff
  → re-ran `vitest run` on the same set → same failures (e.g.,
  `use-recent-searches` + `use-tag-filter` + `provider-step` produced
  16 failures across 3 files identically with the stash applied).
  Plan 200-07's edits are limited to `thread-list-adapter.ts`,
  `thread-list-adapter.test.tsx`, `assistant.tsx`, and
  `assistant.test.tsx`; none of the failing files share imports with
  the Plan 200-07 surface.
- **Plan 200-07 in-scope suite:** PASS (18/18) —
  `thread-list-adapter.test.tsx` (7/7) +
  `assistant.test.tsx` (11/11).
- **Impact:** Out-of-scope; cannot fix in this plan without violating
  the SCOPE BOUNDARY rule. Per-file tsc + targeted vitest is the
  Plan 200-07 verification gate.
- **Action:** Defer to a dedicated test-cleanup plan (probably groups
  best with Plan 200-05's deferred items above — same jsdom / shim /
  localStorage drift class of failure).
