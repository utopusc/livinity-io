# Phase 33 Deferred Items

Pre-existing test failures discovered while running the 33-01 backend test suite on a Windows host. NOT caused by Phase 33 work — out-of-scope for this plan per SCOPE BOUNDARY rule.

## 33-01 (Plan: backend OBS-02/03 routes)

### `system.integration.test.ts` — `memoryUsage` integration test fails on Windows

- **Discovered:** Plan 33-01 Task 3 verification (full suite run via `npx vitest run source/modules/system/`).
- **Root cause:** `getProcessesMemory()` in `source/modules/system/system.ts:99` shells out to `ps -Ao pid,pss --no-header` which is Linux-specific syntax (Windows `ps` does not support `-A` or `--no-header`). The test passes on Linux production hosts (Mini PC) but fails in any Windows-based CI/dev environment.
- **Impact:** Zero — this test was already failing before Phase 33 work began. Proven by the fact that running `system.unit.test.ts` (16 Phase 33 tests + 9 pre-existing) is GREEN end-to-end with no regressions.
- **Suggested fix path (out of scope here):** Either guard the `getProcessesMemory()` call behind a `process.platform === 'linux'` check (returning empty on other OSes) and skip the integration test on non-Linux, or add a Windows fallback using `wmic` / PowerShell `Get-Process`.

### `update.unit.test.ts` — `getLatestRelease C: non-2xx GitHub response` fails

- **Discovered:** Same suite run.
- **Root cause:** Test expects `getLatestRelease(livinityd)` to throw `/403/` on a non-2xx GitHub response, but the implementation appears to return a fully-formed release object instead. The mock setup in the test doesn't propagate the 403 status to the error path that the test expects to be reached.
- **Impact:** Zero — pre-existing failure in a file not modified by Plan 33-01. Phase 30 territory (`update.ts` was last touched there).
- **Suggested fix path (out of scope here):** Inspect `getLatestRelease()` error handling and either fix the implementation to throw on non-2xx, or update the test mock to reach the throw path.
