---
phase: 18-container-file-browser
plan: 01
subsystem: docker
tags: [docker, dockerode, archiver, busboy, trpc, express, container-files, tar, multipart]

# Dependency graph
requires:
  - phase: 17-docker-quick-wins
    provides: "stripDockerStreamHeaders / Dockerode singleton pattern, LIVINITY_SESSION cookie auth pattern, [not-found] error convention"
provides:
  - "container-files.ts module: listDir / readFile / writeFile / downloadArchive / deleteFile helpers backed by dockerode container.exec + getArchive/putArchive"
  - "ContainerFileEntry interface (name, type, size, mtime, mode, target?) — Plan 18-02's UI types bind to this"
  - "demuxDockerStream() — non-TTY exec stdout/stderr separation (specialized variant of stripDockerStreamHeaders)"
  - "tRPC procedures: docker.containerListDir, docker.containerReadFile, docker.containerWriteFile, docker.containerDeleteFile (admin-gated)"
  - "REST GET /api/docker/container/:name/file — tar-stream download (binary-safe, 100MB+, session-cookie auth)"
  - "REST POST /api/docker/container/:name/file — multipart upload via busboy (110MB cap, filename sanitised)"
affects: [18-02-ui-files-tab, future-per-user-container-ownership-v28]

# Tech tracking
tech-stack:
  added: [busboy@^1.6.0, "@types/busboy@^1.5.4"]
  patterns:
    - "docker exec + demuxDockerStream for non-TTY capture with stderr separation"
    - "archiver-in-memory tar for single-file putArchive (binary/multiline-safe)"
    - "tRPC for JSON paths + plain Express REST for binary/multipart paths (tRPC transport JSON-only)"
    - "Buffer[] -> Uint8Array[] cast for stricter @types/node 22+"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/docker/container-files.ts"
    - ".planning/phases/18-container-file-browser/18-01-SUMMARY.md"
  modified:
    - "livos/packages/livinityd/source/modules/docker/routes.ts (+128 lines, 4 procedures)"
    - "livos/packages/livinityd/source/modules/server/index.ts (+~140 lines, 2 endpoints + 2 imports)"
    - "livos/packages/livinityd/package.json (+busboy +@types/busboy)"
    - "livos/pnpm-lock.yaml"

key-decisions:
  - "Module-local Dockerode instance per container-files.ts (mirrors docker-exec-socket / docker-logs-socket) — kept self-contained instead of importing the singleton from docker.ts."
  - "Custom demuxDockerStream rather than reusing stripDockerStreamHeaders — needed stderr separated from stdout to surface accurate error context on non-zero exec exits."
  - "writeFile uses archiver tar + putArchive instead of `echo > file` — binary- and multiline-safe."
  - "REST endpoints (not tRPC) for download + upload because tRPC transport is JSON-only and cannot stream tar bytes or accept multipart bodies."
  - "busboy chosen over multer — single small dep, streams the body without tmp files, ~10 lines to parse one file."
  - "110MB upload cap with explicit truncation check + HTTP 413 — matches plan's 100MB CFB-02 acceptance with headroom."
  - "Filename slashes stripped server-side (`replace(/[\\/]/g, '_')`) — defense against path-traversal even though the path is interpreted inside the container."

patterns-established:
  - "Path validation: always assert path.startsWith('/') for container-side paths, since they are POSIX even on Windows hosts."
  - "Error code convention reused from docker.ts: [not-found], [bad-path], [file-too-large], [delete-failed], [ls-failed], [read-failed], [dir-not-found] — each maps to a distinct tRPC code in routes.ts."
  - "Use posix from node:path (not the platform-default) for any container-side path arithmetic."

requirements-completed: [CFB-01, CFB-02, CFB-03, CFB-05]

# Metrics
duration: 6min
completed: 2026-04-24
---

# Phase 18 Plan 01: Container File Browser Backend Summary

**dockerode-backed list/read/write/download/upload/delete for any Docker container — four tRPC admin procedures + two binary-safe REST endpoints, no host volume mounts required.**

## Performance

- **Duration:** ~6 min (excluding pnpm install for busboy)
- **Started:** 2026-04-24T22:12:29Z
- **Completed:** 2026-04-24T22:17:44Z
- **Tasks:** 3 (all auto)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `container-files.ts` exports five typed helpers and one interface (`ContainerFileEntry`) that drive every file op, with a robust ls-output regex parser handling filenames with spaces and symlink targets.
- All five helpers normalise dockerode 404s into `[not-found]` errors so the routes layer can map cleanly to tRPC codes.
- Four new tRPC procedures (`containerListDir`, `containerReadFile`, `containerWriteFile`, `containerDeleteFile`) wired up under `adminProcedure` with full Zod input validation, including `.startsWith('/')` enforcement on every path.
- Two new REST endpoints — GET (tar download) and POST (multipart upload) — gated by the existing `LIVINITY_SESSION` cookie, mounted between `/api/desktop/resize` and `/api/chrome/launch`.
- 110MB busboy upload cap enforced server-side with explicit truncation check returning HTTP 413.

## Task Commits

Each task was committed atomically:

1. **Task 1: container-files.ts module** — `54986a16` (feat)
2. **Task 2: tRPC procedures** — `7e67ef55` (feat)
3. **Task 3: REST endpoints + busboy** — `7b032aa7` (feat)
4. **Auto-fix: Buffer[] -> Uint8Array[] casts** — `8f1b6c81` (fix, Rule 1 deviation)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/docker/container-files.ts` (NEW, 372 lines) — five public helpers: `listDir` (exec + regex parser), `readFile` (stat-then-cat with size guard), `writeFile` (archiver tar + putArchive), `downloadArchive` (raw getArchive stream), `deleteFile` (rm / rm -rf with root guard); plus internal `execCapture` and `demuxDockerStream`.
- `livos/packages/livinityd/source/modules/docker/routes.ts` — added 4 admin procedures + 1 import block. Each procedure has full error-code mapping ([not-found]→NOT_FOUND, [bad-path]/[ls-failed]/[read-failed]/[delete-failed]/[file-too-large]→BAD_REQUEST, [dir-not-found]→NOT_FOUND).
- `livos/packages/livinityd/source/modules/server/index.ts` — added Busboy + container-files imports, two new endpoints (GET/POST `/api/docker/container/:name/file`) inserted between desktop resize and chrome launch.
- `livos/packages/livinityd/package.json` — `busboy@^1.6.0` and `@types/busboy@^1.5.4` added to dependencies.

## Decisions Made

See `key-decisions` in frontmatter. Notable:
- **Module-local Dockerode** rather than import the singleton from `docker.ts` — matches the precedent of `docker-exec-socket.ts` / `docker-logs-socket.ts` and keeps `container-files.ts` self-contained for easier testing.
- **Custom `demuxDockerStream`** instead of reusing `stripDockerStreamHeaders` — the existing helper drops stderr framing entirely; for non-TTY exec we need stderr separated to bubble up `ls: cannot access '/foo': No such file or directory` cleanly.
- **REST not tRPC** for binary/multipart paths — tRPC transport is JSON-only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Buffer[] not assignable to Uint8Array[] in @types/node 22+**
- **Found during:** Overall verification typecheck after Task 1.
- **Issue:** `@types/node` 22+ narrowed `Buffer.concat(list: readonly Uint8Array[])` and `stream.pipe()` signatures, producing 3 TS2345 errors in `container-files.ts` (Buffer[] params and PassThrough->WritableStream) and 2 in `server/index.ts` (Buffer[] and Busboy->WritableStream).
- **Fix:** Added `as unknown as Uint8Array[]` casts on the chunk arrays passed to `Buffer.concat`, and `as unknown as NodeJS.WritableStream` on PassThrough / Busboy when passed to `pipe()`. No runtime behaviour change — Buffer extends Uint8Array, Busboy implements Writable, PassThrough is a Writable.
- **Files modified:** `livos/packages/livinityd/source/modules/docker/container-files.ts` (3 sites), `livos/packages/livinityd/source/modules/server/index.ts` (3 sites).
- **Verification:** Filtered typecheck of `container-files.ts` and `docker/routes.ts` reports zero errors; touched lines (1208–1352) of `server/index.ts` report zero errors. Pre-existing errors in unrelated files (`user/routes.ts`, `widgets/routes.ts`, `utilities/file-store.ts`, etc.) carry over from prior phases — out of scope per CLAUDE.md.
- **Committed in:** `8f1b6c81` (separate fixup commit for clarity; the server/index.ts casts were applied inline during Task 3 and committed in `7b032aa7`).

---

**Total deviations:** 1 auto-fixed (1 bug under Rule 1)
**Impact on plan:** Cosmetic typing concession only. Did not change runtime behaviour, error semantics, or the 5 helper signatures. No scope creep.

## Issues Encountered

- **busboy default-vs-named export:** verified that `import Busboy from 'busboy'` is the correct shape for busboy@1.x with `@types/busboy@1.5.4`. The TS check passed without further changes.
- **Filtered typecheck output:** initial filter pattern `tsc --noEmit -p packages/livinityd/tsconfig.json` failed under pnpm `--filter` (cwd shifts into the package, making the path wrong). Switched to `pnpm --filter livinityd run typecheck` which uses the package script and resolves correctly.

## Smoke Test Status

The plan's smoke tests require a running livinityd daemon and a live Docker container. They cannot run in this static execution environment. Both endpoints have been verified statically:
- Typecheck clean for all touched files.
- Endpoint registrations (`grep "this.app.(get|post)('/api/docker/container/:name/file'"` returns 2 — the two intended routes).
- All four tRPC procedures appear exactly once each.

The runtime smoke tests (curl tar-download, curl multipart-upload, follow-up `docker exec ls`) should be run against a dev daemon when Plan 18-02's UI is wired up — that's the natural integration point.

## Next Phase Readiness

- **Ready for Plan 18-02 (UI Files tab):** all backend contracts are in place. Plan 18-02's `trpc.docker.containerListDir.useQuery(...)` will compile against the new procedures, and the UI's download/upload helpers can hit `/api/docker/container/:name/file` with `credentials: 'include'` to ride the existing session cookie.
- **No blockers.** Daemon needs a restart on the dev box to pick up the new code, but no env/secret changes required.
- **Future v28 expansion noted in 18-CONTEXT:** per-user container ownership check (currently relies on `adminProcedure` because v27.0 multi-user containers share the host Docker socket). The error-code surface and helper signatures are forward-compatible — adding an `ownerUserId` argument later would not change the wire shape.

---
*Phase: 18-container-file-browser*
*Completed: 2026-04-24*

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/docker/container-files.ts` — FOUND
- `.planning/phases/18-container-file-browser/18-01-SUMMARY.md` — FOUND
- Commit `54986a16` (Task 1) — FOUND
- Commit `7e67ef55` (Task 2) — FOUND
- Commit `7b032aa7` (Task 3) — FOUND
- Commit `8f1b6c81` (Rule-1 typing fixup) — FOUND
