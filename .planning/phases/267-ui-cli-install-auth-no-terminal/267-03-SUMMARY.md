---
phase: 267-ui-cli-install-auth-no-terminal
plan: 03
subsystem: infra
tags: [trpc, cli-installer, liv-assistant, aionui, systemctl, debounce, redis, react, no-terminal, agent-refresh]

# Dependency graph
requires:
  - phase: 267-01
    provides: cliInstaller.auth (AuthResult.ok) + cliInstaller.setApiKey (WriteApiKeyResult.ok) tRPC procedures + the cli-installer router DI-seam factory + livRedis production wire
  - phase: 267-02
    provides: cli-auth-dialog.tsx (the no-terminal install+auth dialog) with its post-success 'success' phase + getDeviceCode/getAuthMethod polling pattern
provides:
  - agent-refresh.ts — scheduleAgentRefresh(): a module-level trailing-edge-debounced, best-effort `sudo -n systemctl restart liv-assistant` so AionUi re-PATH-scans and a freshly-authed CLI flips Failed→ready (no terminal); SETs liv:cli:agent-refresh restarting→done; polls :3020/api/agents for observability
  - cliInstaller.agentRefreshStatus tRPC query → {status:'restarting'|'done'|'idle'} (the UI's "Applying…" signal)
  - router wiring — auth/setApiKey fire the debounced refresh ONLY on ok:true, swallowing any scheduling error so the auth result is never invalidated
  - cli-auth-dialog 'ready' state — polls agentRefreshStatus, shows "Applying…" → "<name> ready — open Liv AI to use it" + an Open Liv AI button, with a 12s graceful timeout
affects: [liv-ai-agent-onboarding, no-terminal-auth, cli-installer-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level trailing-edge debounce so a burst of installs/auths coalesces into ONE side effect (one liv-assistant restart, not one-per-CLI); last-writer-wins on deps; timer.unref() so it never pins the event loop"
    - "Best-effort post-success side effect: the restart + Redis writes + /api/agents probe are each wrapped/logged/swallowed; scheduleAgentRefresh returns void synchronously so a failure can NEVER bubble back and invalidate the already-recorded auth/key-write"
    - "Router fires the side effect ONLY on result.ok (a failed/timed-out auth must not churn AionUi); a try/catch around the synchronous schedule call is defense-in-depth"
    - "UI graceful-degrade terminal state: poll a status query while ready && !applied, flip to applied on 'done' OR a hard timeout — never hard-block the user on a best-effort restart that may cold-boot slowly"

key-files:
  created:
    - livos/packages/livinityd/source/modules/cli-installer/agent-refresh.ts
    - livos/packages/livinityd/source/modules/cli-installer/__tests__/agent-refresh.test.ts
  modified:
    - livos/packages/livinityd/source/modules/cli-installer/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/cli-installer-router.ts
    - livos/packages/livinityd/source/modules/server/trpc/__tests__/cli-installer-router.test.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/livinityd/source/index.ts
    - livos/packages/ui/src/features/liv-ai/cli-auth-dialog.tsx

key-decisions:
  - "Debounce lives in agent-refresh.ts as MODULE-level state (one timer per livinityd process), NOT per-request — a burst of installs across separate tRPC calls must coalesce into one restart, which a per-call timer could never achieve."
  - "The refresh is wired at the ROUTER layer via a scheduleAgentRefreshFn DI seam (default no-op), keeping auth.ts/api-key-writer pure and test-isolated — same factory-DI pattern as authFn/writeApiKeyFn (267-01)."
  - "Restart fires ONLY on result.ok for both auth and setApiKey — a failed login or a failed key write must not restart AionUi (no churn, no DoS surface)."
  - "UI uses a 12s graceful timeout to flip 'Applying…' → ready even if agentRefreshStatus never reports 'done' (slow AionUi cold-boot / missing status key) — the auth already succeeded, so the user must always reach the usable 'Open Liv AI' state."
  - "Open Liv AI opens/focuses the existing LIVINITY_liv-assistant window (route /liv-assistant) via window-manager.openWindow (focuses if already open), falling back to a same-tab nav when no window manager is mounted (onboarding)."

patterns-established:
  - "Pattern: a best-effort, debounced infra side effect (systemctl restart) triggered by a tRPC success, fully decoupled from the success result via a non-throwing fire-and-forget schedule + a no-op DI default."
  - "Pattern: _resetAgentRefreshForTests() exported solely so suites can cancel a pending module-level debounce timer between tests (no leaked trailing restart)."

requirements-completed: [auto-appear-after-auth, live-agent-status, usable-immediately]

# Metrics
duration: 9 min
completed: 2026-06-14
---

# Phase 267 Plan 03: Auto-Appear-After-Auth (Debounced liv-assistant Refresh) Summary

**Closes the no-terminal loop: on a successful CLI auth/key-write the router fires a module-level trailing-edge-debounced, best-effort `sudo -n systemctl restart liv-assistant` (NOPASSWD-listed, argv-spawn, no shell) so AionUi re-PATH-scans and the freshly-authed agent flips Failed→ready — a burst of installs coalesces into ONE restart, a failed restart never invalidates the completed auth, and the dialog polls `cliInstaller.agentRefreshStatus` to show "Applying…" → "ready — open Liv AI to use it" with a 12s graceful timeout.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-14T00:52:57Z
- **Completed:** 2026-06-14T01:02:00Z
- **Tasks:** 4 (Tasks 1–3 code-complete; Task 4 is a LIVE-BOX checkpoint deferred to operator UAT)
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments
- **`agent-refresh.ts` (NEW)** — `scheduleAgentRefresh({logger, execFn?, debounceMs?, redis?, fetchFn?, sleepFn?})`: a process-wide trailing-edge debounce (default 4000ms). On the trailing edge it SETs `liv:cli:agent-refresh`='restarting' (EX 120), runs the restart (default: argv-array `sudo -n systemctl restart liv-assistant`, no shell, `-n` non-interactive), SETs 'done', then best-effort polls `http://127.0.0.1:3020/api/agents` (≤10s, 1s interval) and logs the agent count. **Coalescing:** repeated calls within `debounceMs` reset the single timer (one restart per burst). **Best-effort:** every step (restart + both Redis writes + the probe) is wrapped/logged/swallowed; `scheduleAgentRefresh` returns void synchronously, so a failure can never reach the caller. `timer.unref()` keeps it from pinning the event loop. `_resetAgentRefreshForTests()` exported for suite isolation.
- **Router wiring (`cli-installer-router.ts`)** — added `scheduleAgentRefreshFn` (default no-op) + `getAgentRefreshStatusFn` (default null) DI seams. `auth` calls `triggerAgentRefresh()` **only on `result.ok`**; `setApiKey` calls it **only on `result.ok`**. `triggerAgentRefresh` wraps the schedule call in try/catch (defense-in-depth — the result is already locked in). New `cliInstaller.agentRefreshStatus` query maps `liv:cli:agent-refresh` → `{status:'restarting'|'done'|'idle'}`.
- **`common.ts`** — `cliInstaller.agentRefreshStatus` added to `httpOnlyPaths` (HTTP not WS, same rationale as the rest of `cliInstaller.*`; a flaky WS after `systemctl restart livos` would stall the poll).
- **Production wire (`index.ts`)** — `scheduleAgentRefreshFn` → `scheduleAgentRefresh({logger, redis: livRedis})`; `getAgentRefreshStatusFn` → `livRedis.get(agentRefreshStatusKey)`. Uses the **already-provisioned** NOPASSWD `systemctl restart liv-assistant` — no new sudo grant.
- **`cli-auth-dialog.tsx`** — replaced the old auto-close `success` phase with a terminal `ready` state: after auth/setApiKey success the dialog polls `agentRefreshStatus` (1.2s, enabled only while `ready && !applied`) and shows "Applying… (a few seconds)". It flips to "✓ `<name>` is ready — open Liv AI to use it" + an enabled **Open Liv AI** button the moment status='done', **or** after a **12s graceful timeout** (never hard-blocks). Open Liv AI focuses/opens the `LIVINITY_liv-assistant` window (`/liv-assistant`).

## Task Commits

Each task was committed atomically:

1. **Task 1: agent-refresh.ts (debounce + best-effort restart + vitest)** — `87e69678` (feat)
2. **Task 2: fire refresh on auth/setApiKey success + agentRefreshStatus query** — `8f5863e9` (feat)
3. **Task 3: dialog 'ready — open Liv AI' state** — `e71b55dd` (feat)
4. **Task 4: LIVE-BOX UAT** — deferred to operator (see Operator UAT below). No commit.

**Plan metadata:** _(this SUMMARY + STATE/ROADMAP)_ — see final docs commit.

## Files Created/Modified
- `cli-installer/agent-refresh.ts` (NEW) — `scheduleAgentRefresh` debounced best-effort liv-assistant restart + status key + /api/agents probe.
- `cli-installer/__tests__/agent-refresh.test.ts` (NEW) — 6 cases (3-calls→1-exec coalescing; second burst → second restart; throwing execFn/redis swallowed; returns void; status SET restarting→done with EX).
- `cli-installer/index.ts` — barrel-export `scheduleAgentRefresh` / `agentRefreshStatusKey` / `DEFAULT_AGENT_REFRESH_DEBOUNCE_MS` / types.
- `server/trpc/cli-installer-router.ts` — `scheduleAgentRefreshFn` + `getAgentRefreshStatusFn` DI seams; `triggerAgentRefresh` (try/catch best-effort); refresh fired on auth/setApiKey `ok`; `agentRefreshStatus` query.
- `server/trpc/__tests__/cli-installer-router.test.ts` — T7/T14 drift-locks include `agentRefreshStatus`; +T31–T38 (fires on ok, NOT on fail, for both auth + setApiKey; throwing scheduler never invalidates auth; status mapping restarting/done/idle).
- `server/trpc/common.ts` — `cliInstaller.agentRefreshStatus` in `httpOnlyPaths`.
- `source/index.ts` — production wire of both new DI seams against `livRedis`.
- `ui/.../liv-ai/cli-auth-dialog.tsx` — `ready` phase + agentRefreshStatus poll + graceful timeout + Open Liv AI button.

## Decisions Made
See `key-decisions` frontmatter. Most load-bearing: (1) the debounce is process-level module state so cross-call bursts coalesce into one restart; (2) the refresh fires only on `result.ok` and is fully decoupled from the result via a non-throwing fire-and-forget schedule + a no-op DI default; (3) the UI 12s graceful timeout guarantees the user always reaches the usable "Open Liv AI" state even if the restart never confirms.

## Deviations from Plan

None — plan executed exactly as written.

(Two implementation choices are within the plan's latitude, not deviations: the plan said "optionally poll /api/agents" — implemented as a best-effort observability log; and the dialog's graceful-timeout value, 12s, is a UX detail the plan left to implementation. The plan's must-haves — debounced single restart, best-effort never-invalidates-auth, fired on both auth + setApiKey success, UI 'ready — open Liv AI' gated on agentRefreshStatus with graceful degrade — are all honored verbatim.)

## Issues Encountered
- **`common.test.ts` is a tsx self-runner, not a vitest suite.** Running it via `vitest run` reports "No test suite found" (expected — documented in 267-01's summary). Verified instead via `npx tsx …/common.test.ts` → 18/18 pass, confirming the new `httpOnlyPaths` entry is safe.
- **UI `tsc --noEmit` remains a known-broken baseline (not the deploy gate).** The deploy gate is `pnpm --filter ui build` (vite/esbuild), which exits 0 with my change. Per 267-02's documented systemic `trpcReact:never` condition, isolated UI tsc is not a meaningful signal; the new `agentRefreshStatus` route resolves correctly against the real production `AppRouter` types (which is why vite is clean).

## Threat Model Compliance (267-03)
- **Restart abuse / DoS:** the restart is debounced (one per burst) AND fires ONLY on a SUCCESSFUL whitelisted, admin-gated auth/key-write (T31–T34 assert no-fire on failure). No user-controlled restart frequency beyond the auth rate. ✓
- **Privilege:** uses the already-NOPASSWD `systemctl restart liv-assistant` (mirrors update.sh) via argv-array spawn (no shell, no interpolation) with `sudo -n` (non-interactive — a missing NOPASSWD fails fast + is swallowed, never hangs). No new sudo grant, no new privilege surface. ✓
- **No new network surface:** `agentRefreshStatus` is an additive admin-gated tRPC query on the existing `/trpc` path; the only outbound call is a localhost `127.0.0.1:3020/api/agents` observability probe. ✓

## User Setup Required
None — no external service configuration required. The NOPASSWD `systemctl restart liv-assistant` sudoers entry is already provisioned (no change). **CODE ONLY — NOT DEPLOYED.** Operator deploys via `bash /opt/livos/update.sh` (livinityd runs via tsx — no build; UI ships via `pnpm --filter ui build`). Hard-refresh / clear the service worker to pick up the new UI bundle (PWA SW cache pitfall).

## Operator UAT (Task 4 — deferred LIVE-BOX checkpoint, `autonomous:false`)

Task 4 is a `checkpoint:human` that REQUIRES a live Mini PC + a real AionUi restart to observe the Failed→ready flip — it cannot be performed from this CODE-ONLY run and was NOT fabricated. After the operator deploys (`bash /opt/livos/update.sh`) and hard-refreshes the UI:

1. **api-key CLI (gemini):** Liv AI → Local Agents → Install/Auth `gemini` → paste a key → Save. Expect the dialog to show "Applying… (a few seconds)" then "Gemini is ready — open Liv AI to use it" within ~10s, with NO terminal opened. Click **Open Liv AI** → the Liv AI window focuses.
2. **device CLI (kimi-cli):** same flow → device URL+code panel → finish browser sign-in → expect the same "Applying… → ready" transition with NO terminal touched.
3. **Confirm the agent actually flipped:** `curl -fsS http://127.0.0.1:3020/api/agents` on the box should show the authed agent as ready (not "Failed") within ~10s of the debounced restart.
4. **Confirm coalescing:** install/auth 2 CLIs back-to-back quickly → `journalctl -u liv-assistant` should show **ONE** restart for the burst, not one-per-CLI.
5. **Confirm best-effort:** if the restart hiccups, the dialog must still reach the "ready" state (12s graceful timeout) — the auth/key-write stays valid regardless.

## Next Phase Readiness
- The full no-terminal install → auth → live-agent loop is code-complete and build/test-green (backend 267-01 + UI 267-02 + this auto-refresh closer 267-03). Pending only the operator LIVE-BOX UAT above.
- **Threat surface:** no new network endpoint beyond the additive admin-gated `agentRefreshStatus` query; no new sudo grant. Covered by the threat_model.

## Self-Check: PASSED

- Both created files present on disk: `cli-installer/agent-refresh.ts` (FOUND), `cli-installer/__tests__/agent-refresh.test.ts` (FOUND).
- All 3 task commits present in git: `87e69678` (Task 1), `8f5863e9` (Task 2), `e71b55dd` (Task 3).
- Acceptance criteria — Task 1: `agent-refresh.ts` contains `systemctl`/`restart`/`liv-assistant` + a debounce timer (`setTimeout`/`clearTimeout`/`debounceMs`); vitest asserts 3 rapid calls → 1 execFn; throwing execFn/redis swallowed. Task 2: auth + setApiKey call `scheduleAgentRefresh` only on `ok` (T31–T34); `agentRefreshStatus` query exists (T36–T38); tsc 320 = documented baseline, ZERO net new referencing edited files. Task 3: dialog shows "ready — open Liv AI" gated on `agentRefreshStatus` (grep-confirmed); `pnpm --filter ui build` exit 0.
- Tests: agent-refresh 6/6 + cli-installer-router 36/36 = 42/42 green; common.test.ts 18/18 (tsx self-runner); onboarding cli-tools-step 9/9 (dialog contract unchanged).
- No accidental deletions across the 3 task commits.

---
*Phase: 267-ui-cli-install-auth-no-terminal*
*Completed: 2026-06-14*
