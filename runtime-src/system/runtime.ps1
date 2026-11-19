# Teacher Tools local runtime helpers - Windows PowerShell 5.1, no administrator required.
# Release identity is sourced once from release.json (also used by the UI and updater).
$TTReleaseInfo=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$TTRelease=[string]$TTReleaseInfo.release
$TTPort = 17439
$TTInstallDir = Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal'
$TTUrl = 'http://127.0.0.1:17439/'

function Get-TTHealth {
  try {
    $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri ($TTUrl + 'health')
    return ($res.Content | ConvertFrom-Json)
  } catch { return $null }
}
function Get-TTListenerPid {
  $ids = @()
  foreach ($line in (& netstat -ano -p TCP)) {
    if ($line -match '^\s*TCP\s+127\.0\.0\.1:17439\s+\S+\s+LISTENING\s+(\d+)\s*$') {
      $ids += [int]$Matches[1]
    }
  }
  $ids = @($ids | Select-Object -Unique)
  if ($ids.Count -gt 1) { throw 'Several processes listen on the Teacher Tools port. No changes made.' }
  if ($ids.Count -eq 1) { return [int]$ids[0] }
  return $null
}
function Assert-TTOwnedPid {
  param([int]$ProcessId)
  $health = Get-TTHealth
  if (!$health -or $health.service -ne 'teacher-tools-local') {
    throw 'Port 17439 is already occupied by another or unverified service. No process was stopped.'
  }
  $proc = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
  if (!$proc -or $proc.Name -notin @('powershell.exe','pwsh.exe')) {
    throw 'The listener is not a verified Teacher Tools PowerShell process.'
  }
  $path = Join-Path $TTInstallDir 'server.ps1'
  if (!$proc.CommandLine -or $proc.CommandLine -notmatch ('(?i)(?:^|\s)-File\s+(?:"'+[regex]::Escape($path)+'"|'+[regex]::Escape($path)+')(?:\s|$)')) {
    throw 'Listener command path differs from this installation. No process was stopped.'
  }
}
# Wait for the exact verified process AND listener to disappear. Never stop a replacement listener.
function Get-TTVerifiedServerProcess {
  $listenerId=Get-TTListenerPid
  if($null -eq $listenerId){return $null}
  $process=Get-Process -Id $listenerId -ErrorAction Stop
  try {
    $null=$process.Handle
    Assert-TTOwnedPid -ProcessId $listenerId
    if($process.HasExited -or (Get-TTListenerPid) -ne $listenerId){throw 'Server changed during ownership verification.'}
    return $process
  }catch{$process.Dispose();throw}
}
function Stop-TTVerifiedServer {
  param([int]$ExpectedPid=0,[Diagnostics.Process]$VerifiedProcess=$null)
  $listenerId=Get-TTListenerPid
  if($null -eq $listenerId -and -not $VerifiedProcess){return}
  if($ExpectedPid -and $null -ne $listenerId -and $listenerId -ne $ExpectedPid){throw 'Server listener changed. No process was stopped.'}
  $process=$VerifiedProcess
  $created=$false
  if(-not $process){$process=Get-TTVerifiedServerProcess;$created=$true}
  if(-not $process){return}
  try{
    $originalId=$process.Id
    if($null -ne $listenerId -and $listenerId -ne $originalId){throw 'Server listener changed. No process was stopped.'}
    if(-not $process.HasExited){
      if((Get-TTListenerPid) -notin @($null,$originalId)){throw 'Server listener changed. No process was stopped.'}
      $process.Kill()
    }
    if(-not $process.WaitForExit(45000)){throw 'Teacher Tools server process did not exit within 45 seconds.'}
    # Release the kernel process handle before polling its old listener. The caller only disposes it afterwards.
    $process.Dispose()
    $watch=[Diagnostics.Stopwatch]::StartNew()
    do{
      $currentListener=Get-TTListenerPid
      if($null -eq $currentListener){return}
      if($currentListener -ne $originalId){throw 'A different process occupied port 17439. No process was stopped.'}
      Start-Sleep -Milliseconds 300
    }while($watch.Elapsed.TotalSeconds -lt 30)
    throw 'Teacher Tools server exited but port 17439 did not clear.'
  }finally{if($created){$process.Dispose()}}
}
function Start-TTServer {
  if($null -ne (Get-TTListenerPid)){throw 'Port 17439 is already occupied. A duplicate server was not started.'}
  $serverPath = Join-Path $TTInstallDir 'server.ps1'
  if (!(Test-Path -LiteralPath $serverPath)) { throw 'Teacher Tools server.ps1 is missing. Run INSTALL_TEACHER_TOOLS.cmd.' }
  $exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  if (!(Test-Path -LiteralPath $exe)) { throw 'Windows PowerShell 5.1 was not found.' }
  Start-TTHidden -ScriptPath $serverPath
}
# Recovery runs only from the heartbeat of a verified, live board window.
# Never stop an existing listener or in-flight server; absence only.
$script:TTRecoveryMisses=0
$script:TTRecoveryAttempts=@()
function Write-TTRecoveryEvent([string]$Event){
 try{
  $file=Join-Path $TTInstallDir 'server-recovery.log'
  if((Test-Path -LiteralPath $file -PathType Leaf) -and (Get-Item -LiteralPath $file).Length -gt 65536){
   [IO.File]::Copy($file,($file+'.previous'),$true);[IO.File]::WriteAllText($file,'')
  }
  [IO.File]::AppendAllText($file,((ConvertTo-Json -Compress @{at=[DateTime]::UtcNow.ToString('o');release=$TTRelease;event=$Event;pid=$PID})+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
 }catch{}
}
function Enter-TTRecoveryGuards {
 $guards=@()
 try{
  foreach($name in @('r8-update.lock','stable-pilot.lock','stable-pilot-launch.lock')){
   $path=Join-Path $TTInstallDir $name
   if((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe guard path'}
   $guards+=,[IO.File]::Open($path,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  }
  return $guards
 }catch{foreach($guard in $guards){$guard.Dispose()};return}
}
function Test-TTRecoveryAbsent {
 $lines=@(& "$env:SystemRoot\System32\netstat.exe" -ano -p TCP)
 if($LASTEXITCODE -ne 0){return $false}
 # Fail closed on any listener on this port, including wildcard addresses.
 if(@($lines|Where-Object {$_ -match '^\s*TCP\s+\S+:17439\s+\S+\s+LISTENING\s+\d+\s*$'}).Count){return $false}
 $server=Join-Path $TTInstallDir 'server.ps1'
 $ps=@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" -ErrorAction Stop)
 if(@($ps|Where-Object {$_.CommandLine -and $_.CommandLine -match ('(?i)(?:^|\s)-File\s+(?:"'+[regex]::Escape($server)+'"|'+[regex]::Escape($server)+')(?:\s|$)')}).Count){return $false}
 return $true
}
function Invoke-TTServerRecovery([scriptblock]$OwnerAlive){
 try{
  if(!(& $OwnerAlive)){return}
  $live=Get-TTHealth
  if($live){
   if($live.service -ceq 'teacher-tools-local' -and $live.release -ceq $TTRelease){$script:TTRecoveryMisses=0}
   return
  }
  if(!(Test-TTRecoveryAbsent)){$script:TTRecoveryMisses=0;return}
  $script:TTRecoveryMisses++
  if($script:TTRecoveryMisses -lt 2){return}
  $guards=@(Enter-TTRecoveryGuards)
  if($guards.Count -ne 3){return}
  try{
   if((Test-Path -LiteralPath (Join-Path $TTInstallDir 'r8-transaction\pending.json')) -or (Test-Path -LiteralPath (Join-Path $TTInstallDir 'stable-pilot-rollback\pending.json'))){return}
   $current=Get-Content -LiteralPath (Join-Path $TTInstallDir 'release.json') -Raw -Encoding UTF8|ConvertFrom-Json
   if($current.release -cne $TTRelease -or !(& $OwnerAlive) -or (Get-TTHealth) -or !(Test-TTRecoveryAbsent)){return}
   $now=[DateTime]::UtcNow
   $script:TTRecoveryAttempts=@($script:TTRecoveryAttempts|Where-Object {($now-$_).TotalMinutes -lt 10})
   if($script:TTRecoveryAttempts.Count -ge 3){return}
   $script:TTRecoveryAttempts+=,$now
   $script:TTRecoveryMisses=0
   Write-TTRecoveryEvent 'restart-requested'
   Start-TTServer
   Write-TTRecoveryEvent 'restart-launched'
  }finally{foreach($guard in $guards){$guard.Dispose()}}
 }catch{Write-TTRecoveryEvent 'recovery-check-failed'}
}

# A process created with no console at all cannot appear in Windows Terminal, whatever the default terminal is.
function Start-TTHidden {
  param([string]$ScriptPath)
  $exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $exe
  $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $ScriptPath + '"'
  $info.WorkingDirectory = Split-Path -Parent $ScriptPath
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  [void][System.Diagnostics.Process]::Start($info)
}
# Whether the board-sharing helper is alive: it rewrites its status file every second while it runs.
function Get-TTShareHelper {
  $state = [ordered]@{running=$false;release='';hook=$false;age=$null;last=''}
  $log = Join-Path $TTInstallDir 'share-input.log'
  if (Test-Path -LiteralPath $log) { $state.last = [string](Get-Content -LiteralPath $log -Tail 1 -Encoding UTF8) }
  $file = Join-Path $TTInstallDir 'share-input-status.json'
  if (Test-Path -LiteralPath $file) {
    try {
      $s = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
      $age = ((Get-Date) - (Get-Item -LiteralPath $file).LastWriteTime).TotalSeconds
      $state.age = [math]::Round($age, 1)
      $state.release = [string]$s.release
      $state.hook = [bool]$s.hook
      $state.running = ($age -lt 5) -and ($null -ne (Get-Process -Id ([int]$s.pid) -ErrorAction SilentlyContinue))
    } catch {}
  }
  [pscustomobject]$state
}
$script:TTTouchCheckCode = @'

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
// Which screen Windows ties each touch device to, and which screen the dashboard window is on.
public class TTTouchCheck {
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential)] struct RAWINPUTDEVICELIST { public IntPtr hDevice; public uint dwType; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct POINTER_DEVICE_INFO {
        public uint displayOrientation; public IntPtr device; public int pointerDeviceType; public IntPtr monitor;
        public uint startingCursorId; public ushort maxActiveContacts;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=520)] public string productString; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct MONITORINFOEX {
        public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string szDevice; }
    [DllImport("user32.dll", SetLastError=true)] static extern bool GetPointerDevices(ref uint count, [In, Out] POINTER_DEVICE_INFO[] devices);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFOEX info);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll", SetLastError=true)] static extern uint GetRawInputDeviceList([In, Out] RAWINPUTDEVICELIST[] list, ref uint count, uint size);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern uint GetRawInputDeviceInfo(IntPtr device, uint command, IntPtr data, ref uint size);
    public string Board = "";
    public List<string> Touch = new List<string>();
    public int Digitizers = 0;
    public static bool Alive(long window) { return window != 0 && IsWindow(new IntPtr(window)); }
    static string Screen(IntPtr monitor) {
        var mi = new MONITORINFOEX(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
        return GetMonitorInfo(monitor, ref mi) ? mi.szDevice : "";
    }
    public static TTTouchCheck Probe(long window) {
        var r = new TTTouchCheck();
        if (Alive(window)) r.Board = Screen(MonitorFromWindow(new IntPtr(window), 2));
        uint n = 0;
        if (GetPointerDevices(ref n, null) && n > 0) {
            var list = new POINTER_DEVICE_INFO[n];
            if (GetPointerDevices(ref n, list))
                for (int i = 0; i < n; i++) if (list[i].pointerDeviceType == 3) r.Touch.Add(Screen(list[i].monitor));
        }
        // Touch screens (HID page 0x0D, usage 0x04) Windows knows, tied to a screen or not.
        uint count = 0, size = (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICELIST));
        GetRawInputDeviceList(null, ref count, size);
        if (count > 0) {
            var devs = new RAWINPUTDEVICELIST[count];
            if (GetRawInputDeviceList(devs, ref count, size) != uint.MaxValue)
                foreach (var d in devs) {
                    if (d.dwType != 2) continue;
                    IntPtr info = Marshal.AllocHGlobal(32);
                    try {
                        Marshal.WriteInt32(info, 0, 32); uint isz = 32;
                        if (GetRawInputDeviceInfo(d.hDevice, 0x2000000b, info, ref isz) != uint.MaxValue &&
                            (ushort)Marshal.ReadInt16(info, 20) == 0x0D && (ushort)Marshal.ReadInt16(info, 22) == 0x04) r.Digitizers++;
                    } finally { Marshal.FreeHGlobal(info); }
                }
        }
        return r;
    }
}
'@
# The board touch check: ok when a touch device is tied to the screen the dashboard is on; mismatch when touch
# devices exist but none is tied there (board touches then land on the teacher's screen); none when Windows
# knows no touch screen at all (a board that sends plain mouse signals, or no touch).
function Get-TTTouchCheck {
  if (-not ('TTTouchCheck' -as [type])) { Add-Type -TypeDefinition $script:TTTouchCheckCode }
  Add-Type -AssemblyName System.Windows.Forms
  $screens = @([System.Windows.Forms.Screen]::AllScreens)
  $window = [long]0
  $file = Join-Path $TTInstallDir 'board-window.json'
  if (Test-Path -LiteralPath $file) { try { $window = [long](Get-Content -LiteralPath $file -Raw | ConvertFrom-Json).window } catch {} }
  if (-not [TTTouchCheck]::Alive($window)) {
    foreach ($p in @(Get-TTProfileBrowserProcesses)) {
      $proc = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
      if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) { $window = $proc.MainWindowHandle.ToInt64(); break }
    }
  }
  $r = [TTTouchCheck]::Probe($window)
  $touch = @($r.Touch | Where-Object { $_ })
  $status = if ($screens.Count -lt 2) { 'single' } elseif (-not $r.Board) { 'unknown' } elseif ($touch -contains $r.Board) { 'ok' } elseif ($touch.Count -gt 0 -or $r.Digitizers -gt 0) { 'mismatch' } else { 'none' }
  [pscustomobject]@{status=$status;board=$r.Board;touch=$touch;digitizers=$r.Digitizers;screens=$screens.Count}
}
function Select-TTMonitor {
  param([string]$Current)
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  # Windows keeps its Settings numbers to itself; the device number (\\.\DISPLAY2 is 2) usually matches,
  # and a big number on each screen settles it when it does not.
  $numberOf = { param($s, $i) if ($s.DeviceName -match 'DISPLAY(\d+)$') { [int]$Matches[1] } else { $i + 1 } }
  $screens = @([System.Windows.Forms.Screen]::AllScreens | Sort-Object { if ($_.DeviceName -match 'DISPLAY(\d+)$') { [int]$Matches[1] } else { 999 } }, DeviceName)
  if ($screens.Count -eq 0) { throw 'No monitor was found.' }
  if ($screens.Count -eq 1) { return $screens[0].DeviceName }
  $marks = @()
  for ($i = 0; $i -lt $screens.Count; $i++) {
    $s = $screens[$i]
    $m = New-Object System.Windows.Forms.Form
    $m.FormBorderStyle = 'None'
    $m.StartPosition = 'Manual'
    $m.ShowInTaskbar = $false
    $m.TopMost = $true
    $m.BackColor = [System.Drawing.Color]::FromArgb(19,35,61)
    $m.Bounds = New-Object System.Drawing.Rectangle(($s.Bounds.X + 40), ($s.Bounds.Y + 40), 260, 260)
    $big = New-Object System.Windows.Forms.Label
    $big.Dock = 'Fill'
    $big.TextAlign = 'MiddleCenter'
    $big.ForeColor = [System.Drawing.Color]::White
    $big.Font = New-Object System.Drawing.Font('Malgun Gothic',110,[System.Drawing.FontStyle]::Bold)
    $big.Text = [string](& $numberOf $s $i)
    $m.Controls.Add($big)
    $m.Show()
    $marks += $m
  }
  $form = New-Object System.Windows.Forms.Form
  $form.Text = '호자보드'
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.TopMost = $true
  $form.Font = New-Object System.Drawing.Font('Malgun Gothic',12)
  $form.ClientSize = New-Object System.Drawing.Size(460,(100 + 58 * $screens.Count))
  $title = New-Object System.Windows.Forms.Label
  $title.Text = '대시보드를 띄울 모니터를 고르세요'
  $title.SetBounds(20,18,420,30)
  $form.Controls.Add($title)
  $hint = New-Object System.Windows.Forms.Label
  $hint.Text = '화면마다 왼쪽 위에 크게 뜬 번호를 보고 고르세요.'
  $hint.Font = New-Object System.Drawing.Font('Malgun Gothic',10)
  $hint.SetBounds(20,50,420,26)
  $form.Controls.Add($hint)
  for ($i = 0; $i -lt $screens.Count; $i++) {
    $s = $screens[$i]
    $label = ([string](& $numberOf $s $i)) + '번 모니터  ' + $s.Bounds.Width + ' x ' + $s.Bounds.Height
    if ($s.Primary) { $label += '  (주 모니터)' }
    if ($s.DeviceName -eq $Current) { $label += '  (지금 사용 중)' }
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $label
    $b.Tag = $s.DeviceName
    $b.SetBounds(20,(88 + 58 * $i),420,48)
    $b.Add_Click({ $win = $this.FindForm(); $win.Tag = $this.Tag; $win.Close() })
    $form.Controls.Add($b)
  }
  try { [void]$form.ShowDialog() } finally { foreach ($m in $marks) { $m.Close(); $m.Dispose() } }
  $picked = $form.Tag
  $form.Dispose()
  if (!$picked) { throw 'CANCELLED' }
  return $picked
}
function Wait-TTReady {
  param([string]$ExpectedRelease = $TTRelease)
  for ($i=0; $i -lt 48; $i++) {
    $health = Get-TTHealth
    if ($health -and $health.service -eq 'teacher-tools-local' -and $health.release -eq $ExpectedRelease) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}
function Get-TTBrowserPath {
  param([string]$Name)
  $relative = if ($Name -eq 'chrome') { 'Google\Chrome\Application\chrome.exe' } else { 'Microsoft\Edge\Application\msedge.exe' }
  foreach ($root in @(${env:ProgramFiles(x86)},$env:ProgramFiles,$env:LOCALAPPDATA)) {
    if ($root -and (Test-Path -LiteralPath (Join-Path $root $relative))) { return (Join-Path $root $relative) }
  }
  $exe = Get-Command (Split-Path -Leaf $relative) -ErrorAction SilentlyContinue
  if ($exe) { return $exe.Source }
  return $null
}
function Get-TTProfilePath {
  param([string]$Name)
  if ($Name -eq 'chrome') { return (Join-Path $TTInstallDir 'ChromeProfile') }
  return (Join-Path $TTInstallDir 'EdgeProfile')
}
function Test-TTChromeIsDefault {
  try {
    $choice = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice' -ErrorAction Stop
    return ($choice.ProgId -like 'ChromeHTML*')
  } catch { return $false }
}
# Each browser keeps its own storage, so the teacher's settings follow when the browser changes.
function Copy-TTBrowserData {
  param([string]$From,[string]$To)
  $source = Join-Path (Get-TTProfilePath $From) 'Default\Local Storage'
  if (!(Test-Path -LiteralPath $source)) { return }
  $target = Join-Path (Get-TTProfilePath $To) 'Default\Local Storage'
  $kept = $target + '.before-copy'
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  if (Test-Path -LiteralPath $kept) { Remove-Item -LiteralPath $kept -Recurse -Force }
  if (Test-Path -LiteralPath $target) { Rename-Item -LiteralPath $target -NewName (Split-Path -Leaf $kept) }
  try { Copy-Item -LiteralPath $source -Destination $target -Recurse -Force }
  catch {
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $kept) { Rename-Item -LiteralPath $kept -NewName (Split-Path -Leaf $target) -ErrorAction SilentlyContinue }
    throw
  }
}
# The choice is kept in browser.txt: changing the default browser later does not move the dashboard until the next install.
function Select-TTBrowser {
  param([switch]$Reselect)
  $file = Join-Path $TTInstallDir 'browser.txt'
  $pinned = if (Test-Path -LiteralPath $file) { (Get-Content -LiteralPath $file -Raw).Trim() } else { '' }
  if ($pinned -notin @('chrome','edge')) { $pinned = '' }
  $previous = $pinned
  if (!$previous -and (Test-Path -LiteralPath (Join-Path (Get-TTProfilePath 'edge') 'Default\Local Storage'))) { $previous = 'edge' }
  $order = if (Test-TTChromeIsDefault) { @('chrome','edge') } else { @('edge','chrome') }
  if ($pinned -and !$Reselect) { $order = @($pinned) + @($order | Where-Object { $_ -ne $pinned }) }
  $name = $order | Where-Object { Get-TTBrowserPath $_ } | Select-Object -First 1
  if (!$name) { throw 'Chrome 또는 Microsoft Edge가 필요합니다. 둘 다 찾지 못했습니다.' }
  $copied = $null
  if ($previous -and $previous -ne $name) {
    try { Copy-TTBrowserData -From $previous -To $name; $copied = $true } catch { $copied = $false }
  }
  New-Item -ItemType Directory -Force -Path (Get-TTProfilePath $name) | Out-Null
  [IO.File]::WriteAllText($file,$name,[Text.Encoding]::ASCII)
  return [pscustomobject]@{ Name = $name; Path = (Get-TTBrowserPath $name); Profile = (Get-TTProfilePath $name); DataCopied = $copied }
}
function Get-TTProfileBrowserProcesses {
 $profiles = @((Get-TTProfilePath 'edge'),(Get-TTProfilePath 'chrome'))
 @(Get-CimInstance -ClassName Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction SilentlyContinue |
   Where-Object {
     $line = $_.CommandLine
     $line -and @($profiles | Where-Object { $line.IndexOf($_,[StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count -gt 0
   })
}
function Stop-TTBrowser {
 foreach ($proc in @(Get-TTProfileBrowserProcesses)) {
   Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
 }
}
