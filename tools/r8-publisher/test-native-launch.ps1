param([string]$KernelDir,[string]$Seed,[string]$Candidate)
$ErrorActionPreference='Stop'
# Use a new LOCALAPPDATA directory, never the runner's or teacher's installed profile.
$isolated=Join-Path $env:RUNNER_TEMP ('r8-launch-'+[guid]::NewGuid().ToString('N'))
$env:LOCALAPPDATA=$isolated
$root=Join-Path $isolated 'TeacherToolsLocal'
$feed=Join-Path $isolated 'feed'
New-Item -ItemType Directory -Path $root,$feed | Out-Null
$kernel=Join-Path $KernelDir 'r8-kernel.ps1'
$launch=Join-Path $KernelDir 'launch.ps1'
if((Get-FileHash $kernel -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'adccd670e2406dab518f2611f58b4e0c955a7b3f6e518353c4c167231c69202e'){throw 'Reviewed kernel mismatch'}
if((Get-FileHash $launch -Algorithm SHA256).Hash.ToLowerInvariant() -cne '239fbddb7eefcf01c8678ccff009047b5f511d80c6d34488ab9f8ffd3d0df4b7'){throw 'Reviewed launch mismatch'}
Copy-Item $launch (Join-Path $root 'launch.ps1')
# Change only the test-copy URL; the production bootstrap and public key remain untouched.
$text=[IO.File]::ReadAllText($kernel)
$url='https://xkdtndbrwk111-prog.github.io/teacher-tools/stable/runtime-v1/'
if(([regex]::Matches($text,[regex]::Escape($url))).Count -ne 1){throw 'Unexpected feed declaration'}
[IO.File]::WriteAllText((Join-Path $root 'r8-kernel.ps1'),$text.Replace($url,'http://127.0.0.1:18449/'),[Text.UTF8Encoding]::new($false))
. (Join-Path $root 'r8-kernel.ps1')
$base=Get-Content -Raw (Join-Path $Seed 'payload.json') | ConvertFrom-Json
$target=Get-Content -Raw (Join-Path $Candidate 'payload.json') | ConvertFrom-Json
foreach($f in $base.files){
 $bytes=[IO.File]::ReadAllBytes((Join-Path $Seed ('blobs/'+$f.sha256+'.bin')))
 if((Get-R8Sha $bytes) -cne $f.sha256){throw 'Seed mismatch'}
 Write-R8Atomic (Get-R8Path $root $f.name) $bytes
}
$sentinels=@{'coins.log'='virtual ledger';'settings.json'='virtual settings';'roster.json'='virtual roster'}
foreach($n in $sentinels.Keys){[IO.File]::WriteAllText((Join-Path $root $n),$sentinels[$n])}
Copy-Item -Recurse (Join-Path $Candidate 'blobs') $feed
$rsa=New-Object Security.Cryptography.RSACryptoServiceProvider(2048)
$http=$null
$psExe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
function Start-Launch([string]$Flags){
 $p=Start-Process -FilePath $psExe -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $root 'launch.ps1')+'" '+$Flags) -PassThru -WindowStyle Hidden
 if(-not $p.WaitForExit(110000)){throw 'Launcher timed out'}
 if($p.ExitCode -ne 0){throw ('Launcher exit '+$p.ExitCode)}
}
function Assert-Board([string]$Version,[string]$Mode,[string]$ExpectedStatus){
 $mref=if($Version -ceq $base.version){$base}else{$target};$rel=($mref.files | Where-Object {$_.name -ceq 'release.json'});$snap=if($Version -ceq $base.version){$Seed}else{$Candidate};$expected=(Get-Content -Raw -Encoding UTF8 (Join-Path $snap ('blobs/'+$rel.sha256+'.bin')) | ConvertFrom-Json).release
 $deadline=[DateTime]::UtcNow.AddSeconds(45)
 do {
  try {
   $h=(Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri 'http://127.0.0.1:17439/health').Content|ConvertFrom-Json
   $m=Get-Content -Raw (Join-Path $root 'board-mode.json')|ConvertFrom-Json
   $s=Get-Content -Raw (Join-Path $root 'update-state.json')|ConvertFrom-Json
   $p=Get-Process -Id $m.pid -ErrorAction Stop
   if($h.release -ceq $expected -and $m.release -ceq $expected -and $m.mode -ceq $Mode -and $s.status -ceq $ExpectedStatus -and $p.MainWindowHandle -ne 0){return}
  } catch {}
  Start-Sleep -Milliseconds 500
 }while([DateTime]::UtcNow -lt $deadline)
 $state=Get-Content -Raw (Join-Path $root 'update-state.json') -ErrorAction SilentlyContinue
 $err=Get-Content -Tail 5 (Join-Path $root 'launch-error.log') -ErrorAction SilentlyContinue
 throw ('Board readiness not confirmed: '+$Version+' / '+$Mode+' / '+$ExpectedStatus+'; '+$state+'; '+($err -join ' '))
}
try {
 [IO.File]::WriteAllText((Join-Path $root 'update-public.xml'),$rsa.ToXmlString($false))
 [IO.File]::WriteAllText((Join-Path $feed 'latest.json'),'{"status":"unreleased"}')
 $http=Start-Process python -ArgumentList @('-m','http.server','18449','--bind','127.0.0.1','--directory',('"'+$feed+'"')) -PassThru -WindowStyle Hidden
 Start-Sleep -Seconds 2
 if((Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri 'http://127.0.0.1:18449/latest.json').StatusCode -ne 200){throw 'Local feed unavailable'}
 Start-Launch '-Windowed'
 Assert-Board $base.version 'window' 'idle'
 $payload=[IO.File]::ReadAllBytes((Join-Path $Candidate 'payload.json'))
 $signature=$rsa.SignData($payload,'SHA256')
 $envBytes=$R8Utf8.GetBytes((ConvertTo-Json -Compress @{payload=[Convert]::ToBase64String($payload);signature=[Convert]::ToBase64String($signature)}))
 Write-R8Atomic (Join-Path $feed 'latest.json') $envBytes
 Start-Launch '-Windowed -ManualUpdate'
 Assert-Board $target.version 'window' 'installed'
 foreach($f in $target.files){if((Get-R8FileSha (Get-R8Path $root $f.name)) -cne $f.sha256){throw ('Installed file mismatch '+$f.name)}}
 foreach($n in $sentinels.Keys){if([IO.File]::ReadAllText((Join-Path $root $n)) -cne $sentinels[$n]){throw ('Sentinel changed '+$n)}}
 if(Test-Path (Join-Path $root 'r8-transaction')){throw 'Uncommitted transaction'}
 $page=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri 'http://127.0.0.1:17439/'
 if($page.StatusCode -ne 200 -or $page.Content -notmatch [regex]::Escape([string]$target.version)){throw 'Updated HTTP dashboard unavailable'}

 # Exercise the actual signed local theme endpoint after the board publishes.
 if($page.Content -match 'tt-board-theme-bridge-v1'){
  $site='http://127.0.0.1:17439';$managerOrigin='https://xkdtndbrwk111-prog.github.io'
  $deadline=[datetime]::UtcNow.AddSeconds(25);$live=$null
  do{try{$live=Invoke-RestMethod -Uri ($site+'/api/theme') -Headers @{Origin=$managerOrigin} -TimeoutSec 3}catch{};if($live){break};Start-Sleep -Milliseconds 500}while([datetime]::UtcNow -lt $deadline)
  if(!$live -or $live.version -ne 1 -or $live.theme -notin @('dark','sky','pink','green','black','custom')){throw 'Running board did not publish a valid theme'}
  $sample='{"version":1,"theme":"custom","font":"Malgun Gothic","custom":{"bg":"#112233","panel":"#334455","text":"#ffffff","accent":"#778899","modal":"#223344"},"private":"must not expose"}'
  $cross=@{'Sec-Fetch-Site'='cross-site';Origin=$managerOrigin}
  try{Invoke-WebRequest -UseBasicParsing -Uri ($site+'/api/theme/publish') -Method POST -Headers $cross -ContentType 'application/json' -Body $sample -TimeoutSec 3|Out-Null;throw 'cross-origin write accepted'}catch{if(!$_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403){throw}}
  $local=@{'Sec-Fetch-Site'='same-origin';Origin=$site}
  $result=Invoke-RestMethod -Uri ($site+'/api/theme/publish') -Method POST -Headers $local -ContentType 'application/json' -Body $sample -TimeoutSec 3
  if(!$result.ok){throw 'local theme write failed'}
  $read=Invoke-WebRequest -UseBasicParsing -Uri ($site+'/api/theme') -Headers @{Origin=$managerOrigin} -TimeoutSec 3
  $theme=$read.Content|ConvertFrom-Json
  if($read.Headers['Access-Control-Allow-Origin'] -ne $managerOrigin -or $theme.custom.modal -ne '#223344' -or $theme.PSObject.Properties['private']){throw 'theme CORS/projection failed'}
  try{Invoke-WebRequest -UseBasicParsing -Uri ($site+'/api/theme') -Headers @{Origin='https://example.invalid'} -TimeoutSec 3|Out-Null;throw 'foreign theme read accepted'}catch{if(!$_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403){throw}}
  Write-Host 'PASS actual installed board theme publication, local read, custom color and cross-origin isolation'
 }
 # Exercise the exact installed signed book dependency through the live local HTTP server.
 if(Test-Path -LiteralPath (Join-Path $root 'asset-book-reader-host.zip')){
  $site='http://127.0.0.1:17439'
  $headers=@{'Sec-Fetch-Site'='same-origin';Origin=$site}
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class BookTestGeometry {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int L,T,R,B;}
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
}
'@
  $m=Get-Content -Raw (Join-Path $root 'board-mode.json')|ConvertFrom-Json
  $rect=New-Object BookTestGeometry+RECT
  if(![BookTestGeometry]::GetClientRect([IntPtr][long]$m.window,[ref]$rect)){throw 'No test owner rect'}
  $vw=$rect.R-$rect.L;$vh=$rect.B-$rect.T
  $geometry=@{vw=$vw;vh=$vh;x=10;y=10;w=($vw-20);h=($vh-100);visible=1}
  $args=@{id='DAHbOZ_XOJI';url='https://www.canva.com/design/DAHbOZ_XOJI/d_oXAabCNXOYBSoES_ZXxA/view?embed';title='Book native installed smoke test';pages=379;start=3;saved=3;layout=$geometry}
  # Diagnostic only: keep the full native Canva gate unchanged. Log no query tokens or page contents.
  try {
   $canvaProbe=Invoke-WebRequest -UseBasicParsing -TimeoutSec 12 -MaximumRedirection 2 -Uri $args.url
   $canvaHost=([Uri]$canvaProbe.BaseResponse.ResponseUri).Host
   Write-Host ('CANVA_HTTP_PROBE status='+[int]$canvaProbe.StatusCode+' host='+$canvaHost)
  } catch {
   $code=if($_.Exception.Response){[int]$_.Exception.Response.StatusCode}else{'no-http-response'}
   $type=$_.Exception.GetType().Name
   Write-Host ('CANVA_HTTP_PROBE failure status='+$code+' exception='+$type)
  }
  function Encode-Book($a){[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Compress $a)))}
  function Assert-BookRejected([string]$request,[string]$method,$headers,$body,[int]$expected){
   try{
    $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri ($site+$request) -Method $method -Headers $headers -ContentType 'text/plain' -Body $body
    throw 'Unexpected successful request'
   }catch{
    if(!$_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne $expected){throw}
   }
  }
  Assert-BookRejected '/api/book-reader/open' 'POST' @{'Sec-Fetch-Site'='cross-site';Origin='https://example.invalid'} (Encode-Book $args) 403
  $bad=$args.Clone();$bad.url='https://example.invalid/design/DAHbOpoUrrg/test/view?embed'
  Assert-BookRejected '/api/book-reader/open' 'POST' $headers (Encode-Book $bad) 409
  $open=Invoke-RestMethod -TimeoutSec 10 -Uri ($site+'/api/book-reader/open') -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book $args)
  if(!$open.ok -or $open.session -cnotmatch '^[a-f0-9]{32}$'){throw 'Native session not created'}
  $suffix='?session='+$open.session
  try{
   $deadline=[DateTime]::UtcNow.AddSeconds(55)
   $passed=$false
   do{
    $state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4
    if($state.closed){throw ('Native reader closed prematurely: '+$state.status)}
    if($state.ready -and $state.page -eq 3 -and $state.saved -eq 3 -and $state.owned -and $state.visible -and $state.w -ge 100 -and $state.h -ge 60){$passed=$true;break}
    Start-Sleep -Milliseconds 600
   }while([DateTime]::UtcNow -lt $deadline)
   if(!$passed){throw ('Live Canva actual native resume not confirmed: '+($state|ConvertTo-Json -Compress))}
   Write-Host 'PASS: exact installed native book host, cross-site and URL rejection, live Canva direct page seek to saved page 3, no capture call'
   # Exercise the exact real HTTP status POST, including validation and repeated atomic replacement.
   $invalid=$geometry.Clone();$invalid.w=$invalid.vw+100
   Assert-BookRejected ('/api/book-reader/status'+$suffix) 'POST' $headers (Encode-Book @{layout=$invalid}) 400
   Assert-BookRejected ('/api/book-reader/status'+$suffix) 'POST' @{'Sec-Fetch-Site'='cross-site';Origin='https://example.invalid'} (Encode-Book @{layout=$geometry}) 403
   $originalWidth=$state.w
   $geometry.w=[int]($geometry.w/2)
   $state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book @{layout=$geometry}) -TimeoutSec 4
   $deadline=[DateTime]::UtcNow.AddSeconds(8)
   do{$state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4;if($state.owned -and $state.visible -and $state.w -lt ($originalWidth*0.75)){break};Start-Sleep -Milliseconds 350}while([DateTime]::UtcNow -lt $deadline)
   if(!$state.visible -or $state.w -ge ($originalWidth*0.75)){throw 'Owned slot did not resize'}
   $geometry.visible=0
   Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book @{layout=$geometry}) -TimeoutSec 4 | Out-Null
   $deadline=[DateTime]::UtcNow.AddSeconds(8)
   do{$state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4;if(!$state.visible){break};Start-Sleep -Milliseconds 350}while([DateTime]::UtcNow -lt $deadline)
   if($state.visible){throw 'Owned slot did not hide'}
   $geometry.visible=1
   $geometry.w=[int]($vw-20)
   Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book @{layout=$geometry;command=@{seq=1;kind='manual';page=2}}) -TimeoutSec 4 | Out-Null
   $deadline=[DateTime]::UtcNow.AddSeconds(10)
   do{
    $state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4
    if($state.owned -and $state.visible -and $state.w -ge ($originalWidth*0.9) -and $state.manual -and $state.saved -eq 2 -and $state.ack -eq 1){break}
    Start-Sleep -Milliseconds 350
   }while([DateTime]::UtcNow -lt $deadline)
   if(!$state.owned -or !$state.visible -or $state.w -lt ($originalWidth*0.9) -or !$state.manual -or $state.saved -ne 2 -or $state.ack -ne 1){throw ('Owned slot restore or manual save not confirmed: '+($state|ConvertTo-Json -Compress))}
   Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book @{layout=$geometry;command=@{seq=2;kind='auto';page=0}}) -TimeoutSec 4 | Out-Null
   $deadline=[DateTime]::UtcNow.AddSeconds(10)
   do{
    $state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4
    if(!$state.manual -and $state.saved -eq 3 -and $state.ack -eq 2){break}
    Start-Sleep -Milliseconds 350
   }while([DateTime]::UtcNow -lt $deadline)
   if($state.manual -or $state.saved -ne 3 -or $state.ack -ne 2){throw ('Automatic save restore not confirmed: '+($state|ConvertTo-Json -Compress))}
   $geometry.immersive=1
   Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book @{layout=$geometry}) -TimeoutSec 4 | Out-Null
   $deadline=[DateTime]::UtcNow.AddSeconds(10)
   do{$state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4;if($state.immersive -and $state.cleanControls){break};Start-Sleep -Milliseconds 350}while([DateTime]::UtcNow -lt $deadline)
   if(!$state.immersive){throw 'Immersive mode not entered'}
   Write-Host ('LIVE CANVA control cleanup recognized: '+$state.cleanControls)
   if(!$state.cleanControls){throw 'Live Canva control bar was not safely recognized'}
   Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book @{layout=$geometry;command=@{seq=3;kind='next';page=0}}) -TimeoutSec 4 | Out-Null
   $deadline=[DateTime]::UtcNow.AddSeconds(10)
   do{$state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4;if($state.page -eq 4 -and $state.saved -eq 4 -and $state.ack -eq 3){break};Start-Sleep -Milliseconds 350}while([DateTime]::UtcNow -lt $deadline)
   if($state.page -ne 4 -or $state.saved -ne 4 -or $state.ack -ne 3){throw ('Immersive next page not confirmed: '+($state|ConvertTo-Json -Compress))}
   Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book @{layout=$geometry;command=@{seq=4;kind='prev';page=0}}) -TimeoutSec 4 | Out-Null
   $deadline=[DateTime]::UtcNow.AddSeconds(10)
   do{$state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4;if($state.page -eq 3 -and $state.saved -eq 3 -and $state.ack -eq 4){break};Start-Sleep -Milliseconds 350}while([DateTime]::UtcNow -lt $deadline)
   if($state.page -ne 3 -or $state.saved -ne 3 -or $state.ack -ne 4){throw ('Immersive previous page not confirmed: '+($state|ConvertTo-Json -Compress))}
   if((Invoke-RestMethod -Uri ($site+'/health') -TimeoutSec 4).service -ne 'teacher-tools-local'){throw 'Local server no longer healthy'}
   Write-Host 'PASS actual Canva immersive next/previous with auto bookmark and live server'
   $geometry.immersive=0
   Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book @{layout=$geometry}) -TimeoutSec 4 | Out-Null
   $deadline=[DateTime]::UtcNow.AddSeconds(8)
   do{$state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4;if(!$state.immersive){break};Start-Sleep -Milliseconds 350}while([DateTime]::UtcNow -lt $deadline)
   if($state.immersive){throw 'Immersive mode did not restore'}
   Write-Host 'PASS owned book slot geometry, resize, hide, restore, invalid and cross-site rejection, manual and automatic save, immersive transition'
  }finally{
   Invoke-RestMethod -Uri ($site+'/api/book-reader/close'+$suffix) -Method POST -Headers $headers -TimeoutSec 4 | Out-Null
   $deadline=[DateTime]::UtcNow.AddSeconds(12)
   do{
    $state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4
    if($state.closed){break}
    Start-Sleep -Milliseconds 400
   }while([DateTime]::UtcNow -lt $deadline)
   if(!$state.closed){throw 'Native close not confirmed'}
  }
  # A closed-state publication may precede actual process exit.
  $priorExe=Join-Path (Join-Path (Join-Path $root 'book-reader-sessions') $open.session) 'BookReader.exe'
  $deadline=[DateTime]::UtcNow.AddSeconds(12)
  do{
   $prior=@(Get-CimInstance Win32_Process -Filter "Name='BookReader.exe'" | Where-Object {$_.ExecutablePath -eq $priorExe})
   if(!$prior.Count){break}
   Start-Sleep -Milliseconds 300
  }while([DateTime]::UtcNow -lt $deadline)
  if($prior.Count){throw 'Native process did not exit after close'}
  Write-Host 'PASS native session close'

  # The failing field path is interactive Almond, not the legacy noninteractive
  # embed above. Keep all existing assertions, and exercise the actual installed
  # server with the exact 394-page request and a renewed lease, twice.
  $interactiveArgs=@{id='DAHbOZ_XOJI';url='https://canva.link/9qxk3zuhh93ts2s';title='Almond interactive installed smoke';interactive=$true;pages=394;start=1;saved=1;layout=@{vw=$vw;vh=$vh;x=10;y=10;w=($vw-20);h=($vh-100);visible=1;immersive=0}}
  for($attempt=1;$attempt -le 2;$attempt++){
   try{
    $open=Invoke-RestMethod -TimeoutSec 10 -Uri ($site+'/api/book-reader/open') -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book $interactiveArgs)
   }catch{
    $diagnostic=Get-Content -LiteralPath (Join-Path $root 'book-reader-launch-diagnostic.json') -Raw -ErrorAction SilentlyContinue
    Write-Host ('Interactive open diagnostic: '+$diagnostic)
    throw
   }
   if(!$open.ok -or $open.session -cnotmatch '^[a-f0-9]{32} }
 Write-Host 'PASS: actual Windows board window, local HTTP signed update, close and restart, matching readiness, all target files, synthetic data preservation. Test key and isolated local feed only; no physical school device or installer test.'
}finally{
 if($http -and -not $http.HasExited){$http.Kill()}
 $rsa.Dispose()
 # Terminate only processes explicitly referencing the disposable test path.
 Get-CimInstance Win32_Process | Where-Object {$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.Name -in @('chrome.exe','msedge.exe','powershell.exe','pwsh.exe')} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
}
){throw 'Interactive native session not created'}
   $suffix='?session='+$open.session
   try{
    $deadline=[DateTime]::UtcNow.AddSeconds(55)
    $ready=$false
    do{
     $state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book @{layout=$interactiveArgs.layout}) -TimeoutSec 4
     if($state.closed){throw ('Interactive reader closed prematurely: '+$state.status)}
     if($state.ready -and $state.owned -and $state.visible -and $state.total -eq 394 -and $state.saved -eq 1){$ready=$true;break}
     Start-Sleep -Milliseconds 500
    }while([DateTime]::UtcNow -lt $deadline)
    if(!$ready){throw ('Interactive Canva ready not confirmed: '+($state|ConvertTo-Json -Compress))}
    if($attempt -eq 1){
     $hold=[DateTime]::UtcNow.AddSeconds(40)
     do{
      $state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Method POST -Headers $headers -ContentType 'text/plain' -Body (Encode-Book @{layout=$interactiveArgs.layout}) -TimeoutSec 4
      if($state.closed -or !$state.ready -or !$state.owned -or !$state.visible){throw ('Interactive session lost during lease test: '+($state|ConvertTo-Json -Compress))}
      Start-Sleep -Milliseconds 800
     }while([DateTime]::UtcNow -lt $hold)
    }
    Write-Host ('PASS interactive installed reader attempt '+$attempt+'; direct Canva ready, owned, visible, 394 pages; not a physical click/keyboard test')
   }finally{
    Invoke-RestMethod -Uri ($site+'/api/book-reader/close'+$suffix) -Method POST -Headers $headers -TimeoutSec 4 | Out-Null
    $deadline=[DateTime]::UtcNow.AddSeconds(12)
    do{
     $state=Invoke-RestMethod -Uri ($site+'/api/book-reader/status'+$suffix) -Headers $headers -TimeoutSec 4
     if($state.closed){break}
     Start-Sleep -Milliseconds 400
    }while([DateTime]::UtcNow -lt $deadline)
    if(!$state.closed){throw 'Interactive native close not confirmed'}
    # The final closed-state write can precede actual process exit. Confirm the
    # exact session's executable exited before requesting the next session.
    $sessionDir=Join-Path (Join-Path $root 'book-reader-sessions') $open.session
    $deadline=[DateTime]::UtcNow.AddSeconds(12)
    do{
     $liveReader=@(Get-CimInstance Win32_Process -Filter "Name='BookReader.exe'" | Where-Object {$_.ExecutablePath -eq (Join-Path $sessionDir 'BookReader.exe')})
     if(!$liveReader.Count){break}
     Start-Sleep -Milliseconds 300
    }while([DateTime]::UtcNow -lt $deadline)
    if($liveReader.Count){throw 'Interactive native process did not exit'}
   }
  }
  Write-Host 'PASS interactive installed reader open, 40-second lease maintenance, close and reopen'
 }
 Write-Host 'PASS: actual Windows board window, local HTTP signed update, close and restart, matching readiness, all target files, synthetic data preservation. Test key and isolated local feed only; no physical school device or installer test.'
}finally{
 if($http -and -not $http.HasExited){$http.Kill()}
 $rsa.Dispose()
 # Terminate only processes explicitly referencing the disposable test path.
 Get-CimInstance Win32_Process | Where-Object {$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.Name -in @('chrome.exe','msedge.exe','powershell.exe','pwsh.exe')} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
}
