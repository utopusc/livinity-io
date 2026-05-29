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

## Code review (252-REVIEW.md) — deferred findings

WR-01, WR-02, WR-04 were FIXED post-review (commit `dd9c1a0e`). The following are
deferred — all same-uid/0700-bounded, and the fixes are broader than a safe
post-review patch:

### WR-03 — `LUSE_TMP_PREFIX` is a string prefix, not a path-boundary prefix
- `isPathAllowed` (`mcp/tools.ts:512-527`) matches `${XDG_RUNTIME_DIR}/luse-` via
  `startsWith`, so a sibling dir literally named `luse-<x>` under `$XDG_RUNTIME_DIR`
  is accepted. Bounded: the dir is 0700 and same-uid, so only the user's own
  process can create it — no cross-user escalation. The reviewer's fix restructures
  the workspace layout to `${XDG_RUNTIME_DIR}/luse/<id>/` and anchors on
  `${XDG_RUNTIME_DIR}/luse/`, which also touches the WRITER (`webapps/window-manager.ts`
  `broadcastActiveWid`) and the luse spawn path — out of scope for a post-review
  patch; track for a dedicated hardening pass.

### IN-01 — Path A / Path C MCP-seed helpers are near-duplicate (~90 lines, drift risk)
- `_dld_seed_mcp_servers` (deploy-livinityd.sh) and `seed_mcp_servers` (livos/install.sh)
  are intentional mirrors (per the 252-03 resolution: both entrypoints must seed).
  WR-01 was exactly the drift IN-01 warns about. A shared sourced helper would
  remove the drift surface but requires both scripts to resolve a common include
  path (the Path C self-bootstrap fetches from GitHub-raw) — deferred.

### IN-02..IN-04 — stale Kimi banner text; `uid ?? 1000` fallback duplicated; `:1`-`:99` display-regex cap
- Cosmetic / low-impact. IN-02 (Kimi→Claude banner copy) overlaps the broader
  provider-rename cleanup tracked in project memory. Deferred.
