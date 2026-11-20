# Offline worker integration: only generated media, no YouTube download.
function Test-TTYoutubeWorker([string]$Root,[string]$EngineDir){
 . (Join-Path $PSScriptRoot 'youtube-download-worker.ps1')
 $request=ConvertTo-TTYoutubeRequest 'DAHbOpoUrrg' '720'
 if($request.url -cne 'https://www.youtube.com/watch?v=DAHbOpoUrrg'){throw 'canonical URL'}
 foreach($bad in @('https://youtube.com/watch?v=DAHbOpoUrrg','../test.mp4','--help','DAHbOpoUrrg&list=x','DAHbOpoUrr')){
  $rejected=$false;try{$null=ConvertTo-TTYoutubeRequest $bad '720'}catch{$rejected=$true}
  if(!$rejected){throw 'unsafe id accepted'}
 }
 foreach($q in @('4k','720;anything','1081')){
  $rejected=$false;try{$null=ConvertTo-TTYoutubeRequest 'DAHbOpoUrrg' $q}catch{$rejected=$true}
  if(!$rejected){throw 'unsafe quality accepted'}
 }
 Write-Host 'PASS bounded canonical video ID and quality policy'
 $workerRoot=Join-Path $Root 'worker fixture with spaces';[void][IO.Directory]::CreateDirectory($workerRoot)
 $lock=[IO.File]::Open((Join-Path $workerRoot '.download.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 try{
  $rejected=$false;try{Start-TTYoutubeJob $workerRoot 'DAHbOpoUrrg' '720' ('a'*32)}catch{$rejected=$true}
  if(!$rejected -or (Test-Path (Join-Path $workerRoot 'jobs'))){throw 'concurrency not rejected'}
 }finally{$lock.Dispose()}
 Write-Host 'PASS second worker rejected before install or network'
 $job=Join-Path $workerRoot 'fixture';$lib=Join-Path $workerRoot 'library';[void][IO.Directory]::CreateDirectory($job)
 Write-TTYoutubeState $job 'running' 'download' 25
 Write-TTYoutubeState $job 'running' 'download' 50
 $state=Get-Content -LiteralPath (Join-Path $job 'state.json') -Raw|ConvertFrom-Json
 if($state.percent -ne 50 -or $state.state -ne 'running'){throw 'state update'}
 Write-Host 'PASS atomic status update'
 [IO.File]::WriteAllText((Join-Path $job 'download.err'),'[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed')
 if((Get-TTYoutubeErrorCode $job 'download' 'engine failed') -cne 'tls_certificate'){throw 'TLS failure classification'}
 Write-TTYoutubeState $job 'failed' 'error' -1 $null 'tls_certificate'
 if((Get-Content -LiteralPath (Join-Path $job 'state.json') -Raw|ConvertFrom-Json).errorCode -cne 'tls_certificate'){throw 'TLS code persistence'}
 Write-Host 'PASS safe TLS error classification and persistence'
 $mp4=Join-Path $job 'video.mp4'
 $null=Invoke-TTYoutubeProcess (Join-Path $EngineDir 'ffmpeg.exe') @('-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',$mp4) $job 'generate' 60
 $hash=(Get-FileHash -LiteralPath $mp4).Hash
 Complete-TTYoutubeVideo $job $lib $EngineDir $request
 $stored=Join-Path $lib 'DAHbOpoUrrg-720';$video=Join-Path $stored 'video.mp4'
 if(!(Test-Path -LiteralPath $video) -or (Get-FileHash -LiteralPath $video).Hash -ne $hash -or (Test-Path -LiteralPath $mp4)){throw 'library transfer'}
 $meta=Get-Content -LiteralPath (Join-Path $stored 'metadata.json') -Raw|ConvertFrom-Json
 if($meta.height -ne 360 -or $meta.quality -ne '720' -or $meta.id -cne $request.id){throw 'library metadata'}
 Write-Host 'PASS H264 AAC verification and atomic media library commit'
 $duplicate=Join-Path $workerRoot 'duplicate';[void][IO.Directory]::CreateDirectory($duplicate)
 Copy-Item -LiteralPath $video -Destination (Join-Path $duplicate 'video.mp4')
 $rejected=$false;try{Complete-TTYoutubeVideo $duplicate $lib $EngineDir $request}catch{$rejected=$true}
 if(!$rejected -or (Get-FileHash -LiteralPath $video).Hash -ne $hash){throw 'existing video overwritten'}
 Write-Host 'PASS duplicate library entry preserved'
 $badJob=Join-Path $workerRoot 'bad';[void][IO.Directory]::CreateDirectory($badJob)
 [IO.File]::WriteAllText((Join-Path $badJob 'video.mp4'),'not video')
 $rejected=$false;try{Complete-TTYoutubeVideo $badJob $lib $EngineDir (ConvertTo-TTYoutubeRequest 'aaaaaaaaaaa' '720')}catch{$rejected=$true}
 if(!$rejected -or (Test-Path -LiteralPath (Join-Path $lib 'aaaaaaaaaaa-720'))){throw 'invalid video accepted'}
 Write-Host 'PASS corrupted media rejected'
 $cancelJob=Join-Path $workerRoot 'cancel';[void][IO.Directory]::CreateDirectory($cancelJob)
 $exe=Join-Path $PSHOME 'powershell.exe'
 $payload='[IO.File]::WriteAllText("worker.pid",[string]$PID); [IO.File]::WriteAllText("cancel","1"); Start-Sleep -Seconds 30'
 $b64=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($payload))
 $rejected=$false;try{$null=Invoke-TTYoutubeProcess $exe @('-NoProfile','-NonInteractive','-EncodedCommand',$b64) $cancelJob 'cancel-test' 20}catch{if($_.Exception.Message -ne 'cancelled'){throw};$rejected=$true}
 if(!$rejected -or !(Test-Path -LiteralPath (Join-Path $cancelJob 'worker.pid'))){throw 'cancel not observed'}
 $child=[int](Get-Content -LiteralPath (Join-Path $cancelJob 'worker.pid') -Raw)
 if(Get-Process -Id $child -ErrorAction SilentlyContinue){throw 'cancelled process still alive'}
 Write-Host 'PASS running process cancellation and exit'
}
