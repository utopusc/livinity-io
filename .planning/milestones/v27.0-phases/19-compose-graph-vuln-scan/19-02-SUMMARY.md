---
phase: 19-compose-graph-vuln-scan
plan: 02
subsystem: docker
tags: [trivy, vulnerability-scanning, security, dockerode, ioredis, execa, react, tabs, cve, cvss, sbom]

# Dependency graph
requires:
  - phase: 17-docker-quick-wins
    provides: adminProcedure pattern, httpOnlyPaths convention (Phase 18 WS-hang fix), Redis singleton pattern (stacks.ts:getStore), bracketed-error-code-to-TRPCError mapping
  - phase: 18-container-file-browser
    provides: httpOnlyPaths discipline for long-running mutations
provides:
  - On-demand image vulnerability scanning via Trivy ephemeral container (CGV-02)
  - Digest-keyed Redis cache (`nexus:vuln:<sha256>`, EX=604800) shared across tags pointing at same digest (CGV-03)
  - Strictly user-initiated scanning — no scheduler / no auto-scan / no polling (CGV-04)
  - vuln-scan.ts engine module (scanImage + getCachedScan + parseTrivyJson)
  - tRPC routes docker.scanImage (mutation) + docker.getCachedScan (query) under adminProcedure
  - ScanResultPanel UI component with severity badges + click-to-expand CVE table
  - Tabs(Layer history / Vulnerabilities) layout for the expanded image row
affects: [phase-23-ai-diagnostics, v28-sbom, v28-license-scan, v28-grype-alt-scanner]

# Tech tracking
tech-stack:
  added: [trivy-cli (aquasec/trivy:latest container, no npm dep), execa-driven docker-run pattern]
  patterns:
    - "Ephemeral-container scanner pattern (reusable in v28 for SBOM tools): execa $`docker run --rm <tool> ...` with timeout + maxBuffer + stderr-to-error mapping"
    - "Digest-keyed Redis cache with TTL (resolveDigest BEFORE expensive work)"
    - "Tabbed expanded-row layout (Layer history / Vulnerabilities) — pattern reusable for future image side-panels"
    - "Per-image active-tab state via Record<id, value> inside the parent tab component"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/docker/vuln-scan.ts (Trivy engine, ~280 lines)"
  modified:
    - "livos/packages/livinityd/source/modules/docker/types.ts (added Severity, CveEntry, VulnScanResult)"
    - "livos/packages/livinityd/source/modules/docker/routes.ts (scanImage + getCachedScan routes)"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (added docker.scanImage to httpOnlyPaths)"
    - "livos/packages/ui/src/hooks/use-images.ts (scanImage / isScanning / scanResult / scanError)"
    - "livos/packages/ui/src/routes/server-control/index.tsx (Scan button + ScanResultPanel + ImageHistoryPanel refactor + Tabs layout)"

key-decisions:
  - "execa-driven `docker run --rm aquasec/trivy:latest …` over dockerode docker.run() — simpler stdout capture, native timeout/maxBuffer support, no manual stream demuxing"
  - "--quiet + --format json combination guarantees pure-JSON stdout (Trivy progress goes to stderr); --severity filter applied at Trivy level so we never receive UNKNOWN entries"
  - "Drop entries with severity outside {CRITICAL, HIGH, MEDIUM, LOW} per CGV-02 spec — UNKNOWN severity is dropped at parse time"
  - "Trim Description to 500 chars in CveEntry — avoids bloating Redis cache and UI tooltip overflow on Trivy's verbose vendor descriptions"
  - "Best-of-vendor CVSS via Math.max(nvd.V3 ?? redhat.V3 ?? ghsa.V3 ?? nvd.V2 ?? redhat.V2) — single sortable score across heterogeneous Trivy output"
  - "Cache key strips `sha256:` prefix → `nexus:vuln:<hex>` — matches 19-CONTEXT.md spec, keeps key length sane"
  - "Persist with cached:false but flip to cached:true on read — consumers see correct flag without mutating storage"
  - "ImageHistoryRow refactored to ImageHistoryPanel rendering its own <Table> inside a TabsContent panel (was bare <TableRow> children) — required for TabsContent embedding"
  - "Per-image tab state stored as Record<id, 'history'|'scan'> in ImagesTab; Scan button writes 'scan' so click auto-opens Vulnerabilities tab"
  - "ensureTrivyImage is lazy (only invoked from scanImage) — avoids 250MB pull on module import or app boot"
  - "Rule 3 reminder applied: docker.scanImage added to httpOnlyPaths so 30-90s mutation cannot silently hang on disconnected WS clients (Phase 18 gotcha)"
  - "getCachedScan is a query (not mutation) so it stays on WebSocket — read-only, idempotent, latency-tolerant"

patterns-established:
  - "Ephemeral-container CLI scanner: execa('docker', [...args], {timeout, maxBuffer, reject: false}) + exitCode-based error path with stderr captured into bracketed error code"
  - "Digest-keyed Redis cache pattern: resolveDigest first, use as key, share across tags pointing at same image"
  - "Tabbed expanded-row layout: <TableRow><TableCell colSpan={N}><Tabs>...</Tabs></TableCell></TableRow> — extensible for future tabs (Resource usage, Logs, etc.)"

requirements-completed: [CGV-02, CGV-03, CGV-04]

# Metrics
duration: 7min
completed: 2026-04-24
---

# Phase 19 Plan 02: Image Vulnerability Scanning (Trivy) Summary

**On-demand Trivy vuln scan with SHA256-keyed 7-day Redis cache, severity-badge UI, and click-to-expand CVE table embedded in tabbed expanded-image row**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-24T22:48:22Z
- **Completed:** 2026-04-24T22:55:22Z
- **Tasks:** 2
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- vuln-scan.ts engine module — `scanImage(ref, force?)` resolves digest, checks cache, runs Trivy via execa, parses JSON, caches under `nexus:vuln:<sha256>` with EX=604800
- Two adminProcedure tRPC routes (`docker.scanImage` mutation + `docker.getCachedScan` query) with full bracketed-error-code → TRPCError mapping (NOT_FOUND / TIMEOUT / INTERNAL_SERVER_ERROR)
- `docker.scanImage` registered in `httpOnlyPaths` (30-90s scans cannot hang on WS disconnect)
- ImagesTab gets per-row Scan button (amber, IconShieldCheck) that expands the row and auto-opens the new Vulnerabilities tab
- ScanResultPanel renders four severity badges (red CRITICAL / orange HIGH / yellow MEDIUM / gray LOW) with counts; click expands a CVE table showing id (linked to PrimaryURL), package, installed/fixed versions, CVSS, title
- ImageHistoryRow refactored to ImageHistoryPanel — renders its own `<Table>` inside the new TabsContent panel
- Cached badge + Rescan (force=true) button surfaced when result is from cache
- Frontend production build succeeds (`pnpm --filter @livos/config build && pnpm --filter ui build`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend vuln-scan.ts + tRPC routes + httpOnlyPaths** — `9aed1992` (feat)
2. **Task 2: Scan button + ScanResultPanel UI + useImages extension** — `8b667d60` (feat)

**Plan metadata commit:** _(pending — added in final commit)_

## Files Created/Modified

- `livos/packages/livinityd/source/modules/docker/vuln-scan.ts` — NEW. Singleton dockerode + ioredis. resolveDigest / ensureTrivyImage / runTrivyAndCollectStdout / parseTrivyJson + public scanImage + getCachedScan. ~280 lines.
- `livos/packages/livinityd/source/modules/docker/types.ts` — added `Severity`, `CveEntry`, `VulnScanResult`.
- `livos/packages/livinityd/source/modules/docker/routes.ts` — added scanImage / getCachedScan routes after imageHistory; imported `{scanImage, getCachedScan}` from `./vuln-scan.js`.
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — added `'docker.scanImage'` to `httpOnlyPaths`.
- `livos/packages/ui/src/hooks/use-images.ts` — added scanMutation + scanImage helper + return-shape additions (scanImage, isScanning, scanResult, scanError).
- `livos/packages/ui/src/routes/server-control/index.tsx` — IconShieldCheck/IconExternalLink imports; ImageHistoryRow → ImageHistoryPanel refactor (renders its own Table); ScanResultPanel new component; ImagesTab gets Scan ActionButton + per-image tab state + Tabs(Layer history / Vulnerabilities) layout for expanded row.

## Decisions Made

- **execa over dockerode.run:** Plan offered both options; picked execa for cleaner stdout capture, native timeout, native maxBuffer (Trivy JSON for many CVEs can exceed default 1MB).
- **--quiet + --format json:** Together they guarantee stdout is pure JSON (Trivy progress messages go to stderr) — no need for multiplexed stream parsing.
- **Drop UNKNOWN severity at parse time:** Trivy occasionally emits UNKNOWN severity entries; CGV-02 spec only surfaces the four documented levels. Filtered via `SEVERITY_SET.has(sev)` check in `parseTrivyJson`.
- **Description trimmed to 500 chars:** Trivy descriptions can run multiple paragraphs; the UI shows them as tooltip text only.
- **Best-of-vendor CVSS:** `Math.max(nvd.V3, redhat.V3, ghsa.V3, nvd.V2, redhat.V2)` — collapses multi-vendor scores to single sortable number.
- **Cache key shape `nexus:vuln:<hex>`:** Strips `sha256:` prefix per 19-CONTEXT.md spec.
- **`cached: false` persisted, flipped to true on read:** consumers see correct flag without mutating Redis-stored payload.
- **Lazy `ensureTrivyImage`:** never called on module import (avoids 250MB pull at boot); only on first `scanImage` call.
- **getCachedScan is a query (not mutation):** read-only, idempotent — stays on WebSocket transport.
- **`docker.scanImage` added to `httpOnlyPaths`:** mutation can take 30-90s; without HTTP routing, it would silently hang on disconnected WS (Phase 18 gotcha).
- **`ImageHistoryRow` refactored to `ImageHistoryPanel`:** original returned bare `<TableRow>` siblings, which is invalid inside `<TabsContent>`. Rewrote to render its own `<Table>` inside the panel.
- **Per-image tab state:** stored as `Record<id, 'history'|'scan'>` in ImagesTab so clicking Scan auto-flips the tab without losing manual selections on other rows.
- **Trivy timeout = 5 minutes:** mapped to bracketed `[trivy-timeout]` → TRPCError code `TIMEOUT`.
- **Pre-flight tip in spinner:** "Running Trivy — first scan may take 60-90s while pulling aquasec/trivy:latest..." sets expectation accurately.

## Deviations from Plan

None — plan executed exactly as written. Two atomic commits, zero auto-fixes required. Existing pre-existing typecheck errors in unrelated files (livinityd `user/`, `widgets/`, `file-store.ts`; UI `stories/`, tailwind config) were logged to `deferred-items.md` per scope-boundary rule. The build (the gating signal per plan) passes cleanly; livinityd runs via `tsx` so the typecheck noise has no runtime impact.

## Issues Encountered

None. UI build succeeded on first attempt.

## User Setup Required

None — `aquasec/trivy:latest` is pulled lazily on first scan from Docker Hub (default registry, no auth required). `REDIS_URL` already set in production (existing requirement from earlier phases).

## Verification Status

- [x] `pnpm --filter @livos/config build` passes
- [x] `pnpm --filter ui build` produces dist without errors (52.66s, 184 PWA precache entries)
- [x] vuln-scan.ts exports `scanImage`, `getCachedScan`, plus types `Severity`, `CveEntry`, `VulnScanResult` (~280 lines, exceeds 200-line minimum)
- [x] Two tRPC routes registered (`docker.scanImage` mutation + `docker.getCachedScan` query)
- [x] `docker.scanImage` present in `httpOnlyPaths` (Rule 3)
- [x] UI offers Scan button per row + Tabs(Layer history / Vulnerabilities) on expanded row + four severity badges with counts + click-to-expand CVE table
- [ ] Live verification on Server4 deferred to deployment step (per plan, manual smoke against `nginx:1.21` and cache-hit retry)

## Next Phase Readiness

- CGV-02/03/04 complete; Phase 19 closed (CGV-01 closed in 19-01).
- Ephemeral-container scanner pattern established for v28 SBOM/license/grype tools.
- Phase 23 (AI-Powered Diagnostics) AID-04 has its dependency satisfied — AI can now query `docker.getCachedScan` via tRPC to surface vuln context in diagnostics.
- v27.0 Docker Management Upgrade milestone: 19/19 v27.0-required-by-phase-19 plans complete; remaining phases (20/21/22/23) unblocked.

## Self-Check: PASSED

- All 6 created/modified source files present on disk
- Both task commits (`9aed1992`, `8b667d60`) present in git log
- SUMMARY.md created at expected path
- deferred-items.md created (pre-existing typecheck noise documented, scope boundary applied)
- `pnpm --filter ui build` succeeded (52.66s)

---
*Phase: 19-compose-graph-vuln-scan*
*Completed: 2026-04-24*
