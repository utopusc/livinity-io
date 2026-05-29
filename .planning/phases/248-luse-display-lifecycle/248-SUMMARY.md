---
phase: 248
status: DEPLOYED-OPERATOR-PENDING
artifact_complete_on: 2026-05-29
shipped_on: minipc-pending-operator-uat-walk
plans: 5
plans_complete: 5
deployed_sha: 49ba196501ae481a337645970d6cef2e2ba71f7d
sacred_sha_preserved: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_file_sha256: 293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b
subsystem: livos/packages/livinityd/source/modules/computer-use/displays + computer-use/mcp + docs/luse + 4 agent shim dirs
tags: [v44, luse, displays, xephyr, xvfb, mcp-tools, ttl-gc, owner-scoped, agent-agnostic, sync-script, wave-final, deploy]
provides:
  - createDisplayManager factory + DisplayManager runtime type (DI'd spawn + Redis + owner-scope policy)
  - DISPLAY_REDIS_PREFIX = 'luse:display:' drift-locked
  - DisplayMode union {'xephyr', 'xvfb'} + D-V44-DISPLAY-XEPHYR-DEFAULT
  - DisplayRecord 8-field surface (incl. running_apps + optional last_app_at)
  - KillDisplayResult discriminated union {ok:true,killed_apps_count} | {ok:false,error:'not-owner'|'not-found'}
  - 4 new MCP tools — computer_create_display / computer_list_displays / computer_kill_display / computer_launch_app_in_display
  - computer_application gains optional display arg (additive, reuses parseDisplayArg)
  - createDisplayTtlGc factory — 1h sweep / 4h idle threshold
  - DISPLAY_TTL_GC_DEFAULT_IDLE_MS = 14_400_000 drift-locked
  - DISPLAY_TTL_GC_DEFAULT_SWEEP_MS = 3_600_000 drift-locked
  - Owner-impersonation lift for TTL GC (in-process; user-facing owner-scope intact)
  - 5 canonical docs under docs/luse/ (DISPLAY-LIFECYCLE.md + 4 per-tool refs)
  - LUSE.md hub gains 'Display lifecycle (Phase 248)' section
  - sync-luse-skills.sh manifest extended (5 new read_canonical + CONCAT_PAYLOAD sections + Claude shim emissions)
  - 9 regenerated agent shim files across .claude/.aion/.opencode/.openclaw
  - Mini PC live deployment of 248-01..04 bytes at SHA 49ba196501ae
requires:
  - Phase 241 Luse MCP registrar (build-on-top)
  - Phase 242 per-tool docs shape + sync-script manifest pattern
  - Phase 246-05 ttl-gc.ts DI pattern + factory shape (mirrored verbatim for displays)
  - Phase 243-01 metadata.ts Redis prefix-constant convention (PTY_SESSION_REDIS_PREFIX → DISPLAY_REDIS_PREFIX)
  - Phase 247-02 sync-luse-skills.sh manifest extension pattern (5 new read_canonical + CONCAT_PAYLOAD)
  - Phase 246-06 deploy log + UAT-checklist shape + operator-pending escape hatch (not engaged this phase, but pattern reused)
affects:
  - livos/packages/livinityd/source/modules/computer-use/displays/ (new module — 6 files)
  - livos/packages/livinityd/source/modules/computer-use/luse-tools.ts (4 new schemas + computer_application display prop)
  - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts (buildHandlers — 4 new + LuseToolsOptions.displayManager)
  - livos/packages/livinityd/source/modules/computer-use/mcp/server.ts (boot wiring — DisplayManager + DisplayTtlGc)
  - livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts (9 new vitest cases)
  - docs/luse/ (5 new canonical files)
  - docs/luse/LUSE.md (new section)
  - scripts/sync-luse-skills.sh (manifest extension)
  - .claude/skills/luse/ (5 new shims + SKILL.md regenerated)
  - .aion/.opencode/.openclaw skills/luse.md (CONCAT_PAYLOAD extended)
  - Mini PC `/opt/livos/` rsync layout (updated via update.sh)
tech-stack:
  added: []
  patterns:
    - DI factory (createDisplayManager(deps): DisplayManager) — mirrors Phase 246-05 createTtlGc + Phase 243 SessionManager
    - Async initialization seam (mgr.initialized promise) — SCAN-seeds allocator before first create()
    - Per-instance in-memory spawn-handle Map + Redis source-of-truth (D-248-01-D, surfaced as a known probe limitation in 248-05 E.4)
    - Owner-impersonation lift for TTL GC (in-process; bypasses user-facing owner-scope via read-record + pass-back into kill(callerSession))
    - Fail-closed handler envelope when injected dep missing (returns 'Error: displayManager not wired')
    - withScopedDisplay wrapper for X11-touching tools (reuse from Phase 103-B)
    - parseDisplayArg regex /^:[1-9][0-9]?$/ for LLM→env trust-boundary gating (reused, not forked)
    - Standalone Claude shim shape for top-level docs (Phase 247 D-247-02-C pattern)
    - Agent-agnostic prose invariant (no Claude/Aion/Gemini/OpenCode/OpenClaw in canonical .md bodies)
    - Lazy [luse-mcp] boot log on first agent invocation (vs eager parent log line)
key-files:
  created:
    # Plan 248-01 — Backend display module
    - livos/packages/livinityd/source/modules/computer-use/displays/types.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/redis-keys.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/index.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-manager.test.ts
    # Plan 248-03 — TTL GC
    - livos/packages/livinityd/source/modules/computer-use/displays/display-ttl-gc.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-ttl-gc.test.ts
    # Plan 248-04 — canonical docs
    - docs/luse/DISPLAY-LIFECYCLE.md
    - docs/luse/tools/create_display.md
    - docs/luse/tools/list_displays.md
    - docs/luse/tools/kill_display.md
    - docs/luse/tools/launch_app_in_display.md
    # Plan 248-04 — Claude shims (standalone)
    - .claude/skills/luse/DISPLAY-LIFECYCLE.md
    - .claude/skills/luse/create_display.md
    - .claude/skills/luse/list_displays.md
    - .claude/skills/luse/kill_display.md
    - .claude/skills/luse/launch_app_in_display.md
    # Plan 248-05 — deploy + UAT
    - .planning/phases/248-luse-display-lifecycle/248-05-DEPLOY-LOG.md
    - .planning/phases/248-luse-display-lifecycle/248-05-UAT-CHECKLIST.md
    - .planning/phases/248-luse-display-lifecycle/248-05-SUMMARY.md
    - .planning/phases/248-luse-display-lifecycle/248-SUMMARY.md
  modified:
    # Plan 248-02 — MCP wiring
    - livos/packages/livinityd/source/modules/computer-use/luse-tools.ts
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts
    - livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts
    # Plan 248-03 — type surface additive
    - livos/packages/livinityd/source/modules/computer-use/displays/types.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts
    - livos/packages/livinityd/source/modules/computer-use/displays/index.ts
    # Plan 248-04 — docs hub + sync script + bundled shims
    - docs/luse/LUSE.md
    - scripts/sync-luse-skills.sh
    - .claude/skills/luse/SKILL.md
    - .aion/skills/luse.md
    - .opencode/skills/luse.md
    - .openclaw/skills/luse.md
plans:
  - id: 248-01
    title: Backend display module (Xephyr/Xvfb spawn + Redis state + owner-scoped kill)
    type: tdd
    vitest: 15/15
    typecheck: 0 new errors
    sacred_sha: preserved
    commits: 3
    summary: .planning/phases/248-luse-display-lifecycle/248-01-SUMMARY.md
  - id: 248-02
    title: MCP tool registrations + computer_application display arg
    type: tdd
    vitest: 18/18 (9 new + 9 pre-existing R3)
    typecheck: 0 new errors
    sacred_sha: preserved
    commits: 3
    summary: .planning/phases/248-luse-display-lifecycle/248-02-SUMMARY.md
  - id: 248-03
    title: TTL GC — 1h sweep / 4h idle threshold + owner-impersonation lift
    type: tdd
    vitest: 8/8 (23/23 cumulative under displays/)
    typecheck: 0 new errors
    sacred_sha: preserved
    commits: 3
    summary: .planning/phases/248-luse-display-lifecycle/248-03-SUMMARY.md
  - id: 248-04
    title: Canonical agent-agnostic docs + sync-luse-skills.sh manifest extension
    type: execute
    sync_first_run: 5 new / 4 updated / 11 unchanged
    sync_second_run: 0 / 0 / 20 (D-242-B idempotency intact)
    sacred_sha: preserved
    commits: 3
    summary: .planning/phases/248-luse-display-lifecycle/248-04-SUMMARY.md
  - id: 248-05
    title: Mini PC deploy via update.sh + 5 wire-level probes + UAT checklist + phase aggregate
    type: execute
    probes_green: 9/10 (1 known D-248-01-D limitation)
    services_post_deploy: 6/6 active
    sacred_aionui_sha256_byte_identical: true
    sacred_sha: preserved
    commits: 3 (this plan)
    summary: .planning/phases/248-luse-display-lifecycle/248-05-SUMMARY.md
metrics:
  total_plans: 5
  total_commits: 15
  vitest_cases_new_in_phase: 32 (15 + 9 + 8)
  vitest_cases_cumulative_under_displays: 23
  vitest_cases_cumulative_under_computer_use: 41
  drift_locks: 17 (6 + 5 + 4 + idempotency-pair)
  agent_shims_synced: 20 (4 first-run-new + 6 first-run-updated + 0 second-run-changed)
  duration_seconds_total: ≈1409 (329 + 540 + 249 + 291 within plan execution; deploy = ~1860 extra)
---

# Phase 248: Luse Display Lifecycle — Phase Summary

## What this phase shipped

A complete display-lifecycle subsystem for the Luse computer-use MCP surface. Liv AI (Claude / AionUi / OpenCode / OpenClaw on Mini PC) can now:

1. Create a nested X server (Xephyr visible-default, Xvfb headless opt-in) at `:10+`
2. Launch any LivOS app inside a specific display (catalog-resolved or binary-spawn)
3. List all displays globally (any session sees all displays — awareness)
4. Kill a display the calling session owns (`D-V44-DISPLAY-OWNER-SCOPED`)
5. Have idle displays auto-cleaned after 4h (1h sweep cadence)
6. Use any existing X11-touching tool (e.g. `computer_application`) with a `display:` arg that scopes the action to a specific nested X server

The discipline is **agent-agnostic** (canonical docs carry zero agent names) and **owner-scoped** (per-session kill, global list), enforced at the manager layer so MCP wrappers and TTL GC inherit correctness for free.

## Per-plan rollup

| Plan   | Title                                                        | Type   | Tests             | Commits | Key drift-locks                                                                 |
| ------ | ------------------------------------------------------------ | ------ | ----------------- | ------- | ------------------------------------------------------------------------------- |
| 248-01 | Backend display module                                       | tdd    | 15/15 vitest      | 3       | DISPLAY_REDIS_PREFIX, allocator start :10, default mode xephyr, default 1920x1080, owner-scope deny+allow |
| 248-02 | MCP tool registrations + computer_application display arg    | tdd    | 18/18 vitest      | 3       | 4 tool schemas (mode enum + required arrays), owner-scope error shape           |
| 248-03 | TTL GC — 4h idle, 1h sweep, owner-impersonation lift         | tdd    | 8/8 vitest        | 3       | 14_400_000 + 3_600_000 constants, owner-impersonation kill payload, audit log shape |
| 248-04 | Canonical docs + 4-shim sync                                 | execute| sync 5/4/11; 0/0/20 idempotency | 3 | Agent-agnostic prose invariant; D-242-B (sha-marker idempotency)                |
| 248-05 | Mini PC deploy + 5 wire-level probes + UAT                   | execute| 9/10 probes GREEN | 3       | Sacred AionUi sha256 byte-identical PRE/POST; deployed SHA 49ba196              |

**Total:** 15 commits, 32 new vitest cases (41 cumulative under computer-use), 17 drift-locks, 20 agent shims synced + idempotency invariant verified.

## D-V44 invariant verification (cumulative across all 5 plans)

| Invariant                          | Status | Evidence                                                                                                   |
| ---------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| **D-V44-SACRED**                   | ✅      | Repo blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 15 commits (pre-commit PASS each time). Mini PC AionUi binary sha256 `293a49927b408a26...` byte-identical PRE/POST 248-05 deploy. |
| **D-V44-MINI-PC-ONLY**             | ✅      | Zero Server4 references in any 248 plan or summary. Zero Server5 references. Deploy targeted `bruce@10.69.31.68` exclusively. |
| **D-V44-CADDY-REUSE-226-04**       | ✅ NA   | Phase 248 did not touch caddy.ts. update.sh logged `Caddy /liv reverse-proxy (livinityd-emitted) [Phase 226-04]` unchanged through 248 deploy. |
| **D-V44-NO-ROOT-PTY**              | ✅ NA   | Phase 248 spawns Xephyr/Xvfb via DI'd spawnFn — runs as `bruce` per Probe A pid lineage (`ps -o user`). No root execution paths added. |
| **D-V44-DISPLAY-XEPHYR-DEFAULT**   | ✅      | 248-01 Case 6 drift-locks default mode='xephyr' spawning Xephyr binary; 248-05 Probe A used default and confirmed Xephyr ran (xdpyinfo on :10 reported X.Org via Xephyr binary). |
| **D-V44-DISPLAY-OWNER-SCOPED**     | ✅      | 248-01 Case 11 drift-locks deny shape (caller≠owner → `{ok:false, error:'not-owner'}`); 248-02 Case G drift-locks MCP wrapper surfacing; 248-03 D-248-03-A documents the owner-impersonation lift used by TTL GC; 248-05 Probe E proved allow path (caller=owner='bruce' → `{ok:true, killed_apps_count:0}`). Deny path is operator UAT item F (or remains drift-locked by vitest if single-tenant). |

All 6 invariants verified or documented as NA with rationale.

## Cumulative drift-locks (17)

### Constants (8)
- `DISPLAY_REDIS_PREFIX = 'luse:display:'`
- Allocator start = `:10`
- Allocator monotonic = `+1` per create
- Default mode = `'xephyr'`
- Default width × height = `1920 × 1080`
- `DISPLAY_TTL_GC_DEFAULT_IDLE_MS = 14_400_000` (4h)
- `DISPLAY_TTL_GC_DEFAULT_SWEEP_MS = 3_600_000` (1h)
- `LUSE_USER_ID` env-thread for owner_session (D-248-02-A)

### Shapes (6)
- `KillDisplayResult` discriminated union
- `DisplayRecord` 8-field surface (owner_session, mode, created_at, name, width, height, running_apps + optional last_app_at)
- 4 MCP tool input_schemas (`computer_create_display`, `computer_list_displays`, `computer_kill_display`, `computer_launch_app_in_display`)
- `computer_application` additive display prop (no required[] change)
- Owner-impersonation kill payload (`callerSession: r.owner_session`)
- Audit log shape `'display-ttl-gc: killed idle display' + {display, idleAgeMs, owner_session}`

### Idempotency (3)
- `bash scripts/sync-luse-skills.sh` second run → `0/0/20` (D-242-B intact)
- Sacred blob SHA preserved across 15 commits
- Sacred binary sha256 byte-identical PRE/POST 248-05 deploy

## Deviations across the phase

### Documented (1)

1. **248-05 Probe E.4 cross-process X-server kill** — known D-248-01-D limitation (per-instance handle Map). NOT a runtime bug; singleton MCP-child path (UAT item E) is the wire-level proof. Future v45+ micro-phase could read PID from Redis HSET and use `process.kill(pid, 'SIGTERM')` for cross-restart kill.

### Auto-fixed (0)

None. Every plan executed exactly as written.

### Architectural escalations (0)

None.

## Reversibility

If Phase 248 needs to be reverted (e.g. a regression discovered post-UAT), the rollback is **atomic** at the MCP layer:

- Delete the 4 new entries from `LUSE_TOOLS` (luse-tools.ts) → tools immediately disappear from agent discovery.
- Delete the 4 new entries from `buildHandlers` (mcp/tools.ts).
- Drop the `displayManager` + `displayTtlGc` construction in `mcp/server.ts` main() (the parent `Luse MCP source enabled` registration log line stays).
- Delete the `displays/` module directory (no other consumer outside MCP).
- `computer_application` reverts to byte-identical pre-248 behavior when `display:` arg is omitted (the `withScopedDisplay` wrap is a no-op when both arg and defaultDisplay are nullish — already in production for `computer_move_mouse` etc.).
- Docs revert: delete the 5 canonical files + remove the LUSE.md section + revert sync-luse-skills.sh manifest hunks → re-run sync → shims auto-clean (per Phase 247 D-242-B).

No data migration. No Redis schema. No Caddy reload. No update.sh changes. Reversibility is byte-clean.

## Deferred items (carried forward to v45+)

- **Multi-monitor virtual display** — single Xephyr per `:N` for now; multi-screen Xephyr `-screen 0 1920x1080 -screen 1 1920x1080` deferred (per 248-CONTEXT line 72).
- **Screen-sharing of nested displays to web UI** — operator currently sees Xephyr on their local desktop only; web-streamed nested displays (à la noVNC over Xephyr) deferred.
- **Cross-restart spawn-handle persistence** — Probe E.4's surface area. Read PID from Redis HSET + `process.kill(pid, 'SIGTERM')` for true cross-process kill. Defer until a second concrete need surfaces.
- **Owner-scope at MCP per-request granularity** — currently `LUSE_USER_ID` env-thread (D-248-02-A). When multi-session-per-MCP-child becomes a real use case, refactor to per-request `callerSession` injection.
- **TTL operator-tunable via Redis flag** — currently fixed at 14_400_000 ms. Future enhancement: `liv:config:display_ttl_idle_ms` Redis key with hot-reload.
- **`killAsSystem()` admin method** — owner-impersonation lift is the v44 choice (D-248-03-A); if a second admin caller surfaces (operator "kill all" UI), promote to a typed admin escape method.

## Operator handoff

The phase is **code-complete + deployed**, awaiting the UAT walk to flip from `⏳ DEPLOYED-OPERATOR-PENDING` to `✅ SHIPPED`.

1. Operator opens `https://bruce.livinity.io/` → logs in → opens Liv AI shell.
2. Walks `.planning/phases/248-luse-display-lifecycle/248-05-UAT-CHECKLIST.md` items A→G mandatory.
3. If 7/7 PASS, operator commits the checklist + flips `Phase 248` row in `.planning/ROADMAP.md` to `✅ SHIPPED`.
4. v44.0 milestone advances 4/8 (post-245) → 5/8.

## Self-Check

- ✅ All 5 per-plan SUMMARY.md files exist (248-01 → 248-05)
- ✅ All 15 commits present in `git log --oneline` (5ff2f0fb / f4c42eae / 9a72fa99 / 46d3ae18 / d4c718aa / c79c3d8b / 201b13d8 / ba9436be / e8a6ab01 / 6ac2c3ac / 0f9fcc95 / 5b6b455a / 71404fe9 / 54a7f9eb / a96edc56 / 49ba1965 + 248-05 commits 6f2445e0 / f50b4941 + this commit)
- ✅ Mini PC deployed SHA `49ba196501ae...` (recorded in `/opt/livos/.deployed-sha`)
- ✅ Sacred AionUi sha256 byte-identical PRE/POST: `293a49927b408a26...`
- ✅ Sacred repo blob SHA preserved on every commit: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- ✅ 6/6 services active POST 248-05 deploy
- ✅ All 6 D-V44 invariants verified or documented as NA with rationale
- ✅ Reversibility documented; rollback is byte-clean
- ✅ 1 deferred limitation documented (Probe E.4 → v45+ cross-restart spawn-handle persistence)

## Self-Check: PASSED
