# Phase 39: Risk Fix — Close OAuth Fallback - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in 39-CONTEXT.md.

**Date:** 2026-04-29
**Phase:** 39-risk-fix-close-oauth-fallback
**Mode:** `--auto` (autonomous milestone execution; user asleep, all grey areas auto-resolved per locked decisions D-RISK-01 / D-NO-BYOK / D-TOS-02 / sacred-file constraint)
**Areas auto-resolved:** Removal Strategy, Error Type & Message, Caller Audit & Routing, Tests, Sacred File Constraint, Deployment & Rollout

---

## Removal Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Delete OAuth-creds-file fallback only (lines 99-115) | Strict reading of FR-RISK-01 — only the `claudeAiOauth` reference removed. ANTHROPIC_AUTH_TOKEN env path stays. | |
| Delete BOTH `authToken:` paths (lines 91-115) | Both fallbacks bypass the legitimate Agent SDK route; spirit of D-NO-BYOK + D-TOS-02 covers both. | ✓ |
| Refactor into a single guarded path | Smaller diff but contradicts D-RISK-01's "deleted (not refactored)" wording. | |

**Auto-mode reasoning:** D-RISK-01 says "deleted, not refactored". Sacred SdkAgentRunner is the only legitimate subscription path, so any `authToken:` to raw `@anthropic-ai/sdk` is by definition a fingerprint-detection risk regardless of the token's source. Deleting both narrows the attack surface and the maintenance surface.

---

## Error Type & Message

| Option | Description | Selected |
|--------|-------------|----------|
| Generic `Error` with descriptive message | Smallest diff, type-erased catches. | |
| Typed `ClaudeAuthMethodMismatchError` class with discriminator | Callers can route programmatically without string parsing. | ✓ |
| Result-type union (no throw) | Largest diff; would also force changes in callers' signatures. | |

**Auto-mode reasoning:** Callers in `manager.ts` / `index.ts` / `api.ts` may want to route the error to a UI message ("subscription users — use Agent SDK") without inspecting strings. Typed error class with `mode` discriminator is the defensive choice.

---

## Caller Audit & Routing

| Option | Description | Selected |
|--------|-------------|----------|
| Audit + reroute every caller in this phase | Comprehensive; closes the risk fully. | ✓ |
| Audit only; reroute in subsequent phases | Faster to ship Phase 39, but FR-RISK-01 acceptance requires actual closure. | |
| Audit + add runtime guard but defer reroutes | Hybrid; leaves silent breakage potential. | |

**Auto-mode reasoning:** Phase boundary is "Risk Fix — Close OAuth Fallback". A close-the-fallback phase that leaves callers crashing in production is not closure.

---

## Tests

| Option | Description | Selected |
|--------|-------------|----------|
| 3 unit tests + grep-regression test + sacred-file integrity check | Comprehensive — covers the deletion behavior + prevents re-introduction + verifies sacred file. | ✓ |
| Unit tests only | Misses re-introduction risk + sacred-file drift. | |
| No new tests | Unacceptable per phase success criteria. | |

**Auto-mode reasoning:** Success criterion #1 is grep-based; success criterion #4 is byte-identity of SdkAgentRunner. Both must be enforceable in CI, not just verified once at PR time.

---

## Sacred File Constraint

| Option | Description | Selected |
|--------|-------------|----------|
| `sdk-agent-runner.ts` byte-identical, verified by `git diff` + test | Hard guarantee. | ✓ |
| Manual review only | Drift could slip through. | |

**Auto-mode reasoning:** Sacred-file rule is locked at PROJECT.md and STATE.md level. Mechanical enforcement > human review.

---

## Deployment & Rollout

| Option | Description | Selected |
|--------|-------------|----------|
| Single PR + single deploy via `update.sh` to Mini PC only | Small change, low risk; staged rollout adds complexity without value. | ✓ |
| Feature flag gated rollout | Overkill for a 15-line deletion. | |
| Multi-host staged | D-NO-SERVER4 — only Mini PC anyway. | |

**Auto-mode reasoning:** Change is contained, rollback path exists (Phase 32 livos-rollback.sh + git revert), and Mini PC is the sole target.

---

## Claude's Discretion

- Inline typed-error in `claude.ts` vs separate `errors.ts` file — planner picks
- Vitest vs separate npm script for grep-regression — planner picks
- TODO comment placement if any caller can't be rerouted — planner picks (with code review audit)

## Deferred Ideas

- Per-user OAuth flow — Phase 40
- `livinity-broker` server — Phase 41
- OpenAI-compat translation — Phase 42
- Marketplace manifest auto-injection — Phase 43
- Usage dashboard — Phase 44
- `getApiKey()` discriminated-union refactor — out of scope
- Telemetry on warned-fallback occurrences — defer to dashboard phase
