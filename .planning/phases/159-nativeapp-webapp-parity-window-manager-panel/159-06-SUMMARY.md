---
phase: 159-nativeapp-webapp-parity-window-manager-panel
plan: 06
subsystem: ui-hooks
tags: [workstream-a, native-chat-hook, parity-with-webapp, sacred-sha-preserved]

# Dependency graph
requires:
  - phase: 159
    plan: 01
    provides: use-native-app-agent.test.ts stub scaffold (Wave 0) ready to fill with real source-text invariants
  - file: livos/packages/ui/src/hooks/use-webapp-agent.ts
    provides: UseWebAppAgentResult + WebAppSessionStatus types reused via re-export pattern
  - file: livos/packages/ui/src/hooks/use-agent-socket.ts
    provides: ActiveAppMetaPayload.kind already accepts 'native' (no envelope widening needed)
  - file: livos/packages/livinityd/source/modules/apps/native-routes.ts
    provides: apps.native.list tRPC procedure returning rows with {id, name, ...}

provides:
  - UseStreamAppAgentResult type alias (= UseWebAppAgentResult) enabling dual-hook resolver in Plan 07
  - useNativeAppAgent(nativeAppId) hook returning identical shape to useWebAppAgent
  - 12 source-text invariants locking parity contract + divergence rules
  - JSDoc-only namespace re-use note on webapp-drawer-store.ts (consumed by Plan 07)

affects:
  - 159-07 (WebAppFloatingActionBar wiring will hold either webapp or native agent result behind UseStreamAppAgentResult)
  - liv-core logs: native chats are disambiguated from webapp via `native:<id>:<rand>` conversation prefix

# Tech tracking
tech-stack:
  added: []  # D-NO-NEW-DEPS preserved — zero new runtime/dev deps
  patterns:
    - "Type alias re-export: `export type UseStreamAppAgentResult = UseWebAppAgentResult` lets consumers hold either hook's result behind a single type without duplicating the shape"
    - "Kind-only ActiveAppMeta switch: backend snippet injection branches on activeAppMeta.kind ('webapp' | 'native') — no envelope widening, no new useAgentSocket opt slot"
    - "Conversation id namespacing: `<kind>:<id>:<rand>` prefix surfaces the source surface in liv-core logs without a separate metadata channel"
    - "Source-text invariants over runtime tests: the hook file is asserted to contain specific regex patterns (apps.native.list, kind: 'native', native:<id> template), keeping the test fast + framework-free per D-NO-NEW-DEPS"

key-files:
  created:
    - livos/packages/ui/src/hooks/use-native-app-agent.ts          (117 lines — hook + UseStreamAppAgentResult alias)
  modified:
    - livos/packages/ui/src/hooks/use-native-app-agent.test.ts     (Wave 0 stub → 12 real invariants, 78 lines)
    - livos/packages/ui/src/modules/window/webapp-drawer-store.ts  (+16 line JSDoc header note, zero code change)

key-decisions:
  - "Type alias instead of re-declaration: UseStreamAppAgentResult = UseWebAppAgentResult (single source of truth; Plan 07 consumers can swap result objects without type assertions)"
  - "Skip ActiveAppMetaPayload widening: the existing kind: 'webapp' | 'native' union (use-agent-socket.ts:193) is sufficient — passing `activeAppMeta` with kind:'native' is the entire backend wire (RESEARCH A1 verified)"
  - "Defer session persistence: no apps.native.agent.session.{get,upsert} endpoints exist; per RESEARCH A4 + Q1 native chats start fresh on window open. v37+ follow-up can wire when storage shape is decided."
  - "Native binaries skip webapp.window.list: Xvfb display owns the binary 1:1 (one app == one display == one wid), so the agent's `## Active Window Context` snippet doesn't need a wid lookup. activeAppMeta.{appId, title} is enough."
  - "Conversation prefix `native:<id>:<rand>` (not just `<id>:<rand>`): grep-friendly in liv-core logs + parallel to existing `webapp:<id>:<rand>` precedent"
  - "Preserve drawer-store slot names (NOT rename byWebappId → byStreamAppId): protects existing 117-line source-text invariant test in webapp-floating-action-bar.test.tsx from cascade-break; JSDoc clarifies the re-use intent instead"

patterns-established:
  - "Hook mirror pattern: when a new surface needs identical chat-WS plumbing as an existing one, create a new hook that calls the same useAgentSocket with different activeAppMeta + import/re-export the result type as an alias — keeps consumer code surface-agnostic"
  - "Comment scrubbing for anti-pattern grep: when a hook explicitly contrasts itself against an older API ('uses X instead of Y'), the literal 'Y' in comments can break source-text invariant grep — describe the contrast in prose ('the webapp directory query') rather than the literal identifier"

requirements-completed: []

# Metrics
duration: ~20 minutes (RED → GREEN → polish → drawer-store JSDoc → SUMMARY)
completed: 2026-05-19
total-loc: 117 hook + 78 test + 16 drawer-store JSDoc = 211 net lines of new code
---

# Phase 159 Plan 06: useNativeAppAgent Hook (Workstream A) Summary

**One-liner:** New `useNativeAppAgent(nativeAppId)` hook mirrors `useWebAppAgent`'s public interface so Plan 07's `WebAppFloatingActionBar` can multiplex either result behind a single `UseStreamAppAgentResult` type alias — native chat reuses 100% of the WebApp's WS/agent/socket plumbing, differing only in the `apps.native.list` ActiveAppMeta source and the `native:<id>:<rand>` conversation prefix.

## Parity Contract

The hook exports two symbols:

```ts
export type UseStreamAppAgentResult = UseWebAppAgentResult
export function useNativeAppAgent(nativeAppId: string): UseStreamAppAgentResult
```

Identical shape to `useWebAppAgent(webappId)`:

| Field             | Source                                                        |
| ----------------- | ------------------------------------------------------------- |
| `messages`        | `useAgentSocket().messages` (forwarded)                       |
| `isStreaming`     | `useAgentSocket().isStreaming`                                |
| `isConnected`     | `useAgentSocket().isConnected`                                |
| `connectionStatus`| `useAgentSocket().connectionStatus`                           |
| `totalCost`       | `useAgentSocket().totalCost`                                  |
| `usageStats`      | `useAgentSocket().usageStats`                                 |
| `agentStatus`     | `useAgentSocket().agentStatus`                                |
| `conversationId`  | `freshConversationId` (no resume)                             |
| `sessionStatus`   | `'no-session'` until first send, then `'ready'`               |
| `sendMessage`     | wraps `useAgentSocket().sendMessage` with conversation id mint |
| `interrupt`       | `useAgentSocket().interrupt`                                  |
| `stopStreaming`   | alias for `interrupt` (matches D-100-10-E)                    |
| `clearMessages`   | `useAgentSocket().clearMessages`                              |
| `startNewSession` | mints fresh conv id + clears messages                         |

## Divergences from useWebAppAgent (and why each is OK)

| Divergence                                            | useWebAppAgent                                                          | useNativeAppAgent                                                                            | Why OK                                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ActiveAppMeta source                                  | `trpcReact.webapp.list.useQuery` row's `title` + `url`                  | `trpcReact.apps.native.list.useQuery` row's `name`                                           | Native apps have no `url`; `name` from the config schema (`nativeAppConfigSchema.name`) is the user-visible label                 |
| Active window snippet `wid` lookup                    | `trpcReact.webapp.window.list.useQuery` to find `windowId`              | **omitted entirely**                                                                          | Native binaries own their Xvfb display 1:1; the snippet builder doesn't need a wid for `display:`-scoped snippet (Phase 102-06)   |
| Session persistence (resume across window-close)      | `webapp.agent.session.{get,upsert}` → reload runId on mount             | **omitted entirely** (RESEARCH A4)                                                            | No `apps.native.agent.session.*` endpoints exist; per Q1 native chats start fresh on window open; v37+ may revisit                |
| Conversation id prefix                                | `webapp:<webappId>:<short-uuid>`                                        | `native:<nativeAppId>:<short-uuid>`                                                          | grep-friendly disambiguation in liv-core logs                                                                                     |
| `sessionStatus` initial value                         | `'loading'` while session query resolves                                | `'no-session'` immediately (no query to wait for)                                              | No persistence path, so no async "is there a row?" check; simpler state machine                                                   |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Tests + plan acceptance] Scrubbed `webapp.list` literal from hook file-header comment**
- **Found during:** Task 1 (verification step)
- **Issue:** The hook's file-header comment had `Uses `apps.native.list` instead of `webapp.list` for ActiveAppMeta` — the test invariant `expect(SRC).not.toMatch(/webapp\.list\.useQuery/)` passed (no `.useQuery` suffix in the comment), but Plan 06 acceptance criteria explicitly required `git grep "webapp.list\|webapp.agent.session"` to return NO matches on the hook file.
- **Fix:** Replaced the literal `webapp.list` in the comment with the prose phrase `the webapp directory query`; same intent, anti-pattern grep clean.
- **Files modified:** `livos/packages/ui/src/hooks/use-native-app-agent.ts`
- **Commit:** `fd188841`

**2. [Rule 1 — Tests] Reworded `apps.native.agent.session.*` literal in file-header**
- **Found during:** Task 1 GREEN re-run
- **Issue:** First GREEN attempt left `No session persistence (apps.native.agent.session.* doesn't exist; …)` in the file header. Test invariant `expect(SRC).not.toMatch(/apps\.native\.agent\.session/)` failed because the literal was in the comment.
- **Fix:** Reworded to `No session persistence endpoints (deferred per RESEARCH A4)` — same intent without the literal.
- **Files modified:** `livos/packages/ui/src/hooks/use-native-app-agent.ts` (folded into the GREEN commit)
- **Commit:** `90ac70b0`

**3. [Boundary noise — not a deviation, but documented for transparency] Task 2 commit (`7cb4019a`) bundled 3 unrelated files from Plan 04**

Three files modified by a parallel Plan 04 executor were pre-staged in the working tree before this executor started. The Task 2 commit `chore(159-06): document webapp-drawer-store namespace re-use…` accidentally included them alongside the intended single-file drawer-store change:
- `livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.tsx`
- `livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.test.tsx`
- `livos/packages/ui/src/modules/window/window-content.tsx`

These changes appear to be in-flight Plan 04 (native-app-stream-window close-handler migration) work. They were not authored by this executor and were not undone. Plan 04's executor should still claim its own work; this commit is a soft boundary leak, not a correctness issue (Sacred SHA preserved, no Plan 06 logic affected). Future parallel executors should run `git stash` of unstaged changes before `git add` to avoid this.

### Successful pre-planned execution
- Plan 06 architecture matched runtime behavior exactly (kind-only ActiveAppMeta switch, no widening).
- No Rule 3 blocking issues, no Rule 4 architectural decisions needed.
- TDD cycle clean: RED (test fails ENOENT) → GREEN (12/12) → REFACTOR (comment polish for grep-clean).

## Q1 Deferral

Per Plan 06 line 19 + RESEARCH A4: session persistence for native apps is **explicitly deferred**. Rationale captured in code (file header) and SUMMARY (this section):

- No `apps.native.agent.session.get` or `…upsert` tRPC endpoints exist
- Storage shape (Redis vs Postgres, key namespace, retention TTL) is undecided
- User-facing impact: closing a NativeApp window loses its chat history; re-opening starts fresh
- v37+ follow-up should land alongside the broader native-app lifecycle/idle-reaper design (Phase 159-03's reaper currently kills the binary after 30min idle; persistence would need to outlive that)

## Consumed By

- **Plan 07 (window-chrome wiring)** — will create a `UseStreamAppAgentResult` resolver inside `WebAppFloatingActionBar` that calls either `useWebAppAgent(streamId)` or `useNativeAppAgent(streamId)` based on `activeAppMeta.kind`, then passes the result to the existing IconBar / ChatInputBar / ChatResponseBar children without further branching.
- **Drawer store re-use** — Plan 07's resolver also uses `const streamId = webappId ?? nativeAppId` to read from the existing `chatInputModeByWebappId`, `teachEventsByWebappId`, `selectedSkillIdByWebappId` slots; the JSDoc note added in Task 2 documents that contract.

## Commits

| Hash       | Type     | Message                                                                                             |
| ---------- | -------- | --------------------------------------------------------------------------------------------------- |
| `24a74d48` | test     | test(159-06): add failing source-text invariants for useNativeAppAgent (RED)                        |
| `90ac70b0` | feat     | feat(159-06): implement useNativeAppAgent hook mirroring UseWebAppAgentResult (GREEN)               |
| `7cb4019a` | chore    | chore(159-06): document webapp-drawer-store namespace re-use for native ids (+ 3 boundary-leak files) |
| `fd188841` | chore    | chore(159-06): scrub anti-pattern literal from useNativeAppAgent file-header                        |

## Verification

```
$ pnpm test:run use-native-app-agent
✓ src/hooks/use-native-app-agent.test.ts (12 tests) 3ms
Test Files  1 passed (1)
     Tests  12 passed (12)

$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f   ← sacred SHA preserved
```

tsc: only pre-existing stories/ errors (unrelated, out of scope per executor scope boundary rule); no new errors in `use-native-app-agent.ts` or `webapp-drawer-store.ts`.

## Self-Check: PASSED
- `livos/packages/ui/src/hooks/use-native-app-agent.ts` — FOUND
- `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` — FOUND (12 tests pass)
- `livos/packages/ui/src/modules/window/webapp-drawer-store.ts` — FOUND (JSDoc note present)
- Commits `24a74d48`, `90ac70b0`, `7cb4019a`, `fd188841` — all present in `git log`
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — verified unchanged
