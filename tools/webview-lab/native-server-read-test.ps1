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
function Raw-Request([int]$port,[string]$path,[string]$method='GET',[string]$hostName='', [string]$site='', [string]$origin='', [string]$payload='', [string]$coinRevision='', [string]$seatRevision='', [string]$backupToken=''){
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
  if($backupToken){$request+="X-TT-Backup-Token: $backupToken"+$nl}
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
 # The actual dashboard now publishes its real theme. Verify it before resetting
 # transient state for independent cold-start status/theme/presentation tests.
 $manager='https://xkdtndbrwk111-prog.github.io'
 $published=Raw-Request 17451 '/api/theme' GET '' 'cross-site' $manager
 if($published.status -ne 'HTTP/1.1 200 OK' -or $published.headers['Access-Control-Allow-Origin'] -cne $manager){throw 'Actual board theme publication missing'}
 $themeDoc=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString($published.body))
 if($themeDoc.version -ne 1 -or $themeDoc.theme -notin @('dark','sky','pink','green','black','custom') -or $themeDoc.font -isnot [string]){throw 'Actual board theme contract'}
 Write-Host 'PASS actual WebView2 board publishes theme to native server'
 $beforeReset=Snapshot-CrashFiles
 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Native UI reset stop failed'}
 $native=Start-CrashServer
 foreach($file in @('coins.log','seating.json','notice.log')){
  if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $beforeReset[$file])){throw 'Transient reset mutated persistent data'}
 }
 # 4C-1: independent cold-start manager connection and theme contract.
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
 # 4C-3: run only after all earlier native API/asset/mini-game checks pass.
 # Restart the same isolated server to discard synthetic presentation receipts/heartbeat.
 $native=Start-CrashServer
 $managerExe=Join-Path $Build 'HOJA-Native-Manager-UI-Lab.exe'
 & $csc /nologo /codepage:65001 /define:NATIVE_STORAGE_LAB,NATIVE_MANAGER_LAB /target:winexe /platform:x64 "/out:$managerExe" "/reference:$Build\Microsoft.Web.WebView2.Core.dll" "/reference:$Build\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'host.cs')
 if($LASTEXITCODE -ne 0){throw 'Native manager UI compilation failed'}
 $managerHost=$null
 try{
  foreach($file in @('manager.ready','manager.close','manager.done','result.txt')){Remove-Item -LiteralPath (Join-Path $crashRoot $file) -Force -ErrorAction SilentlyContinue}
  $coinBefore=(Get-FileHash (Join-Path $crashStore 'coins.log')).Hash
  $noticeBefore=(Get-FileHash (Join-Path $crashStore 'notice.log')).Hash
  $profile=Join-Path $crashRoot 'manager-profile';$result=Join-Path $crashRoot 'manager-result.txt'
  if((Status-Doc).presentationReady){throw 'Fresh server presentation state not empty'}
  $managerHost=Start-Process -FilePath $managerExe -ArgumentList ('--self-test "'+$profile+'" "'+$result+'"') -PassThru
  $null=$managerHost.Handle
  for($i=0;$i -lt 240 -and !(Test-Path (Join-Path $crashRoot 'manager.ready'));$i++){
   if($managerHost.HasExited){throw ('Native manager host exited: '+(Get-Content $result -ErrorAction SilentlyContinue))}
   Start-Sleep -Milliseconds 250
  }
  if(!(Test-Path (Join-Path $crashRoot 'manager.ready'))){throw 'Native manager ready timeout'}
  node (Join-Path $PSScriptRoot 'manager-test.cjs') $crashRoot --native-storage
  if($LASTEXITCODE -ne 0){throw 'Native manager Chrome test failed'}
  if(!$managerHost.WaitForExit(30000)){throw 'Native manager host timed out'}
  if(!(Test-Path $result)){throw 'Native manager result missing'}
  Get-Content $result
  if($managerHost.ExitCode -ne 0){throw 'Native manager host failed'}
  $seat=Get-Content -LiteralPath (Join-Path $crashStore 'seating.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($seat.classId -ne 'LAB_CLASS_2' -or @($seat.students).Count -ne 2 -or @($seat.assignments).Count -ne 2 -or @($seat.students|Where-Object {$_.id -eq 'm1' -and $_.name -eq 'LAB_MANAGER_RENAMED'}).Count -ne 1 -or @($seat.assignments|Where-Object {$_.studentId -eq 'm1' -and $_.seatId -eq 's1'}).Count -ne 1){throw 'Native manager final seat mismatch'}
  if((Get-FileHash (Join-Path $crashStore 'coins.log')).Hash -cne $coinBefore -or (Get-FileHash (Join-Path $crashStore 'notice.log')).Hash -cne $noticeBefore){throw 'Native manager mutated unrelated ledger'}
  if((Status-Doc).wallpaper){throw 'Closed native manager host still connected'}
  if((Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17451 -State Listen).OwningProcess -ne $native.Id){throw 'Native manager listener ownership'}
  foreach($port in @(17449,17450,17452)){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw "Legacy listener unexpectedly active $port"}}
  Write-Host 'PASS actual Chrome manager native C# only: seating, roster, confirmation auto-send, seating and PE displayed receipts, close and ledger preservation'
 }finally{
  if($managerHost -and !$managerHost.HasExited){$managerHost.Kill();$managerHost.WaitForExit()}
 }
 # 4D-1: school settings and deterministic NEIS responses. No live network.
 $schoolFile=Join-Path $crashStore 'school.json'
 $weatherFile=Join-Path $crashStore 'weather-place.json'
 Remove-Item -LiteralPath $schoolFile -Force -ErrorAction SilentlyContinue
 $fixtureDir=Join-Path $crashRoot 'neis-fixtures'
 New-Item -ItemType Directory -Path $fixtureDir -Force|Out-Null
 Set-Content (Join-Path $crashRoot 'neis-fixture.flag') 'fixture-only' -Encoding ASCII
 function Put-Neis([string]$endpoint,[string]$query,[object[]]$rows,[int]$total=-1){
  if($total -lt 0){$total=$rows.Count}
  $obj=@{};$obj[$endpoint]=@(@{head=@(@{list_total_count=$total})},@{row=@($rows)})
  $key=(Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($endpoint+'?'+$query))).ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $fixtureDir ($key+'.json')),($obj|ConvertTo-Json -Depth 12 -Compress),$utf8)
 }
 function School-Doc([string]$route){
  $r=Raw-Request 17451 $route GET '' 'same-origin'
  if($r.status -ne 'HTTP/1.1 200 OK'){throw "School request $route $($r.status)"}
  ConvertFrom-Json ([Text.Encoding]::UTF8.GetString($r.body))
 }
 $beforeSchool=Snapshot-CrashFiles
 $empty=School-Doc '/api/school'
 if($null -ne $empty.school -or $empty.template -ne '1-vejhJz909ivFnhzNRkpbd31BSJsElEPzXUYkONdJRQ'){throw 'Empty school settings'}
 if(@((School-Doc '/api/meal?date=20261123').rows).Count -ne 0){throw 'Unconfigured school meal'}
 $name='시험초등학교'
 $escaped=[uri]::EscapeDataString($name)
 Put-Neis 'schoolInfo' ('SCHUL_NM='+$escaped+'&ATPT_OFCDC_SC_CODE=B10') @(@{ATPT_OFCDC_SC_CODE='B10';SD_SCHUL_CODE='1234567';SCHUL_NM=$name;SCHUL_KND_SC_NM='초등학교';ORG_RDNMA='시험 주소'})
 $search=School-Doc ('/api/school/search?q='+$escaped+'&office=B10')
 if($search.total -ne 1 -or $search.rows[0].name -cne $name -or $search.rows[0].code -cne '1234567'){throw 'NEIS school search mapping'}
 $school='{"office":"B10","code":"1234567","name":"시험초등학교","kind":"초등학교","address":"시험 주소","grade":"6","cls":"1","sheet":""}'
 [IO.File]::WriteAllText($weatherFile,'{"lab":true}',$utf8)
 Assert-P (Seat-Post 17451 '/api/school' $school) 200 '{"ok":true}'
 if(Test-Path $weatherFile){throw 'School change did not clear cached weather place'}
 if([IO.File]::ReadAllText($schoolFile,$utf8) -cne $school -or (School-Doc '/api/school').school.name -cne $name){throw 'School raw persistence'}
 $schoolHash=(Get-FileHash $schoolFile).Hash
 Assert-P (Seat-Post 17451 '/api/school' ($school.Replace('1234567','bad'))) 400
 Assert-P (Seat-Post 17451 '/api/school' $school 'cross-site') 403
 Assert-P (Raw-Request 17451 '/school.json') 404
 if((Get-FileHash $schoolFile).Hash -cne $schoolHash){throw 'Rejected school changed data'}
 $prefix='ATPT_OFCDC_SC_CODE=B10&SD_SCHUL_CODE=1234567&'
 # A truncated range omits Monday. Also contains an older day, weekend, duplicate.
 Put-Neis 'mealServiceDietInfo' ($prefix+'MLSV_FROM_YMD=20261123&MLSV_TO_YMD=20261202&MMEAL_SC_CODE=2') @(
  @{MLSV_YMD='20261120';DDISH_NM='old'},@{MLSV_YMD='20261124';DDISH_NM='화요일'},@{MLSV_YMD='20261124';DDISH_NM='duplicate'},@{MLSV_YMD='20261128';DDISH_NM='weekend'},@{MLSV_YMD='20261125';DDISH_NM='수요일'}
 )
 Put-Neis 'mealServiceDietInfo' ($prefix+'MLSV_FROM_YMD=20261123&MLSV_TO_YMD=20261123&MMEAL_SC_CODE=2') @(@{MLSV_YMD='20261123';DDISH_NM='쌀밥 (1.2)<br/>국 &amp; 반찬'})
 Put-Neis 'mealServiceDietInfo' ($prefix+'MLSV_FROM_YMD=20261203&MLSV_TO_YMD=20261217&MMEAL_SC_CODE=2') @(@{MLSV_YMD='20261204';DDISH_NM='금요일'},@{MLSV_YMD='20261207';DDISH_NM='월요일'},@{MLSV_YMD='20261208';DDISH_NM='extra'})
 $meal=School-Doc '/api/meal?date=20261123'
 if(($meal.rows.date -join ',') -cne '20261123,20261124,20261125,20261204,20261207' -or $meal.rows[0].menu -cne ('쌀밥'+[char]10+'국 & 반찬') -or $meal.rows[1].menu -cne '화요일'){throw 'NEIS meal date/cleanup contract'}
 # Event cursor repeats last date, then deduplicates and excludes Saturday holidays.
 Put-Neis 'SchoolSchedule' ($prefix+'AA_FROM_YMD=20261123&AA_TO_YMD=20270107') @(
  @{AA_YMD='20261123';EVENT_NM='행사1'},@{AA_YMD='20261124';EVENT_NM='행사2'},@{AA_YMD='20261125';EVENT_NM='행사3'},@{AA_YMD='20261126';EVENT_NM='행사4'},@{AA_YMD='20261128';EVENT_NM='토요휴업일'}
 )
 Put-Neis 'SchoolSchedule' ($prefix+'AA_FROM_YMD=20261128&AA_TO_YMD=20270107') @(@{AA_YMD='20261128';EVENT_NM='토요휴업일'},@{AA_YMD='20261201';EVENT_NM='행사5'})
 $events=School-Doc '/api/events?date=20261123'
 if(($events.rows.name -join ',') -cne '행사1,행사2,행사3,행사4,행사5'){throw 'NEIS event pagination/filter'}
 Assert-P (Raw-Request 17451 '/api/meal?date=20260230' GET '' 'same-origin') 502
 Assert-P (Raw-Request 17451 '/api/meal?date=20261130' GET '' 'same-origin') 502
 Assert-P (Raw-Request 17451 '/api/meal?date=20261123' GET '' 'cross-site' 'https://evil.invalid') 403
 Assert-P (Raw-Request 17451 '/%2e%2e/school.json') 400
 $js=Raw-Request 17451 '/school.js'
 if($js.status -ne 'HTTP/1.1 200 OK' -or $js.hash -cne (Get-FileHash (Join-Path $crashStore 'school.js')).Hash){throw 'School JS parity'}
 foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $beforeSchool[$file])){throw 'School altered existing ledger'}}
 Write-Host 'PASS native school settings/search, date-specific meal recovery, range extension, event pagination, upstream failure and private data guards (fixture provider)'
 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Native manager server stop'}
 $native=Start-CrashServer
 if((School-Doc '/api/school').school.name -cne $name -or (Get-FileHash $schoolFile).Hash -cne $schoolHash){throw 'School restart persistence'}
 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Native school server stop'}
 Write-Host 'PASS native school persisted through restart'
 # 4D-2: deterministic calendar and actual legacy response shapes, no network.
 $native=Start-CrashServer
 $todayFile=Join-Path $crashRoot 'neis-today.txt'
 Set-Content -LiteralPath $todayFile '20261121' -Encoding ASCII
 $baseQuery=$prefix+'AY=2026&GRADE=6&CLASS_NM=1&ALL_TI_YMD='
 for($day=23;$day -le 27;$day++){
  $q=$baseQuery+'202611'+$day
  $rows=@(1..5|ForEach-Object {@{PERIO=[string]$_;ITRT_CNTNT=('과목'+$_)}})
  if($day -eq 23){
   Put-Neis 'elsTimetable' $q $rows 7
   Put-Neis 'elsTimetable' ($q+'&PERIO=6') @(@{PERIO='6';ITRT_CNTNT='체육'})
   Put-Neis 'elsTimetable' ($q+'&PERIO=7') @(@{PERIO='7';ITRT_CNTNT='창체'})
  }else{Put-Neis 'elsTimetable' $q $rows}
 }
 $week=School-Doc '/api/week'
 if($week.referenceDate -cne '2026-11-23' -or $week.selection -cne 'next-week' -or ($week.dates -join ',') -cne '11/23,11/24,11/25,11/26,11/27' -or $week.rows.Count -ne 7 -or $week.rows[5].cells[0] -cne '체육' -or $week.rows[6].cells[0] -cne '창체' -or $week.rows[6].cells[1] -cne ''){throw 'NEIS timetable weekend/period fallback'}
 # Remove the Monday fixture: second query must be served from the one-hour cache.
 $key=(Hash-Bytes ([Text.Encoding]::UTF8.GetBytes('elsTimetable?'+$baseQuery+'20261123'))).ToLowerInvariant()
 Remove-Item -LiteralPath (Join-Path $fixtureDir ($key+'.json')) -Force
 Set-Content -LiteralPath $todayFile '20261124' -Encoding ASCII
 $cached=School-Doc '/api/week'
 if($cached.referenceDate -cne '2026-11-24' -or $cached.selection -cne 'today' -or $cached.rows[6].cells[0] -cne '창체'){throw 'NEIS timetable cache/reference'}
 $noClass=$school.Replace('"cls":"1"','"cls":""')
 Assert-P (Seat-Post 17451 '/api/school' $noClass) 200
 $missing=Raw-Request 17451 '/api/week' GET '' 'same-origin'
 Assert-P $missing 404
 if((ConvertFrom-Json ([Text.Encoding]::UTF8.GetString($missing.body))).code -ne 'WEEK_NOT_FOUND'){throw 'No class error contract'}
 Assert-P (Seat-Post 17451 '/api/school' $school) 200
 Assert-P (Raw-Request 17451 '/api/week' GET '' 'same-origin') 502
 # Public sheet fixture: only the selected weekly tab is readable.
 $sheetId='LAB_sheet_1234567890123456'
 $sheetSchool=$school.Replace('"sheet":""',('"sheet":"'+$sheetId+'"'))
 Assert-P (Seat-Post 17451 '/api/school' $sheetSchool) 200
 function Put-Sheet([string]$route,[string]$content){
  $key=(Hash-Bytes ([Text.Encoding]::UTF8.GetBytes('sheet?'+$sheetId+$route))).ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $fixtureDir ($key+'.json')),$content,$utf8)
 }
 $tabs='items.push({name:"12주(11.16 ~ 11.20)",pageUrl:"old",gid:"10"});items.push({name:"13주차(11.23 ~ 11.27)",pageUrl:"new",gid:"20"});'
 Put-Sheet '/htmlview' $tabs
 $grid=@(
  ,@('2026학년도','','','','','')
  ,@('날짜','11/23','11/24','11/25','11/26','11/27')
  ,@('요일','월','화','수','목','금')
  ,@('교육활동',('행사'+[char]10+'준비'),'','','','')
  ,@('1교시 국어','국어','수학','영어','사회','과학')
  ,@('',' 준비물 ','','','','')
 )
 $table=@(foreach($row in $grid){@{c=@(foreach($cell in $row){@{v=$cell}})}})
 $body=@{status='ok';table=@{rows=$table}}|ConvertTo-Json -Depth 12 -Compress
 Put-Sheet '/gviz/tq?tqx=out:json&headers=0&gid=20&range=A1:F30' ('google.visualization.Query.setResponse('+$body+');')
 $week=School-Doc '/api/week'
 if($week.title -cne '13주차(11.23 ~ 11.27)' -or $week.referenceDate -cne '2026-11-24' -or $week.rows[0].label -cne '1교시' -or $week.rows[0].cells[1] -cne '수학' -or $week.rows[0].notices[0] -cne '준비물' -or $week.events[0] -cne ('행사'+[char]10+'준비')){throw 'Public weekly sheet mapping'}
 Put-Sheet '/htmlview' ($tabs+'items.push({name:"중복주(11.23 ~ 11.27)",pageUrl:"dup",gid:"30"});')
 Assert-P (Raw-Request 17451 '/api/week' GET '' 'same-origin') 502
 Put-Sheet '/htmlview' 'items.push({name:"12주(11.16 ~ 11.20)",pageUrl:"old",gid:"10"});'
 Assert-P (Raw-Request 17451 '/api/week' GET '' 'same-origin') 404
 Assert-P (Raw-Request 17451 '/api/week' GET '' 'cross-site' 'https://evil.invalid') 403
 Assert-P (Seat-Post 17451 '/api/school' $school) 200
 if((Get-FileHash $schoolFile).Hash -cne $schoolHash){throw 'School settings restore'}
 Write-Host 'PASS native NEIS timetable weekend, missing 6/7 periods, cache/invalidation, public weekly sheet selection and cells/notices/events, ambiguity and missing week'
 # 4D-3a: slow provider isolation. Four independent GET requests occupy the
 # bounded remote slots while actual local read/write contracts remain responsive.
 $delayQuery=$prefix+'MLSV_FROM_YMD=20261123&MLSV_TO_YMD=20261202&MMEAL_SC_CODE=2'
 $delayKey=(Hash-Bytes ([Text.Encoding]::UTF8.GetBytes('mealServiceDietInfo?'+$delayQuery))).ToLowerInvariant()
 $delayPath=Join-Path $fixtureDir ($delayKey+'.json.delay')
 $entered=Join-Path $fixtureDir ($delayKey+'.json.entered')
 Set-Content -LiteralPath $delayPath '4000' -Encoding ASCII
 function Start-SlowMeal{
  $client=[Net.Sockets.TcpClient]::new()
  $client.ReceiveTimeout=15000;$client.Connect('127.0.0.1',17451)
  $nl=[string][char]13+[char]10
  $req='GET /api/meal?date=20261123 HTTP/1.1'+$nl+'Host: 127.0.0.1:17451'+$nl+'Sec-Fetch-Site: same-origin'+$nl+'Connection: close'+$nl+$nl
  $bytes=[Text.Encoding]::ASCII.GetBytes($req);$client.GetStream().Write($bytes,0,$bytes.Length)
  return $client
 }
 function Wait-Entered{
  for($i=0;$i -lt 100 -and !(Test-Path $entered);$i++){Start-Sleep -Milliseconds 30}
  if(!(Test-Path $entered)){throw 'Delayed provider not entered'}
 }
 $slow1=$null;$slow2=$null;$slow3=$null;$slow4=$null
 try{
  Remove-Item -LiteralPath $entered -ErrorAction SilentlyContinue
  $slow1=Start-SlowMeal;Wait-Entered
  Remove-Item -LiteralPath $entered -Force
  $slow2=Start-SlowMeal;Wait-Entered
  Remove-Item -LiteralPath $entered -Force
  $slow3=Start-SlowMeal;Wait-Entered
  Remove-Item -LiteralPath $entered -Force
  $slow4=Start-SlowMeal;Wait-Entered
  $timer=[Diagnostics.Stopwatch]::StartNew()
  Assert-P (Raw-Request 17451 '/api/meal?date=20261123' GET '' 'same-origin') 503
  Assert-P (Raw-Request 17451 '/health') 200
  $seatRevision=Raw-Request 17451 '/api/seating'
  $coinRevision=Raw-Request 17451 '/api/coins'
  Assert-P $coinRevision 200
  # Real optimistic revision commit while all four remote slots are busy.
  $coinPayload=B64 '{"type":"LAB_REMOTE_ISOLATION"}'
  Assert-P (Coin-Post 17451 $coinPayload $coinRevision.headers['X-TT-Coin-Revision'] $seatRevision.headers['X-TT-Seating-Revision']) 200
  if($timer.ElapsedMilliseconds -ge 2500){throw 'Local API blocked behind remote provider'}
  foreach($client in @($slow1,$slow2,$slow3,$slow4)){
   $reader=[IO.StreamReader]::new($client.GetStream(),[Text.Encoding]::UTF8)
   try{$raw=$reader.ReadToEnd();if(!$raw.StartsWith('HTTP/1.1 200 OK') -or !$raw.Contains('20261123')){throw 'Delayed upstream response failed'}}finally{$reader.Dispose()}
  }
  if((Get-Content -LiteralPath (Join-Path $crashStore 'coins.log') -Raw -Encoding UTF8) -notmatch 'LAB_REMOTE_ISOLATION'){throw 'Concurrent coin commit missing'}
  Write-Host 'PASS four delayed remote requests, saturation 503, independent local health/seat/coin reads and revision commit'
 }finally{
  foreach($client in @($slow1,$slow2,$slow3,$slow4)){if($client){$client.Dispose()}}
  Remove-Item -LiteralPath $delayPath,$entered -ErrorAction SilentlyContinue
 }

 # 4D-3b: provider selection and URL construction are exercised with the
 # existing exact-request fixtures. Never contact live services during regression.
 $liveFlag=Join-Path $crashRoot 'neis-live.flag'
 Set-Content -LiteralPath $liveFlag 'ambiguous' -Encoding ASCII
 try{
  Assert-P (Raw-Request 17451 '/api/meal?date=20261123' GET '' 'same-origin') 502
  Assert-P (Raw-Request 17451 '/health') 200
 }finally{Remove-Item -LiteralPath $liveFlag -Force}
 $meal=School-Doc '/api/meal?date=20261123'
 if($meal.rows[0].date -cne '20261123'){throw 'Fixture provider selection'}
 Assert-P (Raw-Request 17451 '/api/school/search?q=https%3A%2F%2Fevil.invalid&office=B10' GET '' 'same-origin') 502
 Write-Host 'PASS fixed HTTPS URL construction, mutually exclusive provider selection, no live-network fixture fallback'
 # 4D-4a: offline region lookup, controlled remote fallback and saved location.
 $weatherBefore=Snapshot-CrashFiles
 $regionSchool=$school.Replace('시험 주소','서울특별시 노원구 시험로')
 Assert-P (Seat-Post 17451 '/api/school' $regionSchool) 200
 $region=School-Doc ('/api/weather/places?q='+[uri]::EscapeDataString('노원구'))
 if($region.list.Count -ne 1 -or $region.list[0].name -cne '서울특별시 노원구' -or [math]::Abs($region.list[0].lat-37.6542) -gt 0.00001){throw 'Offline weather place search'}
 $auto=School-Doc '/api/weather/place'
 if(!$auto.auto -or $auto.name -cne '서울특별시 노원구 (지역 중심)'){throw 'Automatic region center'}
 $manual='{"name":"시험 위치","lat":37.5,"lon":127.1,"auto":false}'
 Assert-P (Seat-Post 17451 '/api/weather/place' $manual) 200
 $selected=School-Doc '/api/weather/place'
 if($selected.auto -or $selected.name -cne '시험 위치' -or $selected.lat -ne 37.5){throw 'Manual location'}
 $placeHash=(Get-FileHash $weatherFile).Hash
 Assert-P (Seat-Post 17451 '/api/weather/place' ($manual.Replace('37.5','90'))) 502
 Assert-P (Seat-Post 17451 '/api/weather/place' $manual 'cross-site') 403
 if((Get-FileHash $weatherFile).Hash -cne $placeHash){throw 'Rejected location mutated settings'}
 Assert-P (Raw-Request 17451 '/weather-place.json') 404
 Assert-P (Seat-Post 17451 '/api/weather/place' '{"auto":true}') 200
 if(Test-Path $weatherFile){throw 'Auto reset did not clear manual location'}
 if(!(School-Doc '/api/weather/place').auto){throw 'Auto location after reset'}
 $q='가상검색지'
 $query='format=json&limit=5&countrycodes=kr&accept-language=ko&q='+[uri]::EscapeDataString($q)
 $key=(Hash-Bytes ([Text.Encoding]::UTF8.GetBytes('places?'+$query))).ToLowerInvariant()
 [IO.File]::WriteAllText((Join-Path $fixtureDir ($key+'.json')),'[{"display_name":"시험동, 시험시, 대한민국","lat":"36.1234","lon":"127.1234"},{"display_name":"외부","lat":"90","lon":"127"}]',$utf8)
 $remotePlace=School-Doc ('/api/weather/places?q='+[uri]::EscapeDataString($q))
 if($remotePlace.list.Count -ne 1 -or $remotePlace.list[0].name -cne '시험시 시험동'){throw 'Place provider mapping'}
 Assert-P (Seat-Post 17451 '/api/school' $school) 200
 if(Test-Path $weatherFile){throw 'School change did not invalidate place'}
 foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $weatherBefore[$file])){throw 'Weather location altered ledger'}}
 Write-Host 'PASS native weather offline region centers, manual/auto location, restricted geocoder mapping, school invalidation and private file guards'
 # 4D-4b: Open-Meteo forecast/air independent cache and stale recovery.
 $clock=Join-Path $crashRoot 'weather-clock.txt'
 $now=[long]1795734000000
 Set-Content -LiteralPath $clock ([string]$now) -Encoding ASCII
 Assert-P (Seat-Post 17451 '/api/weather/place' '{"name":"시험 위치","lat":37.5,"lon":127.125,"auto":false}') 200
 $base='latitude=37.5000&longitude=127.1250'
 $forecastQuery=$base+'&current=temperature_2m,weather_code,wind_speed_10m,precipitation&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=5'
 $airQuery=$base+'&current=pm10,pm2_5&hourly=pm10,pm2_5&timezone=Asia%2FSeoul&forecast_days=5'
 function Weather-Fixture([string]$endpoint,[string]$query,[string]$json){
  $key=(Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($endpoint+'?'+$query))).ToLowerInvariant()
  $path=Join-Path $fixtureDir ($key+'.json')
  [IO.File]::WriteAllText($path,$json,$utf8)
  return $path
 }
 $forecastJson='{"current":{"temperature_2m":0,"weather_code":0,"wind_speed_10m":3,"precipitation":0},"hourly":{"time":["2026-11-27T09:00"],"temperature_2m":[0],"weather_code":[0],"precipitation_probability":[0]},"daily":{"time":["2026-11-27"],"temperature_2m_max":[4],"temperature_2m_min":[-3],"weather_code":[0],"precipitation_probability_max":[0]}}'
 $airJson='{"current":{"pm10":0,"pm2_5":12},"hourly":{"time":["2026-11-27T09:00"],"pm10":[0],"pm2_5":[12]}}'
 $forecastPath=Weather-Fixture 'forecast' $forecastQuery $forecastJson
 $airPath=Weather-Fixture 'air' $airQuery $airJson
 $weather=School-Doc '/api/weather?'
 if($weather.source -cne 'Open-Meteo' -or $weather.weather.current.temperature_2m -ne 0 -or $weather.weather.current.weather_code -ne 0 -or $weather.air.current.pm10 -ne 0 -or $weather.stale -or $weather.airStale -or $weather.at -ne $now){throw 'Weather initial data including zero values'}
 $cachePath=Join-Path $crashStore 'weather-cache.json'
 if(!(Test-Path $cachePath)){throw 'Weather persisted cache missing'}
 $cacheHash=(Get-FileHash $cachePath).Hash
 Remove-Item -LiteralPath $forecastPath -Force
 $weather=School-Doc '/api/weather'
 if($weather.stale -or $weather.at -ne $now -or (Get-FileHash $cachePath).Hash -cne $cacheHash){throw 'Weather half-hour cache'}
 Set-Content -LiteralPath $clock ([string]($now+1000)) -Encoding ASCII
 $weather=School-Doc '/api/weather?fresh=1'
 if(!$weather.stale -or $weather.airStale -or $weather.airAt -ne ($now+1000) -or $weather.at -ne $now){throw 'Independent failed weather and refreshed air'}
 $forecastPath=Weather-Fixture 'forecast' $forecastQuery ($forecastJson.Replace('"temperature_2m":0','"temperature_2m":5'))
 $weather=School-Doc '/api/weather?fresh=1'
 if(!$weather.stale -or $weather.weather.current.temperature_2m -ne 0){throw 'Weather backoff bypassed'}
 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Weather cache restart stop'}
 $native=Start-CrashServer
 $weather=School-Doc '/api/weather?fresh=1'
 if(!$weather.stale -or $weather.weather.current.temperature_2m -ne 0){throw 'Weather restart backoff'}
 Set-Content -LiteralPath $clock ([string]($now+301001)) -Encoding ASCII
 $weather=School-Doc '/api/weather?fresh=1'
 if($weather.stale -or $weather.weather.current.temperature_2m -ne 5){throw 'Weather recovery'}
 Remove-Item -LiteralPath $forecastPath,$airPath -Force
 Set-Content -LiteralPath $clock ([string]($now+87000000)) -Encoding ASCII
 $r=Raw-Request 17451 '/api/weather' GET '' 'same-origin'
 Assert-P $r 502
 if((ConvertFrom-Json ([Text.Encoding]::UTF8.GetString($r.body))).code -ne 'WEATHER_API_UNAVAILABLE'){throw 'Weather stale expiry'}
 Assert-P (Raw-Request 17451 '/api/weather' GET '' 'cross-site' 'https://evil.invalid') 403
 Assert-P (Raw-Request 17451 '/weather-cache.json') 404
 Assert-P (Seat-Post 17451 '/api/weather/place' '{"auto":true}') 200
 foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $weatherBefore[$file])){throw 'Weather cache altered ledger'}}
 Remove-Item -LiteralPath $clock -Force
 Write-Host 'PASS native Open-Meteo forecast/air, zero values, independent cache, stale fallback, refresh backoff, restart recovery and 24h expiry'
 # 4D-4c: explicit MET fallback, persisted 3h floor, 203/304/retry metadata.
 Assert-P (Seat-Post 17451 '/api/weather/place' '{"name":"MET 시험","lat":37.5,"lon":127.125,"auto":false}') 200
 Remove-Item -LiteralPath $cachePath -Force -ErrorAction SilentlyContinue
 Set-Content -LiteralPath $clock ([string]$now) -Encoding ASCII
 $time=[DateTimeOffset]::FromUnixTimeMilliseconds($now)
 $series=@(0..13|ForEach-Object {
  @{time=$time.AddHours($_).ToString('yyyy-MM-ddTHH:mm:ssZ');data=@{instant=@{details=@{air_temperature=0;wind_speed=2}};next_1_hours=@{summary=@{symbol_code='heavyrain_day'};details=@{probability_of_precipitation=80;precipitation_amount=2}}}}
 })
 $metRaw=@{properties=@{timeseries=$series}}
 $metQuery='lat=37.5000&lon=127.1250'
 $metPath=Weather-Fixture 'met' $metQuery (@{labHttpStatus=203;data=$metRaw;modified='Fri, 27 Nov 2026 00:00:00 GMT';retry=0;expires=($now+3600000)}|ConvertTo-Json -Depth 20 -Compress)
 $airPath=Weather-Fixture 'air' $airQuery $airJson
 $weather=School-Doc '/api/weather'
 if($null -ne $weather.weather -or $null -eq $weather.air){throw 'MET must be explicitly enabled'}
 $weather=School-Doc '/api/weather?met=1'
 if($weather.source -cne 'MET Norway' -or !$weather.metDeprecated -or $weather.weather.current.weather_code -ne 65 -or $weather.weather.current.wind_speed_10m -ne 7.2 -or $weather.weather.current.temperature_2m -ne 0 -or $weather.stale){throw 'MET conversion'}
 $cache=Get-Content -LiteralPath $cachePath -Raw -Encoding UTF8|ConvertFrom-Json
 if($cache.'37.5000,127.1250'.metNext -ne ($now+10800000)){throw 'MET persisted floor'}
 $metPath=Weather-Fixture 'met' $metQuery (@{labHttpStatus=304;retry=($now+18000000);expires=0}|ConvertTo-Json -Compress)
 Set-Content -LiteralPath $clock ([string]($now+3600000)) -Encoding ASCII
 $weather=School-Doc '/api/weather?fresh=1&met=1'
 if($weather.at -ne $now){throw 'MET floor bypassed'}
 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'MET restart stop'}
 $native=Start-CrashServer
 $weather=School-Doc '/api/weather?fresh=1&met=1'
 if($weather.at -ne $now){throw 'MET floor lost after restart'}
 Set-Content -LiteralPath $clock ([string]($now+10801000)) -Encoding ASCII
 $weather=School-Doc '/api/weather?fresh=1&met=1'
 if($weather.at -ne ($now+10801000) -or $weather.source -cne 'MET Norway'){throw 'MET 304 refresh'}
 $cache=Get-Content -LiteralPath $cachePath -Raw -Encoding UTF8|ConvertFrom-Json
 if($cache.'37.5000,127.1250'.metNext -ne ($now+21601000)){throw 'MET 3h floor vs Retry-After'}
 Assert-P (Seat-Post 17451 '/api/weather/place' '{"auto":true}') 200
 Remove-Item -LiteralPath $clock,$metPath,$airPath -Force
 Write-Host 'PASS native optional MET fallback conversion, 203/304 metadata, durable 3h floor and restart protection'
 # 4D-5a: local private album, nested files, picker result and path guard.
 $albumBefore=Snapshot-CrashFiles
 $album=Join-Path $crashRoot 'photo-album'
 $nested=Join-Path $album 'nested'
 New-Item -ItemType Directory -Path $nested -Force|Out-Null
 $albumSetting=Join-Path $crashStore 'photos.txt'
 Remove-Item -LiteralPath $albumSetting -Force -ErrorAction SilentlyContinue
 $empty=School-Doc '/api/photos'
 if($empty.count -ne 0 -or $empty.folder -ne '' -or $empty.missing){throw 'Empty photo album'}
 $png=[Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR2UAAAAASUVORK5CYII=')
 $gif=[Convert]::FromBase64String('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
 [IO.File]::WriteAllBytes((Join-Path $album 'a.png'),$png)
 [IO.File]::WriteAllBytes((Join-Path $nested 'b.gif'),$gif)
 [IO.File]::WriteAllText((Join-Path $album 'c.heic'),'unsupported',$utf8)
 [IO.File]::WriteAllText((Join-Path $album 'secret.txt'),'LAB_PRIVATE_SENTINEL',$utf8)
 $large=Join-Path $album 'z.jpg'
 $f=[IO.File]::Open($large,[IO.FileMode]::CreateNew);try{$f.SetLength(62914561)}finally{$f.Dispose()}
 $outside=Join-Path $crashRoot 'outside-photo'
 New-Item -ItemType Directory -Path $outside -Force|Out-Null
 [IO.File]::WriteAllBytes((Join-Path $outside 'hidden.png'),$png)
 $junction=Join-Path $album 'linked'
 New-Item -ItemType Junction -Path $junction -Target $outside|Out-Null
 $pickFile=Join-Path $crashRoot 'photo-picker-result.txt'
 [IO.File]::WriteAllText($pickFile,$album,$utf8)
 $list=School-Doc '/api/photos/pick'
 if($list.folder -cne $album -or $list.count -ne 3 -or $list.skipped -ne 1 -or $list.missing){throw 'Photo picker/list contract'}
 $r=Raw-Request 17451 '/photo?i=0' GET '' 'same-origin'
 Assert-P $r 200
 if($r.hash -cne (Hash-Bytes $png) -or $r.headers['Content-Type'] -cne 'image/png'){throw 'PNG exact bytes/MIME'}
 $r=Raw-Request 17451 '/photo?i=1&t=1795734000000' GET '' 'same-origin'
 Assert-P $r 200
 if($r.hash -cne (Hash-Bytes $gif) -or $r.headers['Content-Type'] -cne 'image/gif'){throw 'Nested GIF exact bytes/MIME'}
 Assert-P (Raw-Request 17451 '/photo?i=2' GET '' 'same-origin') 404 '{"error":"too large"}'
 foreach($route in @('/photo?i=3','/photo?i=-1','/photo?i=0&i=1','/photo?i=0&t=bad','/photo?i=0&path=secret.txt','/photo?path=secret.txt','/photos.txt','/photo-album/secret.txt')){
  Assert-P (Raw-Request 17451 $route GET '' 'same-origin') 404
 }
 Assert-P (Raw-Request 17451 '/photo?i=0' GET '' 'cross-site' 'https://evil.invalid') 403
 Assert-P (Raw-Request 17451 '/api/photos' GET 'localhost:17451' 'same-origin') 403
 Assert-P (Raw-Request 17451 '/api/photos/pick' GET '' 'cross-site') 403
 $albumHash=(Get-FileHash $albumSetting).Hash
 [IO.File]::WriteAllText($pickFile,$outside,$utf8)
 Assert-P (Raw-Request 17451 '/api/photos/pick' GET '' 'same-origin') 400
 [IO.File]::WriteAllText($pickFile,'',$utf8)
 $list=School-Doc '/api/photos/pick'
 if($list.count -ne 3 -or (Get-FileHash $albumSetting).Hash -cne $albumHash){throw 'Picker cancel changed selection'}
 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Photo restart stop'}
 $native=Start-CrashServer
 $list=School-Doc '/api/photos'
 if($list.count -ne 3 -or $list.folder -cne $album){throw 'Photo selection restart'}
 Remove-Item -LiteralPath (Join-Path $album 'a.png') -Force
 Assert-P (Raw-Request 17451 '/photo?i=0' GET '' 'same-origin') 404
 $list=School-Doc '/api/photos'
 if($list.count -ne 2){throw 'Photo refresh after removal'}
 foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $albumBefore[$file])){throw 'Photo album altered ledger'}}
 [IO.Directory]::Delete($junction)
 Write-Host 'PASS native private photo album nested list, exact image bytes, MIME, HEIC/size cap, picker cancel, junction/external denial and restart'
 # 4D-5b: actual WebView2 decoder on native photo service, no legacy listener.
 Assert-P (Raw-Request 17451 '/api/photos/pick?path=outside' GET '' 'same-origin') 400
 $interactiveFlag=Join-Path $crashRoot 'photo-picker-live.flag'
 Set-Content -LiteralPath $interactiveFlag 'interactive' -Encoding ASCII
 try{Assert-P (Raw-Request 17451 '/api/photos/pick' GET '' 'same-origin') 503}finally{Remove-Item -LiteralPath $interactiveFlag -Force}
 $photoExe=Join-Path $Build 'HOJA-Native-Photo-UI-Lab.exe'
 & $csc /nologo /codepage:65001 /define:NATIVE_STORAGE_LAB,NATIVE_PHOTO_LAB /target:winexe /platform:x64 "/out:$photoExe" "/reference:$Build\Microsoft.Web.WebView2.Core.dll" "/reference:$Build\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'host.cs')
 if($LASTEXITCODE -ne 0){throw 'Native photo UI compilation'}
 $photoHost=$null;$result=Join-Path $crashRoot 'photo-result.txt';$profile=Join-Path $crashRoot 'photo-profile'
 try{
  $photoHost=Start-Process -FilePath $photoExe -ArgumentList ('--self-test "'+$profile+'" "'+$result+'"') -PassThru
  $null=$photoHost.Handle
  if(!$photoHost.WaitForExit(60000)){throw 'Native photo UI timeout'}
  if(Test-Path $result){Get-Content $result}
  if($photoHost.ExitCode -ne 0 -or !(Test-Path $result)){throw 'Native photo UI failed'}
  if((Get-FileHash $albumSetting).Hash -cne $albumHash){throw 'Photo UI altered selected folder'}
  foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $albumBefore[$file])){throw 'Photo UI altered ledger'}}
  Write-Host 'PASS real WebView2 image decode/reload using native private photo endpoint'
 }finally{if($photoHost -and !$photoHost.HasExited){$photoHost.Kill();$photoHost.WaitForExit()}}
 # 4D-6a: actual school/meal/calendar/timetable/weather UI; exact fixture dates.
 $dataBefore=Snapshot-CrashFiles
 Set-Content -LiteralPath $todayFile '20261123' -Encoding ASCII
 # Recreate Monday deleted by cache test. Use actual renderer-visible Korean subjects.
 for($day=23;$day -le 27;$day++){
  $q=$baseQuery+'202611'+$day
  $rows=@(@{PERIO='1';ITRT_CNTNT='국어'},@{PERIO='2';ITRT_CNTNT='수학'},@{PERIO='3';ITRT_CNTNT='영어'},@{PERIO='4';ITRT_CNTNT='사회'},@{PERIO='5';ITRT_CNTNT='과학'})
  if($day -eq 23){Put-Neis 'elsTimetable' $q $rows 6;Put-Neis 'elsTimetable' ($q+'&PERIO=6') @(@{PERIO='6';ITRT_CNTNT='체육'})}else{Put-Neis 'elsTimetable' $q $rows}
 }
 Assert-P (Seat-Post 17451 '/api/school' $school) 200
 Assert-P (Seat-Post 17451 '/api/weather/place' '{"name":"LAB 날씨","lat":37.5,"lon":127.125,"auto":false}') 200
 Remove-Item -LiteralPath $cachePath -Force -ErrorAction SilentlyContinue
 $fixedNow=[DateTimeOffset]::Parse('2026-11-23T00:00:00Z').ToUnixTimeMilliseconds()
 Set-Content -LiteralPath $clock ([string]$fixedNow) -Encoding ASCII
 $forecastPath=Weather-Fixture 'forecast' $forecastQuery ($forecastJson.Replace('2026-11-27','2026-11-23'))
 $airPath=Weather-Fixture 'air' $airQuery ($airJson.Replace('2026-11-27','2026-11-23'))
 # Calendar renderer uses local Date; fixed time 09:00 KST before lunch.
 $dataExe=Join-Path $Build 'HOJA-Native-Data-UI-Lab.exe'
 & $csc /nologo /codepage:65001 /define:NATIVE_STORAGE_LAB,NATIVE_DATA_LAB /target:winexe /platform:x64 "/out:$dataExe" "/reference:$Build\Microsoft.Web.WebView2.Core.dll" "/reference:$Build\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'host.cs')
 if($LASTEXITCODE -ne 0){throw 'Native data UI compilation'}
 $dataHost=$null;$result=Join-Path $crashRoot 'data-result.txt';$profile=Join-Path $crashRoot 'data-profile'
 try{
  $dataHost=Start-Process -FilePath $dataExe -ArgumentList ('--self-test "'+$profile+'" "'+$result+'"') -PassThru
  $null=$dataHost.Handle
  if(!$dataHost.WaitForExit(60000)){throw 'Native data UI timeout'}
  if(Test-Path $result){Get-Content $result}
  if($dataHost.ExitCode -ne 0 -or !(Test-Path $result)){throw 'Native data UI failed'}
  foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $dataBefore[$file])){throw 'Data UI altered ledger'}}
  Write-Host 'PASS actual WebView2 school/timetable/meal/calendar/weather/air widgets against native server, KST before lunch and reload'
 }finally{if($dataHost -and !$dataHost.HasExited){$dataHost.Kill();$dataHost.WaitForExit()}}
 # 4D-6b: old school records without address and regional fallback only.
 $oldSchool=$school.Replace('"address":"시험 주소"','"address":""')
 Assert-P (Seat-Post 17451 '/api/school' $oldSchool) 200
 Put-Neis 'schoolInfo' ('SCHUL_NM='+$escaped+'&ATPT_OFCDC_SC_CODE=B10') @(
  @{ATPT_OFCDC_SC_CODE='B10';SD_SCHUL_CODE='7654321';SCHUL_NM=$name;ORG_RDNMA='잘못된 주소'},
  @{ATPT_OFCDC_SC_CODE='B10';SD_SCHUL_CODE='1234567';SCHUL_NM=$name;ORG_RDNMA='충청북도 가상군 비공개로 123'}
 )
 $regionalQuery='format=json&limit=1&countrycodes=kr&accept-language=ko&q='+[uri]::EscapeDataString('충청북도 가상군')
 $regionPath=Weather-Fixture 'places' $regionalQuery '[{"display_name":"가상군, 충청북도, 대한민국","lat":"37.5","lon":"127.125"}]'
 # A successful forecast proves the provider used administrative tokens, not street address.
 $weather=School-Doc '/api/weather'
 if($weather.place.name -cne '충청북도 가상군' -or $weather.place.lat -ne 37.5){throw 'Older school regional fallback'}
 $saved=Get-Content -LiteralPath $weatherFile -Raw -Encoding UTF8|ConvertFrom-Json
 if(!$saved.auto -or $saved.name -match '비공개로|123'){throw 'Automatic place privacy'}
 Assert-P (Seat-Post 17451 '/api/school' $school) 200
 $weatherError=Raw-Request 17451 '/api/weather' GET '' 'same-origin'
 Assert-P $weatherError 502
 if((ConvertFrom-Json ([Text.Encoding]::UTF8.GetString($weatherError.body))).code -ne 'WEATHER_PLACE_UNAVAILABLE'){throw 'Automatic location error code'}
 # Late region resolution cannot overwrite a manually selected place.
 Assert-P (Seat-Post 17451 '/api/school' $oldSchool) 200
 $delayedRegion=$regionPath+'.delay';$regionEntered=$regionPath+'.entered'
 Set-Content -LiteralPath $delayedRegion '4000' -Encoding ASCII
 $slowWeather=[Net.Sockets.TcpClient]::new()
 try{
  $slowWeather.ReceiveTimeout=15000;$slowWeather.Connect('127.0.0.1',17451)
  $nl=[string][char]13+[char]10
  $req='GET /api/weather HTTP/1.1'+$nl+'Host: 127.0.0.1:17451'+$nl+'Sec-Fetch-Site: same-origin'+$nl+'Connection: close'+$nl+$nl
  $bytes=[Text.Encoding]::ASCII.GetBytes($req);$slowWeather.GetStream().Write($bytes,0,$bytes.Length)
  for($i=0;$i -lt 100 -and !(Test-Path $regionEntered);$i++){Start-Sleep -Milliseconds 30}
  if(!(Test-Path $regionEntered)){throw 'Regional geocoder not entered'}
  Assert-P (Seat-Post 17451 '/api/weather/place' '{"name":"새 위치","lat":37.5,"lon":127.125,"auto":false}') 200
  $reader=[IO.StreamReader]::new($slowWeather.GetStream(),[Text.Encoding]::UTF8)
  try{$raw=$reader.ReadToEnd();if(!$raw.StartsWith('HTTP/1.1 200 OK')){throw 'Late geocoder response'}}finally{$reader.Dispose()}
  $saved=Get-Content -LiteralPath $weatherFile -Raw -Encoding UTF8|ConvertFrom-Json
  if($saved.auto -or $saved.name -cne '새 위치'){throw 'Late geocoder overwrote manual choice'}
 }finally{$slowWeather.Dispose();Remove-Item -LiteralPath $delayedRegion,$regionEntered -ErrorAction SilentlyContinue}
 Assert-P (Seat-Post 17451 '/api/school' $school) 200
 Write-Host 'PASS old school exact-code address lookup, administrative-only geocoder, typed location error and late result protection'
 # 4E-1: font enumeration and safe native shell dispatch (fixture, no live launch).
 $systemBefore=Snapshot-CrashFiles
 $font=School-Doc '/api/fonts'
 if($font.list.Count -lt 1 -or @($font.list|Where-Object {![string]$_}).Count -ne 0){throw 'Installed font enumeration'}
 $fontAgain=School-Doc '/api/fonts'
 if(($font.list -join '|') -cne ($fontAgain.list -join '|')){throw 'Installed font cache'}
 Assert-P (Raw-Request 17451 '/api/fonts' GET '' 'cross-site' 'https://evil.invalid') 403
 Assert-P (Raw-Request 17451 '/api/open-manager' POST '' 'same-origin') 503
 $systemFlag=Join-Path $crashRoot 'system-open-fixture.flag'
 Set-Content -LiteralPath $systemFlag 'fixture-only' -Encoding ASCII
 foreach($route in @('/api/open-manager','/api/open-sheet-copy','/api/open-sound-settings')){
  Assert-P (Raw-Request 17451 $route POST '' 'same-origin') 200 '{"ok":true}'
  Assert-P (Raw-Request 17451 $route GET '' 'same-origin') 405
  Assert-P (Raw-Request 17451 $route POST '' 'cross-site' 'https://evil.invalid') 403
 }
 $openLog=Join-Path $crashRoot 'system-open.log'
 $targets=@(Get-Content -LiteralPath $openLog -Encoding UTF8|ForEach-Object{(ConvertFrom-Json $_).target})
 if(($targets -join '|') -cne 'https://xkdtndbrwk111-prog.github.io/teacher-tools/seating/|https://docs.google.com/spreadsheets/d/1-vejhJz909ivFnhzNRkpbd31BSJsElEPzXUYkONdJRQ/copy|ms-settings:sound'){throw 'Fixed system targets'}
 function Open-Web([string]$url){
  $json=@{url=$url}|ConvertTo-Json -Compress
  Raw-Request 17451 '/api/open-web' POST '' 'same-origin' 'http://127.0.0.1:17451' $json
 }
 Assert-P (Open-Web 'https://example.invalid/path?a=1&b=2') 200
 $logHash=(Get-FileHash $openLog).Hash
 foreach($url in @('file:///C:/secret.txt','javascript:alert(1)','ms-settings:sound','https://user:password@example.invalid/','https://example.invalid/a b','not-a-url')){
  Assert-P (Open-Web $url) 400
 }
 if((Get-FileHash $openLog).Hash -cne $logHash){throw 'Rejected URL dispatched'}
 $liveSystem=Join-Path $crashRoot 'system-open-live.flag'
 Set-Content -LiteralPath $liveSystem 'ambiguous' -Encoding ASCII
 try{Assert-P (Raw-Request 17451 '/api/open-manager' POST '' 'same-origin') 503}finally{Remove-Item -LiteralPath $liveSystem -Force}
 Remove-Item -LiteralPath $systemFlag -Force
 foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $systemBefore[$file])){throw 'System API altered ledger'}}
 Write-Host 'PASS native font enumeration, fixed browser/settings targets, HTTP(S) validation, denied external/protocol and explicit fixture-only shell dispatch'
 # 4E-2a: isolated audio contract; actual OS writes are intentionally disabled.
 $audioBefore=Snapshot-CrashFiles
 Assert-P (Seat-Post 17451 '/api/volume' '{"level":25}') 503
 Assert-P (Seat-Post 17451 '/api/speakers/set' '{"id":"lab-b"}') 503
 $audioFile=Join-Path $crashStore 'audio-lab.json'
 $audioFlag=Join-Path $crashRoot 'audio-fixture.flag'
 [IO.File]::WriteAllText($audioFile,'{"list":[{"id":"lab-a","name":"시험 스피커 A","current":true},{"id":"lab-b","name":"시험 스피커 B","current":false}],"level":50,"muted":false}',$utf8)
 Set-Content -LiteralPath $audioFlag 'fixture-only' -Encoding ASCII
 $speakers=School-Doc '/api/speakers'
 if($speakers.list.Count -ne 2 -or !$speakers.list[0].current -or $speakers.list[1].current){throw 'Audio list contract'}
 $volume=School-Doc '/api/volume'
 if($volume.level -ne 50 -or $volume.muted){throw 'Audio initial state'}
 Assert-P (Seat-Post 17451 '/api/speakers/set' '{"id":"lab-b"}') 200
 $speakers=School-Doc '/api/speakers'
 if($speakers.list[0].current -or !$speakers.list[1].current){throw 'Audio speaker switch'}
 Assert-P (Seat-Post 17451 '/api/volume' '{"level":-1}') 200
 $volume=School-Doc '/api/volume'
 if($volume.level -ne 0 -or $volume.muted){throw 'Audio zero/clamp'}
 Assert-P (Seat-Post 17451 '/api/volume' '{"muted":true}') 200
 $volume=School-Doc '/api/volume'
 if($volume.level -ne 0 -or !$volume.muted){throw 'Audio mute independent'}
 Assert-P (Seat-Post 17451 '/api/volume' '{"level":150}') 200
 $volume=School-Doc '/api/volume'
 if($volume.level -ne 100 -or !$volume.muted){throw 'Audio upper clamp'}
 $audioHash=(Get-FileHash $audioFile).Hash
 Assert-P (Seat-Post 17451 '/api/speakers/set' '{"id":"missing"}') 400
 Assert-P (Seat-Post 17451 '/api/volume' '{"level":"bad"}') 400
 Assert-P (Seat-Post 17451 '/api/volume' '{"muted":"false"}') 400
 Assert-P (Seat-Post 17451 '/api/volume' '{"level":25}' 'cross-site') 403
 Assert-P (Raw-Request 17451 '/api/speakers' GET '' 'cross-site' 'https://evil.invalid') 403
 Assert-P (Raw-Request 17451 '/audio-lab.json') 404
 if((Get-FileHash $audioFile).Hash -cne $audioHash){throw 'Rejected audio mutation changed state'}
 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Audio restart stop'}
 $native=Start-CrashServer
 $volume=School-Doc '/api/volume';$speakers=School-Doc '/api/speakers'
 if($volume.level -ne 100 -or !$volume.muted -or !$speakers.list[1].current){throw 'Audio fixture restart state'}
 # 4E-2b: existing dashboard UI on the native server; no OS audio mutations.
 Assert-P (Seat-Post 17451 '/api/speakers/set' '{"id":"lab-a"}') 200
 Assert-P (Seat-Post 17451 '/api/volume' '{"level":50,"muted":false}') 200
 $audioExe=Join-Path $Build 'HOJA-Native-Audio-UI-Lab.exe'
 & $csc /nologo /codepage:65001 /define:NATIVE_STORAGE_LAB,NATIVE_AUDIO_LAB /target:winexe /platform:x64 "/out:$audioExe" "/reference:$Build\Microsoft.Web.WebView2.Core.dll" "/reference:$Build\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'host.cs')
 if($LASTEXITCODE -ne 0){throw 'Native audio UI compilation'}
 $audioHost=$null;$result=Join-Path $crashRoot 'audio-ui-result.txt';$profile=Join-Path $crashRoot 'audio-ui-profile'
 try{
  $audioHost=Start-Process -FilePath $audioExe -ArgumentList ('--self-test "'+$profile+'" "'+$result+'"') -PassThru
  $null=$audioHost.Handle
  if(!$audioHost.WaitForExit(60000)){throw 'Native audio UI timeout'}
  if(Test-Path $result){Get-Content $result}
  if($audioHost.ExitCode -ne 0 -or !(Test-Path $result)){throw 'Native audio UI failed'}
  $volume=School-Doc '/api/volume';$speakers=School-Doc '/api/speakers'
  if($volume.level -ne 65 -or !$volume.muted -or !$speakers.list[1].current){throw 'Audio UI persisted state mismatch'}
  foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $audioBefore[$file])){throw 'Audio UI altered ledger'}}
  Write-Host 'PASS actual WebView2 dashboard speaker switch, shared media volume and mute, reload, native fixture only'
 }finally{if($audioHost -and !$audioHost.HasExited){$audioHost.Kill();$audioHost.WaitForExit()}}
 Remove-Item -LiteralPath $audioFlag -Force
 Assert-P (Seat-Post 17451 '/api/volume' '{"muted":false}') 503
 foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $audioBefore[$file])){throw 'Audio API altered ledger'}}
 Write-Host 'PASS native isolated audio protocol, device selection, level clamp/mute, invalid and cross-site rejection, restart, OS writes disabled'
 # 4E-3a: settings only; no hook, helper launch or physical input in this server test.
 $shareBefore=Snapshot-CrashFiles
 $shareFile=Join-Path $crashStore 'share-input.json'
 Remove-Item -LiteralPath $shareFile -Force -ErrorAction SilentlyContinue
 $share=School-Doc '/api/share-input'
 if($share.keyboard -or $share.cursor){throw 'Share settings default'}
 foreach($pair in @(@{keyboard=$true;cursor=$false},@{keyboard=$false;cursor=$true},@{keyboard=$true;cursor=$true},@{keyboard=$false;cursor=$false})){
  Assert-P (Seat-Post 17451 '/api/share-input' ($pair|ConvertTo-Json -Compress)) 200
  $share=School-Doc '/api/share-input'
  $disk=Get-Content -LiteralPath $shareFile -Raw -Encoding UTF8|ConvertFrom-Json
  if($share.keyboard -ne $pair.keyboard -or $share.cursor -ne $pair.cursor -or $disk.keyboard -ne $pair.keyboard -or $disk.cursor -ne $pair.cursor){throw 'Share settings readback'}
 }
 Assert-P (Seat-Post 17451 '/api/share-input' '{"keyboard":true,"cursor":false}') 200
 $shareHash=(Get-FileHash $shareFile).Hash
 foreach($bad in @('{}','{"keyboard":true}','{"keyboard":"true","cursor":false}','{"keyboard":true,"cursor":false,"extra":true}','null','[]','{')){
  Assert-P (Seat-Post 17451 '/api/share-input' $bad) 400
 }
 Assert-P (Seat-Post 17451 '/api/share-input' '{"keyboard":false,"cursor":true}' 'cross-site') 403
 Assert-P (Raw-Request 17451 '/api/share-input' GET '' 'cross-site' 'https://evil.invalid') 403
 Assert-P (Raw-Request 17451 '/share-input.json') 404
 if((Get-FileHash $shareFile).Hash -cne $shareHash){throw 'Rejected share setting altered disk'}
 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Share settings restart stop'}
 $native=Start-CrashServer
 $share=School-Doc '/api/share-input'
 if(!$share.keyboard -or $share.cursor){throw 'Share settings restart state'}
 [IO.File]::WriteAllText($shareFile,'invalid',$utf8)
 Assert-P (Raw-Request 17451 '/api/share-input' GET '' 'same-origin') 500
 Assert-P (Seat-Post 17451 '/api/share-input' '{"keyboard":false,"cursor":false}') 200
 $share=School-Doc '/api/share-input'
 if($share.keyboard -or $share.cursor){throw 'Share settings explicit repair'}
 foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $shareBefore[$file])){throw 'Share settings altered ledger'}}
 Write-Host 'PASS native input-sharing defaults, independent booleans, strict validation, cross-site/raw denial, restart and explicit recovery'
 # 4E-3b1: do not claim a live helper from stale or forged status; no process launch.
 $shareStatusFile=Join-Path $crashStore 'share-input-status.json'
 $shareProofFile=Join-Path $crashStore 'native-mode-owner.json'
 $shareModeFile=Join-Path $crashStore 'board-mode.json'
 $shareStatus=School-Doc '/api/share-input/status'
 if($shareStatus.running -or $shareStatus.hook){throw 'Absent helper status'}
 Assert-P (Raw-Request 17451 '/api/share-input/restart' POST '' 'same-origin') 503
 Assert-P (Raw-Request 17451 '/api/share-input/restart' GET '' 'same-origin') 405
 Assert-P (Raw-Request 17451 '/api/share-input/status' GET '' 'cross-site' 'https://evil.invalid') 403
 Assert-P (Raw-Request 17451 '/api/share-input/restart' POST '' 'cross-site') 403
 $shareStatusBackup=@{}
 foreach($p in @($shareStatusFile,$shareProofFile,$shareModeFile)){if(Test-Path -LiteralPath $p){$shareStatusBackup[$p]=[IO.File]::ReadAllBytes($p)}}
 try{
  $modeDoc=@{pid=$PID;window=1;mode='wallpaper';release='2026-11-25-V1.66.43-STABLE-PILOT'}|ConvertTo-Json -Compress
  $statusDoc=@{pid=$PID;hook=$true;keyboard=$true;cursor=$false;release='2026-11-25-V1.66.43-STABLE-PILOT'}|ConvertTo-Json -Compress
  [IO.File]::WriteAllText($shareModeFile,$modeDoc,$utf8)
  [IO.File]::WriteAllText($shareProofFile,$modeDoc,$utf8)
  [IO.File]::WriteAllText($shareStatusFile,$statusDoc,$utf8)
  $shareStatus=School-Doc '/api/share-input/status'
  if($shareStatus.running -or $shareStatus.hook){throw 'Forged live helper'}
  [IO.File]::SetLastWriteTimeUtc($shareStatusFile,[DateTime]::UtcNow.AddMinutes(-2))
  if((School-Doc '/api/share-input/status').running){throw 'Stale helper'}
  [IO.File]::WriteAllText($shareStatusFile,'invalid',$utf8)
  if((School-Doc '/api/share-input/status').running){throw 'Malformed helper'}
  Assert-P (Raw-Request 17451 '/share-input-status.json') 404
  Assert-P (Raw-Request 17451 '/native-mode-owner.json') 404
 }finally{
  foreach($p in @($shareStatusFile,$shareProofFile,$shareModeFile)){
   if($shareStatusBackup.ContainsKey($p)){[IO.File]::WriteAllBytes($p,$shareStatusBackup[$p])}
   else{Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue}
  }
 }
 foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $shareBefore[$file])){throw 'Share helper status altered ledger'}}
 Write-Host 'PASS native helper absent/stale/forged/malformed status and offline restart denied, raw/cross-site blocked'
 # 4E-3b2: actual owning wallpaper launcher on 17451. No legacy server or process launch by HTTP.
 $shareBin=Join-Path $crashRoot 'share-bin'
 New-Item -ItemType Directory -Path $shareBin -Force|Out-Null
 foreach($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')){
  Copy-Item -LiteralPath (Join-Path $Build $name) -Destination $shareBin
 }
 $shareExe=Join-Path $shareBin 'HOJA-Native-Launch-Lab.exe'
 & $csc /nologo /codepage:65001 /define:NATIVE_STORAGE_LAB,NATIVE_SHARE_LAB /target:winexe /platform:x64 /main:NativeBoardLaunch "/out:$shareExe" "/reference:$shareBin\Microsoft.Web.WebView2.Core.dll" "/reference:$shareBin\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'host.cs') (Join-Path $PSScriptRoot 'native-launch.cs') (Join-Path $PSScriptRoot 'native-share-input.cs')
 if($LASTEXITCODE -ne 0){throw 'Native share launcher compilation'}
 $shareLaunch=$null;$shareReady=Join-Path $crashRoot 'native-launch.ready';$shareStop=Join-Path $crashRoot 'native-launch.stop'
 $shareRequest=Join-Path $crashStore 'share-input-restart.json'
 function Wait-Share([bool]$running,[bool]$hook){
  for($i=0;$i -lt 50;$i++){
   if($shareLaunch.HasExited){throw ('Share launcher exited '+$shareLaunch.ExitCode+' '+(Get-Content (Join-Path $crashRoot 'native-launch.result') -ErrorAction SilentlyContinue))}
   $st=School-Doc '/api/share-input/status'
   if($st.running -eq $running -and $st.hook -eq $hook){return $st}
   Start-Sleep -Milliseconds 200
  }
  throw ('Share helper status timeout '+($st|ConvertTo-Json -Compress))
 }
 try{
  Assert-P (Seat-Post 17451 '/api/share-input' '{"keyboard":true,"cursor":false}') 200
  $shareLaunch=Start-Process -FilePath $shareExe -ArgumentList '--lab-launch wallpaper' -PassThru
  $null=$shareLaunch.Handle
  for($i=0;$i -lt 120 -and !(Test-Path $shareReady);$i++){if($shareLaunch.HasExited){throw ('Share launcher startup failed '+(Get-Content (Join-Path $crashRoot 'native-launch.result') -ErrorAction SilentlyContinue))};Start-Sleep -Milliseconds 250}
  if(!(Test-Path $shareReady)){throw 'Share launcher readiness timeout'}
  $st=Wait-Share $true $true
  if(!$st.keyboard -or $st.cursor){throw 'Live share settings'}
  Assert-P (Raw-Request 17451 '/api/share-input/restart' POST '' 'same-origin') 200
  if(Test-Path $shareRequest){throw 'Running helper must not queue restart'}
  Set-Content -LiteralPath (Join-Path $crashRoot 'share-helper-stop.fixture') 'stop' -Encoding ASCII
  $null=Wait-Share $false $false
  Assert-P (Raw-Request 17451 '/api/share-input/restart' POST '' 'same-origin') 202
  $st=Wait-Share $true $true
  if(!$st.keyboard -or $st.cursor){throw 'Restart did not reapply keyboard configuration'}
  if(Test-Path $shareRequest){throw 'Restart request not consumed'}
  $disk=Get-Content -LiteralPath $shareStatusFile -Raw|ConvertFrom-Json
  if($disk.pid -ne $shareLaunch.Id){throw 'Restarted helper changed owner'}
  Assert-P (Seat-Post 17451 '/api/share-input' '{"keyboard":false,"cursor":false}') 200
  $st=Wait-Share $true $false
  if($st.keyboard -or $st.cursor){throw 'Share helper did not disable'}
  # 4E-3c: exercise the original dashboard handlers in the same real WebView2.
  $shareUiResult=Join-Path $crashRoot 'share-ui-test.result'
  Set-Content -LiteralPath (Join-Path $crashRoot 'share-ui-test.fixture') 'test' -Encoding ASCII
  for($i=0;$i -lt 200 -and !(Test-Path $shareUiResult);$i++){
   if($shareLaunch.HasExited){throw ('Share UI launcher exited '+$shareLaunch.ExitCode)}
   Start-Sleep -Milliseconds 250
  }
  if(!(Test-Path $shareUiResult)){throw 'Share UI test timeout'}
  $shareUiText=Get-Content -LiteralPath $shareUiResult -Raw -Encoding UTF8
  if($shareUiText -notlike 'PASS actual dashboard share checkboxes*'){throw $shareUiText}
  Write-Host $shareUiText
  $st=Wait-Share $true $false
  if($st.keyboard -or $st.cursor){throw 'Share UI final settings'}
  $shareSettings=School-Doc '/api/share-input'
  if($shareSettings.keyboard -or $shareSettings.cursor){throw 'Share UI persisted settings'}
  Set-Content -LiteralPath $shareStop 'stop' -Encoding ASCII
  if(!$shareLaunch.WaitForExit(15000) -or $shareLaunch.ExitCode -ne 0){throw 'Share launcher close failed'}
  if((School-Doc '/api/share-input/status').running -or (Test-Path $shareStatusFile)){throw 'Share helper survives close'}
  Assert-P (Raw-Request 17451 '/api/share-input/restart' POST '' 'same-origin') 503
  foreach($file in @('coins.log','seating.json','notice.log')){if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $shareBefore[$file])){throw 'Share restart altered ledger'}}
  Write-Host 'PASS actual native wallpaper helper hook, stop/restart same owner, settings reapply, no-op running and close cleanup'
 }finally{if($shareLaunch -and !$shareLaunch.HasExited){$shareLaunch.Kill();$shareLaunch.WaitForExit()}}

 # 4E-4a: exact legacy backup envelope, only five private data files.
 $backupNames=@('school.json','weather-place.json','seating.json','coins.log','notice.log')
 $backupBefore=@{}
 foreach($file in $backupNames){
  $p=Join-Path $crashStore $file
  if(Test-Path -LiteralPath $p -PathType Leaf){$backupBefore[$file]=[IO.File]::ReadAllBytes($p)}
 }
 $backupDoc=School-Doc '/api/backup/export'
 if($backupDoc.format -cne 'teacher-tools-server-files' -or $backupDoc.version -ne 1){throw 'Backup format mismatch'}
 $exportNames=@($backupDoc.files.PSObject.Properties.Name|Sort-Object)
 if(($exportNames -join ',') -cne ((@($backupBefore.Keys|Sort-Object)) -join ',')){throw 'Backup allowlist mismatch'}
 foreach($file in $backupBefore.Keys){
  $bytes=[Convert]::FromBase64String($backupDoc.files.PSObject.Properties[$file].Value)
  if((Hash-Bytes $bytes) -cne (Hash-Bytes $backupBefore[$file])){throw ('Backup exact bytes mismatch '+$file)}
 }
 Assert-P (Raw-Request 17451 '/api/backup/export') 403
 Assert-P (Raw-Request 17451 '/api/backup/export' GET '' 'cross-site' 'https://evil.invalid') 403
 Assert-P (Raw-Request 17451 '/api/backup/export' GET '' 'same-origin' 'https://evil.invalid') 403
 Assert-P (Raw-Request 17451 '/api/backup/export' POST '' 'same-origin') 405
 # A directory in the allowlist must fail rather than silently omitting its contents.
 $backupProbe=Join-Path $crashStore 'notice.log'
 $hadNotice=$backupBefore.ContainsKey('notice.log')
 try{
  if(Test-Path -LiteralPath $backupProbe){Remove-Item -LiteralPath $backupProbe -Force}
  New-Item -ItemType Directory -Path $backupProbe|Out-Null
  Assert-P (Raw-Request 17451 '/api/backup/export' GET '' 'same-origin') 400
  Remove-Item -LiteralPath $backupProbe -Force
  # 16 MiB per-file boundary; no oversized content is returned.
  $stream=[IO.File]::Open($backupProbe,[IO.FileMode]::CreateNew)
  try{$stream.SetLength(16777217)}finally{$stream.Dispose()}
  Assert-P (Raw-Request 17451 '/api/backup/export' GET '' 'same-origin') 400
 }finally{
  if(Test-Path -LiteralPath $backupProbe){Remove-Item -LiteralPath $backupProbe -Force}
  if($hadNotice){[IO.File]::WriteAllBytes($backupProbe,$backupBefore['notice.log'])}
 }
 foreach($file in $backupBefore.Keys){
  if((Get-FileHash (Join-Path $crashStore $file)).Hash -cne (Hash-Bytes $backupBefore[$file])){throw 'Backup export altered source'}
 }
 Write-Host 'PASS native backup legacy format, exact bytes, private five-file allowlist, origin/method and unsafe/oversize denial'

 # 4E-4b: restore only disposable fixture files, then restore the exact original snapshot.
 function Backup-Body($files,[string]$mode='with-students'){
  return (@{format='teacher-tools-server-files';version=1;mode=$mode;files=$files}|ConvertTo-Json -Depth 5 -Compress)
 }
 function Backup-Post([string]$body,[string]$token,[string]$site='same-origin',[string]$origin=''){
  return Raw-Request 17451 '/api/backup/restore' POST '' $site $origin $body '' '' $token
 }
 function Assert-BackupSnapshot($expected){
  foreach($name in $backupNames){
   $p=Join-Path $crashStore $name
   if($expected.ContainsKey($name)){
    if(!(Test-Path -LiteralPath $p -PathType Leaf) -or (Get-FileHash $p).Hash -cne (Hash-Bytes $expected[$name])){throw ('Restore byte mismatch '+$name)}
   }elseif(Test-Path -LiteralPath $p){throw ('Unexpected restore file '+$name)}
  }
 }
 $originalEncoded=@{}
 foreach($name in $backupBefore.Keys){$originalEncoded[$name]=[Convert]::ToBase64String($backupBefore[$name])}
 $originalBody=Backup-Body $originalEncoded
 $token=(School-Doc '/api/backup/token').token
 if($token -cnotmatch '^[a-f0-9]{32}$'){throw 'Restore token format'}
 Assert-P (Raw-Request 17451 '/api/backup/token') 403
 Assert-P (Backup-Post $originalBody '') 403
 Assert-P (Backup-Post $originalBody ('0'*32)) 403
 Assert-P (Backup-Post $originalBody $token 'cross-site' 'https://evil.invalid') 403
 Assert-P (Backup-Post (Backup-Body @{'../other.json'='e30='}) $token) 400
 Assert-P (Backup-Post (Backup-Body @{'coins.log'='not base64'}) $token) 400
 Assert-P (Backup-Post (Backup-Body @{'seating.json'='eA=='}) $token) 400
 Assert-P (Backup-Post (Backup-Body @{'notice.log'='eA=='}) $token) 400
 Assert-P (Backup-Post (Backup-Body @{'school.json'='e30='} 'settings-only') $token) 400
 Assert-P (Backup-Post '{"format":"teacher-tools-server-files","version":2,"mode":"with-students","files":{}}' $token) 400
 Assert-BackupSnapshot $backupBefore
 if(Test-Path (Join-Path $crashStore 'backup-restore-journal.json')){throw 'Rejected restore wrote journal'}
 $modified=@{}
 foreach($name in $originalEncoded.Keys){$modified[$name]=$originalEncoded[$name]}
 $noticeBytes=[Text.Encoding]::UTF8.GetBytes('{"id":"lab-restore","text":"restore fixture"}'+[char]10)
 $modified['notice.log']=[Convert]::ToBase64String($noticeBytes)
 $modified.Remove('weather-place.json')
 $modifiedExpected=@{}
 foreach($name in $modified.Keys){$modifiedExpected[$name]=[Convert]::FromBase64String($modified[$name])}
 Assert-P (Backup-Post (Backup-Body $modified) $token) 200 '{"ok":true}'
 Assert-BackupSnapshot $modifiedExpected
 Assert-P (Backup-Post $originalBody $token) 403
 $token=(School-Doc '/api/backup/token').token
 Assert-P (Backup-Post (Backup-Body @{} 'settings-only') $token) 200
 Assert-BackupSnapshot @{}
 $token=(School-Doc '/api/backup/token').token
 Assert-P (Backup-Post $originalBody $token) 200
 Assert-BackupSnapshot $backupBefore
 if(Test-Path (Join-Path $crashStore 'backup-restore-journal.json')){throw 'Committed restore journal remains'}
 Write-Host 'PASS native legacy restore valid bytes, missing file deletion, settings-only empty, token rotation and invalid request preservation'

 # 4E-4c: kill the actual server at each restore transaction checkpoint.
 # All old files must recover together, not only the last file touched.
 $crashBody=Backup-Body @{'notice.log'=[Convert]::ToBase64String($noticeBytes)}
 $journalPath=Join-Path $crashStore 'backup-restore-journal.json'
 foreach($stage in @('prepared','after-school.json','after-weather-place.json','after-seating.json','after-coins.log','after-notice.log','before-commit')){
  $token=(School-Doc '/api/backup/token').token
  Set-Content -LiteralPath $control ('backup-restore:'+$stage) -Encoding ASCII
  $nl=[string][char]13+[char]10
  $wire=[Text.Encoding]::ASCII.GetBytes(("POST /api/backup/restore HTTP/1.1"+$nl+"Host: 127.0.0.1:17451"+$nl+"Sec-Fetch-Site: same-origin"+$nl+"Origin: http://127.0.0.1:17451"+$nl+"X-TT-Backup-Token: $token"+$nl+"Content-Type: application/json"+$nl+"Content-Length: "+$crashBody.Length+$nl+"Connection: close"+$nl+$nl+$crashBody))
  $client=[Net.Sockets.TcpClient]::new()
  try{
   $client.Connect('127.0.0.1',17451);$client.GetStream().Write($wire,0,$wire.Length)
   $hit=$false
   for($i=0;$i -lt 120;$i++){
    if($native.HasExited){throw ('Restore server died before checkpoint '+$stage)}
    if((Test-Path $reached) -and (Get-Content $reached -Raw) -ceq ('backup-restore:'+$stage)){$hit=$true;break}
    Start-Sleep -Milliseconds 50
   }
   if(!$hit -or !(Test-Path -LiteralPath $journalPath -PathType Leaf)){throw ('Restore journal checkpoint missing '+$stage)}
   # At the final checkpoint the new bytes are already applied; verify this is a real partial/complete write.
   if($stage -eq 'before-commit'){
    Assert-BackupSnapshot @{'notice.log'=$noticeBytes}
   }
   $native.Kill()
   if(!$native.WaitForExit(10000)){throw 'Restore kill timeout'}
  }finally{$client.Dispose()}
  $native=Start-CrashServer
  Assert-BackupSnapshot $backupBefore
  if(Test-Path -LiteralPath $journalPath){throw ('Restore journal survived recovery '+$stage)}
  $restored=School-Doc '/api/backup/export'
  foreach($name in $originalEncoded.Keys){
   if($restored.files.PSObject.Properties[$name].Value -cne $originalEncoded[$name]){throw ('Restore export recovery mismatch '+$stage+' '+$name)}
  }
  Assert-P (Backup-Post $originalBody $token) 403
  Write-Host "PASS native restore kill/restart checkpoint $stage exact original files"
 }
 Write-Host 'PASS native multi-file restore crash recovery 7/7'

 # 4E-4d: exercise original dashboard backup handlers using a separate WebView2 profile.
 $backupExe=Join-Path $Build 'HOJA-Native-Backup-UI-Lab.exe'
 & $csc /nologo /codepage:65001 /define:NATIVE_STORAGE_LAB,NATIVE_BACKUP_LAB /target:winexe /platform:x64 "/out:$backupExe" "/reference:$Build\Microsoft.Web.WebView2.Core.dll" "/reference:$Build\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'host.cs')
 if($LASTEXITCODE -ne 0){throw 'Native backup UI compilation'}
 $backupHost=$null;$result=Join-Path $crashRoot 'backup-ui-result.txt';$profile=Join-Path $crashRoot 'backup-ui-profile'
 try{
  $backupHost=Start-Process -FilePath $backupExe -ArgumentList ('--self-test "'+$profile+'" "'+$result+'"') -PassThru
  $null=$backupHost.Handle
  if(!$backupHost.WaitForExit(60000)){throw 'Native backup UI timeout'}
  if(Test-Path $result){Get-Content $result}
  if($backupHost.ExitCode -ne 0 -or !(Test-Path $result)){throw 'Native backup UI failed'}
  Assert-BackupSnapshot $backupBefore
  if(Test-Path -LiteralPath $journalPath){throw 'Backup UI journal survived'}
  Write-Host 'PASS native backup UI restore and source file hashes'
 }finally{if($backupHost -and !$backupHost.HasExited){$backupHost.Kill();$backupHost.WaitForExit()}}

 # Phase 5A-1: legacy book contract, no renderer launch or external requests.
 $bookLayout=@{vw=1280;vh=720;x=10;y=20;w=1200;h=650;visible=1;immersive=0}
 $book=@{url='https://www.canva.com/design/LAB_ID/LAB_KEY/view?embed';id='LAB_ID';title='LAB BOOK';pages=5;start=2;saved=2;interactive=$false;openId=('a'*32);layout=$bookLayout}
 function Book-Post($doc,[string]$site='same-origin',[string]$origin=''){
  $encoded=B64 ($doc|ConvertTo-Json -Depth 8 -Compress)
  return Raw-Request 17451 '/api/book-reader/open' POST '' $site $origin $encoded
 }
 Assert-P (Book-Post $book) 409 '{"error":"native unavailable","reason":"OWNER_NOT_FOUND"}'
 Assert-P (Book-Post $book 'cross-site' 'https://evil.invalid') 403
 Assert-P (Raw-Request 17451 '/api/book-reader/open' GET '' 'same-origin') 405
 Assert-P (Raw-Request 17451 ('/api/book-reader/status?session='+('a'*32)) GET '' 'same-origin') 404
 Assert-P (Raw-Request 17451 ('/api/book-reader/close?session='+('a'*32)) POST '' 'same-origin') 404
 foreach($bad in @('http://www.canva.com/design/LAB_ID/LAB_KEY/view?embed','https://www.canva.com.evil.invalid/design/LAB_ID/LAB_KEY/view?embed','https://www.canva.com/design/WRONG/LAB_KEY/view?embed','https://www.canva.com/design/LAB_ID/LAB_KEY/edit')){
  $copy=$book.Clone();$copy.url=$bad
  Assert-P (Book-Post $copy) 409 '{"error":"native unavailable","reason":"BOOK_URL_INVALID"}'
 }
 foreach($bad in @(0,4096,'5')){
  $copy=$book.Clone();$copy.pages=$bad
  Assert-P (Book-Post $copy) 409 '{"error":"native unavailable","reason":"BOOK_URL_INVALID"}'
 }
 $copy=$book.Clone();$copy.layout=$bookLayout.Clone();$copy.layout.w=2000
 Assert-P (Book-Post $copy) 409 '{"error":"native unavailable","reason":"BOOK_URL_INVALID"}'
 $copy=$book.Clone();$copy.interactive=$true;$copy.id='DAHbOZ_XOJI';$copy.url='https://canva.link/9qxk3zuhh93ts2s'
 Assert-P (Book-Post $copy) 409 '{"error":"native unavailable","reason":"OWNER_NOT_FOUND"}'
 $copy.url='https://canva.link/another'
 Assert-P (Book-Post $copy) 409 '{"error":"native unavailable","reason":"BOOK_URL_INVALID"}'
 Assert-BackupSnapshot $backupBefore
 if(Test-Path (Join-Path $crashStore 'book-reader-sessions')){throw 'Validation unexpectedly created book session'}
 Write-Host 'PASS native book protocol Canva allowlist, layout/page bounds, exact interactive link, method/origin and unavailable owner without process launch'

















 Set-Content -LiteralPath $stopFile 'stop' -Encoding ASCII
 if(!$native.WaitForExit(10000) -or $native.ExitCode -ne 0){throw 'Native timetable server stop'}






}finally{
 foreach($proc in @($native,$legacy)){if($proc -and !$proc.HasExited){$proc.Kill();$proc.WaitForExit()}}
 $env:HOJA_LAB_ROOT=$envRoot;$env:LOCALAPPDATA=$envLocal
}
