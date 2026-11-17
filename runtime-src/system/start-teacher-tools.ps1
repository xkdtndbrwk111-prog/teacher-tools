$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runtime.ps1')
Start-TTHidden -ScriptPath (Join-Path $PSScriptRoot 'launch.ps1')
