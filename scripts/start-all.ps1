$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$serverScript = Join-Path $root "scripts\start-forever-server.ps1"
$tunnelScript = Join-Path $root "scripts\start-public-tunnel.ps1"
$cloudflareScript = Join-Path $root "scripts\start-cloudflare-tunnel.ps1"
$logDir = Join-Path $root "work"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-ProcessCommand($needle) {
  $processes = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -like "*$needle*" }
  return [bool]$processes
}

if (-not (Test-ProcessCommand "start-forever-server.ps1")) {
  Start-Process -WindowStyle Hidden `
    -FilePath "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -ArgumentList "-ExecutionPolicy", "Bypass", "-File", $serverScript `
    -WorkingDirectory $root
  Write-Host "Started stable local server watchdog."
}
else {
  Write-Host "Stable local server watchdog already running."
}

if (-not (Test-ProcessCommand "start-public-tunnel.ps1")) {
  Start-Process -WindowStyle Hidden `
    -FilePath "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -ArgumentList "-ExecutionPolicy", "Bypass", "-File", $tunnelScript `
    -WorkingDirectory $root
  Write-Host "Started public tunnel watchdog."
}
else {
  Write-Host "Public tunnel watchdog already running."
}

if ((Test-Path -LiteralPath (Join-Path $root "work\bin\cloudflared.exe")) -and -not (Test-ProcessCommand "start-cloudflare-tunnel.ps1")) {
  Start-Process -WindowStyle Hidden `
    -FilePath "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -ArgumentList "-ExecutionPolicy", "Bypass", "-File", $cloudflareScript `
    -WorkingDirectory $root
  Write-Host "Started Cloudflare public tunnel watchdog."
}
elseif (Test-ProcessCommand "start-cloudflare-tunnel.ps1") {
  Write-Host "Cloudflare public tunnel watchdog already running."
}

Write-Host ""
Write-Host "Local URL:  http://127.0.0.1:5173/"
Write-Host "LAN URL:    http://192.168.1.2:5173/"
Write-Host "Public URLs will be written to:"
Write-Host (Join-Path $logDir "current-public-url.txt")
Write-Host (Join-Path $logDir "current-cloudflare-url.txt")
