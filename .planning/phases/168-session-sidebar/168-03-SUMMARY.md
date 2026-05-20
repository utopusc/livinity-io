---
phase: 168
plan: 168-03
subsystem: ui/routes/ai-chat
status: code-complete
date-completed: 2026-05-19
commit: 312ac6a1
files:
  created: []
  modified:
    - livos/packages/ui/src/routes/ai-chat/index.tsx (sidebar wired, 260px→280px, placeholder removed)
    - livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx (+4 behavioral + +3 source-text invariants)
acceptance:
  vitest: "25/25 PASS (18 preserved + 4 new behavior + 3 new source-text invariants)"
  tsc: "0 NEW errors in index.tsx + ai-chat.test.tsx (pre-existing UI errors in agents-panel/etc. unaffected)"
  grep-invariants:
    - "<SessionSidebar in index.tsx: 1 hit (one JSX usage)"
    - "import SessionSidebar from '@/features/cc-sessions': 1 hit"
    - "<CcTerminal key={activeSessionId} sessionId={activeSessionId}: 1 hit (Phase 167 mount preserved)"
    - "<VaultGraph: 1 hit (Phase 169-04 branch preserved)"
    - "href='/chat-mobile': 1 hit (mobile fallback preserved)"
    - "Terminal + Vault Graph tab buttons: 2 hits each (Phase 169-04 nav preserved)"
    - "Session sidebar — Phase 168 placeholder: 0 hits (removed)"
sacred-guards-verified:
  - "Sacred SHA f3538e1d preserved"
  - "All Phase 162-167 server modules: byte-identical"
  - "Phase 166 cc-pty/*: byte-identical (manager.ts unchanged since 168-01 additive methods)"
  - "Phase 167 features/cc-terminal/*: byte-identical"
  - "Phase 168-02 features/cc-sessions/*: byte-identical (this plan only WIRES the bundle, doesn't modify it)"
  - "Phase 169 vault-graph/*: byte-identical"
---

# Phase 168 Plan 168-03: AI Chat Route Wiring Summary

`routes/ai-chat/index.tsx` upgraded from Phase 167-04 placeholder sidebar to a real `<SessionSidebar>` mount. Phase 167's mobile fallback and Phase 169-04's Terminal | Vault Graph tab nav both preserved verbatim. Active session state lives in the route and is passed to both the sidebar (via onSelect) and the terminal (via `key={activeSessionId}` for clean remount semantics).

## Summary

Diff is surgical: 2 files modified, no new files, no deletions.

- **`index.tsx` (MOD)** — additive comment stanza (Phase 168-03), one new import (`SessionSidebar from '@/features/cc-sessions'`), drop the underscore-prefix on the existing `_setActiveSessionId` setter, drop the eslint-disable + deferred comment, widen `gridTemplateColumns` `260px → 280px`, and replace the placeholder sidebar `<p>` block with:
  ```tsx
  {/* Phase 168-03 — CC PTY session sidebar (lifecycle + selection). */}
  <div className='border-r border-border bg-bg-secondary'>
    <SessionSidebar
      activeSessionId={activeSessionId}
      onSelect={setActiveSessionId}
    />
  </div>
  ```
  Mobile fallback, tab nav, CcTerminal mount, VaultGraph mount — all UNCHANGED.

- **`ai-chat.test.tsx` (MOD)** — added a new SessionSidebar mock that captures the latest `onSelect` callback into `lastSidebarOnSelect`, enabling tests to simulate sidebar selection events. Updated the 260px grid assertion to 280px and the placeholder-text assertion to a mock-mounted assertion. Added 4 new wiring assertions inside the desktop describe + 3 new source-text invariants:
  - A1 SessionSidebar mock invoked on desktop
  - A2 onSelect('uuid-1') → CcTerminal mounts with sessionId='uuid-1'
  - A3 onSelect('uuid-2') after 'uuid-1' triggers a remount (new ccTerminalMock call + DOM data-session updated)
  - A4 activeSessionId=null → EmptyState rendered + zero CcTerminal in the DOM
  - Source-text invariants: import `SessionSidebar` from `@/features/cc-sessions`; `<SessionSidebar ... onSelect={setActiveSessionId}` present; placeholder string absent

## Acceptance Evidence

- **vitest**: `pnpm --filter ui exec vitest run src/routes/ai-chat/ai-chat.test.tsx` → 25/25 PASS in 50ms (1.81s wall-clock incl. jsdom setup). 18 of the 25 are the Phase 167-04 + 169-04 baseline (1 placeholder-text assertion was UPDATED to be a SessionSidebar-mounted assertion — net assertion count goes from 18 to 25 because we added 4 wiring + 3 invariants).
- **tsc**: 0 NEW errors in `index.tsx` + `ai-chat.test.tsx` (pre-existing UI baseline errors in `agent-status-overlay.tsx`, `agents-panel.tsx`, etc. are unaffected — `git stash` reproduces the same set).
- **git diff --stat**: exactly 2 files changed (+121 / -17 net additive bias).

## Threat Mitigations Realized

| Threat ID | Mitigation | Asserted by |
|-----------|------------|-------------|
| T-168-03-01 (stale activeSessionId after delete) | accepted — CcTerminal surfaces session-not-found per Phase 167 contract; degrade to re-create flow | documented |
| T-168-03-02 (xterm buffer leak across session switch) | `key={activeSessionId}` triggers full remount → fresh WS connection | A3 (key remount) |
| T-168-03-03 (activeSessionId persistence concern) | not persisted to URL/localStorage; in-process state only | code review + plan §accept |
| T-168-03-04 (placeholder regression) | source-text invariant: 0 hits for `Session sidebar — Phase 168` | "removes the legacy placeholder string" test |
| T-168-03-05 (sidebar mounted on mobile) | `if (isMobile) return <FallbackCard>` early-return preserved verbatim | mobile-branch describe block |

## Sacred-Guard Byte-Identity Proof

`git diff --stat HEAD~1` shows the diff confined to:
- `livos/packages/ui/src/routes/ai-chat/index.tsx`
- `livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx`

No other file modified. All sacred-guard files (Phase 162-167 server cluster, Phase 166 cc-pty/*, Phase 167 features/cc-terminal/*, Phase 168-02 features/cc-sessions/*, Phase 169 features/vault-graph/* + server vault-graph/*) byte-identical.

## Self-Check: PASSED

- Files modified: ✓ exactly 2 (`index.tsx` + `ai-chat.test.tsx`)
- Commit exists: ✓ `312ac6a1`
- 25/25 vitest GREEN ✓
- 0 NEW tsc errors in modified files ✓
- Sacred-guard byte-identity ✓
