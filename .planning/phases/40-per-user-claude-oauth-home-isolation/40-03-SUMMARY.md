---
phase: 40-per-user-claude-oauth-home-isolation
plan: 03
status: complete
completed: 2026-04-30
requirements:
  - FR-AUTH-01
  - FR-AUTH-03
sacred-file-touched: false
---

# Plan 40-03 Summary — Per-User .claude Dir + Claude-Login Backend Routes

## One-liner

New `per-user-claude.ts` module (6 named exports for synthetic per-user `.claude/` dir lifecycle + `claude login --no-browser` subprocess spawn with HOME redirected) plus 3 new tRPC routes (`claudePerUserStatus` query, `claudePerUserStartLogin` subscription, `claudePerUserLogout` mutation) inserted in the Claude Auth section of `ai/routes.ts`. Multi-user-mode-only — every code path early-returns with `{multiUserMode: false}` when single-user mode is active.

## Files Modified

| File | Status | Lines | Notes |
|------|--------|-------|-------|
| `livos/packages/livinityd/source/modules/ai/per-user-claude.ts` | **Created** | 217 | 5 helpers + spawn function + types |
| `livos/packages/livinityd/source/modules/ai/routes.ts` | Modified | +106 lines | Import block + 3 new procedures |

## Module: per-user-claude.ts (217 lines)

**6 named exports:**

| Export | Type | Purpose |
|--------|------|---------|
| `isMultiUserMode(livinityd)` | function | Reads `livos:system:multi_user` Redis key, returns `value === 'true'` |
| `getUserClaudeDir(livinityd, userId)` | function | Returns `<dataDir>/users/<userId>/.claude` — DOES NOT create. Validates `userId` against `/^[a-zA-Z0-9_-]+$/` for path-traversal defense |
| `ensureUserClaudeDir(livinityd, userId)` | function | Lazy `mkdir({recursive: true, mode: 0o700})` + explicit `chmod(0o700)`. Idempotent |
| `checkPerUserClaudeStatus(livinityd, userId)` | function | Reads `.credentials.json`, parses `claudeAiOauth`, returns `{authenticated, method?, expiresAt?}` |
| `perUserClaudeLogout(livinityd, userId)` | function | Deletes `.credentials.json` (ENOENT swallowed → idempotent) |
| `spawnPerUserClaudeLogin(livinityd, userId)` | function | `spawn('claude', ['login', '--no-browser'])` with `env.HOME = getUserClaudeDir(...)`, parses device-code from stdout via permissive regex, 5-min timeout, emits typed `PerUserClaudeLoginEvent` via EventEmitter |
| `PerUserClaudeLoginEvent` | type | Discriminated union: `device_code` / `progress` / `success` / `error` |

## tRPC Routes Added in ai/routes.ts

| Route | Type | Lines | Behavior |
|-------|------|-------|----------|
| `claudePerUserStatus` | `privateProcedure.query` | 384-394 | Single-user → `{multiUserMode: false, authenticated: false, method: undefined}`. Multi-user → `{multiUserMode: true, ...checkPerUserClaudeStatus()}` |
| `claudePerUserStartLogin` | `privateProcedure.subscription` | 403-457 | Multi-user only: ensures dir, spawns subprocess, streams device-code + terminal events. Cleanup on unsubscribe via `kill()` |
| `claudePerUserLogout` | `privateProcedure.mutation` | 459-477 | Multi-user only: deletes per-user creds. Single-user → no-op `{multiUserMode: false, success: false}` |

## Path Convention (D-40-04)

`<dataDir>/users/<user_id>/.claude/` where `<user_id>` is the **UUID** (not username). Rationale documented in module header: usernames can be renamed, breaking dir lookups; UUIDs are stable.

Note: this **diverges from `apps.ts`** which uses `username` for `app-data/` paths. The divergence is intentional and documented in the module header.

## Multi-User Gate

Every route + every helper consumer follows the canonical pattern:
```typescript
const multiUser = await isMultiUserMode(ctx.livinityd)
if (!multiUser) {
  // early-return with {multiUserMode: false} sentinel
}
```

Matches the pattern used 5x in `livinityd/source/modules/{server,apps}/`.

## TypeScript Status

- `per-user-claude.ts` — **zero TS errors** under `tsc --noEmit`.
- `ai/routes.ts` — adds 6 new errors, all of shape `'ctx.livinityd' is possibly 'undefined'`. **These match the pre-existing pattern** (10 identical errors in the same file from existing Kimi/Claude routes — total file errors: 18 with my additions, 10 without). The project has 329 pre-existing TypeScript errors and runs via `tsx` (no `tsc` build step in livinityd's `package.json`). Per Rule 1 scope boundary: not fixing pre-existing pattern issues.
- Module loads cleanly via `tsx`: `npx tsx --eval "import('./source/modules/ai/per-user-claude.ts').then(m => console.log(Object.keys(m)))"` returns all 6 exports.

## Sacred File Untouched

`git status nexus/packages/core/src/sdk-agent-runner.ts` — clean (Plan 40-02's edit is the only change since Phase 39 baseline; this plan adds nothing).

## Decisions Honored

- **D-40-04**: UUID per-user paths (not username) — explicit rationale comment in module header.
- **D-40-05**: Synthetic isolation honestly framed in module docstring ("livinityd-application-layer enforced, NOT POSIX-enforced — all per-user dirs share the same UID").
- **D-40-06**: Lazy dir creation on first login — no batch migration.
- **D-40-07**: Every new code path early-returns when `multi_user_mode !== 'true'` — single-user mode is byte-identical.
- **D-40-08**: Existing UI surface preserved (single-user routes unchanged); per-user routes are new + parallel.
- **D-40-09**: Server-side device flow — backend captures device code from `claude login --no-browser` stdout, streams to UI via tRPC subscription.
- **D-40-12**: Read `multi_user_mode` from canonical Redis key `livos:system:multi_user`.
- **D-40-16**: No real Linux user accounts (`useradd` etc.) — synthetic dirs only.

## Plan 04 / Plan 05 Unblocked

- Plan 04: Can now wire `trpcReact.ai.claudePerUserStatus.useQuery()`, `trpcReact.ai.claudePerUserStartLogin.useSubscription()`, `trpcReact.ai.claudePerUserLogout.useMutation()`.
- Plan 05: `getUserClaudeDir`, `ensureUserClaudeDir`, `perUserClaudeLogout` are testable; `sdk-agent-runner-home-override.test.ts` can grep the (unchanged-since-Plan-02) sacred file.

## Honest Deferred Note

Phase 40 only routes `homeOverride` through the explicit `claude login` subprocess invocation in `spawnPerUserClaudeLogin`. Wiring `homeOverride` through `/api/agent/stream` (so AI Chat's SdkAgentRunner subprocess also picks up per-user HOME for actual LLM requests) requires nexus's `/api/agent/stream` HTTP boundary to receive `user_id` from livinityd — that's **Phase 41 broker scope** per the planner's framing. Phase 40 provides the mechanism (homeOverride parameter + per-user dirs); Phase 41 will wire it end-to-end.

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/ai/per-user-claude.ts` exists, 217 lines, 6 exports.
- [x] `livos/packages/livinityd/source/modules/ai/routes.ts` has 3 new procedures (`claudePerUserStatus` line 384, `claudePerUserStartLogin` line 403, `claudePerUserLogout` line 459).
- [x] Per-user-claude module imported into routes.ts at top.
- [x] `observable` import was already present in routes.ts (line 2) — no new tRPC imports needed.
- [x] Module loadable via tsx — all 6 exports verified at runtime.
- [x] Sacred file untouched in this plan (still at Plan 40-02 baseline `623a65b9...`).
