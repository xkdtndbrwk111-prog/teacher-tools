param([ValidateSet('window','wallpaper')][string]$Mode='window',[switch]$LiveBook,[switch]$LiveDownload,[switch]$LiveProviders,[switch]$LiveAudio,[switch]$LiveSystem,[switch]$LocalManager,[switch]$Transfer,[string]$Display='', [switch]$Smoke)
$ErrorActionPreference='Stop'
if(![Environment]::Is64BitOperatingSystem){throw 'Windows x64 required'}
if($Smoke -and ($LiveBook -or $LiveDownload -or $LiveProviders -or $LiveAudio -or $LiveSystem -or $LocalManager -or $Transfer)){throw 'Offline smoke only'}
$package=$PSScriptRoot
$manifest=Get-Content -LiteralPath (Join-Path $package 'manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
if($manifest.schema -cne 'HOJA-FIELD-PILOT-1' -or $manifest.version -cne '1.66.43-field-a1'){throw 'Unexpected package manifest'}
function Plain([string]$p){
 if((Get-Item -LiteralPath $p -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Linked path rejected: $p"}
}
function Verify-Payload([string]$base){
 $seen=@{}
 foreach($entry in @($manifest.files)){
  $rel=[string]$entry.path
  if($rel -cnotmatch '^(bin|local/TeacherToolsLocal)/[A-Za-z0-9_.-]+$' -or $rel.Contains('..') -or $entry.sha256 -cnotmatch '^[0-9a-f]{64}$' -or $seen.ContainsKey($rel)){throw 'Invalid package entry'}
  $seen[$rel]=$true
  $p=Join-Path $base $rel
  Plain (Split-Path $p -Parent);Plain $p
  if((Get-Item -LiteralPath $p).Length -ne $entry.bytes -or (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha256){throw "Package file mismatch: $rel"}
 }
 foreach($required in @('bin/HOJA-Native-Launch-Lab.exe','bin/HOJA-Native-Server.exe','bin/HOJA-Field-Static.exe','bin/field-manager.zip','bin/field-game.zip','local/TeacherToolsLocal/dashboard.html','local/TeacherToolsLocal/server.ps1','local/TeacherToolsLocal/asset-book-reader-host.zip')){if(!$seen.ContainsKey($required)){throw 'Package incomplete'}}
}
$payload=Join-Path $package 'payload';Plain $payload;Plain (Join-Path $payload 'local');Verify-Payload $payload
$realLocal=$env:LOCALAPPDATA;$oldLab=$env:HOJA_LAB_ROOT
$parent=Join-Path $realLocal 'TeacherToolsWebView2Pilot'
[void][IO.Directory]::CreateDirectory($parent);Plain $parent
if($manifest.source -cnotmatch '^[a-f0-9]{40}$'){throw 'Invalid build source'}
$root=Join-Path $parent ('hoja-webview-lab-'+$manifest.source.Substring(0,32))
$lock=[IO.File]::Open((Join-Path $parent 'pilot.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$server=$null;$board=$null;$static=@{}
try{
 foreach($port in @(17451,4188,4189)){
  if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw "Pilot port $port already in use. No process was stopped."}
 }
 if(!(Test-Path -LiteralPath $root)){
  $stage=Join-Path $parent ('stage-'+[guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($stage)
  foreach($entry in $manifest.files){
   $dest=Join-Path $stage $entry.path
   [void][IO.Directory]::CreateDirectory((Split-Path $dest -Parent))
   Copy-Item -LiteralPath (Join-Path $payload $entry.path) -Destination $dest
  }
  Verify-Payload $stage
  [IO.File]::WriteAllText((Join-Path $stage 'field-pilot.flag'),'1.66.43-field-a1')
  [IO.Directory]::Move($stage,$root)
 }
 Plain $root;Plain (Join-Path $root 'local');Plain (Join-Path $root 'field-pilot.flag')
 if((Get-Content -LiteralPath (Join-Path $root 'field-pilot.flag') -Raw) -cne '1.66.43-field-a1'){throw 'Pilot identity mismatch'}
 Verify-Payload $root
 $env:HOJA_LAB_ROOT=$root;$env:LOCALAPPDATA=Join-Path $root 'local'
 foreach($name in @('native-launch.ready','native-launch.stop','native-launch.result','native-read-server.ready','native-read-server.stop','field-book-live.flag','media-download-live.flag','field-provider-live.flag','field-audio-live.flag','field-system-live.flag','system-open-live.flag','field-transfer-live.flag','photo-picker-live.flag','neis-live.flag','field-manager-live.flag','manager.static.ready','manager.static.stop','game.static.ready','game.static.stop','field-smoke.flag','field-game-smoke.result')){Remove-Item -LiteralPath (Join-Path $root $name) -Force -ErrorAction SilentlyContinue}
 foreach($name in @('coin-write-fixture.flag','media-read-fixture.flag','media-write-fixture.flag')){Set-Content -LiteralPath (Join-Path $root $name) 'isolated-field-data' -Encoding ASCII}
 if($LiveBook){Set-Content -LiteralPath (Join-Path $root 'field-book-live.flag') 'explicit' -Encoding ASCII}
 if($LiveDownload){Set-Content -LiteralPath (Join-Path $root 'media-download-live.flag') 'explicit' -Encoding ASCII}
 if($LiveProviders){foreach($name in @('field-provider-live.flag','neis-live.flag')){Set-Content -LiteralPath (Join-Path $root $name) 'explicit' -Encoding ASCII}}
 if($LiveAudio){Set-Content -LiteralPath (Join-Path $root 'field-audio-live.flag') 'explicit' -Encoding ASCII}
 if($LiveSystem){foreach($name in @('field-system-live.flag','system-open-live.flag','photo-picker-live.flag')){Set-Content -LiteralPath (Join-Path $root $name) 'explicit' -Encoding ASCII}}
 if($Transfer){Set-Content -LiteralPath (Join-Path $root 'field-transfer-live.flag') 'explicit' -Encoding ASCII}
 if($LocalManager){Set-Content -LiteralPath (Join-Path $root 'field-manager-live.flag') 'explicit' -Encoding ASCII}
 if($Smoke){Set-Content -LiteralPath (Join-Path $root 'field-smoke.flag') 'offline-smoke-only' -Encoding ASCII}
 foreach($kind in @('manager','game')){
  $port=if($kind -eq 'manager'){4188}else{4189}
  $proc=Start-Process -FilePath (Join-Path $root 'bin/HOJA-Field-Static.exe') -ArgumentList "$kind $PID" -PassThru -WindowStyle Hidden
  $null=$proc.Handle;$static[$kind]=$proc
  $readyStatic=Join-Path $root "$kind.static.ready"
  for($i=0;$i -lt 100 -and !(Test-Path -LiteralPath $readyStatic);$i++){if($proc.HasExited){throw "$kind static server exited"};Start-Sleep -Milliseconds 200}
  if(!(Test-Path -LiteralPath $readyStatic) -or [int](Get-Content -LiteralPath $readyStatic -Raw) -ne $proc.Id){throw "$kind static readiness mismatch"}
  $listener=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen
  if($listener.OwningProcess -ne $proc.Id){throw "$kind listener ownership mismatch"}
 }
 if($Display){
  Add-Type -AssemblyName System.Windows.Forms
  if($Display -cnotin @([Windows.Forms.Screen]::AllScreens|ForEach-Object {$_.DeviceName})){throw 'Unknown display device'}
  [IO.File]::WriteAllText((Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal/display.txt'),$Display)
 }
 Add-Type -AssemblyName System.Windows.Forms
 $screens=@([Windows.Forms.Screen]::AllScreens|ForEach-Object {@{device=$_.DeviceName;primary=$_.Primary;x=$_.Bounds.X;y=$_.Bounds.Y;width=$_.Bounds.Width;height=$_.Bounds.Height}})
 @{schema='HOJA-FIELD-DEVICE-1';mode=$Mode;screens=$screens;providerOptIn=[bool]$LiveProviders;audioOptIn=[bool]$LiveAudio}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $root 'field-device-report.json') -Encoding UTF8
 $server=Start-Process -FilePath (Join-Path $root 'bin/HOJA-Native-Server.exe') -ArgumentList '--lab-coin-server' -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'server-out.log') -RedirectStandardError (Join-Path $root 'server-err.log')
 $null=$server.Handle
 $ready=Join-Path $root 'native-read-server.ready'
 for($i=0;$i -lt 120 -and !(Test-Path -LiteralPath $ready);$i++){if($server.HasExited){throw 'Pilot server failed to start'};Start-Sleep -Milliseconds 250}
 if(!(Test-Path -LiteralPath $ready) -or [int](Get-Content -LiteralPath $ready -Raw) -ne $server.Id){throw 'Pilot server readiness mismatch'}
 $listener=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17451 -State Listen
 if($listener.OwningProcess -ne $server.Id){throw 'Pilot listener ownership mismatch'}
 $board=Start-Process -FilePath (Join-Path $root 'bin/HOJA-Native-Launch-Lab.exe') -ArgumentList "--lab-launch $Mode" -PassThru
 $null=$board.Handle
 $boardReady=Join-Path $root 'native-launch.ready'
 for($i=0;$i -lt 240 -and !(Test-Path -LiteralPath $boardReady);$i++){if($board.HasExited -or $server.HasExited){throw ('Pilot launch failed: '+(Get-Content -LiteralPath (Join-Path $root 'native-launch.result') -ErrorAction SilentlyContinue))};Start-Sleep -Milliseconds 250}
 if(!(Test-Path -LiteralPath $boardReady)){throw 'Pilot dashboard readiness timeout'}
 if($Smoke){
  foreach($name in @('field-book-live.flag','media-download-live.flag','field-provider-live.flag','field-audio-live.flag','field-system-live.flag','system-open-live.flag','field-transfer-live.flag','neis-live.flag','book-state-fixture.flag','media-download-fixture.flag','audio-fixture.flag')){
   if(Test-Path -LiteralPath (Join-Path $root $name)){throw ('Unexpected field activation: '+$name)}
  }
  $headers=@{'Sec-Fetch-Site'='same-origin';'Origin'='http://127.0.0.1:17451'}
  $health=Invoke-RestMethod -Uri 'http://127.0.0.1:17451/health' -TimeoutSec 3
  if($health.service -cne 'teacher-tools-local'){throw 'Field service identity'}
  $media=Invoke-RestMethod -Uri 'http://127.0.0.1:17451/api/youtube/status' -Headers $headers -TimeoutSec 3
  if(!$media.ok -or $media.job.state -ne 'idle' -or $media.token -cnotmatch '^[a-f0-9]{32}$'){throw 'Field default media state'}
  try{
   Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:17451/api/open-manager' -Headers $headers -ContentType 'text/plain' -TimeoutSec 3|Out-Null
   throw 'Published manager unexpectedly accepted'
  }catch{if(!$_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409){throw}}
  if((Get-Content -LiteralPath (Join-Path $root 'field-game-smoke.result') -Raw) -notmatch '^PASS real packaged mini-game'){throw 'Field game handshake not verified'}
  Write-Host (Get-Content -LiteralPath (Join-Path $root 'field-game-smoke.result') -Raw)
  $managerPage=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4188/seating/' -TimeoutSec 3
  $link=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4188/classroom/host/dashboard-link.js' -TimeoutSec 3
  $game=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4189/hoja-minigames/?mode=board&embed=dashboard&coin=4&fresh=1-1' -TimeoutSec 10
  if($managerPage.Content -notmatch '교실 매니저' -or $link.Content -notmatch '127\.0\.0\.1:17451' -or $link.Content -match '127\.0\.0\.1:17439' -or $game.Content -notmatch "DASHBOARD_ORIGIN='http://127.0.0.1:17451'" -or $game.Content -match '127\.0\.0\.1:17439'){throw 'Packaged origins mismatch'}
  if($managerPage.Headers['Content-Security-Policy'] -notmatch 'connect-src.*127\.0\.0\.1:17451' -or $game.Headers['Content-Security-Policy'] -notmatch 'frame-ancestors http://127\.0\.0\.1:17451'){throw 'Static origin isolation policy missing'}
  Write-Host 'PASS packaged local manager/game origins and production manager isolation'
  if($env:GITHUB_ACTIONS -eq 'true' -and $env:HOJA_FIELD_MANAGER_SMOKE){
   & node $env:HOJA_FIELD_MANAGER_SMOKE
   if($LASTEXITCODE -ne 0){throw 'Packaged manager browser smoke failed'}
  }
  Set-Content -LiteralPath (Join-Path $root 'native-launch.stop') 'stop' -Encoding ASCII
 }
 while(!$board.WaitForExit(500)){if($server.HasExited){throw 'Pilot server exited'};foreach($proc in $static.Values){if($proc.HasExited){throw 'Static pilot server exited'}}}
 if($board.ExitCode -ne 0){throw "Pilot launcher exit: $($board.ExitCode)"}
 Write-Host 'PASS isolated field pilot dashboard launch and close'
}finally{
 if($board -and !$board.HasExited){Set-Content -LiteralPath (Join-Path $root 'native-launch.stop') 'stop' -Encoding ASCII;if(!$board.WaitForExit(5000)){$board.Kill();$board.WaitForExit()}}
 if($server -and !$server.HasExited){Set-Content -LiteralPath (Join-Path $root 'native-read-server.stop') 'stop' -Encoding ASCII;if(!$server.WaitForExit(15000)){$server.Kill();$server.WaitForExit()}}
 foreach($kind in $static.Keys){$proc=$static[$kind];if(!$proc.HasExited){Set-Content -LiteralPath (Join-Path $root "$kind.static.stop") 'stop' -Encoding ASCII;if(!$proc.WaitForExit(5000)){$proc.Kill();$proc.WaitForExit()}};$proc.Dispose()}
 if($board){$board.Dispose()};if($server){$server.Dispose()}
 Remove-Item -LiteralPath (Join-Path $root 'field-smoke.flag') -Force -ErrorAction SilentlyContinue
 $env:LOCALAPPDATA=$realLocal;$env:HOJA_LAB_ROOT=$oldLab
 $lock.Dispose()
}
