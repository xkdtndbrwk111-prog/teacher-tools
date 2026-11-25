$ErrorActionPreference='Stop'
$root=Join-Path $env:RUNNER_TEMP ('hoja-first-display-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $root | Out-Null
try {
    function Assert-Plain { param($Path) if(Test-Path -LiteralPath $Path -PathType Container){throw 'not a file'} }
    . (Join-Path $PSScriptRoot 'first-monitor.ps1')
    $display=Join-Path $root 'display.txt'
    # Deterministic stand-in for the already-existing signed selector. Never fake actual dual-screen hardware.
    $fake=Join-Path $root 'runtime.ps1'
    @'
function Select-TTMonitor {
    param([string]$Current)
    $script:selectionCalls++
    if($script:selectionMode -eq 'cancel'){throw 'CANCELLED'}
    if($script:selectionMode -eq 'fail'){throw 'selector failed'}
    return $script:selectionMode
}
'@ | Set-Content -LiteralPath $fake -Encoding UTF8
    $script:selectionCalls=0
    $script:selectionMode='\\.\DISPLAY2'
    if((Initialize-HojaFirstDisplay $root) -ne 'selected' -or [IO.File]::ReadAllText($display) -cne $script:selectionMode -or $script:selectionCalls -ne 1){throw 'new install selection failed'}
    $script:selectionMode='\\.\DISPLAY1'
    if((Initialize-HojaFirstDisplay $root) -ne 'preserved' -or [IO.File]::ReadAllText($display) -cne '\\.\DISPLAY2' -or $script:selectionCalls -ne 1){throw 'existing selection changed'}
    Remove-Item -LiteralPath $display
    $script:selectionMode='cancel'
    if((Initialize-HojaFirstDisplay $root) -ne 'cancelled' -or (Test-Path -LiteralPath $display)){throw 'cancel created selection'}
    $script:selectionMode='fail'
    $failed=$false;try{Initialize-HojaFirstDisplay $root}catch{$failed=$true}
    if(!$failed -or (Test-Path -LiteralPath $display)){throw 'selector error was not preserved'}
    [IO.File]::WriteAllText($display,'')
    if((Initialize-HojaFirstDisplay $root) -ne 'deferred' -or [IO.File]::ReadAllText($display) -cne ''){throw 'existing empty setting changed'}
    Write-Host 'PASS first-display save, preserve, cancel, fail, empty setting'
} finally {Remove-Item -LiteralPath $root -Recurse -Force}
