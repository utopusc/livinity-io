---
phase: 258-public-app-access
plan: 02
subsystem: domain (Caddy emit)
tags: [public-access, caddy-carve-out, security-spine, header-strip, forward-auth]
requires:
  - "258-01: SubdomainConfig.publicAccess? field + PublicAccessConfig type"
provides:
  - "generateFullCaddyfile single-user carve-out: paths/whole-app/none branching on sub.publicAccess"
  - "PUBLIC_HEADER_STRIP module const (-Remote-User -Remote-Role -X-Daemon-Bearer) — the non-configurable security spine"
  - "gatedHandleBody refactor — single source of the 256-04 forward_auth gate (SC5 byte-equivalence anchor)"
  - "multi-user app-subdomain block hardened with the same strip + publicAccess-under-multi-user WARN (NOTE-1)"
affects:
  - "258-03 (enforce + persist) persists PublicAccessInstallSetting → resolvePublicAccess → SubdomainConfig.publicAccess consumed here"
tech-stack:
  added: []
  patterns:
    - "Caddy first-match-wins: public 'handle <prefix>*' blocks emitted BEFORE the no-matcher gated catch-all"
    - "Hard-coded security spine (header strip) baked into the emit template, not driven by config"
    - "Refactor-to-single-source (gatedHandleBody) to pin byte-equivalence via expect(block).toBe(expected)"
    - "Emit-layer charset/skip guard mirroring the 257-06 safeBearer gate (hostile path prefixes dropped)"
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/domain/caddy.ts
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts
decisions:
  - "Single atomic commit for both tasks — the paths-mode carve-out and whole-app/SC5 changes are byte-entangled in the same emit branch and cannot be split into separate intra-file commits without rewriting hunks"
  - "console.warn used for the NOTE-1 multi-user warning (no logger in generateFullCaddyfile scope; plan permitted console.warn fallback, no new function param)"
  - "Hostile-prefix guard uses /[\\s{}\"]/ skip (defense in depth) on top of 258-01's data-layer normalization"
metrics:
  duration: ~8m
  completed: 2026-06-04
---

# Phase 258 Plan 02: WS-B — Caddy Emit Carve-Out (the Security Spine) Summary

WS-B extends `generateFullCaddyfile`'s single-user installed-app emit so a public-configured app is split into mutually-exclusive `handle` blocks: header-stripped public path/whole-app blocks that bypass the login gate, plus the UNCHANGED 256-04 forward_auth catch-all LAST. The daemon bearer + spoofable identity headers are structurally impossible to leak onto a public route, and a non-public app's block is byte-identical to today (SC5).

## What Was Built (commit `2f296e6c`)

### `PUBLIC_HEADER_STRIP` — the spine (caddy.ts, module const)
- `\t\trequest_header -Remote-User` / `-Remote-Role` / `-X-Daemon-Bearer` — hard-coded, two-tab-indented, NOT driven by SubdomainConfig. Emitted verbatim in EVERY public block and in the multi-user app block.

### Single-user `else` branch carve-out
- Refactored the inline gated emit into `gatedHandleBody` (one source of the 256-04 forward_auth + redir + reverse_proxy-with-safeBearer block).
- `pub.mode === 'whole-app'` → a SINGLE `handle { <strip> reverse_proxy }` — NO forward_auth, NO `header_up Authorization`.
- `pub.mode === 'paths' && paths.length > 0` → one `handle <prefix>* { <strip> reverse_proxy }` per prefix (hostile prefixes matching `/[\s{}"]/` skipped) emitted FIRST, then `handle { <gatedHandleBody nested one tab deeper> }` LAST.
- `none`/absent/empty → `${fullDomain} {\n${gatedHandleBody}\n}` — byte-identical to the pre-258 emit (SC5).

### Multi-user branch hardening (NOTE-1)
- Added the same `PUBLIC_HEADER_STRIP` inside the `:8080` reverse_proxy block (defense in depth — strips a CLIENT-injected identity/bearer header even though this branch injects none).
- `console.warn(...)` when `sub.publicAccess.mode !== 'none'` under multiUser.
- Pinned the single-user-emit assumption + the `:8080` gateway follow-up in code comments at both the multi-user block and the carve-out site (T-258B-05).

### Tests (caddy.test.ts — 12 new, 101 total)
T1 paths emit shape + ordering, T2 strip in every public block, T3 gated catch-all preserved, T4 bearer gated-only (never public), T5 first-match ordering, T5b hostile-path skip, T6 multi-user strip, WA1 whole-app shape, WA2 whole-app no-bearer, SC5 byte-equivalence (no bearer / with bearer / mode none — all `expect(block).toBe(expected)`).

## Required Confirmations

- **(a) Daemon bearer ONLY in the gated block:** CONFIRMED. `header_up Authorization` is emitted exclusively inside `gatedHandleBody`. T4 asserts `bearerIdx > gateIdx` and the public-handle slice contains no `header_up Authorization`; WA2 asserts whole-app emits no bearer at all.
- **(b) Strip in every public block + multi-user block:** CONFIRMED. `PUBLIC_HEADER_STRIP` is interpolated into every public `handle` (paths + whole-app) and the multi-user `:8080` block. T2/WA1 assert the trio per public block; T6 asserts it in the multi-user block.
- **(c) SC5 byte-equivalence proven:** CONFIRMED. Three `expect(block).toBe(expectedGatedBlock(...))` tests pass for no-publicAccess (no bearer), with-bearer (257-06 path), and mode `'none'` — all character-identical to the 256-04 template.

## Verification

- `npx vitest run packages/livinityd/source/modules/domain/caddy.test.ts` → **101/101 pass** (89 prior + 12 new; 256-04 + 257-06 suites unchanged).
- `tsc -p packages/livinityd --noEmit` (workspace-local) → the ONLY caddy errors are the pre-existing `caddy.test.ts:696/706` `as const` readonly-array issues confirmed pre-existing in 258-01-SUMMARY. ZERO new errors from this plan's code.

## Deviations from Plan

- **Single commit instead of one-per-task.** Tasks 1 (paths + multi-user) and 2 (whole-app + SC5) modify the SAME emit branch; the changes are byte-entangled and cannot be split into separate intra-file commits without rewriting hunks. Committed atomically as `2f296e6c` covering both tasks' behavior + all 12 tests. (Tracked as a Rule-driven adjustment, not a behavior change — every task done-criterion and test is satisfied.)
- **TDD RED→GREEN collapsed to one pass.** The implementation + tests landed together and passed on first run; no separate RED commit (the entangled single-commit decision above makes a standalone failing-test commit moot). All behaviors are test-pinned.

## Threat-Model Notes

- T-258B-01/02 (identity-header spoof / bearer leak): mitigated — non-configurable strip in every public block; bearer gated-only (T2/T4/WA2).
- T-258B-03 (hostile manifest path breakout): mitigated — emit-layer `/[\s{}"]/` skip guard (T5b).
- T-258B-04 (gated path falls through to public): mitigated — public handles before the no-matcher gated catch-all (T1/T5).
- T-258B-05 (multi-user carve-out bypass): mitigated (partial) + documented — strip + WARN + pinned comment added; full enforcement is the documented :8080 gateway follow-up (258-05 precondition).

No new threat surface beyond the phase's intended public-access model.

## Sacred SHAs

caddy.ts / caddy.test.ts are not in `scripts/sacred-shas-v38.json`. The pre-commit `[sacred-sha]` hook PASSED (`20 files verified`) on commit `2f296e6c` — no `--no-verify`.

## Commits

| Task     | Commit     | Message                                                                 |
| -------- | ---------- | ----------------------------------------------------------------------- |
| 1 + 2    | `2f296e6c` | feat(258-02): public-access Caddy carve-out — header-strip spine + gated catch-all |

## Self-Check: PASSED

caddy.ts + caddy.test.ts modified on disk; commit `2f296e6c` present in git history; 101/101 tests pass.
