<#
.SYNOPSIS
    spike/holder-candidate-c-register.ps1

    Candidate C: registers a Windows Scheduled Task that owns an identical
    placeholder long-running process, structurally OUTSIDE Electron's Job
    Object tree from the moment of creation.

.DESCRIPTION
    Per RESEARCH.md Assumption A1: Task-Scheduler-launched processes run under
    the Task Scheduler service's own process tree, not the calling process's
    Job Object (HIGH pre-spike confidence) -- but this MUST be OBSERVED via
    watcher.js, not assumed. This script only registers + immediately runs the
    task; the resulting process's survival is what the watcher proves.

    The task action is a self-PID-writing node wrapper FILE
    (holder-candidate-c-task.js) rather than an inline `node -e "..."`:
    schtasks /TR mangles nested quotes and caps the command at 261 chars, so
    the inline form fails to register. Node's 8.3 short path is used so the
    /TR value contains NO quotes at all (the spike path itself has no spaces).
#>

$ErrorActionPreference = 'Stop'

$spikeDir = $PSScriptRoot
$taskScript = Join-Path $spikeDir 'holder-candidate-c-task.js'

if (-not (Test-Path $taskScript)) {
    Write-Error "holder-candidate-c-task.js not found next to this script."
    exit 1
}

# 8.3 short path for node.exe -- avoids spaces ("C:\Program Files\...") so the
# /TR value needs no embedded quotes (schtasks mangles nested quotes).
$nodeFull = (Get-Command node).Source
$fso = New-Object -ComObject Scripting.FileSystemObject
$nodeShort = $fso.GetFile($nodeFull).ShortPath

$taskAction = "$nodeShort $taskScript"

Write-Host "Registering Scheduled Task 'LivinitySpikeHolderC'..."
Write-Host "Action: $taskAction"

# Primary path: schtasks CLI. EMPIRICAL FINDING (live spike run, 2026-07-08):
# `schtasks /Create /SC ONLOGON` FAILS with "Access is denied" from a
# NON-ELEVATED shell -- a schtasks.exe CLI limitation, NOT an OS one: the
# Task Scheduler COM API (Register-ScheduledTask below) registers the same
# logon-trigger task for the current user without elevation. Phase 4/6
# design input: the app can self-register a logon holder task without a UAC
# prompt, but must use the COM/PowerShell API, not schtasks.exe.
schtasks.exe /Create /TN "LivinitySpikeHolderC" /TR $taskAction /SC ONLOGON /RL LIMITED /F
if ($LASTEXITCODE -ne 0) {
    Write-Warning "schtasks /SC ONLOGON failed (expected when not elevated) -- falling back to Register-ScheduledTask (COM API, works non-elevated)."
    $action = New-ScheduledTaskAction -Execute $nodeShort -Argument $taskScript
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    Register-ScheduledTask -TaskName "LivinitySpikeHolderC" -Action $action -Trigger $trigger -RunLevel Limited -Force -ErrorAction Stop | Out-Null
    Write-Host "Registered via Register-ScheduledTask (AtLogOn trigger, current user)."
}

Write-Host "Running task immediately..."
schtasks.exe /Run /TN "LivinitySpikeHolderC"

Start-Sleep -Seconds 3

$pidFile = Join-Path $spikeDir 'candidate-c.pid'
if (Test-Path $pidFile) {
    $capturedPid = Get-Content $pidFile
    Write-Host "candidate-c holder PID: $capturedPid"
} else {
    Write-Warning "candidate-c.pid not yet written -- the task may still be starting. Check again in a moment."
}
