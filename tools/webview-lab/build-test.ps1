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
$csc="$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /codepage:65001 /target:winexe /platform:x64 "/out:$out\HOJA-WebView-Lab.exe" "/reference:$out\Microsoft.Web.WebView2.Core.dll" "/reference:$out\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'host.cs')
if($LASTEXITCODE -ne 0){throw 'Compilation failed'}
$utf8=New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $runtime 'coins.log'),'{"type":"LAB_SENTINEL"}'+[Environment]::NewLine,$utf8)
[IO.File]::WriteAllText((Join-Path $runtime 'seating.json'),'{"students":[{"name":"LAB_STUDENT"}],"assignments":{},"layout":{}}',$utf8)
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
 if(!$hostProc.WaitForExit(110000)){throw 'Native host timed out'}
 if(!(Test-Path $result)){throw ('Native host no result; exit '+$hostProc.ExitCode)}
 Get-Content $result
 if($hostProc.ExitCode -ne 0){throw 'Native host failed'}
 if((Get-FileHash (Join-Path $runtime 'coins.log')).Hash -ne $before -or (Get-FileHash (Join-Path $runtime 'seating.json')).Hash -ne $seatBefore){throw 'Unexpected isolated data mutation'}
 Write-Host "PASS isolated data unchanged; host bytes=$((Get-ChildItem $out -File | Measure-Object Length -Sum).Sum)"
}finally{
 if($hostProc -and !$hostProc.HasExited){$hostProc.Kill();$hostProc.WaitForExit()}
 if($server -and !$server.HasExited){$server.Kill();$server.WaitForExit()}
 $env:LOCALAPPDATA=$originalLocal
}
