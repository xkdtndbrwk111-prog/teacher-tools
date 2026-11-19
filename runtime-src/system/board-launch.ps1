param([switch]$Windowed,[switch]$ManualUpdate,[switch]$RecoveryRetry,[string]$R8ReadyToken)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
. (Join-Path $PSScriptRoot 'runtime.ps1')
# This script usually runs with no window, so a failure has to say so itself.
trap {
  $problem = $_.Exception.Message
  try { Add-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal\launch-error.log') -Value ((Get-Date -Format s) + ' ' + $problem) -Encoding UTF8 } catch {}
  [void][System.Windows.Forms.MessageBox]::Show($problem,'Teacher Tools')
  exit 1
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TeacherDesktopWindow {
    [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr h, IntPtr insertAfter, int x, int y, int w, int hgt, uint flags);
    [DllImport("user32.dll", EntryPoint="GetWindowLongW", SetLastError=true)] public static extern int GetWindowLong(IntPtr h, int index);
    [DllImport("user32.dll", EntryPoint="SetWindowLongW", SetLastError=true)] public static extern int SetWindowLong(IntPtr h, int index, int value);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
$site = 'http://127.0.0.1:17439/'
$dir = Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal'
$displayFile=Join-Path $dir 'display.txt'
$device=if(Test-Path -LiteralPath $displayFile){(Get-Content -LiteralPath $displayFile -Raw).Trim()}else{''}
function Get-TeacherBrowserIds {
  @(Get-TTProfileBrowserProcesses | Select-Object -ExpandProperty ProcessId)
}
function Get-TargetScreen {
  $screen=[System.Windows.Forms.Screen]::AllScreens | Where-Object { $_.DeviceName -eq $device } | Select-Object -First 1
  if ($null -eq $screen) { $screen=[System.Windows.Forms.Screen]::PrimaryScreen }
  return $screen
}
# The whole monitor, taskbar included; the page keeps its content clear of the taskbar with the inset below.
function Get-TargetArea { return (Get-TargetScreen).Bounds }
function Test-LocalServer {
  try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri ($site+'health');$o=ConvertFrom-Json $r.Content;return ($o.service -eq 'teacher-tools-local' -and $o.release -eq $TTRelease) } catch { return $false }
}
if (-not (Test-Path -LiteralPath (Join-Path $dir 'dashboard.html'))) { throw 'Run install.cmd first.' }
try { $launchGuard=[IO.File]::Open((Join-Path $dir 'stable-pilot-launch.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) } catch { return }
if (-not (Test-LocalServer)) {
  if($null -ne (Get-TTListenerPid)){Stop-TTVerifiedServer}
  Start-TTServer
  if (-not (Wait-TTReady $TTRelease)) { throw 'Local service failed to start. Port 17439 may be in use or PowerShell may be blocked.' }
}
if (@(Get-TeacherBrowserIds).Count -gt 0) { throw 'Teacher Tools 창이 이미 열려 있습니다. 종료.cmd로 닫고 재시도하세요.' }
$browser=Select-TTBrowser
if ($browser.DataCopied -eq $false) { [void][System.Windows.Forms.MessageBox]::Show('브라우저가 바뀌었지만 설정을 옮기지 못했습니다. 설정 백업 파일이 있으면 복원해 주세요.','Teacher Tools') }
$area=Get-TargetArea
$work=(Get-TargetScreen).WorkingArea
$page=$site
if (-not $Windowed) {
  $page=$site+'?inset='+($work.X-$area.X)+','+($work.Y-$area.Y)+','+($area.Right-$work.Right)+','+($area.Bottom-$work.Bottom)
}
Start-Process -FilePath $browser.Path -ArgumentList @("--user-data-dir=`"$($browser.Profile)`"","--app=$page",'--no-first-run','--no-default-browser-check','--hide-crash-restore-bubble','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',"--window-position=$($area.X),$($area.Y)","--window-size=$($area.Width),$($area.Height)") | Out-Null
$window=[IntPtr]::Zero
for ($i=0; $i -lt 60 -and $window -eq [IntPtr]::Zero; $i++) {
  Start-Sleep -Milliseconds 500
  foreach ($id in @(Get-TeacherBrowserIds)) {
    $p=Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p -and $p.MainWindowHandle -ne 0) { $window=$p.MainWindowHandle; break }
  }
}
if ($window -eq [IntPtr]::Zero) { throw 'Could not find the local dashboard window.' }
if ($Windowed) {
  # Window mode is a real board too: a small hidden helper keeps its heartbeat while this window is open.
  [uint32]$ownerPid=0
  [void][TeacherDesktopWindow]::GetWindowThreadProcessId($window,[ref]$ownerPid)
  $value=ConvertTo-Json -Compress @{mode='window';window=$window.ToInt64();pid=[int]$ownerPid;release=$TTRelease}
  [IO.File]::WriteAllText((Join-Path $dir 'board-mode.json'),$value,(New-Object Text.UTF8Encoding($false)))
  Start-TTHidden -ScriptPath (Join-Path $dir 'board-heartbeat.ps1')
  if($R8ReadyToken -cmatch '^[a-f0-9]{32}$'){
  . (Join-Path $dir 'r8-kernel.ps1')
  $journal=Read-R8Journal $dir
  if($journal -and $journal.token -ceq $R8ReadyToken){
    Write-R8Json (Join-Path $dir 'r8-transaction\ready.json') @{token=$R8ReadyToken;release=$TTRelease}
  }
}
  $launchGuard.Dispose()
  Write-Host 'Local dashboard is open in an ordinary window.'
  return
}
# Keep the browser top-level, remove its frame and keep it behind normal windows.
$style=[TeacherDesktopWindow]::GetWindowLong($window,-16)
$newStyle=$style -band (-bnot 0x00CF0000)
[void][TeacherDesktopWindow]::SetWindowLong($window,-16,$newStyle)
$ex=[TeacherDesktopWindow]::GetWindowLong($window,-20)
[void][TeacherDesktopWindow]::SetWindowLong($window,-20,(($ex -bor 0x00000080) -band (-bnot 0x00040000)))
$bottom=[IntPtr]::new(1)
if (-not [TeacherDesktopWindow]::SetWindowPos($window,$bottom,$area.X,$area.Y,$area.Width,$area.Height,0x0070)) { throw 'Windows did not position the dashboard.' }
# The helper that shares the PC with the board finds this window here, and stops when the window closes.
ConvertTo-Json -Compress @{window=$window.ToInt64()} | Set-Content -LiteralPath (Join-Path $dir 'board-window.json') -Encoding UTF8
# A short heartbeat proves this exact Windows background-window launch is still alive.
# A standalone server or a normal app window never writes this heartbeat.
$boardModeFile=Join-Path $dir 'board-mode.json'
[uint32]$ownerPid=0
[void][TeacherDesktopWindow]::GetWindowThreadProcessId($window,[ref]$ownerPid)
function Write-BoardModeHeartbeat {
  $value=ConvertTo-Json -Compress @{mode='wallpaper';window=$window.ToInt64();pid=[int]$ownerPid;release=$TTRelease}
  [IO.File]::WriteAllText($boardModeFile,$value,(New-Object Text.UTF8Encoding($false)))
}
Write-BoardModeHeartbeat
Start-TTHidden -ScriptPath (Join-Path $dir 'share-input.ps1')
if($R8ReadyToken -cmatch '^[a-f0-9]{32}$'){
  . (Join-Path $dir 'r8-kernel.ps1')
  $journal=Read-R8Journal $dir
  if($journal -and $journal.token -ceq $R8ReadyToken){
    Write-R8Json (Join-Path $dir 'r8-transaction\ready.json') @{token=$R8ReadyToken;release=$TTRelease}
  }
}
$launchGuard.Dispose()
Write-Host 'Teacher Tools local desktop started. Close with Stop.cmd.'
# Flicker mitigation: do not repeatedly change the window's Z-order.
# Only correct its geometry if the selected monitor's size changes.
$lastArea=Get-TargetArea
while ([TeacherDesktopWindow]::IsWindow($window)) {
  Start-Sleep -Milliseconds 5000
  try { Write-BoardModeHeartbeat } catch {}
  Invoke-TTServerRecovery {
    [uint32]$actual=0
    [void][TeacherDesktopWindow]::GetWindowThreadProcessId($window,[ref]$actual)
    [TeacherDesktopWindow]::IsWindow($window) -and $actual -eq $ownerPid
  }
  if ([TeacherDesktopWindow]::IsIconic($window)) { continue }
  $nextArea=Get-TargetArea
  if (($nextArea.X -ne $lastArea.X) -or ($nextArea.Y -ne $lastArea.Y) -or
      ($nextArea.Width -ne $lastArea.Width) -or ($nextArea.Height -ne $lastArea.Height)) {
    # 0x0014 = SWP_NOACTIVATE | SWP_NOZORDER, no recurring send-to-bottom.
    [void][TeacherDesktopWindow]::SetWindowPos($window,[IntPtr]::Zero,$nextArea.X,$nextArea.Y,$nextArea.Width,$nextArea.Height,0x0014)
    $lastArea=$nextArea
  }
}
try{$lastMode=Get-Content -LiteralPath $boardModeFile -Raw -Encoding UTF8 | ConvertFrom-Json;if([long]$lastMode.window -eq $window.ToInt64()){Remove-Item -LiteralPath $boardModeFile -Force -ErrorAction SilentlyContinue}}catch{}
