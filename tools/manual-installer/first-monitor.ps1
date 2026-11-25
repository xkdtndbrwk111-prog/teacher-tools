# First-install only; called after all signed runtime and launcher hashes pass.
function Initialize-HojaFirstDisplay {
    param([Parameter(Mandatory=$true)][string]$InstallDir)
    $display = Join-Path $InstallDir 'display.txt'
    Assert-Plain $display
    if (Test-Path -LiteralPath $display -PathType Leaf) {
        if (![string]::IsNullOrWhiteSpace([IO.File]::ReadAllText($display))) { return 'preserved' }
        # Do not overwrite even an empty pre-existing configuration.
        return 'deferred'
    }
    # Use the installed, already verified selector (one screen auto, multiple screens numbered).
    . (Join-Path $InstallDir 'runtime.ps1')
    try { $picked = Select-TTMonitor -Current '' }
    catch { if ($_.Exception.Message -eq 'CANCELLED') { return 'cancelled' }; throw }
    if ([string]::IsNullOrWhiteSpace($picked)) { return 'cancelled' }
    # CreateNew cannot overwrite a setting created concurrently.
    $stream = $null
    try {
        $stream = [IO.File]::Open($display,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $bytes = [Text.Encoding]::UTF8.GetBytes([string]$picked)
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush()
    } catch [IO.IOException] {
        if ($null -eq $stream -and (Test-Path -LiteralPath $display -PathType Leaf)) { return 'preserved' }
        throw
    } finally { if ($null -ne $stream) { $stream.Dispose() } }
    return 'selected'
}
