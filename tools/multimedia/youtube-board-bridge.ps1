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
  }
 }catch{}
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
function Invoke-TTYoutubeBoardApi([string]$Path,[string]$Method,[bool]$SameOrigin,[bool]$PostOrigin,[string]$Token,[string]$Body,[string]$Root,[string]$ServerScript){
 if(!$SameOrigin){return @{status='403 Forbidden';body='{"error":"forbidden"}'}}
 if($Path -eq '/api/youtube/status' -and $Method -eq 'GET'){
  return @{status='200 OK';body=(ConvertTo-Json -Compress -Depth 6 @{ok=$true;token=$script:ttYoutubeToken;job=(Get-TTYoutubeJobState $Root);library=@(Get-TTYoutubeLibrary $Root)})}
 }
 if($Path -cnotin @('/api/youtube/start','/api/youtube/cancel') -or $Method -ne 'POST'){return @{status='405 Method Not Allowed';body='{"error":"method"}'}}
 if(!$PostOrigin -or $Token -cne $script:ttYoutubeToken){return @{status='403 Forbidden';body='{"error":"forbidden"}'}}
 if($Body.Length -gt 1024){return @{status='400 Bad Request';body='{"error":"size"}'}}
 try{
  $x=ConvertFrom-Json $Body
  if($Path -eq '/api/youtube/start'){$answer=Start-TTYoutubeBoardJob $Root $ServerScript $x}
  else{$answer=Stop-TTYoutubeBoardJob $Root $x.job}
  return @{status='200 OK';body=(ConvertTo-Json -Compress $answer)}
 }catch{return @{status='409 Conflict';body='{"error":"request rejected or worker busy"}'}}
}
