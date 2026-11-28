param([Parameter(Mandatory=$true)][string]$Package)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'Disposable Windows CI only'}
if(Get-NetTCPConnection -LocalPort 17451 -State Listen -ErrorAction SilentlyContinue){throw 'Existing listener; no process stopped'}
$root=Join-Path $env:RUNNER_TEMP ('hoja-webview-lab-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$oldLab=$env:HOJA_LAB_ROOT;$oldLocal=$env:LOCALAPPDATA;$server=$null
$errors=New-Object 'System.Collections.Generic.List[string]'
$headers=@{'Sec-Fetch-Site'='same-origin';'Origin'='http://127.0.0.1:17451'}
function LocalGet([string]$path){
 Invoke-RestMethod -Uri ('http://127.0.0.1:17451'+$path) -Headers $headers -TimeoutSec 40
}
function LocalPost([string]$path,$doc){
 $data=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($doc|ConvertTo-Json -Compress)))
 Invoke-RestMethod -Uri ('http://127.0.0.1:17451'+$path) -Method Post -Headers $headers -ContentType 'text/plain' -Body $data -TimeoutSec 5
}
try{
 foreach($dir in @('bin','local')){Copy-Item -LiteralPath (Join-Path $Package "payload/$dir") -Destination $root -Recurse}
 $env:HOJA_LAB_ROOT=$root;$env:LOCALAPPDATA=Join-Path $root 'local'
 foreach($flag in @('field-pilot.flag','coin-write-fixture.flag','neis-live.flag','field-provider-live.flag')){
  Set-Content -LiteralPath (Join-Path $root $flag) 'isolated-ci-live-provider' -Encoding ASCII
 }
 $server=Start-Process -FilePath (Join-Path $root 'bin/HOJA-Native-Server.exe') -ArgumentList '--lab-coin-server' -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'server-out.log') -RedirectStandardError (Join-Path $root 'server-err.log')
 $null=$server.Handle
 $ready=Join-Path $root 'native-read-server.ready'
 for($i=0;$i -lt 120 -and !(Test-Path $ready);$i++){if($server.HasExited){throw 'Native server exited'};Start-Sleep -Milliseconds 250}
 if(!(Test-Path $ready) -or [int](Get-Content $ready -Raw) -ne $server.Id){throw 'Native server readiness'}
 if((Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17451 -State Listen).OwningProcess -ne $server.Id){throw 'Listener ownership'}
 if((LocalGet '/health').service -cne 'teacher-tools-local'){throw 'Server identity'}
 # Public city-wide query, no real user, classroom, account or private sheet data.
 $q=[uri]::EscapeDataString(([char]0xC11C).ToString()+[char]0xC6B8)
 $directCodes=@()
 try{
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $direct=Invoke-RestMethod -Uri "https://open.neis.go.kr/hub/schoolInfo?Type=json&pSize=100&SCHUL_NM=$q&ATPT_OFCDC_SC_CODE=B10" -TimeoutSec 15
  $directCodes=@($direct.schoolInfo|ForEach-Object {$_.row}|Where-Object {$_ -and $_.SD_SCHUL_CODE}|ForEach-Object {$_.SD_SCHUL_CODE})
  if(!$directCodes.Count){throw 'No direct school rows'}
  Write-Host 'PASS direct NEIS HTTPS public search'
 }catch{Write-Host ('BLOCKED direct NEIS: '+$_.Exception.GetType().Name);$errors.Add('direct NEIS unavailable')}
 try{
  $native=LocalGet "/api/school/search?q=$q&office=B10"
  $codes=@($native.rows|Where-Object {$_.office -ceq 'B10' -and $_.code -match '^[0-9]{7}$'}|ForEach-Object {$_.code})
  if(!$codes.Count){throw 'No native NEIS rows'}
  if($directCodes.Count -and !@($codes|Where-Object {$_ -in $directCodes}).Count){throw 'Direct/native rows differ'}
  Write-Host 'PASS packaged native NEIS actual HTTPS and parsed school search'
 }catch{Write-Host ('FAIL native NEIS: '+$_.Exception.GetType().Name);$errors.Add('native NEIS')}
 try{
  $set=LocalPost '/api/weather/place' @{name='CI public region';lat=37.5665;lon=126.9780;auto=$false}
  if(!$set.ok){throw 'Manual region rejected'}
  $forecast=LocalGet '/api/weather?fresh=1'
  if(!$forecast.weather -or $forecast.source -cne 'Open-Meteo' -or $forecast.stale){$errors.Add('native live forecast');Write-Host 'FAIL native live forecast'}
  else{Write-Host 'PASS packaged native actual HTTPS forecast'}
  if(!$forecast.air -or $forecast.airStale){$errors.Add('native live air quality');Write-Host 'FAIL native live air quality'}
  else{Write-Host 'PASS packaged native actual HTTPS air quality'}
 }catch{Write-Host ('FAIL native weather request: '+$_.Exception.GetType().Name);$errors.Add('native weather request')}
 if($errors.Count){throw ('Live provider verification incomplete: '+($errors -join '; '))}
 Write-Host 'PASS live public provider checks; private Google Sheet and classroom PC still require field acceptance'
}finally{
 if($server -and !$server.HasExited){
  Set-Content -LiteralPath (Join-Path $root 'native-read-server.stop') 'stop' -Encoding ASCII
  if(!$server.WaitForExit(15000)){$server.Kill();$server.WaitForExit()}
 }
 if(Test-Path (Join-Path $root 'server-err.log')){Get-Content -LiteralPath (Join-Path $root 'server-err.log') | Write-Host}
 if($server){$server.Dispose()}
 $env:HOJA_LAB_ROOT=$oldLab;$env:LOCALAPPDATA=$oldLocal
}
