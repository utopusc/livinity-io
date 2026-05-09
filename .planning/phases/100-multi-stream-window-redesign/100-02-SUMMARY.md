---
phase: 100-multi-stream-window-redesign
plan: 02
status: complete
date: 2026-05-08
requirements_addressed:
  - V33-MULTI-01
key_files:
  modified:
    - livos/packages/livinityd/source/modules/webapps/window-manager.ts
    - livos/packages/livinityd/source/modules/webapps/window-manager.test.ts
  created:
    - .planning/phases/100-multi-stream-window-redesign/100-02-SUMMARY.md
sacred_sha:
  pre:  f3538e1d811992b782a9bb057d1b7f0a0189f95f
  post: f3538e1d811992b782a9bb057d1b7f0a0189f95f
---

# Phase 100-02 SUMMARY

**Date:** 2026-05-08
**Verified hypothesis (per 100-01):** H1 — Chrome's IPC-merge by `--user-data-dir` produces title-similar wids that the `findNewWindowMatching` 60%-elapsed title-substring fallback cannot disambiguate under `--new-window URL`.
**Fix path applied:** B1 (`--app=URL`) — site-specific-browser mode. Empirically validated by 100-01 Probe B (each `--app=URL` invocation produced a uniquely-titled top-level wid: `54525956 "DuckDuckGo - …"` and `54525960 "Example Domain"`, even though Chrome IPC-merged to a single browser process PID 4129324). Locked default per CONTEXT G-100-B; default path applied — no pivot needed.

## Diff

- File: `livos/packages/livinityd/source/modules/webapps/window-manager.ts`
  - Argv block (lines ~227-233): 2 lines deleted (`'--new-window',` + `opts.url,`); 1 line added (`` `--app=${opts.url}`, `` with the P100-02 / V33-MULTI-01 / G-100-B B1 reference comment).
  - Header doc comment (lines 12-16): updated to reflect `--app=${url}` shape and note the P100-02 origin.
  - Net: 5 insertions, 4 deletions (1 file).
- File: `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts`
  - +1 test (`Test 11: spawn argv uses --app=<url> (V33-MULTI-01 / G-100-B B1) — no --new-window flag`) appended to the second `describe('WebAppWindowManager — vnc-window swap (Phase 99-04)')` block.
  - Asserts `args` contains `--app=https://duckduckgo.com`, does NOT contain `--new-window`, and still contains `--user-data-dir=/home/bruce/.config/livos-chrome`.
  - Mirrors the canonical argv-content idiom from `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts:295-302`.
  - Net: 12 insertions, 0 deletions (1 file).

### Naming note

The plan's PATTERNS.md template proposed labeling the new test `Test 11`, but the file already contained tests numbered 11–14 (inherited from the Phase 99-04 swap regression locks). To preserve the literal acceptance string `'Test 11: spawn argv uses --app=<url>'`, the new test was placed in the **second describe block** (`WebAppWindowManager — vnc-window swap (Phase 99-04)`) so the duplicate label is scoped under a different `describe`. Vitest accepts this and reports both unambiguously by their full path. No tests collide.

## Test results

- `npx vitest run window-manager.test`: **15 / 15 PASS** (Test 11 GREEN, all 14 prior tests still PASS).
- Wider relevant suite (`npx vitest run source/modules/webapps source/modules/streaming`): **226 / 226 PASS** across 21 test files (window-manager, window-discovery, geometry-tracker, stream-manager, vnc-bridge, fmp4-fanout, encoder-args, vaapi-probe, integration, etc.).
- Full livinityd suite (`npx vitest run`): 1023 PASS / 189 FAIL — every failure is the pre-existing platform-specific `ENOENT /var/run/dbus/system_bus_socket` D-Bus error from Linux-only integration tests running on Windows. **None of the 189 failures touch webapps, streaming, window-manager, window-discovery, or geometry-tracker.** Per execute-plan SCOPE BOUNDARY rule, these are not regressions caused by 100-02; they will pass on Mini PC where D-Bus is present.

## Sacred SHA gate

- Pre commits:  f3538e1d811992b782a9bb057d1b7f0a0189f95f
- Post commits: f3538e1d811992b782a9bb057d1b7f0a0189f95f
- `.husky/pre-commit` hook auto-fired on every commit:
  - Task 1 RED commit `3bbcfb2f` — gate PASS.
  - Task 2 GREEN commit `00a5b0bd` — gate PASS.
  - Task 3 SUMMARY commit (this file) — gate fires on commit.
- No `--no-verify` used.

## Commits

- `3bbcfb2f` test(100-02): RED - assert window-manager Chrome spawn uses --app=<url>
- `00a5b0bd` feat(100-02): swap Chrome spawn to --app=<url> for multi-stream concurrency (V33-MULTI-01)
- `<this-commit>` docs(100-02): SUMMARY — backend argv swap shipped, multi-stream root cause closed

## Acceptance grep checks

| Check | Expected | Actual |
|-------|----------|--------|
| `grep -c "'--new-window'" livos/packages/livinityd/source/modules/webapps/window-manager.ts` | 0 | **0** ✓ |
| `grep -c "\`--app=\${opts\.url}\`" livos/packages/livinityd/source/modules/webapps/window-manager.ts` | 1 | **1** ✓ |
| Test 11 status | PASS | **PASS** ✓ |

## Notes for 100-03 + 100-04

- With `--app=${opts.url}`, Chrome produces a **chromeless window** at the X11 layer — no URL bar, no tab strip. This means:
  - **100-03's "drop top toolbar"** still applies for the LivOS-side toolbar (the user-visible URL input was in `webapp-toolbar.tsx`, not Chrome). The stream area can now be full-bleed without Chrome's chrome competing for vertical pixels.
  - **100-04's bottom action-bar** is independent of this argv change — drawer wiring is untouched.
- Multi-stream concurrency is **expected to work end-to-end** after Mini PC deploy in 100-05. Probe B on Mini PC empirically validated that `--app=URL` produces independent uniquely-titled wids for `findNewWindowMatching` to disambiguate; the streaming layer (Phase 99-03 `VNC_PORT_COUNTER`) already supports two concurrent x11vnc sessions.
- **Out-of-scope finding (for 100-06):** Per orchestrator context, the user reported that on the deployed `cd6f442a` build, multi-stream rendering already worked (2 different stream contents visible) BUT input clicks always routed to last-opened wid AND the chat panel always controlled last-opened wid. This is **downstream of Chrome spawn** — B1 does not address it. It is an `x11vnc` input-routing semantics + per-webapp MCP scoping issue; a Plan 100-06 is queued to address after 100-02..05 ship. Test 11 was kept strictly scoped to argv-content and was not widened to assert input routing.

## key-files.created

- `.planning/phases/100-multi-stream-window-redesign/100-02-SUMMARY.md` (this file)

## key-files.modified

- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (argv swap)
- `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` (+1 invariant test)

## Self-Check: PASSED

- Pre-flight gate (D-100-LIVE-VERIFY-FIRST): `100-01-SUMMARY.md` contains `## Root cause: H1 VERIFIED` and `## 100-02 fix recommendation: B1` — proceed default path. ✓
- Test 11 added with literal label `'Test 11: spawn argv uses --app=<url>'`. ✓
- Test 11 contains `expect(args).toContain('--app=https://duckduckgo.com')`. ✓
- Test 11 contains `expect(args).not.toContain('--new-window')`. ✓
- Test 11 RED on commit `3bbcfb2f` (RED-only commit), GREEN after commit `00a5b0bd` (impl + test re-run). ✓
- `grep -c "'--new-window'" window-manager.ts` returns 0. ✓
- `grep -c "\`--app=\${opts\.url}\`" window-manager.ts` returns 1. ✓
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 100-02 commits (verified pre and post each commit). ✓
- `.husky/pre-commit` hook from 100-01 enforced sacred-SHA gate on every commit; no `--no-verify` used. ✓
- All 226 webapps + streaming tests green. ✓
