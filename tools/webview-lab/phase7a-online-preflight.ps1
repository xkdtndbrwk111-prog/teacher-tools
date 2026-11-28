param(
  [string]$Profile=(Join-Path $PSScriptRoot 'phase7a-online-profile.json'),
  [switch]$NetworkCheck
)
$ErrorActionPreference='Stop'
$p=Get-Content -LiteralPath $Profile -Raw -Encoding UTF8 | ConvertFrom-Json
if($p.schema -cne 'HOJA-WEBVIEW2-ONLINE-PROFILE-1' -or $p.mode -cne 'online'){throw 'Invalid Phase 7A online profile'}
foreach($name in @('managerOrigin','gameOrigin')){
  $uri=[Uri]$p.$name
  if($uri.Scheme -cne 'https' -or [string]::IsNullOrWhiteSpace($uri.Host)){throw "Unsafe online origin: $name"}
}
if($p.nativeApiOrigin -cne 'http://127.0.0.1:17439'){throw 'Native API origin mismatch'}
if(@($p.staticServerExecutables).Count -ne 0){throw 'Online profile must not package a static server executable'}
foreach($legacy in @($p.legacyLocalOrigins)){
  if($p.managerOrigin.Contains($legacy) -or $p.gameOrigin.Contains($legacy) -or $p.nativeApiOrigin.Contains($legacy)){throw 'Legacy local origin leaked into online profile'}
}
if($NetworkCheck){
  foreach($name in @('managerOrigin','gameOrigin')){
    $response=Invoke-WebRequest -UseBasicParsing -Method Head -Uri ([string]$p.$name) -TimeoutSec 15
    if([int]$response.StatusCode -lt 200 -or [int]$response.StatusCode -ge 400){throw "Online endpoint unavailable: $name"}
  }
}
Write-Host "PASS Phase 7A online profile: manager=$($p.managerOrigin) game=$($p.gameOrigin) staticServers=0"
