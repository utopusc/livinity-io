---
phase: 234-liv-ai-polish-ux
plan: 02
subsystem: livos-ui-shell
tags: [v42, polish, ui, window-size, dock-icon, brand-rename, vitest, livos-shell, deferred-cleanup]
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: UNCHANGED
section_g_resolution: G.1 (LIVINITY_liv-assistant absorbs 'Liv AI' brand; LIVINITY_liv-ai retired)
scope_expansion: empty-state.test.tsx Test 3 + caddy.ts LIV_AI_APP_HANDLE comment
commits:
  - d91563fd  # feat(234-02): Liv AI 1280x800 window + dock-ai-chat icon + brand rename
commit_count: 1
dependency_graph:
  requires:
    - 234-01-INVESTIGATION.md Section I 'Plan 234-02 spec'
    - Phase 227-01 (LivAssistantWindow iframe shell)
    - Phase 227-02 (LivOS dock entry + v42 migration flag)
    - Phase 231 (legacy chat-iframe retirement — left orphan LIVINITY_liv-ai entry)
  provides:
    - Operator-visible 1280x800 Liv AI window (was 900x600 default fallthrough)
    - Dedicated chat-style dock icon `/figma-exports/dock-ai-chat.svg`
    - Unified 'Liv AI' brand across dock label, window title, iframe title
    - Retired LIVINITY_liv-ai legacy surface (deferred Phase 231 cleanup completed)
  affects:
    - Plan 234-03 (vendored binary brand-string sed-replace — independent)
    - Plan 234-04 (auth bypass — depends on iframe still mounting LivAssistantWindow)
tech-stack:
  added: []  # no new deps (D-NO-NEW-DEPS preserved)
  patterns:
    - Phase 199-01 / Hot-fix N regression-lock vitest pattern (extended to LIVINITY_liv-assistant)
    - Phase 227-02 click-contract assertion pattern (updated title + icon args in lock-step)
key-files:
  created: []
  modified:
    - livos/packages/ui/src/providers/window-manager.tsx
    - livos/packages/ui/src/providers/window-manager.test.tsx
    - livos/packages/ui/src/providers/apps.tsx
    - livos/packages/ui/src/modules/desktop/dock.tsx
    - livos/packages/ui/src/modules/desktop/dock.test.tsx
    - livos/packages/ui/src/modules/window/app-contents/liv-assistant-window.tsx
    - livos/packages/ui/src/modules/window/app-contents/liv-assistant-window.unit.test.tsx
    - livos/packages/ui/src/modules/window/window-content.tsx
    - livos/packages/ui/src/features/liv-ai/empty-state.test.tsx
    - livos/packages/livinityd/source/modules/domain/caddy.ts
  deleted:
    - livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx
decisions:
  - "Adopted Section G.1 Resolution (LIVINITY_liv-assistant absorbs 'Liv AI' brand; LIVINITY_liv-ai retired) per 234-01-INVESTIGATION.md spec lock"
  - "Scope-expanded the deletion to 2 extra files (empty-state.test.tsx Test 3 + caddy.ts comment) — both were downstream consumers of the deleted LIVINITY_liv-ai registry entry that the investigation grep missed (word-boundary filter skipped indirect references)"
  - "Single combined atomic commit (TDD RED+GREEN collapsed into one ship) — diff-as-RED is unambiguous and the rebrand/cleanup pair is atomic by intent"
  - "caddy.ts LIV_AI_APP_HANDLE comment updated only (no routing change) — the /liv-ai-app/* handle still survives for OpenUI app windows (T-203-06 trust chain)"
metrics:
  duration_minutes: 12
  duration_human: "12m"
  completed: 2026-05-27
  tasks_total: 1
  tasks_completed: 1
  files_modified: 11  # 10 modified + 1 deleted
  vitest_targeted_pass: 26
  vitest_targeted_fail: 0
  vitest_full_pass_pre: 905
  vitest_full_fail_pre: 40  # pre-existing baseline at HEAD eb9f51df, verified via stash-and-rerun
  vitest_full_pass_post: 905
  vitest_full_fail_post: 40  # IDENTICAL — zero new failures introduced
---

# Phase 234 Plan 02: Liv AI 1280x800 Window + Dock Chat Icon + Brand Rename Summary

Wrapper-side UI polish landing the operator-visible delta for the v42 Liv AI surface in a single atomic commit. Window default size jumps from the fall-through `{900, 600}` to an explicit `{1280, 800}`. Dock icon swaps from the legacy `liv-ai.svg` (shared with the now-retired LIVINITY_liv-ai surface) to a dedicated chat-style `dock-ai-chat.svg`. The wrapper rebrand `'Liv Assistant'` → `'Liv AI'` lands across dock label, window title argument, and iframe `title` attribute simultaneously with the deferred Phase 231 cleanup that removes the orphan LIVINITY_liv-ai dock-registry entry + its `LivAiWindowContent` lazy import + the `fullHeightApps` Set membership + the switch-case arm + the orphan `liv-ai-content.tsx` file (Section G.1 Resolution).

## What Shipped

### One atomic commit: `d91563fd`

```
feat(234-02): Liv AI 1280x800 window + dock-ai-chat icon + brand rename
11 files changed, 119 insertions(+), 103 deletions(-)
delete mode 100644 livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx
```

### Per-file diff summary

| File | Lines added | Lines removed | Change kind |
|------|-------------|---------------|-------------|
| `livos/packages/ui/src/providers/window-manager.tsx` | +11 | -8 | Drop `LIVINITY_liv-ai {1400,900}`; add `LIVINITY_liv-assistant {1280,800}` with rationale comment |
| `livos/packages/ui/src/providers/window-manager.test.tsx` | +37 | -32 | Replace Phase 199-01 regression-lock with Phase 234-02 regression-lock (4 tests: exact size, NOT-default-fallthrough, pre-existing keys, legacy entry IS undefined) |
| `livos/packages/ui/src/providers/apps.tsx` | +9 | -16 | DELETE `LIVINITY_liv-ai` entry; rename `LIVINITY_liv-assistant.name` 'Liv Assistant'→'Liv AI'; swap icon path; consolidated rationale comment |
| `livos/packages/ui/src/modules/desktop/dock.tsx` | +8 | -1 | Third `handleOpenWindow` arg 'Liv Assistant'→'Liv AI'; explanatory comment block above the JSX |
| `livos/packages/ui/src/modules/desktop/dock.test.tsx` | +9 | -7 | `systemAppsKeyed` mock drops `LIVINITY_liv-ai`; click-contract expects `'Liv AI'` + `dock-ai-chat.svg`; comment update |
| `livos/packages/ui/src/modules/window/app-contents/liv-assistant-window.tsx` | +9 | -2 | iframe `title` attr 'Liv Assistant'→'Liv AI'; Phase 234-02 comment in module docstring; "Liv Assistant surface" → "Liv AI surface" prose |
| `livos/packages/ui/src/modules/window/app-contents/liv-assistant-window.unit.test.tsx` | +7 | -3 | Title-attribute assertion 'Liv Assistant'→'Liv AI'; comment update |
| `livos/packages/ui/src/modules/window/window-content.tsx` | +9 | -8 | Remove `LivAiWindowContent` lazy import; drop `LIVINITY_liv-ai` from `fullHeightApps`; remove `case 'LIVINITY_liv-ai'` switch arm; explanatory comments |
| `livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx` | 0 | -23 | **DELETED** — orphan 23-line iframe wrapper for the retired /liv-ai-app dashboard surface; no remaining consumer |
| `livos/packages/ui/src/features/liv-ai/empty-state.test.tsx` | +12 | -22 | Drop Phase 199-01 Test 3 (systemApps `id='LIVINITY_liv-ai'` name='Liv AI') since the consumer was deleted; drop the now-unused `systemApps` import; rewrite the surviving describe block's comment to point at `dock.test.tsx` as the new brand-string lock carrier |
| `livos/packages/livinityd/source/modules/domain/caddy.ts` | +8 | -1 | Update `LIV_AI_APP_HANDLE` JSDoc — clarify the surviving `/liv-ai-app/*` handle now serves OpenUI app windows (`OPENUI_<slug>` trust chain T-203-06), no longer `LivAiContent` |

**Totals:** 11 files changed, 119 insertions, 103 deletions (net +16 lines).

## Vitest Evidence

### Targeted tests — 26/26 GREEN

```
RUN  vitest v2.1.9 livos/packages/ui

 ✓ src/modules/window/app-contents/liv-assistant-window.unit.test.tsx  (4 tests)
 ✓ src/features/liv-ai/empty-state.test.tsx                            (6 tests)
 ✓ src/providers/window-manager.test.tsx                               (12 tests)
 ✓ src/modules/desktop/dock.test.tsx                                   (4 tests)

 Test Files  4 passed (4)
      Tests  26 passed (26)
   Duration  3.99s
```

### TDD RED-to-GREEN transition (single-commit collapse)

Pre-source-edit run of the same 4 targeted files reproduced **6 failing assertions**:

1. `window-manager.test.tsx` Test 1: `DEFAULT_WINDOW_SIZES["LIVINITY_liv-assistant"]` undefined → FAIL (test asserts `{1280, 800}`)
2. `window-manager.test.tsx` Test 4: `DEFAULT_WINDOW_SIZES["LIVINITY_liv-ai"]` returns `{1400, 900}` → FAIL (test asserts undefined)
3. `dock.test.tsx` click-contract: third arg is `'Liv Assistant'` → FAIL (test expects `'Liv AI'`)
4. `dock.test.tsx` click-contract: fourth arg is `'/figma-exports/liv-ai.svg'` → FAIL (test expects `'/figma-exports/dock-ai-chat.svg'`)
5. `liv-assistant-window.unit.test.tsx`: iframe title is `'Liv Assistant'` → FAIL (test asserts `'Liv AI'`)
6. (Compound) `dock.test.tsx` originRect Anything matcher → passed; nothing else changed

After applying the source edits (window-manager.tsx + apps.tsx + dock.tsx + liv-assistant-window.tsx + window-content.tsx + liv-ai-content.tsx delete + caddy.ts comment), all 26 targeted tests transitioned to GREEN.

### Full UI suite — zero new failures

```
 Test Files  14 failed | 87 passed   (101)
      Tests  40 failed | 905 passed  (945)
   Duration  17.88s
```

**Baseline verification:** Stashed the 234-02 edits and re-ran at HEAD `eb9f51df`. Result: identical `40 failed | 905 passed (945)`. Conclusion: **Plan 234-02 introduced zero new test failures.** All 40 failures are pre-existing baseline (Phase 182, 196, 199-04, 100-09/10, 199, 196-03, etc. — unrelated to this plan's scope). Per executor scope-boundary rule, pre-existing failures stay deferred (out-of-scope for 234-02).

## Build Evidence

```
$ pnpm --filter @livos/config build
> @livos/config@0.1.0 build
> tsc
[exit 0]

$ pnpm --filter ui build
... [Vite chunk listing] ...
✓ built in 31.63s
[exit 0]
```

Vite build PASS — no dangling imports surfaced from the `LivAiWindowContent` lazy-import removal or the `liv-ai-content.tsx` deletion.

## Typecheck Evidence (baseline preserved)

`pnpm --filter ui typecheck` errors:
- `stories/src/routes/stories/*.tsx` — pre-existing baseline (motion-primitives `ErrorBoundary` + stories-only `@/utils/wifi` missing modules; documented Phase 227-02 SUMMARY tolerable baseline)
- **No errors in the 10 modified files or the deleted file's former consumers.**

`pnpm --filter livinityd typecheck` errors:
- `source/modules/xai-auth/flow-service.ts:323-324` + `source/modules/xai-auth/opencode-spawner.ts:152-159` — pre-existing `ChildProcessWithoutNullStreams` baseline (Phase 196 carryover)
- **No errors in caddy.ts (the only livinityd file touched — comment-only).**

## Sacred SHA Evidence

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

UNCHANGED. Pre-commit hook output:
```
[sacred-sha] PASS: 20 files verified
[master d91563fd] feat(234-02): Liv AI 1280x800 window + dock-ai-chat icon + brand rename
```

None of the 11 touched files live under `liv/packages/core/`. The hook re-gated on commit and reported PASS.

## 234-01-INVESTIGATION.md Section G Resolution Applied

**Path taken: G.1 (preferred)** — LIVINITY_liv-assistant absorbs the 'Liv AI' brand identity; the legacy LIVINITY_liv-ai surface is retired wholesale.

The investigation's Section G.1 spec listed 6 files (apps.tsx, window-content.tsx, dock.tsx, liv-assistant-window.tsx, dock.test.tsx, and the orphan liv-ai-content.tsx delete) plus the window-manager.tsx + .test.tsx edits. While executing, two additional downstream consumers of the deleted `LIVINITY_liv-ai` registry entry surfaced that the investigation's `grep -E "LIVINITY_liv-ai\b"` did not catch because they referenced the entry indirectly:

1. **`livos/packages/ui/src/features/liv-ai/empty-state.test.tsx`** — Phase 199-01 brand regression-lock Test 3 imported `systemApps` from apps.tsx and asserted the existence of the entry with `id="LIVINITY_liv-ai"` and `name="Liv AI"`. Without scope-expansion, this test would have failed (`livAiEntry` would be `undefined`). Resolution: drop Test 3 (the brand-string lock for the dock label is now carried by `dock.test.tsx` click-contract `'Liv AI'` literal); drop the now-unused `systemApps` import; rewrite the surviving describe block's docstring to point at the new lock carrier.
2. **`livos/packages/livinityd/source/modules/domain/caddy.ts`** — `LIV_AI_APP_HANDLE` JSDoc named `LivAiContent` by reference as the consumer of the `/liv-ai-app/*` Caddy handle. With LivAiContent deleted, the comment was stale. Resolution: update the JSDoc to name the OpenUI app windows (`OPENUI_<slug>` trust chain T-203-06) as the surviving consumer of the handle. **No routing change** — the handle itself stays in place because OpenUI windows still use it.

Both scope-expansions are documented in the commit message body and applied in the same atomic commit. Total touched: **11 files** (10 modified + 1 deleted), one above the 7-file spec line in the plan frontmatter (+ caddy.ts comment, + empty-state.test.tsx, + the deleted liv-ai-content.tsx counted as a modification in the 7-file spec).

## Deviations from Plan

### Scope-expansion (Section G.1 invitation honored)

The plan's `action` block (Step 2.2) explicitly invited scope-expansion: "Verify NO live consumer remains: grep `LIVINITY_liv-ai` across `livos/packages/ui/src` and `livos/packages/livinityd/source` — **if matches surface, scope-expand the deletion** or keep the entry (document in commit message)." The 2 additional consumers above were addressed via the documented scope-expansion path. No deviation from intent.

### TDD RED+GREEN single-commit collapse (vs. preferred 2-commit split)

The plan listed two-commit (Step 1 RED + Step 2/3 GREEN) as "the preferred TDD pattern" with "one-commit collapse acceptable if the executor judges the RED-first cycle redundant." Chose single-commit collapse because:
- The rebrand + size-bump + cleanup form one atomic operator-visible delta (any partial state — e.g. tests updated but source not yet edited — would leave the dock + window UI in an inconsistent intermediate state).
- The diff-as-RED is unambiguous for the eventual reviewer reading the commit: every test assertion has an inline `Phase 234-02 — ...` comment naming what changed and why.
- The RED-first cycle was executed locally (RED tests written first, verified failing via `vitest run` against unmodified source, then source applied and re-run GREEN). The cycle happened in-process; only the commit shape collapses.

## Known Stubs

None. All wired strings + tests + assertions are real.

## Threat Flags

None. UI-only string + size + icon-path changes; the iframe sandbox token list, allow attribute, and CSP `frame-ancestors` are all untouched (`liv-assistant-window.tsx:43` LIV_ASSISTANT_SANDBOX constant + caddy.ts LIV_ASSISTANT_HANDLE CSP — both verified unchanged in the diff and asserted GREEN by the unit tests).

## Self-Check

**Files created:** N/A (no new files).

**Files modified (10):** verified present in `git status` post-commit (all in `M` state pre-commit and absent from `git status --short` post-commit).

**File deleted (1):** `livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx`:
```
$ git diff --diff-filter=D --name-only HEAD~1 HEAD
livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx
```
FOUND in deletion diff. Intentional per Section G.1 (orphan iframe wrapper, no consumer).

**Commit hash:**
```
$ git log --oneline | grep -q "d91563fd" && echo "FOUND" || echo "MISSING"
FOUND
```

**Sacred SHA:**
```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```
UNCHANGED (matches the locked constant).

## Self-Check: PASSED

## Handoff to Plan 03

Wrapper-side polish landed and operator-visible delta is live in the source tree. The vendored AionUi binary (Mini PC `/opt/liv-assistant/current/static/`) still contains `AionUi` / `aionui` brand strings in HTML + JS + CSS — Plan 03 handles that via idempotent sed-replace in `scripts/install-liv-assistant.sh` (pattern + targets locked in 234-01-INVESTIGATION.md Section I 'Plan 234-03 spec'). Plan 03 is independent of this commit's changes (the iframe still mounts the upstream binary unchanged; only the LivOS shell wrapping around it has rebranded).

## Handoff to Plan 04

The iframe still mounts `LivAssistantWindow` pointed at `LIV_ASSISTANT_DEFAULT_URL = '/liv/'` (Plan 04 will flip the default URL to `'/liv-login'` so the auto-login handler can mint the session before redirecting to `/liv/`). The `LIV_ASSISTANT_SANDBOX` token list, `allow` attribute, and CSP `frame-ancestors` are all untouched by Plan 02 — Plan 04 can rely on the same iframe trust boundary.

## Refs

- `.planning/phases/234-liv-ai-polish-ux/234-02-PLAN.md`
- `.planning/phases/234-liv-ai-polish-ux/234-01-INVESTIGATION.md` Section I 'Plan 234-02 spec' + Section G.1 Resolution
- `.planning/phases/227-livos-shell-livassistant-window/227-01-SUMMARY.md` (iframe + sandbox precedent)
- `.planning/phases/227-livos-shell-livassistant-window/227-02-SUMMARY.md` (dock + apps.tsx precedent)
- Commit `d91563fd` (single atomic feat commit for Plan 234-02)
- Pre-commit hook output: `[sacred-sha] PASS: 20 files verified`
