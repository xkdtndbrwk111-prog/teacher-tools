$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runtime.ps1')
Stop-TTBrowser
$listenerPid=Get-TTListenerPid
if($null -ne $listenerPid){ Stop-TTVerifiedServer -ExpectedPid $listenerPid }
Write-Host 'Teacher Tools 로컬창과 서버를 종료했습니다.'
