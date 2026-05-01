# Phase 40: Per-User Claude OAuth + HOME Isolation - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning
**Mode:** `--chain` (interactive discuss; user answered 4 grey areas + Claude provided professional recommendation on the 5th)

<domain>
## Phase Boundary

Multi-user Mini PC supports per-user `claude login`. Each user's OAuth credentials live in a synthetic per-user `.claude/` directory under `/opt/livos/data/users/<user_id>/`. When `SdkAgentRunner` spawns the `claude` CLI for a request, HOME points to the calling user's synthetic dir — making cross-user OAuth credential leak structurally impossible. Single-user mode (multi-user toggle off) preserves current behavior unchanged (`/root/.claude/`).

**Scope anchor:**
- Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` gets ONE additive optional parameter (`homeOverride?: string` in run options) + ONE line modified (line 266: `HOME: opts.homeOverride || process.env.HOME || '/root'`). Backward-compatible — every existing caller behaves byte-identically.
- New per-user `.claude/` dir creation in `livos/packages/livinityd/source/` (multi-user-mode-only)
- Per-user `claude login` invocation (server-side subprocess with HOME set to user's dir) — extends existing OAuth button in Settings > AI Configurations > Claude
- tRPC route to spawn per-user `claude login` and stream device-flow status to UI

**Out of scope:** Broker (Phase 41+), marketplace integration (Phase 43), usage dashboard (Phase 44), real Linux user accounts (deferred indefinitely — synthetic dirs are the chosen pattern), client-side PKCE (the existing UI works server-side).

</domain>

<decisions>
## Implementation Decisions

### Sacred File Treatment (D-40-01..03)
- **D-40-01:** **Sacred = behavior-preserving, NOT byte-identical.** The "sacred" rule means existing callers must observe identical behavior post-Phase-40. An additive optional parameter that defaults to current behavior IS behavior-preserving. The byte-identical guard from Phase 39 was specific to that phase's scope; Phase 40 explicitly relaxes it for this surgical change.
- **D-40-02:** Edit `nexus/packages/core/src/sdk-agent-runner.ts`:
  - Add `homeOverride?: string` to the `RunOptions` (or equivalent) interface — the type that `run()` accepts
  - Modify line 266 from `HOME: process.env.HOME || '/root'` to `HOME: opts.homeOverride || process.env.HOME || '/root'`
  - Add a JSDoc comment above the new field: `/** Override HOME env for the spawned claude CLI subprocess. Used for per-user OAuth credential isolation in multi-user mode. Default: process.env.HOME (same as before). */`
- **D-40-03:** Phase 39's `sdk-agent-runner-integrity.test.ts` will fail because the file SHA changes. Update the test to record a new BASELINE_SHA pinned to the post-Phase-40 file, with a comment documenting why (Phase 40 added homeOverride). Future phases (41+) sacred guard continues from this new baseline.

### User HOME Resolution (D-40-04..06)
- **D-40-04:** Per-user HOME path: `/opt/livos/data/users/<user_id>/.claude/` (synthetic dir; no real Linux user accounts). Pattern matches existing LivOS multi-user infrastructure (apps.ts `installForUser`).
- **D-40-05:** File mode for per-user `.claude/`: 0700, owner = the Linux user running livinityd (typically `bruce` or `livinity`). Cross-user file read attempts cannot succeed because all per-user dirs are owned by the same Linux user — isolation is enforced at the application layer (livinityd never reads another user's `.claude/`), not at OS layer. Honest framing in tests + docs: "synthetic isolation, not POSIX-enforced isolation."
- **D-40-06:** Directory creation happens lazily on first per-user `claude login` invocation. No batch migration of existing users — they only get a `.claude/` dir when they click "Sign in".

### Single-User Mode Behavior (D-40-07)
- **D-40-07:** When `multi_user_mode == false` (the toggle), Phase 40 logic is bypassed entirely. The existing single-user OAuth flow (admin uses `/root/.claude/.credentials.json`) is preserved unchanged. The `homeOverride` parameter is simply not passed to SdkAgentRunner — it falls back to `process.env.HOME` which on Mini PC is `/root` (when livinityd runs as root) or `/home/bruce` (when as bruce). Both work.

### OAuth Flow (D-40-08..10)
- **D-40-08:** Existing UI surface preserved: Settings > AI Configurations > Claude > "Sign in with Claude sub" button (single-user mode) / "Connected to Claude / Authenticated via sdk-subscription / Sign Out" (logged in). Phase 40 extends this to be **per-user-aware in multi-user mode**: each logged-in LivOS user sees their own connection status; clicking "Sign in" runs `claude login` with HOME set to their synthetic dir.
- **D-40-09:** `claude login` invocation is server-side: backend tRPC route reads `ctx.currentUser.id` from JWT, sets HOME to `/opt/livos/data/users/<id>/.claude/`, spawns `claude login --no-browser` subprocess, captures the device code from stdout, returns it to UI via tRPC subscription. UI shows the device code + `https://claude.ai/oauth/device` link. Polling: backend polls subprocess until login completes (or timeout 5 min), emits status to UI.
- **D-40-10:** Token refresh / re-auth: handled by `claude` CLI internally (it manages `.credentials.json` lifecycle). UI listens for SdkAgentRunner errors mentioning auth (e.g., "OAuth token expired") and surfaces a "Reconnect" banner. No periodic check — on-failure detection only (lazy, low-overhead).

### Sacred File Test Update (D-40-11)
- **D-40-11:** Phase 39's `sdk-agent-runner-integrity.test.ts` currently pins SHA `2b3b005bf1594821be6353268ffbbdddea5f9a3a`. Update this constant to the new post-Phase-40 SHA. The test STAYS — it just protects against drift from a new baseline. Add a comment in the test pointing to this CONTEXT.md: `// BASELINE updated 2026-04-30 by v29.3 Phase 40 (homeOverride addition). See .planning/phases/40-.../40-CONTEXT.md D-40-02.`

### Multi-User Toggle Awareness (D-40-12)
- **D-40-12:** Read `multi_user_mode` setting from existing config (Redis key `nexus:config:multi_user_mode` OR similar — discovery in Plan 1). If false, Phase 40 logic is dead code: no per-user dirs, no homeOverride passed to SdkAgentRunner. If true, every SdkAgentRunner.run() call from a user-context (chat / future broker) MUST resolve user_id and pass homeOverride.

### Tests (D-40-13..15)
- **D-40-13:** Unit test for sacred file: assert `homeOverride` parameter is honored when passed (mock spawn, verify HOME in safeEnv) AND falls back to `process.env.HOME` when omitted (verify backward compat).
- **D-40-14:** Integration test for per-user dir: as user A, trigger `claude login`, verify `/opt/livos/data/users/<a>/.claude/` is created with mode 0700. As user B, repeat, verify `<b>/.claude/` is separate. Assert backend never attempts to read `<a>/.claude/` from user B's request context.
- **D-40-15:** Update `sdk-agent-runner-integrity.test.ts` BASELINE_SHA constant to new post-Phase-40 hash. CI gate: `git hash-object` must match.

### Out-of-Scope Carry-Forwards (D-40-16)
- **D-40-16:** Real Linux user accounts (`useradd` per LivOS user) is OUT for Phase 40 and the rest of v29.3. Synthetic dirs + livinityd-enforced isolation is acceptable for the security model: trust boundary is "livinityd is honest." If a future phase needs OS-level isolation (e.g., for security audit compliance), revisit then.

### Claude's Discretion
- Exact tRPC route name for `claude login` invocation (`auth.claude.startLogin` / `claudeAuth.connect` / etc.) — planner picks
- Whether device code UI is a modal, inline, or separate page — planner picks (based on existing AI Configurations UI density)
- Subprocess spawn library (execFile vs spawn vs node:child_process directly) — planner picks based on existing patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 40 source files
- `nexus/packages/core/src/sdk-agent-runner.ts` (ONE-line change at line 266 + interface addition; otherwise preserved)
- `livos/packages/livinityd/source/modules/ai/` (where `claude login` invocation route will live)
- `livos/packages/livinityd/source/modules/users/` (multi-user infrastructure — read for user_id resolution patterns)
- `livos/packages/livinityd/source/modules/apps/apps.ts` (`installForUser` pattern — `/opt/livos/data/users/<id>/...` dir creation reference)
- `livos/ui/src/routes/settings/...` (existing AI Configurations > Claude UI — find exact path during plan-phase)

### Project-level constraints
- `.planning/PROJECT.md` (D-NO-BYOK, D-TOS-01, sacred constraint — interpreted as behavior-preserving per D-40-01)
- `.planning/REQUIREMENTS.md` (FR-AUTH-01, FR-AUTH-02, FR-AUTH-03)
- `.planning/ROADMAP.md` (Phase 40 success criteria)
- `.planning/research/v29.3-marketplace-broker-seed.md` (Anthropic ToS analysis — per-user OAuth is the compliant pattern)

### Phase 39 artifacts (immediate predecessor)
- `.planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md` (caller surface for ClaudeProvider — same callers may be affected by HOME isolation if any are user-context)
- `.planning/phases/39-risk-fix-close-oauth-fallback/39-SUMMARY.md` (sacred file SHA baseline = `2b3b005bf1594821be6353268ffbbdddea5f9a3a` — Phase 40 updates this)

### Memory references
- `feedback_subscription_only.md` — sacred SdkAgentRunner; D-40-01 EXPLICITLY relaxes byte-identical to behavior-preserving for this surgical change
- `MEMORY.md` Multi-User Architecture (v7.0) — synthetic dir pattern, JWT user resolution

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sdk-agent-runner.ts:264-274` — `safeEnv` object construction; HOME line is the only modification needed
- `livos/packages/livinityd/source/modules/apps/apps.ts` — `installForUser` shows the per-user dir creation pattern (`/opt/livos/data/users/<id>/...`)
- `livos/packages/livinityd/source/modules/auth/is-authenticated.ts` — `ctx.currentUser` resolution from JWT (per MEMORY.md)
- Existing Settings > AI Configurations > Claude UI — the OAuth button + status surface already exists; Phase 40 extends to per-user

### Established Patterns
- Synthetic per-user dirs at `/opt/livos/data/users/<user_id>/...` (apps, settings, etc. all follow this)
- Multi-user toggle: gates per-user logic everywhere (look for `multi_user_mode` config key)
- tRPC subscription pattern for long-running ops (used by app install, factory reset)
- `claude` CLI as subprocess (already happening in SdkAgentRunner; Phase 40 reuses for `claude login`)

### Integration Points
- `SdkAgentRunner` constructor / `run()` — add `homeOverride` parameter
- AI module routes (livinityd `modules/ai/`) — add `claude login` device-flow route
- Settings UI Claude card — extend to be per-user when multi-user mode on
- multi_user_mode setting — read at SdkAgentRunner.run() call site to decide whether to pass homeOverride

</code_context>

<specifics>
## Specific Ideas

- **Sacred file change is surgical and reversible:** ~5 lines net (interface addition + line 266 modification + JSDoc). If something breaks post-deploy, `git revert` of Plan 40-02 commit cleanly restores Phase 39's baseline.
- **No batch migration:** Per-user `.claude/` dirs are created lazily on first login. Existing single-user setup (admin's `/root/.claude/`) keeps working without any backfill.
- **Honest security framing:** Synthetic dirs + livinityd-enforced isolation is "trust the daemon" model, not POSIX-enforced. Document this explicitly in tests + a code comment so we don't oversell isolation guarantees.
- **OAuth UI mostly done:** User confirmed Settings > AI Configurations > Claude already shows "Connected to Claude / Sign Out" + "Sign in with Claude sub" button. Phase 40 only adds per-user awareness.

</specifics>

<deferred>
## Deferred Ideas

- **Real Linux user accounts (`useradd`)** — would give POSIX-enforced isolation. Defer indefinitely; revisit if security audit requires.
- **Process pool per user (Option C from grey area discussion)** — needed only if Mini PC scales to 50+ concurrent users. Phase 41+ broker can revisit.
- **Periodic token expiry checks** — not needed; on-failure detection is sufficient.
- **Cross-user audit trail of who logged in when** — not in Phase 40 scope; Phase 44 dashboard can surface this.
- **OAuth Push notifications when token expiring soon** — UX enhancement; defer.

</deferred>

---

*Phase: 40-per-user-claude-oauth-home-isolation*
*Context gathered: 2026-04-30*
*Decisions: 16 (D-40-01..D-40-16). Sacred constraint EXPLICITLY relaxed for one surgical edit per D-40-01.*
