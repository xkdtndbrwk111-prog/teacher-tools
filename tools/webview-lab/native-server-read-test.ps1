param([string]$LabRoot,[string]$Runtime,[string]$Build)
$ErrorActionPreference='Stop'
if((Split-Path $LabRoot -Leaf) -notmatch '^hoja-webview-lab-[a-f0-9]{32}$'){throw 'Not isolated'}
$csc="$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$exe=Join-Path $Build 'HOJA-ReadServer-Lab.exe'
& $csc /nologo /codepage:65001 /target:exe /platform:x64 "/out:$exe" /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'native-read-server.cs')
if($LASTEXITCODE -ne 0){throw 'Native server compilation failed'}
foreach($port in @(17449,17450)){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw 'Occupied port; no reuse'}}
$ps="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$legacy=$null;$native=$null
function Raw-Request([int]$port,[string]$path,[string]$method='GET',[string]$hostName='', [string]$site='', [string]$origin=''){
 $c=[Net.Sockets.TcpClient]::new()
 try{
  $c.ReceiveTimeout=10000;$c.SendTimeout=10000;$c.Connect('127.0.0.1',$port)
  $stream=$c.GetStream()
  if(!$hostName){$hostName="127.0.0.1:$port"}
  $nl=[string][char]13+[char]10
  $request="$method $path HTTP/1.1"+$nl+"Host: $hostName"+$nl
  if($site){$request+="Sec-Fetch-Site: $site"+$nl}
  if($origin){$request+="Origin: $origin"+$nl}
  $request+="Connection: close"+$nl+$nl
  $bytes=[Text.Encoding]::ASCII.GetBytes($request);$stream.Write($bytes,0,$bytes.Length)
  $ms=[IO.MemoryStream]::new()
  try{$stream.CopyTo($ms);$raw=$ms.ToArray()}finally{$ms.Dispose()}
  $split=-1
  for($i=0;$i -lt [Math]::Min($raw.Length-3,32768);$i++){if($raw[$i] -eq 13 -and $raw[$i+1] -eq 10 -and $raw[$i+2] -eq 13 -and $raw[$i+3] -eq 10){$split=$i;break}}
  if($split -lt 0){throw "No HTTP response $port $path"}
  $head=[Text.Encoding]::ASCII.GetString($raw,0,$split)
  $body=New-Object byte[] ($raw.Length-$split-4)
  [Array]::Copy($raw,$split+4,$body,0,$body.Length)
  $lines=$head -split $nl;$headers=@{}
  foreach($line in $lines|Select-Object -Skip 1){$idx=$line.IndexOf(':');$headers[$line.Substring(0,$idx)]=$line.Substring($idx+1).Trim()}
  if([int]$headers['Content-Length'] -ne $body.Length){throw 'Content length mismatch'}
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$hash=[BitConverter]::ToString($sha.ComputeHash($body)).Replace('-','')}finally{$sha.Dispose()}
  return @{status=$lines[0];headers=$headers;hash=$hash}
 }finally{$c.Dispose()}
}
try{
 $legacy=Start-Process -FilePath $ps -ArgumentList ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $Runtime 'server.ps1')+'" -Port 17449') -PassThru -WindowStyle Hidden
 $native=Start-Process -FilePath $exe -ArgumentList '--lab-read-server' -PassThru -WindowStyle Hidden
 $null=$legacy.Handle;$null=$native.Handle
 foreach($port in @(17449,17450)){
  $proc=if($port -eq 17449){$legacy}else{$native}
  $ok=$false
  for($i=0;$i -lt 80;$i++){if($proc.HasExited){throw 'Server exited'};try{if((Raw-Request $port '/health').status -eq 'HTTP/1.1 200 OK'){$ok=$true;break}}catch{};Start-Sleep -Milliseconds 250}
  if(!$ok -or (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen).OwningProcess -ne $proc.Id){throw 'Server ownership/readiness failure'}
 }
 $routes=@('/health','/','/index.html','/seating-inbox','/coins.js','/coins-ui.js','/update-ui.js','/podo.js','/handmade-paper.png','/museum-clouds/sky','/museum-clouds/far','/museum-clouds/near','/museum-sway/base/spring','/museum-sway/sheet/summer','/museum-sway/sheet/winter/left','/api/coins','/api/seating','/unknown')
 foreach($route in $routes){
  $a=Raw-Request 17449 $route;$b=Raw-Request 17450 $route
  if($a.status -cne $b.status -or $a.hash -cne $b.hash){throw "Parity mismatch $route"}
  foreach($key in @('Content-Type','Cache-Control','X-Content-Type-Options','X-TT-Coin-Revision','X-TT-Seating-Revision')){if($a.headers[$key] -cne $b.headers[$key]){throw "Header parity mismatch $route $key"}}
  Write-Host "PASS native read parity $route"
 }
 foreach($route in @('/api/coins','/api/seating')){
  foreach($case in @('foreign-host','cross-site','foreign-origin','post')){
   $res=switch($case){'foreign-host'{Raw-Request 17450 $route GET 'evil.invalid'}'cross-site'{Raw-Request 17450 $route GET '' 'cross-site'}'foreign-origin'{Raw-Request 17450 $route GET '' '' 'https://evil.invalid'}'post'{Raw-Request 17450 $route POST '' 'same-origin'}}
   $expected=if($case -eq 'post'){'HTTP/1.1 405 Method Not Allowed'}else{'HTTP/1.1 403 Forbidden'}
   if($res.status -ne $expected){throw "Native guard failed $route $case"}
  }
 }
 foreach($route in @('/coins.log','/seating.json','/server.ps1','/release.json','/native-profile','/../coins.log','/%2e%2e/coins.log')){
  if((Raw-Request 17450 $route).status -notmatch '^HTTP/1.1 (400|404) '){throw "Native private file exposed $route"}
 }
 Set-Content (Join-Path $LabRoot 'native-read-server.stop') 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Native server stop failed'}
 Write-Host 'PASS native read server exact response parity, no user-data static exposure, write rejection, loopback ownership and clean stop'
}finally{
 foreach($proc in @($native,$legacy)){if($proc -and !$proc.HasExited){$proc.Kill();$proc.WaitForExit()}}
}
