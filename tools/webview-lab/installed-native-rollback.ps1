param([string]$LabRoot,[string]$Runtime,[string]$Build,[string]$Kernel,[switch]$Bootstrap)
$ErrorActionPreference='Stop'
if((Split-Path $LabRoot -Leaf) -notmatch '^hoja-webview-lab-[a-f0-9]{32}$'){throw 'Not an isolated lab'}
. $Kernel
$root=Join-Path $LabRoot ('hoja-webview-lab-'+[guid]::NewGuid().ToString('N'))
$local=Join-Path $root 'local'
$test=Join-Path $local 'TeacherToolsLocal'
New-Item -ItemType Directory -Path $test -Force|Out-Null
$names=@('HOJA-Native-Launch-Lab.exe','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')
$programs=@(Get-ChildItem -LiteralPath $Runtime -File | Where-Object {Test-R8Name $_.Name})
foreach($f in $programs){Copy-Item -LiteralPath $f.FullName -Destination $test}
foreach($name in @('coins.log','seating.json')){
 Copy-Item -LiteralPath (Join-Path $Runtime $name) -Destination $test
}
$R8Names=@($R8Names)+$names
$R8Required=@($R8Required)+$names
foreach($name in $names){Copy-Item -LiteralPath (Join-Path $Build $name) -Destination $test}
# A runnable synthetic previous version, NOT the historical 1.66.42 release.
# Use the same lab source, changing only the version identity.
$oldSource=Join-Path $root 'previous-native.cs'
$src=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'native-launch.cs'))
if(!$src.Contains('2026-11-25-V1.66.43-STABLE-PILOT')){throw 'Previous version source anchor missing'}
$src=$src.Replace('2026-11-25-V1.66.43-STABLE-PILOT','2026-11-24-V1.66.42-STABLE-PILOT').Replace('1.66.43','1.66.42')
[IO.File]::WriteAllText($oldSource,$src,[Text.UTF8Encoding]::new($false))
$exe=Join-Path $test $names[0]
$csc="$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /codepage:65001 /target:winexe /platform:x64 /main:NativeBoardLaunch "/out:$exe" "/reference:$Build\Microsoft.Web.WebView2.Core.dll" "/reference:$Build\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'host.cs') $oldSource (Join-Path $PSScriptRoot 'native-share-input.cs')
if($LASTEXITCODE -ne 0){throw 'Previous lab version compile failed'}
$rel=Read-R8Json (Join-Path $test 'release.json')
$rel.version='1.66.42';$rel.release='2026-11-24-V1.66.42-STABLE-PILOT'
Write-R8Json (Join-Path $test 'release.json') $rel
$dash=Join-Path $test 'dashboard.html'
$originalDashboard=[IO.File]::ReadAllText($dash)
if(!$originalDashboard.Contains('1.66.43') -or !$originalDashboard.Contains('openMiniGames')){throw 'Dashboard identity fixture missing'}
[IO.File]::WriteAllText($dash,$originalDashboard.Replace('1.66.43','1.66.42'),[Text.UTF8Encoding]::new($false))
$baseHash=Get-R8FileSha (Join-Path $test 'release.json')
$baseInventory=@{}
foreach($f in @(Get-ChildItem -LiteralPath $test -File | Where-Object {Test-R8Name $_.Name})){$baseInventory[$f.Name]=Get-R8FileSha $f.FullName}
$sentinels=@{}
foreach($name in @('coins.log','seating.json')){$sentinels[$name]=Get-R8FileSha (Join-Path $test $name)}
$legacy=Join-Path $test 'ChromeProfile'
New-Item -ItemType Directory -Path $legacy|Out-Null
[IO.File]::WriteAllText((Join-Path $legacy 'keep.txt'),'legacy profile')
$sentinels['ChromeProfile\keep.txt']=Get-R8FileSha (Join-Path $legacy 'keep.txt')
function Check-Data{
 foreach($name in $sentinels.Keys){if((Get-R8FileSha (Join-Path $test $name)) -cne $sentinels[$name]){throw "User data changed: $name"}}
}
function Check-Base{
 foreach($name in $baseInventory.Keys){if((Get-R8FileSha (Get-R8Path $test $name)) -cne $baseInventory[$name]){throw "Base restore mismatch: $name"}}
 Check-Data
}
$tx=Join-Path $test 'r8-transaction'
$pending=Join-Path $tx 'pending.json'
$receipt=Join-Path $tx 'ready.json'
$ready=Join-Path $root 'native-launch.ready'
$stop=Join-Path $root 'native-launch.stop'
$result=Join-Path $root 'native-launch.result'
$pidFile=Join-Path $root 'native-server.pid'
$probe=Join-Path $root 'update-profile-probe'
function Run-Installed([string]$expectedRelease,[string]$token='',[switch]$ExpectFail){
 Remove-Item $ready,$stop,$result,$pidFile -Force -ErrorAction SilentlyContinue
 if(Get-NetTCPConnection -LocalPort 17449 -State Listen -ErrorAction SilentlyContinue){throw 'Foreign or leftover listener'}
 $argsLine=if($token){"--lab-launch-update window $token"}else{'--lab-launch-owned window'}
 $child=Start-Process -FilePath $exe -ArgumentList $argsLine -PassThru
 $owned=$null
 try{
  for($i=0;$i -lt 180 -and !(Test-Path $ready) -and !$child.HasExited;$i++){Start-Sleep -Milliseconds 250}
  if($ExpectFail){
   if(!$child.WaitForExit(15000) -or $child.ExitCode -ne 1 -or (Test-Path $ready) -or (Test-Path $receipt) -or (Get-Content $result -Raw) -notmatch 'real dashboard identity'){throw 'Broken candidate did not fail at actual UI gate'}
  }else{
   if($child.HasExited -or !(Test-Path $ready) -or !(Test-Path $pidFile)){throw ('Installed launch failed: '+(Get-Content $result -ErrorAction SilentlyContinue))}
   $owned=Get-Process -Id ([int](Get-Content $pidFile -Raw)) -ErrorAction Stop
   $null=$owned.Handle
   if((Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17449 -State Listen).OwningProcess -ne $owned.Id){throw 'Installed listener mismatch'}
   $h=Invoke-RestMethod -Uri 'http://127.0.0.1:17449/health' -TimeoutSec 2
   $bm=Read-R8Json (Join-Path $test 'board-mode.json')
   if($h.release -cne $expectedRelease -or $h.service -cne 'teacher-tools-local' -or $bm.pid -ne $child.Id -or $bm.release -cne $expectedRelease -or !(Invoke-RestMethod -Uri 'http://127.0.0.1:17449/api/board-status' -TimeoutSec 2).wallpaper){throw 'Installed readiness mismatch'}
   if($token){
    $r=Read-R8Json $receipt
    if($r.token -cne $token -or $r.release -cne $expectedRelease){throw 'Installed receipt mismatch'}
   }
   Set-Content $stop 'stop' -Encoding ASCII
   if(!$child.WaitForExit(20000) -or $child.ExitCode -ne 0 -or !$owned.WaitForExit(10000)){throw 'Installed close failed'}
  }
  if(Get-NetTCPConnection -LocalPort 17449 -State Listen -ErrorAction SilentlyContinue){throw 'Installed child left listener'}
 }finally{
  if(!$child.HasExited){$child.Kill();$child.WaitForExit()}
  if($owned -and !$owned.HasExited){$owned.Kill();$owned.WaitForExit()}
  $child.Dispose()
  if($owned){$owned.Dispose()}
 }
}
$rsa=New-Object Security.Cryptography.RSACryptoServiceProvider(2048)
$key=Join-Path $test 'lab-public.xml'
[IO.File]::WriteAllText($key,$rsa.ToXmlString($false))
$envRoot=$env:HOJA_LAB_ROOT;$envLocal=$env:LOCALAPPDATA
$feed=Join-Path $root 'local-signed-feed'
$bootstrapFile=Join-Path $test 'launch.ps1'
function Prepare-LabBootstrap{
 New-Item -ItemType Directory -Path (Join-Path $feed 'blobs') -Force|Out-Null
 # Keep reviewed R8 control flow; replace only trust allowlist, fixture transport, port and native adapter.
 $kernelSource=[IO.File]::ReadAllText($Kernel)
 $kernelAnchor='$R8Required=@($R8Names)'
 if(!$kernelSource.Contains($kernelAnchor)){throw 'Kernel allowlist anchor missing'}
 $extension='$R8Names=@($R8Names)+@(''HOJA-Native-Launch-Lab.exe'',''Microsoft.Web.WebView2.Core.dll'',''Microsoft.Web.WebView2.WinForms.dll'',''WebView2Loader.dll'')'
 $kernelSource=$kernelSource.Replace($kernelAnchor,$extension+[Environment]::NewLine+$kernelAnchor)
 $start=$kernelSource.IndexOf('function Get-R8Remote(');$end=$kernelSource.IndexOf('function Read-R8Manifest(')
 if($start -lt 0 -or $end -le $start){throw 'Kernel transport anchors missing'}
 $transport=@'
function Get-R8Remote([string]$Relative,[int]$Limit){
 if($Relative -cnotmatch '^(latest\.json|blobs/[a-f0-9]{64}\.bin)$'){throw 'Unexpected download path.'}
 $p=Join-Path (Join-Path $env:HOJA_LAB_ROOT 'local-signed-feed') $Relative
 Assert-R8Plain $p
 if((Get-Item -LiteralPath $p).Length -gt $Limit){throw 'Download size limit.'}
 return ,([IO.File]::ReadAllBytes($p))
}
'@
 $kernelSource=$kernelSource.Substring(0,$start)+$transport+[Environment]::NewLine+$kernelSource.Substring($end)
 [IO.File]::WriteAllText((Join-Path $test 'r8-kernel.ps1'),$kernelSource,[Text.UTF8Encoding]::new($true))
 Copy-Item -LiteralPath $key -Destination (Join-Path $test 'update-public.xml')
 $launch=[IO.File]::ReadAllText((Join-Path (Split-Path $Kernel -Parent) 'launch.ps1'))
 $start=$launch.IndexOf('function Get-R8Browsers');$end=$launch.IndexOf('function Get-R8ListenerIds')
 if($start -lt 0 -or $end -le $start){throw 'Bootstrap process adapter anchors missing'}
 $discovery=@'
function Get-R8Browsers {
 $path=Join-Path $root 'HOJA-Native-Launch-Lab.exe'
 @(Get-CimInstance Win32_Process -Filter "Name='HOJA-Native-Launch-Lab.exe'" -ErrorAction Stop|Where-Object {$_.ExecutablePath -and $_.ExecutablePath -ieq $path})
}
'@
 $launch=$launch.Substring(0,$start)+$discovery+[Environment]::NewLine+$launch.Substring($end)
 $start=$launch.IndexOf('function Start-R8Board(');$end=$launch.IndexOf("try{"+[Environment]::NewLine+' Assert-R8Plain $root',$start)
 if($end -lt 0){$end=$launch.IndexOf("try{"+[char]10+' Assert-R8Plain $root',$start)}
 if($start -lt 0 -or $end -le $start){throw 'Bootstrap launch adapter anchors missing'}
 $adapter=@'
function Start-R8Board([string]$ReadyToken=''){
 foreach($name in @('native-launch.ready','native-launch.stop','native-launch.result','native-server.pid')){
  Remove-Item -LiteralPath (Join-Path $env:HOJA_LAB_ROOT $name) -Force -ErrorAction SilentlyContinue
 }
 $pi=New-Object Diagnostics.ProcessStartInfo
 $pi.FileName=Join-Path $root 'HOJA-Native-Launch-Lab.exe'
 $mode=if($Windowed){'window'}else{'wallpaper'}
 $pi.Arguments=if($ReadyToken){"--lab-launch-update $mode $ReadyToken"}else{"--lab-launch-owned $mode"}
 $pi.WorkingDirectory=$root;$pi.UseShellExecute=$false
 return [Diagnostics.Process]::Start($pi)
}
'@
 $launch=$launch.Substring(0,$start)+$adapter+[Environment]::NewLine+$launch.Substring($end)
 $launch=$launch.Replace('17439','17449')
 $old='-and @(Get-R8Browsers).Count){$passed=$true;break}'
 $new='-and !$child.HasExited -and @(Get-R8Browsers|Where-Object {$_.ProcessId -eq $child.Id}).Count -eq 1 -and (Read-R8Json (Join-Path $root ''board-mode.json'')).pid -eq $child.Id -and (Invoke-RestMethod -Uri ''http://127.0.0.1:17449/api/board-status'' -TimeoutSec 2).wallpaper){$passed=$true;break}'
 if(!$launch.Contains($old)){throw 'Bootstrap readiness anchor missing'}
 $launch=$launch.Replace($old,$new)
 [IO.File]::WriteAllText($bootstrapFile,$launch,[Text.UTF8Encoding]::new($true))
 foreach($file in @($bootstrapFile,(Join-Path $test 'r8-kernel.ps1'))){
  $tok=$null;$err=$null
  [void][Management.Automation.Language.Parser]::ParseFile($file,[ref]$tok,[ref]$err)
  if($err.Count){throw ($err|Out-String)}
 }
}
function Run-Bootstrap([string]$expectedRelease,[string]$expectedState){
 Remove-Item $ready,$stop,$result,$pidFile -Force -ErrorAction SilentlyContinue
 $ps="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
 $statePath=Join-Path $test 'update-state.json'
 $diagnostic=Join-Path $root 'bootstrap-exception.txt'
 $complete=Join-Path $root 'bootstrap-complete.txt'
 $wrapper=Join-Path $root 'invoke-bootstrap.ps1'
 Remove-Item $statePath,$diagnostic,$complete -Force -ErrorAction SilentlyContinue
 # Retain the Process handle before waiting; write explicit completion and uncaught-error evidence.
 $wrapperSource=@'
$ErrorActionPreference='Stop'
try{
 $root=$env:HOJA_LAB_ROOT
 & (Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal\launch.ps1') -Windowed
 [IO.File]::WriteAllText((Join-Path $root 'bootstrap-complete.txt'),'returned')
 exit 0
}catch{
 [IO.File]::WriteAllText((Join-Path $env:HOJA_LAB_ROOT 'bootstrap-exception.txt'),($_|Out-String)+[Environment]::NewLine+$_.ScriptStackTrace)
 exit 1
}
'@
 [IO.File]::WriteAllText($wrapper,$wrapperSource,[Text.UTF8Encoding]::new($true))
 $runner=Start-Process -FilePath $ps -ArgumentList ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$wrapper+'"') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'bootstrap-out.log') -RedirectStandardError (Join-Path $root 'bootstrap-err.log')
 $null=$runner.Handle
 $child=$null;$owned=$null
 try{
  $finished=$runner.WaitForExit(90000)
  if(!$finished -or $runner.ExitCode -ne 0 -or !(Test-Path $complete) -or (Get-Content $complete -Raw) -cne 'returned'){
   foreach($path in @($diagnostic,$statePath,(Join-Path $root 'bootstrap-out.log'),(Join-Path $root 'bootstrap-err.log'),$result)){
    if(Test-Path $path){Write-Host ("BOOTSTRAP DIAGNOSTIC "+(Split-Path $path -Leaf)+": "+(Get-Content $path -Raw))}
   }
   throw ("Bootstrap process failed: finished=$finished exit=$($runner.ExitCode)")
  }
  if(!(Test-Path $statePath)){throw 'Bootstrap returned without fresh update state'}
  $state=Read-R8Json (Join-Path $test 'update-state.json')
  if($state.status -cne $expectedState){throw ('Unexpected bootstrap state: '+($state|ConvertTo-Json -Compress))}
  for($i=0;$i -lt 180 -and !(Test-Path $ready);$i++){Start-Sleep -Milliseconds 250}
  if(!(Test-Path $ready) -or !(Test-Path $pidFile)){throw ('Bootstrap did not start board: '+(Get-Content $result -ErrorAction SilentlyContinue))}
  $mode=Read-R8Json (Join-Path $test 'board-mode.json')
  $child=Get-Process -Id $mode.pid -ErrorAction Stop
  $owned=Get-Process -Id ([int](Get-Content $pidFile -Raw)) -ErrorAction Stop
  $null=$child.Handle;$null=$owned.Handle
  if($child.Path -ine $exe -or $mode.release -cne $expectedRelease -or (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17449 -State Listen).OwningProcess -ne $owned.Id){throw 'Bootstrap ownership mismatch'}
  $h=Invoke-RestMethod -Uri 'http://127.0.0.1:17449/health' -TimeoutSec 2
  if($h.release -cne $expectedRelease -or !(Invoke-RestMethod -Uri 'http://127.0.0.1:17449/api/board-status' -TimeoutSec 2).wallpaper){throw 'Bootstrap health mismatch'}
  if(Test-Path $tx){throw 'Bootstrap left transaction'}
  Set-Content $stop 'stop' -Encoding ASCII
  if(!$child.WaitForExit(20000) -or $child.ExitCode -ne 0 -or !$owned.WaitForExit(10000)){throw 'Bootstrap board close failed'}
  Check-Data
 }finally{
  if(!$runner.HasExited){$runner.Kill();$runner.WaitForExit()}
  if($child -and !$child.HasExited){$child.Kill();$child.WaitForExit()}
  if($owned -and !$owned.HasExited){$owned.Kill();$owned.WaitForExit()}
  # If validation failed before reading the PID, stop only the exact isolated executable.
  foreach($info in @(Get-CimInstance Win32_Process -Filter "Name='HOJA-Native-Launch-Lab.exe'"|Where-Object {$_.ExecutablePath -ieq $exe})){
   $p=Get-Process -Id $info.ProcessId -ErrorAction SilentlyContinue
   if($p -and $p.Path -ieq $exe){$p.Kill();$p.WaitForExit()}
  }
 }
}
try{
 $env:HOJA_LAB_ROOT=$root;$env:LOCALAPPDATA=$local
 if($Bootstrap){Prepare-LabBootstrap;Write-Host 'BEGIN R8 bootstrap integration'}
 Set-Content $probe 'seed' -Encoding ASCII
 Run-Installed '2026-11-24-V1.66.42-STABLE-PILOT'
 Set-Content $probe 'verify' -Encoding ASCII
 Run-Installed '2026-11-24-V1.66.42-STABLE-PILOT'
 Check-Base
 Write-Host 'PASS runnable synthetic previous version and persistent real dashboard memo'
 $bootstrapPasses=0
 foreach($case in @('interrupted','broken','success')){
  $files=@();$bytesByHash=@{}
  foreach($f in $programs){
   $data=[IO.File]::ReadAllBytes($f.FullName)
   if($case -eq 'broken' -and $f.Name -eq 'dashboard.html'){
    $data=[Text.Encoding]::UTF8.GetBytes($originalDashboard.Replace('openMiniGames','labMissingMiniGames'))
   }
   $hash=Get-R8Sha $data;$bytesByHash[$hash]=$data
   $files+=@{name=$f.Name;sha256=$hash;bytes=$data.Length}
  }
  foreach($name in $names){
   $data=[IO.File]::ReadAllBytes((Join-Path $Build $name))
   $hash=Get-R8Sha $data;$bytesByHash[$hash]=$data
   $files+=@{name=$name;sha256=$hash;bytes=$data.Length}
  }
  $m=@{schema='TT-RUNTIME-SNAPSHOT-1';channel='stable';kernel=1;version='1.66.43';bases=@($baseHash);files=$files}
  $payload=$R8Utf8.GetBytes((ConvertTo-Json -InputObject $m -Depth 10 -Compress))
  $signed=$R8Utf8.GetBytes((ConvertTo-Json -Compress @{payload=[Convert]::ToBase64String($payload);signature=[Convert]::ToBase64String($rsa.SignData($payload,'SHA256'))}))
  $parsed=Read-R8Manifest $signed $key
  $plan=@(New-R8Plan $test $parsed)
  if($plan.Count -ne 3 -or @(Compare-Object @('dashboard.html','release.json',$names[0]) @($plan.name)).Count){throw 'Actual update plan mismatch'}
  $token=[guid]::NewGuid().ToString('N')
  if($Bootstrap){
   [IO.File]::WriteAllBytes((Join-Path $feed 'latest.json'),$signed)
   foreach($sha in $bytesByHash.Keys){[IO.File]::WriteAllBytes((Join-Path $feed "blobs/$sha.bin"),$bytesByHash[$sha])}
   if($case -eq 'interrupted'){
    $stage=Initialize-R8Transaction $test $parsed $plan {param($sha,$length) return ,([byte[]]$bytesByHash[$sha])}
    Save-R8Journal $test $stage $plan $token '1.66.43'
    Install-R8Plan $test $stage @($plan[0])
    Run-Bootstrap '2026-11-24-V1.66.42-STABLE-PILOT' 'error'
    Check-Base
    Write-Host 'PASS R8 bootstrap recovered interrupted transaction and launched base'
   }elseif($case -eq 'broken'){
    Run-Bootstrap '2026-11-24-V1.66.42-STABLE-PILOT' 'error'
    Check-Base
    Write-Host 'PASS R8 bootstrap rejected signed UI failure and automatically launched restored base'
   }else{
    Run-Bootstrap '2026-11-25-V1.66.43-STABLE-PILOT' 'installed'
    foreach($f in $parsed.files){if((Get-R8FileSha (Get-R8Path $test $f.name)) -cne $f.sha256){throw 'Bootstrap installed bytes mismatch'}}
    Run-Bootstrap '2026-11-25-V1.66.43-STABLE-PILOT' 'latest'
    Write-Host 'PASS R8 bootstrap automatically installed and committed actual native update, replay ignored'
   }
   $bootstrapPasses++
   continue
  }
  $stage=Initialize-R8Transaction $test $parsed $plan {param($sha,$length) return ,([byte[]]$bytesByHash[$sha])}
  Save-R8Journal $test $stage $plan $token '1.66.43'
  if($case -eq 'interrupted'){
   Install-R8Plan $test $stage @($plan[0])
   Restore-R8Transaction $test;Remove-R8Staging $test
   Check-Base
   Run-Installed '2026-11-24-V1.66.42-STABLE-PILOT'
   Write-Host 'PASS partial native update interrupted and runnable base recovered'
   continue
  }
  Install-R8Plan $test $stage $plan
  foreach($f in $parsed.files){if((Get-R8FileSha (Get-R8Path $test $f.name)) -cne $f.sha256){throw 'Candidate bytes mismatch'}}
  if($case -eq 'broken'){
   Run-Installed '2026-11-25-V1.66.43-STABLE-PILOT' $token -ExpectFail
   if(!(Test-Path $pending)){throw 'Failed candidate lost recovery journal'}
   Restore-R8Transaction $test;Remove-R8Staging $test
   Check-Base
   Run-Installed '2026-11-24-V1.66.42-STABLE-PILOT'
   Write-Host 'PASS signed installed bad dashboard fails real UI gate, exact old executable and profile recovered'
  }else{
   Run-Installed '2026-11-25-V1.66.43-STABLE-PILOT' $token
   [IO.File]::Delete($pending)
   Remove-R8Staging $test
   if(Test-Path $tx){throw 'Successful transaction not committed'}
   Run-Installed '2026-11-25-V1.66.43-STABLE-PILOT'
   Check-Data
   if(@(New-R8Plan $test $parsed).Count){throw 'Committed candidate replay accepted'}
   Write-Host 'PASS signed installed target actually starts, commits and restarts with preserved real memo and classroom data'
  }
 }
 if($Bootstrap -and $bootstrapPasses -ne 3){throw 'Bootstrap branches did not execute'}
 if($Bootstrap){Write-Host 'PASS all three R8 bootstrap integration cases executed'}
}finally{
 $env:HOJA_LAB_ROOT=$envRoot;$env:LOCALAPPDATA=$envLocal
 $rsa.Dispose()
}
