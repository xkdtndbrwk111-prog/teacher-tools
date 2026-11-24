# Teacher Tools handover reset - PowerShell 5.1; safe scope: LOCALAPPDATA\TeacherToolsLocal only.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runtime.ps1')
Add-Type -AssemblyName System.Windows.Forms
$expected=Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal'
if(-not [string]::Equals([IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\'),[IO.Path]::GetFullPath($expected).TrimEnd('\'),[StringComparison]::OrdinalIgnoreCase)){
 throw 'Only the installed TeacherToolsLocal folder can be reset.'
}
# Give the HTTP response a chance to reach the dashboard before closing it.
Start-Sleep -Seconds 3
try {
 # Stop only the Chrome/Edge processes launched with Teacher Tools dedicated profiles.
 Stop-TTBrowser
 for($n=0;$n -lt 30 -and @(Get-TTProfileBrowserProcesses).Count -gt 0;$n++){Start-Sleep -Milliseconds 300}
 if(@(Get-TTProfileBrowserProcesses).Count -gt 0){throw 'Teacher Tools browser is still open. Profile was not removed.'}
 # Stop only the verified Teacher Tools loopback server.
 $serverPid=Get-TTListenerPid
 if($null -ne $serverPid){Assert-TTOwnedPid -ProcessId $serverPid;Stop-Process -Id $serverPid -Force}
 for($n=0;$n -lt 30 -and $null -ne (Get-TTListenerPid);$n++){Start-Sleep -Milliseconds 200}
 if($null -ne (Get-TTListenerPid)){throw 'Teacher Tools server is still running. Data was not removed.'}
 # The native book host has its own persistent WebView2 data. Wait for
 # the owned book window and isolated worker to close after board shutdown.
 $bookSessions=Join-Path $TTInstallDir 'book-reader-sessions'
 $bookProfile=Join-Path $TTInstallDir 'book-reader-profile'
 function Get-TTActiveBookResetProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name='BookReader.exe' OR Name='msedgewebview2.exe' OR Name='powershell.exe'" -ErrorAction Stop | Where-Object {
   $cmd=[string]$_.CommandLine;$exe=[string]$_.ExecutablePath
   ($_.Name -eq 'BookReader.exe' -and $exe.StartsWith($bookSessions+'\',[StringComparison]::OrdinalIgnoreCase)) -or
   ($_.Name -eq 'msedgewebview2.exe' -and ($cmd.IndexOf($bookProfile,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $cmd.IndexOf($bookSessions,[StringComparison]::OrdinalIgnoreCase) -ge 0)) -or
   ($_.Name -eq 'powershell.exe' -and $cmd.IndexOf((Join-Path $TTInstallDir 'server.ps1'),[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $cmd -match '(?i)\s-BookWorker\s+[a-f0-9]{32}\s')
  })
 }
 for($n=0;$n -lt 75 -and @(Get-TTActiveBookResetProcesses).Count -gt 0;$n++){Start-Sleep -Milliseconds 400}
 if(@(Get-TTActiveBookResetProcesses).Count -gt 0){throw 'Book reader is still open. Browser data was not removed.'}
 $dirNames=@('ChromeProfile','EdgeProfile','book-reader-profile','book-reader-sessions')
 $files=@('school.json','weather-place.json','weather-cache.json','weather-cache.json.tmp','weather-cache.json.bak','seating.json','coins.log','notice.log','photos.txt',
          'browser.txt','display.txt','board-mode.json','board-window.json','share-input.json',
          'share-input-status.json','share-input.log','share-input-error.log','open-web.log',
          'launch-error.log','privacy-reset-error.log')
 # The installed pre-update backup contains a monitor choice; wipe it too on handover.
 $backupDirs=@(Get-ChildItem -LiteralPath $TTInstallDir -Directory -ErrorAction Stop | Where-Object {
  $_.Name -match '^backup-before-(cloudr4-|v[0-9])'
 } | Select-Object -ExpandProperty Name)
 $removed=0
 foreach($name in @($dirNames)+@($backupDirs)){
  $target=Join-Path $TTInstallDir $name
  if(!(Test-Path -LiteralPath $target)){continue}
  $entry=Get-Item -LiteralPath $target -Force
  if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw ('Refusing to follow a directory link: '+$name)}
  if(-not $entry.PSIsContainer){throw ('Expected directory: '+$name)}
  if($name -in @('book-reader-profile','book-reader-sessions')){
   # Walk one directory at a time, never follow a linked descendant.
   $queue=New-Object 'System.Collections.Generic.Queue[string]'
   $queue.Enqueue($target)
   while($queue.Count){foreach($child in @(Get-ChildItem -LiteralPath $queue.Dequeue() -Force -ErrorAction Stop)){
    if($child.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing linked book profile entry.'}
    if($child.PSIsContainer){$queue.Enqueue($child.FullName)}
   }}
  }
  Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
  if(Test-Path -LiteralPath $target){throw ('Unable to remove directory: '+$name)}
  $removed++
 }
 foreach($name in $files){
  $target=Join-Path $TTInstallDir $name
  if(!(Test-Path -LiteralPath $target)){continue}
  $entry=Get-Item -LiteralPath $target -Force
  if($entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw ('Unexpected file type: '+$name)}
  Remove-Item -LiteralPath $target -Force -ErrorAction Stop
  if(Test-Path -LiteralPath $target){throw ('Unable to remove file: '+$name)}
  $removed++
 }
 [void][System.Windows.Forms.MessageBox]::Show("Teacher Tools의 로컬 데이터와 전용 브라우저 프로필 정리가 끝났습니다.`n다음 실행은 새 교사 상태로 시작합니다.`n`n일반 브라우저·Google Sheets·다운로드한 파일은 별도로 정리하세요.",'Teacher Tools 교사 교체 초기화')
}catch{
 $message=$_.Exception.Message
 try{[IO.File]::WriteAllText((Join-Path $TTInstallDir 'privacy-reset-error.log'),$message,(New-Object Text.UTF8Encoding($false)))}catch{}
 [void][System.Windows.Forms.MessageBox]::Show("초기화를 끝내지 못했습니다. 일부 데이터가 남아 있을 수 있습니다.`n"+$message+"`nTeacherToolsLocal 폴더를 확인해 주세요.",'Teacher Tools 초기화 오류')
 exit 1
}
