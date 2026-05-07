# Phase 96: Teach Mode — Action Recording — PLAN

**Wave:** 4 (paralel to P97)
**Depends on:** P92, P93, P94, P95
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) — MUST be unchanged before AND after every task in this phase.

---

## Overview

P96 ships in seven sequenced tasks. Tasks 96-01 and 96-02 are pure backend (schema + persistence) and run before any UI work to lock the contract. 96-03 is the recorder hook (UI core logic). 96-04 wires it into the P95 stream window's mode selector and adds the privacy toast. 96-05 ships the skills sidebar. 96-06 ships the read-only replay scrubber. 96-07 closes with end-to-end verification, fixture data for P97, and the SUMMARY artifact.

**Wave plan within the phase**:
- Wave A (sequential): 96-01 → 96-02
- Wave B (sequential, depends on A): 96-03 → 96-04
- Wave C (paralel, depends on B): 96-05, 96-06
- Wave D (sequential, depends on A-C): 96-07

---

## Task 96-01 — Postgres migration + schema for `webapp_skills`

**Goal**: Create the durable storage row that every later task in this phase writes to or reads from.

**Scope**:
- New migration file `livos/packages/livinityd/source/modules/database/migrations/2026-05-XX-v33-webapp-skills.sql` with `CREATE TABLE IF NOT EXISTS webapp_skills (...)` per the schema in 96-CONTEXT §In-scope.
- Mirror the same DDL into `livos/packages/livinityd/source/modules/database/schema.sql` (idempotent `IF NOT EXISTS` form), per the dual-write rule established in P92.
- Add a unique index on `(user_id, webapp_id, skill_name)` so the same skill name can exist across WebApps but not within one.
- Add an index on `(user_id, webapp_id)` for the sidebar list query.
- Migration MUST be runnable against a clean DB and against an existing `livos` DB without errors. No data backfill.

**Acceptance**:
- `psql livos -c "\d webapp_skills"` shows the seven columns + the unique index + the lookup index.
- `bash /opt/livos/update.sh` (in dev — DO NOT actually run on Mini PC during this phase) would apply this migration cleanly. We only verify the SQL is valid via local psql.
- No edits anywhere outside `database/migrations/` and `database/schema.sql`.

**Out-of-scope**: tRPC router, storage module, UI work — all later tasks.

---

## Task 96-02 — `skills-storage.ts` + `skills-router.ts` (livinityd)

**Goal**: Server-side persistence layer + tRPC procedures so the recorder hook in 96-03 has a stable contract to call.

**Scope**:
- `livos/packages/livinityd/source/modules/webapps/skills-storage.ts`:
  - `writeFrame({userId, sessionId, ts, imageData, mimeType}) → Promise<{screenshotRef: string, thumbRef: string}>`
  - Re-encodes input PNG/JPEG to JPEG q=80 max 1280×800 via `sharp` (already in livinityd `package.json` per CLAUDE.md).
  - Generates a 320×200 q=70 thumbnail alongside, named `<ts>.thumb.jpg`.
  - Writes to `/data/webapp-skills/<userId>/<sessionId>/<ts>.jpg` (and `.thumb.jpg`). Path root `/data` resolves to `process.env.LIV_DATA_ROOT ?? '/opt/livos/data'`.
  - Rejects payloads > 4 MB pre-encode with `TRPCError BAD_REQUEST`.
  - Rejects MIME types other than `image/png` and `image/jpeg`.
  - `discardSession({userId, sessionId})` — `rm -rf` the session directory; safe to call on non-existent dirs.
  - `loadFrame({userId, sessionId, ts})` — returns the JPEG bytes for the scrubber to serve. Validates the path is inside the user's `<userId>` subtree (no traversal).
- `livos/packages/livinityd/source/modules/webapps/skills-router.ts`:
  - `webapps.skills.create({webappId, name, actionLog, sessionId})` — validates name (1-80 chars, slug-safe), validates `actionLog` against the canonical schema (zod), inserts the row, returns `{id, createdAt}`.
  - `webapps.skills.list({webappId})` — returns `[{id, skillName, createdAt, actionCount}]` for the current user.
  - `webapps.skills.get({skillId})` — returns the full row including `actionLog`. Authorizes via `currentUser.id === row.user_id`.
  - `webapps.skills.delete({skillId})` — deletes the row + calls `skills-storage.discardSession` for each unique `sessionId` referenced in the action log.
  - `webapps.skills.discard({sessionId})` — called when the user cancels the Save dialog; deletes only the on-disk session directory (no DB row exists yet).
  - `webapps.skills.uploadFrame({sessionId, ts, imageDataBase64, mimeType})` — invoked by the recorder hook for each frame. Returns `{screenshotRef}`.
- Wire the new sub-router into the WebApps router and confirm the parent `webapps.*` namespace is in `httpOnlyPaths` (it already is from P92; verify the `skills.*` sub-namespace inherits or add explicit entries).
- Unit tests: `skills-storage.test.ts` covering re-encode, path-traversal rejection, oversize rejection, discard idempotency. `skills-router.test.ts` covering create→list→get→delete round-trip and cross-user authorization (user B cannot read user A's skill).

**Acceptance**:
- `pnpm --filter livinityd test` green for the new test files.
- `webapps.skills.create` over HTTP (not WS) round-trips with a hand-rolled action-log fixture.
- `/opt/livos/data/webapp-skills/<uid>/<sid>/<ts>.jpg` written, thumbnail present, thumbnail dimensions exactly 320×200.

**Out-of-scope**: UI hook, sidebar, scrubber.

---

## Task 96-03 — `use-teach-recorder.ts` hook (UI core logic)

**Goal**: Self-contained React hook that arms/disarms recording, subscribes to VNC events, captures screenshots, posts frames to the server, and returns a complete action log on Stop.

**Scope**:
- `livos/packages/ui/src/hooks/use-teach-recorder.ts`:
  - Returns `{state, start, stop, sessionId, eventCount, droppedCount, recording}` where `state ∈ 'idle' | 'recording' | 'saving'`.
  - `start({webappId, vncRef})` — accepts a ref to the mounted VNC client (whatever P95's `use-webapp-vnc` exposes; it MUST surface raw mouse/keyboard event subscription).
  - On start: mints `sessionId = crypto.randomUUID()`, records `startedAt = Date.now()`, attaches DOM event listeners on the VNC canvas (`mousedown`, `keydown`, `wheel`, `scroll`).
  - For each input event: synchronously snapshots the current VNC canvas via `canvas.toDataURL('image/png')`, POSTs to `webapps.skills.uploadFrame`, awaits the `screenshotRef`, then pushes the canonical `ActionEvent` to the in-memory log.
  - Heartbeat `setInterval(1000)` emits `{type:'wait', durationMs:1000, ts, screenshotRef}` while active. Heartbeat AND input-event captures share the same upload pipeline.
  - 10-minute auto-stop timer; on fire, calls `stop` and surfaces a banner-state flag the parent component renders.
  - On `stop()`: clears intervals, detaches listeners, computes `endedAt`, returns the assembled `actionLog: { version: 1, webappId, startedAt, endedAt, events }`.
  - On unmount or webappId change: cleanup — detach listeners, call `webapps.skills.discard({sessionId})` if state was `recording` (don't leak frames).
  - Strict canonicalization: VNC events that don't map to the modelled discriminated-union types are dropped, `droppedCount++`, with a `console.warn` in dev mode only.
- Unit tests via Vitest mocking a fake VNC ref + a mocked tRPC client:
  - 30 fake clicks → 30 events + ≥1 heartbeat → log has correct shape.
  - Stop clears all timers (no late events fire after stop).
  - Auto-stop at 10min boundary fires exactly once.
  - Unknown event type increments `droppedCount` and is not in `events`.

**Acceptance**:
- `pnpm --filter ui test` green for `use-teach-recorder.test.tsx`.
- No reference to `liv/packages/core/*` — UI hook is livinityd-only consumer.

**Out-of-scope**: integrating with the mode selector, rendering UI, persistence.

---

## Task 96-04 — Mode-selector wiring + privacy toast

**Goal**: Plug the recorder hook into P95's existing `WebAppStreamWindow` mode selector so picking "Teach" arms recording and picking "Watch" / closing the window stops it.

**Scope**:
- Edit `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` (or whatever P95 named the shell):
  - Mount `useTeachRecorder` at the top of the component when `mode === 'teach'`. Pass the existing VNC ref.
  - Render a red pulsing dot + "Stop" button overlay inside the mode pill region while `state === 'recording'`. Use existing v32 design tokens; no new color tokens.
  - On Stop: open a `<SaveSkillDialog>` (new internal component in the same file or a co-located `save-skill-dialog.tsx`) with a name input (slug-safe validator) and Save / Cancel buttons.
  - Save → calls `webapps.skills.create({webappId, name, actionLog, sessionId})` then closes the dialog and switches mode back to `watch`.
  - Cancel → calls `webapps.skills.discard({sessionId})` then switches back to `watch`.
  - 10-minute auto-stop: render a non-modal banner ("Recording auto-stopped at 10 minutes — review and save?") above the mode pill; clicking the banner opens the same SaveSkillDialog.
  - Privacy toast: on first Teach activation per session, show a dismissable toast with the warning text (96-CONTEXT §Gray areas #2). Use the existing toast system (`use-toast` or whatever v32 ships). Persist `liv:webapp:teach:warning-ack:v1` in `localStorage`.
- NO new component files unless the SaveSkillDialog grows beyond ~80 lines — Claude's call.
- Visual: "Teach mode" indicator MUST be unambiguous (red pulse, not a static dot).

**Acceptance**:
- Manual smoke (in P98 UAT, but verify locally via vite dev): pick Teach → red pulse appears → click Stop → dialog opens → Save → skill row created.
- No regressions in P95's existing Watch / Auto / Chat modes.
- Sacred SHA still unchanged.

**Out-of-scope**: sidebar, scrubber, fixture data.

---

## Task 96-05 — `webapp-skills-sidebar.tsx`

**Goal**: A collapsible sidebar inside the WebApp window listing this WebApp's saved skills.

**Scope**:
- `livos/packages/ui/src/modules/window/webapp-skills-sidebar.tsx`:
  - Props: `{webappId, onSelectSkill: (skillId: string) => void}`.
  - Fetches via `webapps.skills.list({webappId})` (tRPC query, with stale-while-revalidate).
  - Rendered as a collapsible right-edge panel, default open. Width 280px. Uses existing v32 panel chrome (look at the P82 tool side panel for the established visual pattern).
  - Each row: skill name (bold), "N actions • created {relative-time}", a small delete affordance (trash icon, opens a confirm popover, then calls `webapps.skills.delete`).
  - Empty state: "No saved skills yet. Switch to Teach mode to record one." with no spinner.
  - Click row → `onSelectSkill(skillId)` (parent will mount the scrubber).
  - Live update: when 96-04 calls `skills.create`, the sidebar's tRPC query MUST invalidate so the new row appears without manual refresh. Use the existing tRPC invalidation pattern (see how the agents-repo lists its rows after create).
- Mount the sidebar inside `WebAppStreamWindow` to the right of the VNC stream + chat split. Hide the sidebar when in `auto` mode (P97 will reveal it differently).

**Acceptance**:
- After 96-04 saves a skill, the sidebar shows the new row within 1 second without a manual refetch.
- Delete confirm flow removes the row + the on-disk session directory (verify via `ls /data/webapp-skills/<uid>/`).
- No layout regressions in P95's existing split.

**Out-of-scope**: replay scrubber, scrubber preview frames.

---

## Task 96-06 — `skill-replay-scrubber.tsx` (read-only inspector)

**Goal**: A horizontally-scrolling timeline that renders one tile per logged action, with the captured screenshot as a thumbnail.

**Scope**:
- `livos/packages/ui/src/modules/window/skill-replay-scrubber.tsx`:
  - Props: `{skillId, onClose: () => void}`.
  - Fetches the full skill row via `webapps.skills.get({skillId})`.
  - Renders a horizontally-scrollable strip; each event becomes a 200×140 tile:
    - Thumbnail `<img>` from `webapps.skills.frameUrl({skillId, ts})` — a new lightweight tRPC procedure OR (preferred) a direct HTTP route on livinityd that streams the JPEG bytes from disk after auth-checking the session ownership. Pick whichever has lower friction; document choice in 96-SUMMARY.
    - Below the thumbnail: action label — `click @ x,y` / `key 'Enter'` / `wheel +120` / `scroll @ x,y` / `wait 1.0s`.
    - Above: `ts/1000`s relative to `startedAt`.
  - Header: skill name + total duration + event count + Close button.
  - NO play/pause controls — explicitly read-only per the DRAFT.
  - "N events dropped during recording" footer note if `actionLog` was annotated with droppedCount (extend the schema in 96-03 if not already present — add an optional `meta: {droppedCount: number}` to the canonical log).
  - Thumbs lazy-load on horizontal scroll (intersection observer) so a 5-minute skill with 300 frames doesn't fetch all 300 thumbs upfront.
- Mounted as an overlay above the VNC stream when `selectedSkillId !== null`. Click outside or Close button → `onClose`.

**Acceptance**:
- Opening a 30-second skill renders all tiles within 2 seconds.
- Opening a 5-minute skill renders the first 20 tiles within 2 seconds; rest stream in as the user scrolls.
- Auth check: user B cannot fetch a frame URL belonging to user A (server-side enforced).

**Out-of-scope**: replay playback, scrubber-driven Auto-mode invocation (P97 territory).

---

## Task 96-07 — End-to-end verification, P97 fixture data, SUMMARY

**Goal**: Lock the phase: prove the round-trip works, hand a sample skill to P97 as a known-good fixture, write SUMMARY.

**Scope**:
- End-to-end smoke (local dev only — no Mini PC SSH per CLAUDE.md hard rule for Server4; Mini PC smoke is P98's job):
  - Run vite + livinityd locally (or via the existing dev script).
  - Add a fake WebApp pointing at `https://example.com` (P94).
  - Spawn a window (P93/P95 plumbing — if not yet runnable locally, use a mock VNC ref in a Storybook-style harness).
  - Record a 30-second skill: 5 clicks, type "hello", scroll once.
  - Save with name "smoke-test".
  - Verify Postgres row, on-disk JPEGs (full + thumb), sidebar list, scrubber render.
  - Delete the skill, verify row + directory gone.
- Commit a fixture JSON file `livos/packages/livinityd/source/modules/webapps/__fixtures__/sample-skill.json` containing a hand-canonicalized minimal action log (3 clicks + 2 heartbeats) for P97 to seed its tests against. NO real screenshots in the fixture — `screenshotRef` strings only.
- Write `.planning/phases/96-teach-mode/96-SUMMARY.md` with: shipped deliverables, sacred SHA before/after (`git hash-object` proof), gray-area decisions taken vs. deferred, known follow-ups for P98 UAT, fixture path for P97.
- TODO/FIXME sweep: grep `liv/packages/core/` for any new TODOs (must be zero).
- Sacred SHA verification one final time before closing the phase.

**Acceptance**:
- 96-SUMMARY.md exists, ≤ 200 lines, structured sections.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` confirmed at phase close.
- Fixture file present and importable from a P97 test.
- No build/test regressions across `livos/packages/{ui,livinityd}`.

**Out-of-scope**: Mini PC deploy (defer to P98), Auto mode wiring (P97), credential redaction (v34).

---

## Cross-task invariants

- Every commit message references `phase=96-teach-mode plan=<NN>` for `/gsd-progress` tracking.
- Every commit verifies sacred SHA pre-commit AND post-commit via `git hash-object`. If the hash drifts at any point, halt and bisect.
- Migrations use the dual-write rule (discrete `.sql` + `IF NOT EXISTS` in `schema.sql`).
- New tRPC routes added to `httpOnlyPaths` in `common.ts` BEFORE any UI calls them, otherwise mutations hang on WebSocket per CLAUDE.md.
- No emoji, no backwards-compat hacks, no raw `@anthropic-ai/sdk` imports anywhere.
- All new files live under `livos/packages/{ui,livinityd}/`. Zero edits in `liv/packages/core/`.

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| VNC client doesn't expose raw DOM events the hook needs | M | H | 96-03 starts with a 30-min spike on the chosen react-vnc / @novnc/novnc library; if events aren't surfaced, fall back to wrapping the canvas with a transparent event-capture div. Document choice in SUMMARY. |
| `sharp` not in livinityd deps after Phase 65-04 dist drift | L | M | First step of 96-02 is `grep sharp livos/packages/livinityd/package.json`; if missing, add as `dependencies` in this phase. CLAUDE.md sharp-drift note is a known hazard. |
| Heartbeat 1Hz × 10min × 30 KB = 18 MB per skill — disk pressure | L | L | Documented in CONTEXT §Gray areas #1; revisit only if P98 UAT flags it. |
| Path traversal via crafted `sessionId` in `loadFrame` | L | H | Server-side path validation enforces `<userId>` is the authenticated user's UUID; `<sessionId>` must match `/^[0-9a-f-]{36}$/`. Reject otherwise. |
| Save dialog cancelled mid-write — orphan frames on disk | M | L | Recorder calls `skills.discard({sessionId})` on cancel; tested in 96-03 unit tests. |
| User opens 3 WebApp windows and Teach in two simultaneously | L | L | Hooks are local-state, sessions are independent UUIDs — no shared global state. P98 UAT verifies. |
| 10-minute auto-stop timer fires while user is mid-thought | L | M | Banner is non-modal; user can immediately re-open Teach to continue (creates a separate skill). v34 may add concat. |
| Thumbnail generation doubles disk writes | L | L | Acceptable; ~10 KB per thumb × 600 frames = 6 MB worst case for a 10-min skill. |
