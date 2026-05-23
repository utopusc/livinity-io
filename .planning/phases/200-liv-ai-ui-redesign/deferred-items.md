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
