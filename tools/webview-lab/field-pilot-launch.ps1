param([ValidateSet('window','wallpaper')][string]$Mode='window',[switch]$LiveBook,[switch]$LiveDownload,[switch]$LiveProviders,[switch]$LiveAudio,[switch]$LiveSystem,[switch]$Transfer,[string]$Display='', [switch]$Smoke)
$ErrorActionPreference='Stop'
if(![Environment]::Is64BitOperatingSystem){throw 'Windows x64 required'}
if($Smoke -and ($LiveBook -or $LiveDownload -or $LiveProviders -or $LiveAudio -or $LiveSystem -or $Transfer)){throw 'Offline smoke only'}
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
 foreach($required in @('bin/HOJA-Native-Launch-Lab.exe','bin/HOJA-Native-Server.exe','local/TeacherToolsLocal/dashboard.html','local/TeacherToolsLocal/server.ps1','local/TeacherToolsLocal/asset-book-reader-host.zip')){if(!$seen.ContainsKey($required)){throw 'Package incomplete'}}
}
$payload=Join-Path $package 'payload';Plain $payload;Plain (Join-Path $payload 'local');Verify-Payload $payload
$realLocal=$env:LOCALAPPDATA;$oldLab=$env:HOJA_LAB_ROOT
$parent=Join-Path $realLocal 'TeacherToolsWebView2Pilot'
[void][IO.Directory]::CreateDirectory($parent);Plain $parent
if($manifest.source -cnotmatch '^[a-f0-9]{40}$'){throw 'Invalid build source'}
$root=Join-Path $parent ('hoja-webview-lab-'+$manifest.source.Substring(0,32))
$lock=[IO.File]::Open((Join-Path $parent 'pilot.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$server=$null;$board=$null
try{
 if(Get-NetTCPConnection -LocalPort 17451 -State Listen -ErrorAction SilentlyContinue){throw 'Pilot port 17451 already in use. No process was stopped.'}
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
 foreach($name in @('native-launch.ready','native-launch.stop','native-launch.result','native-read-server.ready','native-read-server.stop','field-book-live.flag','media-download-live.flag','field-provider-live.flag','field-audio-live.flag','field-system-live.flag','system-open-live.flag','field-transfer-live.flag','photo-picker-live.flag','neis-live.flag')){Remove-Item -LiteralPath (Join-Path $root $name) -Force -ErrorAction SilentlyContinue}
 foreach($name in @('coin-write-fixture.flag','media-read-fixture.flag','media-write-fixture.flag')){Set-Content -LiteralPath (Join-Path $root $name) 'isolated-field-data' -Encoding ASCII}
 if($LiveBook){Set-Content -LiteralPath (Join-Path $root 'field-book-live.flag') 'explicit' -Encoding ASCII}
 if($LiveDownload){Set-Content -LiteralPath (Join-Path $root 'media-download-live.flag') 'explicit' -Encoding ASCII}
 if($LiveProviders){foreach($name in @('field-provider-live.flag','neis-live.flag')){Set-Content -LiteralPath (Join-Path $root $name) 'explicit' -Encoding ASCII}}
 if($LiveAudio){Set-Content -LiteralPath (Join-Path $root 'field-audio-live.flag') 'explicit' -Encoding ASCII}
 if($LiveSystem){foreach($name in @('field-system-live.flag','system-open-live.flag','photo-picker-live.flag')){Set-Content -LiteralPath (Join-Path $root $name) 'explicit' -Encoding ASCII}}
 if($Transfer){Set-Content -LiteralPath (Join-Path $root 'field-transfer-live.flag') 'explicit' -Encoding ASCII}
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
 if($Smoke){Set-Content -LiteralPath (Join-Path $root 'native-launch.stop') 'stop' -Encoding ASCII}
 while(!$board.WaitForExit(500)){if($server.HasExited){throw 'Pilot server exited'}}
 if($board.ExitCode -ne 0){throw "Pilot launcher exit: $($board.ExitCode)"}
 Write-Host 'PASS isolated field pilot dashboard launch and close'
}finally{
 if($board -and !$board.HasExited){Set-Content -LiteralPath (Join-Path $root 'native-launch.stop') 'stop' -Encoding ASCII;if(!$board.WaitForExit(5000)){$board.Kill();$board.WaitForExit()}}
 if($server -and !$server.HasExited){Set-Content -LiteralPath (Join-Path $root 'native-read-server.stop') 'stop' -Encoding ASCII;if(!$server.WaitForExit(15000)){$server.Kill();$server.WaitForExit()}}
 if($board){$board.Dispose()};if($server){$server.Dispose()}
 $env:LOCALAPPDATA=$realLocal;$env:HOJA_LAB_ROOT=$oldLab
 $lock.Dispose()
}
