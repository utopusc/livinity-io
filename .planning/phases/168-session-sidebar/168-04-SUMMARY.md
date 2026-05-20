---
phase: 168
plan: 168-04
subsystem: cc-pty cross-tab pub/sub
status: code-complete
date-completed: 2026-05-19
commit: ba945a12
files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/cc-pty/manager.ts (additive ATTACH_CHANNEL + redis field + handleAttachIds + publish hooks)
    - livos/packages/livinityd/source/modules/cc-pty/manager.test.ts (+5 assertions)
    - livos/packages/livinityd/source/modules/server/trpc/cc-pty-router.ts (+subscribeAttachStatus procedure)
    - livos/packages/livinityd/source/modules/server/trpc/cc-pty-router.test.ts (+6 source-text invariants)
    - livos/packages/ui/src/features/cc-sessions/SessionSidebar.tsx (tabAttachIdRef + activeAttachers + useSubscription)
    - livos/packages/ui/src/features/cc-sessions/SessionSidebar.test.tsx (+4 B1-B4 assertions + crypto.randomUUID pin)
acceptance:
  vitest:
    manager: "23/23 PASS (14 baseline + 4 from 168-01 + 5 new from 168-04)"
    router: "28/28 PASS (11 168-01 source-text + 11 168-01 runtime + 6 168-04 source-text invariants)"
    sidebar: "17/17 PASS (10 168-02 behavior + 3 168-02 source-text + 4 168-04 B1-B4)"
    cumulative: "68/68"
  tsc:
    livinityd: "0 NEW errors in cc-pty/manager.ts + cc-pty-router.ts"
    ui: "0 NEW errors in cc-sessions/SessionSidebar.tsx + SessionSidebar.test.tsx"
  grep-invariants:
    - "liv:cc-pty:attached in livinityd modules: 3+ hits (manager constant + 3 publishes + router constant)"
    - "handleAttachIds in manager.ts: 4+ hits (declaration + set + 2 removes + killSession read)"
    - "tabAttachIdRef in SessionSidebar.tsx: 2 hits (declaration + comparison)"
    - "subscribeAttachStatus in router: 1 procedure declaration"
    - "PII review: pub/sub payload schema = {sessionId, attachId, attachedAt, action} only (no content/userId)"
sacred-guards-verified:
  - "Sacred SHA f3538e1d preserved"
  - "All Phase 162-165 server modules: byte-identical"
  - "Phase 166 cc-pty/{types,session-store,ws-handler,idle-reaper}.ts: byte-identical (manager.ts: ONLY additive 168-04 instrumentation on top of 168-01 additive)"
  - "Phase 167 features/cc-terminal/*: byte-identical"
  - "Phase 169 vault-graph/*: byte-identical"
---

# Phase 168 Plan 168-04: Cross-Tab Attach Indicator Summary

Cross-tab/cross-device "attached elsewhere" indicator implemented via Redis pub/sub on a single channel `liv:cc-pty:attached`. Each attach publishes a metadata-only envelope; a tRPC subscription forwards it to subscribed browser tabs (with per-user filtering); the SessionSidebar tracks `activeAttachers` and renders a yellow dot on SessionItems being attached by another tab. PII-free payload schema enforced via hard-coded server publish + shape-check on emit.

## Summary

- **`manager.ts` (MOD)** — additive instrumentation, zero existing behavior changed:
  - `ATTACH_CHANNEL = 'liv:cc-pty:attached'` module constant
  - `private redis: Redis` field wired from `opts.redis` (no caller-site change needed — `livinityd/source/index.ts` already passes `redis: this.ai.redis`)
  - `private handleAttachIds = new Map<string, string[]>()` parallel to `attachedTerminals` (so killSession knows the attachIds before tmux kill-session EOFs the node-pty handles)
  - `attachSession(sessionId, onStdout, opts?: {attachId?})` returns `{stdin, resize, detach, attachId}`. attachId is caller-provided or server-generated uuid v4. publishes `{sessionId, attachId, attachedAt, action: 'attached'}` after spawn.
  - returned `detach()` publishes the matching detach + removes attachId from `handleAttachIds`.
  - `killSession` publishes detach for each active attacher in `handleAttachIds` BEFORE killing tmux (race-defensive: tmux kill EOFs the per-handle detach hooks in parallel and ordering across processes is not guaranteed).
  - All publishes are best-effort: `.catch(err => logger.error(...))` — Redis outage MUST NOT break attach/detach.

- **`cc-pty-router.ts` (MOD)** — single new procedure:
  - `subscribeAttachStatus: adminProcedure.subscription((ctx) => observable<{...4 fields...}>(emit => {...}))`
  - Uses `ctx.livinityd.ai.redis.duplicate()` (ioredis subscribe-mode connections can't run normal commands)
  - `onMessage` shape-checks the payload (sessionId/attachId/attachedAt + action ∈ {attached, detached}); malformed silently dropped.
  - **userId scoping overlay**: `onMessage` calls `ccPtyManager.getSession(sessionId)` and suppresses `emit.next(parsed)` if `session.userId !== ctx.currentUser.id`. Defense-in-depth for v36+ multi-user even though single-user is the current shape (T-168-04-03).
  - Teardown function: `sub.off('message', onMessage) + sub.unsubscribe(ATTACH_CHANNEL) + sub.quit()`.

- **`SessionSidebar.tsx` (MOD)** — sidebar gains cross-tab tracking:
  - `tabAttachIdRef = useRef<string>(crypto.randomUUID() ?? fallback)` — per-mount stable id; used by `attachedElsewhere` comparison.
  - `activeAttachers = useState<Map<sessionId, Set<attachId>>>(new Map())` — populated by subscription onData.
  - `trpcReact.ccPty.subscribeAttachStatus.useSubscription` mutates the map on every `attached`/`detached` event.
  - SessionItem render computes `attachedElsewhere = any attachId !== tabAttachIdRef.current` for each session row.

## Acceptance Evidence

- **manager.test.ts**: 23/23 PASS (14 baseline + 4 from 168-01 + 5 new from 168-04)
- **cc-pty-router.test.ts**: 28/28 PASS (11 168-01 source-text + 11 168-01 runtime + 6 168-04 source-text invariants S9-S14)
- **SessionSidebar.test.tsx**: 17/17 PASS (10 168-02 behavior + 3 168-02 source-text + 4 168-04 B1-B4)
- **vitest cumulative**: 68/68 GREEN
- **tsc**: 0 NEW errors in any modified file
- **Pub/sub payload review**: all `publish` call sites in `manager.ts` and the shape-check in `cc-pty-router.ts` hard-code the 4 fields `{sessionId, attachId, attachedAt, action}` — no spread, no userId, no session content.

## Threat Mitigations Realized

| Threat ID | Mitigation | Asserted by |
|-----------|------------|-------------|
| T-168-04-01 (attachId spoofing) | accepted — attachId is self-id only, never used for authz | documented |
| T-168-04-02 (PII via channel) | hard-coded 4-field schema in publish + shape-check on emit | Assertion 21/22/23 + S12 + payload review |
| T-168-04-03 (cross-user emit leak) | `getSession + userId !== ctx.currentUser.id` suppress | Source-text invariant S13 |
| T-168-04-04 (channel namespace collision) | `liv:cc-pty:` prefix (consistent with Phase 65-03) | grep shows no prior collision |
| T-168-04-05 (DoS publish storm) | accepted — bounded by maxSessions=10 × handful attachers/sec | documented |
| T-168-04-06 (Repudiation on detach) | accepted — server killSession + manager log line still happen | manager.ts:243 unchanged |
| T-168-04-07 (Malformed JSON DoS) | try/catch + shape-check; silently drops | S12 + S9 (declaration) |
| T-168-04-08 (existence-leak timing) | userId scoping (T-168-04-03 mitigation) + same data already in list query | documented |
| T-168-04-09 (Redis subscriber leak) | observable teardown: off + unsubscribe + quit (3 calls) | S14 |

## v36 Multi-Tenant Readiness Note

The `cc-pty-router.subscribeAttachStatus` already applies the userId-filter overlay even though single-user is the v35 shape. When v36 multi-user lands the existing forward-only-if-owner gate is the correct semantics — no schema change needed. (If we wanted to break out per-user channels for performance, that would be a v36 follow-up; in the meantime one channel + per-subscription filter scales fine for the maxSessions=10 cap.)

## Sacred-Guard Byte-Identity Proof

`git diff --stat HEAD~1` lists exactly 6 files (3 server + 3 UI), all additive. The Phase 166 cc-pty/types.ts, session-store.ts, ws-handler.ts, idle-reaper.ts: byte-identical. Phase 167 features/cc-terminal/*: byte-identical. Phase 169 vault-graph/* (server + client): byte-identical. Phase 168-02 SessionItem.tsx + NewSessionButton.tsx + index.ts: byte-identical (the `attachedElsewhere` prop was already declared on SessionItem in 168-02; this plan only WIRES the prop population in SessionSidebar).

## Real-Pub/Sub Round-Trip Deferred to Phase 170

Vitest stubs `ioredis.publish` and `ioredis.duplicate().subscribe`. End-to-end "two browser tabs see each other's badges within ~1s" verification requires the real Mini PC stack (Redis + livinityd WSS + Chromium DevTools MCP). That validation is part of Phase 170 UAT.

## Self-Check: PASSED

- Files modified: ✓ 6 (3 livinityd + 3 ui)
- Commit exists: ✓ `ba945a12`
- 68/68 vitest GREEN ✓
- 0 NEW tsc errors ✓
- Sacred-guard byte-identity ✓
- PII review ✓ (4-field schema enforced at publish + emit)
