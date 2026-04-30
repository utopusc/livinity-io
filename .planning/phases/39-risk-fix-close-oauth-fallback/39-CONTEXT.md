# Phase 39: Risk Fix — Close OAuth Fallback - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning
**Mode:** Auto-generated via `gsd-discuss-phase 39 --auto` (autonomous milestone execution)

<domain>
## Phase Boundary

Make it structurally impossible for a Claude OAuth subscription token to reach the raw `@anthropic-ai/sdk` HTTP path. After this phase, `ClaudeProvider.getClient()` either uses an explicitly-set API key (Redis or `ANTHROPIC_API_KEY` env var) or throws a clear error with redirect guidance — there is no third option. Subscription users always route through `SdkAgentRunner` (sacred, untouched).

**Scope anchor:** `nexus/packages/core/src/providers/claude.ts:82-119` (the `getClient()` method's fallback chain). Tests + caller audit included. Refactoring `SdkAgentRunner`, building broker, or per-user OAuth all OUT (separate phases).

</domain>

<decisions>
## Implementation Decisions

### Removal Strategy
- **D-39-01:** Delete the OAuth credentials-file fallback (`claude.ts:99-115`) entirely — read of `~/.claude/.credentials.json` + `claudeAiOauth.accessToken` + `new Anthropic({ authToken: token })` removed. Lines disappear; no replacement code in their place. Rationale: D-RISK-01 says "deleted (not refactored)".
- **D-39-02:** ALSO delete the `ANTHROPIC_AUTH_TOKEN` env var fallback (`claude.ts:91-97`) — same `authToken:` pattern as the OAuth file path, same fingerprint risk. Spirit of D-NO-BYOK + D-TOS-02 covers both. After deletion, `getClient()` has exactly two outcomes: (a) explicit API key → return Anthropic client, (b) no API key → throw typed error.
- **D-39-03:** Keep the `getClient()` method signature intact (still returns `Promise<Anthropic>`) — callers' types don't break. The change is purely internal: the catch block now does NOT silently fall back to OAuth — it re-throws with a typed error subclass.

### Error Type & Message
- **D-39-04:** Define and export a typed error class `ClaudeAuthMethodMismatchError extends Error` with field `mode: 'subscription-required' | 'no-credentials'`. Rationale: callers can catch and route to "use Agent SDK / sdk-subscription mode" UX without string parsing.
- **D-39-05:** Error message text (locked): `"ClaudeProvider.getClient() requires an explicit Anthropic API key in Redis (nexus:config:anthropic_api_key) or env (ANTHROPIC_API_KEY). Subscription users must route through SdkAgentRunner (sdk-subscription mode) — see nexus/packages/core/src/sdk-agent-runner.ts. Direct OAuth-token fallback removed in v29.3 Phase 39 (FR-RISK-01)."`
- **D-39-06:** Throw the error at the FIRST point in the catch block — do NOT log + return null + let caller crash with a less-helpful TypeError later. Crash early, crash loud.

### Caller Audit & Routing
- **D-39-07:** Audit all callers of `ClaudeProvider.chat()` / `ClaudeProvider.stream()` / `ClaudeProvider.getClient()` across `nexus/` and `livos/`. Confirmed call sites (from initial grep): `nexus/packages/core/src/api.ts`, `nexus/packages/core/src/providers/manager.ts`, `nexus/packages/core/src/providers/index.ts`. Plan phase will exhaustively grep + classify each call site as "API-key-only" (safe) or "could-be-subscription" (needs reroute or removal).
- **D-39-08:** Any caller that is reachable when `claude_auth_method == 'sdk-subscription'` must be re-pointed to `SdkAgentRunner` OR guarded with `if (authMethod === 'api-key')` BEFORE calling `getClient()`. Discovery + reroute is part of plan; do NOT defer to a later phase.
- **D-39-09:** If a caller cannot be cleanly rerouted in this phase (rare — code review will flag), document it as a `TODO(FR-RISK-01-followup)` with line ref and add to `.planning/STATE.md` "Carry-forwards" section. Do NOT silently leave a broken path.

### Tests
- **D-39-10:** Add three new unit tests in `nexus/packages/core/src/providers/__tests__/claude.test.ts` (or create file if absent): (a) Redis API key set → `getClient()` returns Anthropic client (regression), (b) no Redis key, no env key, no creds file → throws `ClaudeAuthMethodMismatchError` with `mode: 'no-credentials'`, (c) no API keys but creds file present (mocked fs) → throws `ClaudeAuthMethodMismatchError` with `mode: 'subscription-required'` (NOT silently uses the token). Vitest framework (existing).
- **D-39-11:** Add a grep-based regression test (shell or vitest spawn-grep) asserting `grep -rn 'authToken:' nexus/packages/core/src/providers/claude.ts | grep -v test` returns zero results. Lives in `__tests__/no-authtoken-regression.test.ts`. Prevents future re-introduction.
- **D-39-12:** Add a sacred-file integrity check — `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` recorded as a baseline string in the test (or just `git diff` exit-code check in CI script). Verifies SdkAgentRunner is byte-identical post-Phase-39.

### Sacred File Constraint
- **D-39-13:** `nexus/packages/core/src/sdk-agent-runner.ts` is byte-identical to its pre-Phase-39 SHA. NO edits, NO whitespace changes, NO import reordering. Plan phase MUST verify via `git diff` before commit.

### Deployment & Rollout
- **D-39-14:** Build target: Mini PC ONLY (`bruce@10.69.31.68`). D-NO-SERVER4 enforced. Standard `bash /opt/livos/update.sh` flow after merge to master.
- **D-39-15:** No data migration needed — change is purely a code path removal. No Redis keys, no DB columns, no env vars are deleted.
- **D-39-16:** Rollback: standard `update.sh` rollback (Phase 32 livos-rollback.sh). If a caller breaks unexpectedly post-deploy, rollback to pre-Phase-39 SHA restores the OAuth fallback temporarily until a forward-fix lands.

### Claude's Discretion
- File naming for the typed-error class export (`errors.ts` vs inline in `claude.ts`) — planner can pick. Recommendation: inline in `claude.ts` since it's tightly coupled.
- Whether the grep-regression test runs in vitest or as a separate `package.json` script — planner can pick.
- Exact placement of the `TODO(FR-RISK-01-followup)` comment if any caller can't be rerouted — planner can pick (with code review audit).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 39 source files
- `nexus/packages/core/src/providers/claude.ts` (lines 82-119 = the `getClient()` method that's being modified)
- `nexus/packages/core/src/sdk-agent-runner.ts` (SACRED — read for context, NEVER modify)
- `nexus/packages/core/src/providers/manager.ts` (caller — audit required)
- `nexus/packages/core/src/providers/index.ts` (caller — audit required)
- `nexus/packages/core/src/api.ts` (caller — audit required)

### Project-level constraints
- `.planning/PROJECT.md` (Current Milestone section — locked decisions D-RISK-01, D-NO-BYOK, D-TOS-02, D-NO-SERVER4)
- `.planning/REQUIREMENTS.md` (FR-RISK-01 + sacred file constraint)
- `.planning/research/v29.3-marketplace-broker-seed.md` (background — Anthropic ToS analysis, OpenClaw fingerprint detection rationale)

### Memory references (for context — already loaded by Claude Code session)
- `feedback_subscription_only.md` — user uses ONLY subscription mode, never BYOK
- `MEMORY.md` Server Setup section — Mini PC deployment target, D-NO-SERVER4

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Anthropic` class from `@anthropic-ai/sdk` — kept (still used for legitimate API-key flow)
- `ClaudeProvider.getApiKey()` (claude.ts:66-80) — kept and reused (provides the API-key resolution chain Redis → env)
- `logger` from `../logger.js` — used to log a one-time warning when the deleted-fallback would have triggered (helps diagnose post-deploy issues)

### Established Patterns
- ClaudeProvider implements `AIProvider` interface — change is internal to one method, interface unchanged
- Redis-backed auth method config (`AUTH_METHOD_KEY = 'nexus:config:claude_auth_method'`) — already gates the api-key vs sdk-subscription routing
- `prepareForProvider()` normalizer + `prepareRawMessages()` for Anthropic-native content blocks — unchanged

### Integration Points
- `ProviderManager` (manager.ts) — selects ClaudeProvider when `claude_auth_method == 'api-key'`. Verify this gate is upstream of every `getClient()` call after Phase 39.
- Agent runner (sdk-agent-runner.ts) — the legitimate path for subscription users. Sacred. Untouched.
- Settings UI (Settings > AI Integrations) — no UI changes in Phase 39 (per-user OAuth UI lands in Phase 40).

</code_context>

<specifics>
## Specific Ideas

- **Crash-loud principle:** Per user's "subscription is sacred — don't break the working agent" 2026-04-29 feedback, the change must be visible if it breaks something. A typed error with a clear redirect message > silent fallback every time.
- **Grep-based regression test:** Inspired by the user's preference for explicit invariant assertions (seen in v29.0 phase 31's `verify_build` helper pattern). One-line shell guard in CI > runtime debugging later.
- **No incremental rollout:** Single PR / single deploy. The change is small enough (~15 lines deletion + ~30 lines test) that staged rollout adds complexity without value.

</specifics>

<deferred>
## Deferred Ideas

- **Per-user OAuth flow** — Phase 40 (FR-AUTH-01..03)
- **`livinity-broker` HTTP server** — Phase 41 (FR-BROKER-A-01..04)
- **OpenAI-compat translation** — Phase 42 (FR-BROKER-O-01..04)
- **Marketplace manifest auto-injection** — Phase 43 (FR-MARKET-01..02)
- **Usage dashboard** — Phase 44 (FR-DASH-01..03)
- **Refactor `getApiKey()` to return a discriminated union instead of throwing** — would clean up `getClient()` further but out of scope for risk fix.
- **Telemetry on the deleted-fallback warning** — if someone bumps into it post-deploy, useful to know. Defer to FR-DASH (Phase 44 dashboard surface).

</deferred>

---

*Phase: 39-risk-fix-close-oauth-fallback*
*Context gathered: 2026-04-29*
*Auto-generated decisions: 16 (D-39-01..D-39-16) — all flow from locked decisions D-RISK-01, D-NO-BYOK, D-TOS-02, sacred-file constraint*
