$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runtime.ps1')
$guards=@(Enter-TTRecoveryGuards)
if($guards.Count -ne 3){throw 'Teacher Tools 작업 중입니다. 잠시 후 종료를 다시 시도하세요.'}
try{
 Stop-TTBrowser
 $listenerPid=Get-TTListenerPid
 if($null -ne $listenerPid){ Stop-TTVerifiedServer -ExpectedPid $listenerPid }
}finally{foreach($guard in $guards){$guard.Dispose()}}
Write-Host 'Teacher Tools 로컬창과 서버를 종료했습니다.'
