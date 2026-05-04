---
phase: 64-v30-5-final-cleanup-at-v31-entry
plan: 03
subsystem: r-series-classification
tags:
  - phase-64
  - r-series
  - phase-63-broker
  - subscription-only
  - audit-matrix
  - carry-03-closure
dependency_graph:
  requires:
    - "Phase 63 R3.1–R3.11 commits on master (commits `79df17d9` through `1f31ac27`, all 2026-05-03)"
    - "Mini PC bruce@10.69.31.68 reachable for D-08 live broker probe"
    - "Memory `reference_broker_protocols_verified.md` (2026-05-03 curl proofs) for D-08 fallback"
    - "Plan `64-03-PLAN.md` defining the matrix structure + acceptance criteria"
  provides:
    - ".planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-R-SERIES-MATRIX.md (11-row classification, audit-ready)"
  affects:
    - "Phase 64 success criterion #3 (R-series formal walkthrough) → satisfied"
    - "CARRY-03 requirement → ready for closure on next plan/state cycle"
    - "Audit-milestone tooling can now parse the R-series matrix for v31 close prep"
tech_stack:
  added: []
  patterns:
    - "Commit-existence-on-master + current-source-state assertion (D-07) for code-only changes"
    - "D-08 live broker probe with memory-pinned fallback when Bearer plaintext unobtainable"
    - "Single-batched SSH (fail2ban discipline)"
    - "Subscription-only constraint (D-NO-BYOK) honored — no `@anthropic-ai/sdk` raw HTTP path engaged"
key_files:
  created:
    - ".planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-R-SERIES-MATRIX.md"
    - ".planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-03-SUMMARY.md (this file)"
  modified: []
decisions:
  - "All 11 R3.x rows classified `script-verified` because each commit ships on `master` AND each commit's intended code shape is observable in the current `livos/packages/livinityd/source/modules/livinity-broker/providers/anthropic.ts`."
  - "R3.11 specifically cross-referenced to `reference_broker_protocols_verified.md` (2026-05-03) per D-08 fallback — fresh live curl with a `liv_sk_*` Bearer was attempted but blocked by the show-once-plaintext constraint of the `api_keys` table (DB stores hashes only)."
  - "No `needs-human-walk` rows: the 11 R3.x patches are all backend code-only, observable in commit + source state. The browser/IDE walks (Bolt.diy, Open WebUI, Continue.dev) live in plans `63-04`/`63-05`/`63-06` which are NOT R-series and are out of scope for this plan."
  - "No `obsolete` rows: D-NO-SERVER4 not engaged — R3.x is Mini PC + orchestrator-local + Server5 relay work only."
  - "No `failed` rows: every R3.x patch shipped and the cumulative end-state passes the 2026-05-03 live curl proof."
  - "Subscription-only constraint (D-NO-BYOK) honored at every probe: only the subscription path was tested; no fallback to raw `@anthropic-ai/sdk`."
metrics:
  duration_minutes: 2
  completed: "2026-05-04T17:53:38Z"
  evidence_blocks: 11
  r_series_ids_cited: 11
  status_tags: 11_script_verified
  ssh_sessions_used: 1
  curl_probes_run: 3
---

# Phase 64 Plan 03: R-Series Classification Matrix Summary

**One-liner:** Classified all 11 Phase 63 R-series broker hot-patches (R3.1–R3.11, all 2026-05-03 commits) as `script-verified` via commit-existence-on-master + current-source-state assertion + memory-pinned live curl proof for R3.11.

## What was delivered

`.planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-R-SERIES-MATRIX.md` — a self-contained markdown document with:

1. **Preamble** explaining what "R3.x" means (commit-tagged plans, not file-tagged) and the subscription-only / sacred-file boundary.
2. **Vocabulary table** aligned with `64-UAT-MATRIX.md` (`script-verified` / `needs-human-walk` / `failed` / `obsolete`).
3. **Matrix table** — 11 data rows, one per R3.x, columns: ID / commit / title / source plan / status / evidence summary.
4. **Per-row evidence subsections** — 11 `### Row R3.N` blocks, each with:
   - Status declaration
   - Source-plan + commit citation
   - `git log` + `git branch --contains` evidence
   - Current-source-state quote (file path + line number) demonstrating the patch is live
5. **Row R3.11 D-08 evidence** — extra detail per plan instructions:
   - Live SSH single-batch session captured (`OK_SSH` from Mini PC; `LIV_API_KEY` confirmed)
   - Public broker probe (`HTTP 404 user not found` envelope confirms broker up + Anthropic-spec error shape)
   - Memory-pinned 2026-05-03 curl proof from `reference_broker_protocols_verified.md` (1-day delta, no R3-affecting commits since)
6. **D-NO-SERVER4 compliance note** — no R-series row engaged Server4.
7. **Summary counts** — 11/0/0/0 (all `script-verified`).

## Status breakdown

| Status            | Count |
|-------------------|-------|
| `script-verified` | 11    |
| `needs-human-walk`| 0     |
| `failed`          | 0     |
| `obsolete`        | 0     |
| **Total**         | 11    |

## R3.11 broker curl outcome

**Outcome:** Memory-pinned (per plan-permitted fallback in D-08).

**Why memory-pinned, not fresh live:**
- Mini PC SSH single-batched session succeeded — confirmed broker is up, `LIV_API_KEY` populated in `/opt/livos/.env`, `api_keys` table has 1 active liv_sk_5* row for "deneme" user.
- However, `liv_sk_*` plaintext Bearer keys are show-once at mint time (Stripe-style); the DB stores hashes only. The plaintext for the active key is not retrievable post-creation.
- `LIV_API_KEY` itself is the broker's *internal* admin key, not a user-facing Bearer — confirmed via two probes (`x-api-key` and `Authorization: Bearer`), both returning the same `404 user not found` Anthropic-spec error envelope.
- Per plan: "If broker key is unobtainable (SSH fails, env var absent), fall back to citing `reference_broker_protocols_verified.md` (2026-05-03 curl proofs) and mark `script-verified` with date-noted evidence."
- 2026-05-03 → 2026-05-04 delta is 1 day; `git log --since=2026-05-03 -- livos/packages/livinityd/source/modules/livinity-broker/` shows zero R3-affecting commits in the interval. Memory-pinned proof remains valid.

**What the memory proves:**
- `POST /v1/messages` with Anthropic-shape `tools[]` returns `tool_use(name, input)` — R3.9 + R3.10 + R3.11 are jointly necessary for this pass (R3.9 = bridge, R3.10 = disallow built-ins, R3.11 = expand disallow list to ToolSearch).
- `POST /v1/chat/completions` with OpenAI-shape `tools[]` returns `tool_calls[]` with `finish_reason: "tool_calls"` — translation path verified bidirectionally.

If a future audit demands a fresh proof, the procedure is: (1) browse to `https://bruce.livinity.io/settings/ai-config`, (2) click "Create new key", (3) copy the show-once plaintext, (4) re-run the curl from the matrix's R3.11 evidence block.

## Failed rows that need follow-up before v31 closes

**None.** All 11 R-series rows are `script-verified`. The cumulative end-state of Phase 63's broker professionalization is observable in the current source tree and verified by the 2026-05-03 live curl proofs.

The relevant follow-ups for v31 entry are NOT in the R-series — they are:
- Suna sandbox network blocker (F7) — addressed by other plans in Phase 64
- F2/F3/F4/F5 token-cadence/multi-turn/Caddy-timeout/identity-preservation — explicitly deferred to P74 (BROKER-CARRY) per `project_v30_5_resume.md`
- Bolt.diy plain-text bug — Bolt-side issue (not broker-side), deferred to P74 if not closed by F2-F5

None of these are blockers for v31 close — they are the first work items of v31.

## Deviations from plan

**None.** Plan executed exactly as written:
- Read all 11 plan files in `.planning/milestones/v30.0-phases/63-mandatory-live-verification/` ✓
- Read `63-UAT-RESULTS.md` (canonical skeleton, no R-series rows yet) ✓
- Read `63-01-SUMMARY.md` (sample summary format) ✓
- Read `reference_broker_protocols_verified.md` (R3.11 D-08 evidence pin) ✓
- Read `feedback_ssh_rate_limit.md` (batched SSH discipline) ✓
- Single batched SSH to Mini PC ✓ (fetched `LIV_API_KEY` + `api_keys` snapshot in one invocation)
- Live curl probe sequence (3 probes total) ✓
- Memory-pinned fallback for R3.11 ✓ (per plan-permitted D-08 alternative)
- Sacred file untouched (Read tool not invoked on `nexus/packages/core/src/sdk-agent-runner.ts`) ✓
- D-NO-SERVER4 honored ✓ (Server4 not contacted)
- D-NO-BYOK honored ✓ (no raw `@anthropic-ai/sdk` path probed)

### Auth gates

None encountered. SSH used non-interactive key auth (`minipc` key per memory `reference_minipc_ssh.md`). Public broker probes are anonymous-ish (HTTP 404 / 401 responses, no auth challenge).

### Out-of-scope discoveries (logged only)

- The `RESUME-INSTRUCTIONS.md` in `.planning/milestones/v30.0-phases/63-mandatory-live-verification/` is preserved historic state — references `63-R1` (admin-tunnel.ts column-mismatch fix on Server5) and `63-R2` (Mini PC online step). These are NOT R3.x and are out of scope for this matrix. R1 + R2 are documented elsewhere in Phase 63's archived materials.
- The Phase 63 directory's plan files `63-01-PLAN.md` through `63-11-PLAN.md` are wave-organized (Wave 0 pre-flight through Wave 5 milestone close), NOT R3.x-organized. The matrix's "Source plan" column cites `63-01-PLAN.md` (Wave 0 anchor) for all R3.x rows because the R3 remediation series was DISCOVERED AT Wave 0 and continued landing through Wave 5 closure. This is documented in the matrix's "Context — what 'R3.x' means" preamble section.

## Self-Check: PASSED

- File `.planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-R-SERIES-MATRIX.md` exists.
  - `[ -f ...64-R-SERIES-MATRIX.md ]` → FOUND.
- Matrix passes plan's automated structural check:
  - `R-series matrix OK: 11 evidence blocks, 11 R3.x IDs, R3.11 has live or memory evidence` (stdout from plan-defined `node -e "..."` verifier).
- All 11 R3.x commits on master:
  - `79df17d9 da53add4 129e0200 4219acca 70dc055d 9e2d15f9 34a5efe0 2bad6ba1 fda2f7f6 8225dbd6 3b5aa3c8 1f31ac27` → all FOUND on `master` per `git branch --contains`.
- Subscription-only constraint mentioned in matrix preamble → FOUND.
- D-NO-SERVER4 explicitly noted → FOUND (matrix "Notes" section).
- Sacred file untouched: no Read/Edit/Write invocations targeted `nexus/packages/core/src/sdk-agent-runner.ts` during this plan execution.
- No code files modified: `git status --short` shows only the two new doc files in `.planning/phases/64-v30-5-final-cleanup-at-v31-entry/`.

## Threat Flags

None. This plan is documentation-only; no new security-relevant surface introduced.
