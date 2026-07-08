# Holder-Process Survival Spike

This is throwaway research infrastructure. It answers one question empirically:
**does a detached Windows holder process survive the Electron main process being
killed or replaced during an update?** The result is recorded in
[`SPIKE-VERDICT.md`](./SPIKE-VERDICT.md), which Phases 4 and 6 read as a locked
architectural input.

`spike/` is excluded from the packaged app (`electron-builder.yml`'s
`"!spike/**/*"` rule) and its runtime outputs (`spike-log.jsonl`, `*.pid`
including `electron-main.pid`) are git-ignored. Nothing here ships.

## Prerequisites

- Windows 11 (or 10 21H2+), Node.js installed, this repo built (`npm install`
  already run in `desktop/`).
- Two extra terminal windows in addition to the one running `run-spike.ps1`:
  one for `npm start` (the app), one for `node spike/watcher.js` (the
  independent observer).
- Optional: a WSL2 distro, if you want a bonus confirmation run with a real
  `wsl.exe` placeholder instead of the pure-Windows one (not required for a
  decisive verdict — see Open Question 1 in `01-RESEARCH.md`).

## The two candidates under test

- **Candidate A** — `spike/holder-candidate-a.js`: spawns a placeholder
  (`node -e "setInterval(()=>{},1000)"`) with `detached: true, stdio: 'ignore',
  windowsHide: true` + `.unref()`. This script itself is invoked FROM the
  running Electron main process via Plan 03's dev-only `dev:spawnHolderA` IPC
  handler — so the detached child it spawns lands INSIDE Electron's Job
  Object tree. That is the exact condition under test. Running
  `holder-candidate-a.js` directly from a terminal instead would invalidate
  the test.
- **Candidate C** — `spike/holder-candidate-c-register.ps1`: registers a
  Windows Scheduled Task (`LivinitySpikeHolderC`, trigger `ONLOGON`) that owns
  an identical placeholder. Task-Scheduler-launched processes run under the
  Task Scheduler service's own process tree — structurally outside Electron's
  Job Object from the moment of creation.

## How the Electron main PID is obtained

Plan 03's `src/main/index.ts` writes `process.pid` to `spike/electron-main.pid`
on every dev launch (`app.ready`, gated `!app.isPackaged`) — this spike does
NOT create or edit that file or `index.ts`; it only reads
`spike/electron-main.pid` to know exactly which PID to `taskkill` in Test A.

## How to invoke Candidate A (`dev:spawnHolderA`)

With the app running in dev mode, open its devtools (View > Toggle Developer
Tools, or `Ctrl+Shift+I` on the debug window) and in the Console run:

```js
require('electron').ipcRenderer.invoke('dev:spawnHolderA')
```

This calls the raw IPC channel directly — `dev:spawnHolderA` is intentionally
NOT part of the typed `window.api` / `ShellApi` surface (it is dev-only surface
registered by Plan 03's `shell.ipc.ts`, gated `!app.isPackaged`). If
`require` is not reachable from the console context in your Electron/devtools
version, the equivalent is any snippet that calls
`ipcRenderer.invoke('dev:spawnHolderA')` from a context with `ipcRenderer`
available (e.g. a temporary button wired in the debug UI, or the Electron
DevTools "Console" context switched to the preload/main world). The handler
takes no payload and spawns `spike/holder-candidate-a.js` from the main
process — that is the exact condition under test (see above).

## Running the spike

Follow `run-spike.ps1` (it prints each step and pauses for you) or do it by
hand:

1. `npm run build`, then `npm start` in a separate terminal. Confirm
   `spike/electron-main.pid` exists; note the PID.
2. Invoke `dev:spawnHolderA` (see above) and run
   `spike/holder-candidate-c-register.ps1`. Confirm `candidate-a.pid` and
   `candidate-c.pid` both exist.
3. In a THIRD terminal (must not be a child of the app): `node spike/watcher.js`.
   Confirm baseline "ALIVE" lines for both candidates in `spike-log.jsonl`.
4. **Test A (crash sim):** `node spike/watcher.js --mark TEST_A`, then
   `taskkill /PID <electron-main-pid> /T /F` (the `/T` kills the whole tree —
   the harshest test). Watch `spike-log.jsonl` for 30s. Record alive/dead for
   each candidate at T+0/T+5/T+30.
5. Relaunch the app (`npm start` again). **Test B (update sim):**
   `node spike/watcher.js --mark TEST_B`, then trigger either:
   - the intended method: a dev-only code path setting
     `autoUpdater.updateConfigPath = spike/dev-app-update.yml` and calling
     `autoUpdater.quitAndInstall()`, or
   - the acceptable fallback: `app.relaunch(); app.exit(0);` — reproduces the
     same "main process dies and is replaced" condition Test B cares about.

   Watch `spike-log.jsonl` for 30s. Record alive/dead for each candidate.
6. Cleanup: run `spike/holder-candidate-c-unregister.ps1`, stop the watcher,
   kill any surviving placeholder `node` processes. Confirm
   `schtasks /Query /TN LivinitySpikeHolderC` reports the task does not exist.
7. Fill in `spike/SPIKE-VERDICT.md` from the observed `spike-log.jsonl`: the
   Results table, which Test-B method was used, the exact spawn code tested,
   and the explicit `## Recommendation` (Candidate A or Candidate C for
   Phases 4/6), plus the Phase 4 and Phase 6 implications.

## Reading `spike-log.jsonl`

Each line is `{ ts, candidate: 'a'|'c', pid, alive: <bool>, note }` (plus
`--mark` annotation lines with `note: "MARK:<label>"`). Filter/sort by `ts` to
reconstruct the T+0/T+5/T+30 alive/dead sequence around each `MARK` line.
