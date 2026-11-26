$ErrorActionPreference='Stop'
$root=Join-Path $env:RUNNER_TEMP ('hoja-webview-lab-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$env:HOJA_LAB_ROOT=$root
$originalLocal=$env:LOCALAPPDATA
$env:LOCALAPPDATA=Join-Path $root 'local'
$runtime=Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal'
$out=Join-Path $root 'out'
New-Item -ItemType Directory -Path $runtime,$out | Out-Null
Copy-Item (Join-Path $PSScriptRoot '../../runtime-src/system/*') $runtime -Recurse
# Diagnostic only: log the swallowed roster exception in the isolated copy, without changing API behavior.
$serverPath=Join-Path $runtime 'server.ps1'
$serverText=[IO.File]::ReadAllText($serverPath)
$oldCatch='}catch{$status=''400 Bad Request'';$body=''{"error":"roster rejected"}''}'
$newCatch='}catch{[Console]::Error.WriteLine("LAB roster exception: "+$_.Exception.ToString()+" at "+$_.InvocationInfo.PositionMessage);$status=''400 Bad Request'';$body=''{"error":"roster rejected"}''}'
if($serverText.IndexOf($oldCatch) -lt 0 -or $serverText.IndexOf($oldCatch) -ne $serverText.LastIndexOf($oldCatch)){throw 'Roster diagnostic anchor missing or ambiguous'}
# PowerShell variable type constraints survive requests in the server loop.
# The coins route types $old as byte[]; give the roster route its own object variable.
# Apply only to the throwaway server copy, pending full regression and product approval.
$rosterOld='      $old=$null'
$rosterRead='      if([IO.File]::Exists($seatingFile)){$old=ConvertFrom-Json ([IO.File]::ReadAllText($seatingFile,[Text.Encoding]::UTF8))}'
$rosterMerge='      $merged=Merge-TTManagerRoster $x $old'
foreach($needle in @($rosterOld,$rosterRead,$rosterMerge)){
 if($serverText.IndexOf($needle) -lt 0 -or $serverText.IndexOf($needle) -ne $serverText.LastIndexOf($needle)){throw 'Roster scope fix anchor missing or ambiguous'}
 $serverText=$serverText.Replace($needle,$needle.Replace('$old','$previousRosterDocument'))
}
[IO.File]::WriteAllText($serverPath,$serverText.Replace($oldCatch,$newCatch),[Text.UTF8Encoding]::new($true))
$tokens=$null;$parseErrors=$null
[void][System.Management.Automation.Language.Parser]::ParseFile($serverPath,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw ($parseErrors|Out-String)}
# Isolated confirmed timetable input and deterministic lesson clock only. No production source edits.
$dashboardPath=Join-Path $runtime 'dashboard.html'
$dashboardText=[IO.File]::ReadAllText($dashboardPath)
$lessonStartAnchor='function miniLessonNow(){'
$lessonEndAnchor='function miniLessonReset(){'
$i=$dashboardText.IndexOf($lessonStartAnchor)
$j=$dashboardText.IndexOf($lessonEndAnchor)
if($i -lt 0 -or $j -le $i -or $i -ne $dashboardText.LastIndexOf($lessonStartAnchor) -or $j -ne $dashboardText.LastIndexOf($lessonEndAnchor)){throw 'Lesson guard anchors missing or ambiguous'}
$guard=$dashboardText.Substring($i,$j-$i)
if(!$guard.Contains('const c=seoulClock();') -or !$guard.Contains('return miniLessonPlan(c,lastWeek,periods,Date.now());')){throw 'Lesson clock anchors missing'}
$guard=$guard.Replace('const c=seoulClock();','const c=seoulClock(new Date(window.__labLessonClock??Date.now()));').Replace('return miniLessonPlan(c,lastWeek,periods,Date.now());','return miniLessonPlan(c,lastWeek,periods,window.__labLessonClock??Date.now());')
$labLesson=@'
 let labLessonSaved=null;
 window.__labLessonSeed=()=>{
   if(labLessonSaved)throw Error('fixture already active');
   labLessonSaved={week:lastWeek,confirmed:weekAlertConfirmed,times:periods,stored:localStorage.getItem('class-periods'),effects:lessonAlertSettings.enabled};
   window.__labLessonClock=Date.parse('2026-11-24T08:59:15+09:00');
   lastWeek={referenceDate:'2026-11-24',dates:['11/23','11/24','11/25','11/26','11/27'],rows:[{label:'1교시',cells:['','국어','','','']}]};
   periods=[['09:00','09:40'],['09:50','10:30'],['10:40','11:20'],['11:30','12:10'],['13:00','13:40'],['13:50','14:30'],['14:40','15:20']];
   localStorage.setItem('class-periods',JSON.stringify(periods));weekAlertConfirmed=true;lessonAlertSettings.enabled=true;
 };
 window.__labLessonStatus=()=>({plan:miniLessonNow(),farewell:miniLessonFarewell?.textContent||'',image:!!miniLessonFarewell?.querySelector('img')?.src.startsWith('data:image/webp;base64,')});
 window.__labLessonRestore=()=>{
   const s=labLessonSaved;if(!s)throw Error('fixture missing');
   lastWeek=s.week;weekAlertConfirmed=s.confirmed;periods=s.times;lessonAlertSettings.enabled=s.effects;
   if(s.stored===null)localStorage.removeItem('class-periods');else localStorage.setItem('class-periods',s.stored);
   delete window.__labLessonClock;labLessonSaved=null;
 };
'@
$dashboardText=$dashboardText.Substring(0,$i)+$guard+$labLesson+[Environment]::NewLine+$dashboardText.Substring($j)
[IO.File]::WriteAllText($dashboardPath,$dashboardText,[Text.UTF8Encoding]::new($false))
$version='1.0.2903.40'
$zip=Join-Path $root 'sdk.zip'
Invoke-WebRequest -UseBasicParsing -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $zip
Expand-Archive $zip (Join-Path $root 'sdk')
$core=Get-ChildItem (Join-Path $root 'sdk/lib') -Recurse -Filter Microsoft.Web.WebView2.Core.dll | Where-Object {$_.Directory.Name -match '^net4'} | Select-Object -First 1
if(!$core){throw 'Missing .NET Framework SDK'}
$win=Join-Path $core.Directory.FullName 'Microsoft.Web.WebView2.WinForms.dll'
$loader=Get-ChildItem (Join-Path $root 'sdk') -Recurse -Filter WebView2Loader.dll | Where-Object {$_.FullName -match '[\\/]x64[\\/]'} | Select-Object -First 1
if(!$loader -or !(Test-Path $win)){throw 'Missing WebView2 dependencies'}
Copy-Item $core.FullName,$win,$loader.FullName $out
Copy-Item (Join-Path $PSScriptRoot 'mini-fixture.html') $out
Copy-Item (Join-Path $PSScriptRoot 'migration-transfer.js') $out
$realGame=Join-Path $out 'real-mini.html'
Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/xkdtndbrwk111-prog/hoja-minigames/51c195b9cd87a63c96944f547ad307e07d7eac40/index.html' -OutFile $realGame
if((git hash-object --no-filters $realGame).Trim() -ne '4f157000276a1633c9d90553bc6aac81e6980be8'){throw 'Real mini game Git blob hash mismatch'}
$csc="$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /codepage:65001 /target:winexe /platform:x64 "/out:$out\HOJA-WebView-Lab.exe" "/reference:$out\Microsoft.Web.WebView2.Core.dll" "/reference:$out\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'host.cs')
if($LASTEXITCODE -ne 0){throw 'Compilation failed'}
& $csc /nologo /codepage:65001 /target:winexe /platform:x64 /main:NativeBoardLaunch "/out:$out\HOJA-Native-Launch-Lab.exe" "/reference:$out\Microsoft.Web.WebView2.Core.dll" "/reference:$out\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'host.cs') (Join-Path $PSScriptRoot 'native-launch.cs') (Join-Path $PSScriptRoot 'native-share-input.cs')
if($LASTEXITCODE -ne 0){throw 'Native launcher compilation failed'}
$utf8=New-Object Text.UTF8Encoding($false)
$at=[DateTime]::UtcNow.ToString('o')
$seed=@('{"type":"LAB_SENTINEL"}',(@{type='setting';cls='LAB_CLASS';at=$at;enabled=$true;weeklyOn=$false;cap=20}|ConvertTo-Json -Compress),(@{type='grant';cls='LAB_CLASS';at=$at;id='lab1';name='LAB_STUDENT';amount=5;source='lab-seed'}|ConvertTo-Json -Compress),(@{type='grant';cls='LAB_CLASS';at=$at;id='lab2';name='LAB_STUDENT_TWO';amount=5;source='lab-seed'}|ConvertTo-Json -Compress))
[IO.File]::WriteAllText((Join-Path $runtime 'coins.log'),($seed -join [Environment]::NewLine)+[Environment]::NewLine,$utf8)
[IO.File]::WriteAllText((Join-Path $runtime 'seating.json'),'{"classId":"LAB_CLASS","className":"LAB_CLASS","students":[{"id":"lab1","name":"LAB_STUDENT"},{"id":"lab2","name":"LAB_STUDENT_TWO"}],"assignments":[{"studentId":"lab1","seatId":"s1"},{"studentId":"lab2","seatId":"s2"}],"layout":{"rows":1,"cols":2}}',$utf8)
$before=(Get-FileHash (Join-Path $runtime 'coins.log')).Hash
$seatBefore=(Get-FileHash (Join-Path $runtime 'seating.json')).Hash
$server=$null;$hostProc=$null
try{
 if(Get-NetTCPConnection -LocalPort 17449 -State Listen -ErrorAction SilentlyContinue){throw 'Lab port is occupied; refuse to stop or reuse it'}
 $psExe="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
 $server=Start-Process -FilePath $psExe -ArgumentList ('-NoProfile -NonInteractive -File "'+(Join-Path $runtime 'server.ps1')+'" -Port 17449') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'server-out.log') -RedirectStandardError (Join-Path $root 'server-err.log')
 $ready=$false
 for($i=0;$i -lt 60;$i++){
  if($server.HasExited){throw ('Lab server exited: '+(Get-Content (Join-Path $root 'server-err.log') -Raw))}
  try{$h=Invoke-RestMethod -Uri 'http://127.0.0.1:17449/health' -TimeoutSec 2
    if($h.service -eq 'teacher-tools-local' -and $h.release -eq '2026-11-25-V1.66.43-STABLE-PILOT'){$ready=$true;break}
  }catch{}
  Start-Sleep -Milliseconds 500
 }
 if(!$ready){throw 'Lab server readiness timeout'}
 $listener=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17449 -State Listen
 if($listener.OwningProcess -ne $server.Id){throw 'Lab port ownership mismatch'}
 $result=Join-Path $root 'result.txt'
 $profile=Join-Path $root 'profile'
 $hostProc=Start-Process -FilePath (Join-Path $out 'HOJA-WebView-Lab.exe') -ArgumentList ('--self-test "'+$profile+'" "'+$result+'"') -PassThru
 $readyPath=Join-Path $root 'manager.ready'
 for($i=0;$i -lt 240 -and !(Test-Path $readyPath);$i++){if($hostProc.HasExited){Get-Content (Join-Path $root 'real-game.trace') -ErrorAction SilentlyContinue;throw ('Native host exited: '+(Get-Content $result -ErrorAction SilentlyContinue))};Start-Sleep -Milliseconds 250}
 if(!(Test-Path $readyPath)){throw 'Manager handshake timed out'}
 if((Get-FileHash (Join-Path $runtime 'seating.json')).Hash -ne $seatBefore){throw 'Unexpected seating mutation before Phase 2B'}
 if(!(Test-Path (Join-Path $root 'real-game.pass'))){throw 'Real game verification missing'}
 Get-Content (Join-Path $root 'real-game.pass')
 Get-Content (Join-Path $root 'real-game.trace') -ErrorAction SilentlyContinue
 node (Join-Path $PSScriptRoot 'manager-test.cjs') $root
 if($LASTEXITCODE -ne 0){Get-Content (Join-Path $root 'server-err.log') -ErrorAction SilentlyContinue;throw 'Chrome manager test failed'}
 if(!$hostProc.WaitForExit(30000)){throw 'Native host timed out'}
 if(!(Test-Path $result)){throw ('Native host no result; exit '+$hostProc.ExitCode)}
 Get-Content $result
 if($hostProc.ExitCode -ne 0){throw 'Native host failed'}
 $events=@(Get-Content (Join-Path $runtime 'coins.log') -Encoding UTF8|ForEach-Object {$_|ConvertFrom-Json})
 if($events.Count -ne 15 -or @($events|Where-Object {$_.type -eq 'spend'}).Count -ne 5 -or @($events|Where-Object {$_.type -eq 'refund'}).Count -ne 5){throw 'Unexpected ledger contents'}
 $spends=@($events|Where-Object {$_.type -eq 'spend'})
 $refunds=@($events|Where-Object {$_.type -eq 'refund'})
 foreach($s in $spends){$matching=@($refunds|Where-Object {$_.charge -eq $s.charge -and $_.id -eq $s.id -and $_.amount -eq -$s.amount});if($matching.Count -ne 1){throw 'Refund must match charge, student and amount exactly once'}}
 $duo=@($spends|Group-Object charge|Where-Object {$_.Count -eq 2})
 # Disk ledger deliberately preserves legacy denomination (COIN_UNIT=2).
 # Validate exact raw amounts and the projected integer balances, not just row counts.
 if($duo.Count -ne 1){throw 'Expected one two-student charge'}
 $duoRows=@($duo[0].Group)
 $duoIds=@($duoRows|ForEach-Object {$_.id}|Sort-Object -Unique)
 if(($duoIds -join ',') -ne 'lab1,lab2' -or @($duoRows|Where-Object {$_.amount -ne -0.5}).Count -ne 0){throw ('Invalid duo raw spend: '+($duoRows|ConvertTo-Json -Compress))}
 $solo=@($spends|Group-Object charge|Where-Object {$_.Count -eq 1}|ForEach-Object {$_.Group})
 if($solo.Count -ne 3 -or @($solo|Where-Object {$_.id -ne 'lab1' -or $_.amount -ne -1}).Count -ne 0){throw 'Invalid fixture/solo/timed raw spend'}
 foreach($person in @(@{id='lab1';balance=14},@{id='lab2';balance=10})){
  $sum=($events|Where-Object {$_.cls -eq 'LAB_CLASS' -and $_.id -eq $person.id}|Measure-Object amount -Sum).Sum
  if(($sum*2) -ne $person.balance){throw ('Incorrect projected final balance: '+$person.id)}
 }
 Write-Host 'PASS disk denomination: solo -1 raw = -2 shown; duo -0.5 raw = -1 shown; both final balances exact'
 $finalSeat=Get-Content (Join-Path $runtime 'seating.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 if($finalSeat.classId -ne 'LAB_CLASS_2' -or @($finalSeat.students).Count -ne 2 -or @($finalSeat.assignments).Count -ne 2){throw 'Unexpected manager seating'}
 $offline=Invoke-RestMethod -Uri 'http://127.0.0.1:17449/api/board-status' -TimeoutSec 2
 if($offline.wallpaper){throw 'Closed host still reports connected'}
 # Native launcher is an independent executable, after all Phase 1/2 regression checks.
 $ledgerBeforeNative=(Get-FileHash (Join-Path $runtime 'coins.log')).Hash
 $seatBeforeNative=(Get-FileHash (Join-Path $runtime 'seating.json')).Hash
 $nativeExe=Join-Path $out 'HOJA-Native-Launch-Lab.exe'
 $nativeReady=Join-Path $root 'native-launch.ready'
 $nativeStop=Join-Path $root 'native-launch.stop'
 $nativeResult=Join-Path $root 'native-launch.result'
 foreach($mode in @('window','wallpaper','window')){
  Remove-Item $nativeReady,$nativeStop,$nativeResult -Force -ErrorAction SilentlyContinue
  $native=$null;$duplicate=$null
  try{
   $native=Start-Process -FilePath $nativeExe -ArgumentList "--lab-launch $mode" -PassThru
   for($i=0;$i -lt 120 -and !(Test-Path $nativeReady);$i++){if($native.HasExited){throw ('Native launch exited: '+$native.ExitCode+' '+(Get-Content $nativeResult -ErrorAction SilentlyContinue))};Start-Sleep -Milliseconds 250}
   if(!(Test-Path $nativeReady)){throw 'Native launcher readiness timeout'}
   $modePath=Join-Path $runtime 'board-mode.json'
   $info=Get-Content $modePath -Raw|ConvertFrom-Json
   if($info.pid -ne $native.Id -or $info.mode -ne $mode -or $info.window -le 0 -or $info.release -ne '2026-11-25-V1.66.43-STABLE-PILOT'){throw 'Native mode ownership mismatch'}
   $beat=(Get-Item $modePath).LastWriteTimeUtc
   $duplicate=Start-Process -FilePath $nativeExe -ArgumentList "--lab-launch $mode" -PassThru
   if(!$duplicate.WaitForExit(10000) -or $duplicate.ExitCode -ne 3){throw 'Native duplicate was not rejected'}
   Start-Sleep -Milliseconds 1600
   if((Get-Item $modePath).LastWriteTimeUtc -le $beat){throw 'Native heartbeat did not refresh'}
   $online=Invoke-RestMethod -Uri 'http://127.0.0.1:17449/api/board-status' -TimeoutSec 2
   if(!$online.wallpaper){throw 'Native host not connected'}
   Set-Content $nativeStop 'stop' -Encoding ASCII
   if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Native launcher close failed'}
   Get-Content $nativeResult
   if(Test-Path $modePath){throw 'Owned heartbeat not removed'}
   $offline=Invoke-RestMethod -Uri 'http://127.0.0.1:17449/api/board-status' -TimeoutSec 2
   if($offline.wallpaper){throw 'Native launcher still connected'}
   if($server.HasExited){throw 'Existing server unexpectedly stopped'}
   Write-Host "PASS native $mode launch, duplicate lock, heartbeat, disconnect and restart"
  }finally{
   if($duplicate -and !$duplicate.HasExited){$duplicate.Kill();$duplicate.WaitForExit()}
   if($native -and !$native.HasExited){$native.Kill();$native.WaitForExit()}
  }
 }
 # 3D-1 logical migration feasibility on isolated real Chrome and Edge profiles.
 foreach($source in @('chrome','edge')){
  node (Join-Path $PSScriptRoot 'migration-source.cjs') $root $source
  if($LASTEXITCODE -ne 0){throw 'Source browser transfer failed'}
  $snapshot=Join-Path $root "migration-$source.json"
  $snapshotHash=(Get-FileHash $snapshot).Hash
  # Interrupted import must never become the chosen profile.
  $marker=Join-Path $root "migration-$source.done"
  $interrupt=Join-Path $root "migration-$source.interrupt"
  $interrupted=Join-Path $root "migration-$source.interrupted"
  Remove-Item $nativeReady,$nativeStop,$nativeResult -Force -ErrorAction SilentlyContinue
  Set-Content $interrupt 'interrupt' -Encoding ASCII
  $broken=Start-Process -FilePath $nativeExe -ArgumentList "--lab-launch-migrate window $source" -PassThru
  try{
   if(!$broken.WaitForExit(180000)){throw 'Interrupted migration timeout'}
   if($broken.ExitCode -eq 0 -or !(Test-Path $interrupted) -or (Test-Path $marker) -or (Test-Path $nativeReady)){throw 'Interrupted migration published readiness or committed'}
   $discarded=(Get-Content $interrupted -Raw).Trim()
   if(!(Test-Path (Join-Path $root $discarded))){throw 'Interrupted staging profile missing'}
   if((Get-FileHash $snapshot).Hash -ne $snapshotHash){throw 'Interrupted migration changed export'}
   Write-Host "PASS $source interrupted migration did not commit"
  }finally{
   Remove-Item $interrupt -Force -ErrorAction SilentlyContinue
   if(!$broken.HasExited){$broken.Kill();$broken.WaitForExit()}
  }
  $committed=''
  foreach($round in @(1,2)){
   Remove-Item $nativeReady,$nativeStop,$nativeResult -Force -ErrorAction SilentlyContinue
   $native=$null
   try{
    $native=Start-Process -FilePath $nativeExe -ArgumentList "--lab-launch-migrate window $source" -PassThru
    for($i=0;$i -lt 720 -and !(Test-Path $nativeReady);$i++){if($native.HasExited){throw ('Migration native exited: '+(Get-Content $nativeResult -ErrorAction SilentlyContinue))};Start-Sleep -Milliseconds 250}
    if(!(Test-Path $nativeReady)){throw 'Migration startup timeout'}
    if(!(Test-Path $marker)){throw 'Verified migration missing commit marker'}
    $chosen=(Get-Content $marker -Raw).Trim()
    if($chosen -eq $discarded){throw 'Interrupted profile reused'}
    if($round -eq 1){$committed=$chosen}
    if($round -eq 2 -and $chosen -ne $committed){throw 'Committed profile changed'}
    if((Get-Content (Join-Path $root "migration-$source.attempt") -Raw).Trim() -ne $chosen){throw 'Wrong committed profile selected'}
    $chunkCount=[int](Get-Content (Join-Path $root "migration-$source.chunks") -Raw)
    $binaryCount=[int](Get-Content (Join-Path $root "migration-$source.binary-count") -Raw)
    if($source -eq 'chrome' -and $round -eq 1 -and $binaryCount -lt 65){throw 'Large migration binary chunks missing'}
    if($round -eq 2 -and $binaryCount -ne 0){throw 'Committed profile unexpectedly fetched old media'}
    if((Get-Item $snapshot).Length -gt 1048576){throw 'Media bytes leaked into manifest'}
    Write-Host "PASS $source manifest chunks=$chunkCount binary requests=$binaryCount"
    $report=Get-Content (Join-Path $root "migration-$source.result") -Raw
    if($round -eq 1 -and $report -ne 'PASS exact import and readback'){throw 'First import missing'}
    if($round -eq 2 -and $report -ne 'PASS repeated launch preserves user edit and IndexedDB blobs'){throw 'Repeated import overwrote edits'}
    Write-Host "$source $report"
    Set-Content $nativeStop 'stop' -Encoding ASCII
    if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Migration native close failed'}
   }finally{if($native -and !$native.HasExited){$native.Kill();$native.WaitForExit()}}
  }
  if((Get-FileHash $snapshot).Hash -ne $snapshotHash){throw 'Source export was modified'}
  Write-Host "PASS $source retry chose fresh profile; subsequent launch reused committed profile"
  # Explicit cleanup prototype: refuse traversal, preserve committed profile and legacy source.
  $cleanup=Join-Path $PSScriptRoot 'migration-cleanup.cjs'
  $chosenMarker=Get-Content $marker -Raw
  $badOut=Join-Path $root "migration-$source-invalid-cleanup.out"
  $badErr=Join-Path $root "migration-$source-invalid-cleanup.err"
  try{
   Set-Content $marker '..\migration-legacy' -Encoding ASCII
   # Windows PowerShell 5.1 treats stderr as NativeCommandError under Stop.
   # Read the deliberate rejection from the exact child exit code and stderr file.
   $bad=Start-Process -FilePath (Get-Command node -ErrorAction Stop).Source -ArgumentList ('"{0}" "{1}" {2}' -f $cleanup,$root,$source) -RedirectStandardOutput $badOut -RedirectStandardError $badErr -Wait -PassThru -NoNewWindow
   if($bad.ExitCode -ne 1 -or (Get-Content $badErr -Raw) -notmatch 'invalid profile selection' -or !(Test-Path $snapshot)){throw 'Unsafe cleanup marker rejection failed'}
   Write-Host "PASS $source unsafe cleanup marker rejected"
  }finally{[IO.File]::WriteAllText($marker,$chosenMarker)}
  node $cleanup $root $source
  if($LASTEXITCODE -ne 0){throw 'Migration cleanup failed'}
  if((Test-Path $snapshot) -or (Test-Path (Join-Path $root "migration-$source-blobs")) -or (Test-Path (Join-Path $root $discarded)) -or !(Test-Path (Join-Path $root $committed))){throw 'Cleanup postcondition'}
  Remove-Item $nativeReady,$nativeStop,$nativeResult -Force -ErrorAction SilentlyContinue
  $native=Start-Process -FilePath $nativeExe -ArgumentList "--lab-launch-migrate window $source" -PassThru
  try{
   for($i=0;$i -lt 160 -and !(Test-Path $nativeReady);$i++){if($native.HasExited){throw ('Cleaned profile exited: '+(Get-Content $nativeResult -ErrorAction SilentlyContinue))};Start-Sleep -Milliseconds 250}
   if(!(Test-Path $nativeReady)){throw 'Cleaned profile startup timeout'}
   if((Get-Content (Join-Path $root "migration-$source.result") -Raw) -ne 'PASS committed profile starts without transfer files'){throw 'Clean launch failed'}
   if((Get-Content (Join-Path $root "migration-$source.binary-count") -Raw) -ne '0'){throw 'Cleaned profile fetched old data'}
   Set-Content $nativeStop 'stop' -Encoding ASCII
   if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Cleaned profile close failed'}
   Write-Host "PASS $source committed dashboard and edited memo start after transfer cleanup"
  }finally{if(!$native.HasExited){$native.Kill();$native.WaitForExit()}}
 }
 # 3E-1a: actual crash with an externally managed service; never stop a foreign live owner.
 $modePath=Join-Path $runtime 'board-mode.json'
 $proofPath=Join-Path $runtime 'native-mode-owner.json'
 $foreignMode=(@{mode='window';window=1;pid=$PID;release='2026-11-25-V1.66.43-STABLE-PILOT'}|ConvertTo-Json -Compress)
 [IO.File]::WriteAllText($modePath,$foreignMode)
 try{
  $attempt=Start-Process -FilePath $nativeExe -ArgumentList '--lab-launch window' -PassThru
  if(!$attempt.WaitForExit(10000) -or $attempt.ExitCode -ne 4 -or (Get-Content $modePath -Raw) -ne $foreignMode){throw 'Unowned heartbeat recovery was not refused'}
  [IO.File]::WriteAllText($proofPath,$foreignMode)
  $attempt=Start-Process -FilePath $nativeExe -ArgumentList '--lab-launch window' -PassThru
  if(!$attempt.WaitForExit(10000) -or $attempt.ExitCode -ne 4 -or (Get-Content $modePath -Raw) -ne $foreignMode){throw 'Live owner recovery was not refused'}
  Write-Host 'PASS unowned and live PID mode metadata preserved'
 }finally{Remove-Item $modePath,$proofPath -Force -ErrorAction SilentlyContinue}
 Remove-Item $nativeReady,$nativeStop,$nativeResult -Force -ErrorAction SilentlyContinue
 $crashed=Start-Process -FilePath $nativeExe -ArgumentList '--lab-launch window' -PassThru
 try{
  for($i=0;$i -lt 160 -and !(Test-Path $nativeReady);$i++){if($crashed.HasExited){throw 'Crash fixture start failed'};Start-Sleep -Milliseconds 250}
  if(!(Test-Path $nativeReady) -or !(Test-Path $proofPath)){throw 'Crash fixture not ready'}
  $oldMode=Get-Content $modePath -Raw
  if((Get-Content $proofPath -Raw) -ne $oldMode){throw 'Ownership proof mismatch'}
  $crashed.Kill();$crashed.WaitForExit()
  if(!(Test-Path $modePath) -or !(Test-Path $proofPath)){throw 'Crash fixture unexpectedly removed heartbeat'}
  Remove-Item $nativeReady,$nativeStop,$nativeResult -Force -ErrorAction SilentlyContinue
  $restarted=Start-Process -FilePath $nativeExe -ArgumentList '--lab-launch window' -PassThru
  try{
   for($i=0;$i -lt 160 -and !(Test-Path $nativeReady);$i++){if($restarted.HasExited){throw ('Crash restart failed '+$restarted.ExitCode+' '+(Get-Content $nativeResult -ErrorAction SilentlyContinue))};Start-Sleep -Milliseconds 250}
   if(!(Test-Path $nativeReady)){throw 'Crash restart timeout'}
   $current=Get-Content $modePath -Raw|ConvertFrom-Json
   if($current.pid -ne $restarted.Id -or $current.pid -eq $crashed.Id){throw 'Stale mode reused'}
   if($server.HasExited -or (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17449 -State Listen).OwningProcess -ne $server.Id){throw 'External service changed during restart'}
   Set-Content $nativeStop 'stop' -Encoding ASCII
   if(!$restarted.WaitForExit(10000) -or $restarted.ExitCode -ne 0 -or (Test-Path $modePath) -or (Test-Path $proofPath)){throw 'Recovered native close failed'}
   Write-Host 'PASS actual killed native host recovered dead owned heartbeat, external server preserved'
  }finally{if(!$restarted.HasExited){$restarted.Kill();$restarted.WaitForExit()}}
 }finally{if(!$crashed.HasExited){$crashed.Kill();$crashed.WaitForExit()}}
 # 3B: refuse ownership of the existing healthy service, then start/stop the real isolated service natively.
 Remove-Item $nativeReady,$nativeStop,$nativeResult -Force -ErrorAction SilentlyContinue
 $attempt=Start-Process -FilePath $nativeExe -ArgumentList '--lab-launch-owned window' -PassThru
 if(!$attempt.WaitForExit(10000) -or $attempt.ExitCode -ne 1 -or $server.HasExited -or (Test-Path $nativeReady)){throw 'Existing service ownership rejection failed'}
 if((Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17449 -State Listen).OwningProcess -ne $server.Id){throw 'Existing listener changed'}
 Write-Host 'PASS native launcher refuses existing healthy service, leaves it running'
 $server.Kill();$server.WaitForExit()
 for($i=0;$i -lt 80 -and (Get-NetTCPConnection -LocalPort 17449 -State Listen -ErrorAction SilentlyContinue);$i++){Start-Sleep -Milliseconds 250}
 if(Get-NetTCPConnection -LocalPort 17449 -State Listen -ErrorAction SilentlyContinue){throw 'Previous test server still listening'}
 $foreign=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,17449)
 try{
  $foreign.Start()
  Remove-Item $nativeReady,$nativeStop,$nativeResult -Force -ErrorAction SilentlyContinue
  $attempt=Start-Process -FilePath $nativeExe -ArgumentList '--lab-launch-owned window' -PassThru
  if(!$attempt.WaitForExit(10000) -or $attempt.ExitCode -ne 1 -or (Test-Path $nativeReady)){throw 'Foreign listener rejection failed'}
  if((Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17449 -State Listen).OwningProcess -ne $PID){throw 'Foreign listener changed'}
  Write-Host 'PASS occupied unrelated port refused without killing listener'
 }finally{$foreign.Stop()}
 foreach($mode in @('window','wallpaper')){
  $pidFile=Join-Path $root 'native-server.pid'
  Remove-Item $nativeReady,$nativeStop,$nativeResult,$pidFile -Force -ErrorAction SilentlyContinue
  $native=$null;$owned=$null
  try{
   $native=Start-Process -FilePath $nativeExe -ArgumentList "--lab-launch-owned $mode" -PassThru
   for($i=0;$i -lt 180 -and !(Test-Path $nativeReady);$i++){if($native.HasExited){Get-Content (Join-Path $root 'native-server-err.log') -ErrorAction SilentlyContinue;throw ('Owned launch exited: '+$native.ExitCode+' '+(Get-Content $nativeResult -ErrorAction SilentlyContinue))};Start-Sleep -Milliseconds 250}
   if(!(Test-Path $nativeReady) -or !(Test-Path $pidFile)){throw 'Owned launcher timeout'}
   $ownedId=[int](Get-Content $pidFile -Raw)
   $owned=Get-Process -Id $ownedId -ErrorAction Stop
   $null=$owned.Handle
   if((Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17449 -State Listen).OwningProcess -ne $ownedId){throw 'Owned server listener PID mismatch'}
   $health=Invoke-RestMethod -Uri 'http://127.0.0.1:17449/health' -TimeoutSec 2
   if($health.service -ne 'teacher-tools-local' -or $health.release -ne '2026-11-25-V1.66.43-STABLE-PILOT'){throw 'Owned health mismatch'}
   $online=Invoke-RestMethod -Uri 'http://127.0.0.1:17449/api/board-status' -TimeoutSec 2
   if(!$online.wallpaper){throw 'Owned board not connected'}
   if($mode -eq 'wallpaper'){
    $shareStatus=Join-Path $runtime 'share-input-status.json'
    $shareUri='http://127.0.0.1:17449/api/share-input'
    $headers=@{'Sec-Fetch-Site'='same-origin'}
    foreach($options in @(@{keyboard=$false;cursor=$false},@{keyboard=$true;cursor=$false},@{keyboard=$false;cursor=$true},@{keyboard=$false;cursor=$false})){
     # Existing /api/share-input contract accepts UTF-8 JSON encoded as ASCII Base64.
     $encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($options|ConvertTo-Json -Compress)))
     $posted=Invoke-RestMethod -Method Post -Uri $shareUri -Headers $headers -ContentType 'text/plain' -Body $encoded
     $saved=Invoke-RestMethod -Uri $shareUri -TimeoutSec 2
     if($saved.keyboard -ne $options.keyboard -or $saved.cursor -ne $options.cursor){throw 'Share input API readback mismatch'}
     if($posted.keyboard -ne $options.keyboard -or $posted.cursor -ne $options.cursor){throw 'Share input API settings mismatch'}
     $wantHook=$options.keyboard -or $options.cursor
     $ok=$false
     for($i=0;$i -lt 30;$i++){
      try{
       $st=Get-Content $shareStatus -Raw|ConvertFrom-Json
       $api=Invoke-RestMethod -Uri ($shareUri+'/status') -TimeoutSec 2
       if($st.pid -eq $native.Id -and $st.keyboard -eq $options.keyboard -and $st.cursor -eq $options.cursor -and $st.hook -eq $wantHook -and $api.running -and $api.hook -eq $wantHook){$ok=$true;break}
      }catch{}
      Start-Sleep -Milliseconds 200
     }
     if(!$ok){Get-Content (Join-Path $runtime 'share-input.log') -ErrorAction SilentlyContinue;throw 'Native share input option/hook state not applied'}
     Write-Host "PASS native share input keyboard=$($options.keyboard) cursor=$($options.cursor) hook=$wantHook"
    }
    $restart=Invoke-RestMethod -Method Post -Uri ($shareUri+'/restart') -Headers $headers -ContentType 'application/json' -Body '{}'
    if(!$restart.ok){throw 'Share input restart status failed'}
    $st=Get-Content $shareStatus -Raw|ConvertFrom-Json
    if($st.pid -ne $native.Id){throw 'Share helper PID changed'}
   }
   Set-Content $nativeStop 'stop' -Encoding ASCII
   if(!$native.WaitForExit(20000) -or $native.ExitCode -ne 0){throw 'Owned native close failed'}
   if(!$owned.WaitForExit(10000)){throw 'Owned service survived normal close'}
   if(Test-Path (Join-Path $runtime 'board-mode.json')){throw 'Owned heartbeat not removed'}
   if(Test-Path (Join-Path $runtime 'share-input-status.json')){throw 'Native share input status survived close'}
   if(Get-NetTCPConnection -LocalPort 17449 -State Listen -ErrorAction SilentlyContinue){throw 'Owned server listener not released'}
   Write-Host "PASS native $mode owns service lifecycle, health, exact listener, cleanup and restart"
  }finally{
   if($native -and !$native.HasExited){$native.Kill();$native.WaitForExit()}
   if($owned -and !$owned.HasExited){$owned.Kill();$owned.WaitForExit()}
  }
 }
 # 3E-1b: crash the real owned host, verify its exact child dies, then restart.
 foreach($cut in @('host','server')){
  $native=$null;$owned=$null
  Remove-Item $nativeReady,$nativeStop,$nativeResult,$pidFile -Force -ErrorAction SilentlyContinue
  try{
   $native=Start-Process -FilePath $nativeExe -ArgumentList '--lab-launch-owned window' -PassThru
   for($i=0;$i -lt 180 -and !(Test-Path $nativeReady);$i++){if($native.HasExited){throw ('Crash pair launch failed: '+(Get-Content $nativeResult -ErrorAction SilentlyContinue))};Start-Sleep -Milliseconds 250}
   if(!(Test-Path $nativeReady) -or !(Test-Path $pidFile)){throw 'Crash pair not ready'}
   $owned=Get-Process -Id ([int](Get-Content $pidFile -Raw)) -ErrorAction Stop
   $null=$owned.Handle
   if((Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17449 -State Listen).OwningProcess -ne $owned.Id){throw 'Crash pair listener mismatch'}
   if($cut -eq 'host'){
    $native.Kill();$native.WaitForExit()
    if(!$owned.WaitForExit(15000)){throw 'Owned service survived host crash'}
    if(!(Test-Path $modePath)){throw 'Crash heartbeat not retained for recovery'}
    Write-Host 'PASS killed host closes exact owned service via job'
   }else{
    $owned.Kill();$owned.WaitForExit()
    if(!$native.WaitForExit(15000) -or $native.ExitCode -ne 1 -or (Get-Content $nativeResult -Raw) -notmatch 'owned server exited'){throw 'Host did not detect service crash'}
    if((Test-Path $modePath) -or (Test-Path $proofPath)){throw 'Server crash left live heartbeat'}
    Write-Host 'PASS killed owned service closes host and clears heartbeat'
   }
   for($i=0;$i -lt 80 -and (Get-NetTCPConnection -LocalPort 17449 -State Listen -ErrorAction SilentlyContinue);$i++){Start-Sleep -Milliseconds 250}
   if(Get-NetTCPConnection -LocalPort 17449 -State Listen -ErrorAction SilentlyContinue){throw 'Crash pair port still occupied'}
  }finally{
   if($native -and !$native.HasExited){$native.Kill();$native.WaitForExit()}
   if($owned -and !$owned.HasExited){$owned.Kill();$owned.WaitForExit()}
  }
 }
 Remove-Item $nativeReady,$nativeStop,$nativeResult,$pidFile -Force -ErrorAction SilentlyContinue
 $native=$null;$owned=$null
 try{
  $native=Start-Process -FilePath $nativeExe -ArgumentList '--lab-launch-owned window' -PassThru
  for($i=0;$i -lt 180 -and !(Test-Path $nativeReady);$i++){if($native.HasExited){throw 'Post-crash restart exited'};Start-Sleep -Milliseconds 250}
  if(!(Test-Path $nativeReady) -or !(Test-Path $pidFile)){throw 'Post-crash restart timeout'}
  $owned=Get-Process -Id ([int](Get-Content $pidFile -Raw)) -ErrorAction Stop
  $null=$owned.Handle
  if((Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17449 -State Listen).OwningProcess -ne $owned.Id){throw 'Post-crash restart wrong listener'}
  if(!(Invoke-RestMethod -Uri 'http://127.0.0.1:17449/api/board-status' -TimeoutSec 2).wallpaper){throw 'Post-crash board not connected'}
  Set-Content $nativeStop 'stop' -Encoding ASCII
  if(!$native.WaitForExit(20000) -or $native.ExitCode -ne 0 -or !$owned.WaitForExit(10000)){throw 'Post-crash normal close failed'}
  Write-Host 'PASS native owned host and service restart after both crash modes'
 }finally{
  if($native -and !$native.HasExited){$native.Kill();$native.WaitForExit()}
  if($owned -and !$owned.HasExited){$owned.Kill();$owned.WaitForExit()}
 }
 # 3E-2a: existing R8 ready.json contract, isolated synthetic journal only.
 $tx=Join-Path $runtime 'r8-transaction'
 if(Test-Path $tx){throw 'Unexpected transaction fixture'}
 New-Item -ItemType Directory -Path $tx|Out-Null
 $pending=Join-Path $tx 'pending.json';$updateReady=Join-Path $tx 'ready.json'
 $token=[guid]::NewGuid().ToString('N')
 $wrong=[guid]::NewGuid().ToString('N')
 $releaseHash=(Get-FileHash (Join-Path $runtime 'release.json') -Algorithm SHA256).Hash.ToLowerInvariant()
 $journal=@{schema=1;token=$token;version='1.66.43';files=@(@{name='release.json';before='';after=$releaseHash})}
 try{
  foreach($case in @('missing','wrong-token','wrong-version','already-ready')){
   Remove-Item $pending,$updateReady,$nativeReady,$nativeStop,$nativeResult -Force -ErrorAction SilentlyContinue
   if($case -ne 'missing'){
    $journal.version=if($case -eq 'wrong-version'){'1.66.44'}else{'1.66.43'}
    [IO.File]::WriteAllText($pending,($journal|ConvertTo-Json -Depth 5 -Compress))
   }
   if($case -eq 'already-ready'){[IO.File]::WriteAllText($updateReady,'sentinel')}
   $argToken=if($case -eq 'wrong-token'){$wrong}else{$token}
   $attempt=Start-Process -FilePath $nativeExe -ArgumentList "--lab-launch-update window $argToken" -PassThru
   if(!$attempt.WaitForExit(15000) -or $attempt.ExitCode -ne 1 -or (Test-Path $nativeReady)){throw "Update gate did not reject $case"}
   if($case -eq 'already-ready'){if((Get-Content $updateReady -Raw) -ne 'sentinel'){throw 'Ready marker overwritten'}}
   elseif(Test-Path $updateReady){throw 'Invalid update published ready'}
   if(Get-NetTCPConnection -LocalPort 17449 -State Listen -ErrorAction SilentlyContinue){throw 'Invalid update started server'}
   Write-Host "PASS native update ready rejection $case"
  }
  Remove-Item $updateReady,$nativeReady,$nativeStop,$nativeResult,$pidFile -Force -ErrorAction SilentlyContinue
  $journal.version='1.66.43'
  [IO.File]::WriteAllText($pending,($journal|ConvertTo-Json -Depth 5 -Compress))
  $journalHash=(Get-FileHash $pending).Hash
  $native=$null;$owned=$null
  try{
   $native=Start-Process -FilePath $nativeExe -ArgumentList "--lab-launch-update window $token" -PassThru
   for($i=0;$i -lt 180 -and !(Test-Path $nativeReady);$i++){if($native.HasExited){throw ('Update launch failed: '+(Get-Content $nativeResult -ErrorAction SilentlyContinue))};Start-Sleep -Milliseconds 250}
   if(!(Test-Path $nativeReady) -or !(Test-Path $updateReady) -or !(Test-Path $pidFile)){throw 'Update readiness missing'}
   $owned=Get-Process -Id ([int](Get-Content $pidFile -Raw)) -ErrorAction Stop
   $null=$owned.Handle
   $receipt=Get-Content $updateReady -Raw|ConvertFrom-Json
   $health=Invoke-RestMethod -Uri 'http://127.0.0.1:17449/health' -TimeoutSec 2
   if($receipt.token -cne $token -or $receipt.release -cne $health.release -or $health.release -cne '2026-11-25-V1.66.43-STABLE-PILOT' -or !(Invoke-RestMethod -Uri 'http://127.0.0.1:17449/api/board-status' -TimeoutSec 2).wallpaper){throw 'Update readiness receipt invalid'}
   if((Get-FileHash $pending).Hash -ne $journalHash){throw 'Launcher changed updater journal'}
   Set-Content $nativeStop 'stop' -Encoding ASCII
   if(!$native.WaitForExit(20000) -or $native.ExitCode -ne 0 -or !$owned.WaitForExit(10000)){throw 'Update launch normal close failed'}
   Write-Host 'PASS native R8 token and release receipt after actual dashboard and service readiness'
  }finally{
   if($native -and !$native.HasExited){$native.Kill();$native.WaitForExit()}
   if($owned -and !$owned.HasExited){$owned.Kill();$owned.WaitForExit()}
  }
 }finally{Remove-Item -LiteralPath $tx -Recurse -Force}
 & (Join-Path $PSScriptRoot 'signed-native-package.ps1') -LabRoot $root -Runtime $runtime -Build $out -Kernel (Join-Path $PSScriptRoot '../../reviewed-kernel/tools/r8-updater/runtime/r8-kernel.ps1')
 & (Join-Path $PSScriptRoot 'installed-native-rollback.ps1') -LabRoot $root -Runtime $runtime -Build $out -Kernel (Join-Path $PSScriptRoot '../../reviewed-kernel/tools/r8-updater/runtime/r8-kernel.ps1')
 & (Join-Path $PSScriptRoot 'installed-native-rollback.ps1') -LabRoot $root -Runtime $runtime -Build $out -Kernel (Join-Path $PSScriptRoot '../../reviewed-kernel/tools/r8-updater/runtime/r8-kernel.ps1') -Bootstrap
 & (Join-Path $PSScriptRoot 'native-server-read-test.ps1') -LabRoot $root -Runtime $runtime -Build $out
 if((Get-FileHash (Join-Path $runtime 'coins.log')).Hash -ne $ledgerBeforeNative -or (Get-FileHash (Join-Path $runtime 'seating.json')).Hash -ne $seatBeforeNative){throw 'Native launcher changed classroom data'}
 Write-Host "PASS isolated ledger: exact fixture and solo/duo/timed spends and matched per-student refunds; Phase 2A/2C seat unchanged; Phase 2B exact manager seat; host bytes=$((Get-ChildItem $out -File | Where-Object {$_.Extension -in '.exe','.dll'} | Measure-Object Length -Sum).Sum)"
}finally{
 if($hostProc -and !$hostProc.HasExited){$hostProc.Kill();$hostProc.WaitForExit()}
 if($server -and !$server.HasExited){$server.Kill();$server.WaitForExit()}
 $env:LOCALAPPDATA=$originalLocal
}
