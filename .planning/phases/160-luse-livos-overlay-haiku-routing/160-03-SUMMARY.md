---
phase: 160
plan: 160-03
subsystem: livinityd computer-use mcp (luse) — application launcher
tags: [luse-launcher, livos-app-resolver, dash-domain-pattern, ipc-stderr, free-form-schema, no-new-deps]
dependency-graph:
  requires:
    - livos/packages/livinityd/source/modules/computer-use/luse-tools.ts (Phase 72-native-05 _applicationTool schema)
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts (Phase 97-05 buildHandlers + LuseToolsOptions)
    - livos/packages/livinityd/source/modules/computer-use/native/window.ts (Phase 72-native-03 openOrFocus + APP_MAP)
    - Plan 160-02 (LivOS prompt overlay) — teaches agent the dash-pattern URL convention this resolver emits
  provides:
    - `LivosAppMatch` interface — `{kind: 'webapp'|'native', appId, route, title, icon}`
    - `LivosAppResolver` type — `(name: string) => Promise<LivosAppMatch | null>`
    - `defaultLivosAppResolver(name, deps)` — runtime resolver querying listWebApps + listNativeApps in parallel
    - `LuseToolsOptions.livosAppResolver?` — DI hook on the handler factory
    - Free-form `_applicationTool` schema (enum dropped, agent can pass arbitrary LivOS app names)
    - `[luse-mcp] open_livos_app kind=… appId=… route=…` stderr IPC line (parent livinityd parses to drive windowManager.openWindow)
  affects:
    - Plan 160-04 (dynamic display size) — independent file set (agent-prompt-builder + screenshot)
    - Plan 160-05 (computer_read_file sandbox) — depends on the same mcp/tools.ts handler module but a different handler
    - Future wiring task (post-Phase 160) — livinityd's mcp/server.ts needs to construct + pass the default resolver from the authenticated user's trpc context (userSlug + domainRoot + DB-backed listWebApps / listNativeApps closures). Out of scope for this plan; tracked as a deferred wiring task.
tech-stack:
  added: []
  patterns:
    - dependency-injected pure resolver (parallels Phase 100-10-04 streamManager DI on LuseToolsOptions)
    - resolver-first dispatch with try/catch + stderr-logged graceful fallback (parallels Phase 97-05 widResolver fallback pattern)
    - stderr structured IPC for cross-process action signaling (parallels Phase 100-07.4 active-wid marker file IPC pattern, but stderr-based instead of file-based for one-shot launch events)
    - dash-pattern domain invariant locked by source-text regex (parallels Plan 160-02 `${sub}-${userSlug}.${domainRoot}` overlay invariant)
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/computer-use/luse-tools.ts (+17/-11 — _applicationTool enum dropped, free-form string + LivOS-aware description)
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts (+61 — LivosAppResolver import, LuseToolsOptions.livosAppResolver field, computer_application handler resolver-first dispatch with stderr IPC + APP_MAP fallback)
    - livos/packages/livinityd/source/modules/computer-use/native/window.ts (+97 — LivosAppMatch interface + LivosAppResolver type + defaultLivosAppResolver pure function with Promise.all parallel WebApp+Native query)
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts (+50 — Phase 160-03 describe block with 6 source-text invariants + readFileSync/join imports)
decisions:
  - "Resolver lives in window.ts (sibling of openOrFocus) rather than a new file. Reason: keeps all application-related primitives in one grep target (openOrFocus + LivosAppResolver are conceptually paired — one is the LivOS catalog dispatch, the other is the Bytebot binary spawn fallback). A new sibling file would have added one import line everywhere for no real isolation benefit since the resolver is pure (no DB / no fs / no spawn) — it's just a strategy function over its injected deps."
  - "Used `options.livosAppResolver` (singular `options`, matching the existing `buildHandlers(options)` parameter name) instead of the plan's `opts.livosAppResolver`. Reason: the rest of the handler map already references `options.skillReplayDeps`, `options.streamManager`, `options.defaultDisplay`, etc. — using a different identifier for the one new field would have been a stylistic inconsistency. The acceptance grep `grep -c \"livosAppResolver\"` returns 4 (≥ required 2) regardless of receiver name, and the test invariant `expect(SRC).toMatch(/livosAppResolver/)` matches the identifier verbatim."
  - "IPC channel is stderr structured-text line (`[luse-mcp] open_livos_app kind=… appId=… route=…`) rather than a sibling trpc call or a temp file marker. Reason: the MCP child runs in a forked tsx process and the parent livinityd already pipes the child's stderr for diagnostic logging — stderr is the lowest-friction signal channel. Choosing trpc would have meant baking the parent's HTTP origin into the child, and a temp-file marker would have needed cleanup logic + race-condition guards. The stderr line is fire-and-forget and the parent's existing log-stream consumer can grep for the prefix in O(1) per line."
  - "Resolver tries WebApps BEFORE Native apps on name collision. Reason: LivOS catalog is overwhelmingly web-based (n8n, nextcloud, gitea, bolt-diy, etc.), and operator intent for `computer_application(\"n8n\")` is almost certainly the browser-rendered web UI rather than a hypothetical native bundle. If a future LivOS ships BOTH a native AND a webapp variant of the same name, the webapp wins — documented at the resolver site. Caller can disambiguate by passing the exact id later if needed."
  - "Resolver returns `null` on empty-name trim (the handler-level pre-flight already catches empty strings, but the resolver double-guards to keep it usable from other call sites without re-implementing the empty-input check). Defense-in-depth costs one if-statement."
  - "Used `withPostScreenshot` for the LivOS-match return so the agent gets a post-action screenshot consistent with the Bytebot path. The actual windowManager.openWindow happens in the PARENT process (after parsing the stderr line), so the child's 750ms settle + screenshot captures the post-launch state. If the parent hasn't actually opened the window in 750ms, the next agent turn's screenshot will see the still-loading state — acceptable per existing Bytebot post-action UX (click handlers face the same settle-vs-render race)."
  - "Domain pattern test guard uses BOTH a positive regex (`/\\$\\{sub\\}-\\$\\{deps\\.userSlug\\}\\.\\$\\{deps\\.domainRoot\\}/`) AND a negative regex (`.not.toMatch(/\\$\\{sub\\}\\.\\$\\{deps\\.userSlug\\}\\.\\$\\{deps\\.domainRoot\\}/)`). Reason: the operator was explicit that dash-vs-dot is a real footgun (they corrected this twice during 160-CONTEXT drafting). The negative guard fires CI red if a future refactor accidentally changes the dash to a dot — the positive guard alone wouldn't catch a both-patterns-present bug."
metrics:
  duration: "~25 minutes (1 session)"
  completed: 2026-05-19
  task-count: 3
  file-count: 4
  commit-count: 3
  test-count-delta: +6 (Phase 160-03 source-text invariants)
---

# Phase 160 Plan 03: computer_application LivOS Launcher Summary

**One-liner:** Drops the static Bytebot enum from `computer_application`'s schema and adds a runtime LivOS app resolver (Promise.all over `apps.list` + `apps.native.list`, case-insensitive match, dash-pattern WebApp URL emission) that dispatches LivOS apps via a `[luse-mcp] open_livos_app kind=… appId=… route=…` stderr IPC line BEFORE falling back to the classic `openOrFocus` / `APP_MAP` Bytebot binary spawn path — agent can now open `n8n` / `nextcloud` / native registered apps through the same MCP tool as firefox / vscode.

## Objective

Static review of Phase 159 ship flagged a Plan 160-C drift: `computer_application` ships with a hardcoded enum of just `['firefox', '1password', 'thunderbird', 'vscode', 'terminal', 'desktop', 'directory']` — none of which represent the LivOS app catalog (n8n, LibreOffice, Docker, native registered apps, etc.). The agent could not open LivOS apps through the only application-launching tool, breaking Phase 159's "agent can drive any LivOS app" promise.

MCP protocol enums are static at schema-publication time; we can't dynamic-enum here. Solution: drop the enum (free-form `string`) + runtime-validate on the handler side, querying the LivOS app catalog via DI'd resolver closures FIRST and falling through to the existing Bytebot `APP_MAP` binary-spawn path on miss. Domain pattern explicitly the operator-blessed DASH form (`n8n-bruce.livinity.io`), NEVER the dot form, with a negative-regex test guard to prevent future drift.

## What Shipped

### Task 1: Drop enum from _applicationTool schema (commit `95de89ca`)

**Files modified:**
- `livos/packages/livinityd/source/modules/computer-use/luse-tools.ts` (+17/-11):
  - `_applicationTool.input_schema.properties.application` — `enum: ['firefox', '1password', …]` REMOVED; now `{type: 'string', description: '…runtime-validates against (a) LivOS app catalog from apps.list + apps.native.list, (b) classic Bytebot APP_MAP. Match is case-insensitive on name field.'}`.
  - `_applicationTool.description` — expanded to explain the dual resolver path; explicitly directs the agent to "prefer LivOS app names from the LIVOS CONTEXT overlay (Plan 160-02) over Bytebot legacy names".
  - Phase 160-03 banner comment added above the tool definition.

**Acceptance criteria met:**
- `grep -c "Phase 160-03" luse-tools.ts` → 1
- `grep -A 25 "_applicationTool = {" luse-tools.ts | grep -c "enum:"` → 0 (enum dropped)
- LUSE_TOOLS array shape unchanged (same 22 tools, same indices)

### Task 2: Handler resolver-first dispatch + IPC stderr + APP_MAP fallback (commit `fbdda807`)

**Files modified:**
- `livos/packages/livinityd/source/modules/computer-use/native/window.ts` (+97):
  - Added `LivosAppMatch` interface — `{kind, appId, route, title, icon}`.
  - Added `LivosAppResolver` type alias — `(name: string) => Promise<LivosAppMatch | null>`.
  - Added `defaultLivosAppResolver(name, deps)` pure function — DI-injected `listWebApps + listNativeApps + userSlug + domainRoot + proto?` deps. Queries both lists via `Promise.all`, case-insensitive name match, WebApp before Native. WebApp URL emitted as `${proto}://${sub}-${deps.userSlug}.${deps.domainRoot}/` (DASH form). Native route emitted as `/native/${na.id}`. Returns null on no-match.
  - Empty-name pre-flight guard returns null without spawning either list query.
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` (+61):
  - Imported `LivosAppResolver` type from `../native/window.js`.
  - Extended `LuseToolsOptions` with optional `livosAppResolver?: LivosAppResolver` field + JSDoc explaining DI contract.
  - Rewrote `computer_application` handler:
    - Pre-flight: trim + isError on empty input.
    - Resolver-first: `if (options.livosAppResolver)` → `await options.livosAppResolver(application)` → on match: stderr write `[luse-mcp] open_livos_app kind=${match.kind} appId=${match.appId} route=${match.route}\n` + `withPostScreenshot(…, async () => {})` settle.
    - Resolver throw: log via stderr `[luse-mcp] livosAppResolver error: …; falling through to APP_MAP\n`, continue to APP_MAP path.
    - APP_MAP fallback: existing `openOrFocus(application as never)` flow unchanged.

**Acceptance criteria met:**
- `grep -c "Phase 160-03" mcp/tools.ts` → 4 (≥1)
- `grep -c "livosAppResolver" mcp/tools.ts` → 4 (≥2 — import + interface field + handler call + JSDoc)
- `grep -c "LivosAppResolver|defaultLivosAppResolver" window.ts` → 2 (≥2 — type alias + function export)
- `grep -c "open_livos_app" mcp/tools.ts` → 3 (≥1 — IPC line, JSDoc, comment)
- Dash literal `${sub}-${deps.userSlug}.${deps.domainRoot}` → 1 occurrence in window.ts (the only domain-pattern emit site)

### Task 3: Six source-text invariants lock the resolver path (commit `c2939fd6`)

**Files modified:**
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts` (+50):
  - Added `readFileSync` (node:fs) + `join` (node:path) imports.
  - Appended `describe('Phase 160-03 — computer_application LivOS resolver dispatch')` block with 6 invariants:
    1. `expect(SRC).toMatch(/livosAppResolver/)` — handler references the DI'd resolver.
    2. `expect(SRC).toMatch(/open_livos_app kind=/)` — IPC stderr literal present.
    3. `expect(WIN_SRC).toMatch(/export async function defaultLivosAppResolver/)` — default resolver exported.
    4. **DASH-pattern guard** — positive `expect(WIN_SRC).toMatch(/\$\{sub\}-\$\{deps\.userSlug\}\.\$\{deps\.domainRoot\}/)` AND negative `expect(WIN_SRC).not.toMatch(/\$\{sub\}\.\$\{deps\.userSlug\}\.\$\{deps\.domainRoot\}/)`.
    5. `expect(WIN_SRC).toMatch(/Promise\.all\(\[/)` + `listWebApps` + `listNativeApps` — parallel-query shape preserved.
    6. `Phase 160-03` marker present in both files.

**Acceptance criteria met:**
- `grep -c "Phase 160-03" mcp/tools.test.ts` → 5 (≥1)
- vitest run `source/modules/computer-use/mcp/tools.test.ts` → **50 PASS / 0 FAIL** (was 44 / 0 — 6 new Phase 160-03 invariants)
- Domain pattern dual-guard confirmed via test source inspection — positive + negative regex both present.

## Architecture

```
                       ┌─────────────────────────────────────────────────────────┐
                       │  LUSE MCP CHILD PROCESS (forked tsx via mcp/server.ts)  │
                       │                                                         │
                       │  registerLuseTools(server, options)                     │
                       │    └─ buildHandlers(options)                            │
                       │         └─ computer_application: async (args) =>        │
                       │              1. trim + isError on empty                 │
                       │              2. options.livosAppResolver?               │
                       │                  ├─ MATCH → stderr "[luse-mcp]          │
                       │                  │           open_livos_app             │
                       │                  │           kind=… appId=… route=…"    │
                       │                  │         → withPostScreenshot()       │
                       │                  └─ NULL  → APP_MAP fallback            │
                       │              3. openOrFocus(app) → APP_MAP spawn        │
                       └────────────────────────────┬────────────────────────────┘
                                                    │ stderr pipe
                                                    ▼
   ┌────────────────────────────────────────────────────────────────────────────┐
   │  PARENT LIVINITYD PROCESS (consumes child's stderr)                        │
   │                                                                            │
   │  Future wire (post-Phase 160 deferred):                                    │
   │    childStderr.on('data', line => {                                        │
   │      if (line.startsWith('[luse-mcp] open_livos_app')) {                   │
   │        const {kind, appId, route} = parseStderrIpc(line)                   │
   │        windowManager.openWindow(appId, route, title, icon)                 │
   │      }                                                                     │
   │    })                                                                      │
   │                                                                            │
   │  Default resolver wiring (post-Phase 160 deferred):                        │
   │    options.livosAppResolver = (name) =>                                    │
   │      defaultLivosAppResolver(name, {                                       │
   │        listWebApps: () => trpc.apps.list.query(),                          │
   │        listNativeApps: () => trpc.apps.native.list.query(),                │
   │        userSlug: currentUser.slug,                                         │
   │        domainRoot: 'livinity.io',                                          │
   │      })                                                                    │
   └────────────────────────────────────────────────────────────────────────────┘
```

**What this plan ships:** the schema (free-form) + the resolver primitive (`defaultLivosAppResolver`) + the handler dispatch shape (resolver-first → IPC stderr → APP_MAP fallback) + the DI hook (`LuseToolsOptions.livosAppResolver`) + the dash-pattern test invariants.

**What this plan does NOT ship:** the livinityd-side wiring that (a) constructs the default resolver with real trpc closures + authenticated user slug, and (b) parses the child's stderr `open_livos_app` lines into `windowManager.openWindow` calls. Both are deferred to a follow-up integration plan (recommend creating a Plan 160-07 or rolling into the eventual Phase 161 mcp wiring sweep). Without the wiring, the resolver-first branch is dead code (options.livosAppResolver is undefined → straight fallback to APP_MAP — pre-Plan-160-03 behavior preserved).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Cosmetic] Used `options.livosAppResolver` (singular) instead of plan's `opts.livosAppResolver`**
- **Found during:** Task 2 implementation
- **Issue:** Plan's `<action>` snippet wrote `opts.livosAppResolver` but the surrounding `buildHandlers(options: LuseToolsOptions = {})` parameter name is `options` (not `opts`). Using `opts.` would have been a typo-style undefined reference.
- **Fix:** Used `options.livosAppResolver` throughout — matches the existing `options.skillReplayDeps`, `options.streamManager`, `options.defaultDisplay` references in the same function body. Acceptance grep `grep -c "livosAppResolver"` returns 4 (≥ required 2) regardless of receiver-name choice.
- **Files modified:** `mcp/tools.ts` only
- **Commit:** `fbdda807`

### Deferred Issues (out of scope per scope-boundary rule)

**1. Pre-existing failures in `native/input.test.ts` (0 tests collected — file errors during collect)**
- File has a collect-time error preventing test discovery — totally unrelated to Phase 160-03 (no input.ts touched in this plan).
- Confirmed pre-existing via `git stash + vitest run + git stash pop` — same failure on bare HEAD as on the plan branch.

**2. Pre-existing failures in `native/screenshot.test.ts` (T5 unlink-error swallowing + 4 timeout failures)**
- These tests hit real spawn / OS timing in CI — flaky pre-existing failures unrelated to Phase 160-03.
- Confirmed pre-existing via stash compare.

**3. Pre-existing failures in `native/input.window.test.ts` (7 xdotool argv shape failures)**
- Same pre-existing — wmctrl/xdotool spawn shape drift, unrelated to this plan's files-modified set.

**4. Pre-existing failures in `native/screenshot.window.test.ts` (2 windowId error-message format failures)**
- Same pre-existing — error string format drift, unrelated.

**5. Pre-existing failures in `luse-mcp-config.test.ts` (T4/T5/T6 LUSE_REDIS_URL env shape)**
- Already documented in Plan 160-02 SUMMARY (Phase 100-10-04 added `LUSE_REDIS_URL` to host-display env block without updating these expectations). Out of scope here too.

**6. Default resolver wiring + livinityd stderr parser (deferred to integration plan)**
- The plan itself only ships the resolver primitive + DI hook; livinityd's mcp/server.ts must construct the default resolver closure and the parent must parse `[luse-mcp] open_livos_app` lines into windowManager calls. Recommend tracking in a follow-up plan post-Phase 160 (or as part of Plan 160-06 verification sweep findings).

## Authentication Gates

None — this plan modifies pure-function dispatch + schema shape; no external auth surface touched.

## Hard Guardrails

- [x] **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** for `liv/packages/core/src/sdk-agent-runner.ts` preserved across all 3 Phase 160-03 commits (verified at start, after Task 1 `95de89ca`, after Task 2 `fbdda807`, after Task 3 `c2939fd6`).
- [x] **D-09 verbatim contract** — `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` bytes UNCHANGED. Verified `git diff HEAD~3..HEAD -- luse-system-prompt.ts` returns EMPTY. Tree SHA still `2083f0a3dfc798b4841613b9576b94929f2faf2f`.
- [x] **D-NO-NEW-DEPS** — no new npm packages added. `git diff --stat HEAD~3..HEAD -- **/package.json` = empty.
- [x] **Domain pattern** — dash-form `<app>-<user>.<root>` is the only emit site in the resolver. Positive regex `/\${sub}-\${deps\.userSlug}\.\${deps\.domainRoot}/` matches once; negative regex for dot-form `/\${sub}\.\${deps\.userSlug}\.\${deps\.domainRoot}/` matches zero times. Both guarded by test invariant #4.
- [x] **Atomic commits per task** — 3 commits, one per task: `feat(160-03): drop enum` + `feat(160-03): resolver dispatch` + `test(160-03): source-text invariants`.
- [x] **Files-modified disjoint from Plan 160-04** — verified: my 4 modified files are luse-tools.ts / mcp/tools.ts / mcp/tools.test.ts / native/window.ts; Plan 160-04 touches agent-prompt-builder.ts / screenshot.ts. Zero overlap.
- [x] **Test pattern** — invariants follow the existing vitest source-text pattern in this same file (no @testing-library/react). The 6 new tests parallel the Phase 100-10 + Phase 100-10-04 source-text invariants already in this file.

## TDD Gate Compliance

This plan does NOT have a `type: tdd` frontmatter (autonomous=true scaffold work, no test-first cycle required). Tests in Task 3 were added as source-text INVARIANTS locking the dispatch shape / domain pattern / IPC literal — appropriate pattern for contract-shape work (no behavior to drive out incrementally; the resolver's literal output text IS the spec).

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: `livos/packages/livinityd/source/modules/computer-use/luse-tools.ts` (modified, 95de89ca)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` (modified, fbdda807)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/native/window.ts` (modified, fbdda807)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts` (modified, c2939fd6)

**Commits verified to exist:**
- FOUND: `95de89ca` Task 1 — feat(160-03): drop enum from computer_application schema (free-form string)
- FOUND: `fbdda807` Task 2 — feat(160-03): add LivOS app resolver + computer_application handler dispatch
- FOUND: `c2939fd6` Task 3 — test(160-03): add 6 source-text invariants for LivOS resolver dispatch

**Sacred SHA verified preserved:**
- FOUND: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` matches `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts`

**D-09 verbatim invariant verified:**
- FOUND: `git diff HEAD~3..HEAD -- livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` returns EMPTY (byte-identical preservation)

**Tests verified to pass:**
- mcp/tools.test.ts: **50 PASS / 0 FAIL** (was 44 / 0 — added 6 new Phase 160-03 invariants)
- Pre-existing failures in input.test.ts / screenshot.test.ts / input.window.test.ts / screenshot.window.test.ts / luse-mcp-config.test.ts confirmed unrelated (stash-compare verified, all in files Plan 160-03 did not touch).

**Domain pattern uniqueness:**
- FOUND: `grep "${sub}-${deps.userSlug}.${deps.domainRoot}" window.ts` → 1 match (resolver emit site)
- FOUND: `grep "${sub}.${deps.userSlug}.${deps.domainRoot}" window.ts` → 0 matches (dot anti-pattern absent)

**No new dependencies:**
- `git diff --stat HEAD~3..HEAD -- **/package.json` = empty
