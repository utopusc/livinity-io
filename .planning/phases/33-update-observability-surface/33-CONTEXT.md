# Phase 33: Update Observability Surface - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

A user diagnoses any update outcome (success / fail / rolled-back) entirely from Settings > Software Update without ever opening SSH — structured per-deploy logs feed a Past Deploys table with click-through full-log viewer; sidebar Software Update row shows a badge when an update is available.

**Depends on:** Phase 31 (logs are emitted by the patched update.sh) — UX-04 sidebar badge has no infra dependency but rides along here because both touch Settings > Software Update.

**Phase 32 contract already satisfied:** `/opt/livos/data/update-history/` directory exists on Mini PC, contains the locked JSON shapes (`{timestamp, status, reason, duration_ms, from_sha?, to_sha?, log_path?}`). Phase 33 READS, never writes JSON.

**Requirements covered:** OBS-01 (structured per-deploy log files), OBS-02 (Past Deploys table UI), OBS-03 (log viewer modal + download), UX-04 (sidebar Software Update badge)

**UI hint:** yes — `workflow.ui_phase=false` so no UI-SPEC contract; design decisions made inline in PLAN.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion (discuss skipped). Use ROADMAP success criteria, codebase conventions (Settings layout from Phase 30, tRPC pattern from existing system routes, sidebar component from existing settings shell), and Phase 32's locked schemas.

### Inherited Phase 30+31+32 conventions
- tRPC routes added to `livos/packages/livinityd/source/modules/system/` matching `update.ts` shape
- New routes added to `httpOnlyPaths` in `common.ts` (per MEMORY: long-running mutations must use HTTP, not WS)
- Admin-only access enforced via `adminProcedure` middleware
- UI panels live under `livos/packages/ui/src/routes/settings/software-update/`
- Sidebar badge hooks into `useSoftwareUpdate()` (already exists from Phase 30)
- Path traversal guard: `path.basename(filename)` + verify-startswith-/opt/livos/data/update-history/

### Critical constraints (from success criteria)
- **OBS-01 log file naming:** `update-<ISO-timestamp>-<7char-sha>.log` — exact format required
- **OBS-01 log content:** per-step lines + final exit code + total duration in seconds
- **OBS-02 table:** last 50 log files, sorted newest-first, columns SHA + ISO timestamp + status + duration
- **OBS-03 modal:** last 500 lines monospace + "Download full log" button (full file stream, not truncated)
- **UX-04 badge:** numeric badge on Settings sidebar "Software Update" row, disappears on click/install, both themes
- **Security:** `adminProcedure` RBAC + filename validation (no `..` traversal); read-only filesystem access, no DB writes

### Phase 32 schema reuse (already produced)
- Phase 32 wrote `<ts>-rollback.json` with `status: "rolled-back"` and `<ts>-precheck-fail.json` with `status: "precheck-failed"`
- Phase 33 needs to ALSO emit `<ts>-success.json` (or extend the .log to BE the canonical record). Decision: keep BOTH:
  - `update-<ts>-<sha>.log` is the human-readable per-step log (OBS-01)
  - `<ts>-<status>.json` is the machine-readable record (Phase 32 + extended here for success)
  - The Past Deploys table reads JSON for the table rows; the log viewer reads .log for raw output

### Patch artifact
- `update.sh` already patched on Mini PC by Phase 32. Phase 33 needs an ADDITIONAL patch to wire the `<ts>-success.json` write + log file emission. New artifact: `.planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh`
- Same Phase 31 idempotent SSH-applied pattern (backup → splice → bash -n → restore on fail)

</decisions>

<code_context>
## Existing Code Insights

Codebase context:
- `livos/packages/livinityd/source/modules/system/update.ts` — `performUpdate()` mutation that wraps `bash /opt/livos/update.sh` (Phase 30 + Phase 32 already touched)
- `livos/packages/livinityd/source/modules/system/routes.ts` — tRPC route definitions for system.* (existing `system.checkUpdate`, `system.update`, `system.getUpdateStatus`)
- `livos/packages/livinityd/source/lib/common.ts` — `httpOnlyPaths` array (MUST add `system.listUpdateHistory` + `system.readUpdateLog` here)
- `livos/packages/livinityd/source/modules/auth/procedures.ts` — `adminProcedure` middleware (existing, reuse)
- `livos/packages/ui/src/routes/settings/software-update/page.tsx` — Settings > Software Update page (Phase 30)
- `livos/packages/ui/src/routes/settings/_components/sidebar.tsx` (or similar) — sidebar nav with menu items (UX-04 target)
- `livos/packages/ui/src/hooks/useSoftwareUpdate.ts` — Phase 30 hook for available-update state (UX-04 reuses)
- `/opt/livos/update.sh` (Mini PC) — Phase 32 patched. Needs ANOTHER splice for log file + success JSON emission.
- `/opt/livos/data/update-history/` (Mini PC) — exists, contains rollback.json + precheck-fail.json from Phase 32 testing

Codebase conventions surfaced during plan-phase research will refine these.

</code_context>

<specifics>
## Specific Ideas

### OBS-01: log file emission from update.sh
- Wrap update.sh's main body so all stdout+stderr is `tee`'d to `/opt/livos/data/update-history/update-<ts>-<sha>.log`
- Final line of script: append `EXIT=$?` + `DURATION=$SECONDS` + `STATUS=success|failed`
- Use `trap` on EXIT to ensure log is written even if script dies mid-way
- Idempotent SSH-applied patch (Phase 31 pattern)

### OBS-02: Past Deploys table
- New tRPC route `system.listUpdateHistory({ limit: 50 })` returns last 50 deploys
- Backend: `fs.readdir('/opt/livos/data/update-history/')` → filter `.json` files → read each → sort by timestamp desc → slice 50
- Frontend: new component `PastDeploysTable` under `routes/settings/software-update/`
- Columns: short-SHA, relative time + tooltip ISO, status badge (success/failed/rolled-back/precheck-failed), duration formatted (e.g., "1m 12s")
- Click row → open log viewer modal

### OBS-03: log viewer modal
- New tRPC route `system.readUpdateLog({ filename })` validates basename + reads tail 500 lines
- Frontend: modal/sheet with monospace pre-formatted text + "Download full log" button
- Download streams the FULL file (not truncated) via a separate HTTP endpoint or signed URL pattern

### UX-04: sidebar badge
- Add red dot/count badge to Settings sidebar's "Software Update" menu row when `useSoftwareUpdate().available === true`
- Reuse existing dock badge pattern from Phase 30
- Verify in both light and dark themes
- Disappears on page open OR successful update

### tRPC integration
- Add 2 new routes to system router
- Add to `httpOnlyPaths` in `common.ts` (CRITICAL — MEMORY notes long-running tRPC mutations hang on WebSocket)
- Both routes use `adminProcedure` (member/guest cannot read deploy logs — they may contain secrets)
- Filename validation via `path.basename(name)` + verify directory whitelist + reject if includes `..` `/` `\`

### Plan structure (likely 3 plans)
- **Plan 33-01** (Wave 1): Backend — new tRPC routes + httpOnlyPaths wiring + filename guards + unit tests for path traversal rejection
- **Plan 33-02** (Wave 1): update.sh logging patch artifact + apply on Mini PC (HUMAN-VERIFY)
- **Plan 33-03** (Wave 2): Frontend — Past Deploys table + log viewer modal + sidebar badge + integration tests against the new routes

</specifics>

<deferred>
## Deferred Ideas

- Server-Sent Events / WebSocket streaming of in-progress logs — out of scope, only need historical viewing
- Search/filter UI for Past Deploys — not in success criteria
- Log retention/rotation policy — defer to v30+ (current scope says "last 50" via query, but disk could grow)
- Per-deploy diff link to GitHub commit page — would be nice UX, defer

</deferred>
