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
 if($events.Count -ne 13 -or @($events|Where-Object {$_.type -eq 'spend'}).Count -ne 4 -or @($events|Where-Object {$_.type -eq 'refund'}).Count -ne 4){throw 'Unexpected ledger contents'}
 $spends=@($events|Where-Object {$_.type -eq 'spend'})
 $refunds=@($events|Where-Object {$_.type -eq 'refund'})
 foreach($s in $spends){$matching=@($refunds|Where-Object {$_.charge -eq $s.charge -and $_.id -eq $s.id -and $_.amount -eq -$s.amount});if($matching.Count -ne 1){throw 'Refund must match charge, student and amount exactly once'}}
 $duo=@($spends|Group-Object charge|Where-Object {$_.Count -eq 2})
 if($duo.Count -ne 1 -or @($duo[0].Group|Where-Object {$_.amount -ne -1}).Count -ne 0 -or @($duo[0].Group.id|Sort-Object -Unique).Count -ne 2){throw 'Duo charge must spend one coin per distinct student'}
 $finalSeat=Get-Content (Join-Path $runtime 'seating.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 if($finalSeat.classId -ne 'LAB_CLASS_2' -or @($finalSeat.students).Count -ne 2 -or @($finalSeat.assignments).Count -ne 2){throw 'Unexpected manager seating'}
 $offline=Invoke-RestMethod -Uri 'http://127.0.0.1:17449/api/board-status' -TimeoutSec 2
 if($offline.wallpaper){throw 'Closed host still reports connected'}
 Write-Host "PASS isolated ledger: exact fixture and solo/duo spends and matched per-student refunds; Phase 2A/2C seat unchanged; Phase 2B exact manager seat; host bytes=$((Get-ChildItem $out -File | Where-Object {$_.Extension -in '.exe','.dll'} | Measure-Object Length -Sum).Sum)"
}finally{
 if($hostProc -and !$hostProc.HasExited){$hostProc.Kill();$hostProc.WaitForExit()}
 if($server -and !$server.HasExited){$server.Kill();$server.WaitForExit()}
 $env:LOCALAPPDATA=$originalLocal
}
