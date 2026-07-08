# Spike Verdict: Holder-Process Survival on Windows

> **STATUS: FILLED FROM OBSERVED DATA — 2026-07-08.** Every claim below is
> sourced from the independent watcher's `spike-log.jsonl` (raw excerpts
> included) plus `Get-CimInstance Win32_Process` creation-date checks used to
> rule out PID reuse. Nothing here is asserted from spawn code alone
> (RESEARCH.md Pitfall 1 / threat T-01-18).

## Test Environment

- Electron version: **43.1.0** (exact, from `npm ls electron`)
- Windows build: **Microsoft Windows 11 Home 10.0.26200**
- Node (watcher runtime + Candidate C binary): **v24.11.1** (`C:\Program Files\nodejs\node.exe`)
- Method used for Test B: **`app.relaunch(); app.exit(0)` via the dev-only `dev:updateSim` IPC handler** — the plan's documented fallback (RESEARCH.md Open Question 2). No real GitHub Release exists yet, so a faithful `autoUpdater.quitAndInstall()` (which additionally runs an installer binary) could not be exercised; the process-death-and-replacement semantics — the thing under test — are identical. Re-verify with a real release when Phase 8 publishes one.
- Candidate A placeholder runtime: `electron.exe -e "setInterval(()=>{}, 1000)"` running under **ELECTRON_RUN_AS_NODE=1** (pure Node runtime, no Chromium — see Finding 1 below for why this flag is load-bearing).
- Trigger path: CDP `Runtime.evaluate` against the app launched with `--remote-debugging-port=9222` (`spike/cdp-eval.js`) — process ancestry identical to a UI-button/devtools-console trigger.
- Watcher: `spike/watcher.js` polling `tasklist /FI "PID eq <pid>" /NH` every 2s, launched via `Start-Process` from an operator-side PowerShell — never a child of the Electron app. Poll granularity means "T+0" is really T+≤2s.
- Date/operator: 2026-07-08, executed end-to-end by the plan-04 executor agent on the real target machine (per orchestrator instruction); results below are the raw observations.

## Results

| Candidate | Test | Alive at T+0s | Alive at T+5s | Alive at T+30s | Survived? |
|-----------|------|---------------|----------------|-----------------|-----------|
| A (detached+unref) | Test A (taskkill /T /F) | YES | YES | YES | **YES** |
| A (detached+unref) | Test B (update sim) | YES | YES | YES | **YES** |
| C (schtasks/Task Scheduler) | Test A (taskkill /T /F) | YES | YES | YES | **YES** |
| C (schtasks/Task Scheduler) | Test B (update sim) | YES | YES | YES | **YES** |

### Test A — crash sim (`taskkill /PID 69656 /T /F` on the Electron main PID from `spike/electron-main.pid`)

Kill fired at **10:30:01.29Z** (mark line 10:30:01.101Z). All four of the app's
processes (main 69656 + gpu/network/renderer children) confirmed terminated.
Raw `spike-log.jsonl` excerpts:

```
{"ts":"2026-07-08T10:30:01.101Z","candidate":null,"pid":null,"alive":null,"note":"MARK:TEST_A"}
{"ts":"2026-07-08T10:30:02.920Z","candidate":"a","pid":13424,"alive":true,"note":""}   <- T+1.6s
{"ts":"2026-07-08T10:30:03.057Z","candidate":"c","pid":39484,"alive":true,"note":""}
{"ts":"2026-07-08T10:30:06.930Z","candidate":"a","pid":13424,"alive":true,"note":""}   <- T+5.6s
{"ts":"2026-07-08T10:30:07.048Z","candidate":"c","pid":39484,"alive":true,"note":""}
{"ts":"2026-07-08T10:30:33.025Z","candidate":"a","pid":13424,"alive":true,"note":""}   <- T+31.7s
{"ts":"2026-07-08T10:30:33.162Z","candidate":"c","pid":39484,"alive":true,"note":""}
```

PID-reuse guard: post-test `Get-CimInstance` showed PID 13424 with CreationDate
**3:25:14 AM** (spawned BEFORE the 3:30:01 kill) and the exact placeholder
command line — same process, not a reused PID. The ONLY electron.exe left on
the machine after Test A was the placeholder itself; the app tree was gone.

### Test B — update sim (`dev:updateSim` → `app.relaunch(); app.exit(0)` on main PID 44516)

A fresh Candidate A (PID 13780, CreationDate 3:31:24 AM) was spawned **by the
app instance that then performed the update-exit** (main 44516) — the exact
real-update condition. Fired at **10:31:38.28Z** (mark line 10:31:38.085Z).
Raw excerpts:

```
{"ts":"2026-07-08T10:31:38.085Z","candidate":null,"pid":null,"alive":null,"note":"MARK:TEST_B"}
{"ts":"2026-07-08T10:31:39.074Z","candidate":"a","pid":13780,"alive":true,"note":""}   <- T+1.0s
{"ts":"2026-07-08T10:31:39.211Z","candidate":"c","pid":39484,"alive":true,"note":""}
{"ts":"2026-07-08T10:31:43.062Z","candidate":"a","pid":13780,"alive":true,"note":""}   <- T+5.0s
{"ts":"2026-07-08T10:31:43.197Z","candidate":"c","pid":39484,"alive":true,"note":""}
{"ts":"2026-07-08T10:32:09.097Z","candidate":"a","pid":13780,"alive":true,"note":""}   <- T+31.0s
{"ts":"2026-07-08T10:32:09.241Z","candidate":"c","pid":39484,"alive":true,"note":""}
```

Replacement confirmed: old main 44516 dead; NEW main 70988 created at
3:31:38 AM (the exact devUpdateSim moment); `spike/electron-main.pid`
rewritten to 70988 by the relaunched instance. Candidate A (13780) verified
post-test as the same process (CreationDate 3:31:24 AM, same command line).

Full raw log preserved at `spike/spike-log.jsonl` (git-ignored runtime
artifact, left on disk as evidence).

## The Exact Spawn Code Tested

Main process (shell.ipc.ts, dev-only `dev:spawnHolderA` handler) spawning the
holder script — **`ELECTRON_RUN_AS_NODE: '1'` is load-bearing** (Finding 1):

```ts
spawn(process.execPath, [holder], {
  stdio: 'ignore',
  windowsHide: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
```

Holder script (spike/holder-candidate-a.js) spawning the detached placeholder
— Candidate A verbatim:

```js
const child = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();
```

Candidate C registration shape (holder-candidate-c-register.ps1) — see
Finding 2 for the elevation caveat:

```powershell
schtasks.exe /Create /TN "LivinitySpikeHolderC" /TR "<node> <task.js>" /SC ONLOGON /RL LIMITED /F
# non-elevated fallback (works — COM API):
Register-ScheduledTask -TaskName "LivinitySpikeHolderC" -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -RunLevel Limited
schtasks.exe /Run /TN "LivinitySpikeHolderC"
```

## Recommendation

**Phase 4/6 should use Candidate A** — the detached+unref child spawned from
the Electron main process survived BOTH the `taskkill /T /F` crash simulation
AND the update-cycle replacement, observed independently at T+0/T+5/T+30 in
all four cells.

One-sentence reason: on the real target (Electron 43.1.0 / Windows 11
10.0.26200), Electron's Job Object does NOT kill a `detached:true` +
`stdio:'ignore'` + `unref()` non-Chromium child when the main process dies or
is replaced, so the simplest architecture (no Scheduled Task
registration/permissions surface) is empirically safe.

Caveats bounding this verdict (honest scope):
- Observed on ONE machine/Electron version. Electron's internal Job Object
  configuration is not contractual — re-run this spike (it is cheap and now
  fully scripted) if Electron is ever major-bumped, and re-verify Test B with
  a REAL `quitAndInstall()` once Phase 8 publishes a release.
- The placeholder ran as a pure-Node process. **Finding 1:** spawning via
  `process.execPath` WITHOUT `ELECTRON_RUN_AS_NODE=1` boots the child as a
  full Electron/Chromium app (observed live: the intermediate never exited and
  owned 3 Chromium children) — the real Phase 4 holder must be a plain binary
  (wsl.exe directly, or node/electron with `ELECTRON_RUN_AS_NODE=1`), never a
  bare `process.execPath` respawn.
- Candidate C ALSO survived both tests, confirming RESEARCH.md Assumption A1
  empirically — it remains a proven fallback if Candidate A ever regresses.

## Implications for Phase 4

- The WSL keep-alive holder can be a simple detached+unref child spawned by
  the app (the exact tested shape above) — no Scheduled-Task self-registration
  step, no extra OS-permissions surface in the install wizard.
- The holder MUST be spawned as a non-Chromium process: `wsl.exe` directly, or
  a node script via `ELECTRON_RUN_AS_NODE=1` (Finding 1). A bare
  `spawn(process.execPath, [script])` without the flag creates a hidden
  full Electron app.
- Record the holder's PID to a file at spawn time (the tested pattern): the
  spawning app instance will NOT be the same process that later supervises it.

## Implications for Phase 6

- Supervision must reattach by PID file + liveness poll (`tasklist`-style or
  `process.kill(pid, 0)`), NOT by holding a ChildProcess handle — the holder
  outlives the app instance that spawned it across BOTH crash and update
  boundaries (observed), so after every app start the tray must adopt an
  already-running holder rather than blindly spawning a second one.
- No Scheduled-Task liveness machinery is needed for the keep-alive itself.
- **Finding 2 (separate concern — auto-start at login):** `schtasks.exe
  /Create /SC ONLOGON` FAILED with access-denied from a non-elevated shell,
  while the Task Scheduler COM API (`Register-ScheduledTask -AtLogOn`)
  registered the same current-user logon task WITHOUT elevation (both
  observed live). If Phase 6 ever chooses a task-based autostart instead of
  `app.setLoginItemSettings`, it must use the COM API path, not schtasks.exe,
  or it will hit a UAC wall.
