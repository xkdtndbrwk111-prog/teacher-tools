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
$realGame=Join-Path $out 'real-mini.html'
Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/xkdtndbrwk111-prog/hoja-minigames/51c195b9cd87a63c96944f547ad307e07d7eac40/index.html' -OutFile $realGame
if((git hash-object --no-filters $realGame).Trim() -ne '4f157000276a1633c9d90553bc6aac81e6980be8'){throw 'Real mini game Git blob hash mismatch'}
$csc="$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /codepage:65001 /target:winexe /platform:x64 "/out:$out\HOJA-WebView-Lab.exe" "/reference:$out\Microsoft.Web.WebView2.Core.dll" "/reference:$out\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'host.cs')
if($LASTEXITCODE -ne 0){throw 'Compilation failed'}
& $csc /nologo /codepage:65001 /target:winexe /platform:x64 /main:NativeBoardLaunch "/out:$out\HOJA-Native-Launch-Lab.exe" "/reference:$out\Microsoft.Web.WebView2.Core.dll" "/reference:$out\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'host.cs') (Join-Path $PSScriptRoot 'native-launch.cs')
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
   Set-Content $nativeStop 'stop' -Encoding ASCII
   if(!$native.WaitForExit(20000) -or $native.ExitCode -ne 0){throw 'Owned native close failed'}
   if(!$owned.WaitForExit(10000)){throw 'Owned service survived normal close'}
   if(Test-Path (Join-Path $runtime 'board-mode.json')){throw 'Owned heartbeat not removed'}
   if(Get-NetTCPConnection -LocalPort 17449 -State Listen -ErrorAction SilentlyContinue){throw 'Owned server listener not released'}
   Write-Host "PASS native $mode owns service lifecycle, health, exact listener, cleanup and restart"
  }finally{
   if($native -and !$native.HasExited){$native.Kill();$native.WaitForExit()}
   if($owned -and !$owned.HasExited){$owned.Kill();$owned.WaitForExit()}
  }
 }
 if((Get-FileHash (Join-Path $runtime 'coins.log')).Hash -ne $ledgerBeforeNative -or (Get-FileHash (Join-Path $runtime 'seating.json')).Hash -ne $seatBeforeNative){throw 'Native launcher changed classroom data'}
 Write-Host "PASS isolated ledger: exact fixture and solo/duo/timed spends and matched per-student refunds; Phase 2A/2C seat unchanged; Phase 2B exact manager seat; host bytes=$((Get-ChildItem $out -File | Where-Object {$_.Extension -in '.exe','.dll'} | Measure-Object Length -Sum).Sum)"
}finally{
 if($hostProc -and !$hostProc.HasExited){$hostProc.Kill();$hostProc.WaitForExit()}
 if($server -and !$server.HasExited){$server.Kill();$server.WaitForExit()}
 $env:LOCALAPPDATA=$originalLocal
}
