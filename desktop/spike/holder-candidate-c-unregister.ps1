<#
.SYNOPSIS
    spike/holder-candidate-c-unregister.ps1

    Cleanup companion to holder-candidate-c-register.ps1. The spike must never
    leave a stray ONLOGON Scheduled Task on the operator's real machine
    (T-01-15 in the plan's threat register).
#>

$ErrorActionPreference = 'Continue'

Write-Host "Deleting Scheduled Task 'LivinitySpikeHolderC' (if present)..."
schtasks.exe /Delete /TN "LivinitySpikeHolderC" /F

Write-Host "Verifying removal..."
schtasks.exe /Query /TN "LivinitySpikeHolderC" 2>&1 | Out-Host
Write-Host "(Expected: 'ERROR: The specified task name ... does not exist' — confirms cleanup succeeded.)"
