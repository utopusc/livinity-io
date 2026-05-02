---
phase: 47-ai-diagnostics
plan: 03
subsystem: livinityd/diagnostics
tags: [fr-model, diagnostic-surface, branch-n, sacred-file-untouched]
requires:
  - 47-01-DIAGNOSTIC.md (verdict=neither captured at 2026-05-01T22:42:05Z)
  - livinityd factory-DI pattern (fail2ban-admin/active-sessions.ts)
provides:
  - livos/packages/livinityd/source/modules/diagnostics/model-identity.ts
  - livos/packages/livinityd/source/modules/diagnostics/model-identity.test.ts
  - diagnoseModelIdentity() facade re-exported from diagnostics/index.ts (consumed by Plan 47-04 routes)
affects: []
tech-stack:
  added: []
  patterns:
    - Factory DI for execFile + fetch (mirrors fail2ban-admin/active-sessions.ts)
    - Bare tsx + node:assert/strict test runner (no Vitest)
    - G-10 D-NO-SERVER4 hard-wall via FORBIDDEN_HOSTS constant
key-files:
  created:
    - livos/packages/livinityd/source/modules/diagnostics/model-identity.ts
    - livos/packages/livinityd/source/modules/diagnostics/model-identity.test.ts
  modified:
    - livos/packages/livinityd/source/modules/diagnostics/index.ts (barrel re-export + diagnoseModelIdentity facade)
decisions:
  - Branch N selected (verdict=neither from 47-01-DIAGNOSTIC.md). Diagnostic surface ships; NO remediation lands.
  - Sacred file nexus/packages/core/src/sdk-agent-runner.ts intentionally untouched (D-40-01 ritual NOT invoked).
  - update.sh post-copy mtime guard NOT added (Branch A skipped — Mini PC has only 1 @nexus+core dir, no drift risk).
  - Integrity test BASELINE_SHA NOT re-pinned (Phase 45's audit-only re-pin remains the most recent v29.4 entry).
metrics:
  duration: ~3m
  completed: 2026-05-01T23:06:41Z
  tasks_executed: 2 of 6 (Tasks 1+2)
  tasks_skipped: 3 (Tasks 4, 5, 6 — Branch A/B/C remediation, correctly skipped per Branch N)
  tasks_decision: 1 (Task 3 — auto-accepted Branch N per user autonomous directive)
---

# Phase 47 Plan 03: FR-MODEL Backend (Branch N — diagnostic surface only) Summary

Shipped the `model-identity.ts` runtime-callable 6-step diagnostic + 7-test fixture suite as a livinityd module. **No remediation landed** — Plan 47-01 captured `verdict: neither` (Mini PC AI identity stack is operating coherently), so Branch N executed: diagnostic surface ONLY, sacred file `nexus/packages/core/src/sdk-agent-runner.ts` untouched (SHA still `4f868d31...`), `update.sh` untouched, integrity test BASELINE_SHA not re-pinned. The Phase 45 audit-only re-pin remains the most recent v29.4 entry. Plan 47-04 will consume the `diagnoseModelIdentity()` facade for the admin UI route.

## Verdict Trace (47-01 → 47-03)

| Source | Verdict | Branch | Rationale |
|--------|---------|--------|-----------|
| 47-01-DIAGNOSTIC.md (Mini PC SSH capture, 2026-05-01T22:42:05Z) | `neither` | **N** | Step 1 broker probe matched expected; Step 4 single pnpm-store dir; Step 6 marker present in resolved dist. All 6 steps green. |

Per the Plan 47-03 frontmatter `files_modified` conditional matrix:
- Branch N condition: "NO source modifications beyond Tasks 1-2 above"
- Tasks 1-2: SHIPPED (model-identity.ts, model-identity.test.ts, index.ts barrel update)
- Tasks 4 (update.sh): SKIPPED — verdict ≠ dist-drift / both
- Task 5 (sacred-file pre-edit gate): SKIPPED — verdict ≠ source-confabulation / both
- Task 6 (sacred edit + integrity re-pin): SKIPPED — verdict ≠ source-confabulation / both
- Task 3 (decision gate): auto-accepted Branch N per user autonomous-mode directive

## What Shipped

### 1. `livos/packages/livinityd/source/modules/diagnostics/model-identity.ts` (343 LOC)

6-step on-Mini-PC diagnostic with DI factory pattern. Mirrors `fail2ban-admin/active-sessions.ts`.

**Exports:**
- `realDiagnoseModelIdentity` — production singleton (real `child_process.execFile` + `globalThis.fetch`)
- `makeDiagnoseModelIdentity(deps)` — factory for tests
- Type aliases: `DiagnoseModelIdentityResult`, `ModelIdentityVerdict`, `ModelIdentityDeps`, `ExecFileFn`, `FetchFn`

**Verdict computation buckets:**
- `clean` — Step 1 match, Step 4 single dir, Step 6 marker present
- `dist-drift` — Step 4 multi-dir AND Step 6 marker missing AND Step 1 match
- `source-confabulation` — Step 6 marker present BUT Step 1 mismatch
- `both` — Step 4 multi-dir AND Step 6 marker missing AND Step 1 mismatch
- `inconclusive` — Step 1 fetch errored OR no other case matched

**G-10 D-NO-SERVER4 hard-wall:** `FORBIDDEN_HOSTS = ['45.137.194.103', '45.137.194.102']`. `diagnose()` throws `D-NO-SERVER4: refusing to diagnose against forbidden host <ip>` if `brokerBaseUrl` resolves to either Server4 or Server5. Mini PC localhost only.

**Graceful degrade:** `pgrep`/`cat`/`ls`/`readlink`/`grep`/`stat` ENOENT all swallowed per step. Step 3 → `'NONE'`; Steps 4-6 → empty fields. Only Step 1 fetch errors poison the verdict (`→ 'inconclusive'`).

### 2. `livos/packages/livinityd/source/modules/diagnostics/model-identity.test.ts` (274 LOC)

7-test suite, bare `tsx` + `node:assert/strict`:

| # | Name | Verdict / Behavior |
|---|------|-------------------|
| 1 | fixture A (clean)               | verdict=clean, match=true, driftRisk=false, markerPresent=true |
| 2 | fixture B (both)                | verdict=both |
| 3 | fixture C (dist-drift)          | verdict=dist-drift |
| 4 | fixture D (source-confabulation)| verdict=source-confabulation |
| 5 | pgrep ENOENT                    | step3='NONE', verdict=clean (step3 doesn't poison) |
| 6 | broker fetch throws             | verdict=inconclusive, step1.error populated |
| 7 | D-NO-SERVER4 hard-wall          | brokerBaseUrl=Server4 → throws /D-NO-SERVER4/ |

Result: **7 passed, 0 failed** (final run 2026-05-01T23:06:41Z).

### 3. `livos/packages/livinityd/source/modules/diagnostics/index.ts` (barrel update)

Added re-exports for `realDiagnoseModelIdentity`, `makeDiagnoseModelIdentity`, plus types. Added `diagnoseModelIdentity()` async facade so Plan 47-04's adminProcedure can `import {diagnoseModelIdentity} from './diagnostics/index.js'` cleanly.

## What Was Deliberately Skipped (Branch A / B / C)

Per the verdict-driven branch matrix in the plan's frontmatter, Branch N's task tree explicitly excludes:

### Branch A — `update.sh` post-copy resolved-symlink mtime check
- **Why skipped:** verdict ≠ `dist-drift` / `both`. Mini PC pnpm-store has 1 `@nexus+core*` dir (Step 4 confirmed); no drift; the existing Phase 31 BUILD-02 multi-dir COPY loop is sufficient.
- **What would have shipped:** ~14 LOC `RESOLVED_DIST_FILE` mtime guard inserted after `update.sh:507` (`ok "Nexus dist linked to ..."`).
- **Status:** `update.sh` byte-identical to pre-plan state.

### Branch B — Sacred-file surgical edit + integrity test re-pin
- **Why skipped:** verdict ≠ `source-confabulation` / `both`. Step 1 broker probe returned `claude-opus-4-7` (matches expected); identity line correctly reports actually-running tier; no confabulation.
- **What would have shipped:** Surgical edit at `sdk-agent-runner.ts:269-281` switching `let systemPrompt = string` → `const systemPrompt = {type:'preset',preset:'claude_code',append:string}` union per Anthropic Agent SDK. Plus integrity test BASELINE_SHA re-pin with append-only audit comment (would be the SECOND v29.4 re-pin after Phase 45's audit-only entry).
- **Status:** `nexus/packages/core/src/sdk-agent-runner.ts` byte-identical (SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — verified pre AND post). `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` byte-identical.
- **D-40-01 ritual NOT invoked.** Phase 45's Carry-Forward C2 audit-only re-pin remains the most recent v29.4 entry.

### Branch C — Both A and B
- **Why skipped:** verdict ≠ `both`. Single-dir + matched probe + marker present rules out compound failure.

### Task 5 (checkpoint:human-verify gate)
- **Why skipped:** Sacred-file pre-edit SHA capture gate exists for Branch B/C only. With Branch N selected, no edit is planned — the gate has no purpose.

## Sacred-File Invariant — Verified

| Check | Pre-plan | Post-plan | Status |
|-------|----------|-----------|--------|
| `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | UNCHANGED |
| `git diff --shortstat HEAD~2..HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` | n/a | empty | UNCHANGED |
| `git diff --shortstat HEAD~2..HEAD -- nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` | n/a | empty | UNCHANGED |
| `git diff --shortstat HEAD~2..HEAD -- update.sh` | n/a | empty | UNCHANGED |

Phase 40 + Phase 45 audit-comment entries in `sdk-agent-runner-integrity.test.ts` PRESERVED (no append, no delete — the file wasn't touched).

## Out-of-Scope Finding (Carry-Forward from 47-01)

47-01-DIAGNOSTIC.md flagged a *broker tier-bypass* bug: `agent-runner-factory.ts` does NOT thread a `tier` field into `/api/agent/stream`, so `api.ts:465` defaults to `tier ?? 'sonnet'`. Net effect: every broker request runs on sonnet regardless of caller's `model` field. **Out of scope for Phase 47** (FR-MODEL-01 4-bucket verdict scope is identity-line correctness only). Filed for v29.5+ tracker.

This does NOT affect FR-MODEL closure: the identity line is internally consistent with the actually-running tier (no confabulation), so B-05 source-edit was correctly not warranted.

## Deviations from Plan

None — plan executed exactly as written for Branch N.

The plan's frontmatter explicitly anticipated Branch N as one of four conditional paths and pre-specified "NO source modifications beyond Tasks 1-2 above" for that branch. Tasks 4-6 were not "deviations" — they were conditional task blocks correctly disposed of per the verdict.

The Task 3 decision gate was auto-accepted per the user's autonomous-mode directive (the user's invocation message confirmed: "auto-accept Branch N decision per user's autonomous-mode directive").

## Commits

| # | Hash | Subject |
|---|------|---------|
| 1 | `7fb22dab` | feat(47-03): model-identity.ts — FR-MODEL 6-step diagnostic surface (Branch N pre) |
| 2 | `28b16493` | test(47-03): model-identity.test.ts — 7 verdict + degrade + hard-wall tests |

## Test / Verification Counts

- model-identity.test.ts: **7 passed, 0 failed**
- Task 1 acceptance verify: **OK** (343 LOC > 200 min, all required exports + verdict literals + Server4/5 IPs + identity-line constant present, index.ts wrapper present)
- Task 4 acceptance verify (Branch N invariant): **OK** (`update.sh` untouched)
- Task 6 acceptance verify (Branch N invariant): **OK** (sacred file untouched, no `type: 'preset'` introduced)
- Sacred file SHA guard: **`4f868d318abff71f8c8bfbcf443b2393a553018b`** pre = post

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/diagnostics/model-identity.ts` exists (FOUND)
- [x] `livos/packages/livinityd/source/modules/diagnostics/model-identity.test.ts` exists (FOUND)
- [x] Commit `7fb22dab` exists (FOUND)
- [x] Commit `28b16493` exists (FOUND)
- [x] Sacred file SHA still `4f868d318abff71f8c8bfbcf443b2393a553018b` (CONFIRMED)
- [x] `update.sh` byte-identical (CONFIRMED via git diff --shortstat)
- [x] integrity test byte-identical (CONFIRMED via git diff --shortstat)
- [x] All 7 tests pass (CONFIRMED at 2026-05-01T23:06:41Z)
