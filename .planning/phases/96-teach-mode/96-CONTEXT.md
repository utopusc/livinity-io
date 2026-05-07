# Phase 96: Teach Mode — Action Recording — Context

## Goal
Ship a recordable "Teach mode" inside the WebApp Stream Window so that, while a user clicks/types/scrolls inside the streamed Chrome window, LivOS captures every input event plus a synchronized screenshot stream into a named, replayable skill stored in Postgres + on-disk JPEG blobs. Naming the recording persists it as a `webapp_skills` row keyed on `(user_id, webapp_id)`; a sidebar lists existing skills and a read-only scrubber lets the user inspect any skill's timeline.

## Why this phase exists
Teach mode is the bridge between the passive Watch experience shipped in P95 and the autonomous Auto loop shipped in P97. Without P96, the user has no way to seed Auto mode with a concrete example trajectory — the agent in P97 would have to free-form every task from scratch with vision alone. P96 produces the exact data shape Auto consumes: an ordered JSONB action log with screenshot references, scoped to a single WebApp. It also gives the user a tangible UX win in v33 even before P97 lands, because saved skills become a re-usable "macro" library per WebApp regardless of whether autonomous replay is wired up yet.

This phase is Wave 4, paralel to P97. P96 owns the data producer; P97 owns the data consumer. They share the `webapp_skills` schema but otherwise touch disjoint files.

## In-scope
- New UI hook `livos/packages/ui/src/hooks/use-teach-recorder.ts` — subscribes to the VNC client's mouse/keyboard/wheel/scroll DOM events (whatever react-vnc / @novnc/novnc surfaces), translates each to a canonical action-log entry, requests a screenshot per event, and emits heartbeat-screenshots every 1 second while recording is active.
- Mode-selector integration: when the user picks "Teach" in P95's mode pill, the hook arms; a red pulsing indicator + "Stop" affordance live in the same pill region. Stop opens a Save dialog (skill name + optional description), which on submit POSTs `webapps.skills.create({webappId, name, actionLog})`.
- New tRPC router `livos/packages/livinityd/source/modules/webapps/skills-router.ts` exposing `webapps.skills.{create, list, get, delete}`. Added to root router and to `httpOnlyPaths` in `common.ts` per the WebSocket pitfall in CLAUDE.md.
- New persistence module `livos/packages/livinityd/source/modules/webapps/skills-storage.ts` — receives screenshots (base64 JPEG payloads in MCP image shape `{type:'image', data, mimeType}`) and writes them to `/data/webapp-skills/<userId>/<sessionId>/<ts>.jpg`. Verifies size ≤ 1280x800, JPEG quality 80 at write time (server re-encodes if client sent a larger frame). Returns the relative `screenshotRef` path stored inside the action-log entries.
- Postgres migration creating `webapp_skills` (`id` UUID PK, `user_id` UUID FK→`users(id) ON DELETE CASCADE`, `webapp_id` UUID FK→`webapps(id) ON DELETE CASCADE`, `skill_name` TEXT NOT NULL, `action_log` JSONB NOT NULL, `created_at` TIMESTAMPTZ DEFAULT NOW()). Unique index on `(user_id, webapp_id, skill_name)`. Dual-write convention (discrete `.sql` artifact under `database/migrations/` + idempotent `IF NOT EXISTS` DDL in `database/schema.sql`).
- New UI component `webapp-skills-sidebar.tsx` — collapsible sidebar inside `WebAppStreamWindow`; lists this WebApp's saved skills with name/created-at/action-count + delete affordance; clicking a skill opens the scrubber.
- New UI component `skill-replay-scrubber.tsx` — read-only linear timeline with one tile per logged action; tile shows the captured screenshot thumbnail + action label (e.g. "click @ 412,205", "type 'hello'", "scroll down 4"). NOT a playback engine — purely an inspector.
- Privacy default: a one-shot warning toast on first Teach activation per session — "Do not enter passwords during teach mode. Screenshots may capture typed text." Dismissable, persisted in `localStorage` so it doesn't nag forever.
- Recording hard-stops on window close, on mode change away from Teach, or on explicit user Stop. A safety auto-stop fires after 10 minutes of continuous recording (defensive guard against runaway disk usage).
- Action-log JSON schema (canonical):
  - Top-level: `{ version: 1, webappId, startedAt, endedAt, events: ActionEvent[] }`.
  - `ActionEvent` discriminated union by `type`:
    - `{ type: 'click', button: 'left'|'middle'|'right', coords: {x,y}, ts, screenshotRef }`
    - `{ type: 'key', key: string, modifiers: string[], ts, screenshotRef }`
    - `{ type: 'wheel', dx: number, dy: number, ts, screenshotRef }`
    - `{ type: 'scroll', coords: {x,y}, dx, dy, ts, screenshotRef }`
    - `{ type: 'wait', durationMs, ts, screenshotRef }` — emitted only by the 1s heartbeat
  - All `ts` values are ms-since-`startedAt` (NOT wall-clock) so the log is portable.
- Unit tests for the action-log canonicalizer + the file-write path (rejects oversized images, rejects non-JPEG MIME, slugifies skill names).

## Out-of-scope
- Auto mode replay tool / bytebot loop / per-WebApp MCP scoping → owned by **P97**.
- Window manager / `x11vnc`/`websockify` spawn → owned by **P93**.
- WebApp metadata extraction → owned by **P92**.
- Desktop "Add WebApp" right-click flow → owned by **P94**.
- Stream window shell, mode selector pill, agent panel, VNC client mount → owned by **P95**. P96 only adds two more components inside that shell and registers the recorder hook against the existing mode-state machine.
- Multi-user Chrome profile isolation, per-user storage paths beyond the single `bruce` user → deferred to v34 per D-V33-07. P96 still uses `<userId>` in the path so the schema doesn't have to change in v34, but the test matrix is single-user only.
- Credential auto-redaction (OCR-based) → deferred to v34 per DRAFT §8 #3. P96 ships warn-only.
- Skill sharing / marketplace → deferred per DRAFT §9.
- Editing a saved skill (rename is OK; mid-event splicing is not) → defer to v34.

## Dependencies
- **Phases**: P95 (mode selector + agent panel + VNC client mount in `WebAppStreamWindow`); P94 (`webapps` table — `webapp_id` FK target); P93 (window manager — recording is meaningless without the live stream); P92 (URL→title for window-discovery, indirect).
- **Code surfaces**: existing tRPC scaffolding (`server/trpc/{index.ts,common.ts,trpc.ts,is-authenticated.ts}`), Postgres pool (`modules/database/index.ts`), migration dual-write pattern (per P92 CONTEXT precedent), UI window component framework (`livos/packages/ui/src/modules/window/`), VNC hook from P95 (`use-webapp-vnc.ts`).
- **Data**: Postgres `livos` DB with existing `users` and `webapps` tables (FK targets). Filesystem under `/opt/livos/data/webapp-skills/` writable by the livinityd service user (Mini PC: `bruce`).
- **External binaries**: none beyond what P95 already required (the VNC client runs entirely in the browser).
- **External packages**: image re-encoding on the server — prefer `sharp` if already in livinityd `package.json` (it is — see the `sharp` resolution-drift note in CLAUDE.md). Otherwise reject and bail; do NOT add a new image dependency.
- **Storage convention**: `/data/<context>/<userId>/...` per CLAUDE.md — full prod path is `/opt/livos/data/webapp-skills/<userId>/<sessionId>/<ts>.jpg`. The `<sessionId>` is a UUID minted at recorder arm time, NOT the agent session ID — this isolates each Teach run even if the user starts/stops several within one WebApp window session.

## Sacred constraints
- **`liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.** Verify via `git hash-object` before AND after every commit. P96 has no business in `liv/` at all — this constraint should hold trivially, but verification is non-optional.
- Subscription-only path: no raw `@anthropic-ai/sdk` imports introduced. P96 is UI + livinityd + Postgres only — no agent core code.
- No backwards-compat hacks. New schema, new router, new components — all greenfield.
- No emoji unless explicitly authored.
- All new tRPC routes MUST be added to `httpOnlyPaths` in `common.ts` per the tRPC WebSocket pitfall (CLAUDE.md "Common Pitfalls" section).
- Migration follows the dual-write rule: discrete `.sql` artifact under `database/migrations/` AND idempotent `IF NOT EXISTS` DDL appended to `database/schema.sql` (P92 precedent).

## Gray areas / open questions
1. **Screenshot heartbeat frequency tradeoff (latency vs storage)**. Provisional default is 1s heartbeat + 1 frame per input event. At ~30 KB/JPEG (q=80, 1280x800 typical for a Chrome window) and 1 frame/sec, a 5-minute teach run is ~9 MB. With heavy clicking that doubles. Options under consideration:
   - **Keep 1Hz heartbeat** (provisional). Tolerable disk cost; gives Auto mode enough vision frames to validate sub-second drift. Risk: 10-min cap × 60 frames/min × 30 KB ≈ 18 MB worst case per skill — acceptable.
   - **Drop to 0.5 Hz heartbeat** if disk pressure shows up in P98 UAT. Halve storage at the cost of coarser temporal resolution.
   - **Adaptive: 1Hz when active, suspend during `wait` gaps > 5s**. More logic, marginal savings; defer unless real-world skills break the 10-min cap.
   - **Decision**: ship 1Hz fixed in P96; revisit if P98 UAT reports disk concerns.
2. **Credential redaction strategy**. DRAFT §8 #3 directs warn-only for v33. But "warn-only" still has design choices:
   - Does the warning fire **once per session** (provisional) or **every Teach activation**? Per-session reduces nag.
   - Is the warning a **toast** (provisional, dismissable) or a **modal that blocks** until acknowledged? Toast preferred — Teach mode is a power-user feature; modal friction would discourage use.
   - Should the warning text live in i18n strings or hardcoded English? P96 follows existing UI convention (most v32 strings are inline English) — defer i18n until a broader pass.
   - Should we visually mark `key`-event entries that look like password input (e.g. `<input type="password">` focused at event time)? The VNC client cannot read DOM type attributes — defer entirely.
   - **Decision**: per-session toast in English, dismissable, `localStorage` flag `liv:webapp:teach:warning-ack:v1`.
3. **Action log JSON schema canonicalization**. Two competing instincts:
   - **Loose**: store whatever the VNC client emits; let P97 figure out the shape. Tempting because we don't yet know exactly what fields the chosen VNC library exposes. Risk: P97 builds against an undocumented contract; future schema changes break stored skills silently.
   - **Strict** (provisional): canonicalize to the discriminated-union schema above at the recorder hook layer. Drops VNC-library-specific oddities (e.g. raw RFB key codes) and stores a stable contract. Schema versioned (`version: 1`) so v34 can migrate.
   - **Risk with strict**: if the VNC client emits an event we haven't modelled (e.g. `paste`, `drop`, `gesture`), the recorder either drops it silently or stamps it as `'unknown'`. Provisional plan: log a UI dev-console warning + drop, with a counter exposed in the scrubber footer ("3 events dropped") so the user knows fidelity isn't perfect.
   - **Decision**: strict schema, `version: 1`, drop-with-warning fallback. Document the modelled vs. unmodelled event matrix in the SUMMARY.
4. **Re-encode on server vs. trust client**. The VNC client likely emits PNG screenshots (canvas `toDataURL`). Server re-encoding to JPEG q=80 via `sharp` is the safe path (enforces size + format invariants). Cost: CPU per frame. With 1Hz heartbeat that's ~1 sharp call/sec — trivial on the Mini PC. Decision: re-encode on server; skill-storage rejects payloads > 4 MB pre-encode as a sanity bound.
5. **`<sessionId>` lifecycle on save vs. discard**. If the user records 5 minutes then cancels the Save dialog, do we GC the on-disk `<sessionId>` directory? Provisional: yes, on dialog dismiss the recorder issues `webapps.skills.discard({sessionId})` which `rm -rf`s the directory. Otherwise dead frames pile up.
6. **Scrubber thumbnail size**. Each tile loads a JPEG at full 1280x800; we likely want <100 KB per tile for a smooth horizontal-scroll timeline. Either generate a thumbnail variant on save (server-side `sharp` resize to 320x200) or rely on browser `img` element scaling. Provisional: generate `<ts>.thumb.jpg` (320x200 q=70) alongside the full frame at write time. Doubles write count but halves bandwidth on scrubber open.
7. **Concurrent Teach across multiple WebApp windows**. User has 3 WebApp windows open; clicks Teach in two of them. Are recordings independent? Provisional yes — each `WebAppStreamWindow` instantiates its own `useTeachRecorder` hook with its own `<sessionId>`. The hook is local-state only. The DRAFT didn't address this; flag for P98 UAT.
8. **"Wait" event semantics**. The 1Hz heartbeat emits `{type:'wait', durationMs: 1000}`. But what if the user is genuinely idle for 30s mid-teach? Do we collapse 30 heartbeats into one `wait` of 30000ms? Provisional: keep as 30 separate 1000ms entries — gives Auto mode a finer "did the page state change between heartbeats" signal. Storage cost is the screenshot, not the JSON entry, so collapsing JSON would not help much.

## Success criteria
1. With a P95 stream window open, the user can click "Teach", interact with the Chrome window for at least 30 seconds, click "Stop", name the skill, and see it appear in the sidebar immediately (no refresh).
2. Action log saved to Postgres `webapp_skills.action_log` reflects the canonical schema with `version: 1`; every event has a non-empty `screenshotRef` that resolves to a real file on disk.
3. Heartbeat fires at 1 Hz throughout active recording; verified by counting `'wait'` entries vs. `endedAt - startedAt` in the saved log within ±2 events tolerance.
4. Cancelling the Save dialog removes the on-disk session directory.
5. Replay scrubber renders a tile per event with a visible thumbnail in <2 seconds for a 5-minute skill.
6. Privacy warning toast appears on first Teach activation per session; does not reappear after dismiss within the same session.
7. Auto-stop fires at 10 minutes; surfaces a non-modal banner explaining the cap.
8. Postgres `webapp_skills` table exists after `bash /opt/livos/update.sh` (verified via `\d webapp_skills`).
9. `webapps.skills.*` procedures reachable over HTTP (not WebSocket) — confirmed by `httpOnlyPaths` membership.
10. Sacred SHA verified unchanged at phase open and phase close.
