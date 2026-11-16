# Fixed bootstrap. This and r8-kernel.ps1 / update-public.xml are NOT remotely mutable.
param([switch]$Windowed,[switch]$ManualUpdate,[switch]$RecoveryRetry)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'r8-kernel.ps1')
$root=$PSScriptRoot
$expected=Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal'
if([IO.Path]::GetFullPath($root) -ine [IO.Path]::GetFullPath($expected)){throw 'Use the installed bootstrap.'}
$lock=$null;$startBoard=$false;$applied=$false;$token='';$version='';$tx=Join-Path $root 'r8-transaction'
# Recovery is independent of the possibly half-replaced runtime.ps1.
function Get-R8Browsers {
 $profiles=@((Join-Path $root 'ChromeProfile'),(Join-Path $root 'EdgeProfile'))
 @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction Stop|Where-Object {$line=$_.CommandLine;$line -and @($profiles|Where-Object {$line.IndexOf($_,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count -gt 0})
}
function Get-R8ListenerIds {
 $lines=@(& "$env:SystemRoot\System32\netstat.exe" -ano -p TCP)
 if($LASTEXITCODE -ne 0){throw 'Listener inspection failed.'}
 $ids=@(foreach($line in $lines){if($line -match '^\s*TCP\s+127\.0\.0\.1:17439\s+\S+\s+LISTENING\s+(\d+)\s*$'){[int]$Matches[1]}})
 return @($ids|Select-Object -Unique)
}
function Stop-R8Server {
 $ids=@(Get-R8ListenerIds)
 if(-not $ids.Count){return}
 if($ids.Count -ne 1){throw 'Unrecognized listener.'}
 $idValue=[int]$ids[0];$proc=Get-Process -Id $idValue -ErrorAction Stop
 try{
  $null=$proc.Handle
  $info=Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$idValue" -ErrorAction Stop
  $path=Join-Path $root 'server.ps1'
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $owner=Invoke-CimMethod -InputObject $info -MethodName GetOwnerSid
  if($owner.ReturnValue -ne 0 -or $owner.Sid -ne $identity -or $info.Name -notin @('powershell.exe','pwsh.exe') -or $info.CommandLine -notmatch ('(?i)(?:^|\s)-File\s+(?:"'+[regex]::Escape($path)+'"|'+[regex]::Escape($path)+')(?:\s|$)')){throw 'Unverified service on local port; not stopped.'}
  $now=@(Get-R8ListenerIds)
  if($proc.HasExited -or $now.Count -ne 1 -or $now[0] -ne $idValue){throw 'Local service changed.'}
  $proc.Kill();if(-not $proc.WaitForExit(15000)){throw 'Server stop timed out.'}
  for($i=0;$i -lt 40;$i++){if(-not @(Get-R8ListenerIds).Count){return};Start-Sleep -Milliseconds 250}
  throw 'Local port did not clear.'
 }finally{$proc.Dispose()}
}
function Close-R8Board {
 $windows=@(foreach($b in @(Get-R8Browsers)){ $p=Get-Process -Id $b.ProcessId -ErrorAction SilentlyContinue;if($p -and $p.MainWindowHandle -ne [IntPtr]::Zero){$p}})
 if($windows.Count -ne 1 -or -not $windows[0].CloseMainWindow()){throw 'Close the board normally before updating.'}
 for($i=0;$i -lt 80;$i++){if(-not @(Get-R8Browsers).Count){return};Start-Sleep -Milliseconds 250}
 throw 'Board did not close; no program files changed.'
}
function Start-R8Board([string]$ReadyToken=''){
 $pi=New-Object Diagnostics.ProcessStartInfo
 $pi.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $pi.Arguments='-NoProfile -File "'+(Join-Path $root 'board-launch.ps1')+'"'+$(if($Windowed){' -Windowed'}else{''})+$(if($ReadyToken){' -R8ReadyToken '+$ReadyToken}else{''})
 $pi.WorkingDirectory=$root;$pi.UseShellExecute=$false;$pi.CreateNoWindow=$true
 return [Diagnostics.Process]::Start($pi)
}
try{
 Assert-R8Plain $root
 $lockPath=Join-Path $root 'r8-update.lock';Assert-R8Plain $lockPath
 try{$lock=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{return}
 $running=@(Get-R8Browsers).Count -gt 0
 $j=Read-R8Journal $root
 if($j){
  if($running){Write-R8State $root 'error' '복구 대기 중입니다. 호자보드를 정상 종료 후 다시 실행하세요.';return}
  Stop-R8Server;Restore-R8Transaction $root;Remove-R8Staging $root
  Write-R8State $root 'error' '중단된 업데이트를 이전 버전으로 복구했습니다.'
  $startBoard=$true
 }else{
  if($running -and -not $ManualUpdate){return}
  $startBoard=-not $running
  Remove-R8Staging $root
  if($ManualUpdate -or (-not $RecoveryRetry -and -not(Test-Path -LiteralPath (Join-Path $root 'startup-update-disabled.flag')))){
   try{
    Write-R8State $root 'checking' '서명된 프로그램 업데이트 확인 중입니다.'
    [byte[]]$envelope=Get-R8Remote 'latest.json' 524288
    $m=Read-R8Manifest $envelope (Join-Path $root 'update-public.xml')
    if($null -eq $m){Write-R8State $root 'idle' '새 실행기 업데이트가 등록되지 않았습니다.'}
    else{
     $version=[string]$m.version;$plan=@(New-R8Plan $root $m)
     if(-not $plan.Count){Write-R8State $root 'latest' '현재 버전이 최신입니다.' $version}
     else{
      $token=[guid]::NewGuid().ToString('N')
      $tx=Initialize-R8Transaction $root $m $plan {param($sha,$length) Get-R8Remote ('blobs/'+$sha+'.bin') $length}
      # Only an explicit manual apply may close the dedicated board. No forced browser termination.
      if(@(Get-R8Browsers).Count){if(-not $ManualUpdate){throw 'Board started during download.'};Close-R8Board;$startBoard=$true}
      if(@(Get-R8Browsers).Count){throw 'Board is still running.'}
      Write-R8State $root 'installing' '서명 검증 완료. 변경 파일을 설치합니다.' $version
      Stop-R8Server
      Save-R8Journal $root $tx $plan $token $version
      Install-R8Plan $root $tx $plan
      $applied=$true;$startBoard=$true
     }
    }
   }catch{
    $problem=$_.Exception.Message
    if(Test-Path -LiteralPath (Join-Path $tx 'pending.json')){
     if(@(Get-R8Browsers).Count){throw 'Recovery deferred until board closes.'}
     Stop-R8Server;Restore-R8Transaction $root
    }
    Remove-R8Staging $root
    Write-R8State $root 'error' ('기존 버전 유지: '+$problem) $version
    if(-not @(Get-R8Browsers).Count){$startBoard=$true}
   }
  }
 }
 if($startBoard){
  $child=Start-R8Board $(if($applied){$token}else{''})
  try{
   if($applied){
    $ready=Join-Path $tx 'ready.json'
    $passed=$false
    for($i=0;$i -lt 240;$i++){
     if(Test-Path -LiteralPath $ready -PathType Leaf){
      $r=Read-R8Json $ready
      $live=Invoke-WebRequest -Uri 'http://127.0.0.1:17439/health' -UseBasicParsing -TimeoutSec 3
      $health=$live.Content|ConvertFrom-Json
      $target=Read-R8Json (Get-R8Path $root 'release.json')
      if($r.token -ceq $token -and $r.release -ceq $target.release -and $health.service -ceq 'teacher-tools-local' -and $health.release -ceq $target.release -and @(Get-R8Browsers).Count){$passed=$true;break}
      throw 'New board readiness verification failed.'
     }
     if($child.HasExited){break}
     Start-Sleep -Milliseconds 250
    }
    if(-not $passed){throw 'New board did not confirm startup.'}
    [IO.File]::Delete((Join-Path $tx 'pending.json'))
    Remove-R8Staging $root
    Write-R8State $root 'installed' '프로그램 업데이트 및 재실행 확인 완료.' $version
   }
  }catch{
   # A timed-out launcher must not start another window while rollback is in progress.
   if($applied -and -not $child.HasExited){$child.Kill();if(-not $child.WaitForExit(10000)){throw 'Launcher did not stop; recovery deferred.'}}
   throw
  }finally{$child.Dispose()}
 }
}catch{
 $problem=$_.Exception.Message
 try{
  if((Test-Path -LiteralPath (Join-Path $tx 'pending.json')) -and -not @(Get-R8Browsers).Count){
   Stop-R8Server;Restore-R8Transaction $root;Remove-R8Staging $root
   $retry=Start-R8Board;$retry.Dispose()
  }
 }catch{$problem+=' / 복구 대기: '+$_.Exception.Message}
 Write-R8State $root 'error' ('업데이트 중단: '+$problem) $version
}finally{if($lock){$lock.Dispose()}}
