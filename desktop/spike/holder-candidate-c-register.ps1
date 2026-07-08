<#
.SYNOPSIS
    spike/holder-candidate-c-register.ps1

    Candidate C: registers a Windows Scheduled Task that owns an identical
    placeholder long-running process, structurally OUTSIDE Electron's Job
    Object tree from the moment of creation.

.DESCRIPTION
    Per RESEARCH.md Assumption A1: Task-Scheduler-launched processes run under
    the Task Scheduler service's own process tree, not the calling process's
    Job Object (HIGH pre-spike confidence) — but this MUST be OBSERVED via
    watcher.js, not assumed. This script only registers + immediately runs the
    task; the resulting process's survival is what the watcher proves.

    The task action is a self-PID-writing node wrapper (reliable PID capture,
    since schtasks itself does not return the launched process's PID).
#>

$ErrorActionPreference = 'Stop'

$spikeDir = $PSScriptRoot
$pidFile = Join-Path $spikeDir 'candidate-c.pid'
# Escape backslashes for embedding inside the double-quoted node -e string.
$pidFileEscaped = $pidFile -replace '\\', '\\\\'

$nodeCommand = "require('fs').writeFileSync('$pidFileEscaped', String(process.pid)); setInterval(()=>{},1000)"
$taskAction = "`"$($(Get-Command node).Source)`" -e `"$nodeCommand`""

Write-Host "Registering Scheduled Task 'LivinitySpikeHolderC'..."
Write-Host "Action: $taskAction"

schtasks.exe /Create /TN "LivinitySpikeHolderC" /TR $taskAction /SC ONLOGON /RL LIMITED /F

Write-Host "Running task immediately..."
schtasks.exe /Run /TN "LivinitySpikeHolderC"

Start-Sleep -Seconds 2

if (Test-Path $pidFile) {
    $capturedPid = Get-Content $pidFile
    Write-Host "candidate-c holder PID: $capturedPid"
} else {
    Write-Warning "candidate-c.pid not yet written — the task may still be starting. Check again in a moment."
}
