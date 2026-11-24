# Only run on a disposable Windows GitHub runner. Separate diagnostic binary,
# same BookReader source and SDK as shipping host; no test code in release ZIP.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'CI only'}
$root=Join-Path $env:RUNNER_TEMP 'tt-book-host'
$out=Join-Path $root 'out'
$csc="$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$exe=Join-Path $out 'BookReaderLiveProbe.exe'
& $csc /nologo /codepage:65001 /define:TT_LIVE_PROBE /target:exe /platform:x64 "/out:$exe" "/reference:$out\Microsoft.Web.WebView2.Core.dll" "/reference:$out\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'book-reader-host.cs') (Join-Path $PSScriptRoot 'book-reader-live-probe.cs')
if($LASTEXITCODE -ne 0){throw 'Live probe compile failed'}
$isolated=Join-Path $env:RUNNER_TEMP ('tt-live-click-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $isolated | Out-Null
& $exe --live-probe $isolated
$code=$LASTEXITCODE
Write-Host "WINDOWS_PROBE_EXIT=$code"
if($code -ne 0){throw 'Live click probe blocked or failed; not presentation acceptance'}
