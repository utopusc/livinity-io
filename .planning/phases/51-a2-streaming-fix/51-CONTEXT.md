# Phase 51: A2 — Streaming Regression Fix — Context

**Gathered:** 2026-05-02
**Status:** Ready for execution (already executed inline below)
**Mode:** Auto-generated from ROADMAP + Phase 49 fixture (workflow.skip_discuss=true)

<domain>
## Phase Boundary

**Goal:** Restore token-by-token streaming on AI Chat. The user reported "streaming tamamiyla gitmis artik tamamen butun islemi bitirdikten sonra gonderiyor" — AI sends entire response after processing finishes, not progressively.

**In scope (this phase):**
- Defensive `update.sh` UI build hardening: `rm -rf dist` before vite build + correct `verify_build` position (after build, matching the function's documented contract)

**Deferred (NOT in this phase):**
- Sacred file edit for FR-MODEL-02 Branch N reversal — model identity remediation is a SEPARATE concern from streaming. Per Phase 49 verdict A2 was INSUFFICIENT EVIDENCE for narrowing root cause; without Mini PC SSH for live behavior testing, surgical sacred-file edits are too risky in this session. The Branch N decision REMAINS in effect; FR-A2-04 is satisfied by explicit deferral with documented rationale.
- Local code review of nexus core's `api.ts` SSE / WebSocket forwarding for upstream buffering — same rationale as above
- PWA service worker version bump — current `registerType: 'autoUpdate'` should auto-invalidate when build hash changes; the `rm -rf dist` step ensures hash changes happen
</domain>

<decisions>
## Implementation Decisions

### D-51-01 (LOCKED): UI deploy MUST start from clean dist

The v29.4 deploy completed in 1m 2s end-to-end. Vite's UI build alone typically takes 30-60s on this project. A 1m 2s total deploy strongly suggests the UI build was a fast no-op (vite saw source unchanged from cache, kept dist as-is) OR silently skipped.

Either way, the safest defensive fix: `rm -rf dist` immediately before `npm run build`. Forces vite to regenerate every artifact from source. Costs ~30s per deploy (acceptable). Eliminates an entire class of "phantom no-op build" scenarios. Naturally cascades to PWA SW bundle hash change, which forces browser cache invalidation via the existing `registerType: 'autoUpdate'` config.

### D-51-02 (LOCKED): verify_build position must match its documented contract

`verify_build()` at line 287 of `update.sh` is documented as "Call AFTER every build invocation" (line 283 comment). At line 447 (pre-Phase-51), it was being called BEFORE `npm run build` for the UI bundle. This was:
- A no-op on existing installs (passes because previous dist exists)
- A hard-block on fresh installs (exits 1 because dist doesn't exist yet)

Other verify_build calls (lines 459, 473, 477) were already correctly positioned AFTER their builds. The UI line was the lone offender.

Move verify_build to AFTER `npm run build` for consistency with the function contract.

### D-51-03 (Claude's discretion): Defer FR-MODEL-02 Branch N reversal

Per ROADMAP, FR-A2-04 is conditional: "If FR-MODEL-02's Branch N decision is reversed, document the new model-identity preset switch in PROJECT.md Key Decisions". This phase explicitly does NOT reverse Branch N because:

1. Model identity ("hangi modelsin") is a separate behavior from streaming ("token-by-token"). The user's complaint mixed both, but they have different root causes.
2. Phase 43.10 already prepends an identity line in the systemPrompt construction. The "hallucinated identity" issue is a known model-behavior limit — Claude's training-time identity overrides system prompt text in some contexts. Stronger prompt engineering OR using SDK preset mode are both possible fixes, but each requires a sacred-file surgical edit (D-40-01 ritual: byte-counted diff, BASELINE_SHA pin update, audit comment).
3. Without Mini PC SSH access (banned by fail2ban as of Phase 49), we cannot live-verify any sacred-file edit empirically. Shipping a sacred-file edit without live verification violates the lesson from v29.4 ("audit `passed` requires live UAT").
4. FR-A2-04 is satisfied by explicit deferral + documented rationale. The Branch N decision REMAINS in effect through v29.5.

**Recommended follow-up:** After Phase 55 live-verifies whether the `update.sh` fresh-build fix actually restores streaming, a separate phase (e.g., v29.6 Phase 56) addresses model identity if still broken. That phase should batch the sacred-file edit with the integrity test BASELINE_SHA update + audit comment per D-40-01.

</decisions>

<code_context>
## Existing Code Insights

- **`update.sh:434-453`** — Step 5 "Build packages" / UI build block. Pre-Phase-51, line 447 (`verify_build`) was BEFORE line 448 (`npm run build`). All other verify_build calls were correctly AFTER.
- **`update.sh:287`** — `verify_build()` function definition with the explicit "Call AFTER every build invocation" contract in its header comment (line 283).
- **`set -euo pipefail`** at update.sh line 13 — already enabled, so `npm run build 2>&1 | tail -5` propagates exit code if pipefail conditions hit. The verify_build position fix is the only structural change needed.
- **`livos/packages/ui/vite.config.ts:16-72`** — VitePWA config with `registerType: 'autoUpdate'`. When `dist` regenerates, new precache manifest hash triggers browser SW update on next visit (cleanupOutdatedCaches default true). `rm -rf dist` reliably triggers hash change.
- **`nexus/packages/core/src/sdk-agent-runner.ts:264-270`** — Phase 43.10 identity-line prepend lives here. NOT modified in this phase per D-51-03.

</code_context>

<specifics>
## Specific Requirements

- FR-A2-02 (targeted fix applied along Phase 49 verdict) — `update.sh` defensive fresh-build hardening; PWA SW hash invalidation cascades automatically via existing autoUpdate config
- FR-A2-04 (Branch N reversal documentation) — explicit DEFERRAL documented in this CONTEXT.md and Phase 51 SUMMARY.md per D-51-03

</specifics>

<deferred>
## Deferred Ideas

- Sacred file FR-MODEL-02 Branch N reversal → next milestone follow-up phase
- Local audit of nexus core's `api.ts` SSE forwarding for upstream buffering → defer until Phase 55 live-verify shows whether the `update.sh` fix alone restores streaming
- Adding `rm -rf dist` to other Nexus build steps (core/worker/mcp-server) → not needed, those use `npx tsc` (no aggressive caching like vite)
- vite-plugin-pwa explicit cache-bust version bump → not needed, autoUpdate handles it once dist hash changes

</deferred>
