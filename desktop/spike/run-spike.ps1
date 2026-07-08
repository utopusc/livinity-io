<#
.SYNOPSIS
    spike/run-spike.ps1 -- operator-runnable orchestration script for the
    holder-process survival spike (Phase 1 Plan 04).

.DESCRIPTION
    This script is documentation-grade hand-holding, not full automation --
    invoking Plan 03's dev-only `dev:spawnHolderA` IPC channel and observing
    the destructive-test results both require interacting with the running
    Electron app's renderer/devtools console, which this script cannot do on
    its own. Each step below prints exactly what to do and pauses for you to
    confirm before continuing (Read-Host). Run this from
    C:\Users\hello\Desktop\Projects\contabo\livinity-io\desktop in a
    PowerShell terminal DEDICATED to orchestration -- you will need at least
    one MORE separate terminal for `node spike/watcher.js` (it must not be a
    child of the Electron app -- see watcher.js's own file-top comment).

    See spike/README.md for the full narrative version of these steps.
#>

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Pause-ForOperator($message) {
    Write-Host ""
    Write-Host "----------------------------------------------------------------------"
    Write-Host $message -ForegroundColor Cyan
    Write-Host "----------------------------------------------------------------------"
    Read-Host "Press Enter once done"
}

Write-Host "=== Livinity Desktop -- Holder-Process Survival Spike ===" -ForegroundColor Yellow

# --- S1: build + start the app; read the Electron main PID ---
Write-Host "`n[S1] Building app..."
npm run build

Pause-ForOperator @"
Start the app now in ANOTHER terminal:  npm start
Wait for the tray icon / debug window to appear, then come back here.
"@

$pidFile = Join-Path $PSScriptRoot 'electron-main.pid'
if (-not (Test-Path $pidFile)) {
    Write-Warning "spike/electron-main.pid not found. This file is written by Plan 03's index.ts on app.ready (dev-only, gated !app.isPackaged)."
    Write-Warning "If it is absent, the app was launched in packaged mode or Plan 03's hook did not fire -- STOP and report this rather than guessing a PID."
    exit 1
}
$electronMainPid = (Get-Content $pidFile).Trim()
Write-Host "Electron main PID (from spike/electron-main.pid): $electronMainPid" -ForegroundColor Green

# --- S2: trigger Candidate A (dev:spawnHolderA) + register Candidate C ---
Pause-ForOperator @"
Trigger Candidate A via the dev-only spike surface. Any ONE of:

  (a) Click the 'Spawn holder A' button in the app's 'Spike (dev)' card, or
  (b) In the app's DevTools console (Ctrl+Shift+I), run:
          window.api.devSpawnHolderA()
      (NOTE: 'require' does NOT exist in this console -- the window runs
      sandbox:true + contextIsolation; window.api is the only bridge.), or
  (c) If the app was launched with --remote-debugging-port=9222:
          node spike/cdp-eval.js "window.api.devSpawnHolderA()"

All three call the same dev-only 'dev:spawnHolderA' handler in main (gated
!app.isPackaged) so the holder lands inside Electron's Job Object tree.
Confirm spike/candidate-a.pid now exists.
"@

Write-Host "`n[S2] Registering Candidate C (Scheduled Task)..."
& (Join-Path $PSScriptRoot 'holder-candidate-c-register.ps1')

$candAPid = Join-Path $PSScriptRoot 'candidate-a.pid'
$candCPid = Join-Path $PSScriptRoot 'candidate-c.pid'
if (-not (Test-Path $candAPid)) { Write-Warning "candidate-a.pid still missing -- confirm the dev:spawnHolderA invoke succeeded before continuing." }
if (-not (Test-Path $candCPid)) { Write-Warning "candidate-c.pid still missing -- check holder-candidate-c-register.ps1 output above." }

# --- S3: start the watcher (separate terminal) ---
Pause-ForOperator @"
In a SEPARATE terminal (NOT this one, and NOT spawned by the app), run:

    node spike/watcher.js

Confirm you see 'ALIVE' lines for both candidate-a and candidate-c in its
output / in spike/spike-log.jsonl before continuing.
"@

# --- S4: TEST A -- simulated crash ---
Write-Host "`n[S4] TEST A -- simulated crash (taskkill /T /F on Electron main PID $electronMainPid)" -ForegroundColor Yellow
Pause-ForOperator "In the watcher terminal (or a third terminal), run:  node spike/watcher.js --mark TEST_A`nThen come back here and press Enter to fire the taskkill."

taskkill /PID $electronMainPid /T /F
Write-Host "taskkill fired at $(Get-Date -Format o). Watch spike-log.jsonl for the next 30 seconds." -ForegroundColor Green
Start-Sleep -Seconds 30
Write-Host "30s elapsed. Record T+0/T+5/T+30 alive/dead for each candidate from spike-log.jsonl into SPIKE-VERDICT.md."

# --- S5: TEST B -- update-cycle simulation ---
Pause-ForOperator @"
Relaunch the app now (npm start in the app terminal -- or with
--remote-debugging-port=9222 for the CDP path). If Candidate A died in
Test A, respawn it first (S2's trigger options) so Test B measures the
update event itself. Then:
  1. In the watcher terminal run:  node spike/watcher.js --mark TEST_B
  2. Trigger the update sim via ONE of:
       - the 'Update-sim (relaunch)' button in the app's 'Spike (dev)' card
       - DevTools console:  window.api.devUpdateSim()
       - CDP:  node spike/cdp-eval.js "window.api.devUpdateSim()"
     The main-side dev:updateSim handler runs app.relaunch(); app.exit(0) --
     the documented quitAndInstall() fallback (same process-death-and-replace
     semantics; record this as the Test-B method in SPIKE-VERDICT.md).
     A NEW Electron main PID appearing afterwards is EXPECTED.
Then press Enter here.
"@

Write-Host "[S5] Watch spike-log.jsonl for 30 seconds after triggering Test B." -ForegroundColor Yellow
Start-Sleep -Seconds 30
Write-Host "30s elapsed. Record T+0/T+5/T+30 alive/dead for each candidate from spike-log.jsonl into SPIKE-VERDICT.md."

# --- S6: cleanup ---
Write-Host "`n[S6] Cleanup..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot 'holder-candidate-c-unregister.ps1')

Pause-ForOperator @"
Stop the watcher.js terminal (Ctrl+C).
Kill any surviving placeholder holders, e.g.:
    Get-Process node | Where-Object { $_.Id -eq <candidate-a-pid> -or $_.Id -eq <candidate-c-pid> } | Stop-Process -Force
Confirm 'schtasks /Query /TN LivinitySpikeHolderC' reports the task does not exist
(already checked above by holder-candidate-c-unregister.ps1).
Finally, fill in spike/SPIKE-VERDICT.md from spike-log.jsonl.
"@

Write-Host "`n=== Spike orchestration complete. Fill in spike/SPIKE-VERDICT.md now. ===" -ForegroundColor Yellow
