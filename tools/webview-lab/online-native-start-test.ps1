param([Parameter(Mandatory=$true)][string]$Package)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -cne 'true'){throw 'Disposable CI only'}
$env:LOCALAPPDATA=Join-Path $env:RUNNER_TEMP ('native-start-'+[guid]::NewGuid().ToString('N'))
$legacy=Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal'
New-Item -ItemType Directory -Path $legacy -Force|Out-Null
Set-Content -LiteralPath (Join-Path $legacy 'keep.txt') 'untouched'
$manifest=Get-Content -LiteralPath (Join-Path $Package 'manifest.json') -Raw|ConvertFrom-Json
$root=Join-Path $env:LOCALAPPDATA ('TeacherToolsWebView2OnlinePilotNative/hoja-webview-lab-'+$manifest.source.Substring(0,32))
$setup=Join-Path $Package 'Setup.exe'
function Invoke-Setup([string]$mode,[int]$expected){
 $p=Start-Process -FilePath $setup -ArgumentList "--ci-smoke $mode" -PassThru
 if(!$p.WaitForExit(120000)){$p.Kill();throw 'Native setup timed out'}
 if($p.ExitCode -ne $expected){$log=Get-Content -LiteralPath (Join-Path $root 'native-start-smoke.result') -Raw -ErrorAction SilentlyContinue;throw "Native setup exit $($p.ExitCode) expected $expected; $log"}
 $p.Dispose()
}
# Simulate occupied port. The unrelated listener must remain alive.
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,17439)
$listener.Start()
try{Invoke-Setup window 1;if(!$listener.Server.IsBound){throw 'Existing listener stopped'}}finally{$listener.Stop()}
if(Test-Path $root){throw 'Installation created despite occupied port'}
$asset=Join-Path $Package 'payload/local/TeacherToolsLocal/release.json'
$bytes=[IO.File]::ReadAllBytes($asset)
try{[IO.File]::WriteAllText($asset,'tampered');Invoke-Setup window 1;if(Test-Path $root){throw 'Tampered installation created'}}finally{[IO.File]::WriteAllBytes($asset,$bytes)}
Invoke-Setup window 0
Get-Content -LiteralPath (Join-Path $root 'native-start-smoke.result')
$keep=Join-Path $root 'local/TeacherToolsLocal/native-test-data.keep'
Set-Content -LiteralPath $keep 'preserve'
Invoke-Setup wallpaper 0
Get-Content -LiteralPath (Join-Path $root 'native-start-smoke.result')
if((Get-Content -LiteralPath $keep -Raw).Trim() -cne 'preserve'){throw 'Native data lost'}
if((Get-Content -LiteralPath (Join-Path $legacy 'keep.txt') -Raw).Trim() -cne 'untouched' -or @(Get-ChildItem -LiteralPath $legacy -Force).Count -ne 1){throw 'Legacy data changed'}
foreach($port in @(17439,4188,4189)){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw 'Listener survived'}}
Write-Host 'PASS native startup, port collision refusal, tamper refusal, reopen and legacy data preservation'
