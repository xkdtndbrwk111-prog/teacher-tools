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
function Write-TTYoutubeState([string]$JobDir,[string]$State,[string]$Phase,[int]$Percent=-1){
 $file=Join-Path $JobDir 'state.json'
 $temp=Join-Path $JobDir ('state-'+[guid]::NewGuid().ToString('N')+'.tmp')
 try{
  $json=@{state=$State;phase=$Phase;percent=$Percent;updated=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress
  [IO.File]::WriteAllText($temp,$json,[Text.UTF8Encoding]::new($false))
  if([IO.File]::Exists($file)){[IO.File]::Replace($temp,$file,$null)}else{[IO.File]::Move($temp,$file)}
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
 $key=$Request.id+'-'+$Request.quality
 $target=Join-Path $LibraryRoot $key
 if(Test-Path -LiteralPath $target){throw 'video already stored'}
 # Same-volume atomic directory move: staging and library must share the per-user root.
 $stage=Join-Path $JobDir 'completed'
 [void][IO.Directory]::CreateDirectory($stage)
 [IO.File]::Move($file,(Join-Path $stage 'video.mp4'))
 $info=@{id=$Request.id;quality=$Request.quality;height=[int]$video[0].height;bytes=(Get-Item -LiteralPath (Join-Path $stage 'video.mp4')).Length;created=[DateTime]::UtcNow.ToString('o')}
 [IO.File]::WriteAllText((Join-Path $stage 'metadata.json'),($info|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 if(Test-Path -LiteralPath (Join-Path $JobDir 'cancel')){throw 'cancelled'}
 [IO.Directory]::Move($stage,$target)
}
function Start-TTYoutubeJob([string]$Root,[string]$VideoId,[string]$Quality,[string]$JobId){
 $request=ConvertTo-TTYoutubeRequest $VideoId $Quality
 if($JobId -cnotmatch '^[a-f0-9]{32}$'){throw 'invalid job ID'}
 $root=[IO.Path]::GetFullPath($Root)
 [void][IO.Directory]::CreateDirectory($root)
 $lock=[IO.File]::Open((Join-Path $root '.download.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 $job=$null
 try{
  $jobs=Join-Path $root 'jobs';[void][IO.Directory]::CreateDirectory($jobs)
  $job=Join-Path $jobs $JobId
  if(Test-Path -LiteralPath $job){$job=$null;throw 'job already exists'}
  [void][IO.Directory]::CreateDirectory($job)
  Write-TTYoutubeState $job 'running' 'install'
  $engine=Install-TTYoutubeEngine (Join-Path $root 'engines')
  $library=Join-Path $root 'library'
  if(Test-Path -LiteralPath (Join-Path $library ($request.id+'-'+$request.quality))){throw 'video already stored'}
  Write-TTYoutubeState $job 'running' 'download'
  $dir=$engine.directory
  $h=$request.quality
  $format="bv[height<=$h][ext=mp4][vcodec^=avc1]+ba[ext=m4a][acodec^=mp4a]/b[height<=$h][ext=mp4][vcodec^=avc1][acodec^=mp4a]"
  $args=@('--ignore-config','--no-playlist','--no-cache-dir','--no-cookies','--no-cookies-from-browser','--no-js-runtimes','--js-runtimes',('deno:'+(Join-Path $dir 'deno.exe')),'--ffmpeg-location',$dir,'--socket-timeout','20','--retries','3','--fragment-retries','3','--max-filesize','2G','--newline','--progress','--progress-template','download:TT_PROGRESS:%(progress._percent_str)s','--format',$format,'--merge-output-format','mp4','--no-mtime','-o',(Join-Path $job 'video.%(ext)s'),'--',$request.url)
  $null=Invoke-TTYoutubeProcess (Join-Path $dir 'yt-dlp.exe') $args $job 'download' 3600
  Write-TTYoutubeState $job 'running' 'verify'
  Complete-TTYoutubeVideo $job $library $dir $request
  Write-TTYoutubeState $job 'complete' 'saved' 100
 }catch{
  if($job -and (Test-Path -LiteralPath $job)){
   if(Test-Path -LiteralPath (Join-Path $job 'cancel')){Write-TTYoutubeState $job 'cancelled' 'stopped'}else{Write-TTYoutubeState $job 'failed' 'error'}
  }
  throw
 }finally{
  if($job -and (Test-Path -LiteralPath $job)){
   # Retain status and bounded logs only; never touch completed library entries.
   Get-ChildItem -LiteralPath $job -Force|Where-Object {$_.Name -notin @('state.json','cancel','download.out','download.err','verify.out','verify.err')}|Remove-Item -Recurse -Force
  }
  $lock.Dispose()
 }
}
