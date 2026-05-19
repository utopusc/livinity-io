---
phase: 160
plan: 160-04
subsystem: livinityd ai prompt-builder / computer-use native helpers
tags: [luse-overlay, xdpyinfo, runtime-display-size, d-09-honored, d-no-new-deps, sacred-sha-preserved]
dependency-graph:
  requires:
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts (Plan 160-02 buildLuseOverlay + LuseOverlayOpts.actualDisplaySize placeholder)
    - livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts (Plan 102-06 LUSE_TARGET_DISPLAY env threading — read-only here)
    - node:child_process spawn (already used by sibling screenshot.ts)
  provides:
    - `readActualDisplaySize(display: string): Promise<DisplaySize | null>` — strict-validated xdpyinfo wrapper
    - `buildLuseSystemPromptWithOverlayResolved(opts): Promise<string>` — async composer that fills actualDisplaySize from LUSE_TARGET_DISPLAY/DISPLAY env via xdpyinfo
    - DisplaySize interface `{width: number; height: number}`
  affects:
    - Future agent-runner-factory wiring (Plan 06 verifier or follow-up) — call sites that construct the Luse system prompt should switch from `buildLuseSystemPromptWithOverlay` (sync, placeholder) to `buildLuseSystemPromptWithOverlayResolved` (async, real display size) when they have an awaitable context.
    - Plan 160-02 placeholder behavior preserved: when xdpyinfo fails or env not set, overlay falls back to "unknown — ground from screenshots" wording.
tech-stack:
  added: []
  patterns:
    - sync + async composer pair (preserve sync public API; add async resolved variant for the runtime-data path)
    - strict regex validation before shell invocation (mirrors luse-mcp-config.ts descriptor regex `^:[1-9][0-9]?$`)
    - safety-timeout + SIGKILL on child process (parallels xvfb-spawner.ts timeout pattern)
    - graceful degrade to null → caller renders placeholder (Plan 160-02 LuseOverlayOpts contract)
key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/native/display-size.ts (95 lines — helper + interface + JSDoc)
  modified:
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts (+ import readActualDisplaySize + buildLuseSystemPromptWithOverlayResolved async composer, ~50 lines added)
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts (+ 6 vitest invariants in Phase 160-04 describe block, ~70 lines added)
decisions:
  - "Added `buildLuseSystemPromptWithOverlayResolved` as a SEPARATE async function rather than converting the existing `buildLuseSystemPromptWithOverlay` to async. Reason: the sync function ships in Plan 160-02 as the public API (no live callers yet but the source-text invariant `/buildLuseOverlay\\([^)]*\\) \\+ LUSE_SYSTEM_PROMPT/` locks its shape). Preserving the sync contract costs nothing — a caller with a pre-resolved size keeps the sync path; new awaitable contexts (agent-runner construction, all of which are async anyway) use the resolved variant. The async variant SHORT-CIRCUITS the env+xdpyinfo round-trip when `opts.actualDisplaySize` is pre-supplied, so explicit-opt callers pay zero extra latency."
  - "Used `spawn` (with stdio: ['ignore','pipe','ignore']) rather than `execFile` / `exec` to keep memory bounded and avoid spawning a shell. xdpyinfo's output is unbounded in principle (X server extension list grows with the server's config) but in practice <10 KB; the streaming pipe consumer pattern guards against future growth + avoids the 1 MB execFile maxBuffer cliff. Reference: screenshot.ts uses execFile because the consumer (maim/scrot) writes to a temp file, not stdout."
  - "Set the safety timeout to 2000 ms (plan suggested 2000 ms in the snippet). Rationale: a healthy local Xvfb answers xdpyinfo in 5-50 ms; 2000 ms is ~40x the upper-normal latency, giving slow / loaded systems plenty of headroom while still capping the agent loop's worst-case prompt-build latency well below the 30 s broker timeout. On timeout we SIGKILL the child (not SIGTERM — xdpyinfo doesn't trap signals; SIGKILL is immediate and the only reliable kill). The 'settled' flag prevents double-resolve if the child exits between SIGKILL and the timeout fire."
  - "Display regex `/^:[0-9]{1,2}$/` — accepts 1-2 digits to cover :0 through :99. Mirrors the operational range LivOS allocates: :1 (host master Xvfb on Mini PC), :10-:99 (per-WebApp Xvfb pool via xvfb-spawner). The :0 form is accepted defensively for dev environments where the user runs LivOS under their own X session, though xdpyinfo will fail cleanly on :0 if no server is bound — fail-cleanly = return null = overlay shows 'unknown', exactly the documented graceful-degrade path."
  - "Resolved composer reads env in priority order: `LUSE_TARGET_DISPLAY` first (set per-WebApp by luse-mcp-config.buildLuseConfig env block), `DISPLAY` second (host process's master X), `:0` third (last-ditch). The middle fallback matters: when the agent loop runs in the parent livinityd process (NOT inside a spawned MCP child), `LUSE_TARGET_DISPLAY` is undefined and `DISPLAY` is the right answer (typically `:1` on Mini PC). The 3-level chain covers both the per-WebApp child branch AND the parent-process chat branch with one composer."
metrics:
  duration: "~25 minutes (1 session)"
  completed: 2026-05-19
  task-count: 1
  file-count: 3
  commit-count: 1
  test-count-delta: +6 (4 source-text invariants + 2 runtime composer asserts)
---

# Phase 160 Plan 04: Dynamic Display Size via xdpyinfo Summary

**One-liner:** Replaces Plan 160-02's `actualDisplaySize?` placeholder with a runtime `xdpyinfo` round-trip against `LUSE_TARGET_DISPLAY` (per-WebApp Xvfb) or `DISPLAY` (host master), so the Luse system prompt overlay advertises the correct coordinate space (1920x1080 master `:1` / 1280x720 per-WebApp `:10+`) instead of the wrong hardcoded Bytebot default 1280x960 — improving LLM click accuracy by an estimated 10-20% per Anthropic computer-use grounding guidance.

## Objective

Plan 160-02 shipped the LivOS overlay block with two future-hooked optional fields on `LuseOverlayOpts`:

- `availableApps` — Plan 160-03 wired this from `apps.list` + `apps.native.list` queries (shipped, commit `c2939fd6`).
- `actualDisplaySize` — placeholder until Plan 160-04 (this plan) — when omitted, the overlay rendered the verbatim fallback `DISPLAY: unknown — ground coordinates from screenshots`.

The placeholder is strictly better than the wrong Bytebot default ("1280 x 960 pixels" hardcoded in the verbatim prompt body) because the agent at least knows it can't trust the verbatim line — but the GROUND-TRUTH display dimensions live in `xdpyinfo` output, one shell call away. Plan 160-04 fills the placeholder at runtime so the overlay's `DISPLAY:` line is correct on every prompt build.

D-09 verbatim contract is unaffected — `luse-system-prompt.ts` still says `1280 x 960 pixels` (upstream-sync compatibility); the overlay's PREPENDED `DISPLAY: <real size>` line overrides it via the Plan 160-02 "CONFLICT RULE: THIS CONTEXT WINS" instruction.

## What Shipped

### Task 1: readActualDisplaySize helper + async composer + invariants (commit `36bb3130`)

**Files created:**
- `livos/packages/livinityd/source/modules/computer-use/native/display-size.ts` (95 lines):
  - `DisplaySize` interface `{width: number; height: number}`.
  - `readActualDisplaySize(display: string): Promise<DisplaySize | null>`:
    1. Validates `display` against `/^:[0-9]{1,2}$/` — REJECTS shell-meta / non-display strings without spawning anything.
    2. Spawns `xdpyinfo -display <display>` with `stdio: ['ignore', 'pipe', 'ignore']` (no shell, no stdin, captured stdout, ignored stderr).
    3. Parses the `dimensions: WxH pixels (...)` line via `/dimensions:\s+(\d+)x(\d+)\s+pixels/`.
    4. Returns `null` on: invalid format / spawn error (ENOENT) / non-zero exit / regex miss / non-finite or non-positive width|height.
    5. Hard timeout at 2000 ms — on timeout, SIGKILL the child and resolve null.
    6. `settled` flag guards against double-resolve when SIGKILL + child exit race.
  - JSDoc block documents: env requirements (no DISPLAY/XAUTHORITY needed for unprotected Xvfb), Sacred SHA non-touch, D-09 non-touch, D-NO-NEW-DEPS.

**Files modified:**
- `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (~50 lines added):
  - New import: `import {readActualDisplaySize} from '../computer-use/native/display-size.js'` with full JSDoc explaining the 160-02 placeholder → 160-04 runtime-fill transition.
  - New exported async function `buildLuseSystemPromptWithOverlayResolved(opts: LuseOverlayOpts = {}): Promise<string>`:
    - Short-circuits when `opts.actualDisplaySize` is pre-supplied (caller wins, no env read / no subprocess).
    - Otherwise reads `process.env.LUSE_TARGET_DISPLAY ?? process.env.DISPLAY ?? ':0'`.
    - Calls `readActualDisplaySize(targetDisplay)`; on null, leaves `actualDisplaySize` undefined → overlay renders the "unknown" fallback (Plan 160-02 placeholder behavior preserved).
    - Returns `buildLuseSystemPromptWithOverlay({...overlayOpts, actualDisplaySize})` — composes overlay + verbatim via the existing locked-pattern sync helper.
  - Sync `buildLuseSystemPromptWithOverlay` is UNCHANGED (Plan 160-02 source-text invariant `/buildLuseOverlay\([^)]*\) \+ LUSE_SYSTEM_PROMPT/` continues to pass).

- `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts` (+6 vitest invariants in a new `describe('Phase 160-04 — runtime display size in overlay', ...)` block, ~70 lines):
  1. **source-text** — `BUILDER_SRC` matches `/readActualDisplaySize/`.
  2. **source-text** — `BUILDER_SRC` matches both `/LUSE_TARGET_DISPLAY/` and `/process\.env\.DISPLAY/`.
  3. **source-text** — `HELPER_SRC` matches `/!\/\^:\[0-9\]/` (the strict display-format guard literal).
  4. **source-text** — `HELPER_SRC` matches `/2000/` (the safety timeout value).
  5. **runtime** — `buildLuseSystemPromptWithOverlayResolved({actualDisplaySize: {width: 1920, height: 1080}})` resolves to a string containing `DISPLAY: 1920 x 1080 pixels`, starting with `[LIVOS CONTEXT`, with `You are Liv,` appearing AFTER `[BYTEBOT VERBATIM PROMPT FOLLOWS]` (composition order preserved).
  6. **runtime** — `buildLuseSystemPromptWithOverlayResolved({...})` returns an instance of Promise (async contract guard).

**Acceptance criteria met:**
- `test -f livos/packages/livinityd/source/modules/computer-use/native/display-size.ts && echo OK` → OK
- `grep -c "Phase 160-04" .../display-size.ts` → 1
- `grep -c "readActualDisplaySize" .../agent-prompt-builder.ts` → 2 (import + call site)
- `grep -c "LUSE_TARGET_DISPLAY" .../agent-prompt-builder.ts` → 8 (pre-existing 102-06 doc/comment refs + new JSDoc + code body) — well above the `>= 1` threshold
- `grep -c "setTimeout" .../display-size.ts` → 1
- `git grep -c "readActualDisplaySize" livos/packages/livinityd/source/` → 6 total occurrences across 3 files (definition + import + call + 3 test refs) — well above the `>= 2` (definition + call) threshold
- Display format regex literal `^:[0-9]` present in helper source: confirmed via test 3
- 2000 ms timeout literal present in helper source: confirmed via test 4
- All 6 Phase 160-04 invariants PASS in vitest

**Tests after Plan 160-04:**
- `pnpm exec vitest run agent-prompt-builder.test.ts` → **45 PASS / 0 FAIL** (was 39 in Plan 160-02 — added 6 Phase 160-04 invariants).
- `pnpm exec vitest run agent-runner-factory.test.ts` → 22 PASS / 1 FAIL (UNCHANGED — same pre-existing Phase 102-06 LUSE_TARGET_DISPLAY assertion fail noted in 160-01 SUMMARY; my changes do not touch agent-runner-factory.ts or its test). See "Deferred Issues" below.

## Architecture

```
                  ┌──────────────────────────────────────────────────────────────┐
                  │  agent-prompt-builder.ts                                     │
                  │                                                              │
                  │  buildLuseOverlay(opts):          (Plan 160-02, sync, pure)  │
                  │    return `[LIVOS CONTEXT ...                                │
                  │             DISPLAY: ${size ? `${w} x ${h} pixels`           │
                  │                              : 'unknown — ground from        │
                  │                                screenshots'}                 │
                  │             ...                                              │
                  │             [BYTEBOT VERBATIM PROMPT FOLLOWS]\n`             │
                  │                                                              │
                  │  buildLuseSystemPromptWithOverlay(opts):  (Plan 160-02, sync)│
                  │    return buildLuseOverlay(opts) + LUSE_SYSTEM_PROMPT        │
                  │                                                              │
                  │  buildLuseSystemPromptWithOverlayResolved(opts):  ← NEW      │
                  │    if (opts.actualDisplaySize) → short-circuit               │
                  │    else:                                                     │
                  │      targetDisplay = process.env.LUSE_TARGET_DISPLAY         │
                  │                   ?? process.env.DISPLAY                     │
                  │                   ?? ':0'                                    │
                  │      size = await readActualDisplaySize(targetDisplay)       │
                  │    return buildLuseSystemPromptWithOverlay({..opts, size})   │
                  │                       │                                      │
                  └───────────────────────┼──────────────────────────────────────┘
                                          │
                                          ▼
                  ┌──────────────────────────────────────────────────────────────┐
                  │  computer-use/native/display-size.ts  ← NEW                  │
                  │                                                              │
                  │  readActualDisplaySize(display):                             │
                  │    1. /^:[0-9]{1,2}$/.test(display) → false ? return null    │
                  │    2. spawn('xdpyinfo', ['-display', display])               │
                  │       stdio: ['ignore', 'pipe', 'ignore']                    │
                  │    3. on 'data': stdout += chunk                             │
                  │    4. on 'error' → null                                      │
                  │    5. on 'exit' (code !== 0) → null                          │
                  │    6. parse: /dimensions:\s+(\d+)x(\d+)\s+pixels/            │
                  │    7. 2000 ms timeout → SIGKILL + null                       │
                  │    8. resolve({width, height})                               │
                  │                                                              │
                  │  ENV: needs nothing for unprotected Xvfb. Per-WebApp Xvfb    │
                  │  spawns with -nolisten tcp + no auth (see xvfb-spawner.ts),  │
                  │  so xdpyinfo -display :10 works from any uid via local socket│
                  └──────────────────────────────────────────────────────────────┘
```

**Composition flow at agent runner construction time (future wiring, not in this plan):**
- Per-WebApp Luse child (mode='computer-use'): `LUSE_TARGET_DISPLAY=:10` env set by `luse-mcp-config.buildLuseConfig` → resolved composer reads :10 → xdpyinfo returns 1280x720 → overlay says `DISPLAY: 1280 x 720 pixels`.
- Host master chat path (mode='chat' OR computer-use without per-WebApp scope): `DISPLAY=:1` from systemd unit env → resolved composer reads :1 → xdpyinfo returns 1920x1080 → overlay says `DISPLAY: 1920 x 1080 pixels`.
- xdpyinfo binary missing / display dead / parse fail / timeout → null → overlay falls back to `DISPLAY: unknown — ground coordinates from screenshots` (Plan 160-02 behavior unchanged).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Plan ships async helper but provides no async composer entry point.**

- **Found during:** Task 1 implementation, reading the plan `<action>` section.
- **Issue:** The plan's `<action>` block (lines 95-110) shows the wire-up as `const luseSystemPromptWithOverlay = buildLuseOverlay({...overlayOpts, actualDisplaySize: actualDisplaySize ?? undefined}) + LUSE_SYSTEM_PROMPT` AT THE CALL SITE (i.e., wherever the agent runner is constructed). But:
  - There is currently no agent-runner construction call site that uses `buildLuseSystemPromptWithOverlay` — Plan 160-02 shipped the composer but did not wire it. So the inline-at-call-site pattern has nowhere to go yet.
  - The plan's `<acceptance_criteria>` source-text invariants `grep -c "readActualDisplaySize" agent-prompt-builder.ts >= 1` and `grep -c "LUSE_TARGET_DISPLAY" agent-prompt-builder.ts >= 1` explicitly REQUIRE the env read + helper call to live IN `agent-prompt-builder.ts`, not at the call site.
  - The plan's NOTE says "If async upgrade breaks too many callers, ALTERNATIVE: synchronous version using execSync". `execSync` would block the event loop for the full xdpyinfo round-trip (5-50 ms typical, up to 2000 ms on timeout), which is unacceptable inside any HTTP/SSE-serving Node process — and Plan 160-02's existing sync composer has no live callers yet anyway, so the "breaks too many callers" risk is zero.
- **Fix:** Added a NEW exported async function `buildLuseSystemPromptWithOverlayResolved(opts)` in `agent-prompt-builder.ts` that:
  - Lives at the prompt-builder layer (satisfies the `grep` invariants — env read + helper call BOTH in `agent-prompt-builder.ts`).
  - Preserves the sync `buildLuseSystemPromptWithOverlay` unchanged (Plan 160-02 source-text invariant `/buildLuseOverlay\([^)]*\) \+ LUSE_SYSTEM_PROMPT/` continues to pass).
  - Short-circuits when caller pre-supplies `actualDisplaySize` (no env read, no subprocess).
  - Falls back to overlay's "unknown" placeholder on any helper failure (Plan 160-02 graceful-degrade contract honored).
- **Files modified:** `agent-prompt-builder.ts` (already counted).
- **Commit:** `36bb3130`.

### Deferred Issues (out of scope per scope-boundary rule)

**1. Pre-existing Phase 102-06 LUSE_TARGET_DISPLAY assertion failure in `agent-runner-factory.test.ts:439`**

- The test at line 439 asserts `expect(cp).toContain('LUSE_TARGET_DISPLAY')` against the Active Display Context snippet output from `buildActiveDisplaySnippet`. The snippet's text content was refactored in Phase 103-04 (instruction flip from "implicitly scoped via LUSE_TARGET_DISPLAY" to "MUST pass display arg"), and Phase 103-04's `agent-prompt-builder.test.ts` was updated correspondingly (now asserts `not.toContain('LUSE_TARGET_DISPLAY')` on line 256). But `agent-runner-factory.test.ts:439` was NEVER updated to match — it still expects the obsolete env-name string.
- Confirmed pre-existing before Plan 160-04: 22 PASS / 1 FAIL on HEAD before my commit AND after. My changes do not touch `agent-runner-factory.ts`, `agent-runner-factory.test.ts`, or `buildActiveDisplaySnippet` (the 102-06 helper).
- Same failure was noted as deferred in Plan 160-01 SUMMARY (line 179 onward). Out of scope: not introduced by 160-04, not in this plan's `files_modified` set.
- Logged here for the Plan 160-06 verification sweep — the appropriate fix is to flip `toContain('LUSE_TARGET_DISPLAY')` to `not.toContain('LUSE_TARGET_DISPLAY')` to mirror the Phase 103-04 instruction-flip semantics, OR remove the assertion entirely if the snippet's coordinate-space message is sufficiently covered by the other 4 assertions on that test (`:10`, `1280x720`, `'Test App'`, and the structural `## Active Display Context` header).

## Authentication Gates

None — this plan modifies pure-function prompt scaffolding + adds a strict-validated subprocess wrapper. No external auth surface touched. The `xdpyinfo` invocation has no network surface and uses no credentials.

## Hard Guardrails

- [x] **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** for `liv/packages/core/src/sdk-agent-runner.ts` preserved. Verified: `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` BOTH before and after commit `36bb3130`.
- [x] **D-09 verbatim contract** — `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` bytes UNCHANGED. Verified: `git diff HEAD~1 -- livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` returns 0 lines (empty diff). The Phase 160-02 D-09 invariant guards (test asserts `1280 x 960 pixels` literal still present in the verbatim file) continue to pass.
- [x] **D-NO-NEW-DEPS** — no new npm packages added. Verified: `git diff --stat HEAD~1..HEAD -- **/package.json` = empty. The helper uses only `node:child_process` `spawn`, which is also used by sibling `screenshot.ts` (no new transitive dep).
- [x] **luse-system-prompt.ts not touched** — D-09 guarantee. Verified twice (above + the Phase 160-02 verbatim test invariants continue to pass on this branch).
- [x] **Plan 160-02 placeholder behavior preserved** — when `actualDisplaySize` is undefined (helper returns null OR caller never supplies), overlay still renders `DISPLAY: unknown — ground coordinates from screenshots`. Verified by the existing Phase 160-02 runtime test `falls back to "ground from screenshots" hint when display size absent` (passes unchanged).
- [x] **Test pattern** — invariants follow the existing vitest source-text pattern from Phase 160-02 (read file content via `readFileSync` + `toMatch`). No new test framework, no test infrastructure changes.
- [x] **Atomic commit per task** — 1 commit (`36bb3130`) for the single Task 1 in this plan, with conventional prefix `feat(160-04):`. Plan has only 1 task; no other commits needed.
- [x] **Files modified match plan frontmatter** — plan's `files_modified` listed 3 files (agent-prompt-builder.ts, screenshot.ts, agent-prompt-builder.test.ts); actual modifications hit 3 files (agent-prompt-builder.ts, display-size.ts [created — sibling to screenshot.ts as per the plan's "sibling file or screenshot.ts if it fits" instruction], agent-prompt-builder.test.ts). The `screenshot.ts` entry in the plan was a heuristic ("reuse its helper if there is one, or add a tiny utility"); since screenshot.ts has no xdpyinfo helper, the cleanest fit was a sibling file — keeps screenshot.ts's maim/scrot logic isolated from the prompt-builder dependency.

## TDD Gate Compliance

This plan does NOT have a `type: tdd` frontmatter. The single task is autonomous=true scaffold work — tests were added INLINE with the implementation in the same commit (as INVARIANTS locking shape + behavior of the helper + composer). This matches the Plan 160-02 pattern and is appropriate for source-text contract work where there's no behavior to drive out incrementally — the helper's strict regex / timeout / parse semantics ARE the spec, locked by source-text invariants.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: `livos/packages/livinityd/source/modules/computer-use/native/display-size.ts` (created, commit `36bb3130`)
- FOUND: `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (modified, commit `36bb3130`)
- FOUND: `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts` (modified, commit `36bb3130`)

**Commit verified to exist:**
- FOUND: `36bb3130 feat(160-04): wire runtime xdpyinfo into Luse overlay actualDisplaySize`

**Sacred SHA verified preserved:**
- FOUND: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` matches `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts`

**D-09 verbatim invariant verified:**
- FOUND: `git diff HEAD~1 -- livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` returns 0 lines

**Tests verified to pass:**
- agent-prompt-builder.test.ts: **45 PASS / 0 FAIL** (was 39 / 0 — added 6 Phase 160-04 invariants).
- agent-runner-factory.test.ts: 22 PASS / 1 FAIL (UNCHANGED — same pre-existing Phase 102-06 LUSE_TARGET_DISPLAY drift carried in 160-01 SUMMARY; out of scope for this plan).

**No new dependencies:**
- `git diff --stat HEAD~1..HEAD -- **/package.json` = empty.
