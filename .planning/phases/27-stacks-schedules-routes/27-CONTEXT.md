# Phase 27: Stacks + Schedules Routes — Context

**Gathered:** 2026-04-25
**Status:** Ready for planning
**Mode:** Auto-generated (workflow.skip_discuss=true)

<domain>
## Phase Boundary

Migrate Stacks and Scheduled Jobs to dedicated sections in v28.0 Docker app, preserving all v27.0 tabs and dialogs. After this phase ships, the legacy `routes/server-control/index.tsx` file is FULLY UNREACHABLE and gets deleted (DOC-03 final cleanup).

**Depends on:** Phase 24 (DockerApp + section store), Phase 21 (GitOps stacks), Phase 20 (scheduler), Phase 26 (Volumes section provides Schedules backup-link contract).

**Requirement IDs:** DOC-11, DOC-12

**Success criteria:**
1. Stacks section: list + Add Stack dialog with YAML / Git / AI tabs (Phase 21 + Phase 23 features) + stack detail with Graph / Logs / Files tabs (Phase 19 + 17 + 18).
2. Schedules section: scheduler job list + Run Now + Test Destination + AddJob dialog (Phase 20 + 23 features). Volume backup pre-fill from useSelectedVolume (Phase 26 contract).
3. Phase 24's Stacks placeholder + Schedules placeholder replaced.
4. Final delete: `livos/packages/ui/src/routes/server-control/` directory (DOC-03 final cleanup).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All choices at planner discretion (discuss skipped). Phase 27 is the largest migration phase — stacks has the richest features (compose graph, file browser, logs, AI compose-gen, git, vuln-scan-on-stacks).

### Likely Patterns
- Same extract pattern as Phase 26: pull tab body from `routes/server-control/index.tsx` into `routes/docker/sections/stacks.tsx`, plus supporting files in `routes/docker/resources/` (or new `routes/docker/stacks/` subdirectory).
- Stacks dialogs: AddStack dialog has YAML / Git / AI tabs (already exists in legacy server control via Phase 21 D-X + Phase 23 D-X). Port wholesale.
- Stack detail: expand-row pattern with Graph (Phase 19) + Logs (Phase 17) + Files (Phase 18) tabs. Port wholesale.
- Schedules: extract Settings > Scheduler section into `routes/docker/sections/schedules.tsx`. Settings > Scheduler still exists in legacy code; Phase 27 owns the migration. Volume backup pre-fill: read `useSelectedVolume()` and pre-fill the AddBackupJobDialog's volume field if present.
- Add `useSelectedStack` zustand slot in `useDockerResource` (the store already exists from Phase 26 — just add 5th slot or reuse selectedStack name OR live happily without if selectedContainer/Image/etc. is enough).
- Settings > Environments section also needs migration to /docker/settings (DOC-17 = Phase 29). Phase 27 keeps Settings out of /docker/settings — that comes in Phase 29.

### Server Control Final Delete
- After Stacks + Schedules migration commits, the file `routes/server-control/index.tsx` should have NO callers. Verify via grep: ZERO imports outside the file itself.
- Then delete the file + the directory + remove cross-imports from Phase 24/26 (any `import ... from '../server-control/...'` should be moved to `routes/docker/resources/` or `routes/docker/stacks/`).
- This closes DOC-03 final.

### Scope Boundaries
- DOC-11 + DOC-12 = sections + dialogs.
- DOC-03 final delete = phase 27 cleanup task.
- DOC-17 (Docker Settings page including Environments + theme + palette) = Phase 29.
- AI alerts bell stays in StatusBar (Phase 24 already wired).

</decisions>

<code_context>
## Existing Code Insights

Anchor files:
- `livos/packages/ui/src/routes/server-control/index.tsx` (Stacks tab body — has DeployStackForm with YAML/Git/AI tabs, StackRow with expand → Graph + Logs + Files tabs)
- `livos/packages/ui/src/routes/settings/_components/scheduler-section.tsx` (or similar) — Phase 20-02 Settings > Scheduler. Migrate to `routes/docker/sections/schedules.tsx`.
- `livos/packages/ui/src/routes/docker/sections/stacks.tsx` + `schedules.tsx` (Phase 24 placeholders — replace)
- `livos/packages/ui/src/hooks/use-stacks.ts` (Phase 22 env-aware)
- `livos/packages/ui/src/hooks/use-scheduled-jobs.ts` (or similar — Phase 20)
- Compose Graph component (Phase 19 — react-flow based)
- File browser (Phase 18)
- Logs xterm (Phase 17)
- Phase 26 useDockerResource store — extend with selectedStack slot

</code_context>

<specifics>
## Specific Ideas

- Plan 27-01: Stacks section + AddStack dialog + stack detail with Graph/Logs/Files tabs
- Plan 27-02: Schedules section + AddJob dialog + Volume backup pre-fill + final server-control DELETE

</specifics>

<deferred>
## Deferred Ideas

- DOC-17 Docker Settings (envs + theme + palette + density) → Phase 29
- DOC-20 URL-bar deep-linking → Phase 29 (programmatic half done in Phase 26)

</deferred>
