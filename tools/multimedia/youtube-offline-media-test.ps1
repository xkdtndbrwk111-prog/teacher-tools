# Offline-only media fixture: actual generated MP4, no external network.
function Test-TTYoutubeMedia([string]$Root){
 . (Join-Path $PSScriptRoot 'youtube-download-worker.ps1')
 $file=Join-Path $Root 'worker fixture with spaces/library/DAHbOpoUrrg-720/video.mp4'
 $expected=[IO.File]::ReadAllBytes($file)
 $session=Join-Path $Root 'media session';[void][IO.Directory]::CreateDirectory($session)
 $token=[guid]::NewGuid().ToString('N')
 $source=Join-Path $PSScriptRoot 'youtube-offline-media.ps1'
 $quote={param($v) "'"+$v.Replace("'","''")+"'"}
 $command='. '+(& $quote $source)+'; Start-TTYoutubeMediaServer '+(& $quote $file)+' '+(& $quote $session)+' '+(& $quote $token)+' 17439 90'
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
 $psi=[Diagnostics.ProcessStartInfo]::new()
 $psi.FileName=Join-Path $PSHOME 'powershell.exe'
 $psi.Arguments=Join-TTYoutubeArgs @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded)
 $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
 $p=[Diagnostics.Process]::Start($psi)
 try{
  $portFile=Join-Path $session 'port';$deadline=[DateTime]::UtcNow.AddSeconds(20)
  while(!(Test-Path -LiteralPath $portFile) -and !$p.HasExited -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 100}
  if(!(Test-Path -LiteralPath $portFile)){throw 'media server did not start'}
  $port=[int](Get-Content -LiteralPath $portFile -Raw)
  function Request-TTMediaFixture([string]$Method,[string]$Path,[string]$Referer,[string]$Range='', [string]$HostOverride=''){
   $tcp=[Net.Sockets.TcpClient]::new()
   $mem=[IO.MemoryStream]::new()
   try{
    $tcp.Connect('127.0.0.1',$port);$tcp.ReceiveTimeout=5000;$tcp.SendTimeout=5000
    $stream=$tcp.GetStream()
    $hostHeader=if($HostOverride){$HostOverride}else{"127.0.0.1:$port"}
    $nl=[string][char]13+[char]10
    $headers=@("$Method $Path HTTP/1.1","Host: $hostHeader","Referer: $Referer","Connection: close")
    if($Range){$headers+=("Range: $Range")}
    $bytes=[Text.Encoding]::ASCII.GetBytes(($headers -join $nl)+$nl+$nl)
    $stream.Write($bytes,0,$bytes.Length);$stream.CopyTo($mem)
    $out=$mem.ToArray();$ascii=[Text.Encoding]::ASCII.GetString($out);$split=$ascii.IndexOf($nl+$nl)
    if($split -lt 0){throw 'missing response'}
    $length=$out.Length-$split-4;$body=New-Object byte[] $length
    [Array]::Copy($out,$split+4,$body,0,$length)
    return @{header=$ascii.Substring(0,$split);body=$body}
   }finally{$tcp.Dispose();$mem.Dispose()}
  }
  $path="/$token/video.mp4";$ref='http://127.0.0.1:17439/'
  $r=Request-TTMediaFixture 'GET' $path $ref
  if($r.header -notmatch '^HTTP/1.1 200 OK' -or [Convert]::ToBase64String($r.body) -cne [Convert]::ToBase64String($expected)){throw 'full MP4 transfer'}
  Write-Host 'PASS dedicated server exact MP4 streaming'
  $r=Request-TTMediaFixture 'GET' $path $ref 'bytes=10-29'
  if($r.header -notmatch '^HTTP/1.1 206 Partial Content' -or !$r.header.Contains('Content-Range: bytes 10-29/') -or [Convert]::ToBase64String($r.body) -cne [Convert]::ToBase64String([byte[]]($expected[10..29]))){throw 'seek range'}
  $r=Request-TTMediaFixture 'GET' $path $ref 'bytes=-10'
  if($r.header -notmatch '^HTTP/1.1 206' -or [Convert]::ToBase64String($r.body) -cne [Convert]::ToBase64String([byte[]]($expected[($expected.Length-10)..($expected.Length-1)]))){throw 'suffix range'}
  $r=Request-TTMediaFixture 'HEAD' $path $ref
  if($r.header -notmatch '^HTTP/1.1 200' -or $r.body.Length -ne 0 -or !$r.header.Contains("Content-Length: $($expected.Length)")){throw 'HEAD response'}
  Write-Host 'PASS seek ranges, suffix and HEAD'
  foreach($range in @('bytes=999999999999-','bytes=10-2','bytes=0-1,4-5','bytes=abc')){
   if((Request-TTMediaFixture 'GET' $path $ref $range).header -notmatch '^HTTP/1.1 416'){throw 'invalid range accepted'}
  }
  Write-Host 'PASS invalid and multiple range rejection'
  foreach($bad in @(
   (Request-TTMediaFixture 'GET' '/wrong/video.mp4' $ref),
   (Request-TTMediaFixture 'GET' $path 'https://evil.example/'),
   (Request-TTMediaFixture 'GET' $path $ref '' 'evil.example')
  )){if($bad.header -notmatch '^HTTP/1.1 403' -or $bad.body.Length){throw 'unauthorized media response'}}
  if((Request-TTMediaFixture 'POST' $path $ref).header -notmatch '^HTTP/1.1 405'){throw 'method allowed'}
  Write-Host 'PASS private playback token, host, origin and method policy'
  if($env:TT_TEST_REAL_MEDIA_BROWSER -eq '1'){
   & node (Join-Path $PSScriptRoot 'youtube-offline-media-browser.cjs') "$port" $token $file
   if($LASTEXITCODE -ne 0){throw 'real Chrome offline media playback failed'}
  }
  [IO.File]::WriteAllText((Join-Path $session 'stop'),'1')
  if(!$p.WaitForExit(10000) -or $p.ExitCode -ne 0){throw 'media process not stopped'}
  Write-Host 'PASS dedicated media process lifecycle'
 }finally{
  if(!$p.HasExited){$p.Kill();$p.WaitForExit()}
  $p.Dispose()
 }
}
