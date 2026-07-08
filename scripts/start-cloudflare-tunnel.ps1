$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cloudflared = Join-Path $root "work\bin\cloudflared.exe"
$logDir = Join-Path $root "work"
$logFile = Join-Path $logDir "cloudflare-tunnel.log"
$errFile = Join-Path $logDir "cloudflare-tunnel.err.log"
$urlFile = Join-Path $logDir "current-cloudflare-url.txt"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-TunnelLog($message) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logFile -Value "[$stamp] $message"
}

if (-not (Test-Path -LiteralPath $cloudflared)) {
  throw "cloudflared.exe not found at $cloudflared"
}

Write-TunnelLog "Starting Cloudflare Quick Tunnel watchdog"

while ($true) {
  try {
    Push-Location $root
    Write-TunnelLog "Launching cloudflared tunnel"
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $cloudflared tunnel --url http://127.0.0.1:5173 2>&1 | ForEach-Object {
      $line = [string]$_
      Add-Content -LiteralPath $logFile -Value $line
      $match = [regex]::Match($line, "https://[A-Za-z0-9-]+\.trycloudflare\.com")
      if ($match.Success) {
        Set-Content -LiteralPath $urlFile -Value $match.Value
        Write-TunnelLog "Current Cloudflare URL: $($match.Value)"
      }
    }
    $ErrorActionPreference = $previousErrorActionPreference
    $exitCode = $LASTEXITCODE
    Write-TunnelLog "cloudflared exited with code $exitCode; restarting in 3 seconds"
  }
  catch {
    Add-Content -LiteralPath $errFile -Value $_.Exception.ToString()
    Write-TunnelLog "Cloudflare watchdog caught exception; restarting in 3 seconds"
  }
  finally {
    Pop-Location
  }

  Start-Sleep -Seconds 3
}
