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
function Raw-Request([int]$port,[string]$path,[string]$method='GET',[string]$hostName='', [string]$site='', [string]$origin='', [string]$payload='', [string]$coinRevision='', [string]$seatRevision=''){
 $c=[Net.Sockets.TcpClient]::new()
 try{
  $c.ReceiveTimeout=10000;$c.SendTimeout=10000;$c.Connect('127.0.0.1',$port)
  $stream=$c.GetStream()
  if(!$hostName){$hostName="127.0.0.1:$port"}
  $nl=[string][char]13+[char]10
  $request="$method $path HTTP/1.1"+$nl+"Host: $hostName"+$nl
  if($site){$request+="Sec-Fetch-Site: $site"+$nl}
  if($origin){$request+="Origin: $origin"+$nl}
  if($method -eq 'POST'){$request+="Content-Length: "+[Text.Encoding]::ASCII.GetByteCount($payload)+$nl+"Content-Type: text/plain"+$nl}
  if($coinRevision){$request+="X-TT-Coin-Revision: $coinRevision"+$nl}
  if($seatRevision){$request+="X-TT-Seating-Revision: $seatRevision"+$nl}
  $request+="Connection: close"+$nl+$nl+$payload
  $bytes=[Text.Encoding]::ASCII.GetBytes($request);$stream.Write($bytes,0,$bytes.Length)
  # Read exactly the declared response, not EOF: a peer may reset after a valid denial.
  $header=[IO.MemoryStream]::new()
  try{
   $tail=0
   while($header.Length -lt 32768){
    $v=$stream.ReadByte()
    if($v -lt 0){throw "Truncated HTTP header $port $method $path"}
    $header.WriteByte([byte]$v)
    $tail=if(($tail -eq 0 -or $tail -eq 2) -and $v -eq 13){$tail+1}elseif(($tail -eq 1 -or $tail -eq 3) -and $v -eq 10){$tail+1}elseif($v -eq 13){1}else{0}
    if($tail -eq 4){break}
   }
   if($tail -ne 4){throw "HTTP header limit $port $method $path"}
   $rawHeader=$header.ToArray()
  }finally{$header.Dispose()}
  $split=$rawHeader.Length-4
  $head=[Text.Encoding]::ASCII.GetString($rawHeader,0,$split)
  $match=[regex]::Match($head,'(?im)^Content-Length: ([0-9]+)\r?$')
  if(!$match.Success){throw "Missing Content-Length $port $method $path"}
  $length=[int]$match.Groups[1].Value
  if($length -gt 67108864){throw 'Response exceeds test limit'}
  $body=New-Object byte[] $length
  $offset=0
  while($offset -lt $length){
   $n=$stream.Read($body,$offset,$length-$offset)
   if($n -le 0){throw "Truncated HTTP body $port $method $path"}
   $offset+=$n
  }
  $lines=$head -split $nl;$headers=@{}
  foreach($line in $lines|Select-Object -Skip 1){$idx=$line.IndexOf(':');$headers[$line.Substring(0,$idx)]=$line.Substring($idx+1).Trim()}
  if([int]$headers['Content-Length'] -ne $body.Length){throw 'Content length mismatch'}
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$hash=[BitConverter]::ToString($sha.ComputeHash($body)).Replace('-','')}finally{$sha.Dispose()}
  return @{status=$lines[0];headers=$headers;hash=$hash;body=$body}
 }finally{$c.Dispose()}
}
try{
 $legacy=Start-Process -FilePath $ps -ArgumentList ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $Runtime 'server.ps1')+'" -Port 17449') -PassThru -WindowStyle Hidden
 $native=Start-Process -FilePath $exe -ArgumentList '--lab-read-server' -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LabRoot 'native-read-out.log') -RedirectStandardError (Join-Path $LabRoot 'native-read-err.log')
 $null=$legacy.Handle;$null=$native.Handle
 foreach($port in @(17449,17450)){
  $proc=if($port -eq 17449){$legacy}else{$native}
  $ok=$false
  for($i=0;$i -lt 80;$i++){if($proc.HasExited){throw ('Server exited port '+$port+' code '+$proc.ExitCode+' '+(Get-Content (Join-Path $LabRoot 'native-read-err.log') -Raw -ErrorAction SilentlyContinue))};try{if((Raw-Request $port '/health').status -eq 'HTTP/1.1 200 OK'){$ok=$true;break}}catch{};Start-Sleep -Milliseconds 250}
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
   Write-Host "CHECK native guard $route $case"
   $res=switch($case){'foreign-host'{Raw-Request 17450 $route GET 'evil.invalid'}'cross-site'{Raw-Request 17450 $route GET '' 'cross-site'}'foreign-origin'{Raw-Request 17450 $route GET '' '' 'https://evil.invalid'}'post'{Raw-Request 17450 $route POST '' 'same-origin'}}
   $expected=if($case -eq 'post'){'HTTP/1.1 405 Method Not Allowed'}else{'HTTP/1.1 403 Forbidden'}
   if($res.status -ne $expected){throw "Native guard failed $route $case"}
  }
 }
 foreach($route in @('/coins.log','/seating.json','/server.ps1','/release.json','/native-profile','/../coins.log','/%2e%2e/coins.log')){
  Write-Host "CHECK native private path $route"
  if((Raw-Request 17450 $route).status -notmatch '^HTTP/1.1 (400|404) '){throw "Native private file exposed $route"}
 }
 Set-Content (Join-Path $LabRoot 'native-read-server.stop') 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Native server stop failed'}
 Write-Host 'PASS native read server exact response parity, no user-data static exposure, write rejection, loopback ownership and clean stop'
}catch{
 if(Test-Path (Join-Path $LabRoot 'native-read-err.log')){Write-Host (Get-Content (Join-Path $LabRoot 'native-read-err.log') -Raw)}
 throw
}finally{
 foreach($proc in @($native,$legacy)){if($proc -and !$proc.HasExited){$proc.Kill();$proc.WaitForExit()}}
}

# 4B-1: separate disposable data roots. Never write the 1~3 regression fixture.
$envRoot=$env:HOJA_LAB_ROOT;$envLocal=$env:LOCALAPPDATA
$legacy=$null;$native=$null
$roots=@{};$stores=@{}
try{
 foreach($port in @(17451,17452)){
  if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw 'Occupied coin test port'}
  $r=Join-Path $LabRoot ('hoja-webview-lab-'+[guid]::NewGuid().ToString('N'))
  $local=Join-Path $r 'local';$store=Join-Path $local 'TeacherToolsLocal'
  New-Item -ItemType Directory -Path $store -Force|Out-Null
  Get-ChildItem -LiteralPath $Runtime -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $store}
  # Deliberately no trailing newline; test compatibility with legacy ledgers.
  [IO.File]::WriteAllText((Join-Path $store 'coins.log'),'{"type":"LAB_SENTINEL"}',[Text.UTF8Encoding]::new($false))
  $roots[$port]=$r;$stores[$port]=$store
  $env:HOJA_LAB_ROOT=$r;$env:LOCALAPPDATA=$local
  if($port -eq 17451){
   Set-Content (Join-Path $r 'coin-write-fixture.flag') 'fixture' -Encoding ASCII
   $native=Start-Process -FilePath $exe -ArgumentList '--lab-coin-server' -PassThru -WindowStyle Hidden -RedirectStandardError (Join-Path $r 'native-coin-err.log')
   $null=$native.Handle
  }else{
   $legacy=Start-Process -FilePath $ps -ArgumentList ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $store 'server.ps1')+'" -Port 17452') -PassThru -WindowStyle Hidden
   $null=$legacy.Handle
  }
  $proc=if($port -eq 17451){$native}else{$legacy}
  $ok=$false
  for($i=0;$i -lt 80;$i++){
   if($proc.HasExited){throw "Coin server exited $port code $($proc.ExitCode)"}
   try{if((Raw-Request $port '/health').status -eq 'HTTP/1.1 200 OK'){$ok=$true;break}}catch{}
   Start-Sleep -Milliseconds 250
  }
  if(!$ok -or (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen).OwningProcess -ne $proc.Id){throw "Coin server ownership $port"}
 }
 function B64([string]$text){[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))}
 function Coin-Post([int]$port,[string]$payload,[string]$rev='', [string]$seat='', [string]$site='same-origin',[string]$origin=''){
  Raw-Request $port '/api/coins' POST '' $site $origin $payload $rev $seat
 }
 $rev=(Raw-Request 17451 '/api/coins').headers['X-TT-Coin-Revision']
 $seat=(Raw-Request 17451 '/api/seating').headers['X-TT-Seating-Revision']
 if($rev -cne (Raw-Request 17452 '/api/coins').headers['X-TT-Coin-Revision'] -or $seat -cne (Raw-Request 17452 '/api/seating').headers['X-TT-Seating-Revision']){throw 'Coin seed mismatch'}
 $batch=B64 ('{"type":"grant","id":"lab1","name":"학생","amount":5}'+[char]10+[char]10+'{"type":"spend","id":"lab1","amount":-1}')
 foreach($case in @('missing','stale','stale-seat','cross-site','valid','replay')){
  $answers=@()
  foreach($port in @(17451,17452)){
   $answer=switch($case){
    'missing'{Coin-Post $port $batch}
    'stale'{Coin-Post $port $batch ('a'*64)}
    'stale-seat'{Coin-Post $port $batch $rev ('a'*64)}
    'cross-site'{Coin-Post $port $batch $rev $seat 'cross-site'}
    'valid'{Coin-Post $port $batch $rev $seat}
    'replay'{Coin-Post $port $batch $rev $seat}
   }
   $answers+=@($answer)
  }
  $expected=switch($case){'missing'{428}'stale'{409}'stale-seat'{409}'cross-site'{403}'valid'{200}'replay'{409}}
  if($answers[0].status -notmatch ("^HTTP/1.1 "+$expected+" ") -or $answers[0].status -cne $answers[1].status -or $answers[0].hash -cne $answers[1].hash -or $answers[0].headers['X-TT-Coin-Revision'] -cne $answers[1].headers['X-TT-Coin-Revision']){throw "Coin POST parity $case"}
  $left=Raw-Request 17451 '/api/coins';$right=Raw-Request 17452 '/api/coins'
  if($left.hash -cne $right.hash -or $left.headers['X-TT-Coin-Revision'] -cne $right.headers['X-TT-Coin-Revision']){throw "Coin ledger parity $case"}
  Write-Host "PASS native coin POST parity $case"
 }
 # Two simultaneous TCP clients with one revision, separate accepted sockets.
 $current=(Raw-Request 17451 '/api/coins').headers['X-TT-Coin-Revision']
 $payload=B64 '{"type":"spend","id":"lab1","amount":-1,"op":"race"}'
 $nl=[string][char]13+[char]10
 $wire=[Text.Encoding]::ASCII.GetBytes(("POST /api/coins HTTP/1.1"+$nl+"Host: 127.0.0.1:17451"+$nl+"Sec-Fetch-Site: same-origin"+$nl+"X-TT-Coin-Revision: $current"+$nl+"Content-Length: "+$payload.Length+$nl+"Connection: close"+$nl+$nl+$payload))
 $clients=@()
 try{
  for($i=0;$i -lt 2;$i++){$c=[Net.Sockets.TcpClient]::new();$c.ReceiveTimeout=10000;$c.Connect('127.0.0.1',17451);$clients+=@($c)}
  foreach($c in $clients){$c.GetStream().Write($wire,0,$wire.Length)}
  $statuses=@(foreach($c in $clients){$reader=[IO.StreamReader]::new($c.GetStream(),[Text.Encoding]::ASCII);try{$reader.ReadLine()}finally{$reader.Dispose()}})
  if(@($statuses|Where-Object {$_ -eq 'HTTP/1.1 200 OK'}).Count -ne 1 -or @($statuses|Where-Object {$_ -eq 'HTTP/1.1 409 Conflict'}).Count -ne 1){throw 'Native compare/commit race'}
 }finally{foreach($c in $clients){$c.Dispose()}}
 $rows=@([IO.File]::ReadAllLines((Join-Path $stores[17451] 'coins.log'),[Text.Encoding]::UTF8))
 if($rows.Count -ne 4 -or @($rows|Where-Object {$_ -match '"op":"race"'}).Count -ne 1){throw 'Race appended more than once'}
 $after=Raw-Request 17451 '/api/coins'
 Set-Content (Join-Path $roots[17451] 'native-read-server.stop') 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Coin server clean stop'}
 if((Get-FileHash (Join-Path $stores[17451] 'coins.log')).Hash -cne $after.hash){throw 'Coin persisted hash mismatch'}
 if((Get-FileHash (Join-Path $stores[17451] 'seating.json')).Hash.ToLowerInvariant() -cne $seat){throw 'Coin write altered seat'}
 Write-Host 'PASS native coin atomic revision, one accepted concurrent debit, exact persistence and unchanged seating'
}finally{
 foreach($proc in @($native,$legacy)){if($proc -and !$proc.HasExited){$proc.Kill();$proc.WaitForExit()}}
 $env:HOJA_LAB_ROOT=$envRoot;$env:LOCALAPPDATA=$envLocal
}
