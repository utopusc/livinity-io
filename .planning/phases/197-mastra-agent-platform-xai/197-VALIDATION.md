# Phase 197 — Validation (Nyquist Sampling Continuity)

**Phase:** 197 — Liv AI Mastra Agent + Provider Router + Dock App
**Plans:** 6 (197-01, 197-02, 197-03, 197-04, 197-05, 197-06)
**Waves:** 4
**Gathered:** 2026-05-22 (revision-2 — added during plan-checker iteration 1)

## Sampling-Continuity Assertion (Nyquist Dimension 8)

Every executable task across all 6 plans in Phase 197 carries an `<automated>` verify command. The aggregate test signal samples the implementation densely enough that no verification gap exists between adjacent tasks — each commit lands with a fast (<60s per task), deterministic command that proves the task's `<done>` condition.

## Per-Plan Test Inventory

| Plan | Task | Automated verify | Approx. test count |
|------|------|------------------|--------------------|
| 197-01 | 1 — dep pin | `grep` on package.json + `pnpm list @mastra/core` | grep-only |
| 197-01 | 2 — ProviderRouter + LivOSMastra (typed slots + attach helpers, B-02 lock) | `pnpm vitest run modules/mastra/` | ≥12 |
| 197-01 | 3 — boot DI | `grep` on source/index.ts + `tsc --noEmit` | grep + tsc |
| 197-02 | 1 — McpBridge (incl. destructiveToolNames export, N-01 lock) | `pnpm vitest run modules/mastra/mcp-bridge.test` | ≥11 |
| 197-03 | 1 — Memory + pgvector migration | `pnpm vitest run modules/mastra/memory.test` (+ migration test) | ≥6 |
| 197-04 | 1 — wrapToolWithApproval (W-02 lock) | `pnpm vitest run modules/mastra/agents/wrap-tool-with-approval.test` | ≥6 |
| 197-04 | 2 — createLivAiAgent + wrapDestructiveTools | `pnpm vitest run modules/mastra/agents/liv-ai.test` | ≥10 |
| 197-05 | 1 — ApprovalManager + redactError | `pnpm vitest run modules/mastra/approval-manager modules/mastra/redact-error` | ≥9 |
| 197-05 | 2 — createMastraRouter (W-03 SSE lock, W-02 Reject-no-abort lock) | `pnpm vitest run modules/server/trpc/mastra-router.test` | ≥10 |
| 197-05 | 3 — boot wire-up (uses Plan 197-01 attach helpers, B-02 lock) | `grep` + `tsc --noEmit` + `pnpm vitest run` (regression) | grep + tsc + regression |
| 197-06 | 1 — useLivAi hook + ApprovalModal + redactArgsForDisplay | `pnpm vitest run src/features/liv-ai/use-liv-ai.test src/features/liv-ai/approval-modal.test` | ≥11 |
| 197-06 | 2 — MessageBubble + ThreadSidebar + LivAiChatWindow | `pnpm vitest run src/features/liv-ai/liv-ai-chat-window.test` + `pnpm --filter ui build` | ≥4 + build |
| 197-06 | 3 — systemApps + router (N-02 router-grep lock) | `grep` + `pnpm --filter ui build` + `pnpm --filter ui vitest run` (regression) | grep + build + regression |

## Aggregate test budget

- **livinityd (Plans 197-01..05):** ≥64 new vitest assertions across `modules/mastra/**` + `modules/server/trpc/mastra-router.test`
- **UI (Plan 197-06):** ≥15 new vitest assertions across `src/features/liv-ai/**`
- **Pre-existing baseline preserved:** Phase 196-05 livinityd 73/73 + UI 23/23 onboarding-flow MUST remain green (each plan's Task 3 / final task includes a regression-run assertion)

## Full-suite re-validation command (run at end of phase)

```bash
cd livos/packages/livinityd && pnpm vitest run modules/mastra/ modules/server/trpc/
cd livos/packages/ui && pnpm vitest run src/features/liv-ai/ src/features/onboarding-flow/
```

Expected: ≥79 new PASS in livinityd + ≥15 new PASS in UI + zero regressions on pre-existing suites.

## Locks enforced via verification grep (cross-plan)

| Lock | Where enforced | Acceptance grep |
|------|---------------|------------------|
| **B-02** (LivOSMastra contract is FINAL in Wave 1) | 197-01 Task 2 ships typed slots + attach helpers; 197-04 + 197-05 commits do NOT modify index.ts | `git diff <plan-04-base>..HEAD -- livos/packages/livinityd/source/modules/mastra/index.ts | wc -l` returns 0 for both 197-04 and 197-05 |
| **W-02** (Reject is "tool-returned-denied", not "run-aborted") | 197-04 ships REJECTED_TOOL_RESULT sentinel + wrapToolWithApproval; 197-05 SSE handler does NOT abort on Reject | `grep -E "if \(!approved\).*abort" mastra-router.ts` returns 0 |
| **W-03** (SSE pattern locked at planning time) | 197-05 Task 2 read_first includes the locked grep precedent step; skeleton uses tRPC v11 native `.subscription(async function*)` | Code in mastra-router.ts uses `.subscription(async function*` literally |
| **N-01** (destructiveToolNames named export) | 197-02 exports `destructiveToolNames: ReadonlySet<string>`; 197-04 + 197-05 import + use via `.has(toolName)` | `grep -c "destructiveToolNames" mastra-router.ts` ≥ 2 AND `grep -c "destructiveToolNames" liv-ai.ts` ≥ 1 |
| **N-02** (router pattern pre-grep) | 197-06 Task 3 read_first runs the router grep step and records findings in summary.md before adding route entry | Plan 197-06 Task 3 read_first contains the literal grep command for router.tsx |

## Sacred SHA

Every commit across all 6 plans MUST preserve `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` (pre-commit hook enforces 20-file sacred-SHA registry verification). Phase 197 introduces NO modifications to `liv/packages/core/**` — all new code lives under `livos/packages/livinityd/source/modules/mastra/**` + `livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts` + `livos/packages/ui/src/features/liv-ai/**`.

## Verification commands run-list (end of phase)

```bash
# 1. Sacred SHA registry (must run before any plan starts and after the final commit)
bash scripts/verify-sacred-sha.sh

# 2. livinityd full mastra suite + tRPC mastra router
cd livos/packages/livinityd && pnpm vitest run modules/mastra/ modules/server/trpc/mastra-router.test

# 3. UI Liv AI feature suite + pre-existing baseline regression
cd livos/packages/ui && pnpm vitest run src/features/liv-ai/ src/features/onboarding-flow/

# 4. UI build (Vite production build must remain green)
cd livos/packages/ui && pnpm --filter ui build

# 5. Token-leakage grep — no secret leaks in new files
grep -rE "Bearer |access_token|XAI_API_KEY" livos/packages/livinityd/source/modules/mastra/ livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts livos/packages/ui/src/features/liv-ai/

# 6. Deleted-module reintroduction grep — must return 0
grep -rE "cc-pty|claude-runner|livinity-broker|vault-items|computer-use|autonomous-scheduler" livos/packages/livinityd/source/modules/mastra/ livos/packages/ui/src/features/liv-ai/

# 7. Server4/Server5 reference grep — Mini PC sole deployment target
grep -rE "Server4|Server5|45\.137\.194\.103|45\.137\.194\.102" livos/packages/livinityd/source/modules/mastra/ livos/packages/ui/src/features/liv-ai/
```

All seven commands MUST pass (exit 0 or grep returns 0 matches as documented). Any failure blocks phase close.

## Operator UAT block (Mini PC walk)

Plan 197-05 + 197-06 each carry their own operator UAT block in their `<output>` section. The phase close-out walk lives in Plan 197-06 (the Dock-app surfacing plan):

1. SSH to Mini PC + `bash /opt/livos/update.sh`
2. `sudo bash /opt/livos/scripts/install/pgvector-enable.sh` (one-time, Plan 197-03 step)
3. Open https://bruce.livinity.io → log in → look at Dock → click "Liv AI" icon
4. Window opens → type "list my windows" → expect agent invokes `luse_list_windows` tool, returns window list
5. Type "click at 100,200" → approval modal appears → click Approve → expect cursor click on remote desktop
6. **W-02 lock verification (live):** Type a destructive command → modal opens → click Reject → expect agent CONTINUES with text reply explaining the rejection (NOT a stream-terminated / 500). The Mastra agent.stream chunk sequence should show: `tool-call` → `tool-call-approval` → `tool-result` (containing REJECTED_TOOL_RESULT sentinel) → `text-delta` (agent explaining the rejection) → `finish`.
7. Cancel: send a long-running prompt → click Cancel → expect stream stops within 1 second
8. Cross-session memory: type "my name is bruce" → close window → reopen → type "what's my name?" → expect "bruce" in response (Plan 197-03 working memory)
