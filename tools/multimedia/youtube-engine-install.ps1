# Candidate installer: Windows PowerShell 5.1 compatible. No admin, PATH or registry changes.
# Pins were verified by the isolated Windows smoke run 44527013450.
# Only a caller-controlled, local engine root is supported. No arbitrary download URLs.
$ErrorActionPreference='Stop'
function Get-TTYoutubePin {
 @(
  @{repo='yt-dlp/yt-dlp';tag='2026.10.26';name='yt-dlp.exe';sha='f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d';max=80MB;exe=@('yt-dlp.exe')},
  @{repo='denoland/deno';tag='v2.9.4';name='deno-x86_64-pc-windows-msvc.zip';sha='68ed08b05c56cf887e9aa509947dc3f468f7e12f47a13e5c1abd51d46d1453ef';max=150MB;exe=@('deno.exe')},
  @{repo='FFmpeg-Builds/FFmpeg-Builds';tag='autobuild-2026-11-12-15-40';name='ffmpeg-n9.0.2-57-gd838f9f9ae-win64-gpl-9.0.zip';sha='cf43d18e45a1b79a4d74f0e6f94206fe23d82f38de11352e5db9496058dc9c48';max=400MB;exe=@('ffmpeg.exe','ffprobe.exe')}
 )
}
function Get-TTYoutubeEngineId { 'yt2026.10.26-deno2.9.4-ffmpeg20261112' }
function Get-TTYoutubeEngineState([string]$Root){
 $id=Get-TTYoutubeEngineId
 $dir=Join-Path $Root $id
 if(!(Test-Path -LiteralPath $dir)){return @{state='missing';id=$id}}
 try{
  $m=Get-Content -LiteralPath (Join-Path $dir 'manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($m.id -cne $id){throw 'manifest identity'}
  foreach($name in @('yt-dlp.exe','deno.exe','ffmpeg.exe','ffprobe.exe')){
   $p=Join-Path $dir $name
   if(!(Test-Path -LiteralPath $p -PathType Leaf)){throw 'missing binary'}
   $entry=@($m.files|Where-Object {$_.name -ceq $name})
   if($entry.Count -ne 1 -or $entry[0].sha -cnotmatch '^[0-9a-f]{64}$' -or (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry[0].sha){throw 'binary integrity'}
  }
  return @{state='ready';id=$id;directory=$dir}
 }catch{return @{state='invalid';id=$id}}
}
function Install-TTYoutubeEngine([string]$Root){
 if($env:OS -ne 'Windows_NT' -or ![Environment]::Is64BitOperatingSystem){throw 'Windows x64 required'}
 $Root=[IO.Path]::GetFullPath($Root)
 [void][IO.Directory]::CreateDirectory($Root)
 $lock=[IO.File]::Open((Join-Path $Root '.install.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 $stage=$null
 try{
  $state=Get-TTYoutubeEngineState $Root
  if($state.state -eq 'ready'){return $state}
  if($state.state -eq 'invalid'){throw 'Existing engine failed integrity; leave untouched for explicit recovery'}
  $stage=Join-Path $Root ('stage-'+[guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($stage)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  foreach($pin in (Get-TTYoutubePin)){
   $src='https://github.com/'+$pin.repo+'/releases/download/'+$pin.tag+'/'+$pin.name
   $archive=Join-Path $stage $pin.name
   Invoke-WebRequest -UseBasicParsing -Uri $src -OutFile $archive -TimeoutSec 240 -ErrorAction Stop
   $size=(Get-Item -LiteralPath $archive).Length
   if($size -le 0 -or $size -gt $pin.max -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha){throw 'upstream asset integrity'}
   if($pin.name.EndsWith('.zip')){
    $zip=[IO.Compression.ZipFile]::OpenRead($archive)
    try{
     foreach($name in $pin.exe){
      $e=@($zip.Entries|Where-Object {$_.Name -ceq $name})
      if($e.Count -ne 1 -or $e[0].Length -le 0 -or $e[0].Length -gt 500MB){throw 'invalid archive entry'}
      [IO.Compression.ZipFileExtensions]::ExtractToFile($e[0],(Join-Path $stage $name),$false)
     }
    }finally{$zip.Dispose()}
    Remove-Item -LiteralPath $archive -Force
   }
  }
  $files=@(foreach($name in @('yt-dlp.exe','deno.exe','ffmpeg.exe','ffprobe.exe')){
   @{name=$name;sha=(Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()}
  })
  $id=Get-TTYoutubeEngineId
  @{id=$id;files=$files}|ConvertTo-Json -Depth 4 -Compress|Set-Content -LiteralPath (Join-Path $stage 'manifest.json') -Encoding UTF8
  [IO.Directory]::Move($stage,(Join-Path $Root $id))
  $stage=$null
  $state=Get-TTYoutubeEngineState $Root
  if($state.state -ne 'ready'){throw 'installed engine integrity'}
  return $state
 }finally{
  if($stage -and (Test-Path -LiteralPath $stage)){Remove-Item -LiteralPath $stage -Recurse -Force}
  $lock.Dispose()
 }
}
