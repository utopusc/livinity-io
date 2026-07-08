# Spike Verdict: Holder-Process Survival on Windows

> **STATUS: TEMPLATE — NOT YET FILLED.** This document must be completed from
> ACTUAL observed `spike-log.jsonl` data produced by running `run-spike.ps1`
> (or its manual equivalent, see `README.md`) on the real Windows 11 target.
> No conclusion here is valid until backed by real timestamps/PIDs/log lines —
> per RESEARCH.md Pitfall 1 and this plan's threat T-01-18, this verdict must
> never assert survival that was not actually observed by `watcher.js`.

## Test Environment

- Electron version: _TODO — fill from `package.json` (`^43.1.0` pinned; record exact resolved version from `npm ls electron`)_
- Windows build: _TODO — fill from `winver` / `[Environment]::OSVersion`_
- Method used for Test B: _TODO — `autoUpdater.quitAndInstall()` via `dev-app-update.yml` OR the `app.relaunch(); app.exit(0);` fallback_
- Date/operator: _TODO_

## Results

| Candidate | Test | Alive at T+0s | Alive at T+5s | Alive at T+30s | Survived? |
|-----------|------|---------------|----------------|-----------------|-----------|
| A (detached+unref) | Test A (taskkill /T /F) | _TODO_ | _TODO_ | _TODO_ | _TODO_ |
| A (detached+unref) | Test B (update sim) | _TODO_ | _TODO_ | _TODO_ | _TODO_ |
| C (schtasks ONLOGON) | Test A (taskkill /T /F) | _TODO_ | _TODO_ | _TODO_ | _TODO_ |
| C (schtasks ONLOGON) | Test B (update sim) | _TODO_ | _TODO_ | _TODO_ | _TODO_ |

Sourced from `spike/spike-log.jsonl` — cite the exact log lines/timestamps
supporting each cell when filling this in.

## The Exact Spawn Code Tested

```js
// spike/holder-candidate-a.js — Candidate A, verbatim
const child = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();
```

Invoked via Plan 03's dev-only `dev:spawnHolderA` IPC handler (spawns this
script from inside Electron's Job Object tree — the exact condition under
test).

```powershell
# spike/holder-candidate-c-register.ps1 — Candidate C, schtasks registration shape
schtasks.exe /Create /TN "LivinitySpikeHolderC" /TR "<node wrapper>" /SC ONLOGON /RL LIMITED /F
schtasks.exe /Run /TN "LivinitySpikeHolderC"
```

## Recommendation

_TODO — fill with the EXPLICIT, unambiguous statement, one of:_
- _"Phase 4/6 should use Candidate A" (only if A survived BOTH Test A and Test B)_
- _"Phase 4/6 MUST use Candidate C — the Scheduled-Task architecture — because Candidate A did not survive Test {A|B}"_

One-sentence reason: _TODO_

## Implications for Phase 4

_TODO — what the install-orchestration phase must build differently depending
on the recommendation above (e.g., a holder that self-registers as a
Scheduled Task vs. a simple `execa` detached child)._

## Implications for Phase 6

_TODO — what the tray-supervision phase must poll/manage differently
depending on the recommendation above (e.g., polling a Scheduled-Task-owned
process's liveness vs. watching a handle Electron already owns)._
