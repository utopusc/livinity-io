# Phase 252 — Deferred Items (out of SCOPE BOUNDARY)

These are pre-existing issues discovered during execution that are NOT caused by
the Phase 252 changes. Logged per the executor SCOPE BOUNDARY rule; NOT fixed.

## 252-06 (R13/R14/R15)

### Pre-existing typecheck baseline (~382-392 errors)
- `livinityd typecheck` carries a pre-existing baseline of ~382-392 errors in
  unrelated `webapps/` / `widgets/` / `xai-auth/` / `computer-use/native/` and the
  `ChildProcess.on` spawn patterns (e.g. `mcp/tools.ts:1239,1809-1810`). Confirmed
  via git-stash A/B: baseline-without-my-changes = 392, with-my-changes = 389
  (zero NEW errors; my edits actually reduced the count by removing two
  `?? 'admin'`/`?? 'bruce'` env-read lines). Same baseline documented in
  252-01/02/05. Out of scope.

### Pre-existing window-manager.test.ts failures (3)
- `source/modules/webapps/window-manager.test.ts` has 3 PRE-EXISTING failures
  (Test 16, Test 18, Test 23 — all in the "Phase 100-08-04 per-WebApp Luse MCP
  lifecycle (Redis pub-sub)" describe block, about `spawn()` →
  `mcpConfigManager.installServer`/`updateServer`). Confirmed via git-stash A/B:
  they fail IDENTICALLY with the 252-06 `broadcastActiveWid` change reverted, so
  they are unrelated to the R15 marker-path move. 37 passed / 22 skipped /
  3 pre-existing-fail, unchanged by 252-06. Out of scope per SCOPE BOUNDARY.
