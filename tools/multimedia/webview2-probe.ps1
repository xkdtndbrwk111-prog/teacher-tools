$ErrorActionPreference='Stop'
$root=Join-Path $env:RUNNER_TEMP 'tt-wv2-lab'
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
& $csc /nologo /target:exe /platform:x64 "/out:$out\BookProbe.exe" "/reference:$out\Microsoft.Web.WebView2.Core.dll" "/reference:$out\Microsoft.Web.WebView2.WinForms.dll" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll tools/multimedia/webview2-probe.cs
if($LASTEXITCODE -ne 0){throw 'Compilation failed'}
$files=Get-ChildItem $out -File
$files | Select-Object Name,Length | Format-Table
$total=($files|Measure-Object Length -Sum).Sum
Write-Host "HOST_BYTES=$total"
$bundle=Join-Path $root 'host.zip'
Compress-Archive -Path "$out\*" -DestinationPath $bundle -Force
Write-Host "COMPRESSED_BYTES=$((Get-Item $bundle).Length)"
& "$out\BookProbe.exe" --live
if($LASTEXITCODE -ne 0){throw 'Native fixture failed'}
