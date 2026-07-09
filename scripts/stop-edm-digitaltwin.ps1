$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $PSScriptRoot
$gatewayDir = Join-Path $root "gateway"

Write-Host "Stopping EDM Industrial Digital Twin services"

$targets = Get-CimInstance Win32_Process | Where-Object {
  ($_.CommandLine -like "*$gatewayDir*" -and $_.CommandLine -like "*server.js*") -or
  ($_.CommandLine -like "*$root*" -and $_.CommandLine -like "*vite*" -and $_.CommandLine -like "*5173*") -or
  ($_.CommandLine -like "*pnpm dev*" -and $_.CommandLine -like "*5173*")
}

if (-not $targets) {
  Write-Host "No managed Gateway/Dashboard processes found."
} else {
  foreach ($process in $targets) {
    Write-Host "Stopping PID $($process.ProcessId): $($process.CommandLine)"
    Stop-Process -Id $process.ProcessId -Force
  }
}

Write-Host "Gateway Stopped"
Write-Host "Dashboard Stopped"
Write-Host "Unity should be stopped from the Unity Editor Play button."
