# Windows PowerShell 5.1 candidate installer integration test.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'youtube-engine-install.ps1')
$root=Join-Path $env:RUNNER_TEMP ('tt-engine-install-'+[guid]::NewGuid().ToString('N'))
try{
 if((Get-TTYoutubeEngineState $root).state -ne 'missing'){throw 'fresh state'}
 $first=Install-TTYoutubeEngine $root
 if($first.state -ne 'ready'){throw 'install failed'}
 Write-Host 'PASS verified installation in fresh per-user directory'
 $dir=$first.directory
 $stamp=(Get-Item -LiteralPath (Join-Path $dir 'manifest.json')).LastWriteTimeUtc
 $second=Install-TTYoutubeEngine $root
 if($second.state -ne 'ready' -or $second.directory -cne $dir -or (Get-Item -LiteralPath (Join-Path $dir 'manifest.json')).LastWriteTimeUtc -ne $stamp){throw 'not idempotent'}
 Write-Host 'PASS installed engine reuse without replacement'
 $y=Join-Path $dir 'yt-dlp.exe'
 $v=& $y --ignore-config --version
 if($LASTEXITCODE -ne 0 -or "$v" -ne '2026.10.26'){throw 'installed yt-dlp unable to run'}
 $v=& (Join-Path $dir 'deno.exe') eval 'console.log(42)'
 if($LASTEXITCODE -ne 0 -or "$v" -ne '42'){throw 'installed deno unable to run'}
 foreach($name in @('ffmpeg.exe','ffprobe.exe')){
  $null=& (Join-Path $dir $name) -version
  if($LASTEXITCODE -ne 0){throw 'installed ffmpeg unable to run'}
 }
 Write-Host 'PASS extracted engine execution under Windows PowerShell 5.1'
 . (Join-Path $PSScriptRoot 'youtube-download-worker-test.ps1')
 Test-TTYoutubeWorker $root $dir
 . (Join-Path $PSScriptRoot 'youtube-board-bridge-test.ps1')
 Test-TTYoutubeBridge $root
 . (Join-Path $PSScriptRoot 'youtube-offline-media-test.ps1')
 Test-TTYoutubeMedia $root
 # Keep signed server's generated sections synchronized with tested canonical source.
 $server=Get-Content -LiteralPath (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path 'runtime-src/system/server.ps1') -Raw -Encoding UTF8
 foreach($name in @('youtube-engine-install.ps1','youtube-download-worker.ps1','youtube-board-bridge.ps1')){
  $expected=(Get-Content -LiteralPath (Join-Path $PSScriptRoot $name) -Raw -Encoding UTF8).Replace("`r`n","`n").TrimEnd()
  if($name -eq 'youtube-download-worker.ps1'){$expected=$expected.Replace('. (Join-Path $PSScriptRoot ''youtube-engine-install.ps1'')'+"`n",'')}
  $pattern='(?s)# BEGIN GENERATED '+[regex]::Escape($name)+"`n"+'(.*?)'+"`n"+'# END GENERATED '+[regex]::Escape($name)
  $m=[regex]::Match($server.Replace("`r`n","`n"),$pattern)
  if(!$m.Success -or $m.Groups[1].Value -cne $expected){throw 'embedded downloader source drift'}
 }
 Write-Host 'PASS signed server embedded source parity'
 [IO.File]::AppendAllText($y,'tamper fixture')
 if((Get-TTYoutubeEngineState $root).state -ne 'invalid'){throw 'tamper not detected'}
 $rejected=$false
 try{$null=Install-TTYoutubeEngine $root}catch{$rejected=$true}
 if(!$rejected -or !(Test-Path -LiteralPath $y)){throw 'invalid engine overwritten'}
 Write-Host 'PASS tamper rejection without overwriting current engine'
 if(@(Get-ChildItem -LiteralPath $root -Directory -Filter 'stage-*').Count -ne 0){throw 'staging leak'}
 Write-Host 'PASS staging cleanup'
}finally{if(Test-Path -LiteralPath $root){Remove-Item -LiteralPath $root -Recurse -Force}}
