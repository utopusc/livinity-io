# Phase 39 Caller Audit — ClaudeProvider Reach Path Inventory

**Plan:** 39-01
**Generated:** 2026-04-29
**Purpose:** Read-only audit of every code path that reaches `ClaudeProvider.getClient()` (directly or transitively) so Plan 39-02 can delete the OAuth fallback without breaking a working caller.

**Scope:** `nexus/` and `livos/` source trees. The `.claude/worktrees/` directories are isolated workspace clones and are NOT in scope (they are not part of the production build).

---

## Section 1: Caller Inventory

| File:Line | Method called | Caller type | Reaches getClient()? | Auth-method-gated upstream? |
|-----------|---------------|-------------|----------------------|------------------------------|
| `nexus/packages/core/src/providers/claude.ts:132` | `this.getClient()` | direct (inside `chat()`) | YES — direct | NO |
| `nexus/packages/core/src/providers/claude.ts:190` | `self.getClient()` | direct (inside `chatStream()` generator) | YES — direct | NO |
| `nexus/packages/core/src/providers/manager.ts:30` | `new ClaudeProvider(redis)` | constructor (registration only) | NO — instantiation | N/A |
| `nexus/packages/core/src/providers/manager.ts:85` | `provider.chat(options)` (inside fallback loop) | via ProviderManager.chat | YES — transitive via claude.ts:132 | NO — only `isAvailable()` gates, and pre-Phase-39 it lies (returns true on creds-file existence) |
| `nexus/packages/core/src/providers/manager.ts:132` | `provider.chatStream(options)` (inside fallback loop) | via ProviderManager.chatStream | YES — transitive via claude.ts:190 | NO — same as above |
| `nexus/packages/core/src/providers/manager.ts:185` | `provider.think(options)` (inside fallback loop) | via ProviderManager.think | YES — transitive via claude.ts:274 → `this.chat()` → `getClient()` | NO — same as above |
| `nexus/packages/core/src/api.ts:532` | `provider.isAvailable()` (inside `/api/claude/status`) | via api.ts handler | NO — `isAvailable()` reads creds file directly with `existsSync`, not `getClient()` | N/A |
| `nexus/packages/core/src/api.ts:550` | `provider.startLogin()` (inside `/api/claude/start-login`) | via api.ts handler | NO | N/A |
| `nexus/packages/core/src/api.ts:574` | `provider.submitLoginCode(code)` (inside `/api/claude/submit-code`) | via api.ts handler | NO | N/A |
| `nexus/packages/core/src/api.ts:590` | `provider.logout()` (inside `/api/claude/logout`) | via api.ts handler | NO | N/A |

**Out-of-scope env-var sites (NOT routed through `ClaudeProvider.getClient()` — verified):**

| File:Line | Pattern | Why out of scope |
|-----------|---------|------------------|
| `nexus/packages/core/src/sdk-agent-runner.ts:270-273` | `process.env.ANTHROPIC_API_KEY` propagated to subprocess `safeEnv` | SACRED file. Forwards env to spawned `claude` CLI subprocess (the legitimate Agent SDK path). Does NOT touch `ClaudeProvider`. Untouched by Phase 39 (D-39-13). |
| `nexus/packages/core/src/agent-session.ts:462-463` | Same pattern, separate code path | Independent agent session env propagation. Not via `ClaudeProvider.getClient()`. Out of scope. |
| `nexus/packages/core/src/daemon.ts:315-317` | `hasApiKey = !!process.env.ANTHROPIC_API_KEY` | Daemon startup gate — checks env var existence, never instantiates `ClaudeProvider`. Out of scope. |
| `livos/setup.sh:186` | `ANTHROPIC_API_KEY=` (template variable) | Bash install template, not a runtime caller. Out of scope. |

**Direct grep confirmation of `authToken:` occurrences (in-scope paths only):**

```
nexus/packages/core/src/providers/claude.ts:94:  this.client = new Anthropic({ authToken: process.env.ANTHROPIC_AUTH_TOKEN });
nexus/packages/core/src/providers/claude.ts:110: this.client = new Anthropic({ authToken: token });
```

Both are inside the `getClient()` catch block — exactly the two lines Plan 39-02 will delete. Zero other `authToken:` occurrences anywhere else in `nexus/` or `livos/`.

**Direct grep confirmation of `.getClient(` occurrences:**

```
nexus/packages/core/src/providers/claude.ts:132: const client = await this.getClient();   // in chat()
nexus/packages/core/src/providers/claude.ts:190: const client = await self.getClient();   // in chatStream()
```

Only the two internal callers. No external code calls `getClient()` directly (it is `private`).

**Direct grep confirmation of `getProvider('claude')` occurrences (in-scope only):**

All four `nexus/packages/core/src/api.ts` handlers (lines 532, 550, 574, 590). Each only invokes `isAvailable()` / `startLogin()` / `submitLoginCode()` / `logout()`. None reach `getClient()`.

**`new ClaudeProvider` occurrences (in-scope only):**

Only `nexus/packages/core/src/providers/manager.ts:30` instantiates `ClaudeProvider`. No other production code creates a fresh instance.

**`providerManager.chat(...) / .chatStream(...) / .think(...)` direct callers:**

Zero matches via the literal pattern (`getProviderManager().chat`, etc.). The codebase uses these via the SdkAgentRunner-wrapped agent loop; ProviderManager is reached primarily via `brain.getProviderManager().getProvider('claude')` (the four api.ts handlers above) and via the legacy nexus agent loop (which is being supplanted by `SdkAgentRunner` per v20.0). Either way, the chat/chatStream/think paths still flow through `ProviderManager` if invoked, and the audit table above covers that.

---

## Section 2: Caller Classification

| Caller | Classification | Rationale |
|--------|----------------|-----------|
| `manager.ts:85` (`provider.chat`) | **could-be-subscription-needs-reroute** | Pre-Phase-39, `isAvailable()` returns true for OAuth-creds-only users → ProviderManager calls `provider.chat()` → reaches `getClient()` → pre-Phase-39 silently falls back to OAuth token. After Plan 39-02 deletion, this would throw `ClaudeAuthMethodMismatchError` if `isAvailable()` still returned true for OAuth-only users. |
| `manager.ts:132` (`provider.chatStream`) | **could-be-subscription-needs-reroute** | Same reasoning. |
| `manager.ts:185` (`provider.think`) | **could-be-subscription-needs-reroute** | Same reasoning (`think()` → `chat()` → `getClient()`). |
| `api.ts:532` (`isAvailable`) | **API-key-only-safe** | `isAvailable()` does NOT call `getClient()`. After Plan 39-02 prunes the creds-file branch from `isAvailable()`, this handler still functions — it just reports `false` for OAuth-only users (which is the new correct semantics). |
| `api.ts:550` (`startLogin`) | **API-key-only-safe** | Pure OAuth flow setup. Writes creds file. Never reads `getClient()`. |
| `api.ts:574` (`submitLoginCode`) | **API-key-only-safe** | Pure OAuth flow exchange. Writes creds file. Never reads `getClient()`. |
| `api.ts:590` (`logout`) | **API-key-only-safe** | Deletes creds file. Never reads `getClient()`. |

**Summary:**
- 3 callers classified as `could-be-subscription-needs-reroute` (all three ProviderManager fallback-loop entry points).
- 4 callers classified as `API-key-only-safe` (all four api.ts OAuth-flow handlers).
- All three reroute-needed callers share a single chokepoint: `ClaudeProvider.isAvailable()`. Fixing `isAvailable()` (Strategy A below) handles all three at once.

---

## Section 3: ProviderManager Fallback Behavior Post-Deletion

**Question:** When `ClaudeProvider.chat()` throws the new `ClaudeAuthMethodMismatchError` (introduced in Plan 39-02), what does `ProviderManager.chat()` (manager.ts:71) do?

**Answer (mechanical reading of manager.ts:200-211):**

`isFallbackableError(err)` checks:
- `err.status` ∈ {401, 403, 429, 502, 503, 529}
- `err.message?.toLowerCase()` includes any of: `timeout`, `econnreset`, `socket hang up`, `fetch failed`, `econnrefused`, `overloaded`

The new typed error `ClaudeAuthMethodMismatchError`:
- Has NO `status` property (not an HTTP error).
- Message is the verbatim D-39-05 string (lowercased starts with `"claudeprovider.getclient()..."`) — does NOT contain any of the fallback keywords.

Therefore: `isFallbackableError()` returns **false** → manager re-throws the error → caller of `ProviderManager.chat()` crashes loud (per D-39-06).

**This is the wrong behavior** for subscription-only users on a Kimi-primary deployment, where today their AI Chat works because ProviderManager skips ClaudeProvider when its `isAvailable()` returns false. We must NOT break that path.

**Chosen Strategy: A — gate at `isAvailable()`**

Modify `ClaudeProvider.isAvailable()` to NOT return true based on `~/.claude/.credentials.json` existence alone. Specifically: delete lines 293-302 (the entire `// 2. Check Claude credentials file` block including its surrounding `try { ... } catch {}`). After this:

- ProviderManager skips ClaudeProvider (`available === false`) when the user has only OAuth creds.
- The fallback chain naturally falls through to KimiProvider (existing behavior — Kimi remains the primary in the user's deployment per memory).
- `ClaudeAuthMethodMismatchError` is reserved for the genuinely unexpected misroute case (someone bypasses `isAvailable()` and calls `chat()` directly with an API-key-mode misconfiguration), where crashing loud (D-39-06) is the correct outcome.

**Rationale for picking Strategy A over Strategy B:**

Strategy B (mark `ClaudeAuthMethodMismatchError` as fallbackable inside `isFallbackableError()`) would:
- Silently swallow the explicit "subscription users must route through SdkAgentRunner" signal — defeats D-39-06.
- Require modifying `manager.ts` (broadens the change blast radius).
- Mask future bugs where a caller genuinely misroutes a request (a typed error becomes a silent skip).

Strategy A is preferred because:
- It modifies a single file (`claude.ts`) — smaller blast radius.
- It correctly distinguishes "this provider is not for you" (`isAvailable() === false`) from "you misrouted a request to me" (typed error).
- Preserves the existing chat experience for Kimi-primary subscription users with zero behavior change.
- Keeps `manager.ts` unchanged — sticks to the smallest possible edit footprint per CONTEXT.md "no incremental rollout" / one-shot change principle.

---

## Section 4: Reroute Spec for Plan 39-02

**Verbatim, copy-pasteable spec for the executor of Plan 39-02:**

### 1. `claude.ts` — typed error class definition

Insert AFTER the imports block (after line 25 `const execFileAsync = promisify(execFile);`) and BEFORE the `CLAUDE_MODELS` constant (before line 27):

```typescript
/**
 * Thrown by ClaudeProvider.getClient() when no explicit API key is configured.
 * Subscription users must route through SdkAgentRunner (sdk-subscription mode)
 * instead of calling ClaudeProvider.chat() / chatStream() / think() directly.
 *
 * Introduced in v29.3 Phase 39 (FR-RISK-01) — replaces the silent OAuth-token fallback.
 */
export class ClaudeAuthMethodMismatchError extends Error {
  constructor(
    message: string,
    public readonly mode: 'subscription-required' | 'no-credentials',
  ) {
    super(message);
    this.name = 'ClaudeAuthMethodMismatchError';
  }
}
```

### 2. `claude.ts:91-115` — `getClient()` catch block

DELETE the entire env-var-fallback block AND the entire OAuth-credentials-file block. Replace with: a one-line `logger.warn(...)` notice + a `throw new ClaudeAuthMethodMismatchError(...)`. The `mode` field is determined by reading `await this.getAuthMethod()` (which reads `nexus:config:claude_auth_method` from Redis): if `'sdk-subscription'`, mode = `'subscription-required'`; otherwise mode = `'no-credentials'`.

The exact error message text (verbatim D-39-05, single line, em-dash U+2014):

```
ClaudeProvider.getClient() requires an explicit Anthropic API key in Redis (nexus:config:anthropic_api_key) or env (ANTHROPIC_API_KEY). Subscription users must route through SdkAgentRunner (sdk-subscription mode) — see nexus/packages/core/src/sdk-agent-runner.ts. Direct OAuth-token fallback removed in v29.3 Phase 39 (FR-RISK-01).
```

The exact `logger.warn(...)` line:

```
'ClaudeProvider.getClient() invoked without API key — subscription users must use SdkAgentRunner (FR-RISK-01).'
```

### 3. `claude.ts:293-302` — `isAvailable()` OAuth-creds-file branch

DELETE the entire `// 2. Check Claude credentials file` block including its surrounding `try { ... } catch {}`. After deletion, `isAvailable()` checks (in order): (1) Redis API key, (2) `ANTHROPIC_API_KEY` env, (3) sdk-subscription mode + CLI installed+authenticated. The credentials-file-existence branch is gone — its presence pre-Phase-39 was a lie because `getClient()` couldn't actually serve a request from it post-deletion.

Renumber the surviving comments to (1), (2), (3) for clarity.

### 4. `manager.ts` — NO changes

Per Strategy A: `isAvailable()` returning false for OAuth-only users means `ProviderManager` skips `ClaudeProvider` in the fallback chain. The new typed error is reserved for misroute scenarios where crash-loud is the desired behavior (D-39-06).

### 5. `api.ts` — NO changes

The four callers (lines 532, 550, 574, 590) only invoke `isAvailable()` / `startLogin()` / `submitLoginCode()` / `logout()`, none of which transitively call `getClient()`. They are API-key-only-safe by inspection. After Plan 39-02:
- `isAvailable()` will return `false` instead of `true` for OAuth-only users — `/api/claude/status` will correctly report `authenticated: false` for users who have OAuth creds but no API key. This is the correct new semantics: subscription users authenticate via the CLI status path (still preserved as branch 3 in `isAvailable()`), not via the deleted creds-file branch.
- `startLogin()`, `submitLoginCode()`, `logout()` are pure OAuth flow management — unchanged.

### 6. `index.ts` — NO changes

Re-export only (line 4: `export { ClaudeProvider } from './claude.js';`). Optionally Plan 39-02 can also re-export `ClaudeAuthMethodMismatchError` for external consumers, but it is not strictly required (no caller currently imports it; the typed error is consumed via `instanceof` in tests only).

### 7. Out-of-scope (verified safe — do NOT modify)

- `nexus/packages/core/src/sdk-agent-runner.ts:270-273` — uses `process.env.ANTHROPIC_API_KEY` to forward to the Agent SDK subprocess. SACRED. Untouched (D-39-13).
- `nexus/packages/core/src/agent-session.ts:462-463` — same pattern, separate code path, not via `ClaudeProvider.getClient()`.
- `nexus/packages/core/src/daemon.ts:315-317` — same pattern, separate code path, not via `ClaudeProvider.getClient()`.
- `livos/setup.sh:186` — bash variable in install template; not a runtime caller.

---

## Section 5: Sacred File Baseline

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
2b3b005bf1594821be6353268ffbbdddea5f9a3a
```

**Baseline SHA (record this in Plan 39-02 verification AND Plan 39-03 `sdk-agent-runner-integrity.test.ts` `BASELINE_SHA` constant):**

```
2b3b005bf1594821be6353268ffbbdddea5f9a3a
```

Plan 39-02 Task 1 must re-run `git hash-object` and confirm a match before any edit. Plan 39-02 Task 6 must re-run after edits and confirm an unchanged match. Plan 39-03's integrity test must pin this exact SHA.

---

## Section 6: Carry-forwards (TODO(FR-RISK-01-followup))

**Empty — Strategy A handles all subscription-mode-reachable callers via the `isAvailable()` gate.**

No `TODO(FR-RISK-01-followup)` comments will be planted in source. No additions to `.planning/STATE.md` "Carry-forwards" section needed for caller-reroute reasons.

The only carry-forward (already known and out of Phase 39 scope) is the broader v29.3 milestone work — Phases 40-44 — which proceeds on its own track per the ROADMAP.

---

## Verification Status (read-only audit only)

- [x] All 7 grep patterns from Plan 39-01 Task 1 executed and recorded above.
- [x] `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` recorded: `2b3b005bf1594821be6353268ffbbdddea5f9a3a`.
- [x] `git status` shows no source-file modifications from this plan (only AUDIT.md was added).
- [x] All 6 sections present.
- [x] Caller classification table includes `manager.ts:85`, `manager.ts:132`, `manager.ts:185`, `api.ts:532`, `api.ts:550`, `api.ts:574`, `api.ts:590` (plus the two internal `claude.ts` self-callers and the registration site).
- [x] Reroute Spec contains the verbatim D-39-05 error message string.
- [x] Sacred file baseline SHA recorded in Section 5.
