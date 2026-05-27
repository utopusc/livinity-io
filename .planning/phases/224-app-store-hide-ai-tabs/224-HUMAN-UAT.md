---
status: partial
phase: 224-app-store-hide-ai-tabs
source: [224-VERIFICATION.md]
started: 2026-05-27T10:01:00.000Z
updated: 2026-05-27T10:01:00.000Z
---

## Current Test

[awaiting human testing on Mini PC `https://bruce.livinity.io`]

## Tests

### 1. SC-01 visual — App Store `AI` category tab hidden when flag=true
expected: Navigate to `/app-store` while signed in as admin. The category nav should show no `AI` (or `Skills`) tab. All other tabs (Files, Server Apps, Productivity, etc.) render unchanged. Non-AI apps still listed and openable.
result: [pending]

### 2. SC-02 visual — Settings sidebar `MCP Servers` row hidden when flag=true
expected: Navigate to `/settings`. The WORKSPACE section sidebar should NOT contain a `MCP Servers` entry. All other sidebar entries (Apps, Storage, etc.) render unchanged.
result: [pending]

### 3. SC-03 visual — direct URL `/settings/mcp-servers` still renders the MCP panel
expected: Type `/settings/mcp-servers` directly into the browser URL bar (or hit Enter on existing URL). The MCP Servers settings panel should render normally — graceful admin recovery, the route is reachable even when the sidebar entry is hidden. curl already confirmed HTTP 200; this test confirms the React content mount.
result: [pending]

### 4. SC-04 visual — V42MigrationBanner appears + dismiss + re-show on reload
expected: Banner appears at the top of App Store AND Settings pages. The X (dismiss) button hides it for the current tab session. F5 / reload re-shows it (per-session `useState`, no localStorage by design).
result: [pending]

### 5. SC-05 visual — non-AI apps still open normally (no regression)
expected: From App Store, open Files / AdGuard / Linkwarden (or any non-`ai`-category app). Each should launch in its dock window with normal behavior. No console errors related to Phase 224 changes.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

(none recorded yet — all 5 items pending operator walk)

## Operator notes

- All automated SCs (SC-01..SC-05 curl-verifiable subset) GREEN per `224-04-DEPLOY-LOG.md` lines covering tRPC round-trip + HTTP 200 on direct URL.
- Backend gate proven end-to-end: `liv:config:liv_v42_migration_active` flip true↔false reflected in `config.getV42MigrationActive` tRPC response.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-identical on Mini PC vs local.
- Rollback: `redis-cli -u $REDIS_URL SET liv:config:liv_v42_migration_active false` instantly restores pre-Phase-224 UI without redeploy.
- Visual layer expected to behave because backend gate is proven; this UAT is a 5-minute browser walk for confidence, not a discovery exercise.
