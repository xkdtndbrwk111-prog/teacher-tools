$ErrorActionPreference='Stop'
$root=Join-Path $env:RUNNER_TEMP 'tt-book-host'
New-Item -ItemType Directory -Force $root | Out-Null
$version='1.0.2903.40'
$zip=Join-Path $root 'sdk.zip'
Invoke-WebRequest -UseBasicParsing -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $zip
Expand-Archive $zip (Join-Path $root 'sdk') -Force
$sdk=Join-Path $root 'sdk'
$out=Join-Path $root 'out'
New-Item -ItemType Directory -Force $out | Out-Null
$core=Get-ChildItem "$sdk\lib" -Recurse -Filter Microsoft.Web.WebView2.Core.dll | Where-Object {$_.Directory.Name -match '^net4'} | Select-Object -First 1
if(!$core){throw 'No .NET Framework SDK assembly'}
$win=Join-Path $core.Directory.FullName 'Microsoft.Web.WebView2.WinForms.dll'
$loader=Get-ChildItem $sdk -Recurse -Filter WebView2Loader.dll | Where-Object {$_.FullName -match '[\\/]x64[\\/]'} | Select-Object -First 1
if(!$loader -or !(Test-Path $win)){throw 'Missing WinForms or x64 loader'}
Copy-Item $core.FullName,$win,$loader.FullName $out
$csc="$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /codepage:65001 /target:exe /platform:x64 "/out:$out\BookReader.exe" "/reference:$out\Microsoft.Web.WebView2.Core.dll" "/reference:$out\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'book-reader-host.cs')
if($LASTEXITCODE -ne 0){throw 'Compilation failed'}
# Redistributable SDK notices, not the full browser runtime.
$license=Get-ChildItem $sdk -Recurse -File | Where-Object {$_.Name -match '^(LICENSE|LICENSE\.txt|LICENSE\.md)$'} | Select-Object -First 1
$notices=Get-ChildItem $sdk -Recurse -File | Where-Object {$_.Name -match 'ThirdPartyNotices'} | Select-Object -First 1
if(!$license){throw 'SDK redistribution license not found'}
Copy-Item $license.FullName (Join-Path $out 'LICENSE.txt')
if($notices){Copy-Item $notices.FullName (Join-Path $out 'ThirdPartyNotices.txt')}
foreach($target in @(1,3,5)){
 $session=Join-Path $root "fixture-$target";New-Item -ItemType Directory -Force $session | Out-Null
 [IO.File]::WriteAllText((Join-Path $session 'request.json'),(ConvertTo-Json -Compress @{url='';title='fixture';pages=5;start=$target;saved=0}),[Text.UTF8Encoding]::new($false))
 & "$out\BookReader.exe" --self-test $session
 if($LASTEXITCODE -ne 0){throw "Native seek fixture $target failed"}
 $state=Get-Content -Raw (Join-Path $session 'state.json') | ConvertFrom-Json
 if($state.saved -ne $target -or $state.page -ne $target -or !$state.closed){throw "Invalid native final state"}
}
# Native interactive mode: validate the original click-enabled URL, navigate TOP-LEVEL
# in an owned WebView2, and exercise pointer/left/right input without an iframe.
$interactive=Join-Path $root 'fixture-interactive'
New-Item -ItemType Directory -Force $interactive | Out-Null
[IO.File]::WriteAllText((Join-Path $interactive 'request.json'),(ConvertTo-Json -Compress @{url='https://canva.link/9qxk3zuhh93ts2s';title='Almond';interactive=1;pages=394;start=7;saved=7}),[Text.UTF8Encoding]::new($false))
& "$out\BookReader.exe" --self-test $interactive
if($LASTEXITCODE -ne 0){throw 'Native interactive Canva fixture failed'}
$interactiveState=Get-Content -Raw (Join-Path $interactive 'state.json') | ConvertFrom-Json
if($interactiveState.saved -ne 7 -or $interactiveState.page -ne 7 -or !$interactiveState.closed -or $interactiveState.cleanControls){throw 'Interactive fixture unexpectedly sought or overlaid Canva navigation'}
Write-Host 'PASS interactive top-level clickable Canva-host fixture without navigation overlay'

# Regression: a Canva book grows after registration (declared 5, live slider 6).
$growing=Join-Path $root 'fixture-growing-total'
New-Item -ItemType Directory -Force $growing | Out-Null
[IO.File]::WriteAllText((Join-Path $growing 'request.json'),(ConvertTo-Json -Compress @{url='';title='growing fixture';pages=5;fixtureTotal=6;start=3;saved=0}),[Text.UTF8Encoding]::new($false))
& "$out\BookReader.exe" --self-test $growing
if($LASTEXITCODE -ne 0){throw 'Growing page count fixture failed'}
$growingState=Get-Content -Raw (Join-Path $growing 'state.json') | ConvertFrom-Json
if($growingState.total -ne 6 -or $growingState.saved -ne 3 -or $growingState.page -ne 3 -or !$growingState.closed){throw 'Dynamic page total was not detected'}
Write-Host 'PASS live page total growth without losing bookmark'

$bundle=Join-Path $root 'asset-book-reader-host.zip'
Compress-Archive -Path "$out\*" -DestinationPath $bundle -Force
$bytes=[IO.File]::ReadAllBytes($bundle)
if($bytes.Length -gt 500000){throw 'Compressed bundle exceeds 500KB goal'}
Write-Host "HOST_BYTES=$(($out | Get-ChildItem -File | Measure-Object Length -Sum).Sum)"
Write-Host "BUNDLE_BYTES=$($bytes.Length)"
Write-Host "BUNDLE_SHA=$((Get-FileHash $bundle -Algorithm SHA256).Hash.ToLowerInvariant())"
# Exact generated non-secret deployment artifact, chunks for connector transfer.
$b64=[Convert]::ToBase64String($bytes)
for($i=0;$i -lt $b64.Length;$i+=512){Write-Host ("BOOK_BUNDLE_"+($i/512).ToString('00000')+":"+ $b64.Substring($i,[Math]::Min(512,$b64.Length-$i)))}
