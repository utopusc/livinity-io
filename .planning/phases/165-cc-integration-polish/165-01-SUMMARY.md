---
phase: 165-cc-integration-polish
plan: 01
subsystem: infra
tags:
  - phase-165
  - idle-reaper
  - claude-runner
  - v34
  - polish
  - session-management
  - architectural-boundary

# Dependency graph
requires:
  - phase: 164-autonomous-scheduler
    provides: "Boot-order site between AutonomousScheduler.start() and drainInstallPendingRedisKeys for IdleSessionReaper to slot into; non-fatal try/catch pattern; in-memory fake-Redis test pattern (budget-gate.test.ts)"
  - phase: 163-surface-vault-contexts
    provides: "perSessionManagers Map<sessionKey, AgentSessionManager> in ws-agent.ts — reaper abort closure resolves the surface-scoped manager at abort time, honouring subsurface vault paths"
  - phase: 162-vault-and-sdk-integration
    provides: "claude-runner module barrel — IdleSessionReaper exports slot next to scaffoldVault + smokeAuthCheck + writeSurfaceContext"
  - phase: 161-computer-use-sdk-path-wiring
    provides: "AgentSessionManager.cleanup(sessionKey) public method that aborts the AbortController — reaper calls this through the interface boundary"
provides:
  - "IdleSessionReaper class (start/stop/tick) with injected SessionActivityProvider — aborts idle CC sessions after 30 min (Redis-overridable)"
  - "SessionActivityProvider interface — architectural boundary between reaper and liv-core internals; agent-session.ts remains UNCHANGED"
  - "ws-agent.ts module-scope reaperRegistry Map + createSessionActivityProvider() factory — populated on every ws.on('message')"
  - "livinityd boot wire-up at locked site: scaffoldVault → smokeAuthCheck → AutonomousScheduler.start() → IdleSessionReaper.start() → drainInstallPendingRedisKeys"
affects:
  - "Phase 165-02 Settings UI — exposes idle_reap_min editor via tRPC"
  - "Phase 165-04 v34-VERIFICATION + Mini PC deploy — must include reaper boot-log probe"
  - "Future Mini PC chat sessions — long-idle tabs no longer hold SDK subprocesses + Anthropic credit drain past 30 min"

# Tech tracking
tech-stack:
  added: []  # D-NO-NEW-DEPS — zero new npm dependencies
  patterns:
    - "Interface-boundary dependency-injection: reaper accesses session state ONLY through SessionActivityProvider; never imports @liv/core nor agent-session.ts"
    - "Module-scope registry + factory: reaperRegistry Map lives at module scope in ws-agent.ts so createSessionActivityProvider() returns a stable view across all WS connections"
    - "Boot wire-up non-fatal try/catch: each phase wires its module after the predecessor with the same try/catch shape (mirrors AutonomousScheduler pattern from Phase 164-02)"
    - "Late-binding abort closure: ReaperEntry.abort closes over `managerFor(sessionKey)` which resolves the per-sessionKey manager AT ABORT TIME, so Phase 163-02 subsurface-scoped managers are honoured"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/claude-runner/idle-reaper.ts (157 lines) — IdleSessionReaper class + SessionActivityProvider interface"
    - "livos/packages/livinityd/source/modules/claude-runner/idle-reaper.test.ts (335 lines) — 12 vitest cases (10 from plan + 2 defensive)"
  modified:
    - "livos/packages/livinityd/source/modules/claude-runner/index.ts (+12 lines) — barrel re-export of IdleSessionReaper + 4 types"
    - "livos/packages/livinityd/source/modules/server/ws-agent.ts (+71 lines) — reaperRegistry, createSessionActivityProvider, stamp on message, drop on close"
    - "livos/packages/livinityd/source/index.ts (+54 lines) — imports, idleReaper? field, start() wire-up, stop() teardown"

key-decisions:
  - "Reaper accesses session state through SessionActivityProvider interface — NOT direct import of agent-session.ts. This honours the Phase 165 quality gate (liv/packages/core/src/agent-session.ts UNCHANGED) and lets the reaper module live entirely inside livinityd/ where it can be tested in isolation."
  - "Abort closure resolves manager lazily via managerFor(sessionKey) — NOT bound to a manager reference at registration time — so Phase 163-02 surface-scoped managers are honoured even when a connection switches between subsurfaces mid-session."
  - "stop() telemetry stays in the early-shutdown cluster next to autonomousScheduler.stop() so in-flight tick() drains in parallel with cron drain before Redis client teardown."
  - "Redis flag liv:config:idle_reap_min — non-numeric, zero, or negative values fall back to default 30 min (defensive against admin typos / future tooling bugs)."
  - "Default 30 min chosen per CONTEXT.md decision row. POLL_INTERVAL_MS = 5 min — fine-grained enough that a session aborts within (idle + 5min) of crossing threshold; coarse enough that the cron load is negligible."

patterns-established:
  - "Architectural boundary via interface: when a module needs to act on state owned by a sacred file, expose the action surface as an interface in the consuming module and inject an implementation from the trusted wrapper layer (here: ws-agent.ts owns the AbortController + Map; reaper owns the policy)."
  - "Module-scope registry for cross-connection visibility: reaperRegistry lives at module scope (NOT inside the wss.on('connection') closure) so createSessionActivityProvider() returned at boot time sees ALL active WS sessions across every connection."

requirements-completed: []

# Metrics
duration: ~8min
completed: 2026-05-19
---

# Phase 165 Plan 01: Idle Session Reaper Summary

**5-minute setInterval reaper that aborts CC chat sessions after 30 min of WS-message inactivity (Redis-overridable), accessing session state through a clean SessionActivityProvider interface so liv-core agent-session.ts stays byte-identical.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-19T20:50:32Z
- **Completed:** 2026-05-19T20:58:00Z
- **Tasks:** 2 / 2
- **Files created:** 2 (idle-reaper.ts, idle-reaper.test.ts)
- **Files modified:** 3 (claude-runner/index.ts, ws-agent.ts, livinityd/index.ts)

## Accomplishments

- **IdleSessionReaper class** with public `start()` / `stop()` / `tick()` API and injectable `SessionActivityProvider` interface. Reads `liv:config:idle_reap_min` from Redis (default 30 min; non-numeric / non-positive / Redis-throws all fall back to default). Polls every 5 min via `setInterval` with `.unref()` to avoid pinning the event loop on shutdown.
- **Interface-boundary architecture** — reaper module CANNOT import `@liv/core` or any path containing `agent-session`. Test 10 grep-asserts both rules against the source file. `agent-session.ts` SHA `7c690d59ea08b6450da1d5bd243d06e62a70d473` is byte-identical pre & post plan.
- **ws-agent.ts hook** — module-scope `reaperRegistry` Map populated on every `ws.on('message')` with `{lastMessageAt, sessionKey, abort closure}`; closure calls `managerFor(sessionKey).cleanup(sessionKey)` (the existing AgentSessionManager public method already used by the WS-close handler — no new public API added). Drop on `ws.on('close')` keeps the registry coherent with active sessions.
- **livinityd boot wire-up** at locked site: AFTER `AutonomousScheduler.start()`, BEFORE `drainInstallPendingRedisKeys`. Shutdown stop in early-shutdown cluster next to `autonomousScheduler.stop()`.
- **12 vitest cases PASS** in `idle-reaper.test.ts` (10 from plan `<behavior>` + 2 defensive bonus tests for Redis-error and negative-override fallback).
- **Zero regression** in adjacent test suites: `ws-agent.surface-cwd.test.ts` 18/18, `ws-stream.test.ts` 15/15, `ws-desktop.test.ts` 14/14.
- **All 5 sacred SHAs byte-identical** pre & post plan (verified via `git ls-files -s`).
- **Zero new npm dependencies** (`package.json` + `pnpm-lock.yaml` diffs empty).

## Task Commits

1. **Task 1: Build IdleSessionReaper module + tests (RED → GREEN)** — `249b2840` (`feat`)
2. **Task 2: Hook SessionActivityProvider into ws-agent + wire reaper into livinityd boot** — `1aef001c` (`feat`)

_Note: Task 1 was executed TDD-style (RED test commit folded into the GREEN feat per Phase 164-02 precedent for single-task atomic delivery)._

## Files Created/Modified

- `livos/packages/livinityd/source/modules/claude-runner/idle-reaper.ts` (NEW, 157 lines) — `IdleSessionReaper` class, `SessionActivityProvider` interface, `SessionSnapshot` + `IdleReaperLogger` + `IdleSessionReaperOptions` types. Pure module; no `@liv/core` import.
- `livos/packages/livinityd/source/modules/claude-runner/idle-reaper.test.ts` (NEW, 335 lines) — 12 vitest cases including Test 10 source-text grep guard against `@liv/core` and `agent-session` imports.
- `livos/packages/livinityd/source/modules/claude-runner/index.ts` (+12 lines) — Phase 165-01 barrel re-export of `IdleSessionReaper` + 4 types.
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` (+71 lines) — module-scope `reaperRegistry` Map, exported `createSessionActivityProvider()` factory, stamp-on-message hook, drop-on-close hook.
- `livos/packages/livinityd/source/index.ts` (+54 lines) — imports, `idleReaper?: IdleSessionReaper` field, non-fatal try/catch wire-up at boot site, paired `stop()` in shutdown cluster.

## Decisions Made

- **Interface boundary over reach-through:** The reaper does NOT cast `AgentSessionManager` into a structural type to read `.sessions` — that would couple us to a private field. Instead `ws-agent.ts` (the wrapper that already owns the connection lifecycle) maintains a parallel `reaperRegistry` Map. This keeps the reaper module 100% liv-core-free and makes the abort path testable without spinning up a real WebSocket.
- **Late-binding abort closure:** `ReaperEntry.abort = () => managerFor(sessionKey).cleanup(sessionKey)` resolves the manager AT ABORT TIME, not registration time. If a session switches between subsurface-scoped managers mid-flight (Phase 163-02 perSessionManagers cache), the abort still hits the correct manager.
- **Default 30 min + 5-min poll:** Chosen per CONTEXT.md decision row. Worst-case latency: a session crosses the threshold the moment after a tick → reap fires on the next tick (~5 min later), so total observed idle-to-abort is between 30 and 35 min. Acceptable per the threat-register row T-165-01-03 (the user-impact tradeoff is deliberate).
- **TDD commit folding:** Per Phase 164-02 precedent, Task 1's RED test commit was folded into the GREEN feat commit (single atomic "module + tests ship together") rather than two separate commits. Justification: the test file's Test 10 grep guard ONLY makes sense paired with a real source file to grep; a RED-only commit would have a logically incoherent test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 10 grep pattern was too aggressive**
- **Found during:** Task 1 GREEN gate (`npm run test:run -- modules/claude-runner/idle-reaper.test.ts`)
- **Issue:** Plan's literal regex `/agent-session/` matched the source file because the file's own COMMENTS legitimately reference `agent-session.ts` (the comments document the architectural contract). Initial test result: 11/12 PASS, Test 10 FAIL.
- **Fix:** Refined Test 10 to grep specifically for **import lines** rather than the bare string: `/from ['"][^'"]*agent-session[^'"]*['"]/` and `/import\s+[^'"]*['"][^'"]*agent-session/`. The architectural intent (no compile-time dependency on agent-session module) is now correctly enforced while preserving the in-source documentation that ties the reaper to the agent-session.ts SHA constraint.
- **Files modified:** `livos/packages/livinityd/source/modules/claude-runner/idle-reaper.test.ts`
- **Verification:** Re-run → 12/12 PASS.
- **Committed in:** `249b2840` (folded into Task 1 commit before push).

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug, test-design only)
**Impact on plan:** Test-design refinement only. Architectural contract is unchanged and now correctly enforced. No scope creep; no impact on the reaper module's runtime behaviour.

## Issues Encountered

- **`common.test.ts` "No test suite found" — pre-existing.** When `npm run test:run -- modules/server` is invoked, `source/modules/server/trpc/common.test.ts` fails with `Error: No test suite found in file`. The internal stdout shows `All common.test.ts tests passed (14/14)` — the file uses a script-style `console.log('PASS …')` pattern that vitest doesn't recognise as a test suite. Verified pre-existing on bare HEAD via `git stash + run`. **Out of scope** per scope-boundary rule (file untouched by this plan).
- **pre-existing typecheck errors in `skills/*.ts`, `source/modules/ai/routes.ts`, etc.** — unchanged before/after plan; not in any file this plan touched. Out of scope.

## User Setup Required

None — no external service configuration required. The reaper auto-arms on next `livinityd` restart with default 30-min threshold. To override post-deploy:

```bash
sudo redis-cli -a "$(grep REDIS_URL /opt/livos/.env | sed -E 's/.*:([^@]+)@.*/\1/' | sed 's/%21/!/g')" SET liv:config:idle_reap_min 15
sudo systemctl restart livos    # optional — reaper picks up new value at next tick (~5 min)
```

## Next Phase Readiness

- **Plan 165-02 (Settings UI)** can now expose `liv:config:idle_reap_min` as a number-input alongside `liv:config:autonomous_enabled`. Recommended placement: the same settings panel that hosts the autonomous-agents budget editor — both are admin-only operational knobs.
- **Plan 165-04 (Mini PC deploy + UAT)** must add a probe to the v34-VERIFICATION.md walk: after `bash /opt/livos/update.sh`, `journalctl -u livos | grep claude-runner/reaper` should show the boot log `[claude-runner/reaper] started — poll every 300s`. Optional Phase 165-04 fast probe: `redis-cli SET liv:config:idle_reap_min 1` + open a chat tab + wait 90 seconds without typing → next ws-agent log should show `[claude-runner/reaper] aborted idle session sessionKey=...`. (Reverting `idle_reap_min` to default 30 closes the probe.)
- **Boot ordering locked:** `scaffoldVault → smokeAuthCheck → AutonomousScheduler.start() → IdleSessionReaper.start() → drainInstallPendingRedisKeys`. Phase 165-02 should NOT insert anything between AutonomousScheduler and IdleSessionReaper — the contract is that both v34.x background subsystems arm before install-pending drain mutates Redis.
- **Sacred-SHA discipline maintained:** All 5 guarded files (sdk-agent-runner.ts `f3538e1d…`, agent-session.ts `7c690d59…`, luse-system-prompt.ts `2083f0a3…`, agent-prompt-builder.ts `dc1831f5…`, vault-scaffolder.ts `5ddfd065…`) byte-identical pre & post. Phase 164 autonomous-scheduler/*.ts UNCHANGED (no edits to scheduler.ts, budget-gate.ts, cli-trigger.ts, inbox-writer.ts, agent-definition-parser.ts).

## Self-Check: PASSED

- File `livos/packages/livinityd/source/modules/claude-runner/idle-reaper.ts` → FOUND
- File `livos/packages/livinityd/source/modules/claude-runner/idle-reaper.test.ts` → FOUND
- Commit `249b2840` → FOUND in `git log`
- Commit `1aef001c` → FOUND in `git log`
- All 5 sacred SHAs byte-identical → VERIFIED (`git ls-files -s` output matches pre-execution snapshot row-for-row)
- 12/12 vitest cases PASS in `idle-reaper.test.ts` → VERIFIED
- No `@liv/core` import in `idle-reaper.ts` → VERIFIED (grep exit 1)
- No `agent-session` module import in `idle-reaper.ts` → VERIFIED (Test 10 PASS)
- `git diff HEAD~2 HEAD -- liv/packages/core/src/agent-session.ts` = 0 lines → VERIFIED
- Phase 164 autonomous-scheduler/*.ts UNCHANGED → VERIFIED (`git diff --stat HEAD~2 HEAD -- livos/packages/livinityd/source/modules/autonomous-scheduler/` empty)
- `package.json` + `pnpm-lock.yaml` diffs empty → VERIFIED

---
*Phase: 165-cc-integration-polish*
*Completed: 2026-05-19*
