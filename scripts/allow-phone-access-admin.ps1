$ErrorActionPreference = "Stop"

$ruleName = "EDM Digital Twin LAN 5173"
$activeProfiles = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne "Disconnected" -or $_.NetworkCategory -eq "Public" }

foreach ($profile in $activeProfiles) {
  if ($profile.NetworkCategory -eq "Public") {
    Set-NetConnectionProfile -InterfaceIndex $profile.InterfaceIndex -NetworkCategory Private
    Write-Host "Changed network '$($profile.Name)' on '$($profile.InterfaceAlias)' from Public to Private."
  }
}

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existing) {
  Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Direction Inbound -Action Allow -Profile Private,Domain
  Write-Host "Firewall rule already exists and is enabled: $ruleName"
}
else {
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 5173 `
    -Profile Private,Domain | Out-Null
  Write-Host "Created firewall rule: $ruleName"
}

Write-Host ""
Write-Host "Phone/LAN URL:"
$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -First 1 -ExpandProperty IPAddress
Write-Host "http://$ip`:5173/"
