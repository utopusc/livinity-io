---
phase: 64-v30-5-final-cleanup-at-v31-entry
plan: 01
subsystem: docs
tags: [docs, compat-matrix, broker, external-clients, livinity-broker, subscription-only]

# Dependency graph
requires:
  - phase: v30.0 (Phase 63 R-series)
    provides: Broker professionalization, /v1/messages and /v1/chat/completions live on api.livinity.io
  - phase: v30.5 (informal)
    provides: F6 external client compat (x-api-key) shipped LIVE; broker tool routing curl-verified 2026-05-03
provides:
  - Single-source-of-truth compat matrix at .planning/docs/external-client-compat.md
  - 5 client rows (Bolt.diy, Cursor, Cline, Continue.dev, Open WebUI) x 7 columns
  - Bolt.diy plain-text root-cause documented as Bolt-side bug (not broker)
  - F2-F5 carryovers explicitly mapped to P74
  - Reference doc for downstream P74 plan-phase
affects: [P74, future external-client integration plans, BACKLOG.md compat-as-CI idea]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-authored compat matrix (one .md table, no automation) — first compat doc under .planning/docs/"
    - "Memory-citation pattern: every row's Reference column points to a memory file or commit"
    - "Carryover-to-phase mapping: F-series items explicitly link to P74 in the doc body"

key-files:
  created:
    - .planning/docs/external-client-compat.md
  modified: []

key-decisions:
  - "D-09: single doc at .planning/docs/external-client-compat.md (no subdirectory yet — first compat doc)"
  - "D-10: markdown table format, 5 rows x 7 columns (Client + Auth mode, Endpoint, Streaming, Tool calls, Verified status, Known quirks, Reference)"
  - "D-11: source data from existing memory entries; no live curl needed (memory date 2026-05-03 is 1 day old, well within 30-day freshness window)"
  - "D-12: doc explicitly notes which clients have an open carryover and maps F2-F5 to P74"
  - "D-NO-BYOK reiterated in preamble: subscription path only, no raw API keys ever"
  - "Bolt.diy plain-text symptom is a Bolt-side bug (Bolt does not send tools[]), NOT a broker bug — verified 2026-05-03 curl proves broker tool routing works when client sends tools[]"

patterns-established:
  - "Compat doc location: .planning/docs/ (new directory created this plan)"
  - "Compat row format: one table line per client, all 7 cells populated, Reference column cites memory file or commit"
  - "Carryover language: 'NOT failures — scheduled work deferred to P74' — protects v30.5 close audit from being misread as 'broken'"

requirements-completed: [CARRY-04]

# Metrics
duration: 3min
completed: 2026-05-04
---

# Phase 64 Plan 01: External Client Compatibility Matrix Summary

**Hand-authored compat matrix at `.planning/docs/external-client-compat.md` covering 5 external clients (Bolt.diy, Cursor, Cline, Continue.dev, Open WebUI) against the Livinity Broker's two protocols (`/v1/messages` and `/v1/chat/completions`), with D-NO-BYOK preamble, F2-F5 carryover footnotes mapped to P74, and Bolt-side root-cause attribution — all sourced from 2026-05-03 live-curl memory proofs, no fresh curl needed.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-04T17:48:54Z
- **Completed:** 2026-05-04T17:51:00Z
- **Tasks:** 1 (single doc-write task)
- **Files modified:** 1 created, 0 modified

## Accomplishments

- Created `.planning/docs/` directory (new — first compat doc location).
- Wrote `.planning/docs/external-client-compat.md` (106 lines) with:
  - D-NO-BYOK preamble explicitly stating subscription-only, never raw API keys.
  - Both broker endpoints named with code paths cited (`router.ts`, `openai-router.ts`, `passthrough-handler.ts:419,514`).
  - Compat table: 5 client rows × 7 columns (no empty cells).
  - Open carryovers section listing F2-F5 with explicit P74 mapping.
  - Bolt.diy "plain-text" symptom documented as a Bolt-side bug per `reference_broker_protocols_verified.md` (2026-05-03 curl proof that broker tool routing works when client sends `tools[]`).
  - References section citing 3 memory files, 4 code files, ROADMAP P74, and 64-CONTEXT.md decisions.
- Plan automated verification check passed (7 table rows, all clients present, both endpoints, P74 + D-NO-BYOK + F2-F5 cited, ≥60 lines).
- CARRY-04 requirement closed.

## Task Commits

1. **Task 1: Write external-client-compat.md** — `83e0fc7e` (docs)

**Plan metadata commit:** *(this SUMMARY commit — pending)*

## Files Created/Modified

- `.planning/docs/external-client-compat.md` (NEW, 106 lines) — Compat matrix doc: D-NO-BYOK preamble, both endpoint paths, 5x7 table, F2-F5 → P74 carryover footnotes, Bolt-side root-cause, references.

## Per-client status (one-line each)

| Client | Status |
|---|---|
| Bolt.diy | Partial — chat works; tool calling broken at client (Bolt does not send `tools[]`); broker is innocent. NOT a P74 item. |
| Cursor | Verified live 2026-05-03 — `/v1/messages` Anthropic-style, tool routing PASSES. F2 token cadence preference noted (P74). |
| Cline | Verified live 2026-05-03 — `/v1/messages`, multi-tool agentic loops work. F3 multi-turn `tool_result` noted (P74, low impact since Cline uses `/v1/messages`). |
| Continue.dev | Verified live 2026-05-03 — `/v1/chat/completions` OpenAI-style, `tool_calls[]` round-trip with `finish_reason:"tool_calls"`. F2/F3 noted (P74). |
| Open WebUI | Verified live 2026-05-03 for chat; tool routing inferred-PASS from same `/v1/chat/completions` curl. F4 (Caddy timeout) and F5 (identity) noted (P74). |

## Compat data provenance

- **All 5 rows: from memory** (`reference_broker_protocols_verified.md` 2026-05-03 — 1 day old, within freshness window).
- **0 fresh live curls** performed this plan — memory was current and consistent with code paths grepped at `livos/packages/livinityd/source/modules/livinity-broker/index.ts:16-22` (route mounts confirmed) and `passthrough-handler.ts` (translation function names confirmed).
- **No code modified** (sacred boundary respected — broker router files were grep-only references).

## Decisions Made

- Followed all locked decisions D-09 through D-12 from 64-CONTEXT.md exactly. D-NO-BYOK constraint reiterated verbatim in the doc preamble.
- Skipped optional fresh live curl per D-11: memory `reference_broker_protocols_verified.md` dated 2026-05-03 is well within the 30-day freshness window (1 day old as of 2026-05-04). Marked all four "verified" rows as `verified (live, 2026-05-03)` rather than fabricating today's date.
- Added explicit "NOT a P74 item" sentence to the Bolt root-cause paragraph to prevent future maintainers from accidentally adding the Bolt symptom to the broker carryover backlog.

## Deviations from Plan

None — plan executed exactly as written. All `must_haves.truths` from the plan frontmatter were satisfied:

- [x] external-client-compat.md exists at `.planning/docs/`
- [x] Single markdown table, exactly 5 client rows
- [x] All 7 columns populated for every row
- [x] Both broker endpoints named in preamble + table
- [x] F2-F5 carryover flagged with P74 pointer
- [x] Bolt root-cause attributed to client-side, citing memory
- [x] D-NO-BYOK reiterated in preamble

## Issues Encountered

None. Memory entries were complete, code paths existed where memory said they did, and the automated verification check passed on first run.

## User Setup Required

None — documentation-only plan. No external service configuration needed. No Mini PC SSH, no Server5 access, no broker key handling.

## Next Phase Readiness

- **CARRY-04 closed.** P74 plan-phase has a referenceable compat doc to start from (`.planning/docs/external-client-compat.md`).
- **Phase 64 success criterion #4 satisfied** (per 64-CONTEXT.md and ROADMAP Phase 64 success criteria).
- **No blockers** for the remaining Phase 64 plans (64-02 Suna F7 fix, 64-03 UAT matrix, 64-04 R-series matrix, 64-05 quick-task triage).
- Sacred boundary respected: `nexus/packages/core/src/sdk-agent-runner.ts` not even read.

## Self-Check: PASSED

- File present: `.planning/docs/external-client-compat.md` — FOUND
- Commit present: `83e0fc7e` — FOUND in `git log`
- Plan automated verification: PASSED (`compat-matrix OK: 7 table rows, all clients present, both endpoints, P74 + D-NO-BYOK + F2-F5 cited`)
- All `must_haves.truths` from PLAN frontmatter satisfied
- All `acceptance_criteria` from Task 1 satisfied
- No code files modified (sacred boundary respected)

---
*Phase: 64-v30-5-final-cleanup-at-v31-entry*
*Completed: 2026-05-04*
