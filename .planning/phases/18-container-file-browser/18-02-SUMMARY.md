---
phase: 18-container-file-browser
plan: 02
subsystem: ui
tags: [react, trpc, react-dropzone, pretty-bytes, date-fns, sonner, dialog, checkbox, tabler-icons, container-files, ui-tab]

# Dependency graph
requires:
  - phase: 18-container-file-browser
    provides: "Plan 18-01 — container-files.ts helpers + tRPC procedures (containerListDir, containerReadFile, containerWriteFile, containerDeleteFile) + REST endpoints (GET/POST /api/docker/container/:name/file)"
provides:
  - "FilesTab React component: breadcrumb path nav, file table (icon/name/size/mtime), drag-drop upload zone, edit modal with monospace textarea + 1MB guard, delete confirmation with mandatory recursive checkbox for directories"
  - "Files tab registered in ContainerDetailSheet between Stats and Console with IconFolder"
  - "Reusable destructive-with-recursive-confirm dialog pattern (volume delete UI in v28 can mirror it)"
  - "REST-vs-tRPC split pattern for binary download / multipart upload (tRPC carries JSON only)"
affects: [future-v28-file-preview, future-v28-chmod-ui, future-v28-chunked-upload, future-volume-delete-recursive-confirm]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Absolute-path-only file navigation with internal posixJoin / posixDirname / segmentsOf helpers (never the platform path module — container paths are POSIX even on Windows)"
    - "tRPC inferred types for client interfaces (RouterOutput['docker']['containerListDir']) — no client-side ContainerFileEntry duplicate"
    - "Same-origin anchor with download attribute for binary file download — tRPC can't carry tar streams, fetch+blob is unnecessary for same-origin GETs"
    - "FormData + fetch with credentials:'include' for multipart upload — session cookie auth survives the REST hop"
    - "Imperative read-on-open via utils.docker.containerReadFile.fetch() — avoids extra useQuery state for a one-shot modal data load"

key-files:
  created:
    - "livos/packages/ui/src/routes/server-control/container-files-tab.tsx (594 lines)"
    - ".planning/phases/18-container-file-browser/18-02-SUMMARY.md"
  modified:
    - "livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx (+10 lines: IconFolder import, FilesTab import, TabsTrigger, TabsContent)"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (+4 lines, Rule 3 deviation: containerWriteFile/containerDeleteFile added to httpOnlyPaths)"

key-decisions:
  - "Inferred ContainerFileEntry from RouterOutput rather than duplicating the interface client-side — single-source-of-truth in container-files.ts."
  - "Plain <textarea> for the edit modal instead of Monaco — no new dep, matches the existing compose YAML editor in server-control/index.tsx; bundle stays flat."
  - "Imperative utils.fetch() for read-on-open instead of conditional useQuery — modal data is one-shot, doesn't need React-Query caching."
  - "Edit button is rendered DISABLED (not hidden) for non-text or large files so the affordance is discoverable; click on disabled writes inline error rather than opening modal."
  - "Recursive-delete checkbox is the ONLY enabler for the directory delete button — file deletes get a single confirm button with no checkbox, mirroring the destructive-action pattern from removeContainer."
  - "Drop zone allows multiple files but uploads sequentially in a for-loop to avoid hammering the multipart endpoint."
  - "Help text 'Downloads return a .tar archive' placed under the table to make the v1 limitation unambiguous to users (client-side untar is deferred to v28)."

patterns-established:
  - "POSIX path helpers (posixJoin, posixDirname, segmentsOf) live private at the top of the component — small, pure, unit-testable; avoids importing path module which would resolve to win32 on Windows hosts."
  - "Inline tooLargeError state for failed Edit clicks — sets state, never opens modal, NEVER fires a containerReadFile call against stale content (per CFB-04 acceptance)."
  - "Action-button click handlers MUST e.stopPropagation() to prevent the row's directory-navigate handler from firing on Download/Edit/Delete clicks within file rows (which never navigate)."
  - "Mutations that should never hit the WebSocket transport (write/delete file ops) MUST be added to httpOnlyPaths in common.ts — see Rule 3 deviation below."

requirements-completed: [CFB-01, CFB-02, CFB-03, CFB-04, CFB-05]

# Metrics
duration: 6min
completed: 2026-04-24
---

# Phase 18 Plan 02: UI Files tab Summary

**Container Detail Sheet gains a 5th "Files" tab — breadcrumb-driven file table with per-row download/edit/delete, drag-drop upload zone, monospace inline edit modal (1MB guard), and recursive-confirm deletion for directories. Zero new dependencies.**

## Performance

- **Duration:** ~6 min (2 task commits + 1 deviation fix)
- **Started:** 2026-04-24T22:21:15Z
- **Completed:** 2026-04-24T22:26:51Z
- **Tasks:** 2 (both auto)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Single new component `container-files-tab.tsx` (~594 lines) covers all five CFB requirements (CFB-01..05) with zero new dependencies — leverages existing react-dropzone, pretty-bytes, date-fns, sonner, Radix Dialog, and Radix Checkbox.
- ContainerDetailSheet now registers the Files tab between Stats and Console with IconFolder; existing four tabs (Info default, Logs WS stream, Stats query, Console exec WS) untouched.
- Path helpers (posixJoin, posixDirname, segmentsOf) are private-module-local — no dependency on Node's `path` (which would resolve to win32 on Windows builds).
- Edit modal uses imperative `utils.docker.containerReadFile.fetch()` so each Edit click does exactly one read against the live container — no stale React-Query data.
- Drop zone uses `useDropzone` with `noClick: false` so users can both drag-and-drop AND click to browse; uploads are sequential to avoid hammering the multipart endpoint.
- Download is a same-origin `<a download>` anchor — auth cookie rides automatically; we explicitly do NOT fetch+blob since tRPC can't carry tar streams anyway.
- Delete confirmation enforces a different UX shape per type: file = single button, directory = button stays disabled until the explicit "Yes, recursively delete this directory and all contents" checkbox is checked (CFB-05).

## Task Commits

Each task was committed atomically:

1. **Task 1: FilesTab component** — `8f7acb8b` (feat)
2. **Task 2: Register Files tab in ContainerDetailSheet** — `77eb31ce` (feat)
3. **Rule 3 deviation: route file mutations through HTTP** — `3a8de537` (fix)

## Files Created/Modified

- `livos/packages/ui/src/routes/server-control/container-files-tab.tsx` — NEW. Exports `FilesTab({containerName})`. Internally manages currentPath, editing/delete dialog state, upload-in-progress, inline tooLargeError; reads via `containerListDir.useQuery` and `containerReadFile` (imperative); writes via `containerWriteFile`/`containerDeleteFile` mutations with toast feedback and `containerListDir.invalidate` after each.
- `livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx` — Added IconFolder to the @tabler/icons-react import, added `import {FilesTab}`, inserted `<TabsTrigger value='files'>` and `<TabsContent value='files'>` between Stats and Console. Order: Info → Logs → Stats → Files → Console. No other tab content touched.
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — Added `docker.containerWriteFile` and `docker.containerDeleteFile` to `httpOnlyPaths` (Rule 3 deviation, see below).

## Decisions Made
See `key-decisions` in frontmatter. Notable:
- **No Monaco** — the plan's CONTEXT mentioned Monaco; verifying via `grep monaco` of `livos/packages/ui/package.json` confirmed it is NOT installed. Plain styled `<textarea>` matches the existing compose YAML editor and keeps the bundle small.
- **No client-side untar of downloads** — out of scope for v27.0; users get `name.tar` and unpack locally. Inline help text under the table makes this unambiguous.
- **No new heavy deps** — `git diff livos/packages/ui/package.json` is empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Container file write/delete mutations missing from httpOnlyPaths**
- **Found during:** Context loading (before Task 1) — noticed `httpOnlyPaths` in common.ts contained the other docker mutations (createContainer, recreateContainer, manageContainer, etc.) but NOT the new `containerWriteFile`/`containerDeleteFile` from Plan 18-01.
- **Issue:** Per CLAUDE.md project memory: "tRPC mutations hang if routed to disconnected WebSocket — add new routes to `httpOnlyPaths` in `common.ts`". The FilesTab Save and Delete buttons would have silently hung on any client whose WebSocket was disconnected (e.g., reconnecting after sleep, behind a flaky tunnel). Plan 18-01 created the mutations but did not register them for HTTP transport.
- **Fix:** Added `'docker.containerWriteFile'` and `'docker.containerDeleteFile'` to the `httpOnlyPaths` array in `common.ts` (after the existing stack management group). Read-only `containerListDir` and `containerReadFile` queries remain free to use either transport.
- **Files modified:** `livos/packages/livinityd/source/modules/server/trpc/common.ts`
- **Verification:** `pnpm --filter ui build` passes. The UI package imports `httpOnlyPaths` from this file (see `trpc/trpc.ts` line 16); the type-check would fail if the array shape regressed.
- **Committed in:** `3a8de537` (separate fixup commit so the Plan 18-02 task commits stay clean and reviewable on their own).

---

**Total deviations:** 1 auto-fixed (1 blocking under Rule 3)
**Impact on plan:** Surfaces a missing routing config from Plan 18-01 that would have made the entire Plan 18-02 UX silently broken for a non-trivial percentage of users. No scope creep — the fix is a 4-line array entry that the previous plan should have included.

## Issues Encountered
- None during the planned tasks. Both task builds were clean on the first attempt.
- Pre-existing typecheck warnings in unrelated files (user/routes.ts, widgets/routes.ts, etc., flagged in 18-01 SUMMARY) carry over — out of scope per CLAUDE.md.

## Smoke Test Status
The plan's manual smoke tests (open Files tab on a running container, navigate, drop a file, edit, delete) require a running livinityd daemon and a live container. They cannot run in this static execution environment. Static verifications all passed:
- `pnpm --filter @livos/config build` clean.
- `pnpm --filter ui build` clean (~32s, no TS errors).
- All 7 done-criteria greps for Task 1 pass (FilesTab export = 1, RPC names = 8, REST URLs = 2, useDropzone = 2, recursive = 3, MAX_EDIT_BYTES = 6).
- All 4 done-criteria greps for Task 2 pass (IconFolder = 2, FilesTab = 2, value='files' = 2, tab order = Info→Logs→Stats→Files→Console).
- `git diff livos/packages/ui/package.json` is empty — zero new deps as required by acceptance criteria.

The runtime smoke test (drop hello.txt into /tmp, edit, delete recursively) should be run against a dev daemon by the verifier or on next deploy. The Rule 3 fix to `common.ts` requires `pm2 restart livos` (or systemd restart on server5) to take effect since livinityd is the file that consumes httpOnlyPaths.

## Next Phase Readiness
- **Plan 18 complete** — all five CFB requirements (CFB-01..05) now have backend AND UI delivery.
- **Ready for milestone v27.0 verification.** Phase 18 should advance from "in progress" to "complete" in ROADMAP after this summary lands.
- **Forward-compatible expansions noted in CONTEXT:** image preview, PDF preview, chmod/chown UI, chunked upload >100MB, client-side untar — all are pure additions on top of the existing component file. The component's state shape (currentPath as the single source of truth) supports them without restructuring.

---
*Phase: 18-container-file-browser*
*Completed: 2026-04-24*

## Self-Check: PASSED

- `livos/packages/ui/src/routes/server-control/container-files-tab.tsx` — FOUND
- `livos/packages/ui/src/routes/server-control/container-detail-sheet.tsx` — FOUND
- `.planning/phases/18-container-file-browser/18-02-SUMMARY.md` — FOUND
- Commit `8f7acb8b` (Task 1: FilesTab) — FOUND
- Commit `77eb31ce` (Task 2: tab registration) — FOUND
- Commit `3a8de537` (Rule 3 deviation: httpOnlyPaths fix) — FOUND
