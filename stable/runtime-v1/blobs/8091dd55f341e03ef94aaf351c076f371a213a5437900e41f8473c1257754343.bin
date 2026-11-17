$ErrorActionPreference = 'Stop'
# Keeps board-mode.json fresh while the dashboard runs as an ordinary window, so the classroom manager and the
# seating inbox treat window mode like the background mode. The background launcher writes its own heartbeat.
. (Join-Path $PSScriptRoot 'runtime.ps1')
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TTBeatWindow {
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
}
'@
$file = Join-Path $TTInstallDir 'board-mode.json'
if (-not (Test-Path -LiteralPath $file)) { exit 0 }
$info = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8) | ConvertFrom-Json
$window = [IntPtr][long]$info.window
while ([TTBeatWindow]::IsWindow($window)) {
  $value = ConvertTo-Json -Compress @{mode = [string]$info.mode; window = $window.ToInt64(); pid = [int]$info.pid; release = $TTRelease}
  [IO.File]::WriteAllText($file, $value, (New-Object Text.UTF8Encoding($false)))
  Start-Sleep -Seconds 5
}
$now = $null
try { $now = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch {}
# Only remove the file if it still belongs to this window; a newer launch may have written its own.
if ($now -and [long]$now.window -eq $window.ToInt64()) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
