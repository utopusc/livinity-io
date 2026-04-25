# Phase 18: Container File Browser - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

Full file manager for container filesystems — list, navigate, download, upload, edit, delete — built on Docker exec + tar streaming without requiring host volume mounts.

**Scope:**
- Browse: directory listing via `docker exec` + `ls -la --time-style=+%s` or equivalent
- Download: `container.getArchive({path})` tar stream → browser download
- Upload: browser upload → tar → `container.putArchive(tarStream, {path})`
- Edit: fetch file content via exec cat or getArchive + extract; save via putArchive
- Delete: `docker exec rm -rf` with confirmation modal

All ops gated by the authorize pattern (ctx.currentUser owns the container via owner of the stack or user's own containers).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Use dockerode's `container.exec()` for listings (simpler than putArchive round-trip)
- Use dockerode's `container.getArchive()` / `putArchive()` for file transfer
- Text edit limited to 1MB (larger files require streaming UI, future)
- Monaco editor already in project (used for UI YAML editing) — reuse for file edit
- Breadcrumb navigation with "Up" (parent dir) action
- Permissions: owner check — user can only file-browse their own containers (per-user container isolation from v7.0)

</decisions>

<specifics>
## Specific Ideas

**Success criteria (from ROADMAP):**
1. Container detail panel has "Files" tab; listing works with breadcrumbs
2. Download works for text + binary up to 100MB
3. Upload via drag-drop
4. Inline edit for text < 1MB (Monaco/CodeMirror)
5. Delete with recursive confirmation for non-empty dirs

**Plans (target 2):**
- Plan 18-01: Backend — list/download/upload/delete tRPC routes via dockerode exec + getArchive/putArchive
- Plan 18-02: UI — Files tab component with breadcrumbs, file table, upload dropzone, edit modal

</specifics>

<deferred>
## Deferred Ideas

- chmod / chown UI — v28.0
- Symbolic link handling — v28.0
- File preview (images, PDFs) — v28.0
- chunked large file upload > 100MB — v28.0

</deferred>
