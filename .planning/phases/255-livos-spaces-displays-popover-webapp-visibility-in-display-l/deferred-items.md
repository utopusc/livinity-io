# Phase 255 — Deferred Items (out-of-scope discoveries)

## 255-03 — window-manager.test.ts pre-existing baseline failures

**Discovered:** 2026-06-02 during 255-03 execution (baseline test run).

**Tests:** Tests 16, 18, 23 in `window-manager.test.ts`
(`WebAppWindowManager — Phase 100-08-04 per-WebApp Luse MCP lifecycle`).

**Symptom:** These tests set `process.env.LIVOS_PER_APP_LUSE = '1'` and assert
`mcpConfigManager.installServer` / `updateServer` are invoked on spawn. They FAIL
("expected spy to be called 1 times, but got 0 times").

**Root cause:** `registerWebAppMcp()` (`window-manager.ts:792-803`) is now a NO-OP —
the `luse-mcp-config` module was deleted with the AI-Chat teardown, and the method
returns early without calling the mcpConfigManager. So the per-WebApp Luse MCP
registration the tests assert never happens.

**Pre-existing:** Confirmed these fail on the UNMODIFIED tree (Test 23 reproduced in
isolation BEFORE any 255-03 change). NOT caused by 255-03. Baseline is therefore
37 passed / 3 failed / 22 skipped (pre-255-03).

**Scope:** Unrelated to 255-03 (display registry visibility / disjoint allocator
ranges). Left UNTOUCHED per the executor scope boundary.

**Suggested remediation (future cleanup phase):** either delete the dead
per-WebApp-Luse tests (Tests 16/18/23 + the 103-05 default-off env-coverage block
that still asserts install calls) or re-wire `registerWebAppMcp` if per-WebApp Luse
MCP registration is intended to come back. Until then these 3 are a known,
documented baseline failure.
