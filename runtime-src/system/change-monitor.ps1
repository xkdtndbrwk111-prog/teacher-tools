$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runtime.ps1')
$displayFile=Join-Path $TTInstallDir 'display.txt'
$current=if(Test-Path -LiteralPath $displayFile){(Get-Content -LiteralPath $displayFile -Raw).Trim()}else{''}
try{$picked=Select-TTMonitor -Current $current}catch{if($_.Exception.Message -eq 'CANCELLED'){exit 0};throw}
[IO.File]::WriteAllText($displayFile,$picked,[Text.Encoding]::UTF8)
Stop-TTBrowser
Start-TTHidden -ScriptPath (Join-Path $TTInstallDir 'launch.ps1')
