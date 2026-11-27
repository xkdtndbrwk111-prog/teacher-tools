param([string]$LabRoot,[string]$Runtime,[string]$Build)
$ErrorActionPreference='Stop'
if((Split-Path $LabRoot -Leaf) -notmatch '^hoja-webview-lab-[a-f0-9]{32}$'){throw 'Not isolated'}
$csc="$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$exe=Join-Path $Build 'HOJA-ReadServer-Lab.exe'
& $csc /nologo /codepage:65001 /target:exe /platform:x64 "/out:$exe" /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot 'native-read-server.cs')
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
 $routes=@('/health','/','/index.html','/seating-inbox','/coins.js','/coins-ui.js','/update-ui.js','/podo.js','/handmade-paper.png','/museum-clouds/sky','/museum-clouds/far','/museum-clouds/near','/museum-sway/base/spring','/museum-sway/sheet/summer','/museum-sway/sheet/winter/left','/api/coins','/api/seating','/api/notice','/unknown')
 foreach($route in $routes){
  $a=Raw-Request 17449 $route;$b=Raw-Request 17450 $route
  if($a.status -cne $b.status -or $a.hash -cne $b.hash){throw "Parity mismatch $route"}
  foreach($key in @('Content-Type','Cache-Control','X-Content-Type-Options','X-TT-Coin-Revision','X-TT-Seating-Revision')){if($a.headers[$key] -cne $b.headers[$key]){throw "Header parity mismatch $route $key"}}
  Write-Host "PASS native read parity $route"
 }
 foreach($route in @('/api/coins','/api/seating','/api/notice')){
  foreach($case in @('foreign-host','cross-site','foreign-origin','post')){
   Write-Host "CHECK native guard $route $case"
   $res=switch($case){'foreign-host'{Raw-Request 17450 $route GET 'evil.invalid'}'cross-site'{Raw-Request 17450 $route GET '' 'cross-site'}'foreign-origin'{Raw-Request 17450 $route GET '' '' 'https://evil.invalid'}'post'{Raw-Request 17450 $route POST '' 'same-origin'}}
   $expected=if($case -eq 'post'){'HTTP/1.1 405 Method Not Allowed'}else{'HTTP/1.1 403 Forbidden'}
   if($res.status -ne $expected){throw "Native guard failed $route $case"}
  }
 }
 foreach($route in @('/coins.log','/seating.json','/notice.log','/server.ps1','/release.json','/native-profile','/../coins.log','/%2e%2e/coins.log')){
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
 if((Get-FileHash (Join-Path $stores[17451] 'coins.log')).Hash -cne $after.hash){throw 'Coin persisted hash mismatch'}
 if((Get-FileHash (Join-Path $stores[17451] 'seating.json')).Hash.ToLowerInvariant() -cne $seat){throw 'Coin write altered seat'}
 Write-Host 'PASS native coin atomic revision, one accepted concurrent debit, exact persistence and unchanged seating'
 # 4B-2: actual legacy and native storage, semantic comparison for serialized roster.
 # The legacy isolated server already has the persistent $old variable collision fixed.
 function Seat-Post([int]$port,[string]$route,[string]$text,[string]$site='same-origin',[switch]$NoOrigin){
  $origin=if($NoOrigin){''}else{"http://127.0.0.1:$port"}
  Raw-Request $port $route POST '' $site $origin (B64 $text)
 }
 function Canon($value){
  if($null -eq $value){return 'null'}
  if($value -is [System.Management.Automation.PSCustomObject]){
   $pieces=@(foreach($p in ($value.PSObject.Properties|Sort-Object Name)){(ConvertTo-Json -InputObject $p.Name -Compress)+':'+(Canon $p.Value)})
   return '{'+($pieces -join ',')+'}'
  }
  if($value -is [array]){return '['+(@(foreach($v in $value){Canon $v}) -join ',')+']'}
  return (ConvertTo-Json -InputObject $value -Compress)
 }
 function Seat-Snapshot([int]$port){ConvertFrom-Json ([Text.Encoding]::UTF8.GetString((Raw-Request $port '/api/seating').body))}
 $seatDoc='{"classId":"LAB_A","className":"시험반","layout":{"rows":2,"cols":2,"cells":[{"id":"s0","row":0,"col":0},{"id":"s1","row":0,"col":1}]},"students":[{"id":"m1","name":"이전 이름","visual":"avatar1"},{"id":"m2","name":"제외 전","visual":"avatar2"}],"assignments":[{"studentId":"m1","seatId":"s0"},{"studentId":"m2","seatId":"s1"}],"groups":[{"id":"g1","seatIds":["s0","s1"]}],"teacherAvatar":{"gender":"female"},"practice":{"genderSeats":true},"pairReactions":[{"id":"old"}],"previousAssignments":[{"studentId":"m2"}],"historyTransition":true,"previousRound":2}'
 $roster='{"rosterProtocol":1,"classId":"LAB_A","className":"시험반","roster":[{"id":"m1","name":"새 이름","gender":"female","excluded":false,"number":1},{"id":"m2","name":"제외","gender":"male","excluded":true,"number":2},{"id":"m3","name":"신규","gender":"none","excluded":false,"number":3}],"layout":{"rows":99},"assignments":[{"studentId":"m3","seatId":"fake"}]}'
 foreach($port in @(17451,17452)){
  if((Seat-Post $port '/api/seating' $seatDoc).status -ne 'HTTP/1.1 200 OK'){throw "Seat write failed $port"}
 }
 if((Raw-Request 17451 '/api/seating').hash -cne (Raw-Request 17452 '/api/seating').hash){throw 'Seat byte parity'}
 $seedSeat=Seat-Snapshot 17451
 $seedRev=(Raw-Request 17451 '/api/seating').headers['X-TT-Seating-Revision']
 foreach($case in @('invalid-seat','cross-site','no-origin','duplicate-id','duplicate-number','same-class','new-class')){
  foreach($port in @(17451,17452)){
   $response=switch($case){
    'invalid-seat'{Seat-Post $port '/api/seating' '{"students":[],"assignments":[]}'}
    'cross-site'{Seat-Post $port '/api/roster' $roster 'cross-site'}
    'no-origin'{Seat-Post $port '/api/roster' $roster -NoOrigin}
    'duplicate-id'{Seat-Post $port '/api/roster' ($roster.Replace('"id":"m3"','"id":"m1"'))}
    'duplicate-number'{Seat-Post $port '/api/roster' ($roster.Replace('"number":3','"number":1'))}
    'same-class'{Seat-Post $port '/api/roster' $roster}
    'new-class'{Seat-Post $port '/api/roster' ($roster.Replace('LAB_A','LAB_B'))}
   }
   $expected=switch($case){'invalid-seat'{400}'cross-site'{403}'no-origin'{403}'duplicate-id'{400}'duplicate-number'{400}default{200}}
   if($response.status -notmatch ("^HTTP/1.1 "+$expected+" ")){throw "Seat/roster status $port $case $($response.status)"}
  }
  $nativeSeat=Seat-Snapshot 17451;$legacySeat=Seat-Snapshot 17452
  if((Canon $nativeSeat) -cne (Canon $legacySeat)){throw "Roster semantic parity $case"}
  if($case -eq 'same-class'){
   if((Canon $nativeSeat.layout) -cne (Canon $seedSeat.layout) -or (Canon $nativeSeat.groups) -cne (Canon $seedSeat.groups) -or (Canon $nativeSeat.teacherAvatar) -cne (Canon $seedSeat.teacherAvatar) -or @($nativeSeat.assignments).Count -ne 1 -or $nativeSeat.assignments[0].studentId -ne 'm1' -or $nativeSeat.students[0].name -cne '새 이름' -or @($nativeSeat.roster).Count -ne 3 -or $nativeSeat.historyTransition -or @($nativeSeat.previousAssignments).Count -ne 0){throw 'Roster preservation failed'}
  }elseif($case -eq 'new-class'){
   if(!$nativeSeat.rosterOnly -or @($nativeSeat.students).Count -ne 0 -or @($nativeSeat.assignments).Count -ne 0 -or @($nativeSeat.groups).Count -ne 0 -or $nativeSeat.classId -ne 'LAB_B'){throw 'New class retained stale geometry'}
  }else{
   if((Raw-Request 17451 '/api/seating').headers['X-TT-Seating-Revision'] -cne $seedRev){throw "Rejected seat changed $case"}
  }
  Write-Host "PASS native seating/roster $case"
 }
 if((Raw-Request 17451 '/api/coins').hash -cne $after.hash){throw 'Roster altered coins'}
 if((Coin-Post 17451 $batch $after.headers['X-TT-Coin-Revision'] $seedRev).status -ne 'HTTP/1.1 409 Conflict'){throw 'Old seat revision not rejected after roster'}
 # 4B-3: notice log parity, absent file, existing file, Unicode and invalid requests.
 foreach($port in @(17451,17452)){
  $path=Join-Path $stores[$port] 'notice.log'
  if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}
  $empty=Raw-Request $port '/api/notice'
  if($empty.status -ne 'HTTP/1.1 200 OK' -or $empty.body.Length -ne 0){throw "Notice absent file $port"}
 }
 $notice1='{"id":"lab-1","text":"내일 준비물: 색연필 🎨","done":false}'
 $notice2='{"id":"lab-1","text":"수정한 알림","done":true}'
 foreach($case in @('create','cross-site','invalid-json','append')){
  $before=(Raw-Request 17451 '/api/notice').hash
  $answers=@()
  foreach($port in @(17451,17452)){
   $response=switch($case){
    'create'{Seat-Post $port '/api/notice' $notice1}
    'cross-site'{Seat-Post $port '/api/notice' $notice2 'cross-site'}
    'invalid-json'{Seat-Post $port '/api/notice' '{"id":'}
    'append'{Seat-Post $port '/api/notice' $notice2}
   }
   $answers+=@($response)
  }
  $expected=switch($case){'cross-site'{403}'invalid-json'{502}default{200}}
  if($answers[0].status -notmatch ("^HTTP/1.1 "+$expected+" ") -or $answers[0].status -cne $answers[1].status -or $answers[0].hash -cne $answers[1].hash){throw "Notice POST parity $case"}
  $n=Raw-Request 17451 '/api/notice';$l=Raw-Request 17452 '/api/notice'
  if($n.hash -cne $l.hash){throw "Notice ledger parity $case"}
  if($expected -ne 200 -and $n.hash -cne $before){throw "Denied notice altered file $case"}
  Write-Host "PASS native notice $case"
 }
 $noticeRaw=Raw-Request 17451 '/api/notice'
 if([Text.Encoding]::UTF8.GetString($noticeRaw.body) -cne ($notice1+[char]10+$notice2+[char]10)){throw 'Notice raw bytes mismatch'}
 if((Raw-Request 17451 '/api/notice' GET '' 'cross-site').status -ne 'HTTP/1.1 403 Forbidden'){throw 'Notice cross-site read'}
 if((Raw-Request 17451 '/notice.log').status -ne 'HTTP/1.1 404 Not Found'){throw 'Notice raw file exposed'}
 if((Raw-Request 17451 '/api/coins').hash -cne $after.hash){throw 'Notice changed coins'}
 Write-Host 'PASS native notice UTF8 append parity and protected read'
 $persist=(Raw-Request 17451 '/api/seating').hash
 Set-Content (Join-Path $roots[17451] 'native-read-server.stop') 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Coin server clean stop'}
 if((Get-FileHash (Join-Path $stores[17451] 'seating.json')).Hash -cne $persist){throw 'Seat persisted hash mismatch'}
 if((Get-FileHash (Join-Path $stores[17451] 'notice.log')).Hash -cne $noticeRaw.hash){throw 'Notice persisted hash mismatch'}
 Write-Host 'PASS native seating/roster geometry, exclusions, class isolation, stale seat and coin preservation'
 Write-Host 'PASS native notice exact persisted bytes'
 # 4B-4a: forced process death at the real atomic file replacement boundary.
 $crashRoot=$roots[17451];$crashStore=$stores[17451]
 $env:HOJA_LAB_ROOT=$crashRoot;$env:LOCALAPPDATA=Join-Path $crashRoot 'local'
 $stopFile=Join-Path $crashRoot 'native-read-server.stop'
 $readyFile=Join-Path $crashRoot 'native-read-server.ready'
 $control=Join-Path $crashRoot 'native-crash-control'
 $reached=Join-Path $crashRoot 'native-crash-reached'
 $sentinel=Join-Path $crashStore 'coins.log.native-unrelated.tmp'
 Set-Content -LiteralPath $sentinel 'keep' -Encoding ASCII
 function Start-CrashServer{
  Remove-Item $stopFile,$readyFile,$control,$reached -Force -ErrorAction SilentlyContinue
  $proc=Start-Process -FilePath $exe -ArgumentList '--lab-coin-server' -PassThru -WindowStyle Hidden
  $null=$proc.Handle
  try{
   for($i=0;$i -lt 80;$i++){
    if($proc.HasExited){throw "Crash server exited $($proc.ExitCode)"}
    if((Test-Path $readyFile) -and (Get-Content $readyFile -Raw).Trim() -eq [string]$proc.Id){
     if((Raw-Request 17451 '/health').status -eq 'HTTP/1.1 200 OK' -and (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17451 -State Listen).OwningProcess -eq $proc.Id){return $proc}
    }
    Start-Sleep -Milliseconds 100
   }
   throw 'Crash server readiness'
  }catch{if(!$proc.HasExited){$proc.Kill();$proc.WaitForExit()};throw}
 }
 function Hash-Bytes([byte[]]$value){
  $sha=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($sha.ComputeHash($value)).Replace('-','')}finally{$sha.Dispose()}
 }
 function Snapshot-CrashFiles{
  $out=@{}
  foreach($name in @('coins.log','seating.json','notice.log')){$out[$name]=[IO.File]::ReadAllBytes((Join-Path $crashStore $name))}
  return $out
 }
 $native=Start-CrashServer
 foreach($name in @('coins.log','seating.json','notice.log')){
  foreach($stage in @('before','after')){
   $before=Snapshot-CrashFiles
   $coinRev=(Hash-Bytes $before['coins.log']).ToLowerInvariant()
   $seatRev=(Hash-Bytes $before['seating.json']).ToLowerInvariant()
   $route=switch($name){'coins.log'{'/api/coins'}'seating.json'{'/api/seating'}'notice.log'{'/api/notice'}}
   $text=switch($name){
    'coins.log'{'{"type":"spend","id":"lab1","amount":-1,"op":"crash-'+$stage+'"}'}
    'seating.json'{$seatDoc.Replace('LAB_A','LAB_CRASH_'+$stage)}
    'notice.log'{'{"id":"crash-'+$stage+'","text":"crash fixture"}'}
   }
   $expected=if($name -eq 'seating.json'){[Text.Encoding]::UTF8.GetBytes($text)}else{[byte[]]($before[$name]+[Text.Encoding]::UTF8.GetBytes($text+[char]10))}
   $expectedHash=Hash-Bytes $expected
   Set-Content -LiteralPath $control ($name+':'+$stage) -Encoding ASCII
   $payload=B64 $text
   $nl=[string][char]13+[char]10
   $wire=[Text.Encoding]::ASCII.GetBytes(("POST $route HTTP/1.1"+$nl+"Host: 127.0.0.1:17451"+$nl+"Sec-Fetch-Site: same-origin"+$nl+"Origin: http://127.0.0.1:17451"+$nl+"X-TT-Coin-Revision: $coinRev"+$nl+"X-TT-Seating-Revision: $seatRev"+$nl+"Content-Length: "+$payload.Length+$nl+"Connection: close"+$nl+$nl+$payload))
   $client=[Net.Sockets.TcpClient]::new()
   try{
    $client.Connect('127.0.0.1',17451);$client.GetStream().Write($wire,0,$wire.Length)
    $hit=$false
    for($i=0;$i -lt 100;$i++){
     if($native.HasExited){throw 'Server died before checkpoint'}
     if((Test-Path $reached) -and (Get-Content $reached -Raw) -ceq ($name+':'+$stage)){$hit=$true;break}
     Start-Sleep -Milliseconds 50
    }
    if(!$hit){throw "Crash checkpoint not reached $name $stage"}
    $native.Kill();if(!$native.WaitForExit(10000)){throw 'Crash kill timeout'}
   }finally{$client.Dispose()}
   $native=Start-CrashServer
   foreach($file in @('coins.log','seating.json','notice.log')){
    $hash=if($file -eq $name -and $stage -eq 'after'){$expectedHash}else{Hash-Bytes $before[$file]}
    if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne $hash){throw "Crash recovery hash mismatch $name $stage $file"}
   }
   $read=Raw-Request 17451 $route
   $want=if($stage -eq 'after'){$expectedHash}else{Hash-Bytes $before[$name]}
   if($read.hash -cne $want){throw 'Crash restart API mismatch'}
   if($name -eq 'coins.log' -and $stage -eq 'after' -and (Coin-Post 17451 $payload $coinRev $seatRev).status -ne 'HTTP/1.1 409 Conflict'){throw 'Committed coin retry accepted'}
   if(@(Get-ChildItem -LiteralPath $crashStore -File|Where-Object {$_.Name -match '^(coins\.log|seating\.json|notice\.log)\.native-[a-f0-9]{32}\.tmp$'}).Count -ne 0 -or !(Test-Path $sentinel)){throw 'Unsafe staging recovery'}
   Write-Host "PASS native crash recovery $name $stage"
  }
 }
 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Crash server final stop'}
 Write-Host 'PASS all six native atomic-write process-crash cases, restart readback and scoped staging cleanup'
 # 4B-4b: full original board and pinned real mini-game, with native HTTP only.
 $uiExe=Join-Path $Build 'HOJA-Native-Storage-UI-Lab.exe'
 & $csc /nologo /codepage:65001 /define:NATIVE_STORAGE_LAB /target:winexe /platform:x64 "/out:$uiExe" "/reference:$Build\Microsoft.Web.WebView2.Core.dll" "/reference:$Build\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'host.cs')
 if($LASTEXITCODE -ne 0){throw 'Native storage UI compilation failed'}
 $crashRoot=Join-Path $LabRoot ('hoja-webview-lab-'+[guid]::NewGuid().ToString('N'))
 $env:HOJA_LAB_ROOT=$crashRoot;$env:LOCALAPPDATA=Join-Path $crashRoot 'local'
 $crashStore=Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal'
 New-Item -ItemType Directory -Path $crashStore -Force|Out-Null
 Get-ChildItem -LiteralPath $Runtime -File|ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $crashStore}
 foreach($name in @('board-mode.json','notice.log')){Remove-Item -LiteralPath (Join-Path $crashStore $name) -Force -ErrorAction SilentlyContinue}
 $stopFile=Join-Path $crashRoot 'native-read-server.stop'
 $readyFile=Join-Path $crashRoot 'native-read-server.ready'
 $control=Join-Path $crashRoot 'native-crash-control'
 $reached=Join-Path $crashRoot 'native-crash-reached'
 Set-Content (Join-Path $crashRoot 'coin-write-fixture.flag') 'fixture' -Encoding ASCII
 $at=[DateTime]::UtcNow.ToString('o')
 $seed=@('{"type":"LAB_SENTINEL"}',(@{type='setting';cls='LAB_CLASS';at=$at;enabled=$true;weeklyOn=$false;cap=20}|ConvertTo-Json -Compress),(@{type='grant';cls='LAB_CLASS';at=$at;id='lab1';name='LAB_STUDENT';amount=5;source='lab-seed'}|ConvertTo-Json -Compress),(@{type='grant';cls='LAB_CLASS';at=$at;id='lab2';name='LAB_STUDENT_TWO';amount=5;source='lab-seed'}|ConvertTo-Json -Compress))
 $utf8=[Text.UTF8Encoding]::new($false)
 [IO.File]::WriteAllText((Join-Path $crashStore 'coins.log'),($seed -join [Environment]::NewLine)+[Environment]::NewLine,$utf8)
 [IO.File]::WriteAllText((Join-Path $crashStore 'seating.json'),'{"classId":"LAB_CLASS","className":"LAB_CLASS","students":[{"id":"lab1","name":"LAB_STUDENT"},{"id":"lab2","name":"LAB_STUDENT_TWO"}],"assignments":[{"studentId":"lab1","seatId":"s1"},{"studentId":"lab2","seatId":"s2"}],"layout":{"rows":1,"cols":2}}',$utf8)
 $seatHash=(Get-FileHash (Join-Path $crashStore 'seating.json')).Hash
 if($legacy -and !$legacy.HasExited){$legacy.Kill();$legacy.WaitForExit()}
 foreach($port in @(17449,17450,17452)){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw "Unexpected legacy listener $port"}}
 $native=Start-CrashServer
 $ui=$null
 try{
  $result=Join-Path $crashRoot 'result.txt';$profile=Join-Path $crashRoot 'profile'
  $ui=Start-Process -FilePath $uiExe -ArgumentList ('--self-test "'+$profile+'" "'+$result+'"') -PassThru
  $null=$ui.Handle
  if(!$ui.WaitForExit(180000)){throw 'Native storage UI timed out'}
  if(Test-Path (Join-Path $crashRoot 'real-game.trace')){Get-Content (Join-Path $crashRoot 'real-game.trace')}
  if(!(Test-Path $result)){throw 'Native storage UI missing result'}
  Get-Content $result
  if($ui.ExitCode -ne 0 -or !(Test-Path (Join-Path $crashRoot 'real-game.pass'))){throw 'Native storage UI failed'}
  if((Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17451 -State Listen).OwningProcess -ne $native.Id){throw 'Native storage listener changed'}
  $events=@(Get-Content (Join-Path $crashStore 'coins.log') -Encoding UTF8|ForEach-Object {$_|ConvertFrom-Json})
  $spends=@($events|Where-Object {$_.type -eq 'spend'})
  $refunds=@($events|Where-Object {$_.type -eq 'refund'})
  if($events.Count -ne 15 -or $spends.Count -ne 5 -or $refunds.Count -ne 5){throw 'Native UI ledger count'}
  foreach($event in $spends){if(@($refunds|Where-Object {$_.charge -eq $event.charge -and $_.id -eq $event.id -and $_.amount -eq -$event.amount}).Count -ne 1){throw 'Native UI refund match'}}
  $duo=@($spends|Group-Object charge|Where-Object {$_.Count -eq 2})
  if($duo.Count -ne 1 -or @($duo[0].Group|Where-Object {$_.amount -ne -0.5}).Count -ne 0 -or (($duo[0].Group.id|Sort-Object) -join ',') -ne 'lab1,lab2'){throw 'Native UI duo debit denomination'}
  $solo=@($spends|Group-Object charge|Where-Object {$_.Count -eq 1}|ForEach-Object {$_.Group})
  if($solo.Count -ne 3 -or @($solo|Where-Object {$_.id -ne 'lab1' -or $_.amount -ne -1}).Count -ne 0){throw 'Native UI solo debit denomination'}
  foreach($person in @(@{id='lab1';balance=14},@{id='lab2';balance=10})){
   $sum=($events|Where-Object {$_.cls -eq 'LAB_CLASS' -and $_.id -eq $person.id}|Measure-Object amount -Sum).Sum
   if(($sum*2) -ne $person.balance){throw 'Native UI final balance'}
  }
  if((Get-FileHash (Join-Path $crashStore 'seating.json')).Hash -cne $seatHash){throw 'Native UI seat mutated'}
  $notice=@(Get-Content (Join-Path $crashStore 'notice.log') -Encoding UTF8|ForEach-Object {$_|ConvertFrom-Json})
  if($notice.Count -ne 1 -or $notice[0].id -ne 'lab-ui' -or $notice[0].text -ne 'LAB_NOTICE'){throw 'Native UI notice ledger'}
  Write-Host 'PASS actual WebView2 and pinned real mini-game native server only: exact 15 rows, solo/duo/timed refunds, final balances and unchanged seat, browser notice write'
 }finally{
  if($ui -and !$ui.HasExited){$ui.Kill();$ui.WaitForExit()}
 }
 # 4C-1: manager connection and theme contract. No presentation readiness claim.
 # Actual dashboard can now poll presentation; wait for the last live poll to expire.
 Start-Sleep -Milliseconds 5100
 $manager='https://xkdtndbrwk111-prog.github.io'
 function Status-Doc{
  $r=Raw-Request 17451 '/api/board-status' GET '' 'cross-site' $manager
  if($r.status -ne 'HTTP/1.1 200 OK' -or $r.headers['Access-Control-Allow-Origin'] -cne $manager -or $r.headers['Access-Control-Allow-Private-Network'] -ne 'true'){throw 'Manager status CORS'}
  ConvertFrom-Json ([Text.Encoding]::UTF8.GetString($r.body))
 }
 $status=Status-Doc
 if($status.wallpaper -or $status.presentationReady -or $status.rosterProtocol -ne 1 -or $status.coinProtocol -ne 3 -or $status.mode -ne ''){throw 'Offline status contract'}
 $mode=Join-Path $crashStore 'board-mode.json'
 foreach($m in @('window','wallpaper')){
  $doc=@{mode=$m;release='2026-11-25-V1.66.43-STABLE-PILOT';window=123;pid=$PID}|ConvertTo-Json -Compress
  [IO.File]::WriteAllText($mode,$doc,$utf8)
  $status=Status-Doc
  if(!$status.wallpaper -or $status.mode -ne $m -or $status.presentationReady -or !$status.screen -or $status.screen.width -le 0){throw "Online status $m"}
  if($status.PSObject.Properties.Name -contains 'pid' -or $status.PSObject.Properties.Name -contains 'window'){throw 'Private process metadata exposed'}
  [IO.File]::SetLastWriteTimeUtc($mode,[DateTime]::UtcNow.AddSeconds(-14))
  if((Status-Doc).wallpaper){throw 'Stale heartbeat accepted'}
 }
 Remove-Item -LiteralPath $mode -Force
 foreach($route in @('/api/board-status','/api/theme')){
  $pre=Raw-Request 17451 $route OPTIONS '' 'cross-site' $manager
  if($pre.status -ne 'HTTP/1.1 204 No Content' -or $pre.headers['Access-Control-Allow-Origin'] -cne $manager -or $pre.body.Length -ne 0){throw 'Preflight contract'}
  $denied=Raw-Request 17451 $route GET '' 'cross-site' 'https://evil.invalid'
  if($denied.status -ne 'HTTP/1.1 403 Forbidden' -or $denied.headers['Access-Control-Allow-Origin']){throw 'Unexpected CORS'}
 }
 if((Raw-Request 17451 '/api/theme' GET '' 'cross-site' $manager).status -ne 'HTTP/1.1 503 Service Unavailable'){throw 'Theme advertised before publish'}
 $theme='{"version":1,"theme":"custom","font":"Arial","custom":{"bg":"#AABBCC","panel":"#FFFFFF","text":"#222222","accent":"#CC8844","modal":"#112233"},"extra":"ignored"}'
 $r=Raw-Request 17451 '/api/theme/publish' POST '' 'same-origin' 'http://127.0.0.1:17451' $theme
 if($r.status -ne 'HTTP/1.1 200 OK'){throw 'Theme publish failed'}
 $r=Raw-Request 17451 '/api/theme' GET '' 'cross-site' $manager
 $v=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString($r.body))
 if($r.status -ne 'HTTP/1.1 200 OK' -or $v.theme -ne 'custom' -or $v.custom.bg -cne '#aabbcc' -or $v.font -ne 'Arial' -or $v.PSObject.Properties.Name -contains 'extra'){throw 'Theme sanitize'}
 $hash=$r.hash
 foreach($case in @('invalid','foreign')){
  $r=if($case -eq 'invalid'){Raw-Request 17451 '/api/theme/publish' POST '' 'same-origin' 'http://127.0.0.1:17451' ($theme.Replace('#AABBCC','bad'))}else{Raw-Request 17451 '/api/theme/publish' POST '' 'cross-site' $manager $theme}
  $expected=if($case -eq 'invalid'){400}else{403}
  if($r.status -notmatch ("^HTTP/1.1 "+$expected+" ") -or (Raw-Request 17451 '/api/theme' GET '' 'cross-site' $manager).hash -cne $hash){throw 'Theme denial or state changed'}
 }
 Write-Host 'PASS native board status heartbeat/mode/screen, manager CORS/preflight, sanitized theme and denied publish'
 # 4C-2: transient presentation protocol and exact offline ZIP asset contract.
 $manager='https://xkdtndbrwk111-prog.github.io'
 $boardOrigin='http://127.0.0.1:17451'
 function PReq([string]$route,[string]$method='GET',[string]$payload='', [switch]$Board){
  $site=if($Board){'same-origin'}else{'cross-site'}
  $origin=if($Board){$boardOrigin}else{$manager}
  $r=Raw-Request 17451 ("/api/presentation/"+$route) $method '' $site $origin $payload
  if(!$Board -and ($r.headers['Access-Control-Allow-Origin'] -cne $manager -or $r.headers['Access-Control-Allow-Methods'] -cne 'GET, POST, OPTIONS' -or $r.headers['Access-Control-Allow-Headers'] -cne 'Content-Type')){throw "Presentation CORS $route"}
  return $r
 }
 function Assert-P($r,[int]$code,[string]$body=''){
  if($r.status -notmatch ("^HTTP/1.1 "+$code+" ")){throw "Presentation status expected $code actual $($r.status)"}
  if($body -and ([Text.Encoding]::UTF8.GetString($r.body) -cne $body)){throw "Presentation body mismatch $body"}
 }
 function Present-Body([string]$id,[string]$kind){B64 ('{"id":"'+$id+'","kind":"'+$kind+'","payload":{"student":"LAB_PRESENT_PRIVATE"}}')}
 $a='11111111111111111111111111111111';$b='22222222222222222222222222222222';$c='33333333333333333333333333333333';$d='44444444444444444444444444444444'
 $snapshot=Snapshot-CrashFiles
 Assert-P (PReq 'send' POST (Present-Body $a 'seating')) 409 '{"error":"board unavailable"}'
 Assert-P (PReq 'send' OPTIONS) 204
 Assert-P (PReq 'poll' GET '' -Board) 200 '{"id":null}'
 if(!(Status-Doc).presentationReady){throw 'Live board poll not advertised'}
 Assert-P (PReq 'send' POST (Present-Body $a 'seating')) 200 ('{"id":"'+$a+'"}')
 Assert-P (PReq ('receipt?id='+$a)) 200 '{"state":"pending"}'
 $poll=PReq 'poll' GET '' -Board
 $data=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString($poll.body))
 if($data.id -cne $a -or $data.data.kind -cne 'seating' -or $data.data.payload.student -cne 'LAB_PRESENT_PRIVATE'){throw 'Presentation payload mismatch'}
 Assert-P (PReq 'ack' POST ($a+':displayed') -Board) 200 '{"ok":true}'
 Assert-P (PReq ('receipt?id='+$a)) 200 '{"state":"displayed"}'
 Assert-P (PReq 'send' POST (Present-Body $a 'seating')) 409 '{"error":"duplicate"}'
 Assert-P (PReq 'send' POST (Present-Body $b 'pe')) 200 ('{"id":"'+$b+'"}')
 Assert-P (PReq ('receipt?id='+$a)) 200 '{"state":"superseded"}'
 Assert-P (PReq 'ack' POST ($a+':closed') -Board) 409 '{"error":"stale"}'
 Assert-P (PReq 'ack' POST ($b+':failed') -Board) 200 '{"ok":true}'
 Assert-P (PReq ('receipt?id='+$b)) 200 '{"state":"failed"}'
 Assert-P (PReq 'send' POST (Present-Body $c 'life-qr')) 200 ('{"id":"'+$c+'"}')
 Assert-P (PReq 'close' POST $c) 200 '{"ok":true}'
 Assert-P (PReq ('receipt?id='+$c)) 200 '{"state":"closed"}'
 Assert-P (PReq 'poll' GET '' -Board) 200 '{"id":null}'
 Assert-P (PReq 'send' POST (Present-Body $d 'invalid')) 400
 Assert-P (Raw-Request 17451 '/api/presentation/poll' GET '' 'cross-site' $manager) 403
 Assert-P (Raw-Request 17451 '/api/presentation/send' POST '' 'cross-site' 'https://evil.invalid' (Present-Body $d 'seating')) 403
 Assert-P (PReq 'send' POST (Present-Body $d 'seating')) 200
 Start-Sleep -Milliseconds 5100
 if((Status-Doc).presentationReady){throw 'Expired board poll still ready'}
 Assert-P (PReq ('receipt?id='+$d)) 200 '{"state":"expired"}'
 Assert-P (PReq 'poll' GET '' -Board) 200 '{"id":null}'
 foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $snapshot[$file])){throw 'Presentation mutated persisted data'}}
 Write-Host 'PASS native presentation pending/displayed/superseded/failed/closed/expired, duplicate/stale rejection, manager-only receipt, board-only payload and persistent data unchanged'
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $archive=[IO.Compression.ZipFile]::OpenRead((Join-Path $crashStore 'presentation-assets.zip'))
 try{
  $entries=@($archive.Entries|Where-Object {$_.FullName -cmatch '^(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(html|css|js|mjs|png|svg|txt)$' -and $_.Length -le 2097152})
  if($entries.Count -lt 1){throw 'Missing presentation ZIP entries'}
  $sample=@($entries|Where-Object {$_.FullName -match '\.(html|css|mjs|js)$'}|Select-Object -First 8)
  $webp=$archive.Entries|Where-Object {$_.FullName -cmatch '^shared/assets/(playback|students|teacher)/[A-Za-z0-9_-]+\.webp$' -and $_.Length -le 2097152}|Select-Object -First 1
  if(!$webp){throw 'Missing presentation WebP fallback fixture'}
  $sample+=@($webp)
  foreach($entry in $sample){
   $route='/presentation/'+$entry.FullName
   if($entry -eq $webp){$route=$route.Substring(0,$route.Length-5)+'.png'}
   $input=$entry.Open();$buffer=[IO.MemoryStream]::new()
   try{$input.CopyTo($buffer);$hash=Hash-Bytes $buffer.ToArray()}finally{$input.Dispose();$buffer.Dispose()}
   $r=Raw-Request 17451 $route GET '' 'same-origin'
   if($r.status -ne 'HTTP/1.1 200 OK' -or $r.hash -cne $hash){throw "Presentation ZIP parity $route"}
   if($entry -eq $webp -and $r.headers['Content-Type'] -cne 'image/webp'){throw 'WebP fallback MIME'}
  }
 }finally{$archive.Dispose()}
 foreach($file in @('presentation-board.js','presentation-board.css')){
  $r=Raw-Request 17451 ('/'+$file) GET '' 'same-origin'
  if($r.status -ne 'HTTP/1.1 200 OK' -or $r.hash -cne (Get-FileHash (Join-Path $crashStore $file)).Hash){throw "Presentation static parity $file"}
 }
 Assert-P (Raw-Request 17451 '/presentation-assets.zip') 404
 Assert-P (Raw-Request 17451 '/presentation/../coins.log') 400
 Assert-P (Raw-Request 17451 '/presentation-board.js' GET '' 'cross-site') 403
 Write-Host 'PASS native offline presentation static and ZIP assets, WebP fallback, traversal and external access rejection'

 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Native UI server stop'}



}finally{
 foreach($proc in @($native,$legacy)){if($proc -and !$proc.HasExited){$proc.Kill();$proc.WaitForExit()}}
 $env:HOJA_LAB_ROOT=$envRoot;$env:LOCALAPPDATA=$envLocal
}
