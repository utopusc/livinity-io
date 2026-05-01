---
phase: 39-risk-fix-close-oauth-fallback
plan: 02
type: execute
wave: 2
depends_on:
  - 39-01
files_modified:
  - nexus/packages/core/src/providers/claude.ts
autonomous: true
requirements:
  - FR-RISK-01
tags:
  - risk-fix
  - oauth
  - claude

must_haves:
  truths:
    - "claude.ts:91-115 (the entire env-var-fallback block + the OAuth-credentials-file block inside getClient()'s catch) is deleted. After Phase 39, getClient() has exactly two outcomes: (a) explicit API key from Redis or ANTHROPIC_API_KEY env → return Anthropic client, (b) otherwise → throw ClaudeAuthMethodMismatchError."
    - "ClaudeAuthMethodMismatchError class is defined and exported from claude.ts with field `mode: 'subscription-required' | 'no-credentials'` and the verbatim D-39-05 error message."
    - "claude.ts isAvailable() no longer returns true based on `~/.claude/.credentials.json` existence alone — the OAuth-creds-file branch (lines 293-302) is deleted, so ProviderManager skips ClaudeProvider in the fallback chain when the user has only OAuth creds (Strategy A from 39-AUDIT.md)."
    - "getClient() method signature is unchanged — still `private async getClient(): Promise<Anthropic>` returning the same Promise<Anthropic> type. Callers' types compile without change."
    - "nexus/packages/core/src/sdk-agent-runner.ts is byte-identical to its pre-Phase-39 SHA recorded in 39-AUDIT.md Section 5. `git diff nexus/packages/core/src/sdk-agent-runner.ts` returns zero output."
    - "TypeScript build passes: `npm run build --workspace=packages/core` (run from `nexus/`) exits 0 with no new errors."
    - "grep -rn 'authToken:' nexus/packages/core/src/providers/claude.ts | grep -v test returns zero matches."
  artifacts:
    - path: "nexus/packages/core/src/providers/claude.ts"
      provides: "ClaudeProvider class with deleted OAuth fallback + new ClaudeAuthMethodMismatchError export"
      contains: "ClaudeAuthMethodMismatchError"
  key_links:
    - from: "nexus/packages/core/src/providers/claude.ts"
      to: "ClaudeAuthMethodMismatchError export"
      via: "Inline class definition near top of file"
      pattern: "export class ClaudeAuthMethodMismatchError"
    - from: "nexus/packages/core/src/providers/claude.ts getClient() catch block"
      to: "throw new ClaudeAuthMethodMismatchError(...)"
      via: "Catch block contains exactly: logger.warn + throw, no fallback logic"
      pattern: "throw new ClaudeAuthMethodMismatchError"
---

<objective>
Atomically delete the OAuth-fallback code paths in `claude.ts` and add the typed error class — implementing the Reroute Spec from `39-AUDIT.md` Section 4 verbatim.

Purpose: Per D-RISK-01, FR-RISK-01, and the seed milestone constraint, a Claude OAuth subscription token must be structurally incapable of reaching `@anthropic-ai/sdk` HTTP. The deletion + typed error + isAvailable() correction together close that path. After this plan ships, only an explicit API key or the sacred SdkAgentRunner can drive a Claude request.

Output: Modified `nexus/packages/core/src/providers/claude.ts` (one file, atomic commit), TypeScript build green, sacred file untouched.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/phases/39-risk-fix-close-oauth-fallback/39-CONTEXT.md
@.planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md
@.planning/phases/39-risk-fix-close-oauth-fallback/39-01-SUMMARY.md

@nexus/packages/core/src/providers/claude.ts

<interfaces>
<!-- The exact lines in claude.ts being modified. Use these as ground truth — do not re-read other files. -->

Current `getClient()` body (claude.ts:82-119):
```typescript
private async getClient(): Promise<Anthropic> {
  // Try explicit API key (Redis or ANTHROPIC_API_KEY env)
  try {
    const apiKey = await this.getApiKey();
    if (this.client && apiKey === this.cachedApiKey) return this.client;
    this.client = new Anthropic({ apiKey });
    this.cachedApiKey = apiKey;
    return this.client;
  } catch {
    // Fall back to ANTHROPIC_AUTH_TOKEN env var (OAuth token set at startup)
    if (process.env.ANTHROPIC_AUTH_TOKEN) {
      if (this.client && this.cachedApiKey === '__auth_token__') return this.client;
      this.client = new Anthropic({ authToken: process.env.ANTHROPIC_AUTH_TOKEN });
      this.cachedApiKey = '__auth_token__';
      return this.client;
    }

    // Fall back to OAuth credentials file (~/.claude/.credentials.json)
    try {
      const fs = await import('fs');
      const pathMod = await import('path');
      const home = process.env.HOME || process.env.USERPROFILE || '/root';
      const credsPath = pathMod.join(home, '.claude', '.credentials.json');
      if (fs.existsSync(credsPath)) {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        const token = creds.claudeAiOauth?.accessToken;
        if (token) {
          if (this.client && this.cachedApiKey === '__oauth_file__') return this.client;
          this.client = new Anthropic({ authToken: token });
          this.cachedApiKey = '__oauth_file__';
          return this.client;
        }
      }
    } catch {}

    throw new Error('No Anthropic API key configured');
  }
}
```

Current `isAvailable()` body (claude.ts:284-315) — the OAuth-creds-file branch to delete is lines 293-302:
```typescript
async isAvailable(): Promise<boolean> {
  // 1. Check Redis API key
  try {
    await this.getApiKey();
    return true;
  } catch {}

  // 2. Check Claude credentials file (~/.claude/.credentials.json)
  // Anthropic SDK reads this automatically for OAuth-authenticated users
  try {
    const { existsSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const home = process.env.HOME || process.env.USERPROFILE || '/root';
    const credsPath = join(home, '.claude', '.credentials.json');
    if (existsSync(credsPath)) {
      const creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
      if (creds.claudeAiOauth?.accessToken) return true;
    }
  } catch {}

  // 3. Check ANTHROPIC_API_KEY env var
  if (process.env.ANTHROPIC_API_KEY) return true;

  // 4. Fallback: check CLI status
  const method = await this.getAuthMethod();
  if (method === 'sdk-subscription') {
    const status = await this.getCliStatus();
    return status.installed && status.authenticated;
  }

  return false;
}
```

D-39-05 verbatim error message (single line, no line breaks in the string):
```
ClaudeProvider.getClient() requires an explicit Anthropic API key in Redis (nexus:config:anthropic_api_key) or env (ANTHROPIC_API_KEY). Subscription users must route through SdkAgentRunner (sdk-subscription mode) — see nexus/packages/core/src/sdk-agent-runner.ts. Direct OAuth-token fallback removed in v29.3 Phase 39 (FR-RISK-01).
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-verify sacred file baseline SHA from 39-AUDIT.md (sanity check before any edit)</name>
  <files>(none — read-only verification)</files>
  <action>
Read the sacred file baseline SHA recorded in `39-AUDIT.md` Section 5. Then run:

```bash
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
```

Compare. If they differ, STOP — something has changed since Plan 39-01 ran. Halt and report the discrepancy. Do not proceed.

If they match, also confirm `git status nexus/packages/core/src/sdk-agent-runner.ts` shows clean (no uncommitted changes). Proceed only on a match + clean tree.
  </action>
  <verify>
    <automated>The current `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` output is byte-identical to the SHA recorded in `39-AUDIT.md` Section 5. `git status nexus/packages/core/src/sdk-agent-runner.ts` shows the file as clean.</automated>
  </verify>
  <done>Sacred file baseline confirmed unchanged before any edits begin.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add ClaudeAuthMethodMismatchError class to claude.ts (per D-39-04, D-39-05)</name>
  <files>nexus/packages/core/src/providers/claude.ts</files>
  <behavior>
    - Class is exported (other files can import it).
    - Class extends Error.
    - Class has a public readonly `mode` field of type `'subscription-required' | 'no-credentials'`.
    - Class `name` property === `'ClaudeAuthMethodMismatchError'` (so `err.constructor?.name` checks work).
    - Default constructor takes (message: string, mode: 'subscription-required' | 'no-credentials').
  </behavior>
  <action>
Insert the following class definition into `nexus/packages/core/src/providers/claude.ts` AFTER the imports block (after line 25 `const execFileAsync = promisify(execFile);`) and BEFORE the `CLAUDE_MODELS` constant (before line 27):

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

Per CONTEXT.md "Claude's Discretion", inline placement in `claude.ts` is correct (tightly coupled). Do NOT create a separate `errors.ts` file.

After insertion, verify `tsc --noEmit` (or just rely on the next task's full build verification).
  </action>
  <verify>
    <automated>grep -n "export class ClaudeAuthMethodMismatchError" nexus/packages/core/src/providers/claude.ts returns exactly one match. grep -n "mode: 'subscription-required' | 'no-credentials'" nexus/packages/core/src/providers/claude.ts returns exactly one match.</automated>
  </verify>
  <done>ClaudeAuthMethodMismatchError class is defined and exported in claude.ts above the CLAUDE_MODELS constant.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Replace getClient() catch block — delete env-var fallback + OAuth-credentials-file fallback (per D-39-01, D-39-02, D-39-05, D-39-06)</name>
  <files>nexus/packages/core/src/providers/claude.ts</files>
  <behavior>
    - getClient() method signature unchanged: still `private async getClient(): Promise<Anthropic>` returning Promise<Anthropic> (D-39-03).
    - When Redis API key is set (or ANTHROPIC_API_KEY env var is set, both routed through this.getApiKey()), getClient() returns the Anthropic client (regression preserved).
    - When neither Redis API key nor ANTHROPIC_API_KEY env are set, getClient() throws ClaudeAuthMethodMismatchError with the D-39-05 message text.
    - The thrown error's `mode` field is `'subscription-required'` if `await this.getAuthMethod() === 'sdk-subscription'`, else `'no-credentials'`. This lets callers distinguish "user is on subscription mode but called the wrong path" from "user has no credentials at all".
    - The pre-existing client cache (`this.client && apiKey === this.cachedApiKey`) is preserved on the success path.
    - There is NO process.env.ANTHROPIC_AUTH_TOKEN read.
    - There is NO `fs.readFileSync(credsPath, ...)` or `creds.claudeAiOauth?.accessToken` read.
    - There is NO `new Anthropic({ authToken: ... })` construction (only `new Anthropic({ apiKey })` survives).
    - A one-line `logger.warn(...)` runs INSIDE the catch block before the throw, with text: `'ClaudeProvider.getClient() invoked without API key — subscription users must use SdkAgentRunner (FR-RISK-01).'`. This helps post-deploy diagnosis if someone bumps into the deletion (CONTEXT.md Reusable Assets / "Telemetry on the deleted-fallback warning" deferred item — log line is the minimum hook).
  </behavior>
  <action>
Replace lines 82-119 of `nexus/packages/core/src/providers/claude.ts` (the entire current `getClient()` method body) with the following:

```typescript
private async getClient(): Promise<Anthropic> {
  // Try explicit API key (Redis or ANTHROPIC_API_KEY env). This is the ONLY
  // path that constructs an Anthropic client. Subscription users (no API key)
  // must route through SdkAgentRunner — never through this method.
  //
  // Deleted in v29.3 Phase 39 (FR-RISK-01):
  //   - process.env.ANTHROPIC_AUTH_TOKEN fallback (was claude.ts:91-97)
  //   - ~/.claude/.credentials.json claudeAiOauth.accessToken fallback (was claude.ts:99-115)
  // Both paths used `new Anthropic({ authToken: ... })` which routed Claude
  // OAuth subscription tokens directly into the raw @anthropic-ai/sdk HTTP client —
  // a ToS-relevant fingerprint risk that v29.3 closes structurally.
  try {
    const apiKey = await this.getApiKey();
    if (this.client && apiKey === this.cachedApiKey) return this.client;
    this.client = new Anthropic({ apiKey });
    this.cachedApiKey = apiKey;
    return this.client;
  } catch {
    logger.warn('ClaudeProvider.getClient() invoked without API key — subscription users must use SdkAgentRunner (FR-RISK-01).');
    const method = await this.getAuthMethod();
    const mode: 'subscription-required' | 'no-credentials' =
      method === 'sdk-subscription' ? 'subscription-required' : 'no-credentials';
    throw new ClaudeAuthMethodMismatchError(
      'ClaudeProvider.getClient() requires an explicit Anthropic API key in Redis (nexus:config:anthropic_api_key) or env (ANTHROPIC_API_KEY). Subscription users must route through SdkAgentRunner (sdk-subscription mode) — see nexus/packages/core/src/sdk-agent-runner.ts. Direct OAuth-token fallback removed in v29.3 Phase 39 (FR-RISK-01).',
      mode,
    );
  }
}
```

CRITICAL invariants to verify before saving the edit:
1. The error message string matches D-39-05 verbatim — character-for-character including the em-dash (`—`, U+2014). This same string is asserted by the unit test in Plan 39-03.
2. There is exactly ONE `new Anthropic({ ... })` call in the entire updated method, and it uses the `apiKey` field, never `authToken`.
3. `process.env.ANTHROPIC_AUTH_TOKEN` does NOT appear anywhere in the new method body.
4. `claudeAiOauth` does NOT appear anywhere in the new method body.
5. The `getClient()` signature, return type, and access modifier (`private async`) are unchanged.
  </action>
  <verify>
    <automated>grep -c "authToken:" nexus/packages/core/src/providers/claude.ts returns 0. grep -c "ANTHROPIC_AUTH_TOKEN" nexus/packages/core/src/providers/claude.ts returns 0. grep -c "claudeAiOauth" nexus/packages/core/src/providers/claude.ts returns 1 (only in the still-present submitLoginCode() at line ~466 — that's the OAuth FLOW, not the fallback). grep -n "throw new ClaudeAuthMethodMismatchError" nexus/packages/core/src/providers/claude.ts returns exactly one match inside getClient().</automated>
  </verify>
  <done>getClient() catch block contains only the warn-log + throw of ClaudeAuthMethodMismatchError. No env-var fallback, no creds-file fallback, no `new Anthropic({ authToken })`. Error message text is the D-39-05 verbatim string.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Prune isAvailable() OAuth-creds-file branch (per Strategy A from 39-AUDIT.md Section 3)</name>
  <files>nexus/packages/core/src/providers/claude.ts</files>
  <behavior>
    - isAvailable() no longer returns true based on `~/.claude/.credentials.json` existence alone.
    - Existing API-key paths (Redis, ANTHROPIC_API_KEY env) continue to return true (regression preserved).
    - Existing CLI-status path for sdk-subscription mode continues to work (claude CLI installed + authenticated → true).
    - Method signature unchanged: still `async isAvailable(): Promise<boolean>`.
    - After this change, ProviderManager's fallback chain (manager.ts:78) will skip ClaudeProvider when the user has only OAuth creds, falling through to KimiProvider — preserving the existing chat experience for subscription-only users without breaking it.
  </behavior>
  <action>
Modify `nexus/packages/core/src/providers/claude.ts` `isAvailable()` method. Delete lines 293-302 (the entire `// 2. Check Claude credentials file` block including its surrounding `try { ... } catch {}`). Renumber the remaining comments accordingly.

The resulting `isAvailable()` body should be:

```typescript
async isAvailable(): Promise<boolean> {
  // 1. Check Redis API key
  try {
    await this.getApiKey();
    return true;
  } catch {}

  // 2. Check ANTHROPIC_API_KEY env var
  if (process.env.ANTHROPIC_API_KEY) return true;

  // 3. Subscription mode: check Claude CLI status (installed + authenticated)
  // NOTE: Even if true, callers MUST NOT call this.chat() / chatStream() / think()
  // for subscription users — those paths require an explicit API key. Subscription
  // requests must route through SdkAgentRunner. ProviderManager handles this via
  // the api-key vs sdk-subscription gate it reads from Redis (nexus:config:claude_auth_method).
  const method = await this.getAuthMethod();
  if (method === 'sdk-subscription') {
    const status = await this.getCliStatus();
    return status.installed && status.authenticated;
  }

  return false;
}
```

Note: the OAuth credentials file existence is no longer a signal that ClaudeProvider can serve a `chat()` call — because after Task 3, it cannot. The CLI-status check survives because it represents "subscription mode is configured" — but a comment now explicitly warns that this does NOT mean callers can use ClaudeProvider's chat methods directly.

CRITICAL: Do NOT touch the OAuth flow methods (startLogin, submitLoginCode, logout) at lines ~381+. Those are the legitimate per-user OAuth setup path, used by the api.ts handlers, and remain unchanged. Only the FALLBACK that silently READS the credentials file at request time is being removed; the OAuth setup flow that WRITES the credentials file is preserved.
  </action>
  <verify>
    <automated>grep -c "creds.claudeAiOauth" nexus/packages/core/src/providers/claude.ts returns exactly 0 inside isAvailable() (use `awk '/async isAvailable/,/^  }/' nexus/packages/core/src/providers/claude.ts | grep -c "creds.claudeAiOauth"` to scope to the method). The submitLoginCode() method still contains `claudeAiOauth:` (the OAuth FLOW, preserved). grep -c "credsPath" nexus/packages/core/src/providers/claude.ts returns exactly 0 (was previously inside both getClient() and isAvailable(); both removed).</automated>
  </verify>
  <done>isAvailable() no longer reads the credentials file. Only Redis API key, ANTHROPIC_API_KEY env, and CLI status remain as availability signals. OAuth flow methods (startLogin, submitLoginCode, logout) are untouched.</done>
</task>

<task type="auto">
  <name>Task 5: Build verification — TypeScript compile of nexus/packages/core</name>
  <files>(none — build verification only)</files>
  <action>
From the repo root, run:

```bash
cd nexus && npm run build --workspace=packages/core 2>&1
```

This runs `tsc` (per `nexus/packages/core/package.json` "build" script). Expected outcome: exit 0, no new TypeScript errors.

If errors are reported:
- If they reference `ClaudeAuthMethodMismatchError` not being exported / not found → re-check Task 2's class placement.
- If they reference `process.env.ANTHROPIC_AUTH_TOKEN` is unused → that's expected (it's no longer read in claude.ts; it may still appear in unrelated files).
- If they reference signature mismatch on `getClient()` → re-check Task 3 preserved the exact signature.
- Any other error → halt, report, do NOT proceed to commit.

Capture the build output for the SUMMARY.
  </action>
  <verify>
    <automated>cd nexus && npm run build --workspace=packages/core exits 0. The build produces an updated `nexus/packages/core/dist/providers/claude.js` and `dist/providers/claude.d.ts` that contain the exported ClaudeAuthMethodMismatchError type.</automated>
  </verify>
  <done>TypeScript build passes with no new errors. Compiled `dist/` reflects the source changes.</done>
</task>

<task type="auto">
  <name>Task 6: Sacred file integrity verification — confirm sdk-agent-runner.ts is byte-identical (per D-39-13)</name>
  <files>(none — git diff verification only)</files>
  <action>
Run:

```bash
git diff --stat nexus/packages/core/src/sdk-agent-runner.ts
git diff nexus/packages/core/src/sdk-agent-runner.ts | wc -l
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
```

Expected outcomes:
1. `git diff --stat` produces zero lines of output (no entry for sdk-agent-runner.ts).
2. `git diff | wc -l` returns 0.
3. `git hash-object` matches the SHA recorded in `39-AUDIT.md` Section 5.

If ANY of these three checks fails, STOP. Do not commit. Investigate why the sacred file changed (likely a stray autosave or formatter run). Restore via `git checkout -- nexus/packages/core/src/sdk-agent-runner.ts` and re-verify.

Also verify no other unintended file changed: `git status --short` should show ONLY `nexus/packages/core/src/providers/claude.ts` (and possibly `nexus/packages/core/dist/...` if untracked dist files exist; those should be in `.gitignore` already — if they're not, that's pre-existing tech debt, not in scope).
  </action>
  <verify>
    <automated>git diff nexus/packages/core/src/sdk-agent-runner.ts produces zero output (exit 0, empty stdout). git hash-object nexus/packages/core/src/sdk-agent-runner.ts equals the SHA recorded in 39-AUDIT.md Section 5. git diff --name-only includes ONLY nexus/packages/core/src/providers/claude.ts (plus possibly the AUDIT/SUMMARY files from Plan 39-01).</automated>
  </verify>
  <done>Sacred file confirmed byte-identical. The only source-code change in the working tree is claude.ts.</done>
</task>

<task type="auto">
  <name>Task 7: Atomic commit — claude.ts deletion + ClaudeAuthMethodMismatchError introduction</name>
  <files>(commit only — no further file changes)</files>
  <action>
Stage and commit the modified claude.ts as a single atomic commit:

```bash
git add nexus/packages/core/src/providers/claude.ts
git commit -m "$(cat <<'EOF'
refactor(39-02): close OAuth fallback in ClaudeProvider.getClient (FR-RISK-01)

Delete ANTHROPIC_AUTH_TOKEN env-var fallback and ~/.claude/.credentials.json
OAuth-token fallback from getClient() — both paths constructed
`new Anthropic({ authToken: ... })`, routing Claude OAuth subscription tokens
directly into the raw @anthropic-ai/sdk HTTP client. After this commit,
getClient() either uses an explicit API key (Redis or ANTHROPIC_API_KEY env)
or throws the new ClaudeAuthMethodMismatchError.

Subscription users must route through SdkAgentRunner (sdk-subscription mode);
ClaudeProvider.isAvailable() no longer reports availability based on
credentials-file existence, so ProviderManager skips ClaudeProvider in the
fallback chain for subscription-only users.

- Add export class ClaudeAuthMethodMismatchError extends Error with
  mode: 'subscription-required' | 'no-credentials'
- Delete claude.ts:91-115 (env-var + creds-file fallbacks in getClient)
- Delete claude.ts:293-302 (creds-file branch in isAvailable)
- Preserve OAuth flow methods (startLogin, submitLoginCode, logout) — those
  WRITE the credentials file for the per-user OAuth setup path landing in
  Phase 40, distinct from the deleted READ-at-request-time fallback.

Sacred: nexus/packages/core/src/sdk-agent-runner.ts byte-identical
(verified by git diff + git hash-object match against 39-AUDIT.md baseline).

Closes risk in v29.3 milestone — see .planning/REQUIREMENTS.md FR-RISK-01.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

After commit:
```bash
git log -1 --stat
```

Expected: one commit, one file changed (claude.ts), insertions + deletions reflect the diff.
  </action>
  <verify>
    <automated>git log -1 --name-only shows exactly one file: nexus/packages/core/src/providers/claude.ts. git log -1 --pretty=format:'%s' starts with `refactor(39-02): close OAuth fallback`. The commit body mentions FR-RISK-01.</automated>
  </verify>
  <done>Single atomic commit on master with the claude.ts changes, descriptive message, FR-RISK-01 traceability.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Marketplace app / external HTTP caller → ProviderManager.chat() (post-Phase-41) | Untrusted input crosses here — but Phase 39 does not introduce this boundary; it only closes a downstream leak. |
| ClaudeProvider.getClient() → Anthropic HTTP API | Subscription tokens were leaking across this boundary via raw `@anthropic-ai/sdk`. THIS PLAN CLOSES IT. |
| ~/.claude/.credentials.json → ClaudeProvider request path | Was a silent read on every getClient() call. THIS PLAN REMOVES THE READ. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-39-02-01 | I (Information disclosure — subscription token reaches raw SDK with OpenClaw fingerprint risk) | claude.ts:91-115 (deleted) | mitigate | DELETE the code path (this plan). After Phase 39, no `new Anthropic({ authToken })` exists in the file. Verified by grep regression test in Plan 39-03. |
| T-39-02-02 | T (Tampering — sacred file accidentally modified) | sdk-agent-runner.ts | mitigate | Sacred file integrity check (Task 6) gates the commit. `git hash-object` comparison against baseline from 39-AUDIT.md. |
| T-39-02-03 | E (Elevation of privilege — caller bypasses isAvailable() and triggers chat() while subscription mode) | claude.ts ClaudeProvider.chat / chatStream / think | mitigate | Throw ClaudeAuthMethodMismatchError with `mode: 'subscription-required'` (Task 3). `mode` field lets callers distinguish misroute (`'subscription-required'`) from genuine missing config (`'no-credentials'`). Per D-39-06: crash early, crash loud. |
| T-39-02-04 | R (Repudiation — caller cannot tell why getClient threw) | Error message text | mitigate | Verbatim D-39-05 message names the file path (`sdk-agent-runner.ts`), the Redis key (`nexus:config:anthropic_api_key`), the env var (`ANTHROPIC_API_KEY`), and the phase (`v29.3 Phase 39 (FR-RISK-01)`). Operator searching logs finds the answer in one grep. |
| T-39-02-05 | D (Denial of service — manager.ts fallback breaks for subscription users, AI chat stops working) | manager.ts fallback chain (NOT modified) | mitigate | isAvailable() correction (Task 4) ensures ProviderManager skips ClaudeProvider for subscription-only users, falling through to KimiProvider — same behavior as today for users on Kimi-primary. Plan 39-03 has a regression test for this. |
</threat_model>

<verification>
1. `grep -c "authToken:" nexus/packages/core/src/providers/claude.ts` returns 0.
2. `grep -c "ANTHROPIC_AUTH_TOKEN" nexus/packages/core/src/providers/claude.ts` returns 0.
3. `grep -n "export class ClaudeAuthMethodMismatchError" nexus/packages/core/src/providers/claude.ts` returns exactly one match.
4. `grep -n "throw new ClaudeAuthMethodMismatchError" nexus/packages/core/src/providers/claude.ts` returns exactly one match (inside getClient).
5. `cd nexus && npm run build --workspace=packages/core` exits 0.
6. `git diff nexus/packages/core/src/sdk-agent-runner.ts` produces zero output.
7. `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` matches the baseline SHA in `39-AUDIT.md` Section 5.
8. `git log -1 --name-only` shows the commit changed exactly one file: `nexus/packages/core/src/providers/claude.ts`.
9. `git status --short` shows clean (no uncommitted changes) after Task 7.
</verification>

<success_criteria>
- ROADMAP Phase 39 success criterion #1 (`grep ... 'authToken: token'` returns zero matches referencing claudeAiOauth) — SATISFIED. Verified by Verification check 1.
- ROADMAP Phase 39 success criterion #2 (subscription users either route through SdkAgentRunner or get clear error, never silent fallback) — SATISFIED. Verified by Verification checks 3 + 4 (typed error exists and is thrown), and by Plan 39-03's unit tests.
- ROADMAP Phase 39 success criterion #3 (existing API-key path still works) — partially satisfied (signature preserved, success branch unchanged). Final verification via Plan 39-03 unit test (a).
- ROADMAP Phase 39 success criterion #4 (sdk-agent-runner.ts byte-identical) — SATISFIED. Verified by Verification checks 6 + 7.
- FR-RISK-01 — SATISFIED post-commit. Final regression coverage via Plan 39-03.
</success_criteria>

<output>
After completion, create `.planning/phases/39-risk-fix-close-oauth-fallback/39-02-SUMMARY.md` containing:
- Commit SHA of the atomic commit from Task 7
- `git log -1 --stat` output (one file, line counts)
- Output of `grep -c "authToken:" nexus/packages/core/src/providers/claude.ts` (must be 0)
- Output of `grep -c "ANTHROPIC_AUTH_TOKEN" nexus/packages/core/src/providers/claude.ts` (must be 0)
- Sacred file SHA before + after (must be identical to baseline from 39-AUDIT.md)
- Build output snippet showing tsc exit 0
- Hand-off to Plan 39-03: which test invariants the deletion enables (unit test for getClient throwing, grep regression test)
</output>
