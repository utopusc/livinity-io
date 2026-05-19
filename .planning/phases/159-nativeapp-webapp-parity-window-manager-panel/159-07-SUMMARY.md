---
phase: 159-nativeapp-webapp-parity-window-manager-panel
plan: 07
subsystem: ui
tags: [workstream-a, chrome-parity, surgical-passthrough, native-chat, dual-hook, react-hooks]

# Dependency graph
requires:
  - phase: 159
    provides: useNativeAppAgent hook + UseStreamAppAgentResult type alias (Plan 06)
  - phase: 159
    provides: Workstream A test stubs (Plan 01)
  - phase: 159
    provides: WindowContent windowId? prop widening (Plan 04)
provides:
  - NativeApp windows render the same chrome row (X + Chat + drag bar) as WebApp windows
  - Chat icon click on a native window opens inline chat-input pill, sends via useNativeAppAgent
  - Teach + Skills slots architecturally omitted for native (RESEARCH A5 — no DOM to record clicks against)
  - Dual-hook resolution pattern (agent + nativeAgent + activeAgent triple) preserving T-10-10-RESPONSE-01 literal invariant
  - 19 new source-text invariants (10 window-chrome + 9 webapp-floating-action-bar Phase 159 block)
affects: [phase-159-plan-08-uat, future-native-app-features]

# Tech tracking
tech-stack:
  added: []  # No new libraries; pure additive surgical refactor
  patterns:
    - "Surgical pass-through (Option A1) over abstraction (Option A2 streamAppId rename)"
    - "Dual-hook resolution with re-bind: const agent = useWebAppAgent(webappId ?? '') + const nativeAgent = useNativeAppAgent(nativeAppId ?? '') + const activeAgent: UseStreamAppAgentResult = nativeAppId ? nativeAgent : agent"
    - "streamKind discriminator: 'webapp' | 'native' | null for chrome-row branching (Chat for both, Teach/Skills webapp-only)"

key-files:
  created: []
  modified:
    - livos/packages/ui/src/modules/window/windows-container.tsx
    - livos/packages/ui/src/modules/window/window.tsx
    - livos/packages/ui/src/modules/window/window-chrome.tsx
    - livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx
    - livos/packages/ui/src/modules/window/window-chrome.test.tsx
    - livos/packages/ui/src/modules/window/webapp-floating-action-bar.test.tsx
    - livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx

key-decisions:
  - "Option A1 (surgical pass-through) chosen over A2 (streamAppId rename) — preserves all 100-* / 101-* invariants verbatim, smaller blast radius"
  - "Native windows render Chat-only (NATIVE_MODES); Teach + Skills omitted — architectural per RESEARCH A5 (Teach recorder is DOM-scoped, native binaries have no DOM)"
  - "Dual-hook re-bind preserves T-10-10-RESPONSE-01 literal: const agent = useWebAppAgent(webappId ?? '') stays as exactly 1 match for the regex"
  - "Drawer store slot chatInputModeByWebappId re-used for native ids (UUID collision-free per Plan 06 namespace note)"
  - "Plan 07 is SOLE OWNER of windows-container.tsx in Phase 159 (Plan 04 explicitly did NOT touch it per BLOCKER #2 revision)"
  - "T-10-10-RESPONSE-02 updated in Task 4 to accept agent={activeAgent} shape (downstream consumes the selected agent, not the webapp-only one)"

patterns-established:
  - "streamKind discriminator pattern: webapp | native | null branching at the chrome layer"
  - "Surgical additive pass-through over abstraction-via-rename when invariants must be preserved"
  - "Hook re-bind with alias: when both hooks must be called unconditionally (React rule of hooks), bind a select variable downstream rather than renaming the originals"

requirements-completed: []  # No requirements field on Plan 07 frontmatter

# Metrics
duration: ~12min
completed: 2026-05-19
---

# Phase 159 Plan 07: Workstream A Chrome Parity Summary

**NativeApp window chrome lights up the Chat icon + inline chat-input via dual-hook resolution (useWebAppAgent + useNativeAppAgent + activeAgent select), preserving the T-10-10-RESPONSE-01 literal invariant verbatim and gating Teach/Skills slots webapp-only per RESEARCH A5.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-19T01:42Z
- **Completed:** 2026-05-19T01:55Z
- **Tasks:** 4
- **Files modified:** 7 (3 plumbing + 1 chrome + 1 action-bar + 2 tests)

## Accomplishments
- NativeApp windows render the X + Chat-icon + drag-bar chrome row (visual parity with WebApp)
- Chat icon click opens inline chat-input pill; Send wires through useNativeAppAgent → useAgentSocket → broker (no webapp-* tRPC calls)
- Teach + Skills slots correctly OMITTED for native (architectural per RESEARCH A5 — no DOM to record)
- Drag-bar width math handles 3 cases: webapp (X + action + drag + Skills), native (X + action + drag), non-stream (X + drag)
- Mutual-exclusion dev console.warn guard for accidental double-threading of webappId + nativeAppId
- T-10-10-RESPONSE-01 invariant preserved EXACTLY (regex still matches 1 occurrence)
- T-10-10-RESPONSE-02 updated to accept the new activeAgent re-bind shape
- 19 new source-text invariants added (10 window-chrome + 9 webapp-floating-action-bar Phase 159)

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread nativeAppId through windows-container/window/window-chrome (plumbing-only)** - `249a231b` (feat)
2. **Task 2: Wire WindowChrome streamKind discriminator + Chat-for-both action area** - `5531eb0e` (feat)
3. **Task 3: Dual-hook resolution + NATIVE_MODES + IconBar nativeAppId** - `d7ec439d` (feat)
4. **Task 4: Update T-10-10-RESPONSE-02 to accept agent={activeAgent} shape** - `ffc51e8c` (chore)

## Files Created/Modified

- `livos/packages/ui/src/modules/window/windows-container.tsx` — Added NATIVE_APP_ID_PREFIX constant + nativeAppId derivation; forwards windowId={window.id} to WindowContent (Plan 04 widened receive side)
- `livos/packages/ui/src/modules/window/window.tsx` — Accepts nativeAppId?: string; mutual-exclusion dev console.warn guard; forwards to WindowChrome
- `livos/packages/ui/src/modules/window/window-chrome.tsx` — StreamKind discriminator ('webapp' | 'native' | null); CHROME_FIXED_OVERHEAD_NATIVE constant; hasChromeChat gate replaces isWebApp on action area; Skills slot stays isWebApp-gated; sacred SHA marker
- `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` — Imports useNativeAppAgent + UseStreamAppAgentResult; NATIVE_MODES (Chat-only); WebAppFloatingActionBarProps + IconBarProps accept nativeAppId; dual-hook resolution preserves T-10-10-RESPONSE-01 literal; IconBar selects NATIVE_MODES vs MODES
- `livos/packages/ui/src/modules/window/window-chrome.test.tsx` — Replaced Wave 0 stub with 10 source-text invariants (streamKind, streamId, CHROME_FIXED_OVERHEAD_NATIVE, hasChromeChat, action-area forwarding, Skills-webapp-only, sacred SHA)
- `livos/packages/ui/src/modules/window/webapp-floating-action-bar.test.tsx` — Appended Phase 159 describe block with 9 invariants locking dual-hook shape, NATIVE_MODES, IconBar mode selection (9 existing Phase 101-09 invariants preserved)
- `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx` — T-10-10-RESPONSE-02 regex updated from `agent={agent}` to `agent={activeAgent}` (T-10-10-RESPONSE-01 UNCHANGED — still matches 1)
- `.planning/phases/159-nativeapp-webapp-parity-window-manager-panel/deferred-items.md` — Documented 4 pre-existing webapp-stream-window.unit.test.tsx failures (T-09-08-02, T-09-08-03, T-10-05-11, T-10-10-STATUS-02) verified out-of-scope via git stash + re-run

## Decisions Made

- **Option A1 (Surgical Pass-through):** Chosen over A2 (rename webappId → streamAppId across the whole tree). A1 is additive with smaller blast radius and preserves every 100-* / 101-* literal invariant verbatim. The dual-hook re-bind is the elegance — `agent` stays named `agent`, `nativeAgent` is the new hook, `activeAgent` selects.
- **NATIVE_MODES is Chat-only:** RESEARCH A5 documented that Teach is fundamentally webapp-DOM-scoped (webapp.input.* tRPC dispatch against Chrome canvas). Native binaries run XTest under x11vnc with no DOM — there is no meaningful "click sequence" to record. Skills are recorded sessions, so they too are webapp-only. This is architectural, not a TODO.
- **streamKind discriminator over boolean isWebApp/isNative pair:** A single discriminator with 3 states ('webapp' | 'native' | null) reads cleaner than two booleans + a "neither" branch, and the existing `isWebApp` literal stays as an alias to `streamKind === 'webapp'` to keep the Skills slot gate's source-text invariant untouched.
- **Drawer store slot re-use:** Per Plan 06's namespace JSDoc, `chatInputModeByWebappId[streamId]` is UUID-collision-free even when streamId = nativeAppId. No new Zustand slot needed.

## Dual-Hook Resolution Pattern (Detail)

The BLOCKER #1 fix that all of Plan 07's correctness rests on:

```ts
// CRITICAL INVARIANT (T-10-10-RESPONSE-01):
// the literal shape <const><space>agent<space>=<space>useWebAppAgent(webappId
// MUST appear EXACTLY ONCE in this file.
const agent = useWebAppAgent(webappId ?? '')           // ← T-10-10-RESPONSE-01 matches THIS
const nativeAgent = useNativeAppAgent(nativeAppId ?? '')
const activeAgent: UseStreamAppAgentResult = nativeAppId ? nativeAgent : agent
```

Why this shape (and not `const webappAgent = useWebAppAgent(...)`):
- T-10-10-RESPONSE-01 regex is `const\s+agent\s*=\s*useWebAppAgent\(`. Renaming `agent` to `webappAgent` would drop the count to 0 → test fails.
- T-10-10-RESPONSE-02 regex was `agent={agent}` in ChatInputBar/ChatResponseBar JSX. Phase 159 needs both webapp and native windows to share the same sub-components, so we now pass `activeAgent` downstream. Task 4 updates T-10-10-RESPONSE-02 to accept the new shape (the only invariant change in `webapp-stream-window.unit.test.tsx`).
- Sub-components (IconBar, ChatInputBar, ChatResponseBar) consume `activeAgent` (NOT `agent`, NOT `nativeAgent`) — so a webapp window sees `agent` selected, a native window sees `nativeAgent`, but the JSX is unchanged.

Both hooks are called unconditionally to satisfy React's rule of hooks. Each hook UUID-guards its own tRPC queries when the id is empty/non-UUID, so passing `''` is safe.

## Plan 04 ↔ Plan 07 windows-container.tsx Ownership Boundary

Per the phase planner's BLOCKER #2 revision, Plan 04 was originally going to ALSO patch `windows-container.tsx` to emit `windowId={window.id}` for the WindowContent registry plumbing. The revision moved that responsibility entirely to Plan 07 (which already owned the full `.map(...)` block rewrite for nativeAppId derivation) to avoid a same-wave file collision. Plan 07 confirmed at execution time that Plan 04 had NOT touched `windows-container.tsx` (Plan 04 only widened the accept side of `WindowContent` to take `windowId?`). The full call-site block is now Plan 07-owned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Yorum içindeki literal `const agent = useWebAppAgent(webappId` shape kırıldı**
- **Found during:** Task 3 (verification triple-check)
- **Issue:** Plan'ın önerdiği yorum bloğu literal `const agent = useWebAppAgent(webappId` ifadesini içeriyordu. T-10-10-RESPONSE-01 testindeki regex `const\s+agent\s*=\s*useWebAppAgent\(` hem koddan hem yorumdan match aldı → count 2 oldu, test fail (`expect(matches.length).toBe(1)`).
- **Fix:** Yorumdaki literal'ı bozdum (`<const><space>agent<space>=<space>useWebAppAgent(webappId` şeklinde açıklayıcı hale getirdim). Regex artık sadece gerçek koddaki bir match'i yakalıyor.
- **Files modified:** `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx`
- **Verification:** `node -e ...match(/const\s+agent\s*=\s*useWebAppAgent\(/g)` → 1 match. webapp-stream-window.unit.test.tsx T-10-10-RESPONSE-01 hala geçiyor.
- **Committed in:** `d7ec439d` (Task 3 commit)

**Total deviations:** 1 auto-fixed (Rule 1 — bug, yorum içinde regex-yakalanabilir literal kalmış)
**Impact on plan:** Plan'ın tam ruhunu koruyor (yorum hala dual-hook'un T-10-10-RESPONSE-01 sözleşmesini koruduğunu anlatıyor — sadece literal kırılmış). Plan author bu inceliği yakalayamamıştı; runtime verification yakaladı.

## Issues Encountered

- `git grep -c` "match count" değil "match olan satır sayısı" döndürüyor — yorumdaki literal ile koddaki literal aynı satırlarda değildi ama 2'ye çıkardı çünkü `-c` her satırda bir kez sayıyor. Gerçek regex match sayısını doğrulamak için `node -e "src.match(regex).length"` ile kontrol ettim.
- Çalışma dizininde paralel agent'lar `.planning/ROADMAP.md` + `.planning/STATE.md` değiştirmiş — orchestrator sahipliği gereği bu dosyalara dokunulmadı.
- `pnpm --filter ui` doğrudan exec çalıştırmıyor (`tsc` not found) — alternatif olarak `cd livos/packages/ui && npx tsc/vitest` ile çalıştırıldı. Aynı sonucu veriyor.

## Test Results

| Test File                                    | Pass | Fail | Notes                                          |
| -------------------------------------------- | ---- | ---- | ---------------------------------------------- |
| window-chrome.test.tsx                       | 10   | 0    | All new Phase 159 invariants green             |
| webapp-floating-action-bar.test.tsx          | 18   | 0    | 9 existing Phase 101-09 + 9 new Phase 159      |
| webapp-stream-window.unit.test.tsx           | 58   | 4    | 4 pre-existing failures (out-of-scope; documented in deferred-items.md). T-10-10-RESPONSE-01 + T-10-10-RESPONSE-02 BOTH green |

**Sacred SHA verification:** `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ (unchanged across all 4 commits)

**BLOCKER #1 triple-check:**
- `const agent = useWebAppAgent(` count = **1** ✓
- `const nativeAgent = useNativeAppAgent(` count = **1** ✓
- `const activeAgent: UseStreamAppAgentResult` count = **1** ✓

## Next Phase Readiness

- Workstream A (chrome parity) CODE-COMPLETE; ready for Phase 159 Plan 08 UAT
- Native windows now have the same Chat affordance as webapp windows; backend (useNativeAppAgent → useAgentSocket) wired end-to-end
- Pre-existing webapp-stream-window.unit.test.tsx failures (T-09-08-02, T-09-08-03, T-10-05-11, T-10-10-STATUS-02) documented in deferred-items.md for future Phase 159 cleanup

## Self-Check: PASSED

**Files verified:**
- `livos/packages/ui/src/modules/window/windows-container.tsx` — FOUND
- `livos/packages/ui/src/modules/window/window.tsx` — FOUND
- `livos/packages/ui/src/modules/window/window-chrome.tsx` — FOUND
- `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` — FOUND
- `livos/packages/ui/src/modules/window/window-chrome.test.tsx` — FOUND
- `livos/packages/ui/src/modules/window/webapp-floating-action-bar.test.tsx` — FOUND
- `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx` — FOUND
- `.planning/phases/159-nativeapp-webapp-parity-window-manager-panel/deferred-items.md` — FOUND
- `.planning/phases/159-nativeapp-webapp-parity-window-manager-panel/159-07-SUMMARY.md` — FOUND (this file)

**Commits verified:**
- `249a231b` — FOUND (Task 1)
- `5531eb0e` — FOUND (Task 2)
- `d7ec439d` — FOUND (Task 3)
- `ffc51e8c` — FOUND (Task 4)

---
*Phase: 159-nativeapp-webapp-parity-window-manager-panel*
*Plan: 07*
*Completed: 2026-05-19*
