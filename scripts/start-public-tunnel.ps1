$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$pnpm = "C:\Users\ShubhamShaurya\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"
$nodeBin = "C:\Users\ShubhamShaurya\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$logDir = Join-Path $root "work"
$logFile = Join-Path $logDir "public-tunnel-watchdog.log"
$errFile = Join-Path $logDir "public-tunnel-watchdog.err.log"
$urlFile = Join-Path $logDir "current-public-url.txt"
$subdomain = "edm-digital-twin-shubham-5173"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-TunnelLog($message) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logFile -Value "[$stamp] $message"
}

$env:PATH = "$nodeBin;$env:PATH"
Write-TunnelLog "Starting public tunnel watchdog for https://$subdomain.loca.lt"

while ($true) {
  try {
    Push-Location $root
    Write-TunnelLog "Launching LocalTunnel"
    & $pnpm dlx localtunnel --port 5173 --local-host 127.0.0.1 --subdomain $subdomain 2>> $errFile | ForEach-Object {
      $line = [string]$_
      Add-Content -LiteralPath $logFile -Value $line
      $match = [regex]::Match($line, "https://[A-Za-z0-9-]+\.loca\.lt")
      if ($match.Success) {
        Set-Content -LiteralPath $urlFile -Value $match.Value
        Write-TunnelLog "Current public URL: $($match.Value)"
      }
    }
    $exitCode = $LASTEXITCODE
    Write-TunnelLog "LocalTunnel exited with code $exitCode; restarting in 3 seconds"
  }
  catch {
    Add-Content -LiteralPath $errFile -Value $_.Exception.ToString()
    Write-TunnelLog "Tunnel watchdog caught exception; restarting in 3 seconds"
  }
  finally {
    Pop-Location
  }

  Start-Sleep -Seconds 3
}
