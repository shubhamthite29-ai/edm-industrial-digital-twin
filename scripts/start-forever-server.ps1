$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = "C:\Users\ShubhamShaurya\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$server = Join-Path $root "server\static-server.mjs"
$logDir = Join-Path $root "work"
$logFile = Join-Path $logDir "forever-server.log"
$errFile = Join-Path $logDir "forever-server.err.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-ServerLog($message) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logFile -Value "[$stamp] $message"
}

Write-ServerLog "Starting EDM Digital Twin watchdog on 0.0.0.0:5173"

while ($true) {
  try {
    Push-Location $root
    $env:HOST = "0.0.0.0"
    $env:PORT = "5173"
    Write-ServerLog "Launching Node static server"
    & $node $server >> $logFile 2>> $errFile
    $exitCode = $LASTEXITCODE
    Write-ServerLog "Node static server exited with code $exitCode; restarting in 2 seconds"
  }
  catch {
    Add-Content -LiteralPath $errFile -Value $_.Exception.ToString()
    Write-ServerLog "Watchdog caught exception; restarting in 2 seconds"
  }
  finally {
    Pop-Location
  }

  Start-Sleep -Seconds 2
}
