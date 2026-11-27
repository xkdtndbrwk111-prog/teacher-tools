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

# The candidate alone uses local, separate origins for the pinned game and manager.
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$utf8=[Text.UTF8Encoding]::new($false)
$miniSource=Join-Path $repo 'reviewed-minigames'
$miniSha=git -C $miniSource rev-parse HEAD
if($miniSha -cne '51c195b9cd87a63c96944f547ad307e07d7eac40'){throw 'Mini-game pin mismatch'}
$mini=[IO.File]::ReadAllText((Join-Path $miniSource 'index.html'))
$miniOld="const DASHBOARD_ORIGIN='http://127.0.0.1:17439';"
if(([regex]::Matches($mini,[regex]::Escape($miniOld))).Count -ne 1){throw 'Game origin anchor missing or ambiguous'}
$mini=$mini.Replace($miniOld,"const DASHBOARD_ORIGIN='http://127.0.0.1:17451';")
if($mini.Contains('127.0.0.1:17439')){throw 'Game operational origin remains'}
$gameZip=[IO.Compression.ZipFile]::Open((Join-Path $bin 'field-game.zip'),[IO.Compression.ZipArchiveMode]::Create)
try{
 $entry=$gameZip.CreateEntry('index.html');$stream=$entry.Open()
 try{$bytes=$utf8.GetBytes($mini);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
}finally{$gameZip.Dispose()}
$dash=Join-Path $runtime 'dashboard.html';$d=[IO.File]::ReadAllText($dash)
$old="const miniOrigin='https://xkdtndbrwk111-prog.github.io',miniUrl=miniOrigin+'/hoja-minigames/?mode=board&embed=dashboard&coin=4';"
if(([regex]::Matches($d,[regex]::Escape($old))).Count -ne 1){throw 'Board game origin anchor mismatch'}
[IO.File]::WriteAllText($dash,$d.Replace($old,$old.Replace('https://xkdtndbrwk111-prog.github.io','http://127.0.0.1:4189')),$utf8)
$inbox=Join-Path $runtime 'seating-inbox.html';$d=[IO.File]::ReadAllText($inbox)
$old="const ALLOWED=['https://xkdtndbrwk111-prog.github.io','http://127.0.0.1:4188','http://localhost:4188'];"
if(([regex]::Matches($d,[regex]::Escape($old))).Count -ne 1){throw 'Inbox origin anchor mismatch'}
[IO.File]::WriteAllText($inbox,$d.Replace($old,"const ALLOWED=['http://127.0.0.1:4188'];"),$utf8)
$managerZip=[IO.Compression.ZipFile]::Open((Join-Path $bin 'field-manager.zip'),[IO.Compression.ZipArchiveMode]::Create)
try{
 $paths=@(git -C $repo ls-files seating shared classroom/host classroom/grades classroom/survey classroom/student classroom/life assets/hub/favicon.svg usage-stats.js)
 foreach($rel in $paths){
  if($rel -cnotmatch '^[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$' -or $rel.Contains('..') -or $rel -notmatch '\.(html|js|mjs|css|json|png|webp|svg|jpg|jpeg|woff|woff2|txt)$'){continue}
  $p=Join-Path $repo $rel
  if($rel -eq 'usage-stats.js'){$bytes=$utf8.GetBytes('// Field candidate: no public usage telemetry.')}
  elseif($rel -match '\.(html|js|mjs|css|json)$'){
   $v=[IO.File]::ReadAllText($p)
   $v=$v.Replace('http://127.0.0.1:17439','http://127.0.0.1:17451').Replace('http://localhost:17439','http://127.0.0.1:17451')
   if($v -match '(127\.0\.0\.1|localhost):17439'){throw "Manager operational origin remains: $rel"}
   $bytes=$utf8.GetBytes($v)
  }else{$bytes=[IO.File]::ReadAllBytes($p)}
  $entry=$managerZip.CreateEntry($rel);$stream=$entry.Open()
  try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
 }
}finally{$managerZip.Dispose()}
Write-Host 'PASS pinned manager/game packaged with separate origins; original repository files unchanged'

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
& $csc /nologo /codepage:65001 /target:exe /platform:x64 "/out:$bin\HOJA-Field-Static.exe" /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot 'field-static-server.cs')
if($LASTEXITCODE -ne 0){throw 'Field static server build failed'}

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
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'field-acceptance.md') -Destination (Join-Path $Output 'FIELD-ACCEPTANCE.md')
Write-Host "PASS field package staged, files=$($inventory.Count)"
