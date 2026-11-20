[CmdletBinding()]
param(
  [string]$SerialPort = $(if ($env:TOOLHEAD_SERIAL_PORT) { $env:TOOLHEAD_SERIAL_PORT } else { "COM6" }),
  [int]$BaudRate = $(if ($env:TOOLHEAD_SERIAL_BAUD) { [int]$env:TOOLHEAD_SERIAL_BAUD } else { 115200 })
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$gatewayRoot = Join-Path $projectRoot "gateway"

function Test-GatewayReachable {
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $client.Connect("127.0.0.1", 8080)
    $client.Dispose()
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-GatewayReachable)) {
  Write-Host "Starting the existing WebSocket gateway on ws://127.0.0.1:8080..."
  Start-Process -FilePath "node.exe" -ArgumentList "server.js" -WorkingDirectory $gatewayRoot -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds(5)
  while ((Get-Date) -lt $deadline -and -not (Test-GatewayReachable)) {
    Start-Sleep -Milliseconds 200
  }

  if (-not (Test-GatewayReachable)) {
    throw "The WebSocket gateway did not become reachable on port 8080."
  }
}

$env:TOOLHEAD_SERIAL_PORT = $SerialPort
$env:TOOLHEAD_SERIAL_BAUD = "$BaudRate"
$env:GATEWAY_WS_URL = "ws://127.0.0.1:8080"

Write-Host "Opening the single Toolhead serial bridge on $SerialPort at $BaudRate baud."
Push-Location $gatewayRoot
try {
  & node toolhead-serial-bridge.js
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
