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

# Reopen a fresh actual host process with the previous persisted page and same
# disposable isolated profile. No credentials or manual login are supplied.
$sessions=Join-Path $isolated 'TeacherToolsLocal\book-reader-sessions'
$first=@(Get-ChildItem -LiteralPath $sessions -Directory)
if($first.Count -ne 1){throw 'First session count invalid'}
$firstState=Get-Content -Raw (Join-Path $first[0].FullName 'state.json') | ConvertFrom-Json
if(!$firstState.closed -or !$firstState.bookmarkValid -or $firstState.saved -ne 125){throw 'First process bookmark state invalid'}
$env:TT_LIVE_RESUME_PAGE=[string]$firstState.saved
try{
 & $exe --live-probe $isolated
 $code=$LASTEXITCODE
 Write-Host "WINDOWS_RESTART_EXIT=$code"
 if($code -ne 0){throw 'Actual host process restart/automatic resume failed'}
}finally{Remove-Item Env:TT_LIVE_RESUME_PAGE -ErrorAction SilentlyContinue}
$second=@(Get-ChildItem -LiteralPath $sessions -Directory | Where-Object {$_.FullName -ne $first[0].FullName})
if($second.Count -ne 1){throw 'Second session count invalid'}
$state=Get-Content -Raw (Join-Path $second[0].FullName 'state.json') | ConvertFrom-Json
Write-Host ('RESTART_FINAL_STATE '+(ConvertTo-Json -Compress @{closed=$state.closed;bookmarkValid=$state.bookmarkValid;saved=$state.saved;page=$state.page}))
if(!$state.closed -or !$state.bookmarkValid -or $state.saved -ne 125 -or $state.page -ne 125){throw 'Actual process restart final state invalid'}
Write-Host 'PASS actual new Windows host process restores persisted page 125'


# Fresh Korean-language profile: diagnostic only; never accepts terms or signs in.
$ko=Join-Path $env:RUNNER_TEMP ('tt-live-ko-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $ko | Out-Null
$env:TT_LIVE_LANGUAGE='ko-KR'
try{
 & $exe --live-probe $ko
 $code=$LASTEXITCODE
 Write-Host "WINDOWS_ANONYMOUS_KO_EXIT=$code"
 if($code -ne 0){throw 'Fresh Korean locale anonymous presentation not verified'}
}finally{Remove-Item Env:TT_LIVE_LANGUAGE -ErrorAction SilentlyContinue}
