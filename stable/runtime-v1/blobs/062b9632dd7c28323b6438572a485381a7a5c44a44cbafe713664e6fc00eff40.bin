param([Parameter(Mandatory=$true)][string]$Url)
$ErrorActionPreference = 'Stop'
# Opens one of the teacher's saved web pages (수업 도구 → 브라우저 버튼) in the teacher's own Edge or Chrome,
# as an ordinary window filling the monitor the dashboard is on, in front of the dashboard. Started hidden by
# server.ps1 for each press.
#
# V1.40: the window used to come up folded on the taskbar. Windows does not let a background helper bring a
# window forward ("foreground lock"), and a browser that is already running may open its new window minimized
# or behind. So the helper now
#   1. puts the window on the dashboard's monitor while it is restored, then maximizes it there,
#   2. borrows the input of the window in front (AttachThreadInput) so Windows accepts the switch,
#   3. lifts it above everything once (topmost on, then off again, so it does not stay pinned on top),
#   4. checks again for a few seconds and repeats if the browser folds or shrinks the window afterwards.
# What happened is written to open-web.log in the install folder (only the site's host name, no full address).
. (Join-Path $PSScriptRoot 'runtime.ps1')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class TTWebWindow {
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    const int SW_RESTORE = 9, SW_MAXIMIZE = 3;
    const uint SWP_NOSIZE = 0x0001, SWP_NOMOVE = 0x0002, SWP_NOZORDER = 0x0004, SWP_SHOWWINDOW = 0x0040;
    static readonly IntPtr TOPMOST = new IntPtr(-1), NOTOPMOST = new IntPtr(-2);
    // Visible, titled top-level windows that belong to one of the given processes, front-most first.
    public static List<IntPtr> Windows(HashSet<uint> pids) {
        var list = new List<IntPtr>();
        EnumWindows((h, l) => {
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (pids.Contains(pid) && IsWindowVisible(h) && GetWindowTextLength(h) > 0 && GetWindow(h, 4) == IntPtr.Zero) list.Add(h);
            return true;
        }, IntPtr.Zero);
        return list;
    }
    // True when the window is maximized (not folded) on the monitor whose working area is (x, y, w, hh).
    // Being the front window is not required here: when Windows refuses the switch the window is still lifted
    // above the dashboard, and asking again and again would only make it flicker.
    public static bool Settled(IntPtr h, int x, int y, int w, int hh) {
        RECT r; GetWindowRect(h, out r);
        int cx = (r.Left + r.Right) / 2, cy = (r.Top + r.Bottom) / 2;
        return !IsIconic(h) && IsZoomed(h) && cx >= x && cx < x + w && cy >= y && cy < y + hh;
    }
    public static bool Front(IntPtr h) { return GetForegroundWindow() == h; }
    // Maximize on the given monitor and bring to the front. Returns a short note for the log.
    public static string Bring(IntPtr h, int x, int y, int w, int hh) {
        var note = new StringBuilder();
        note.Append("before iconic=" + IsIconic(h) + " zoomed=" + IsZoomed(h));
        // a maximized window maximizes on the monitor it sits on, so move it there while it is restored
        ShowWindow(h, SW_RESTORE);
        SetWindowPos(h, IntPtr.Zero, x, y, w, hh, SWP_NOZORDER | SWP_SHOWWINDOW);
        ShowWindow(h, SW_MAXIMIZE);
        // borrow the input of the window in front so Windows lets this helper switch windows
        uint me = GetCurrentThreadId(), p1, p2;
        uint front = GetWindowThreadProcessId(GetForegroundWindow(), out p1), target = GetWindowThreadProcessId(h, out p2);
        bool a1 = front != 0 && front != me && AttachThreadInput(me, front, true);
        bool a2 = target != 0 && target != me && target != front && AttachThreadInput(me, target, true);
        SetWindowPos(h, TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
        SetWindowPos(h, NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
        BringWindowToTop(h);
        bool fg = SetForegroundWindow(h);
        if (a1) AttachThreadInput(me, front, false);
        if (a2) AttachThreadInput(me, target, false);
        note.Append(" | after iconic=" + IsIconic(h) + " zoomed=" + IsZoomed(h) + " front=" + (GetForegroundWindow() == h) + " fgcall=" + fg + " attach=" + a1 + "/" + a2);
        return note.ToString();
    }
}
'@

$log = New-Object System.Collections.Generic.List[string]
function Note([string]$t) { $log.Add(((Get-Date).ToString('HH:mm:ss.fff')) + ' ' + $t) }
function Save-Log { try { [IO.File]::WriteAllLines((Join-Path $TTInstallDir 'open-web.log'), $log, (New-Object Text.UTF8Encoding($false))) } catch {} }

$uri = $null
if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$uri) -or ($uri.Scheme -ne 'http' -and $uri.Scheme -ne 'https')) { Note 'bad address'; Save-Log; exit 1 }
Note ('open ' + $uri.Host)

# The teacher's usual browser (their own profile, so sign-ins stay), Chrome when it is the default, otherwise Edge.
$name = if ((Test-TTChromeIsDefault) -and (Get-TTBrowserPath 'chrome')) { 'chrome' } else { 'edge' }
$exe = Get-TTBrowserPath $name
if (-not $exe) { $name = if ($name -eq 'edge') { 'chrome' } else { 'edge' }; $exe = Get-TTBrowserPath $name }
if (-not $exe) { Note 'no Edge or Chrome found'; Save-Log; exit 2 }
$procName = if ($name -eq 'chrome') { 'chrome' } else { 'msedge' }
Note ('browser ' + $name)

# The monitor the dashboard is on: its own window when it is running, else the monitor chosen at install.
$screen = $null
try {
  $mode = [IO.File]::ReadAllText((Join-Path $TTInstallDir 'board-mode.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
  if ($mode.window) { $screen = [System.Windows.Forms.Screen]::FromHandle([IntPtr][long]$mode.window) }
} catch {}
if ($null -eq $screen) {
  try {
    $device = ([IO.File]::ReadAllText((Join-Path $TTInstallDir 'display.txt'), [Text.Encoding]::UTF8)).Trim()
    $screen = [System.Windows.Forms.Screen]::AllScreens | Where-Object { $_.DeviceName -eq $device } | Select-Object -First 1
  } catch {}
}
if ($null -eq $screen) { $screen = [System.Windows.Forms.Screen]::PrimaryScreen }
$area = $screen.WorkingArea
Note ('monitor ' + $screen.DeviceName + ' ' + $area.X + ',' + $area.Y + ' ' + $area.Width + 'x' + $area.Height)

# The dashboard's own browser runs from its own profile folder; leave its windows alone.
$ownPids = @{}
foreach ($p in @(Get-CimInstance -ClassName Win32_Process -Filter "Name='$procName.exe'" -ErrorAction SilentlyContinue)) {
  if ([string]$p.CommandLine -like "*$TTInstallDir*") { $ownPids[[uint32]$p.ProcessId] = $true }
}
function Get-Pids {
  $set = New-Object 'System.Collections.Generic.HashSet[uint32]'
  foreach ($p in @(Get-Process -Name $procName -ErrorAction SilentlyContinue)) { if (-not $ownPids.ContainsKey([uint32]$p.Id)) { [void]$set.Add([uint32]$p.Id) } }
  return ,$set
}
$before = @{}
foreach ($h in [TTWebWindow]::Windows((Get-Pids))) { $before[$h.ToInt64()] = $true }
Note ('browser windows already open: ' + $before.Count)

# --start-maximized helps when the browser is not running yet; a running browser ignores it, so the window is
# also placed and maximized by hand below.
Start-Process -FilePath $exe -WindowStyle Maximized -ArgumentList @('--new-window', '--start-maximized', "--window-position=$($area.X),$($area.Y)", "--window-size=$($area.Width),$($area.Height)", $uri.AbsoluteUri)

# Wait for the new window (up to 10 s).
$new = [IntPtr]::Zero
for ($i = 0; $i -lt 40 -and $new -eq [IntPtr]::Zero; $i++) {
  Start-Sleep -Milliseconds 250
  foreach ($h in [TTWebWindow]::Windows((Get-Pids))) { if (-not $before.ContainsKey($h.ToInt64())) { $new = $h; break } }
}
if ($new -eq [IntPtr]::Zero) {
  # The browser may have put the page in a window that was already open: use its front-most window.
  $all = [TTWebWindow]::Windows((Get-Pids))
  if ($all.Count -gt 0) { $new = $all[0]; Note 'no new window; using the front-most browser window' }
  else { Note 'no browser window found'; Save-Log; exit 0 }
} else { Note ('new window after ' + (($i) * 250) + ' ms') }

# Place, maximize and bring forward; then keep an eye on it for about 4 s, because a browser that restores its
# own window state a moment later can fold or shrink the window again.
Note ([TTWebWindow]::Bring($new, $area.X, $area.Y, $area.Width, $area.Height))
$fixes = 0
for ($k = 0; $k -lt 16; $k++) {
  Start-Sleep -Milliseconds 250
  if (-not [TTWebWindow]::Settled($new, $area.X, $area.Y, $area.Width, $area.Height)) {
    if ($fixes -lt 4) { $fixes++; Note ('again: ' + [TTWebWindow]::Bring($new, $area.X, $area.Y, $area.Width, $area.Height)) }
  }
}
Note ('settled=' + [TTWebWindow]::Settled($new, $area.X, $area.Y, $area.Width, $area.Height) + ' front=' + [TTWebWindow]::Front($new) + ' fixes=' + $fixes)
Save-Log