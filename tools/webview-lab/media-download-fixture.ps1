param([string]$YoutubeJob,[string]$YoutubeVideoId,[string]$YoutubeQuality)
$ErrorActionPreference='Stop'
if($YoutubeJob -cnotmatch '^[a-f0-9]{32}$' -or $YoutubeVideoId -cnotmatch '^LAB_[A-Z0-9]{7}$' -or $YoutubeQuality -cnotin @('720','1080')){exit 2}
$lab=$env:HOJA_LAB_ROOT
if(!$lab -or $env:LOCALAPPDATA -ne (Join-Path $lab 'local') -or !(Test-Path (Join-Path $lab 'media-download-fixture.flag'))){exit 2}
$root=Join-Path $env:LOCALAPPDATA 'TeacherToolsMedia'
$dir=Join-Path (Join-Path $root 'jobs') $YoutubeJob
$guard=[IO.File]::Open((Join-Path $root '.download.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
function State($state,$phase,$percent){
 $p=Join-Path $dir 'state.json';$tmp=$p+'.tmp'
 [IO.File]::WriteAllText($tmp,(@{state=$state;phase=$phase;percent=$percent;updated=[datetime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 if([IO.File]::Exists($p)){[IO.File]::Replace($tmp,$p,[NullString]::Value)}else{[IO.File]::Move($tmp,$p)}
}
try{
 [void][IO.Directory]::CreateDirectory($dir)
 State 'running' 'download' 25
 $until=[datetime]::UtcNow.AddSeconds(25)
 while([datetime]::UtcNow -lt $until){
  if(Test-Path -LiteralPath (Join-Path $dir 'cancel')){State 'cancelled' 'stopped' -1;exit 0}
  if(Test-Path -LiteralPath (Join-Path $dir 'complete.fixture')){State 'complete' 'saved' 100;exit 0}
  Start-Sleep -Milliseconds 100
 }
 State 'failed' 'error' -1;exit 1
}finally{$guard.Dispose()}
