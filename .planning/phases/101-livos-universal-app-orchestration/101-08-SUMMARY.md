---
phase: 101-livos-universal-app-orchestration
plan: 08
subsystem: teach-mode (Pillar D)
tags: [teach-v3, selfclaude, action-driven, popover, radix, fifo-queue, v3-replay, t-101-04, sacred-sha-preserved]

# Dependency graph
requires:
  - phase: 101-livos-universal-app-orchestration
    plan: 00
    provides: Wave-0 test stubs (teach-popover.test.tsx + webapp-teach-popup-host.test.tsx)
  - phase: 100-multi-stream-window-redesign
    plan: 09-06
    provides: v2 action_log schema (zod discriminated union) — extended in Task 4 to accept v3 as third union arm
  - phase: 100-multi-stream-window-redesign
    plan: 10-02
    provides: D-100-10-I lazy-translation shim (`translateLegacyBytebotToolNames`) — preserved unchanged for v1/v2 path
provides:
  - SelfClaude action-driven teach recorder (UI hook rewrite)
  - <TeachPopover> Radix popover anchored at click coords (NEW component)
  - FIFO PendingStep queue in webapp-teach-popup-host (BLOCKER #4 fix)
  - v3 ActionLog schema (`{version:3, webappId, name?, startedAt, endedAt, events:ActionStep[]}`)
  - v3 replay branch in skill-replay-tool.ts (renderSkillV3 exported)
  - "Adlandır" SaveSkillDialog rename
  - T-101-04 mitigation: sanitize() strips control chars + `<`/`>` + 1024 cap
affects:
  - 101-10 (UAT walk — rows for v3 teach mode: click→popover→Save→pushNote)
  - phase 102 (drift recovery) — note step's instruction text is the recovery surface

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SelfClaude DOM-listener pattern (verbatim port from github.com/utopusc/selfclaude/ui/teach-recorder.js Apache-2.0): capture-phase mousedown on noVNC canvas → canvas-pixel coord transform via canvas.width/rect.width scaling → numeric button mapping (0→1, 2→3, else→2) → onAfterClick setTimeout 100ms"
    - "Radix Popover.Anchor + virtualRef for arbitrary (x,y) anchoring (no real DOM element required) — getBoundingClientRect returns new DOMRect(x, y, 1, 1)"
    - "FIFO PendingStep queue with stable draftId per pending step (resets internal popover draft on queue advance via useEffect dep)"
    - "Phase 101-08 v3 schema is a THIRD arm of the existing skills-router discriminated union — backwards-compat with v1/v2 zero-touch"
    - "Lazy-translation shim (D-100-10-I) preserved unchanged for v1/v2 path; v3 takes a separate dispatch branch with strict `=== 3` check (not `>= 3`) to prevent silent future-version drift"

key-files:
  created:
    - livos/packages/ui/src/modules/window/teach-popover.tsx (NEW — 137 lines)
  modified:
    - livos/packages/ui/src/hooks/use-teach-recorder.ts (full rewrite — interval block + 1Hz heartbeat REMOVED, DOM-event-driven only)
    - livos/packages/ui/src/hooks/use-teach-recorder.unit.test.tsx (24 source-text + 4 jsdom runtime, 28 total)
    - livos/packages/ui/src/modules/window/teach-popover.test.tsx (replaced Wave-0 stub with 17 tests)
    - livos/packages/ui/src/modules/window/app-contents/webapp-teach-popup-host.tsx (rewrite — Sonner toast path DELETED, TeachPopover + FIFO queue)
    - livos/packages/ui/src/modules/window/app-contents/webapp-teach-popup-host.test.tsx (replaced Wave-0 stub with 9 tests; 6 source-text + 3 BLOCKER #4 behavior)
    - livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx ("Save skill" → "Adlandır"; recorder prop passed to WebAppTeachPopupHost)
    - livos/packages/livinityd/source/modules/webapps/skills-router.ts (v3 zod schema added; create mutation skips meta-stamp for v3)
    - livos/packages/livinityd/source/modules/webapps/skills-router.test.ts (T-09-06-S3 repurposed to T-101-08-S3 + S3b)
    - livos/packages/livinityd/source/modules/computer-use/skill-replay-tool.ts (renderSkillV3 + v3 dispatch branch)
    - livos/packages/livinityd/source/modules/computer-use/skill-replay-tool.test.ts (+6 v3 tests)

decisions:
  - "Tests follow project precedent (use-webapp-vnc.unit.test.tsx) — source-text invariants + minimal jsdom mount (no @testing-library/react). D-NO-NEW-DEPS locked. The 'mountHost' adapter uses ReactDOM.createRoot + act + setReactInputValue (native-setter trick) so React's onChange fires correctly."
  - "v3 ActionLog schema has NO screenshot fields per Q4-RESOLVED — replay just dispatches actions and uses note-step instruction text for drift recovery (Phase 102). Removes ~2MB-per-event JSONB bloat from v2."
  - "v3 button mapping kept numeric 1|2|3 (RESEARCH.md Pattern 3 verbatim) instead of v1/v2 string 'left'|'middle'|'right'. zod discriminated union by-shape catches v1→v3 reshape attempts (T-101-08-S3b)."
  - "Recorder exposes setOnAfterClick(cb|null) — caller-controlled subscription instead of static option at start(). Lets WebAppTeachPopupHost re-subscribe per render without restart."
  - "FIFO queue cleared on `isRecording === false` (stop or unmount) so canceled session doesn't leak pending popovers into next recording."
  - "v3 dispatch is STRICT `version === 3` — future v4 falls through to v1/v2 legacy path with NO v3-marker text (test T-101-08-V3-06). Prevents silent schema-drift."

metrics:
  duration: ~30 minutes (this session, code-only — no Mini PC deploy)
  completed: 2026-05-11
  tasks_completed: 6 / 6
  commits: 9 (4 RED + 4 GREEN + 1 cross-cutting)
  tests_added: 39 (28 recorder unit + 17 popover + 9 host + 2 skills-router + 6 replay-tool, minus stub replacements = ~39 net)
---

# Phase 101 Plan 08: SelfClaude Action-Driven Teach v3 Summary

One-liner: Replaced the interval-driven teach recorder with SelfClaude's DOM-listener pattern (capture-phase mousedown on noVNC canvas → 100ms-later popover anchored at click coords with instruction prompt) and added a v3 ActionLog schema + replay branch + "Adlandır" dialog rename — all sacred-SHA-preserved.

## What shipped

### Task 1 — `use-teach-recorder.ts` rewritten (Phase 101-08 verbatim port)
- DELETED: 1Hz `setInterval` heartbeat block + `HEARTBEAT_MS` constant + `{type:'wait', durationMs:1000}` emission.
- ADDED:
  - `ClickStep | KeyStep | TypeStep | NoteStep` types (v3 schema verbatim from RESEARCH.md Pattern 3 lines 468-490).
  - `ActionLogV3 = {version:3, webappId, name?, startedAt, endedAt, events:ActionStep[]}`.
  - Capture-phase `mousedown` listener on `canvas` (NOT host) — fires BEFORE noVNC's bubble-phase forwards click to streamed Chrome.
  - Canvas-pixel coord transform: `scaleX = canvas.width / rect.width`, `scaleY = canvas.height / rect.height`, clamped to `[0, canvas.width-1]`.
  - Button mapping: `ev.button === 0 → 1` (left), `ev.button === 2 → 3` (right), else `2` (middle).
  - `onAfterClick` callback fires 100ms post-click via `setTimeout(cb, 100)` — try/catch + console.error guards.
  - `pushNote(text)` helper: `text.trim().slice(0, 512)` → push `NoteStep`; empty/whitespace = no-op.
  - `setOnAfterClick(cb|null)` lets consumers swap subscription mid-recording.
- 28 tests passing (24 source-text invariants + 4 jsdom-driven runtime tests).

### Task 2 — `teach-popover.tsx` (NEW component)
- `<Popover.Root open={true}>` + `<Popover.Anchor virtualRef={...}>` with `getBoundingClientRect: () => new DOMRect(x, y, 1, 1)` for click-coord anchoring (no real DOM element needed).
- Instruction prompt verbatim per CONTEXT D-101-TEACH-V3 step 5: **"Bu adımı ne için yapıyorsun?"**
- Save / Cancel buttons; Save disabled when `draft.trim().length === 0`.
- Enter key → commit; Escape → cancel.
- Preview text rendered through `sanitize()` (T-101-04 mitigation: strip `[\x00-\x1f<>]`, cap at 1024 chars).
- `useEffect` resets `draft` on `pendingStep.draftId` change — supports rapid-click queue cycling.
- 17 tests passing (13 source-text + 4 sanitize runtime).

### Task 3 — `webapp-teach-popup-host.tsx` rewrite (BLOCKER #4 fix)
- DELETED: Sonner toast emission (lines 47-74 of pre-101-08 version). No `toast.()` calls remain.
- ADDED:
  - `useEffect` subscribes/unsubscribes via `recorder.setOnAfterClick` based on `isRecording`.
  - `queue: PendingStep[]` state — head rendered as `<TeachPopover>`, tail accumulates.
  - `handleCommit(text) → recorder.pushNote(text) → advance()`.
  - `handleCancel() → advance()` (no NoteStep written).
  - Queue cleared when `isRecording` flips to false.
- `<TeachPopover pendingStep={head} onCommit={...} onCancel={...} />` IS wired (grep passes; BLOCKER #4 cleared).
- 9 tests passing (6 source-text + 3 BLOCKER #4 behavior cases: mount→pendingStep, commit→pushNote+clear, rapid-double-click FIFO).
- `webapp-stream-window.tsx` updated to pass `recorder={recorder}` prop.

### Task 4 — "Adlandır" rename + v3 zod schema acceptance
- `webapp-stream-window.tsx` SaveSkillDialog: `<DialogTitle>Save skill</DialogTitle>` → `<DialogTitle>Adlandır</DialogTitle>`.
- `skills-router.ts`: added `actionLogV3Schema` as third arm of the discriminated union. Schema details:
  ```
  v3ClickStep:  {type:'click', button:1|2|3, x:int, y:int, ts:int}
  v3KeyStep:    {type:'key',   key:string<=64, ts:int}
  v3TypeStep:   {type:'type',  text:string<=1024, ts:int}
  v3NoteStep:   {type:'note',  text:string min(1)<=1024, ts:int}
  ```
- `create` mutation: `version === 3 ? input.actionLog : {...stampedMeta}` (v3 logs have NO `meta` shape — sessionId comes from mutation input only).
- `skills-router.test.ts`: T-09-06-S3 ("v3 rejected") REPURPOSED to T-101-08-S3 ("v3 SelfClaude shape accepted") + T-101-08-S3b ("v1 reshape to version:3 still rejected — proves discriminated-union by-shape").

### Task 5 — v3 replay branch in `skill-replay-tool.ts`
- NEW: `renderSkillV3(skill, freeFormGoal?) → {promptBlock, totalCount, retainedCount, truncated}`.
- Wrapper marker: `<previously-learned-skill name="..." version="3">` + `<!-- Phase 101-08 / SelfClaude v3 -->` comment so the agent's parser can distinguish v3 output.
- Note steps render as inline `<note>...</note>` lines (informational, NOT executed).
- `escV3()` strips control chars + XML entities + 512-char cap.
- `executeWebAppReplaySkill` dispatch: STRICT `if (skillVersion === 3) → renderSkillV3` else legacy path. Future v4+ falls through to legacy with NO v3 marker (T-101-08-V3-06).
- v1/v2 path UNCHANGED — `applyLegacyToolNameShimToSkill` still runs first; `buildSkillContext` still renders. Test T-101-08-V3-05 verifies a v2 legacy fixture still emits `<previously-learned-skill name="legacy-v2">` + `1. click button 'left' at (50, 60)` correctly.
- `_liv_meta.version = 3` + `eventCount` surface only on v3 path.
- 19 tests passing (13 legacy + 6 new v3).

### Task 6 — Sacred SHA + final commit
- `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (verified pre and post-execution, all 9 commits).
- This plan touches livos/ tree only (UI + livinityd), never liv/.

## v3 schema sample (Q4-RESOLVED — no screenshot fields)

```json
{
  "version": 3,
  "webappId": "00000000-0000-0000-0000-000000000001",
  "name": "open-gmail-inbox",
  "startedAt": 1715472000000,
  "endedAt":   1715472012345,
  "events": [
    {"type": "click", "button": 1, "x": 240, "y": 96,  "ts": 1024},
    {"type": "note",  "text": "Click the inbox folder in the left sidebar", "ts": 1100},
    {"type": "key",   "key":  "ArrowDown", "ts": 2048},
    {"type": "click", "button": 1, "x": 380, "y": 180, "ts": 3072},
    {"type": "note",  "text": "Open the first unread message", "ts": 3140}
  ]
}
```

## Test counts per file

| File | Tests |
|------|-------|
| `use-teach-recorder.unit.test.tsx` | 28 (24 source-text + 4 jsdom runtime) |
| `teach-popover.test.tsx` | 17 (13 source-text + 4 sanitize runtime) |
| `webapp-teach-popup-host.test.tsx` | 9 (6 source-text + 3 BLOCKER #4 behavior) |
| `skills-router.test.ts` | 15 (existing 13 + 2 new v3 schema cases) |
| `skill-replay-tool.test.ts` | 19 (existing 13 + 6 new v3 dispatch cases) |
| **Total in 101-08 scope** | **88** (39 new + 49 preserved) |

All green.

## Sacred SHA verification (final)

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Pre-execution: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
Post-execution: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
Match: TRUE.

## Deviations from Plan

### Auto-fixed Issues (Rules 1-3)

**1. [Rule 3 — Test infrastructure missing]** Worktree had no `node_modules`. Ran `pnpm install --prefer-offline --no-frozen-lockfile` in `livos/` to install deps, then restored `pnpm-lock.yaml` via `git checkout` to avoid contaminating the commit with lockfile drift.

**2. [Rule 2 — Missing recorder API surface]** Plan called for `pushNote` to be on the hook's return value but didn't enumerate `setOnAfterClick`. Without `setOnAfterClick`, the popup-host can't subscribe to click events. Added `setOnAfterClick: (cb|null) => void` to `UseTeachRecorderResult`.

**3. [Rule 3 — webapp-stream-window WebAppTeachPopupHost wiring]** Plan didn't explicitly say to pass the `recorder` prop into the host; the host's tests use an injected fake but production code path needed the actual recorder. Added `recorder={recorder}` to the live call site in `webapp-stream-window.tsx`.

**4. [Rule 1 — `Date.now()` regression in host]** First implementation used `${Date.now()}-${Math.random()}` as draftId fallback. This regressed `webapp-stream-window.unit.test.tsx` T-09-09-05 which forbids `Date.now()` in `webapp-teach-popup-host.tsx`. Fixed by using a module-level monotonic counter + `Math.random()`.

**5. [Rule 1 — T-09-06-S3 contract change]** Plan didn't explicitly call out that the pre-existing `T-09-06-S3: v3 record is rejected` test in `skills-router.test.ts` would conflict with the v3 acceptance. Repurposed the test (kept the test number/spirit — discriminated-union safety — but inverted the assertion to v3-SelfClaude-shape ACCEPTED) and added a sibling test T-101-08-S3b to preserve the "v1 reshaped to version:3 still rejected" guarantee.

### Architectural Rule-4 Decisions

None. All deviations stayed within "auto-fix" scope; no architectural decisions required user input.

## Self-Check: PASSED

Files created/modified verified on disk:
- `livos/packages/ui/src/modules/window/teach-popover.tsx` — FOUND
- `livos/packages/ui/src/modules/window/teach-popover.test.tsx` — FOUND
- `livos/packages/ui/src/modules/window/app-contents/webapp-teach-popup-host.tsx` — FOUND (modified)
- `livos/packages/ui/src/modules/window/app-contents/webapp-teach-popup-host.test.tsx` — FOUND
- `livos/packages/ui/src/hooks/use-teach-recorder.ts` — FOUND (rewrite)
- `livos/packages/ui/src/hooks/use-teach-recorder.unit.test.tsx` — FOUND (rewrite)
- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` — FOUND (modified)
- `livos/packages/livinityd/source/modules/webapps/skills-router.ts` — FOUND (modified)
- `livos/packages/livinityd/source/modules/webapps/skills-router.test.ts` — FOUND (modified)
- `livos/packages/livinityd/source/modules/computer-use/skill-replay-tool.ts` — FOUND (modified)
- `livos/packages/livinityd/source/modules/computer-use/skill-replay-tool.test.ts` — FOUND (modified)

Commits exist in git log:
- `4057a466` test(101-08): RED — v3 recorder source-text + runtime invariants — FOUND
- `f181ae7b` feat(101-08): GREEN — v3 useTeachRecorder — FOUND
- `bc48ea3d` test(101-08): RED — TeachPopover source-text + sanitize() runtime tests — FOUND
- `6c98a66a` feat(101-08): GREEN — TeachPopover (Radix anchored, T-101-04 sanitized) — FOUND
- `597b4246` test(101-08): RED — webapp-teach-popup-host BLOCKER #4 behavior tests — FOUND
- `27312896` feat(101-08): GREEN — Host renders TeachPopover + FIFO queue — FOUND
- `13899791` feat(101-08): v3 actionLog schema accepted + 'Adlandır' dialog rename — FOUND
- `a70094b6` test(101-08): RED — skill-replay-tool v3 branch tests — FOUND
- `28076033` feat(101-08): GREEN — v3 replay branch in skill-replay-tool — FOUND
