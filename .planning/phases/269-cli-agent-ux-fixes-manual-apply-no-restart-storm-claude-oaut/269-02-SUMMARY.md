---
phase: 269-cli-agent-ux-fixes-manual-apply-no-restart-storm-claude-oaut
plan: 02
subsystem: api
tags: [node-pty, tty, cli-installer, auth, paste-back, claude-code, livinityd, oauth]

# Dependency graph
requires:
  - phase: 268-interactive-cli-auth-paste-back-device-login-cli-uninstall
    provides: the 268-01 LiveAuth live-child registry + sendAuthInput stdin write-back + claude-code 'paste-back' branch + bare ['claude',[]] argv
  - phase: 267-cli-no-terminal-auth
    provides: the authCli spawn wrapper + parseDeviceCode/handleChunkForDeviceCode device-code stream + liv:cli:auth:<name> running|ok|failed contract
  - phase: 269-01
    provides: WS1 manual-apply (independent — this plan touches only auth.ts + index.ts authFn)
provides:
  - "claude-code login runs under node-pty (a REAL TTY) so the `Paste code here if prompted` prompt renders instead of dropping into `--print` mode"
  - "LiveAuth is a {kind:'child'}|{kind:'pty'} discriminated union; sendAuthInput writes `code + '\\r'` to a pty and `code + '\\n'` to a child"
  - "device URL/code parse off the merged pty onData via the SAME 267 parser; completion via pty onExit(exitCode)"
  - "device-poll CLIs (codex/github-copilot/kimi/kiro/…) STILL use child_process — only paste-back is pty'd"
  - "ANTHROPIC_API_KEY fallback path fully intact + documented as the guaranteed method (upstream #47994)"
affects: [269-03-auth-gated-list, 269-04-aionui-icons, cli-installer, claude-headless-login]

# Tech tracking
tech-stack:
  added: []   # node-pty ^1.0.0 was already a livinityd dep (used by pty-sessions/session.ts)
  patterns:
    - "Backing discriminated union: a single registry holds either a child_process or a node-pty, with per-kind teardown (SIGKILL vs pty.kill) + write (LF vs CR)"
    - "ptyFactory DI seam (default = real pty.spawn, mirrors session.ts DEFAULT_PTY_FACTORY) so the pty branch is unit-testable with a fake pty — NO real process spawns in tests"
    - "Branch the spawn backing on CLI_AUTH_METHODS[name].branch === 'paste-back' — pty only for paste-back; everything else stays on a clean pipe (P-5)"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/cli-installer/auth.ts
    - livos/packages/livinityd/source/modules/cli-installer/__tests__/auth.test.ts
    - livos/packages/livinityd/source/index.ts

key-decisions:
  - "Completion detected by pty onExit(exitCode===0 → ok) — NOT a 'Logged in' banner string-match (robust across claude versions — RESEARCH A6)"
  - "ptyFactory DI seam default IS real node-pty, so prod index.ts needs NO explicit thread — the default applies; the authFn site only documents it"
  - "Pre-existing claude-code authCli tests (Test 3/6/7/8/9/10 + the 268-01 live-child test) re-pointed to the pty path (or a device CLI) so claude-code never hits a real pty.spawn — the prior tests encoded the OLD child_process behavior this plan intentionally changes (R269-4)"
  - "sendAuthInput's 'no live login' guard widened to 'no registered backing'; the child !destroyed pre-guard stays child-only (a pty has no .stdin; its write no-ops on a dead pty)"

patterns-established:
  - "pty paste-back login: spawn via ptyFactory {name:'xterm-color',cols:120,rows:40,cwd:authHome,env:authEnv}; merged onData → 267 device-code parser; onExit → AuthResult; sendAuthInput writes code+'\\r' (TTY submits on CR — P-4)"
  - "shared makeTimeout(killFn)/resolveOnExit(exitCode,timeout) helpers serve both backings — the 300s SIGKILL timeout + single-in-flight + final Redis SET 'ok'|'failed' are kind-agnostic"

requirements-completed: [R269-4, R269-5, R269-6, R269-7]

# Metrics
duration: 11min
completed: 2026-06-14
---

# Phase 269 Plan 02: WS2 — claude login under node-pty (real TTY) Summary

**Ran the bare `claude` paste-back login under node-pty (a real TTY) instead of a child_process pipe — so claude renders the interactive `Paste code here if prompted` prompt instead of dropping into `--print` mode and erroring — by widening the 268-01 `LiveAuth` registry to a `child | pty` discriminated union, branching the `authCli` spawn on `CLI_AUTH_METHODS[name].branch === 'paste-back'` (claude-code ONLY), running `parseDeviceCode` on the merged pty `onData` stream, detecting completion via pty `onExit`, and writing the operator-pasted code to the pty with a CR; device-poll CLIs stay on child_process and the ANTHROPIC_API_KEY fallback is fully intact.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-06-14T07:15:05Z
- **Completed:** 2026-06-14T07:26:17Z
- **Tasks:** 3 (Tasks 1 & 2 were TDD: RED + GREEN each)
- **Files modified:** 3

## Accomplishments
- `LiveAuth` is now a discriminated union `{backing: {kind:'child';child} | {kind:'pty';pty:MinimalPty}, createdAt, timeout}`. `MinimalPty` is IMPORTED from `pty-sessions/session.js` (not redefined). A `killBacking()` helper SIGKILLs a child or `pty.kill()`s a pty; `registerLiveAuth(name, backing)` applies the single-in-flight kill, the 300s `.unref()` timeout, and natural-exit cleanup (`child.on('exit')` / `pty.onExit`) for BOTH kinds. `_resetLiveAuthsForTests` kills either.
- `sendAuthInput` keeps the D-239-07 whitelist guard as its FIRST statement (unchanged), widens the guard to "no registered backing → {ok:false}", and branches on `live.backing.kind`: pty → `pty.write(safe + '\r')` (CR — TTY line discipline submits on CR), child → `child.stdin.write(safe + '\n')` (unchanged). CR/LF-strip + 4096 cap + never-log-the-code contract all unchanged.
- `authCli` branches the spawn on `CLI_AUTH_METHODS[input.name].branch === 'paste-back'`: claude-code spawns via the injected `ptyFactory` (default = real `pty.spawn`) as a `{kind:'pty'}` backing — merged `onData` runs the SAME 267 `handleChunkForDeviceCode` parser (SETs `liv:cli:auth:url:claude-code`), completion via `onExit(exitCode)`, timeout kills via `pty.kill()`. Device-poll CLIs take the EXISTING `child_process` path unchanged.
- The ANTHROPIC_API_KEY fallback (writeApiKey / the dialog's "Use an API key instead") is untouched — documented in the paste-back branch + the index.ts authFn comment as the guaranteed path (upstream claude code-paste regression #47994).
- index.ts authFn documents the node-pty paste-back path (the default ptyFactory applies in prod — no explicit seam needed) and the wiring-summary boot log now mentions "claude paste-back via node-pty TTY".

## Task Commits

1. **Task 1 RED: LiveAuth child|pty union + CR/LF write tests** - `8c3fc74b` (test)
2. **Task 1 GREEN: discriminated-union registry + pty-aware sendAuthInput** - `6329db49` (feat)
3. **Task 2 RED: pty-backed authCli branch + device-poll-stays-child tests** - `7a28922e` (test)
4. **Task 2 GREEN: pty spawn branch (claude-code only) + onExit completion** - `f5c39b73` (feat)
5. **Task 3: document the prod node-pty wiring in index.ts authFn** - `23c20668` (feat)

**Plan metadata:** (this commit — docs)

_Tasks 1 & 2 followed TDD: RED → GREEN. No REFACTOR commits — both GREEN implementations were minimal and clean._

## Files Created/Modified
- `cli-installer/auth.ts` — `import pty from 'node-pty'` + `MinimalPty` type import; `LiveAuthBacking` union + `killBacking`; `registerLiveAuth(name, backing)` per-kind teardown; `_resetLiveAuthsForTests` kills either; `sendAuthInput` CR(pty)/LF(child) branch; `ptyFactory` DI seam + `DEFAULT_PTY_FACTORY`; `authCli` paste-back branch (pty) vs device-poll branch (child), shared `makeTimeout`/`resolveOnExit`.
- `cli-installer/__tests__/auth.test.ts` — `makeFakePty()` fake MinimalPty; all `registerLiveAuth` call sites → `{kind:'child', child}`; new union-registry + CR/LF + pty-spawn-branch + device-poll-stays-child tests; Test 3/6/7/8/9/10 + the 268-01 live-child test re-pointed so claude-code drives the pty (fake factory, no real spawn).
- `index.ts` — authFn comment documenting the 269-02 node-pty paste-back path + the ANTHROPIC_API_KEY guaranteed fallback; wiring-summary boot log extended.

## Decisions Made
- **Completion = pty `onExit(code===0)`, not a banner string-match** — robust across claude CLI versions (RESEARCH A6); the exact "Logged in" string is empirical and moves.
- **Prod ptyFactory default applies — no explicit index.ts thread** — auth.ts's `DEFAULT_PTY_FACTORY` is already real `pty.spawn` (mirroring session.ts), so the production authFn only needs a documenting comment; the seam exists purely for tests to inject a fake pty.
- **Re-point pre-existing claude-code authCli tests to the pty path** — Tests 3/6/7/8/9/10 and the 268-01 "registers the live child" test asserted the OLD child_process backing for claude-code, which R269-4 intentionally changes. Each was updated to drive a fake pty (or, for the 268-01 child-registration contract, a device CLI `codex`) so claude-code never reaches a real `pty.spawn` and no real process spawns in tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing claude-code authCli tests would spawn a REAL pty**
- **Found during:** Task 2 (pty spawn branch)
- **Issue:** Once claude-code routes to the pty path, the 268-01-era tests (Test 3/6/7/8/9/10 + the "registers the live child" test) that used `name: 'claude-code'` with a fake `spawnFn` + `child.emit('exit')` no longer drove the code under test — and, lacking an injected `ptyFactory`, would fall through to the real `pty.spawn('claude', …)`, attempting (or failing into) a real process spawn. This both broke the assertions and violated the plan's "No real process spawns in tests" constraint.
- **Fix:** Re-pointed each to inject a fake `ptyFactory` and drive `pty.emitExit/emitData` (for the claude-code-specific Redis/auditLog/spawn-failure assertions), and re-pointed the 268-01 child-registration contract test to a device-poll CLI (`codex`) which legitimately stays on child_process. Added `Test 6b` (device-poll ENOENT) so the child_process spawn-failure path keeps explicit coverage.
- **Files modified:** cli-installer/__tests__/auth.test.ts
- **Verification:** cli-installer suite 161/161; no real spawn (every claude-code authCli test injects a fake pty).
- **Committed in:** `f5c39b73` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug — test fixture correctness). **Impact on plan:** Necessary to keep the test suite deterministic and spawn-free under the new pty backing; no production-code scope creep — the source change is exactly the planned union + one spawn branch + one write line + the documenting wiring.

## Issues Encountered
None — the RED→GREEN cycle ran cleanly for both TDD tasks; the only friction (pre-existing claude-code tests spawning a real pty) is documented as the Rule-1 deviation above and resolved within the same task.

## Threat Surface
No new security-relevant surface beyond the plan's `<threat_model>`. The operator-pasted code is written to the pty as DATA via `pty.write` (never an argv/path/shell — T-269-05); the SUPPORTED_CLIS whitelist guard stays the FIRST statement in `sendAuthInput` (D-239-07); argv is name-derived from `CLI_AUTH_COMMANDS` only; the code is never logged (only its char length — T-269-06); the 300s `.unref()` timeout + single-in-flight kill + `onExit` cleanup reap a stranded pty login (T-269-07); only claude-code (paste-back) is pty'd so device-poll `parseDeviceCode` runs on a clean pipe (T-269-08); the pasted code is bounded ≤4096 + CR/LF-stripped (T-269-09).

## TDD Gate Compliance
Both TDD tasks satisfy the RED→GREEN gate sequence in git log:
- Task 1: `8c3fc74b` test( → `6329db49` feat(
- Task 2: `7a28922e` test( → `f5c39b73` feat(
RED was genuine (21 fail for Task 1, 6 fail for Task 2 before implementation). No unexpected GREEN in RED. REFACTOR omitted (GREEN minimal + clean).

## User Setup Required
None — no external service configuration required. (Deploy is release-based: cut a GitHub Release; `update.sh` rsyncs source — livinityd runs via tsx, so NO build for this code. After deploy, the bare `claude` login spawns under node-pty.)

## Next Phase Readiness
- WS2 (node-pty claude login) is complete and self-contained. WS3 (auth-gated agent list) and WS4 (AionUi icons) are independent plans, unblocked.
- **Operator UAT (Mini PC, post-Release) — A1/OQ1 resolution:** auth claude-code from the dialog → confirm the `Paste code here if prompted` prompt now appears (no `--print` / `no stdin data received in 3s` error), paste the OAuth code → login completes (`liv:cli:auth:claude-code = ok`) within the timeout. **If the upstream code-paste flow is still broken (#47994), the "Use an API key instead" → ANTHROPIC_API_KEY fallback is the guaranteed shipped path** — verify it lands the same `ready` state.

## Self-Check: PASSED

- SUMMARY on disk: `269-02-SUMMARY.md` FOUND.
- All 3 modified source files present on disk (`auth.ts`, `auth.test.ts`, `index.ts`).
- All 5 task commits present in git log (`8c3fc74b`, `6329db49`, `7a28922e`, `f5c39b73`, `23c20668`).
- cli-installer vitest 161/161 green (auth.test.ts 53/53); `npx tsc --noEmit` = 320 documented baseline (zero delta, no error references `cli-installer/auth.ts` or `source/index.ts`).
- Grep proof: `LiveAuthBacking` `kind:'pty'`/`kind:'child'` union; `MinimalPty` imported (0 redefinitions); `sendAuthInput` writes `safe + '\r'` (pty) + `safe + '\n'` (child); whitelist guard first; `import pty from 'node-pty'`; `ptyFactory` seam; `branch === 'paste-back'` branch; only the pty branch registers `{kind:'pty'}`; device-poll keeps `spawn(bin, args` + `{kind:'child'}`; index.ts authFn comment + wiring log mention "claude paste-back via node-pty TTY".

---
*Phase: 269-cli-agent-ux-fixes-manual-apply-no-restart-storm-claude-oaut*
*Completed: 2026-06-14*
