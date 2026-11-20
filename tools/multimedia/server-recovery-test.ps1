# Isolated Windows test: no existing install or user data.
$ErrorActionPreference='Stop'
$env:LOCALAPPDATA=Join-Path $env:RUNNER_TEMP ('tt-watchdog-'+[guid]::NewGuid().ToString('N'))
$root=Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal'
New-Item -ItemType Directory -Path $root -Force|Out-Null
Copy-Item (Join-Path $PSScriptRoot '../../runtime-src/system/*') $root -Recurse
. (Join-Path $root 'runtime.ps1')
# Mock only window liveness; real listener/process/locks and real recovery launcher.
$script:ttFixtureOwnerAlive=$true
$ownerProbe={return $script:ttFixtureOwnerAlive}
function Assert-Health {
 for($i=0;$i -lt 50;$i++){
  $health=Get-TTHealth
  if($health -and $health.service -eq 'teacher-tools-local' -and $health.release -eq $TTRelease){return}
  Start-Sleep -Milliseconds 300
 }
 throw 'Recovered server did not become healthy'
}
function Assert-NoServer {
 if(!(Test-TTRecoveryAbsent)){throw 'Unexpected listener or process'}
}
function Stop-TestOwnedServer {
 $p=Get-TTVerifiedServerProcess
 if($p){try{Stop-TTVerifiedServer -ExpectedPid $p.Id -VerifiedProcess $p}finally{$p.Dispose()}}
}
try{
 Assert-NoServer
 $script:ttFixtureOwnerAlive=$false
 Invoke-TTServerRecovery $ownerProbe;Invoke-TTServerRecovery $ownerProbe;Assert-NoServer
 $script:ttFixtureOwnerAlive=$true
 $lock=[IO.File]::Open((Join-Path $root 'r8-update.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 try{Invoke-TTServerRecovery $ownerProbe;Invoke-TTServerRecovery $ownerProbe;Assert-NoServer}finally{$lock.Dispose()}
 $script:TTRecoveryMisses=0
 Invoke-TTServerRecovery $ownerProbe;Assert-NoServer
 Invoke-TTServerRecovery $ownerProbe;Assert-Health
 $first=Get-TTListenerPid
 Invoke-TTServerRecovery $ownerProbe;Invoke-TTServerRecovery $ownerProbe
 if((Get-TTListenerPid) -ne $first){throw 'Healthy server was replaced'}
 # Exact verified process termination simulates a crash, not a production process.
 Stop-TestOwnedServer
 Assert-NoServer
 Invoke-TTServerRecovery $ownerProbe;Assert-NoServer
 Invoke-TTServerRecovery $ownerProbe;Assert-Health
 Write-Host 'PASS missing server auto-recovered twice, update lock and no-owner suppressed, healthy server preserved'
 Stop-TestOwnedServer
 $script:TTRecoveryAttempts=@([DateTime]::UtcNow,[DateTime]::UtcNow,[DateTime]::UtcNow)
 Invoke-TTServerRecovery $ownerProbe;Invoke-TTServerRecovery $ownerProbe;Assert-NoServer
 Write-Host 'PASS restart storm limit'
}finally{if(Get-TTHealth){Stop-TestOwnedServer}}
