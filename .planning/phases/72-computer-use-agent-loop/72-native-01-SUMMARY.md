---
phase: 72-computer-use-agent-loop
plan: native-01
subsystem: computer-use
tags: [computer-use, bytebot, native-port, screenshot, nut-js, apache-2.0]
requires: ["@nut-tree-fork/nut-js@^4.2.6"]
provides:
  - "captureScreenshot() async function returning {base64, width, height, mimeType: 'image/png'}"
  - "ScreenshotResult type"
  - "native/ barrel module (single export, placeholders for native-02 + native-03)"
affects:
  - "Plan 72-native-05 (MCP server) — bridges computer_screenshot tool to captureScreenshot"
  - "Plan 72-native-04 (UI viewer) — consumes base64 frames"
tech-stack:
  added: ["@nut-tree-fork/nut-js@4.2.6"]
  patterns:
    - "Pure async function (no NestJS / no DI); strategy port from upstream NestJS service"
    - "vi.hoisted() + vi.mock() for ESM module mocking (necessary because vi.spyOn cannot redefine ESM exports)"
    - "UUID-based temp filenames for collision-safe concurrency (T-72N1-01)"
    - "Finally-block unlink with selective ENOENT swallow"
    - "Platform-guard error wrapping for nut-js native binding load failure (D-NATIVE-14)"
key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts
    - livos/packages/livinityd/source/modules/computer-use/native/screenshot.test.ts
    - livos/packages/livinityd/source/modules/computer-use/native/index.ts
  modified:
    - livos/packages/livinityd/package.json
    - livos/pnpm-lock.yaml
decisions:
  - "Mock @nut-tree-fork/nut-js + node:fs/promises via vi.mock + vi.hoisted (vi.spyOn fails on ESM non-configurable exports)"
  - "Temp filenames are pure crypto.randomUUID() (no .png suffix added by us — nut-js appends it)"
  - "Non-ENOENT unlink errors deliberately rethrown (catches EPERM/EACCES — surfaces real bugs)"
  - "Strategy port not framework port — NestJS service unwrapped to pure async function (D-NATIVE-01)"
  - "UI postinstall failure (mkdir -p on Windows cmd.exe) accepted as pre-existing dev-env issue, not blocking livinityd's nut-js install"
metrics:
  duration_minutes: 12
  tasks_completed: 3
  files_created: 3
  files_modified: 2
  test_cases: 5
  test_pass_rate: "5/5"
  completed: "2026-05-05T04:16:00Z"
---

# Phase 72 Plan native-01: Native X11 Screenshot Port Summary

**One-liner:** Bytebot screenshot capture ported as a pure async function via @nut-tree-fork/nut-js — no Docker, no NestJS — laying the foundation primitive for the native X11 computer-use stack.

## What Shipped

### Files Created (3)

| File | Lines | Purpose |
|------|-------|---------|
| `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts` | 114 | Pure async `captureScreenshot()` — UUID-named temp PNG via `screen.capture`, base64-encoded read, finally-block unlink with selective ENOENT swallow, D-NATIVE-14 platform-guard wrapper. Apache 2.0 attribution header. |
| `livos/packages/livinityd/source/modules/computer-use/native/screenshot.test.ts` | 146 | 5 vitest cases — function shape, happy path, read-failure cleanup, ENOENT swallow, non-ENOENT rethrow. Mocks both `@nut-tree-fork/nut-js` and `node:fs/promises` via `vi.hoisted` + `vi.mock`. |
| `livos/packages/livinityd/source/modules/computer-use/native/index.ts` | 12 | Barrel re-export of `captureScreenshot` + `ScreenshotResult` type. Comment placeholders for sibling plans 72-native-02 (input.ts) and 72-native-03 (window.ts) appends. |

### Files Modified (2)

| File | Change |
|------|--------|
| `livos/packages/livinityd/package.json` | Added `@nut-tree-fork/nut-js: ^4.2.6` to dependencies (alphabetical placement between `@novnc/novnc` and `@parcel/watcher`). |
| `livos/pnpm-lock.yaml` | 83 net packages added (nut-js + transitive deps including libnut native binaries for darwin/linux/win32). Resolution at `4.2.6`. |

### npm Dependency Added (sole new dep, per D-NATIVE-12)

- **Package:** `@nut-tree-fork/nut-js`
- **Spec range:** `^4.2.6`
- **Resolved version:** `4.2.6`
- **License:** Apache 2.0 (compatible with project usage; full text mirrored at `.planning/licenses/bytebot-LICENSE.txt`)
- **Used by:** `screenshot.ts` (imports `screen` + `FileType`)

## Tests

**5 vitest cases, all passing (run twice for idempotency):**

| ID | Case | Status |
|----|------|--------|
| T1 | `captureScreenshot` is a function with arity 0 | PASS |
| T2 | Happy path — returns `{base64, width: 1920, height: 1080, mimeType: 'image/png'}`; `screen.capture` called with PNG enum + UUID filename + tmpdir; `readFile`/`unlink` called with capture-returned path | PASS |
| T3 | Read failure — `readFile` throws → `unlink` STILL called (finally block); error propagates | PASS |
| T4 | ENOENT during unlink — swallowed; result returned normally | PASS |
| T5 | Non-ENOENT unlink errors (EPERM) — rethrown (defensive; surfaces real bugs) | PASS |

`pnpm vitest run source/modules/computer-use/native/screenshot.test.ts` — `5 passed (5)` in 379-380ms.

## Sacred SHA Verification

`nexus/packages/core/src/sdk-agent-runner.ts` SHA verified at:
1. **Task 1 start:** `4f868d318abff71f8c8bfbcf443b2393a553018b`
2. **Task 1 end (post-`pnpm install`):** `4f868d318abff71f8c8bfbcf443b2393a553018b`
3. **Task 2 mid (between RED/GREEN):** `4f868d318abff71f8c8bfbcf443b2393a553018b`
4. **Task 2 end (post-GREEN commit):** `4f868d318abff71f8c8bfbcf443b2393a553018b`
5. **Task 3 final:** `4f868d318abff71f8c8bfbcf443b2393a553018b`

UNCHANGED across all 5 checkpoints. D-NATIVE-15 honored.

## Commits

| Task | Commit | Type | Message |
|------|--------|------|---------|
| 1 | `800a9d94` | chore | `chore(72-native-01): add @nut-tree-fork/nut-js@^4.2.6 dep` |
| 2 | `aeb2f90a` | feat | `feat(72-native-01): port Bytebot screenshot via @nut-tree-fork/nut-js` |

Task 3 (build gate / final verify) had no commits — verification-only step.

## Decision Log

### Temp Filename Strategy
- **Choice:** `crypto.randomUUID()` raw (no `.png` suffix appended by us; nut-js' `screen.capture` adds it via the `FileType.PNG` arg).
- **Why:** Matches upstream Bytebot `nut.service.ts` pattern verbatim. UUID prevents collisions across concurrent calls (T-72N1-01 mitigation) AND keeps filenames unpredictable (no info-disclosure via /tmp listing).
- **Verified by:** Test T2 asserts `captureMock.mock.calls[0][0]` matches `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`.

### ENOENT-on-Unlink Swallow
- **Choice:** Swallow ONLY `code === 'ENOENT'`; rethrow everything else (EPERM, EACCES, EBUSY, etc.).
- **Why:** ENOENT is the legitimate concurrent-cleanup race (OS reaper, parallel call hit the path first). Other codes signal real bugs we want to surface — silently swallowing them would mask permission misconfigurations or disk-full scenarios that matter for production diagnosability.
- **Plan delta:** Plan must-have only mandated the ENOENT swallow case; the strict non-ENOENT rethrow is a defensive overlay verified via T5.
- **Verified by:** T4 (ENOENT swallowed) + T5 (EPERM rethrown).

### Mock Pattern: vi.hoisted + vi.mock (not vi.spyOn)
- **Issue:** First-pass test wrote `vi.spyOn(fsPromises, 'readFile').mockRejectedValue(...)`. Vitest threw `TypeError: Cannot redefine property: readFile` because ESM `node:fs/promises` exports are non-configurable bindings.
- **Fix (Rule 3 auto-fix):** Replaced with `vi.mock('node:fs/promises', () => ({readFile: mocks.readFileMock, unlink: mocks.unlinkMock}))` paired with `vi.hoisted(() => ({...}))` to construct the `vi.fn()`s before vi.mock factory hoisting.
- **Why hoisted:** Plain top-level `const captureMock = vi.fn()` doesn't work because vi.mock is hoisted ABOVE the const declaration → TDZ ReferenceError when factory references the symbol.
- **Codified by:** Test file head comment block explaining both quirks; future native-* test authors get the pattern verbatim.

### Strategy Port (not Framework Port)
- **Choice:** Pure `async function` exported directly. No NestJS, no `@Injectable`, no class wrapping, no DI.
- **Why:** Per `<scope_guard>` ("DO NOT add NestJS, DI, decorators — Bytebot upstream uses NestJS but we explicitly extract the IMPLEMENTATION STRATEGY (the nut-js calls) into pure functions"). The IP being ported is the API-surface knowledge (`screen.capture` + `FileType.PNG` + temp-file-then-base64 pattern), not the framework.
- **Apache 2.0 attribution:** Honored via mandatory file-header comment block citing upstream URL + snapshot date + license file mirror.

### Platform Guard Error Wrap (D-NATIVE-14)
- **Choice:** `try { await screen.capture(...) } catch (err) { throw new Error('Native screenshot unavailable on platform: ${process.platform}. Bytebot computer-use requires Linux + X server (Mini PC). Underlying error: ${message}'); }`
- **Why:** When `nut-js` native binding fails to load (Windows dev env, headless CI without X server), the raw error is cryptic ("Cannot find module 'libnut'" or similar). Wrapping with `process.platform` + actionable hint ("Bytebot computer-use requires Linux + X server (Mini PC)") makes diagnosis instant.
- **Note:** No dedicated test for this branch in this plan — the mock replaces `screen.capture` entirely so the try/catch never trips. Live exercise happens at 72-native-07 UAT on Mini PC. The error message string itself is greppable for future testing.

### Pre-existing Typecheck Baseline (Substitution)
- **Issue:** `pnpm --filter livinityd typecheck` reports 30+ errors in `user/routes.ts`, `user/user.ts`, `widgets/routes.ts`, `utilities/file-store.ts`. None touch the 3 new files in this plan.
- **Choice:** Per established Phase 71-04 / 71-05 / 76-01 / 76-03 typecheck-substitution pattern (4 prior decisions logged in STATE.md), pre-existing baseline errors in unrelated files are out-of-scope. Verification gate: zero NEW errors in `native/screenshot.ts` / `native/screenshot.test.ts` / `native/index.ts`. Confirmed via filter `pnpm typecheck 2>&1 | grep native | head` — only 3 errors and ALL belong to sibling-injected `input.test.ts` (plan 72-native-02 in flight, not my plan).
- **Decision codified at:** Phase 71-04 + 76-01 SUMMARYs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] vi.mock hoisting requires vi.hoisted() for top-level mock state**
- **Found during:** Task 2 first GREEN attempt
- **Issue:** Test file used plain top-level `const captureMock = vi.fn()`. vi.mock hoists above it → `ReferenceError: Cannot access 'captureMock' before initialization`.
- **Fix:** Wrapped mocks in `vi.hoisted(() => ({...}))`. Documented in test file header.
- **Files modified:** `screenshot.test.ts`
- **Commit:** Inline in `aeb2f90a` (single feat commit for the GREEN phase)

**2. [Rule 3 - Blocker] vi.spyOn cannot redefine ESM exports → switch to vi.mock**
- **Found during:** Task 2 second GREEN attempt
- **Issue:** Test used `vi.spyOn(fsPromises, 'readFile')` for tests T2-T5. ESM module exports are non-configurable bindings → `TypeError: Cannot redefine property: readFile`.
- **Fix:** Switched to `vi.mock('node:fs/promises', () => ({...}))` with hoisted mocks. T1 was the only test that didn't spy on fs (it only checks function shape), so refactor was localized.
- **Files modified:** `screenshot.test.ts`
- **Commit:** Inline in `aeb2f90a`

**3. [Rule 3 - Out-of-scope] UI package postinstall failure on Windows (mkdir -p) ignored**
- **Found during:** Task 1 `pnpm install`
- **Issue:** `packages/ui` postinstall script runs `mkdir -p public/generated-tabler-icons && cp -r ...`. Windows cmd.exe doesn't accept `-p` flag → ELIFECYCLE failure with exit 1.
- **Decision:** Per `<scope_guard>` and SCOPE BOUNDARY rule, this is pre-existing UI-package issue unrelated to my plan. The actual `livinityd` workspace had `@nut-tree-fork/nut-js@4.2.6` resolved cleanly into the pnpm store (verified: `livos/node_modules/.pnpm/@nut-tree-fork+nut-js@4.2.6` exists, lock file entry present, transitive libnut native binaries staged).
- **Logged for:** future dev-env hardening (cross-env / shx for postinstall scripts) — NOT auto-fixed in this plan.

### Sibling-Agent File Coexistence (informational, not deviation)

While I was executing this plan, parallel-wave agents 72-native-02 (input.ts) and 72-native-03 (window.ts) committed sibling files into the same `native/` directory:
- `window.ts`, `window.test.ts` — created by sibling
- `input.test.ts` — created by sibling (input.ts not yet shipped, hence the 3 typecheck errors in `input.test.ts` — not my concern)
- `index.ts` was modified post-my-commit by sibling 72-native-03 to append `export * from './window.js'`

Per `<destructive_git_prohibition>` and `<scope_guard>`, these were NEITHER reverted NOR included in my commits. My 3-file commit boundary is exact and verifiable via `git diff aeb2f90a~1 aeb2f90a --stat`.

## Threat Surface Audit

Per plan `<threat_model>`:

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-72N1-01 (Info Disclosure: temp file) | mitigated | UUID filename → unpredictable path; finally-block unlink → file lifetime ~ms; mode 0600 default on Linux. |
| T-72N1-02 (Tampering: nut-js supply chain) | accepted | Apache-2.0 fork of widely-used nut-js; pinned `^4.2.6`; no auto-updates. |
| T-72N1-03 (DoS: /tmp fill via excessive screenshots) | accepted | Each capture unlinks immediately after read; agent run-loop bounded to 1 tool call at a time. |
| T-72N1-04 (Elevation: livinityd-as-root reads X server) | accepted | Documented architecture decision (D-NATIVE-09); livinityd already root for /opt/livos write + Docker control. |

No NEW security surface beyond what plan registered.

## Live Capture — Deferred to UAT

Real screenshot capture on a live X server CANNOT be exercised on the dev-Windows host. The mocked test suite proves:
- Function shape + return contract (T1)
- Argument plumbing to `screen.capture` (T2)
- Cleanup semantics under both happy and error paths (T3, T4, T5)

End-to-end live capture validation is owned by **Plan 72-native-07 UAT on Mini PC** — the first place where a real X server (display :0) + live nut-js native binding exists in the same execution context.

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts` — FOUND (114 lines, captureScreenshot exported)
- [x] `livos/packages/livinityd/source/modules/computer-use/native/screenshot.test.ts` — FOUND (146 lines, 5 cases pass)
- [x] `livos/packages/livinityd/source/modules/computer-use/native/index.ts` — FOUND (12 lines, captureScreenshot re-exported)
- [x] `livos/packages/livinityd/package.json` — `@nut-tree-fork/nut-js: ^4.2.6` present
- [x] `livos/pnpm-lock.yaml` — `@nut-tree-fork/nut-js@4.2.6` resolved
- [x] Commit `800a9d94` (chore: dep) — FOUND in `git log`
- [x] Commit `aeb2f90a` (feat: screenshot port) — FOUND in `git log`
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNCHANGED at start AND end
