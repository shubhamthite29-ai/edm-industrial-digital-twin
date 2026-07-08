$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$taskName = "EDM Digital Twin Always On"
$batPath = Join-Path $root "scripts\start-all.bat"

$action = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 365) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Starts EDM Digital Twin local server and public tunnel at user login." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

Write-Host "Registered and started scheduled task: $taskName"
Write-Host "Current public URL file:"
Write-Host (Join-Path $root "work\current-public-url.txt")
