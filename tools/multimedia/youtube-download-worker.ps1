# Candidate worker library, Windows PowerShell 5.1. Not exposed to HTTP yet.
# Only an authorized board-side launcher may invoke Start-TTYoutubeJob.
. (Join-Path $PSScriptRoot 'youtube-engine-install.ps1')
function ConvertTo-TTYoutubeRequest([string]$VideoId,[string]$Quality){
 if($VideoId -cnotmatch '^[A-Za-z0-9_-]{11}$'){throw 'invalid video ID'}
 if($Quality -cnotin @('720','1080')){throw 'invalid quality'}
 return @{id=$VideoId;quality=$Quality;url=('https://www.youtube.com/watch?v='+$VideoId)}
}
# Windows CRT quoting: double trailing backslashes, escape backslashes before quotes.
function Join-TTYoutubeArgs([string[]]$Items){
 $quoted=foreach($item in $Items){
  '"'+ [regex]::Replace([regex]::Replace($item,'(\\*)"','$1$1\"'),'(\\+)$','$1$1') + '"'
 }
 return ($quoted -join ' ')
}
function Write-TTYoutubeState([string]$JobDir,[string]$State,[string]$Phase,[int]$Percent=-1,[hashtable]$Install=$null,[string]$ErrorCode=''){
 $file=Join-Path $JobDir 'state.json'
 $temp=Join-Path $JobDir ('state-'+[guid]::NewGuid().ToString('N')+'.tmp')
 try{
  $record=@{state=$State;phase=$Phase;percent=$Percent;updated=[DateTime]::UtcNow.ToString('o')}
  if($Install){$record.install=$Install}
  if($ErrorCode){$record.errorCode=$ErrorCode}
  $json=$record|ConvertTo-Json -Compress -Depth 4
  [IO.File]::WriteAllText($temp,$json,[Text.UTF8Encoding]::new($false))
  if([IO.File]::Exists($file)){[IO.File]::Replace($temp,$file,[NullString]::Value)}else{[IO.File]::Move($temp,$file)}
 }finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
}
# Internal process function; never accept an executable path or argv from an HTTP request.
function Stop-TTYoutubeProcess($Process){
 if($Process.HasExited){return}
 $taskkill=Join-Path $env:SystemRoot 'System32\taskkill.exe'
 $null=& $taskkill /PID $Process.Id /T /F 2>&1
 if(!$Process.WaitForExit(5000)){throw 'process tree shutdown failed'}
}
function Invoke-TTYoutubeProcess([string]$Exe,[string[]]$Argv,[string]$JobDir,[string]$Phase,[int]$TimeoutSec=1800){
 $out=Join-Path $JobDir ($Phase+'.out');$err=Join-Path $JobDir ($Phase+'.err')
 if(Test-Path -LiteralPath (Join-Path $JobDir 'cancel')){throw 'cancelled'}
 $psi=[Diagnostics.ProcessStartInfo]::new()
 $psi.FileName=$Exe;$psi.Arguments=Join-TTYoutubeArgs $Argv
 $psi.WorkingDirectory=$JobDir;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
 $psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
 # Bound captured logs via asynchronous stream copies, with cancellation and length limits.
 $p=[Diagnostics.Process]::new();$p.StartInfo=$psi
 $os=$null;$es=$null;$started=$false
 try{
  $os=[IO.File]::Open($out,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  $es=[IO.File]::Open($err,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  if(!$p.Start()){throw 'process start failed'};$started=$true
  $ot=$p.StandardOutput.BaseStream.CopyToAsync($os);$et=$p.StandardError.BaseStream.CopyToAsync($es)
  $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSec)
  $last=-2
  while(!$p.WaitForExit(400)){
   if(Test-Path -LiteralPath (Join-Path $JobDir 'cancel')){throw 'cancelled'}
   if([DateTime]::UtcNow -gt $deadline){throw 'timeout'}
   if($os.Length -gt 4MB -or $es.Length -gt 4MB){throw 'log limit'}
   if($Phase -eq 'download'){
    $pct=-1
    try{
     $lines=@(Get-Content -LiteralPath $out -Tail 12 -ErrorAction Stop)
     foreach($line in $lines){if($line -match '^TT_PROGRESS:\s*(\d{1,3})(?:\.\d+)?%'){$pct=[Math]::Min(100,[int]$Matches[1])}}
    }catch{}
    if($pct -ne $last){Write-TTYoutubeState $JobDir 'running' $Phase $pct;$last=$pct}
   }
  }
  if(!$ot.Wait(5000) -or !$et.Wait(5000)){throw 'log drain timeout'}
  if($p.ExitCode -ne 0){throw 'engine failed'}
  if($os.Length -gt 4MB -or $es.Length -gt 4MB){throw 'log limit'}
  if(Test-Path -LiteralPath (Join-Path $JobDir 'cancel')){throw 'cancelled'}
 }finally{
  try{if($started -and !$p.HasExited){Stop-TTYoutubeProcess $p}}finally{
   if($os){$os.Dispose()};if($es){$es.Dispose()};$p.Dispose()
  }
 }
 return $out
}
# Titles are display data only; never use them as filesystem paths or commands.
function ConvertTo-TTYoutubeTitle($Value){
 if($Value -isnot [string]){return ''}
 $v=[regex]::Replace($Value,'[\p{Cc}\p{Zl}\p{Zp}]',' ').Trim()
 if($v.Length -gt 180){$v=$v.Substring(0,180);if([char]::IsHighSurrogate($v[$v.Length-1])){$v=$v.Substring(0,$v.Length-1)}}
 return $v.Trim()
}
function Get-TTYoutubeOriginalTitle([string]$JobDir){
 try{
  $p=Get-Item -LiteralPath (Join-Path $JobDir 'title.json') -ErrorAction Stop
  if($p.PSIsContainer -or $p.Length -gt 65536 -or ($p.Attributes -band [IO.FileAttributes]::ReparsePoint)){return ''}
  $raw=[IO.File]::ReadAllText($p.FullName,[Text.Encoding]::UTF8).Trim()
  $v=('{"title":'+$raw+'}'|ConvertFrom-Json).title
  return (ConvertTo-TTYoutubeTitle $v)
 }catch{return ''}
}
# Files in the single library folder are the source of truth. Never accept a path from HTTP.
function Get-TTYoutubeFlatFiles([string]$LibraryRoot){
 if(!(Test-Path -LiteralPath $LibraryRoot -PathType Container)){return}
 $folder=Get-Item -LiteralPath $LibraryRoot -ErrorAction Stop
 if($folder.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'invalid library directory'}
 Get-ChildItem -LiteralPath $folder.FullName -File -ErrorAction Stop|Where-Object {$_.Extension -in @('.mp4','.webm','.ogv','.ogg') -and $_.Length -gt 0 -and !($_.Attributes -band [IO.FileAttributes]::ReparsePoint)}
}
function Get-TTYoutubeFlatId([string]$Name){
 $sha=[Security.Cryptography.SHA256]::Create()
 try{return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Name.ToUpperInvariant())))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
}
function Get-TTYoutubeDownloadName([string]$Title,[hashtable]$Request){
 $safe=[regex]::Replace($Title,'[<>:"/\\|?*\x00-\x1F]','_').Trim().TrimEnd('.')
 if($safe.Length -gt 80){$safe=$safe.Substring(0,80);if([char]::IsHighSurrogate($safe[$safe.Length-1])){$safe=$safe.Substring(0,$safe.Length-1)}}
 if(!$safe){$safe='YouTube'}
 return $safe+' ['+$Request.id+'-'+$Request.quality+'].mp4'
}
function Test-TTYoutubeStoredVideo([string]$LibraryRoot,[hashtable]$Request){
 $key=$Request.id+'-'+$Request.quality
 if(Test-Path -LiteralPath (Join-Path (Join-Path $LibraryRoot $key) 'video.mp4') -PathType Leaf){return $true}
 foreach($file in @(Get-TTYoutubeFlatFiles $LibraryRoot)){if($file.Name.EndsWith(' ['+$key+'].mp4',[StringComparison]::Ordinal)){return $true}}
 return $false
}
function Complete-TTYoutubeVideo([string]$JobDir,[string]$LibraryRoot,[string]$EngineDir,[hashtable]$Request){
 $file=Join-Path $JobDir 'video.mp4'
 if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw 'missing MP4'}
 $probe=Invoke-TTYoutubeProcess (Join-Path $EngineDir 'ffprobe.exe') @('-v','error','-show_streams','-show_format','-of','json',$file) $JobDir 'verify' 60
 $meta=Get-Content -LiteralPath $probe -Raw -Encoding UTF8|ConvertFrom-Json
 $video=@($meta.streams|Where-Object {$_.codec_type -eq 'video'})
 $audio=@($meta.streams|Where-Object {$_.codec_type -eq 'audio'})
 if($video.Count -ne 1 -or $audio.Count -ne 1 -or $video[0].codec_name -ne 'h264' -or $audio[0].codec_name -ne 'aac' -or $video[0].height -le 0 -or $video[0].height -gt [int]$Request.quality -or $meta.format.format_name -notmatch '(^|,)mp4(,|$)'){throw 'media validation'}
 if(Test-Path -LiteralPath (Join-Path $JobDir 'cancel')){throw 'cancelled'}
 [void][IO.Directory]::CreateDirectory($LibraryRoot)
 if(Test-TTYoutubeStoredVideo $LibraryRoot $Request){throw 'video already stored'}
 $folder=Get-Item -LiteralPath $LibraryRoot -ErrorAction Stop
 if($folder.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'invalid library directory'}
 $target=Join-Path $folder.FullName (Get-TTYoutubeDownloadName (Get-TTYoutubeOriginalTitle $JobDir) $Request)
 if(Test-Path -LiteralPath (Join-Path $JobDir 'cancel')){throw 'cancelled'}
 # Same-volume atomic move, no overwrite and no persistent metadata required.
 [IO.File]::Move($file,$target)
}
function Get-TTYoutubeErrorCode([string]$JobDir,[string]$Phase,[string]$Message){
 if($Phase -eq 'download'){
  $log='';try{$log=(Get-Content -LiteralPath (Join-Path $JobDir 'download.err') -Tail 30 -ErrorAction Stop) -join "`n"}catch{}
  if($log -match 'CERTIFICATE_VERIFY_FAILED|CertificateVerifyError'){return 'tls_certificate'}
  if($log -match 'HTTP Error 403|HTTP Error 429'){return 'remote_rejected'}
  if($log -match 'Sign in|not a bot|login required'){return 'remote_auth'}
  if($Message -match 'timeout' -or $log -match 'timed out|timeout'){return 'timeout'}
  return 'download_failed'
 }
 if($Phase -eq 'install'){if($Message -match 'timeout'){return 'timeout'};if($Message -match 'integrity|archive'){return 'engine_integrity'};return 'install_failed'}
 return 'verify_failed'
}
function Start-TTYoutubeJob([string]$Root,[string]$VideoId,[string]$Quality,[string]$JobId){
 $request=ConvertTo-TTYoutubeRequest $VideoId $Quality
 if($JobId -cnotmatch '^[a-f0-9]{32}$'){throw 'invalid job ID'}
 $root=[IO.Path]::GetFullPath($Root)
 [void][IO.Directory]::CreateDirectory($root)
 $lock=[IO.File]::Open((Join-Path $root '.download.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 $job=$null;$phase='install'
 try{
  $jobs=Join-Path $root 'jobs';[void][IO.Directory]::CreateDirectory($jobs)
  $job=Join-Path $jobs $JobId
  if(Test-Path -LiteralPath $job){$job=$null;throw 'job already exists'}
  [void][IO.Directory]::CreateDirectory($job)
  Write-TTYoutubeState $job 'running' 'install'
  $progress={param($component,$index,$step,$bytes,$total)
   $pct=if($total -gt 0){[int][Math]::Floor(100.0*$bytes/$total)}else{-1}
   Write-TTYoutubeState $job 'running' 'install' $pct @{component=$component;index=$index;step=$step;bytes=$bytes;total=$total}
  }
  $engine=Install-TTYoutubeEngine (Join-Path $root 'engines') $job $progress
  Assert-TTEngineNotCancelled $job
  $library=Join-Path $root 'library'
  if(Test-TTYoutubeStoredVideo $library $request){throw 'video already stored'}
  $phase='download';Write-TTYoutubeState $job 'running' 'download'
  $dir=$engine.directory
  $h=$request.quality
  $format="bv[height<=$h][ext=mp4][vcodec^=avc1]+ba[ext=m4a][acodec^=mp4a]/b[height<=$h][ext=mp4][vcodec^=avc1][acodec^=mp4a]"
  $argv=@('--ignore-config','--compat-options','no-certifi','--no-playlist','--no-cache-dir','--no-cookies','--no-cookies-from-browser','--no-js-runtimes','--js-runtimes',('deno:'+(Join-Path $dir 'deno.exe')),'--ffmpeg-location',$dir,'--socket-timeout','20','--retries','3','--fragment-retries','3','--max-filesize','2G','--newline','--progress','--progress-template','download:TT_PROGRESS:%(progress._percent_str)s','--print-to-file','after_move:%(title)j','title.json','--no-simulate','--format',$format,'--merge-output-format','mp4','--no-mtime','-o',(Join-Path $job 'video.%(ext)s'),'--',$request.url)
  $null=Invoke-TTYoutubeProcess (Join-Path $dir 'yt-dlp.exe') $argv $job 'download' 3600
  $phase='verify';Write-TTYoutubeState $job 'running' 'verify'
  Complete-TTYoutubeVideo $job $library $dir $request
  Write-TTYoutubeState $job 'complete' 'saved' 100
 }catch{
  if($job -and (Test-Path -LiteralPath $job)){
   if(Test-Path -LiteralPath (Join-Path $job 'cancel')){Write-TTYoutubeState $job 'cancelled' 'stopped'}else{$code=Get-TTYoutubeErrorCode $job $phase $_.Exception.Message;Write-TTYoutubeState $job 'failed' 'error' -1 $null $code}
  }
  throw
 }finally{
  try{if($job -and (Test-Path -LiteralPath $job)){
   # Retain status and bounded logs only; never touch completed library entries.
   Get-ChildItem -LiteralPath $job -Force|Where-Object {$_.Name -notin @('state.json','cancel','download.out','download.err','verify.out','verify.err')}|Remove-Item -Recurse -Force
  }}finally{$lock.Dispose()}
 }
}
