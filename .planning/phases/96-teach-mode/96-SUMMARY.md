# Phase 96: Teach Mode — Action Recording — SUMMARY

**Status:** Code-complete (local UAT + Mini PC deploy = P98).
**Sacred SHA at phase open:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
**Sacred SHA at phase close:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (verified — unchanged)
**Phase commits (P96-only — interleaved with parallel P97 wave):**

- `cfd83100` feat(96-01): webapp_skills table — Postgres migration + schema dual-write
- `24d290ba` feat(96-02): skills-storage + skills-router (livinityd)
- `a17ca7f8` feat(96-03): use-teach-recorder hook (UI core logic)
- `748f55dd` feat(96-04): mode-selector wiring + privacy toast (Teach mode)
- `cefafbcd` feat(96-05): webapp-skills-sidebar + WebAppStreamWindow integration
- `d85904bf` feat(96-06): skill-replay-scrubber + frame stream HTTP route

---

## Shipped deliverables

1. **`webapp_skills` Postgres table** — dual-write migration
   (`migrations/2026-05-08-p96-webapp-skills.sql` + idempotent
   `IF NOT EXISTS` block in `database/schema.sql`). Cascade FKs on
   `users` and `webapps`, UNIQUE `(user_id, webapp_id, skill_name)`,
   index on `(user_id, webapp_id)`.

2. **`skills-storage.ts`** — sharp-based JPEG re-encode (q=80, max
   1280×800), 320×200 q=70 thumbnail, path-traversal defense (UUID
   validation on userId + sessionId, ts numeric), 4 MB pre-encode
   payload cap. `discardSession` is idempotent. `loadFrame` returns
   null on miss.

3. **`skills-repository.ts`** — CRUD on `webapp_skills`. List query
   returns `actionCount` via `jsonb_array_length(action_log->'events')`.

4. **`skills-router.ts`** (`webapp.skills.*` sub-router) —
   create/list/get/delete/discard/uploadFrame. Cross-user reads return
   `NOT_FOUND` (STRIDE I). Unique-violation `23505` → `CONFLICT`.
   Stamps `meta.sessionId` on save so cascade-delete can GC disk.

5. **`useTeachRecorder` hook** — DOM listeners on
   mousedown/keydown/wheel/scroll, 1Hz heartbeat (`HEARTBEAT_MS = 1000`),
   10-min defensive auto-stop (`AUTO_STOP_MS = 10*60*1000`). Strict
   canonicalization to the v1 discriminated union; unknown variants
   drop with `console.warn` in dev only. `crypto.randomUUID()` session
   id. Cleanup on unmount fires `webapp.skills.discard`.

6. **WebAppStreamWindow integration** — picking Teach arms
   `useTeachRecorder` + fires the privacy toast (per-install ack via
   `liv:webapp:teach:warning-ack:v1` localStorage key). Picking Watch
   stops recording → opens `SaveSkillDialog` (slug-safe name
   validator) for non-empty captures, otherwise discards.
   `TeachRecordingOverlay` shows the red pulsing dot + Stop button.
   `TeachAutoStopBanner` surfaces the 10-minute cap event.

7. **`webapp-skills-sidebar.tsx`** — 280px right-edge collapsible
   panel. List query auto-invalidates after a Save mutation so newly-
   saved skills appear in <1s. Trash icon with AlertDialog confirm
   removes the row + cascades disk GC. Hidden in Auto mode.

8. **`skill-replay-scrubber.tsx`** — read-only horizontal timeline
   overlay above the VNC pane. One 200×140 tile per ActionEvent with
   thumbnail + label. IntersectionObserver lazy-loads beyond the first
   20 tiles so a 5-min skill (~300 frames) doesn't fetch all 300
   thumbs upfront.

9. **`/api/webapp-skills/:sessionId/:filename` HTTP route** — auth via
   `LIVINITY_SESSION` cookie + `verifyToken`; userId sourced from token
   payload (cross-user reads 404 by construction). Cache-Control
   `private, max-age=3600`. Lower friction than a tRPC procedure (no
   base64 round-trip, native `<img>` caching).

10. **httpOnlyPaths** — six new entries
    (`webapp.skills.{create,list,get,delete,discard,uploadFrame}`) per
    the WS-reconnect-survival pitfall (B-12 / X-04).

11. **P97 fixture** — `__fixtures__/sample-skill.json` is a hand-
    canonicalized minimal v1 action log (3 clicks + 2 heartbeats) with
    sentinel UUIDs. Validated by `skills-router.test.ts T11` (zod
    + ownership round-trip with mocked pool).

---

## Tests

| Test file | Tests | Status |
|---|---|---|
| `skills-storage.test.ts` (T1–T8) | 9 | Green |
| `skills-router.test.ts` (T1–T11) | 11 | Green (incl. fixture) |
| `use-teach-recorder.unit.test.tsx` | 20 | Green |
| `webapp-stream-window.unit.test.tsx` (existing P95) | 17 | Green (no regressions) |

Total new P96 tests: 40.

Typecheck deltas (vs baseline):

- livinityd: 364 errors (no new errors introduced).
- ui: 163 errors (no new errors introduced).

---

## Gray-area decisions taken vs. deferred

From 96-CONTEXT §gray-areas:

| # | Topic | Decision in P96 | Deferred to |
|---|---|---|---|
| 1 | Heartbeat frequency | 1Hz fixed | Revisit only if P98 UAT flags disk pressure |
| 2 | Privacy warning UX | Per-install toast (`liv:webapp:teach:warning-ack:v1`), dismissable, English | i18n in a broader pass; `<input type=password>` redaction in v34 |
| 3 | Action-log canonicalization | Strict v1 discriminated union; unknown drop-with-warn (`droppedCount` exposed in scrubber footer) | v34 may add `paste` / `gesture` variants |
| 4 | Re-encode strategy | Server-side sharp re-encode q=80 + 320×200 thumb | — |
| 5 | Session lifecycle on cancel | `webapp.skills.discard` on Save-dialog dismiss | — |
| 6 | Scrubber thumbnail size | Generated 320×200 q=70 thumb at write time + lazy-load via IntersectionObserver | — |
| 7 | Concurrent multi-window Teach | Local-state hook, independent UUIDs per window | P98 UAT verifies |
| 8 | Wait event semantics | 30 separate 1000ms entries (no JSON collapse) | — |

---

## Cross-task invariants honoured

- Sacred file `liv/packages/core/src/sdk-agent-runner.ts` SHA
  `f3538e1d811992b782a9bb057d1b7f0a0189f95f` verified before AND after
  every commit. Zero edits in `liv/`.
- Subscription-only path preserved — no raw `@anthropic-ai/sdk` imports
  introduced.
- Migration follows the dual-write rule (P92 / P95 precedent).
- All six new `webapp.skills.*` tRPC paths added to `httpOnlyPaths` in
  `common.ts` BEFORE any UI calls them (transport-pitfall B-12 / X-04).
- ioredis named import not needed — P96 doesn't touch Redis.
- No emoji authored.
- `grep TODO\(96\|TODO\(P96\|FIXME\(96` against `liv/packages/core/`
  returns zero results.

---

## Known follow-ups for P98 UAT

1. **Mini PC deploy** — `bash /opt/livos/update.sh` to apply the
   migration + new server route + new UI bundles. Verify
   `\d webapp_skills` shows the expected schema.
2. **Live recorder smoke** — open a WebApp window, pick Teach,
   interact for 30s with 5 clicks + type "hello" + scroll, click Stop,
   name "smoke-test", verify Postgres row + on-disk JPEGs (full +
   thumb), sidebar list, scrubber render.
3. **Cancel flow** — record 5 minutes then cancel Save; verify the
   on-disk session directory is gone.
4. **Auto-stop timer** — record 10 minutes (hardcoded; will need test
   override during UAT); verify the amber banner fires, recording can
   be saved or dismissed.
5. **Concurrent Teach** — open two WebApp windows, Teach in each
   simultaneously; verify recordings are independent with separate
   sessionIds.
6. **Cross-user authorization** — manually flip the userId in a frame
   GET URL via cookie swap; expect 404, never the bytes.
7. **Disk pressure** — record a 10-minute skill at heavy click rate;
   measure session-dir size; revisit heartbeat frequency only if disk
   usage degrades.

---

## Fixture path for P97

`livos/packages/livinityd/source/modules/webapps/__fixtures__/sample-skill.json`

The fixture round-trips through the canonical zod validator + the
skill-router create path with mocked DB pool — see
`skills-router.test.ts T11`. P97 can import this fixture (or a
re-targeted copy with its own webappId) to seed Auto-mode replay
tests without re-deriving the schema.
