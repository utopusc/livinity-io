# Phase 161: Computer-Use SDK Path Wiring — Context

**Gathered:** 2026-05-19
**Status:** Ready for planning
**Source:** ROADMAP Phase 161 entry (PRD-level) + Phase 160-06 carry-forward findings

<domain>
## Phase Boundary

Phase 160 added four backend pieces to the broker path (api.livinity.io external clients — Bolt.diy, Cline, custom Luse harnesses):

| Plan 160 | Backend addition | Wired-in path |
|----------|------------------|---------------|
| 160-01 | Haiku routing (`tier: 'haiku'` override when `X-Livinity-Computer-Use: true`) | Broker router → `createSdkAgentRunnerForUser({mode: 'computer-use'})` |
| 160-02 | LivOS overlay composer (`buildLuseSystemPromptWithOverlayResolved`) | Available in `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` but **NOT INVOKED** anywhere on the SDK subscription path |
| 160-03 | LivOS app resolver (`defaultLivosAppResolver`) | Function exists in `livos/packages/livinityd/source/modules/computer-use/native/window.ts` but **NOT CONSTRUCTED** at MCP server registration |
| 160-04 | Dynamic display size (`readActualDisplaySize` via xdpyinfo) | Already injected by Plan 160-02 composer — surfaces correctly **IF** 160-02 is invoked |
| 160-05 | Sandbox path-allowlist enforcement | ✅ **Wiring-free** — works directly through tools.ts `isPathAllowed`; no changes needed |

Phase 160 operator UAT (2026-05-19 journal walk) confirmed: every NativeApp Chat turn still hit `claude-sonnet-4-6` because Phase 160-01's `forceComputerUseModel` lives at the **broker** router layer, which the **SDK subscription path** (`AgentSessionManager → @anthropic-ai/claude-agent-sdk → api.anthropic.com`) bypasses entirely.

**Phase 161 = wire the four additions onto the SDK subscription path that LivOS UI actually uses.** Broker path stays untouched (no regression for external clients).

</domain>

<decisions>
## Implementation Decisions

### D-161-A — Detect computer-use sessions via **conversationId prefix** (`native:` / `webapp:`)

**Why:** The prefix convention already exists and is emitted by:
- `livos/packages/ui/src/hooks/use-native-app-agent.ts:33-39` → `native:<nativeAppId>:<short-uuid>`
- `livos/packages/ui/src/hooks/use-webapp-agent.ts` → `webapp:<id>:...`

Re-using the existing signal means **161-04 is largely a no-op** — the hint is already on the wire. NO new `mode` field needed in `ClientWsMessage`.

**Detection rule:** Inside `AgentSessionManager.consumeAndRelay()`, treat a session as computer-use iff `session.conversationId?.startsWith('native:')` OR `session.conversationId?.startsWith('webapp:')`. Anything else (or no conversationId) is plain chat → preserve current behavior verbatim.

**Trade-off:** A regular chat session that somehow gets a `native:` convId would be force-routed to Haiku. This is fine: Native/WebApp surfaces are dedicated computer-use surfaces by construction. There is no LivOS UI path that opens a chat-only session under a `native:` / `webapp:` convId.

### D-161-B — Haiku routing via `AgentSessionManager` tier override (no separate `forceComputerUseModel` helper)

When the session detects as computer-use (D-161-A):
- Override `tier = 'haiku'` BEFORE the existing `tierToModel(tier)` call at `liv/packages/core/src/agent-session.ts:320` and `:589/:683/:698`.
- Pass `model: 'claude-haiku-4-5-20251001'` (dated literal) explicitly at line 698 via SDK `query()` options. **DO NOT use `tierToModel('haiku')`** — that helper returns un-dated `'claude-haiku-4-5'`, which mismatches Plan 160-01's broker contract literal. Override the model field at the SDK call site directly when `isComputerUseSession`.

**Why not reuse Phase 160's `forceComputerUseModel`?** That helper lives at the broker layer (`livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts`). The SDK subscription path doesn't traverse that factory. Reimplementing the override inline is cleaner than extracting a shared helper (which would create a livinityd ↔ liv/core dependency cycle).

### D-161-C — System prompt composer injected via **dependency injection** to preserve module boundary

`@liv/core` cannot import from `livos/packages/livinityd/*` (DAG direction: livinityd consumes @liv/core, never reverse). But `buildLuseSystemPromptWithOverlayResolved` lives in livinityd.

**Solution:** Add to `AgentSessionManagerOptions` a new optional field:
```ts
computerUseSystemPromptBuilder?: () => Promise<string>
```

Livinityd's `ws-agent.ts:177` constructs the manager and provides this callback, which closes over the imported `buildLuseSystemPromptWithOverlayResolved`. When the callback is unset (tests, legacy callers), behavior is identical to pre-161 — the chat path uses `composeSystemPrompt(BASE_SYSTEM_PROMPT, ...)` verbatim.

**Selector logic in `consumeAndRelay`:**
```
if (isComputerUseSession && computerUseSystemPromptBuilder) {
    systemPrompt = await computerUseSystemPromptBuilder()
} else {
    systemPrompt = intentResult ? composeSystemPrompt(...) : BASE_SYSTEM_PROMPT
}
```

### D-161-D — `livosAppResolver` wired in `mcp/server.ts` via env-thread + HTTP fetch to livinityd

The MCP server runs as a **child process** spawned by livinityd's `McpClientManager`. It cannot share livinityd's in-memory tRPC context. Wire-up shape:

1. **Add env vars to `luse-mcp-config.ts` descriptor** (alongside existing `LUSE_USER_ID`, `LUSE_REDIS_URL`):
   - `LIVINITYD_API_URL` (HTTP base — `http://localhost:8080` for Mini PC; **NOT** `LIV_API_URL` — that name already means liv-core port 3200 per `ws-agent.ts:154`, would create port confusion)
   - `LIV_API_KEY` (livinityd API key from `/opt/livos/.env`; same key works for both liv-core and livinityd tRPC privateProcedure per A3 assumption — planner verifies)
   - `LUSE_USER_SLUG` (e.g., `bruce`; v1 hard-coded `'admin'` fallback matches `luse-mcp-config.ts:318` defaults)
   - `LUSE_DOMAIN_ROOT` (e.g., `livinity.io`)

2. **In `mcp/server.ts:main()`** — construct two closures around the existing fetch pattern (mirror `ws-agent.ts:160-172` IntentRouter fetch), then pass `defaultLivosAppResolver({listWebApps, listNativeApps, userSlug, domainRoot})` into `registerLuseTools({...existing, livosAppResolver})` at line 145.

3. **Endpoints to call** (already exist as tRPC procedures):
   - `apps.native.list` → `nativeAppsRouter.list` (`livos/packages/livinityd/source/modules/apps/native-routes.ts:151`)
   - `apps.webapps.list` → `webappRouter.list` (under `webappRouter` from `livos/packages/livinityd/source/modules/webapps/index.ts`)

Both procedures already exist; the MCP child just needs to hit them via HTTP tRPC (`/trpc/apps.native.list`, `/trpc/apps.webapps.list`) with the `X-Api-Key` header.

**Fall-through behavior:** When any env var is missing (legacy launches, host-display Luse without a user context), DO NOT construct the resolver — `registerLuseTools` is called WITHOUT `livosAppResolver`, behavior identical to pre-161 (APP_MAP path).

**Stderr IPC discipline:** The parent livinityd process consumes the MCP child's stderr to drive `windowManager.openWindow` based on lines matching `[luse-mcp] open_livos_app kind=... appId=... route=...`. New resolver-construction / HTTP-fetch failure logs in `mcp/server.ts` MUST use a distinct prefix like `[luse-mcp] resolver: ...` to avoid colliding with that IPC channel. Test invariant: no resolver log line matches `^\[luse-mcp\] open_livos_app`.

### D-161-E — `use-native-app-agent.ts` is a NEAR no-op

Per D-161-A, the conversationId prefix already carries the session-type hint. Phase 161-04 becomes **verification-only** — add a source-text invariant test confirming the `native:` prefix is emitted, and verify `use-webapp-agent.ts` similarly emits `webapp:`. No code changes to the hooks unless the verification surfaces a regression.

**If the UI hook turns out to NOT emit the prefix on every send (unlikely given existing tests):** add the emit verbatim. But the audit-first approach catches the case where the test passes and no code change is needed.

### D-161-F — Hard guardrails inherited from Phase 160 (NON-NEGOTIABLE)

- **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** for `liv/packages/core/src/sdk-agent-runner.ts` — UNCHANGED across every Phase 161 commit (pre-commit hook enforces).
- **D-09 verbatim invariant:** `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` bytes UNCHANGED.
- **D-NO-NEW-DEPS:** zero changes to any `package.json`.
- **Chat path untouched:** conversations without `native:` / `webapp:` convId prefix MUST exit with byte-identical `consumeAndRelay` behavior — SDK `model:`, `systemPrompt`, MCP injection all preserved verbatim. New regression test asserts this.
- **Subscription-only:** SDK continues to authenticate via `/root/.credentials.json` (BROKER_FORCE_ROOT_HOME). No raw `@anthropic-ai/sdk` API-key path opens.

### Claude's Discretion (implementation details)

- Exact location of the `isComputerUseSession` boolean derivation inside `consumeAndRelay` (close to existing `tier = ...` block at line 320).
- Naming of the new tier-override variable (`effectiveTier`, `resolvedTier`, etc.).
- Whether to log the override decision at info level (`AgentSessionManager: computer-use session detected, routing to Haiku`).
- Test file locations: prefer extending existing `agent-session.test.ts` over new files; new `mcp-server-resolver-wiring.test.ts` for D-161-D.
- HTTP timeout for the MCP child's apps fetch (suggest 5s mirroring the IntentRouter pattern).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 160 backend additions (must be wired, not re-implemented)
- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` — broker-layer Haiku routing template (lines around 160-01 commit `95d61ec6`)
- `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts:418` — `buildLuseSystemPromptWithOverlayResolved()` to invoke for D-161-C
- `livos/packages/livinityd/source/modules/computer-use/native/window.ts:467` — `defaultLivosAppResolver()` to construct for D-161-D
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:116` — `LuseToolsOptions.livosAppResolver` field to pass through
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:749` — call site where `livosAppResolver` fires

### SDK subscription path (modify in 161)
- `liv/packages/core/src/agent-session.ts` — `AgentSessionManager.consumeAndRelay()` (line 296), system prompt composition (lines 558-561), tier resolution (line 320), SDK `query()` call (lines 689-705)
- `liv/packages/core/src/agent-session.ts:236` — `AgentSessionManagerOptions` interface (add `computerUseSystemPromptBuilder?` here)
- `livos/packages/livinityd/source/modules/server/ws-agent.ts:177` — manager construction (inject the new option here)

### MCP wire-up (modify in 161-03)
- `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` — full file (168 lines, line 145 = `registerLuseTools` call site)
- `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` — descriptor `env` block (add `LIV_API_URL`, `LIV_API_KEY`, `LUSE_USER_SLUG`, `LUSE_DOMAIN_ROOT`)
- `livos/packages/livinityd/source/modules/apps/native-routes.ts:151` — `nativeAppsRouter.list` endpoint
- `livos/packages/livinityd/source/modules/webapps/index.ts` — `webappRouter.list` endpoint

### UI hook (verify in 161-04)
- `livos/packages/ui/src/hooks/use-native-app-agent.ts:33-39` — `makeFreshConversationId` (the `native:` prefix emit)
- `livos/packages/ui/src/hooks/use-agent-socket.ts:552-598` — WS `start` payload assembly (forwards `conversationId` to ws-agent.ts)
- `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` — existing invariant tests (likely already cover the prefix)

### Phase 160 SUMMARYs (background context)
- `.planning/phases/160-luse-livos-overlay-haiku-routing/160-01-SUMMARY.md` — broker Haiku routing detail
- `.planning/phases/160-luse-livos-overlay-haiku-routing/160-02-SUMMARY.md` — LivOS overlay composer detail
- `.planning/phases/160-luse-livos-overlay-haiku-routing/160-03-SUMMARY.md` — defaultLivosAppResolver source-tree placement
- `.planning/phases/160-luse-livos-overlay-haiku-routing/160-06-SUMMARY.md` — UAT closure + Phase 161 carry-forward queue
- `.planning/phases/160-luse-livos-overlay-haiku-routing/160-VERIFICATION.md` — operator UAT checklist (10 steps) to re-walk in Phase 161 verify

### Project memory (do not violate)
- `feedback_subscription_only.md` — subscription path is sacred; no BYOK fallback
- `reference_anthropic_subscription_state.md` — Mini PC uses `/root` creds via `BROKER_FORCE_ROOT_HOME`
- `feedback_p65_rename_complete.md` — sacred SHA constraint (current value `f3538e1d811992b782a9bb057d1b7f0a0189f95f`)

</canonical_refs>

<specifics>
## Specific Targets

### Files modified (4 patches map to these surfaces)

| Patch | File(s) | Lines (approx) |
|-------|---------|----------------|
| 161-01 | `liv/packages/core/src/agent-session.ts` | +30 lines (detection + tier override + tests) |
| 161-02 | `liv/packages/core/src/agent-session.ts`, `livos/packages/livinityd/source/modules/server/ws-agent.ts` | +20 lines option, +5 lines wire-up, +tests |
| 161-03 | `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts`, `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` | +40 lines server + descriptor env + tests |
| 161-04 | `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` (verification only) | +15 lines invariant test (no code if existing tests already lock the prefix) |

### Test contract (per Phase 160 precedent)

Each plan ships:
1. Source-text invariants (grep-verifiable assertions on file contents)
2. Runtime behavior tests (vitest/tsx unit) for the detection + override
3. A "chat path untouched" regression test for plans 161-01 and 161-02

### UAT criteria (re-walk Phase 160's 10-step checklist with these new pass conditions)

- **Step 5** (NativeApp LibreOffice Chat) — `journalctl -u livos | grep AgentSessionManager` shows `model: 'claude-haiku-4-5-20251001'` (was sonnet-4-6 pre-161)
- **Step 6** (`journalctl | grep "LIVOS CONTEXT"`) — overlay text visible (was missing pre-161 because composer never invoked)
- **Step 7** (`open n8n`) — opens window at `n8n-bruce.livinity.io` (DASH pattern, not dot) — driven by D-161-D resolver wiring
- **Step 9** (`grep DISPLAY:`) — shows real `1920x1080` or `1280x720` from xdpyinfo (was hardcoded `1280x960` pre-161)
- **Step 8** (sandbox reject `/etc/passwd`) — already PASSes from Phase 160-05 (sanity re-check, no regression)

</specifics>

<deferred>
## Deferred Ideas

- **`forceComputerUseModel` helper extraction** — could consolidate broker (Phase 160-01) + SDK path (Phase 161-01) overrides into one shared helper. Deferred to a future housekeeping plan; the inline duplication is 5 lines per site and crosses a module boundary that's not worth dissolving for 5 lines.
- **MCP child → livinityd HTTP fetch caching** — the apps list could be cached in the MCP child's process memory for the session duration to avoid HTTP per `computer_application` call. Not worth the cache invalidation complexity for v1; tRPC + fetch should be sub-50ms on localhost.
- **`mode: 'computer-use'` ClientWsMessage field** — explicit mode flag was an alternative to conversationId-prefix detection. Deferred because the prefix already exists and adding a field is more surface area to maintain. If a future surface needs computer-use semantics without the prefix (unlikely), revisit.
- **mcp/tools.test.ts +8 tsc typing nuance errors** (Phase 160 carry-forward #1) — runtime PASS 65/65 holds; cosmetic typing on vitest mock fn parameters. Out of Phase 161 scope per scope-boundary rule.
- **luse-mcp-config.test.ts T4/T5/T6 LUSE_REDIS_URL drift** (Phase 160 carry-forward #2) — pre-existing test expectation drift from Phase 100-10-04. Out of Phase 161 scope.

</deferred>

---

*Phase: 161-computer-use-sdk-path-wiring*
*Context gathered: 2026-05-19 via ROADMAP entry + Phase 160 carry-forward audit*
*Approach: autonomous (no discuss-phase, scope was locked in ROADMAP)*
