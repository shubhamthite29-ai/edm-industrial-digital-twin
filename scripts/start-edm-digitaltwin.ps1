$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$workDir = Join-Path $root "work"
$gatewayDir = Join-Path $root "gateway"
$gatewayLog = Join-Path $workDir "gateway-v1.log"
$dashboardLog = Join-Path $workDir "dashboard-v1.log"

New-Item -ItemType Directory -Force -Path $workDir | Out-Null

function Test-Port($port) {
  try {
    $client = New-Object Net.Sockets.TcpClient
    $iar = $client.BeginConnect("127.0.0.1", $port, $null, $null)
    $connected = $iar.AsyncWaitHandle.WaitOne(500, $false)
    if ($connected) { $client.EndConnect($iar) }
    $client.Close()
    return $connected
  } catch {
    return $false
  }
}

function Wait-Port($name, $port, $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $port) {
      Write-Host "$name Running"
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  Write-Host "$name Not Ready"
  return $false
}

function Start-ManagedProcess($name, $command, $arguments, $directory, $logFile) {
  $existing = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$directory*" -and $_.CommandLine -like "*$command*" }
  if ($existing) {
    Write-Host "$name already running"
    return
  }

  Start-Process -WindowStyle Hidden `
    -FilePath $command `
    -ArgumentList "/c $arguments > `"$logFile`" 2>&1" `
    -WorkingDirectory $directory
  Write-Host "Starting $name"
}

Write-Host "EDM Industrial Digital Twin v1.0 startup"
Write-Host "Root: $root"

Start-ManagedProcess "Gateway" "cmd.exe" "npm start" $gatewayDir $gatewayLog
Start-ManagedProcess "Dashboard" "cmd.exe" "pnpm dev --host 0.0.0.0 --port 5173" $root $dashboardLog

$gatewayReady = Wait-Port "Gateway" 8080 20
$dashboardReady = Wait-Port "Dashboard" 5173 45

if ($dashboardReady) {
  Start-Process "http://127.0.0.1:5173/"
}

Write-Host ""
Write-Host "Gateway Running:   $gatewayReady"
Write-Host "Dashboard Running: $dashboardReady"
Write-Host "Waiting for Unity: open your Unity scene and press Play"
Write-Host "Unity Connected:   watch Settings > Developer Diagnostics"
Write-Host ""
Write-Host "Logs:"
Write-Host $gatewayLog
Write-Host $dashboardLog
Write-Host ""
Write-Host "Press any key to close this status window. Services keep running."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
