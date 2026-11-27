param([string]$Output=(Join-Path $env:RUNNER_TEMP 'HOJA-WebView2-FieldPilot-A1'))
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Output){throw 'Output already exists'}
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$source=Join-Path $repo 'runtime-src/system'
$bin=Join-Path $Output 'payload/bin';$runtime=Join-Path $Output 'payload/local/TeacherToolsLocal'
New-Item -ItemType Directory -Path $bin,$runtime -Force|Out-Null
$dashboard=git -C $repo rev-parse HEAD:runtime-src/system/dashboard.html
$server=git -C $repo rev-parse HEAD:runtime-src/system/server.ps1
if($dashboard -cne '3c9d702891313920c5fb1fb6e26b97b30a04d2d4' -or $server -cne 'aca1c8b88560c51b967134293d9d951c167cf0e0'){throw 'Pinned original source drift'}
if((Get-FileHash (Join-Path $source 'asset-book-reader-host.zip') -Algorithm SHA256).Hash.ToLowerInvariant() -cne '20666e7d2c9fc7e28c89f4827258dbcd145f0f39176ea5d16335db8f4b473f6c'){throw 'Pinned original reader drift'}
# Include runtime assets and legacy media worker, not installer, startup,
# privacy-reset, shortcut or updater scripts.
$names=@('asset-book-reader-host.zip','classkit_QR_LICENSE.txt','coins-ui.js','coins.js','dashboard.html','handmade-paper.png','hoja.ico','podo.js','presentation-assets.zip','presentation-board.css','presentation-board.js','release.json','school.js','seating-inbox.html','server.ps1','update-ui.js')
foreach($name in $names){Copy-Item -LiteralPath (Join-Path $source $name) -Destination $runtime}
Get-ChildItem -LiteralPath $source -File|Where-Object {$_.Name -match '^museum-[A-Za-z0-9-]+\.(webp|png)$'}|ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $runtime}
$sdkRoot=Join-Path $env:RUNNER_TEMP ('pilot-sdk-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $sdkRoot|Out-Null
$version='1.0.2903.40';$archive=Join-Path $sdkRoot 'sdk.zip'
Invoke-WebRequest -UseBasicParsing -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $archive
Write-Host "WebView2 SDK $version SHA256 $((Get-FileHash -LiteralPath $archive).Hash)"
Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $sdkRoot 'sdk')
$core=Get-ChildItem (Join-Path $sdkRoot 'sdk/lib') -Recurse -Filter Microsoft.Web.WebView2.Core.dll|Where-Object {$_.Directory.Name -match '^net4'}|Select-Object -First 1
if(!$core){throw 'SDK core missing'}
$win=Join-Path $core.Directory.FullName 'Microsoft.Web.WebView2.WinForms.dll'
$loader=Get-ChildItem (Join-Path $sdkRoot 'sdk') -Recurse -Filter WebView2Loader.dll|Where-Object {$_.FullName -match '[\\/]x64[\\/]'}|Select-Object -First 1
if(!$loader -or !(Test-Path -LiteralPath $win)){throw 'SDK dependencies missing'}
Copy-Item -LiteralPath $core.FullName,$win,$loader.FullName -Destination $bin
foreach($license in @(Get-ChildItem (Join-Path $sdkRoot 'sdk') -File|Where-Object {$_.Name -match '^(LICENSE|ThirdPartyNotices)'})){Copy-Item -LiteralPath $license.FullName -Destination $bin}
$csc="$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /codepage:65001 /define:NATIVE_FIELD_PILOT /target:exe /platform:x64 "/out:$bin\HOJA-Native-Server.exe" /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot 'native-read-server.cs')
if($LASTEXITCODE -ne 0){throw 'Field server build failed'}
& $csc /nologo /codepage:65001 /define:NATIVE_FIELD_PILOT,NATIVE_STORAGE_LAB,NATIVE_SHARE_LAB,NATIVE_DATA_LAB,NATIVE_AUDIO_LAB,NATIVE_PHOTO_LAB,NATIVE_BACKUP_LAB /target:winexe /platform:x64 /main:NativeBoardLaunch "/out:$bin\HOJA-Native-Launch-Lab.exe" "/reference:$bin\Microsoft.Web.WebView2.Core.dll" "/reference:$bin\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'host.cs') (Join-Path $PSScriptRoot 'native-launch.cs') (Join-Path $PSScriptRoot 'native-share-input.cs') (Join-Path $PSScriptRoot 'field-provider-policy.cs')
if($LASTEXITCODE -ne 0){throw 'Field host build failed'}
$policyTest=Join-Path $sdkRoot 'field-policy-test.exe'
& $csc /nologo /codepage:65001 /define:FIELD_POLICY_TEST /target:exe "/out:$policyTest" (Join-Path $PSScriptRoot 'field-provider-policy.cs')
if($LASTEXITCODE -ne 0){throw 'Field policy compile failed'}
& $policyTest
if($LASTEXITCODE -ne 0){throw 'Field policy test failed'}

$payload=Join-Path $Output 'payload'
$inventory=@(Get-ChildItem -LiteralPath $payload -File -Recurse|Sort-Object FullName|ForEach-Object {@{path=$_.FullName.Substring($payload.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
@{schema='HOJA-FIELD-PILOT-1';version='1.66.43-field-a1';source=(git -C $repo rev-parse HEAD);files=$inventory}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'manifest.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'field-pilot-launch.ps1') -Destination (Join-Path $Output 'Start-Pilot.ps1')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'field-pilot-readme.md') -Destination (Join-Path $Output 'READ-ME.md')
Write-Host "PASS field package staged, files=$($inventory.Count)"
