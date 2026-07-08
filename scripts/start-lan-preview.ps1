$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = "C:\Users\ShubhamShaurya\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$vite = Join-Path $root "node_modules\vite\bin\vite.js"
$logDir = Join-Path $root "work"
$logFile = Join-Path $logDir "lan-preview.log"
$errFile = Join-Path $logDir "lan-preview.err.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-ServerLog($message) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logFile -Value "[$stamp] $message"
}

Write-ServerLog "Starting LAN preview watchdog on 0.0.0.0:5173"

while ($true) {
  try {
    Push-Location $root
    Write-ServerLog "Launching Vite preview"
    & $node $vite preview --host 0.0.0.0 --port 5173 --strictPort *>> $logFile 2>> $errFile
    $exitCode = $LASTEXITCODE
    Write-ServerLog "Vite preview exited with code $exitCode; restarting in 2 seconds"
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
