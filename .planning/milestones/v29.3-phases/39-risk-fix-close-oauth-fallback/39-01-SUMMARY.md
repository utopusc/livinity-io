# Plan 39-01 Summary — Caller Audit

**Plan:** 39-01 Caller Audit
**Phase:** 39 Risk Fix — Close OAuth Fallback
**Completed:** 2026-04-29
**Requirements:** FR-RISK-01 (audit input only — final satisfaction in Plans 39-02 + 39-03)

---

## Caller Inventory (copied from 39-AUDIT.md Section 1)

| File:Line | Method | Reaches getClient()? | Classification |
|-----------|--------|----------------------|----------------|
| `nexus/packages/core/src/providers/claude.ts:132` | `this.getClient()` (in `chat()`) | YES — direct | internal |
| `nexus/packages/core/src/providers/claude.ts:190` | `self.getClient()` (in `chatStream()`) | YES — direct | internal |
| `nexus/packages/core/src/providers/manager.ts:30` | `new ClaudeProvider(redis)` | NO — instantiation | constructor |
| `nexus/packages/core/src/providers/manager.ts:85` | `provider.chat(options)` | YES — transitive | could-be-subscription-needs-reroute |
| `nexus/packages/core/src/providers/manager.ts:132` | `provider.chatStream(options)` | YES — transitive | could-be-subscription-needs-reroute |
| `nexus/packages/core/src/providers/manager.ts:185` | `provider.think(options)` | YES — transitive | could-be-subscription-needs-reroute |
| `nexus/packages/core/src/api.ts:532` | `provider.isAvailable()` | NO | API-key-only-safe |
| `nexus/packages/core/src/api.ts:550` | `provider.startLogin()` | NO | API-key-only-safe |
| `nexus/packages/core/src/api.ts:574` | `provider.submitLoginCode(code)` | NO | API-key-only-safe |
| `nexus/packages/core/src/api.ts:590` | `provider.logout()` | NO | API-key-only-safe |

## Chosen Reroute Strategy

**Strategy A — gate at `isAvailable()`.**

Plan 39-02 will modify `ClaudeProvider.isAvailable()` to delete the `~/.claude/.credentials.json` existence branch (lines 293-302). After this change, ProviderManager's fallback chain will skip `ClaudeProvider` for OAuth-only users (instead of skipping into a thrown error), preserving the existing Kimi-primary chat experience for subscription users.

`ClaudeAuthMethodMismatchError` is reserved for the genuinely unexpected misroute case (a caller bypasses `isAvailable()` and invokes `chat()` directly with an API-key-mode misconfiguration), where the typed error correctly crashes loud per D-39-06.

**Rationale:** Strategy B (mark the typed error as fallbackable in `manager.ts:isFallbackableError`) would silently swallow the explicit "use SdkAgentRunner" signal — defeats D-39-06. Strategy A confines the change to a single file (`claude.ts`), preserves existing behavior for the dominant subscription-user-on-Kimi-primary deployment, and keeps `manager.ts` untouched.

## Carry-forwards Count

**0** TODO(FR-RISK-01-followup) comments. Strategy A handles all subscription-mode-reachable callers cleanly.

## New Callers Discovered Beyond Planning-Time Grep

**None** — the audit confirmed exactly the four api.ts handlers and the three manager.ts fallback-loop entry points already enumerated in the planning context. No surprise callers in `livos/`, no other entry points anywhere in `nexus/` outside the documented set.

## Sacred File Baseline SHA

```
nexus/packages/core/src/sdk-agent-runner.ts
2b3b005bf1594821be6353268ffbbdddea5f9a3a
```

This SHA is the truth-anchor for Plans 39-02 (verify before + after edits) and 39-03 (`BASELINE_SHA` constant in `sdk-agent-runner-integrity.test.ts`).

## Working Tree Cleanliness

`git status` after this plan shows ONLY:
- `.planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md` (added)
- `.planning/phases/39-risk-fix-close-oauth-fallback/39-01-SUMMARY.md` (this file, added)

Pre-existing untracked items unrelated to Phase 39 (the `.claude/worktrees/` workspace clones, `.claude/settings.local.json` modification, two `livinity_analysis_report.*` files at repo root) are out of scope and not staged.

No source-file modifications. Sacred file untouched.
