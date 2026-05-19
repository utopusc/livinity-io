---
phase: 160
plan: 160-02
subsystem: livinityd ai prompt-builder / computer-use mcp-config
tags: [luse-overlay, verbatim-preserving, d-09-honored, no-new-deps, prompt-builder, mcp-descriptor]
dependency-graph:
  requires:
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts (Phase 101-06 + 102-06 prompt-builder scaffold)
    - livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts (Phase 72-02 verbatim Bytebot, D-09 invariant — read-only)
    - livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts (Phase 102-06 PerWebAppMcpDescriptor + buildLuseConfig)
  provides:
    - `buildLuseOverlay(opts: LuseOverlayOpts): string` — pure function emitting the LivOS context block
    - `buildLuseSystemPromptWithOverlay(opts: LuseOverlayOpts): string` — composes overlay + verbatim with the locked `buildLuseOverlay(...) + LUSE_SYSTEM_PROMPT` pattern
    - `LuseOverlayOpts` interface with optional `availableApps` (Plan 03 hook), `actualDisplaySize` (Plan 04 hook), `userSlug`, `domainRoot`
    - `PerWebAppMcpDescriptor.{userSlug?, domainRoot?}` — env threading for the Luse MCP child's own overlay rendering
    - `LIVOS_USER_SLUG` + `LIVOS_DOMAIN_ROOT` env vars in the per-WebApp MCP child env block
  affects:
    - Plan 160-03 (computer_application launcher) will populate `availableApps` from `apps.list + apps.native.list` queries
    - Plan 160-04 (dynamic display size) will populate `actualDisplaySize` from `xdpyinfo` runtime read against `LUSE_TARGET_DISPLAY`
    - liv-core `/api/agent/stream` consumers — assembly helper available; per-call wiring is Plan 03/04 work (this plan only ships the scaffold)
    - Per-WebApp Luse MCP children — get `LIVOS_USER_SLUG` + `LIVOS_DOMAIN_ROOT` in env so the child can render its own overlay with correct WEBAPP URL PATTERN line
tech-stack:
  added: []
  patterns:
    - pure-function overlay (parallels buildActiveWindowSnippet / buildActiveDisplaySnippet from 101-06 + 102-06)
    - locked-composition pattern (`buildLuseOverlay(opts) + LUSE_SYSTEM_PROMPT` matched by source-text invariant)
    - dual-layer prompt construction (parent process via agent-prompt-builder + child process via env-threaded re-render)
    - source-text invariants (parallels Phase 160-01 agent-runner-factory + Phase 101-09 status_detail literal lock)
    - D-09 verbatim guard (parallels luse-system-prompt.test.ts existing guards, extended with two more invariants)
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts (+ LuseOverlayOpts interface + buildLuseOverlay + buildLuseSystemPromptWithOverlay + LUSE_SYSTEM_PROMPT import, ~149 lines added)
    - livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts (+ PerWebAppMcpDescriptor.{userSlug?, domainRoot?} + per-WebApp env block extended with LIVOS_USER_SLUG + LIVOS_DOMAIN_ROOT, ~35 lines added)
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts (+ 14 vitest invariants in 3 describe blocks, ~138 lines added)
decisions:
  - "Add a separate composition helper `buildLuseSystemPromptWithOverlay` rather than only `buildLuseOverlay` — the plan's acceptance criterion source-text regex `/buildLuseOverlay\\([^)]*\\) \\+ LUSE_SYSTEM_PROMPT/` requires the literal concatenation expression to appear in `agent-prompt-builder.ts`. Centralizing it in a helper function gives a SINGLE source of truth for the assembly seam + keeps the regex matchable for the lifetime of the codebase."
  - "Plan code snippet used an erroneous nested template-literal `${${'`'}}<app>` (likely a JSDoc rendering artifact). Replaced with a plain escaped-backtick `\\`<app>-${userSlug}.${domainRoot}\\`` inside the overlay template so the rendered string is correct. The intent (dash-pattern URL with surrounding code-fence backticks) is preserved; the regex acceptance still passes."
  - "Extended `PerWebAppMcpDescriptor` with OPTIONAL `userSlug?` and `domainRoot?` fields rather than required. Reason: existing callers (window-manager.ts spawn path) construct the descriptor without these fields today; making them required would break the per-WebApp Luse launch flow. With optional + default-on-read semantics (`descriptor.userSlug ?? 'admin'`), the change is fully back-compat — verified by luse-mcp-config.window.test.ts: 5/5 PASS unchanged."
  - "Threaded ONLY the static fields (USER_SLUG + DOMAIN_ROOT) to the MCP child via env. Did NOT thread `LIVOS_AVAILABLE_APPS` or `LIVOS_DISPLAY_SIZE` because both change per-session/per-call: apps list is a runtime DB query (Plan 03 wires it via `apps.list + apps.native.list`), and display size depends on live xdpyinfo against the currently-bound display (Plan 04). Per-call discovery hooks in Plans 03+04 will pass those dynamically via opts.availableApps + opts.actualDisplaySize at agent-runner construction time."
  - "Added 7 runtime behavior tests on top of the plan's required 5 source-text + 2 D-09 invariants (14 total instead of 7). Reason: source-text checks lock the SHAPE but not BEHAVIOR — the runtime tests confirm the placeholder text actually renders, the app list interpolation works with both webapp + native kinds, the size formatting produces the expected `1920 x 1080 pixels` shape, and the composition function returns overlay BEFORE verbatim. This costs ~1ms of test time and significantly improves regression coverage."
metrics:
  duration: "~20 minutes (1 session)"
  completed: 2026-05-19
  task-count: 2
  file-count: 3
  commit-count: 2
  test-count-delta: +14 (5 source-text + 2 D-09 verbatim + 7 runtime behavior)
---

# Phase 160 Plan 02: LivOS System Prompt Overlay (verbatim-preserving) Summary

**One-liner:** Prepends a LivOS-specific context block (correct app whitelist hook, correct display size hook, dash-pattern URL rule, conflict rule) to the Bytebot verbatim system prompt without mutating `luse-system-prompt.ts` — D-09 invariant honored, scaffold ready for Plan 160-03 (apps list) + Plan 160-04 (dynamic display size).

## Objective

Static review of Phase 159 ship revealed the Bytebot verbatim system prompt at `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` drifts from LivOS reality in 4 ways:

1. **App whitelist drift:** prompt lists Firefox / Thunderbird / VS Code / 1Password as the available applications — NONE of those are installed on a default LivOS Mini PC.
2. **Hardcoded display size:** prompt says "1280 x 960 pixels" — actual LivOS displays are 1920x1080 (master `:1`) and 1280x720 (per-WebApp Xvfb `:10+`).
3. **UI convention drift:** prompt says "ONLY ACCESS THE APPLICATIONS VIA THEIR DESKTOP ICONS" — LivOS is a React shell with a dock + Windows Manager, not a traditional Linux desktop with double-clickable icons.
4. **`computer_application` enum drift:** prompt lists firefox/thunderbird/1password/vscode/terminal/directory/desktop — LivOS apps (n8n, LibreOffice, Docker, native registered apps) aren't in that enum.

The verbatim file is sacred (D-09 contract — upstream Bytebot sync compatibility). Solution: prepend an LivOS context block at the prompt-builder layer with a "conflict rule" telling the agent that the overlay wins where the two disagree. Plans 160-03 + 160-04 plug runtime data (apps list + xdpyinfo display size) into the placeholder opts this plan ships.

## What Shipped

### Task 1: buildLuseOverlay function + assembly helper (commit `ef6f60a5`)

**Files modified:**
- `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (+149 lines):
  - `LuseOverlayOpts` interface — `availableApps?` (Plan 03 hook), `actualDisplaySize?` (Plan 04 hook), `userSlug?`, `domainRoot?`.
  - `buildLuseOverlay(opts)` pure function — emits the LivOS context block with:
    - Banner `[LIVOS CONTEXT — PREPENDED TO BYTEBOT VERBATIM PROMPT BELOW]`.
    - `DISPLAY:` line — renders runtime size when supplied, else "unknown — ground coordinates from screenshots" hint.
    - `AVAILABLE APPS RIGHT NOW` block — renders supplied app list (`- name (id=ID, kind=KIND)`) or `(no apps currently installed)` placeholder.
    - `APP LAUNCHER:` instruction — points the agent at the supplied app names with explicit "NOT Bytebot defaults like firefox/thunderbird/vscode" callout.
    - `WEBAPP URL PATTERN:` with the **DASH** form `<app>-${userSlug}.${domainRoot}` AND the explicit anti-example `NEVER n8n.${userSlug}.${domainRoot}`.
    - `CONFLICT RULE:` — `THIS CONTEXT WINS` literal.
    - Handoff marker `[BYTEBOT VERBATIM PROMPT FOLLOWS]`.
  - `buildLuseSystemPromptWithOverlay(opts)` composition helper — imports `LUSE_SYSTEM_PROMPT` from the verbatim file and returns `buildLuseOverlay(overlayOpts) + LUSE_SYSTEM_PROMPT`. The literal expression matches the plan's acceptance criterion regex `/buildLuseOverlay\([^)]*\) \+ LUSE_SYSTEM_PROMPT/`.

**Acceptance criteria met:**
- `grep -c "export function buildLuseOverlay"` → 1
- `grep -c "PREPENDED TO BYTEBOT VERBATIM"` → 1
- `grep -c "Phase 160-02"` → 5
- `grep -c "buildLuseOverlay"` → 6 (definition + JSDoc + composition + import-context comments)
- `git diff HEAD~1 -- luse-system-prompt.ts` → EMPTY (D-09 honored)

### Task 2: Thread overlay opts via MCP descriptor + add invariants (commit `5926c76d`)

**Files modified:**
- `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` (~35 lines):
  - `PerWebAppMcpDescriptor` gains optional `userSlug?: string` + `domainRoot?: string` fields. Marked optional + heavily commented to explain the dual-layer rendering (parent agent-prompt-builder vs. spawned child re-render).
  - `buildLuseConfig` per-WebApp env branch threads `LIVOS_USER_SLUG: descriptor.userSlug ?? 'admin'` + `LIVOS_DOMAIN_ROOT: descriptor.domainRoot ?? 'livinity.io'` into the spawned child's env.
  - Host-display branch (no descriptor) unchanged — fully back-compat.
- `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts` (+138 lines, 3 describe blocks, 14 new invariants):
  - **`Phase 160-02 — LivOS overlay prepended to Luse verbatim prompt`** (5 source-text invariants):
    1. `export function buildLuseOverlay` present.
    2. `PREPENDED TO BYTEBOT VERBATIM` banner present.
    3. Dash-pattern domain rule callouts `DASH between app` + `NEVER n8n.${userSlug}`.
    4. `THIS CONTEXT WINS` conflict rule literal.
    5. `buildLuseOverlay(...) + LUSE_SYSTEM_PROMPT` composition pattern literal.
  - **`Phase 160-02 — D-09 verbatim invariant guard`** (2 invariants reading luse-system-prompt.ts source):
    1. `You are Liv,` literal preserved.
    2. `1280 x 960 pixels` literal preserved (overlay overrides at runtime — verbatim must NOT be patched).
  - **`Phase 160-02 — buildLuseOverlay runtime behavior`** (7 runtime tests):
    1. Placeholder app list when no apps supplied.
    2. Renders each supplied app with `id` + `kind`.
    3. Renders the runtime display size as `DISPLAY: 1920 x 1080 pixels`.
    4. Falls back to ground-from-screenshots hint when display size absent.
    5. Renders dash-pattern URL with supplied user/domain + correct/wrong examples.
    6. `buildLuseSystemPromptWithOverlay` composes overlay BEFORE verbatim (banner at top, `You are Liv,` after handoff marker).
    7. Composition order assert: `handoffIdx < liveIdx` in concatenated output.

**Acceptance criteria met:**
- `grep -c "LIVOS_USER_SLUG" luse-mcp-config.ts` → 2 (interface field comment + env block)
- `grep -c "LIVOS_DOMAIN_ROOT" luse-mcp-config.ts` → 2
- `grep -c "Phase 160-02" agent-prompt-builder.test.ts` → 4
- `pnpm exec vitest run agent-prompt-builder` → **39 PASS / 0 FAIL** (was 25 / 0; +14 new)
- `git diff HEAD~2 -- luse-system-prompt.ts` → EMPTY (D-09 honored across the full plan)

## Architecture

```
                  ┌──────────────────────────────────────────────────────┐
                  │  agent-prompt-builder.ts (Phase 160-02 — this plan)  │
                  │                                                      │
                  │  buildLuseOverlay(opts):                             │
                  │    return `[LIVOS CONTEXT ...                        │
                  │             DISPLAY: ${sizeStr}                      │
                  │             AVAILABLE APPS: ${appList}               │
                  │             APP LAUNCHER: ...                        │
                  │             WEBAPP URL PATTERN: <app>-<user>.<root>  │
                  │             CONFLICT RULE: THIS CONTEXT WINS         │
                  │             [BYTEBOT VERBATIM PROMPT FOLLOWS]\n`     │
                  │                                                      │
                  │  buildLuseSystemPromptWithOverlay(opts):             │
                  │    return buildLuseOverlay(opts) + LUSE_SYSTEM_PROMPT│
                  │                       │                              │
                  └───────────────────────┼──────────────────────────────┘
                                          │
                          ┌───────────────┴────────────────┐
                          ▼                                ▼
   ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
   │  parent process (livinityd)      │   │  spawned Luse MCP child (tsx)    │
   │                                  │   │                                  │
   │  agent-runner-factory.ts →       │   │  reads env:                      │
   │  /api/agent/stream body          │   │    LIVOS_USER_SLUG               │
   │  systemPromptOverride =          │   │    LIVOS_DOMAIN_ROOT             │
   │    buildLuseSystemPromptWithOver-│   │  (threaded via                   │
   │    lay({availableApps, size,     │   │   PerWebAppMcpDescriptor +       │
   │     userSlug, domainRoot})       │   │   buildLuseConfig env block)     │
   │                                  │   │  → renders its OWN overlay copy  │
   │  (Plans 03/04 wire opts          │   │   for any in-child prompt path   │
   │   dynamically — this plan        │   │                                  │
   │   ships the scaffold only)       │   │                                  │
   └──────────────────────────────────┘   └──────────────────────────────────┘

                          (luse-system-prompt.ts bytes UNCHANGED — D-09 honored)
```

**What this plan ships:** the scaffold (functions + opts + env wiring + tests).
**What this plan does NOT ship:** dynamic runtime data — Plan 160-03 will wire `availableApps` from `apps.list + apps.native.list` queries, and Plan 160-04 will wire `actualDisplaySize` from `xdpyinfo` runtime read against `LUSE_TARGET_DISPLAY`. Until then, callers that use `buildLuseSystemPromptWithOverlay()` get the placeholder text "(no apps currently installed)" and "unknown — ground coordinates from screenshots", which is strictly better than the wrong Bytebot defaults the agent sees today.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Plan Snippet Syntax Artifact] Nested template-literal escape pattern**
- **Found during:** Task 1 implementation
- **Issue:** The plan's `<action>` block contained `\`<app>-${${'`'}}<user>.${domainRoot}${${'`'}}\`` in the WEBAPP URL PATTERN line — this is a nested-backtick interpolation artifact (likely caused by JSDoc/markdown rendering of the plan, not a real intended expression). Pasted verbatim, it produces a TypeScript parse error.
- **Fix:** Replaced with the intended pattern — a plain escaped-backtick around the URL expression: `` `<app>-${userSlug}.${domainRoot}` `` (with surrounding code-fence backticks rendered via `\\\`` literals inside the template literal). The semantic output is identical to what the plan's example renders: `WEBAPP URL PATTERN: \`<app>-bruce.livinity.io\` — note the DASH ...`. Acceptance criteria all pass.
- **Files modified:** `agent-prompt-builder.ts` only
- **Commit:** `ef6f60a5`

**2. [Rule 2 — Missing critical functionality] Plan ships overlay-only, but no assembly helper**
- **Found during:** Task 1 read of plan acceptance criteria
- **Issue:** Plan's <action> shows the wrapping line `const luseSystemPromptWithOverlay = buildLuseOverlay(overlayOpts) + LUSE_SYSTEM_PROMPT` as a one-shot edit inline at "the existing prompt assembly path" — but there IS no single assembly path in `agent-prompt-builder.ts` today; the file is a snippet-builder library, not a prompt-orchestration module. The actual assembly happens in `injectComputerUseSystemPrompt(basePrompt)` over in `luse-system-prompt.ts` (which is verbatim per D-09 — we cannot modify it). And the acceptance criterion test invariant `expect(SRC).toMatch(/buildLuseOverlay\([^)]*\) \+ LUSE_SYSTEM_PROMPT/)` explicitly requires the composition to be present IN `agent-prompt-builder.ts`.
- **Fix:** Added `buildLuseSystemPromptWithOverlay(opts: LuseOverlayOpts)` as a SECOND exported function in `agent-prompt-builder.ts` whose body is exactly `const luseSystemPromptWithOverlay = buildLuseOverlay(overlayOpts) + LUSE_SYSTEM_PROMPT; return luseSystemPromptWithOverlay`. Callers (Plans 03+04+ later wiring work) import this helper instead of bare `LUSE_SYSTEM_PROMPT`. The literal expression satisfies the test invariant, AND we get a single source of truth for the overlay/verbatim seam.
- **Files modified:** `agent-prompt-builder.ts` (already counted above)
- **Commit:** `ef6f60a5`

### Deferred Issues (out of scope per scope-boundary rule)

**1. Pre-existing 3 vitest failures in `luse-mcp-config.test.ts` (T4/T5/T6)**
- The host-display tests T4 (fresh install env shape), T5 (idempotent no-op), and T6 (updates existing) all assert env shapes WITHOUT `LUSE_REDIS_URL` — but Phase 100-10-04 added `LUSE_REDIS_URL` to the host-display env block without updating these expectations. Has been failing on bare HEAD since at least Phase 100-10-04 shipped.
- **Confirmed pre-existing via `git stash + vitest run + git stash pop`**: same 3 fails / 22 PASS on bare HEAD as on my branch.
- Out of scope: not introduced by Phase 160-02, not in this plan's files-modified set.
- Logged here for the verifier or a follow-up house-keeping plan.

**2. Per-WebApp test for `LIVOS_USER_SLUG` + `LIVOS_DOMAIN_ROOT` env**
- `luse-mcp-config.window.test.ts` covers the per-WebApp branch but does not yet assert on the new env keys. The branch is exercised (5/5 PASS unchanged), but a strict-shape assertion would catch future drift on the env values. Not strictly required by Plan 160-02 acceptance criteria (which only require the keys appear in source via grep), but worth a follow-up housekeeping task.

## Authentication Gates

None — this plan modifies pure-function prompt scaffolding only; no external auth surface touched.

## Hard Guardrails

- [x] **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** for `liv/packages/core/src/sdk-agent-runner.ts` preserved across all Phase 160-02 commits (verified at start, after Task 1 commit `ef6f60a5`, and after Task 2 commit `5926c76d`).
- [x] **D-09 verbatim contract** — `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` bytes UNCHANGED across this plan. Verified: `git diff HEAD~2 -- luse-system-prompt.ts` returns EMPTY. Pre-execution SHA `2083f0a3dfc798b4841613b9576b94929f2faf2f`. Two source-text invariants now guard the literal "You are Liv," + "1280 x 960 pixels" so any future patch attempt fires CI red.
- [x] **D-NO-NEW-DEPS** — no new npm packages added. `git diff --stat HEAD~2..HEAD -- **/package.json` = empty.
- [x] **Domain pattern** — every reference in the overlay uses `<app>-${userSlug}.${domainRoot}` (dash form), with the wrong dot form (`n8n.${userSlug}.${domainRoot}`) explicitly called out as the anti-pattern. Two runtime tests + one source-text invariant lock this.
- [x] **Plan-02 leaves `actualDisplaySize` as a placeholder for Plan 160-04** — `LuseOverlayOpts.actualDisplaySize` is optional; when omitted, the overlay renders "DISPLAY: unknown — ground coordinates from screenshots". No xdpyinfo runtime read pulled in. JSDoc explicitly references Plan 04 as the future owner.
- [x] **No new npm packages** — confirmed clean via stat diff.
- [x] **Test pattern** — invariants follow the existing vitest source-text pattern (parallel to `agent-prompt-builder.test.ts` Phase 102-06 block and `luse-system-prompt.test.ts`'s existing literal-content guards). No new test framework.
- [x] **Atomic commits per task** — 2 commits, one per task: `feat(160-02):` Task 1 + `test(160-02):` Task 2.

## TDD Gate Compliance

This plan does NOT have a `type: tdd` frontmatter (autonomous=true scaffold work, no test-first cycle required). Tests were added alongside the implementation in Task 2 as INVARIANTS (locking shape + behavior of the Task 1 deliverables), which is the appropriate pattern for source-text contract work — RED/GREEN/REFACTOR would not have added value here because there's no behavior to drive out incrementally; the overlay's literal text content IS the spec.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (modified, ef6f60a5)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` (modified, 5926c76d)
- FOUND: `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts` (modified, 5926c76d)

**Commits verified to exist:**
- FOUND: `ef6f60a5` Task 1 — feat(160-02): add buildLuseOverlay + assembly helper to agent-prompt-builder
- FOUND: `5926c76d` Task 2 — test(160-02): thread overlay opts via MCP descriptor + add invariants

**Sacred SHA verified preserved:**
- FOUND: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` matches `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts`

**D-09 verbatim invariant verified:**
- FOUND: `git diff HEAD~2 -- livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` returns EMPTY

**Tests verified to pass:**
- agent-prompt-builder.test.ts: **39 PASS / 0 FAIL** (was 25 / 0 — added 14 new Phase 160-02 invariants)
- luse-mcp-config.window.test.ts: **5 PASS / 0 FAIL** unchanged (per-WebApp branch back-compat verified)
- luse-mcp-config.test.ts: 22 PASS / 3 FAIL — same as bare HEAD (pre-existing T4/T5/T6 LUSE_REDIS_URL drift, confirmed via git stash compare, out of scope)

**No new dependencies:**
- `git diff --stat HEAD~2..HEAD -- **/package.json` = empty
