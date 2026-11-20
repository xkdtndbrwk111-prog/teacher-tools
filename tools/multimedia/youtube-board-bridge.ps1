# Board API bridge. The caller must enforce same-origin and POST token checks.
$script:ttYoutubeToken=[guid]::NewGuid().ToString('N')
$script:ttYoutubeProcess=$null
function Get-TTYoutubeRoot { Join-Path $env:LOCALAPPDATA 'TeacherToolsMedia' }
function Get-TTYoutubeLast([string]$Root){
 try{
  $x=Get-Content -LiteralPath (Join-Path $Root 'last-job.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($x.job -cnotmatch '^[a-f0-9]{32}$'){return $null}
  return $x
 }catch{return $null}
}
function Get-TTYoutubeJobState([string]$Root){
 $last=Get-TTYoutubeLast $Root
 if(!$last){return @{state='idle';phase='';percent=-1}}
 $dir=Join-Path (Join-Path $Root 'jobs') $last.job
 $state=@{job=$last.job;id=$last.id;quality=$last.quality;state='running';phase='starting';percent=-1}
 try{
  $s=Get-Content -LiteralPath (Join-Path $dir 'state.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($s.state -cin @('running','complete','cancelled','failed') -and $s.phase -cin @('install','download','verify','saved','stopped','error')){
   $state.state=$s.state;$state.phase=$s.phase;$state.percent=[Math]::Max(-1,[Math]::Min(100,[int]$s.percent))
   try{$state.age=[int][Math]::Max(0,([DateTime]::UtcNow-[DateTime]::Parse($s.updated).ToUniversalTime()).TotalSeconds)}catch{}
   if($s.state -eq 'failed' -and $s.errorCode -cin @('tls_certificate','remote_rejected','remote_auth','timeout','download_failed','engine_integrity','install_failed','verify_failed')){$state.errorCode=$s.errorCode}
   $v=$s.install
   if($s.phase -eq 'install' -and $v.component -cin @('yt-dlp','Deno','FFmpeg') -and $v.step -cin @('connect','transfer','verify','extract','finalize') -and $v.index -ge 1 -and $v.index -le 3 -and $v.bytes -ge 0 -and $v.bytes -le 400MB -and $v.total -ge -1 -and $v.total -le 400MB){$state.install=@{component=$v.component;index=[int]$v.index;step=$v.step;bytes=[long]$v.bytes;total=[long]$v.total}}
  }
 }catch{}
 if($state.state -eq 'failed' -and !$state.errorCode){
  # Classify legacy failed downloads without exposing raw log content to UI.
  if(Test-Path -LiteralPath (Join-Path $dir 'download.err') -PathType Leaf){$state.errorCode=Get-TTYoutubeErrorCode $dir 'download' ''}
 }
 if($state.state -eq 'running'){
  # The worker holds the exclusive file handle until exit; tolerate launch handshake.
  $busy=$false;$lock=$null
  try{$lock=[IO.File]::Open((Join-Path $Root '.download.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{$busy=$true}finally{if($lock){$lock.Dispose()}}
  $recent=$false
  try{$recent=([DateTime]::UtcNow-[DateTime]::Parse($last.created).ToUniversalTime()).TotalSeconds -lt 20}catch{}
  if(!$busy -and !$recent){$state.state='failed';$state.phase='error'}
 }
 return $state
}
function Get-TTYoutubeLibrary([string]$Root){
 $lib=Join-Path $Root 'library'
 if(!(Test-Path -LiteralPath $lib -PathType Container)){return}
 foreach($dir in @(Get-ChildItem -LiteralPath $lib -Directory|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 200)){
  if($dir.Name -cnotmatch '^([A-Za-z0-9_-]{11})-(720|1080)$' -or ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint)){continue}
  $id=$Matches[1];$q=$Matches[2]
  try{
   $p=Get-Item -LiteralPath (Join-Path $dir.FullName 'video.mp4')
   $m=Get-Content -LiteralPath (Join-Path $dir.FullName 'metadata.json') -Raw -Encoding UTF8|ConvertFrom-Json
   if($p.PSIsContainer -or ($p.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $p.Length -le 0 -or $m.id -cne $id -or $m.quality -cne $q -or $m.bytes -ne $p.Length){continue}
   @{id=$id;quality=$q;height=[int]$m.height;bytes=$p.Length;created=[string]$m.created}
  }catch{}
 }
}
function Start-TTYoutubeBoardJob([string]$Root,[string]$ServerScript,$InputData){
 if($InputData.id -isnot [string] -or $InputData.quality -isnot [string] -or $InputData.authorized -isnot [bool] -or !$InputData.authorized){throw 'invalid request'}
 $request=ConvertTo-TTYoutubeRequest $InputData.id $InputData.quality
 [void][IO.Directory]::CreateDirectory($Root)
 if((Get-TTYoutubeJobState $Root).state -eq 'running'){throw 'busy'}
 if(Test-Path -LiteralPath (Join-Path (Join-Path $Root 'library') ($request.id+'-'+$request.quality))){throw 'already saved'}
 $job=[guid]::NewGuid().ToString('N')
 $record=@{job=$job;id=$request.id;quality=$request.quality;created=[DateTime]::UtcNow.ToString('o')}
 $last=Join-Path $Root 'last-job.json';$temp=$last+'.'+$job+'.tmp'
 try{
  [IO.File]::WriteAllText($temp,($record|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  if([IO.File]::Exists($last)){[IO.File]::Replace($temp,$last,[NullString]::Value)}else{[IO.File]::Move($temp,$last)}
 }finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
 $psi=[Diagnostics.ProcessStartInfo]::new()
 $psi.FileName=Join-Path $PSHOME 'powershell.exe'
 $psi.Arguments=Join-TTYoutubeArgs @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$ServerScript,'-YoutubeJob',$job,'-YoutubeVideoId',$request.id,'-YoutubeQuality',$request.quality)
 $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.WorkingDirectory=$Root
 if($script:ttYoutubeProcess){$script:ttYoutubeProcess.Dispose();$script:ttYoutubeProcess=$null}
 $script:ttYoutubeProcess=[Diagnostics.Process]::Start($psi)
 if(!$script:ttYoutubeProcess){throw 'start failed'}
 return @{ok=$true;job=$job}
}
function Stop-TTYoutubeBoardJob([string]$Root,[string]$Job){
 if($Job -cnotmatch '^[a-f0-9]{32}$'){throw 'invalid job'}
 $state=Get-TTYoutubeJobState $Root
 if($state.job -cne $Job -or $state.state -ne 'running'){throw 'job not running'}
 $dir=Join-Path (Join-Path $Root 'jobs') $Job
 if(!(Test-Path -LiteralPath $dir -PathType Container)){throw 'job starting'}
 [IO.File]::WriteAllText((Join-Path $dir 'cancel'),'1')
 return @{ok=$true}
}
function Invoke-TTYoutubeBoardApi([string]$Path,[string]$Method,[bool]$SameOrigin,[bool]$PostOrigin,[string]$Token,[string]$Body,[string]$Root,[string]$ServerScript,[int]$BoardPort=17439){
 if(!$SameOrigin){return @{status='403 Forbidden';body='{"error":"forbidden"}'}}
 if($Path -eq '/api/youtube/status' -and $Method -eq 'GET'){
  return @{status='200 OK';body=(ConvertTo-Json -Compress -Depth 6 @{ok=$true;token=$script:ttYoutubeToken;job=(Get-TTYoutubeJobState $Root);library=@(Get-TTYoutubeLibrary $Root)})}
 }
 if($Path -cnotin @('/api/youtube/start','/api/youtube/cancel','/api/youtube/play-start','/api/youtube/play-status','/api/youtube/play-stop') -or $Method -ne 'POST'){return @{status='405 Method Not Allowed';body='{"error":"method"}'}}
 if(!$PostOrigin -or $Token -cne $script:ttYoutubeToken){return @{status='403 Forbidden';body='{"error":"forbidden"}'}}
 if($Body.Length -gt 1024){return @{status='400 Bad Request';body='{"error":"size"}'}}
 try{
  $x=ConvertFrom-Json $Body
  if($Path -eq '/api/youtube/start'){$answer=Start-TTYoutubeBoardJob $Root $ServerScript $x}
  elseif($Path -eq '/api/youtube/cancel'){$answer=Stop-TTYoutubeBoardJob $Root $x.job}
  elseif($Path -eq '/api/youtube/play-start'){$answer=Start-TTYoutubeBoardPlayback $Root $ServerScript $x $BoardPort}
  elseif($x.session -isnot [string] -or $x.session -cnotmatch '^[a-f0-9]{32}$'){throw 'invalid session'}
  elseif($Path -eq '/api/youtube/play-status'){$answer=Get-TTYoutubePlaybackState $x.session}
  else{$answer=Stop-TTYoutubeBoardPlayback $x.session}
  return @{status='200 OK';body=(ConvertTo-Json -Compress $answer)}
 }catch{return @{status='409 Conflict';body='{"error":"request rejected or worker busy"}'}}
}
# One isolated playback process per board; never wait for media or compilation in the HTTP loop.
$script:ttYoutubePlayback=$null
function Resolve-TTYoutubePlaybackFile([string]$Root,[string]$Id,[string]$Quality){
 $req=ConvertTo-TTYoutubeRequest $Id $Quality
 $library=Join-Path $Root 'library'
 $dir=Join-Path $library ($req.id+'-'+$req.quality)
 foreach($path in @($Root,$library,$dir)){
  $item=Get-Item -LiteralPath $path -ErrorAction Stop
  if(!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'invalid library directory'}
 }
 $file=Get-Item -LiteralPath (Join-Path $dir 'video.mp4') -ErrorAction Stop
 $meta=Get-Item -LiteralPath (Join-Path $dir 'metadata.json') -ErrorAction Stop
 if($file.PSIsContainer -or $meta.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($meta.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $meta.Length -gt 65536 -or $file.Length -le 0){throw 'invalid library file'}
 $record=Get-Content -LiteralPath $meta.FullName -Raw -Encoding UTF8|ConvertFrom-Json
 if($record.id -cne $Id -or $record.quality -cne $Quality -or $record.bytes -ne $file.Length){throw 'invalid library metadata'}
 return $file.FullName
}
function Clear-TTYoutubePlayback {
 $p=$script:ttYoutubePlayback
 if(!$p){return}
 if(!$p.process.HasExited){return}
 $p.process.Dispose()
 # Remove only the freshly created, private session directory.
 try{Remove-Item -LiteralPath $p.directory -Recurse -Force -ErrorAction Stop}catch{}
 $script:ttYoutubePlayback=$null
}
function Start-TTYoutubeBoardPlayback([string]$Root,[string]$ServerScript,$InputData,[int]$BoardPort){
 if($InputData.id -isnot [string] -or $InputData.quality -isnot [string]){throw 'invalid playback'}
 Clear-TTYoutubePlayback
 if($script:ttYoutubePlayback){throw 'playback busy'}
 $null=Resolve-TTYoutubePlaybackFile $Root $InputData.id $InputData.quality
 $playRoot=Join-Path $Root 'playback'
 [void][IO.Directory]::CreateDirectory($playRoot)
 if((Get-Item -LiteralPath $playRoot).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'invalid playback directory'}
 $session=[guid]::NewGuid().ToString('N');$dir=Join-Path $playRoot $session
 [void][IO.Directory]::CreateDirectory($dir)
 $psi=[Diagnostics.ProcessStartInfo]::new()
 $psi.FileName=Join-Path $PSHOME 'powershell.exe'
 $psi.Arguments=Join-TTYoutubeArgs @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$ServerScript,'-Port',"$BoardPort",'-YoutubePlayback',$session,'-YoutubeVideoId',$InputData.id,'-YoutubeQuality',$InputData.quality,'-YoutubeParentPid',"$PID")
 $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.WorkingDirectory=$Root
 try{
  $process=[Diagnostics.Process]::Start($psi)
  if(!$process){throw 'playback launch failed'}
  $script:ttYoutubePlayback=@{session=$session;directory=$dir;process=$process;created=[datetime]::UtcNow;stopping=$false}
  return @{ok=$true;session=$session;state='starting'}
 }catch{Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue;throw}
}
function Stop-TTYoutubeBoardPlayback([string]$Session){
 $p=$script:ttYoutubePlayback
 if(!$p -or $Session -cne $p.session){return @{ok=$true}}
 $p.stopping=$true
 [IO.File]::WriteAllText((Join-Path $p.directory 'stop'),'1')
 Clear-TTYoutubePlayback
 return @{ok=$true}
}
function Get-TTYoutubePlaybackState([string]$Session){
 $p=$script:ttYoutubePlayback
 if(!$p -or $Session -cne $p.session){return @{ok=$true;state='ended'}}
 if($p.process.HasExited){Clear-TTYoutubePlayback;return @{ok=$true;state='ended'}}
 if($p.stopping){return @{ok=$true;state='ended'}}
 $portFile=Join-Path $p.directory 'port'
 if(Test-Path -LiteralPath $portFile -PathType Leaf){
  $port=0
  if([int]::TryParse((Get-Content -LiteralPath $portFile -Raw -Encoding ASCII).Trim(),[ref]$port) -and $port -gt 0 -and $port -le 65535){return @{ok=$true;state='ready';url="http://127.0.0.1:$port/$Session/video.mp4"}}
 }
 if(([datetime]::UtcNow-$p.created).TotalSeconds -gt 25){$null=Stop-TTYoutubeBoardPlayback $Session;return @{ok=$true;state='ended'}}
 return @{ok=$true;state='starting'}
}
