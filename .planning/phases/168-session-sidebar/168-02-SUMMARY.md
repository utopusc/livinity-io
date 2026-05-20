---
phase: 168
plan: 168-02
subsystem: ui/features/cc-sessions
status: code-complete
date-completed: 2026-05-19
commit: 55b1e097
files:
  created:
    - livos/packages/ui/src/features/cc-sessions/SessionSidebar.tsx
    - livos/packages/ui/src/features/cc-sessions/SessionItem.tsx
    - livos/packages/ui/src/features/cc-sessions/NewSessionButton.tsx
    - livos/packages/ui/src/features/cc-sessions/index.ts
    - livos/packages/ui/src/features/cc-sessions/SessionSidebar.test.tsx
  modified: []
acceptance:
  vitest: "13/13 PASS (10 behavioral via createRoot+act + 3 source-text invariants)"
  tsc: "0 NEW errors in features/cc-sessions/*"
  grep-invariants:
    - "refetchInterval: 10_000 in SessionSidebar.tsx: 1 hit"
    - "dangerouslySetInnerHTML across SessionSidebar+SessionItem+NewSessionButton: 0 hits"
    - "trpcReact.ccPty.{list,create,rename,delete} hooks: 4 hits"
    - "Barrel re-exports SessionSidebar + SessionItem + NewSessionButton"
sacred-guards-verified:
  - "Sacred SHA f3538e1d preserved (zero server-side changes)"
  - "All Phase 162-167 server modules: byte-identical"
  - "Phase 166 cc-pty/*: byte-identical"
  - "Phase 167 features/cc-terminal/*: byte-identical"
  - "Phase 169 vault-graph/*: byte-identical"
  - "D-NEW-DEPS-v35: zero new npm deps"
---

# Phase 168 Plan 168-02: SessionSidebar Feature Bundle Summary

4-component cc-sessions feature bundle (`SessionSidebar`, `SessionItem`, `NewSessionButton`, barrel) consuming Plan 168-01's `trpcReact.ccPty.*` namespace. Self-contained, ready to be imported by Plan 168-03 into `routes/ai-chat/index.tsx`. No router/service wiring in this plan.

## Summary

- **`SessionSidebar.tsx` (NEW)** — top-level sidebar:
  - `trpcReact.ccPty.list.useQuery(undefined, {refetchInterval: 10_000})` (10s polling fallback per D-V35-C)
  - 3 mutations: create / rename / delete. Each `onSuccess` refetches the list. create also auto-selects the new session id. delete also clears active selection if the deleted session was the active one.
  - `useMemo` sort: `Math.max(b.lastMessageAt, b.lastAttachedAt) - Math.max(a.lastMessageAt, a.lastAttachedAt)` (desc by last activity)
  - Empty state: `No sessions yet. Click "New Session" to start.`
- **`SessionItem.tsx` (NEW)** — presentational row, no tRPC inside:
  - Title + relative-time (just now / Nm ago / Nh ago / Nd ago) + 3-dot menu
  - `data-active` attribute for the active row; accent border styling when active
  - Inline-edit on Rename (Enter commits, Escape cancels, blur commits if non-empty)
  - Delete fires `window.confirm(...)` with the session title; only invokes `onDelete()` on true
  - `attachedElsewhere?: boolean` prop already declared and renders a yellow dot when true — wiring is Plan 168-04's job
  - **Local `CcPtySession` minimum-shape interface** — avoids cross-package import from livinityd (UI does not depend on livinityd internals per D-NEW-DEPS scope)
- **`NewSessionButton.tsx` (NEW)** — single button:
  - Label flips `+ New Session` ↔ `Creating…` based on `loading` prop
  - `aria-label="Create new session"` for the testable selector
- **`index.ts` (NEW)** — barrel re-exporting all 3 components + their props types + the local `CcPtySession` type
- **`SessionSidebar.test.tsx` (NEW)** — 13 assertions, jsdom env, createRoot + act() pattern (no @testing-library/react per D-NO-NEW-DEPS):
  - A1 empty state renders "No sessions yet"
  - A2 populated list renders one row per session
  - A3 sort by max(lastMessageAt, lastAttachedAt) DESC
  - A4 active row has `data-active="true"` + exactly one inactive sibling has `data-active="false"`
  - A5 row click → onSelect(id)
  - A6 `+ New Session` click → createMutation.mutate({})
  - A7 createMutation.onSuccess → list.refetch() + onSelect(newId)
  - A8 Rename menu → inline input → Enter → renameMutation.mutate({id, title})
  - A9 Delete menu → window.confirm(true) → deleteMutation.mutate({id})
  - A10 source-text invariant: refetchInterval: 10_000 literal
  - Plus 3 invariants: zero `dangerouslySetInnerHTML`; barrel exports all 3 components; sidebar wires all 4 trpc hooks

## Acceptance Evidence

- **vitest**: `pnpm --filter ui exec vitest run src/features/cc-sessions/SessionSidebar.test.tsx` → 13/13 PASS in 46ms
- **tsc**: `pnpm --filter ui exec tsc --noEmit | grep cc-sessions` → 0 hits (no new errors)
- **D-NEW-DEPS-v35**: No package.json modifications; uses existing `clsx` dep + native React APIs only.

## Threat Mitigations Realized

| Threat ID | Mitigation | Asserted by |
|-----------|------------|-------------|
| T-168-02-01 (XSS via title) | All titles rendered via React text nodes; zero dangerouslySetInnerHTML | source-text invariant in test |
| T-168-02-02 (Stale-cache race) | Every mutation onSuccess → list.refetch(); 10s polling fallback | A7 + A8 + A9 (refetch spy) |
| T-168-02-03 (DoS refetch) | accepted — 10s is the v35.0 baseline (D-V35-C) | documented |
| T-168-02-04 (Confused-deputy delete) | window.confirm includes session title; server RBAC is 2nd line | A9 + plan §accept |
| T-168-02-05 (Repudiation on delete) | accepted — server killSession logs | plan §accept |
| T-168-02-06 (Sidebar mount on mobile) | accepted — route at /ai-chat (desktop only) per Phase 167-04 | plan §accept |

## Sacred-Guard Byte-Identity Proof

Only 5 NEW files created under `livos/packages/ui/src/features/cc-sessions/`. No file modifications. All server modules (Phase 162-167 cluster), Phase 166 cc-pty/*, Phase 167 features/cc-terminal/*, Phase 169 vault-graph/* — UNTOUCHED.

## Self-Check: PASSED

- Files exist: ✓ 5 new files (SessionSidebar.tsx + SessionItem.tsx + NewSessionButton.tsx + index.ts + SessionSidebar.test.tsx)
- Commit exists: ✓ `55b1e097`
- 13/13 vitest GREEN ✓
- 0 NEW tsc errors ✓
- Sacred-guard byte-identity ✓
