---
phase: 39-risk-fix-close-oauth-fallback
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md
autonomous: true
requirements:
  - FR-RISK-01
tags:
  - risk-fix
  - oauth
  - claude

must_haves:
  truths:
    - "Every caller of ClaudeProvider.getClient(), ClaudeProvider.chat(), ClaudeProvider.chatStream(), and ClaudeProvider.think() across nexus/ and livos/ is enumerated with file path + line number."
    - "Each enumerated caller is classified as either 'API-key-only-safe' (caller is gated by authMethod or otherwise unreachable when claude_auth_method == sdk-subscription) or 'could-be-subscription-needs-reroute' (caller can fire when only OAuth creds exist, so post-deletion the call would throw and break a working flow)."
    - "ProviderManager's fallback behavior post-deletion is reasoned about explicitly — does isFallbackableError() catch the new ClaudeAuthMethodMismatchError, or does it propagate? AUDIT.md gives the answer."
    - "ClaudeProvider.isAvailable() current behavior (returns true if ~/.claude/.credentials.json exists, lines 293-302) is flagged as a lie-after-deletion: post-Phase-39 isAvailable() will return true but getClient() will throw. AUDIT.md proposes the exact isAvailable() change for Plan 39-02."
    - "Out-of-scope env-var users (sdk-agent-runner.ts:272, agent-session.ts:462, daemon.ts:315) are listed as 'verified-not-routed-through-getClient' so the next plan does not waste cycles on them."
  artifacts:
    - path: ".planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md"
      provides: "Complete caller classification table + reroute spec for Plan 39-02"
      contains: "Caller Classification"
  key_links:
    - from: ".planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md"
      to: ".planning/phases/39-risk-fix-close-oauth-fallback/39-02-delete-fallbacks-and-reroute.md"
      via: "Reroute Spec section feeds Plan 39-02 task actions verbatim"
      pattern: "Reroute Spec"
---

<objective>
Produce an exhaustive, evidence-backed audit of every code path that reaches `ClaudeProvider.getClient()` (directly or transitively via `chat()`/`chatStream()`/`think()`/`isAvailable()`) so Plan 39-02 can delete the OAuth fallback without breaking a working caller.

Purpose: The deletion of `claude.ts:91-115` is mechanical. The risk is in the callers — specifically, any caller that today silently relies on the OAuth-credentials-file fallback. After deletion, those callers will throw at the FIRST place in the catch block (per D-39-06). If we don't enumerate them, we'll discover them in production. This audit makes the reroute plan deterministic.

Output: `.planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md` containing (a) caller classification table, (b) ProviderManager fallback-behavior reasoning, (c) `isAvailable()` correction spec, (d) reroute spec for Plan 39-02.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/39-risk-fix-close-oauth-fallback/39-CONTEXT.md

@nexus/packages/core/src/providers/claude.ts
@nexus/packages/core/src/providers/manager.ts
@nexus/packages/core/src/providers/index.ts

<interfaces>
<!-- Key contracts the executor needs. Already extracted from the codebase by the planner. -->
<!-- Executor should use these directly without re-exploring the codebase. -->

From `nexus/packages/core/src/providers/claude.ts`:
```typescript
export class ClaudeProvider implements AIProvider {
  readonly id = 'claude';
  // Methods that internally call getClient() (these are the callers that matter):
  async chat(options: ProviderChatOptions): Promise<ProviderChatResult>;       // line 121
  chatStream(options: ProviderChatOptions): ProviderStreamResult;              // line 174
  async think(options: { prompt; systemPrompt?; tier?; maxTokens? }): Promise<string>;  // line 274 — calls this.chat()
  // Methods that DO NOT call getClient() (safe — never trigger the fallback):
  async isAvailable(): Promise<boolean>;       // line 284 — reads creds file directly with `existsSync` (NOT getClient)
  async getAuthMethod(): Promise<ClaudeAuthMethod>;  // line 322
  async getCliStatus(): Promise<{...}>;        // line 335
  async startLogin(): Promise<{...}>;          // line 381
  async submitLoginCode(code): Promise<{...}>; // line 417
  async logout(): Promise<{...}>;              // line 507
}
```

From `nexus/packages/core/src/providers/manager.ts`:
```typescript
export class ProviderManager {
  // Calls provider.chat() / chatStream() / think() via fallback chain:
  async chat(options): Promise<ProviderChatResult>;        // line 71
  chatStream(options): ProviderStreamResult;               // line 114
  async think(options): Promise<string>;                   // line 174
  // Fallback decision:
  private isFallbackableError(err: any): boolean;          // line 200
  // Status codes that fall back: 401, 403, 429, 502, 503, 529
  // Message keywords that fall back: timeout, econnreset, socket hang up,
  //   fetch failed, econnrefused, overloaded
  // NOTE: A new ClaudeAuthMethodMismatchError will NOT match either set
  //   unless the executor (Plan 39-02) makes it match.
}
```

From `nexus/packages/core/src/api.ts` (callers — verified by grep at planning time):
- Line 532: `getProvider('claude') as ClaudeProvider` then `provider.isAvailable()` only — no getClient() path.
- Line 550: same — calls `provider.startLogin()` only.
- Line 574: same — calls `provider.submitLoginCode(code)` only.
- Line 590: same — calls `provider.logout()` only.
- (Lines 520-521 + 598-599 only set/unset Redis keys, no provider method call.)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Exhaustive grep — enumerate every caller of ClaudeProvider methods (read-only investigation)</name>
  <files>(none — this task only reads + records)</files>
  <action>
Run the following greps from the repo root and capture output. Each grep targets a specific reach-path into ClaudeProvider.getClient():

```bash
# Direct + indirect callers of getClient():
grep -rn "\.getClient(" nexus/packages/core/src/ livos/ --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' 2>/dev/null

# Direct usages of ClaudeProvider.chat / chatStream / think (these all transitively call getClient):
grep -rn -E "(claudeProvider|claude\.chat|claude\.chatStream|claude\.think|ClaudeProvider).*(chat|stream|think|getClient)" nexus/ livos/ --include='*.ts' --include='*.tsx' --include='*.js' 2>/dev/null

# Anyone instantiating ClaudeProvider directly (not just via ProviderManager):
grep -rn "new ClaudeProvider" nexus/ livos/ --include='*.ts' --include='*.tsx' --include='*.js' 2>/dev/null

# All ProviderManager fallback chain entry points (any of these can route to ClaudeProvider):
grep -rn -E "providerManager\.(chat|chatStream|think)|getProviderManager\(\)\.(chat|chatStream|think)|brain\.getProviderManager\(\)" nexus/ livos/ --include='*.ts' --include='*.tsx' --include='*.js' 2>/dev/null

# All readers of ClaudeProvider via getProvider('claude') — to verify no production caller invokes chat()/chatStream():
grep -rn "getProvider\(['\"]claude['\"]\)" nexus/ livos/ --include='*.ts' --include='*.tsx' --include='*.js' 2>/dev/null

# Sacred-file check baseline — record current SHA so Plan 39-02 + 39-03 can verify untouched:
git hash-object nexus/packages/core/src/sdk-agent-runner.ts

# Confirm no other file in nexus/livos uses authToken: (we'll re-run this in Plan 39-03 as a regression test):
grep -rn "authToken:" nexus/ livos/ --include='*.ts' --include='*.tsx' --include='*.js' 2>/dev/null

# Out-of-scope env-var sites (these MUST NOT be modified — record them so we know they were considered):
grep -rn "ANTHROPIC_AUTH_TOKEN\|ANTHROPIC_API_KEY" nexus/ livos/ --include='*.ts' --include='*.tsx' --include='*.js' --include='*.sh' 2>/dev/null
```

Capture every result. Do NOT modify any source file in this task — read-only investigation.
  </action>
  <verify>
    <automated>All 7 greps above ran and output captured into a working buffer or temp file. Executor can list every file:line:match pair found. No source files modified — `git status nexus/ livos/` shows zero changes.</automated>
  </verify>
  <done>Full grep output for all 7 patterns is in hand. The executor knows every file:line that mentions ClaudeProvider, getClient, chat/chatStream/think on a Claude provider, ProviderManager fallback usage, authToken: occurrences, and ANTHROPIC_AUTH_TOKEN/ANTHROPIC_API_KEY occurrences. The current SHA of sdk-agent-runner.ts is recorded.</done>
</task>

<task type="auto">
  <name>Task 2: Write 39-AUDIT.md with caller classification table + reroute spec</name>
  <files>.planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md</files>
  <action>
Create `.planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md` with the following sections (use the grep output from Task 1 as evidence, cite file:line for every claim):

### Section 1: "Caller Inventory"
Table with columns: `File:Line | Method called | Caller type (direct / via ProviderManager / via api.ts handler) | Reaches getClient()? (yes/no/transitive) | Auth-method-gated upstream? (yes/no)`

Include AT MINIMUM these confirmed callers (verify with Task 1 grep output, add any newly discovered):
- `nexus/packages/core/src/providers/manager.ts:85` — `provider.chat(options)` inside fallback loop. Reaches getClient: YES (transitive via claude.ts:132). Gated upstream: NO — `isAvailable()` is the only gate, and it lies (returns true on creds file).
- `nexus/packages/core/src/providers/manager.ts:132` — `provider.chatStream(options)`. Reaches getClient: YES (transitive via claude.ts:190). Gated: NO — same as above.
- `nexus/packages/core/src/providers/manager.ts:185` — `provider.think(options)`. Reaches getClient: YES (transitive via claude.ts:274 → this.chat → getClient). Gated: NO.
- `nexus/packages/core/src/api.ts:532, 550, 574, 590` — calls `provider.isAvailable()` / `startLogin()` / `submitLoginCode()` / `logout()`. Reaches getClient: NO. Gated: N/A.

For any caller discovered in Task 1 grep that's NOT in this list, add a row.

### Section 2: "Caller Classification"
For each caller from Section 1, assign exactly one of:
- **API-key-only-safe** — Caller cannot fire when `claude_auth_method == 'sdk-subscription'` because either (a) caller checks authMethod upstream, or (b) caller is unreachable in subscription mode by routing.
- **Could-be-subscription-needs-reroute** — Caller can fire even when only OAuth creds exist, so deletion would break a working flow.

Expected classifications (verify against grep evidence; if grep finds new callers, classify them):
- `manager.ts:85` (chat) → **could-be-subscription-needs-reroute**
- `manager.ts:132` (chatStream) → **could-be-subscription-needs-reroute**
- `manager.ts:185` (think) → **could-be-subscription-needs-reroute**
- `api.ts:532, 550, 574, 590` → **API-key-only-safe** (do not reach getClient)

### Section 3: "ProviderManager Fallback Behavior Post-Deletion"
Reason explicitly: when a `ClaudeProvider.chat()` call throws the new `ClaudeAuthMethodMismatchError` (introduced in Plan 39-02), what does `ProviderManager.chat()` (manager.ts:71) do?

Write the exact answer: `isFallbackableError()` (manager.ts:200) checks `err.status` ∈ {401, 403, 429, 502, 503, 529} OR message keywords {timeout, econnreset, socket hang up, fetch failed, econnrefused, overloaded}. The new typed error matches NEITHER set → `isFallbackableError` returns false → manager re-throws the error → caller of `ProviderManager.chat()` crashes loud (per D-39-06).

State the chosen reroute strategy (planner picks ONE, both acceptable per D-39-08):

**Strategy A (recommended): gate at `isAvailable()`**. Modify `ClaudeProvider.isAvailable()` (claude.ts:284-315) to NOT return true based on `~/.claude/.credentials.json` existence alone. Specifically: delete lines 293-302 (the credentials-file check). After this, `isAvailable()` returns true only when (a) Redis has an API key, (b) `ANTHROPIC_API_KEY` env var is set, OR (c) auth method is `sdk-subscription` AND `getCliStatus()` says installed+authenticated — but `sdk-subscription` mode means callers should NOT route through `chat()`/`chatStream()` anyway, so the manager's fallback chain will skip Claude (returning false from isAvailable for an explicit-API-key-mode-but-no-key situation, or returning true but then chat() throws if subscription mode is bypassed). Net effect: ProviderManager skips ClaudeProvider entirely when the user has only OAuth creds, falls through to KimiProvider (existing behavior), and no caller crash happens for the dominant path.

**Strategy B (alternative): mark ClaudeAuthMethodMismatchError as fallbackable**. Add a check inside `isFallbackableError()`: `if (err.constructor?.name === 'ClaudeAuthMethodMismatchError') return true;`. This makes ProviderManager fall back to Kimi when ClaudeProvider throws the typed error. Pro: preserves current `isAvailable()` semantics. Con: silently swallows the explicit "subscription users must route through SdkAgentRunner" signal — defeats D-39-06 ("crash early, crash loud").

Pick Strategy A. Document the rationale in AUDIT.md. Both Plan 39-02 changes (delete fallbacks in `getClient()` AND prune the creds-file branch from `isAvailable()`) follow from this decision.

### Section 4: "Reroute Spec for Plan 39-02"
Write a numbered, copy-pasteable spec the executor of Plan 39-02 will use verbatim:

1. **claude.ts:91-115** (the `catch` block in `getClient()`) — DELETE the entire env-var-fallback block AND the entire OAuth-credentials-file block. After deletion, the `catch` block contains exactly: a one-time `logger.warn(...)` line with the deletion notice + a `throw new ClaudeAuthMethodMismatchError(...)` with mode determined by reading the same `claude_auth_method` Redis key (or, if Redis unavailable / not set, defaulting to `'no-credentials'`). The exact error message text from D-39-05 is:

   ```
   ClaudeProvider.getClient() requires an explicit Anthropic API key in Redis (nexus:config:anthropic_api_key) or env (ANTHROPIC_API_KEY). Subscription users must route through SdkAgentRunner (sdk-subscription mode) — see nexus/packages/core/src/sdk-agent-runner.ts. Direct OAuth-token fallback removed in v29.3 Phase 39 (FR-RISK-01).
   ```

2. **claude.ts:293-302** (the OAuth-creds-file branch inside `isAvailable()`) — DELETE these lines. After deletion, `isAvailable()` checks: (1) Redis API key, (2) `ANTHROPIC_API_KEY` env, (3) auth method == sdk-subscription with CLI installed+authenticated. The credentials-file branch is gone.

3. **claude.ts: typed error class definition** — Add `export class ClaudeAuthMethodMismatchError extends Error { constructor(message: string, public readonly mode: 'subscription-required' | 'no-credentials') { super(message); this.name = 'ClaudeAuthMethodMismatchError'; } }` near the top of claude.ts (after the imports, before the `CLAUDE_MODELS` constant). Inline placement per planner's discretion (D-39-04 + Claude's Discretion section in CONTEXT.md).

4. **manager.ts** — NO changes. Per Strategy A above, `isAvailable()` returning false for the OAuth-only case means ClaudeProvider is skipped in the fallback chain; the new typed error will only fire if someone bypasses isAvailable() and calls chat/chatStream directly with an API-key-mode misconfiguration — and in that case, crash loud is the desired behavior (D-39-06).

5. **api.ts** — NO changes. The four callers (lines 532, 550, 574, 590) only invoke `isAvailable()` / `startLogin()` / `submitLoginCode()` / `logout()`, none of which transitively call `getClient()`. They are API-key-only-safe by inspection.

6. **index.ts** — NO changes. Re-export only (line 4).

7. **Out-of-scope (verified safe — do not modify):**
   - `nexus/packages/core/src/sdk-agent-runner.ts:272` — uses `process.env.ANTHROPIC_API_KEY` to forward to the Agent SDK subprocess. SACRED file. Untouched (D-39-13).
   - `nexus/packages/core/src/agent-session.ts:462` — same pattern, separate code path, not via ClaudeProvider.getClient().
   - `nexus/packages/core/src/daemon.ts:315-317` — same pattern, separate code path, not via ClaudeProvider.getClient().
   - `livos/setup.sh:186` — bash variable in install template; not a runtime caller.

### Section 5: "Sacred File Baseline"
Record the output of `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` from Task 1 verbatim. Plan 39-02 + Plan 39-03 will compare against this.

### Section 6: "Carry-forwards (TODO(FR-RISK-01-followup))"
Per D-39-09, list any caller from Section 2 classified as `could-be-subscription-needs-reroute` that the planner could NOT cleanly accommodate via Strategy A. If the list is empty (expected outcome), say so explicitly: "Empty — Strategy A handles all subscription-mode-reachable callers via isAvailable() gate."

If non-empty, each entry needs: file:line, why it can't be rerouted in Phase 39, the fallback `TODO(FR-RISK-01-followup)` comment text the executor will leave in source, and a follow-up note for `.planning/STATE.md` Carry-forwards section.
  </action>
  <verify>
    <automated>cat .planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md | grep -c "Section" returns 6 or more (all six sections present); grep -E "manager\.ts:85|manager\.ts:132|manager\.ts:185" .planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md returns at least 3 matches (the three subscription-reachable callers documented).</automated>
  </verify>
  <done>39-AUDIT.md exists, has all 6 sections, the caller classification table includes every result from Task 1's grep output, the chosen reroute strategy is documented, the Reroute Spec contains the verbatim D-39-05 error message string, and the sacred file baseline SHA is recorded.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

This is a planning / read-only audit phase — no executable code is shipped. The only artifact is a Markdown document. The trust boundaries that matter (HTTP request → ClaudeProvider, Redis → ClaudeProvider) are unchanged by this plan. Plans 39-02 and 39-03 carry the threat-model burden.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-39-01-01 | I (Information disclosure) | 39-AUDIT.md | accept | Audit document references file paths and line numbers but no secrets. Lives in `.planning/` which is committed to the repo per project convention. |
| T-39-01-02 | T (Tampering) | grep evidence | mitigate | All claims in 39-AUDIT.md must cite file:line — Plan 39-02 executor verifies the cited lines actually contain the claimed code before writing the Edit calls. |
</threat_model>

<verification>
1. `.planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md` exists.
2. AUDIT.md contains all 6 sections listed above.
3. AUDIT.md's Caller Classification table includes at minimum: `manager.ts:85`, `manager.ts:132`, `manager.ts:185`, `api.ts:532`, `api.ts:550`, `api.ts:574`, `api.ts:590` (plus any new findings from Task 1's grep).
4. AUDIT.md's Section 4 "Reroute Spec for Plan 39-02" contains the verbatim D-39-05 error message text.
5. AUDIT.md's Section 5 records the sacred-file baseline SHA from `git hash-object nexus/packages/core/src/sdk-agent-runner.ts`.
6. `git diff nexus/packages/core/src/sdk-agent-runner.ts` returns zero output (no edits to sacred file in this plan).
7. `git status nexus/ livos/` shows zero changes (this is a read-only investigation).
</verification>

<success_criteria>
- 39-AUDIT.md is the single, complete, evidence-backed input that Plan 39-02 needs to perform the deletion + reroute without re-exploring the codebase.
- Phase 39 success criterion #2 from ROADMAP — "callers either route through SdkAgentRunner or throw a clear error, never silently fall back" — has a documented reroute strategy (Strategy A, gate at `isAvailable()`).
- Phase 39 success criterion #4 — "sdk-agent-runner.ts byte-identical" — has a baseline SHA recorded for verification by the next two plans.
- FR-RISK-01: this plan does not satisfy the requirement directly, but it produces the deterministic spec that Plan 39-02 follows.
</success_criteria>

<output>
After completion, create `.planning/phases/39-risk-fix-close-oauth-fallback/39-01-SUMMARY.md` containing:
- The caller inventory table (copied from AUDIT.md Section 1)
- The chosen reroute strategy (A or B + rationale)
- The number of `TODO(FR-RISK-01-followup)` carry-forwards (expected: 0)
- Any new callers discovered beyond the planning-time grep that change the picture
- Sacred file baseline SHA
- Confirmation: `git status nexus/ livos/` was empty after this plan ran
</output>
