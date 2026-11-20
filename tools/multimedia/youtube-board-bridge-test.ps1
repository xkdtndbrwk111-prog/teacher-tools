# Offline bridge contract and asynchronous process launch. No real YouTube request.
function Test-TTYoutubeBridge([string]$Root){
 . (Join-Path $PSScriptRoot 'youtube-download-worker.ps1')
 . (Join-Path $PSScriptRoot 'youtube-board-bridge.ps1')
 $base=Join-Path $Root 'bridge with spaces';[void][IO.Directory]::CreateDirectory($base)
 $fake=Join-Path $base 'fixture.ps1'
 @'
param([string]$YoutubeJob,[string]$YoutubeVideoId,[string]$YoutubeQuality)
$ErrorActionPreference='Stop'
$root=(Get-Location).Path
$lock=[IO.File]::Open((Join-Path $root '.download.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{
 if($YoutubeVideoId -cne 'DAHbOpoUrrg' -or $YoutubeQuality -cne '720'){exit 2}
 $dir=Join-Path (Join-Path $root 'jobs') $YoutubeJob
 [void][IO.Directory]::CreateDirectory($dir)
 [IO.File]::WriteAllText((Join-Path $dir 'state.json'),'{"state":"running","phase":"download","percent":45}')
 $until=[DateTime]::UtcNow.AddSeconds(20)
 while(!(Test-Path -LiteralPath (Join-Path $dir 'cancel')) -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100}
 if(!(Test-Path -LiteralPath (Join-Path $dir 'cancel'))){exit 3}
 [IO.File]::WriteAllText((Join-Path $dir 'state.json'),'{"state":"cancelled","phase":"stopped","percent":-1}')
}finally{$lock.Dispose()}
'@ | Set-Content -LiteralPath $fake -Encoding UTF8
 $s=Invoke-TTYoutubeBoardApi '/api/youtube/status' 'GET' $true $false '' '' $base $fake
 $initial=$s.body|ConvertFrom-Json
 if($s.status -ne '200 OK' -or $initial.job.state -ne 'idle' -or $initial.token -cnotmatch '^[a-f0-9]{32}$'){throw 'status contract'}
 $token=$initial.token
 $body='{"id":"DAHbOpoUrrg","quality":"720","authorized":true}'
 foreach($x in @(
  (Invoke-TTYoutubeBoardApi '/api/youtube/status' 'GET' $false $false '' '' $base $fake),
  (Invoke-TTYoutubeBoardApi '/api/youtube/start' 'POST' $true $false $token $body $base $fake),
  (Invoke-TTYoutubeBoardApi '/api/youtube/start' 'POST' $true $true 'wrong' $body $base $fake)
 )){if($x.status -ne '403 Forbidden'){throw 'origin or token accepted'}}
 if((Invoke-TTYoutubeBoardApi '/api/youtube/start' 'GET' $true $true $token $body $base $fake).status -ne '405 Method Not Allowed'){throw 'method accepted'}
 if((Invoke-TTYoutubeBoardApi '/api/youtube/start' 'POST' $true $true $token '{"id":"../unsafe","quality":"720","authorized":true}' $base $fake).status -ne '409 Conflict'){throw 'unsafe input accepted'}
 if((Invoke-TTYoutubeBoardApi '/api/youtube/start' 'POST' $true $true $token '{"id":"DAHbOpoUrrg","quality":"720","authorized":false}' $base $fake).status -ne '409 Conflict'){throw 'missing consent accepted'}
 Write-Host 'PASS bridge origin, method, token and request policy'
 try{
  $r=Invoke-TTYoutubeBoardApi '/api/youtube/start' 'POST' $true $true $token $body $base $fake
  if($r.status -ne '200 OK'){throw 'bridge launch failed'}
  $job=($r.body|ConvertFrom-Json).job
  $limit=[DateTime]::UtcNow.AddSeconds(10)
  do{$state=Get-TTYoutubeJobState $base;if($state.percent -eq 45){break};Start-Sleep -Milliseconds 100}while([DateTime]::UtcNow -lt $limit)
  if($state.job -cne $job -or $state.percent -ne 45 -or $script:ttYoutubeProcess.HasExited){throw 'asynchronous state missing'}
  if((Invoke-TTYoutubeBoardApi '/api/youtube/start' 'POST' $true $true $token $body $base $fake).status -ne '409 Conflict'){throw 'second bridge start accepted'}
  Write-Host 'PASS asynchronous process launch, live status and busy rejection'
  $cancel=ConvertTo-Json -Compress @{job=$job}
  $r=Invoke-TTYoutubeBoardApi '/api/youtube/cancel' 'POST' $true $true $token $cancel $base $fake
  if($r.status -ne '200 OK' -or !$script:ttYoutubeProcess.WaitForExit(10000) -or $script:ttYoutubeProcess.ExitCode -ne 0){throw 'bridge cancel failed'}
  if((Get-TTYoutubeJobState $base).state -ne 'cancelled'){throw 'cancel state missing'}
  Write-Host 'PASS bridge cancellation and persistent terminal status'
 }finally{
  if($script:ttYoutubeProcess){if(!$script:ttYoutubeProcess.HasExited){$script:ttYoutubeProcess.Kill();$script:ttYoutubeProcess.WaitForExit()};$script:ttYoutubeProcess.Dispose();$script:ttYoutubeProcess=$null}
 }
 $lib=@(Get-TTYoutubeLibrary (Join-Path $Root 'worker fixture with spaces'))
 if($lib.Count -ne 1 -or $lib[0].id -cne 'DAHbOpoUrrg' -or $lib[0].height -ne 360){throw 'library listing contract'}
 Write-Host 'PASS validated library listing without absolute paths'
 $libraryRoot=Join-Path $Root 'worker fixture with spaces'
 $resolved=Resolve-TTYoutubePlaybackFile $libraryRoot 'DAHbOpoUrrg' '720'
 if(!(Test-Path -LiteralPath $resolved -PathType Leaf)){throw 'playback library resolution'}
 foreach($bad in @('../unsafe','AAAAAAAAAAA')){
  $denied=$false;try{$null=Resolve-TTYoutubePlaybackFile $libraryRoot $bad '720'}catch{$denied=$true};if(!$denied){throw 'invalid playback resolution accepted'}
 }
 if((Invoke-TTYoutubeBoardApi '/api/youtube/play-start' 'POST' $true $true 'wrong' $body $libraryRoot $fake).status -ne '403 Forbidden'){throw 'playback token accepted'}
 if((Invoke-TTYoutubeBoardApi '/api/youtube/play-start' 'POST' $true $true $token '{"id":"../unsafe","quality":"720"}' $libraryRoot $fake).status -ne '409 Conflict'){throw 'playback invalid path accepted'}
 Write-Host 'PASS playback library validation and API authorization'
 # Actual signed server source as isolated child, with a synthetic MP4 and sandboxed LOCALAPPDATA.
 $oldAppData=$env:LOCALAPPDATA
 $env:LOCALAPPDATA=Join-Path $Root 'playback app data'
 $actual=Join-Path $env:LOCALAPPDATA 'TeacherToolsMedia'
 try{
  [void][IO.Directory]::CreateDirectory($actual)
  Copy-Item -LiteralPath (Join-Path $libraryRoot 'library') -Destination $actual -Recurse
  $scriptPath=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path 'runtime-src/system/server.ps1'
  $r=Invoke-TTYoutubeBoardApi '/api/youtube/play-start' 'POST' $true $true $token '{"id":"DAHbOpoUrrg","quality":"720"}' $actual $scriptPath
  if($r.status -ne '200 OK'){throw 'playback start failed'}
  $session=($r.body|ConvertFrom-Json).session
  $limit=[datetime]::UtcNow.AddSeconds(25)
  do{$state=Get-TTYoutubePlaybackState $session;if($state.state -ne 'starting'){break};Start-Sleep -Milliseconds 100}while([datetime]::UtcNow -lt $limit)
  if($state.state -ne 'ready'){throw 'dedicated child not ready'}
  $u=[uri]$state.url
  $tcp=[Net.Sockets.TcpClient]::new()
  try{
   $tcp.Connect('127.0.0.1',$u.Port);$tcp.ReceiveTimeout=5000;$tcp.SendTimeout=5000
   $stream=$tcp.GetStream();$request=[Text.Encoding]::ASCII.GetBytes("HEAD $($u.AbsolutePath) HTTP/1.1`r`nHost: 127.0.0.1:$($u.Port)`r`nReferer: http://127.0.0.1:17439/`r`nConnection: close`r`n`r`n")
   $stream.Write($request,0,$request.Length);$reader=[IO.StreamReader]::new($stream)
   if($reader.ReadLine() -cne 'HTTP/1.1 200 OK'){throw 'private child HEAD rejected'}
  }finally{$tcp.Dispose()}
  $r=Invoke-TTYoutubeBoardApi '/api/youtube/play-stop' 'POST' $true $true $token (ConvertTo-Json -Compress @{session=$session}) $actual $scriptPath
  if($r.status -ne '200 OK'){throw 'playback stop failed'}
  if($script:ttYoutubePlayback -and !$script:ttYoutubePlayback.process.WaitForExit(10000)){throw 'playback process not stopped'}
  Clear-TTYoutubePlayback
  if($script:ttYoutubePlayback){throw 'playback session not cleared'}
  Write-Host 'PASS actual signed child playback launch, local media HEAD and stop'
 }finally{
  if($script:ttYoutubePlayback){
   $p=$script:ttYoutubePlayback
   if(!$p.process.HasExited){$p.process.Kill();$p.process.WaitForExit()}
   Clear-TTYoutubePlayback
  }
  $env:LOCALAPPDATA=$oldAppData
 }
}
