# Windows CI experiment only: not the production installer or download API.
# Fetch exact tagged assets from upstream Github release metadata, verify SHA-256,
# and extract only exact expected executables into a disposable directory.
# Use generated media, not third-party YouTube content.
param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(-not $IsWindows -or -not [Environment]::Is64BitOperatingSystem){throw 'Windows x64 required'}
$Root=[IO.Path]::GetFullPath($Root)
if(Test-Path -LiteralPath $Root){throw 'Experiment directory must be fresh'}
[void](New-Item -ItemType Directory -Path $Root)
$bin=Join-Path $Root 'bin';[void](New-Item -ItemType Directory -Path $bin)
$headers=@{'User-Agent'='TeacherTools-CI-EngineProbe';'Accept'='application/vnd.github+json'}
if($env:TT_ENGINE_API_TOKEN){
 $headers['Authorization']='Bearer '+$env:TT_ENGINE_API_TOKEN
 Remove-Item Env:TT_ENGINE_API_TOKEN
}
function Get-Asset([string]$Repo,[string]$Tag,[string]$Name,[long]$Limit){
 $meta=Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Repo/releases/tags/$Tag" -TimeoutSec 60 -MaximumRedirection 0
 if($meta.tag_name -cne $Tag -or $meta.draft -or $meta.prerelease){throw 'unexpected release'}
 $assets=@($meta.assets|Where-Object {$_.name -ceq $Name})
 if($assets.Count -ne 1){throw "asset not unique: $Name"}
 $a=$assets[0]
 if($a.digest -cnotmatch '^sha256:([0-9a-f]{64})$'){throw "missing upstream SHA256 digest: $Name"}
 $hash=$Matches[1];$expected="https://github.com/$Repo/releases/download/$Tag/$Name"
 if($a.browser_download_url -cne $expected -or $a.size -le 0 -or $a.size -gt $Limit){throw 'asset metadata rejected'}
 $dest=Join-Path $Root $Name
 Invoke-WebRequest -Uri $expected -OutFile $dest -TimeoutSec 240
 if((Get-Item -LiteralPath $dest).Length -ne $a.size -or (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant() -cne $hash){throw 'asset integrity mismatch'}
 Write-Host "PASS digest $Repo $Tag $Name $hash"
 return $dest
}
function Copy-ZipExe([string]$Archive,[string]$Name){
 $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
 try{
  $entries=@($zip.Entries|Where-Object { $_.Name -ceq $Name })
  if($entries.Count -ne 1 -or $entries[0].Length -le 0 -or $entries[0].Length -gt 500MB){throw "invalid entry $Name"}
  $target=Join-Path $bin $Name
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0],$target,$false)
 }finally{$zip.Dispose()}
}
function Invoke-Hidden([string]$Name,[string[]]$ArgsList,[int]$TimeoutMs=60000){
 $info=[Diagnostics.ProcessStartInfo]::new()
 $info.FileName=Join-Path $bin $Name
 $info.WorkingDirectory=$Root
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 foreach($a in $ArgsList){[void]$info.ArgumentList.Add($a)}
 $p=[Diagnostics.Process]::new();$p.StartInfo=$info
 try{
  if(-not $p.Start()){throw "engine start failed $Name"}
  $o=$p.StandardOutput.ReadToEndAsync();$e=$p.StandardError.ReadToEndAsync()
  if(-not $p.WaitForExit($TimeoutMs)){$p.Kill($true);$p.WaitForExit();throw "engine timeout $Name"}
  $out=$o.GetAwaiter().GetResult();$err=$e.GetAwaiter().GetResult()
  if($p.ExitCode -ne 0){throw "$Name exited $($p.ExitCode): $err"}
  return $out.Trim()
 }finally{$p.Dispose()}
}
try{
 $y=Get-Asset 'yt-dlp/yt-dlp' '2026.10.26' 'yt-dlp.exe' 80MB
 Copy-Item -LiteralPath $y -Destination (Join-Path $bin 'yt-dlp.exe')
 # A pinned Deno release, not a mutable latest alias.
 $d=Get-Asset 'denoland/deno' 'v2.9.4' 'deno-x86_64-pc-windows-msvc.zip' 150MB
 Copy-ZipExe $d 'deno.exe'
 # Full static GPL release-branch build from the FFmpeg-Builds project.
 $f=Get-Asset 'FFmpeg-Builds/FFmpeg-Builds' 'autobuild-2026-11-12-15-40' 'ffmpeg-n9.0.2-57-gd838f9f9ae-win64-gpl-9.0.zip' 400MB
 Copy-ZipExe $f 'ffmpeg.exe';Copy-ZipExe $f 'ffprobe.exe'
 $v=Invoke-Hidden 'yt-dlp.exe' @('--ignore-config','--version')
 if($v -ne '2026.10.26'){throw "unexpected yt-dlp version $v"}
 Write-Host "PASS yt-dlp version $v"
 $v=Invoke-Hidden 'deno.exe' @('eval','console.log(6*7)')
 if($v -ne '42'){throw 'Deno execution failed'}
 Write-Host 'PASS Deno isolated JS execution'
 $v=Invoke-Hidden 'ffmpeg.exe' @('-version');Write-Host ($v -split "\r?\n")[0]
 $v=Invoke-Hidden 'ffprobe.exe' @('-version');Write-Host ($v -split "\r?\n")[0]
 $video=Join-Path $Root 'video.mp4';$audio=Join-Path $Root 'audio.m4a';$merged=Join-Path $Root 'merged.mp4'
 $null=Invoke-Hidden 'ffmpeg.exe' @('-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=1920x1080:rate=24','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-an',$video)
 $null=Invoke-Hidden 'ffmpeg.exe' @('-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:a','aac',$audio)
 $null=Invoke-Hidden 'ffmpeg.exe' @('-nostdin','-v','error','-i',$video,'-i',$audio,'-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart',$merged)
 $probe=Invoke-Hidden 'ffprobe.exe' @('-v','error','-show_streams','-show_format','-of','json',$merged)|ConvertFrom-Json
 $vs=@($probe.streams|Where-Object {$_.codec_type -eq 'video'});$as=@($probe.streams|Where-Object {$_.codec_type -eq 'audio'})
 if($vs.Count -ne 1 -or $as.Count -ne 1 -or $vs[0].codec_name -ne 'h264' -or $as[0].codec_name -ne 'aac' -or $vs[0].width -ne 1920 -or $vs[0].height -ne 1080){throw 'merged media validation failed'}
 Write-Host 'PASS synthetic 1080p H264 AAC merge and ffprobe validation'
 # Decode both streams from disk without any remote URL.
 $null=Invoke-Hidden 'ffmpeg.exe' @('-nostdin','-v','error','-i',$merged,'-map','0:v','-map','0:a','-f','null','-')
 Write-Host 'PASS local MP4 decoding, no remote media'
 # Full yt-dlp transfer from a local HTTP server using only generated media.
 # Python is a CI fixture, not a runtime dependency for the board.
 $fixture=Join-Path $Root 'fixture.py';$ready=Join-Path $Root 'fixture-port.txt'
 @'
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import sys
media = Path(sys.argv[1])
ready = Path(sys.argv[2])
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/test.mp4":
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(media.stat().st_size))
        self.end_headers()
        with media.open("rb") as f:
            while chunk := f.read(65536):
                self.wfile.write(chunk)
server = HTTPServer(("127.0.0.1", 0), Handler)
ready.write_text(str(server.server_port), encoding="ascii")
server.serve_forever()
'@ | Set-Content -LiteralPath $fixture -Encoding UTF8
 $fixtureInfo=[Diagnostics.ProcessStartInfo]::new()
 $fixtureInfo.FileName=(Get-Command python -CommandType Application | Select-Object -First 1).Source
 $fixtureInfo.UseShellExecute=$false;$fixtureInfo.CreateNoWindow=$true
 foreach($item in @($fixture,$merged,$ready)){[void]$fixtureInfo.ArgumentList.Add($item)}
 $fixtureProcess=[Diagnostics.Process]::Start($fixtureInfo)
 try{
  $deadline=[DateTime]::UtcNow.AddSeconds(15)
  while(!(Test-Path -LiteralPath $ready) -and [DateTime]::UtcNow -lt $deadline -and !$fixtureProcess.HasExited){Start-Sleep -Milliseconds 100}
  if(!(Test-Path -LiteralPath $ready)){throw 'fixture startup failed'}
  $portText=(Get-Content -LiteralPath $ready -Raw).Trim()
  if($portText -notmatch '^[0-9]{1,5}
}finally{
 # Only remove this fresh experiment folder, never the installed board or user data.
 Remove-Item -LiteralPath $Root -Recurse -Force
}
 -or [int]$portText -lt 1 -or [int]$portText -gt 65535){throw 'invalid fixture port'}
  $download=Join-Path $Root 'downloaded.mp4'
  $null=Invoke-Hidden 'yt-dlp.exe' @('--ignore-config','--no-playlist','--no-cache-dir','--no-progress','--proxy','','--ffmpeg-location',$bin,'--no-js-runtimes','--js-runtimes',('deno:'+(Join-Path $bin 'deno.exe')),'-o',$download,'--',("http://127.0.0.1:"+$portText+"/test.mp4"))
  if(!(Test-Path -LiteralPath $download -PathType Leaf) -or (Get-FileHash -LiteralPath $download).Hash -ne (Get-FileHash -LiteralPath $merged).Hash){throw 'yt-dlp downloaded bytes differ'}
  Write-Host 'PASS yt-dlp local HTTP MP4 transfer and exact byte verification'
 }finally{
  if(!$fixtureProcess.HasExited){$fixtureProcess.Kill($true);$fixtureProcess.WaitForExit()}
  $fixtureProcess.Dispose()
 }
 Write-Host 'Engine smoke only; actual YouTube extraction and board integration not tested.'
}finally{
 # Only remove this fresh experiment folder, never the installed board or user data.
 Remove-Item -LiteralPath $Root -Recurse -Force
}
