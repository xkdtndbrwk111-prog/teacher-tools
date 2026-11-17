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
 $expected='2026-11-17-V'+$Version+'-STABLE-PILOT'
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
 Assert-Board '1.66.3' 'window' 'idle'
 $payload=[IO.File]::ReadAllBytes((Join-Path $Candidate 'payload.json'))
 $signature=$rsa.SignData($payload,'SHA256')
 $envBytes=$R8Utf8.GetBytes((ConvertTo-Json -Compress @{payload=[Convert]::ToBase64String($payload);signature=[Convert]::ToBase64String($signature)}))
 Write-R8Atomic (Join-Path $feed 'latest.json') $envBytes
 Start-Launch '-Windowed -ManualUpdate'
 Assert-Board '1.66.4' 'window' 'installed'
 foreach($f in $target.files){if((Get-R8FileSha (Get-R8Path $root $f.name)) -cne $f.sha256){throw ('Installed file mismatch '+$f.name)}}
 foreach($n in $sentinels.Keys){if([IO.File]::ReadAllText((Join-Path $root $n)) -cne $sentinels[$n]){throw ('Sentinel changed '+$n)}}
 if(Test-Path (Join-Path $root 'r8-transaction')){throw 'Uncommitted transaction'}
 $page=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri 'http://127.0.0.1:17439/'
 if($page.StatusCode -ne 200 -or $page.Content -notmatch '1\.66\.4'){throw 'Updated HTTP dashboard unavailable'}
 Write-Host 'PASS: actual Windows board window, local HTTP signed update, close and restart, matching readiness, all 39 target files, synthetic data preservation. Test key and isolated local feed only; no physical school device or installer test.'
}finally{
 if($http -and -not $http.HasExited){$http.Kill()}
 $rsa.Dispose()
 # Terminate only processes explicitly referencing the disposable test path.
 Get-CimInstance Win32_Process | Where-Object {$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.Name -in @('chrome.exe','msedge.exe','powershell.exe','pwsh.exe')} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
}
