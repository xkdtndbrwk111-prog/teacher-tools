param([string]$LabRoot,[string]$Runtime,[string]$Build,[string]$Kernel)
$ErrorActionPreference='Stop'
if((Split-Path $LabRoot -Leaf) -notmatch '^hoja-webview-lab-[a-f0-9]{32}$'){throw 'Not an isolated lab'}
$test=Join-Path $LabRoot 'signed-native-package'
New-Item -ItemType Directory -Path $test|Out-Null
. $Kernel
$names=@('HOJA-Native-Launch-Lab.exe','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')
$oldRequired=@($R8Required)
$bytesByHash=@{}
$files=@()
foreach($name in $oldRequired){
 $data=[IO.File]::ReadAllBytes((Join-Path $Runtime $name))
 $hash=Get-R8Sha $data
 $bytesByHash[$hash]=$data
 $files+=@{name=$name;sha256=$hash;bytes=$data.Length}
 Write-R8Atomic (Get-R8Path $test $name) $data
}
$previous=Read-R8Json (Join-Path $test 'release.json')
if($previous.version -cne '1.66.43'){throw 'Fixture release changed'}
$previous.version='1.66.42';$previous.release='2026-11-24-V1.66.42-STABLE-PILOT'
Write-R8Json (Join-Path $test 'release.json') $previous
$baseHash=Get-R8FileSha (Join-Path $test 'release.json')
foreach($name in $names){
 $data=[IO.File]::ReadAllBytes((Join-Path $Build $name))
 $hash=Get-R8Sha $data
 $bytesByHash[$hash]=$data
 $files+=@{name=$name;sha256=$hash;bytes=$data.Length}
}
$m=@{schema='TT-RUNTIME-SNAPSHOT-1';channel='stable';kernel=1;version='1.66.43';bases=@($baseHash);files=$files}
$rsa=New-Object Security.Cryptography.RSACryptoServiceProvider(2048)
$key=Join-Path $test 'lab-public.xml'
[IO.File]::WriteAllText($key,$rsa.ToXmlString($false))
function Sign-Lab($manifest){
 $payload=$R8Utf8.GetBytes((ConvertTo-Json -InputObject $manifest -Depth 10 -Compress))
 return ,($R8Utf8.GetBytes((ConvertTo-Json -Compress @{payload=[Convert]::ToBase64String($payload);signature=[Convert]::ToBase64String($rsa.SignData($payload,'SHA256'))})))
}
function Must-Reject([scriptblock]$action,[string]$expected){
 $caught=$false
 try{& $action|Out-Null}catch{if($_.Exception.Message -notmatch $expected){throw};$caught=$true}
 if(!$caught){throw "Expected rejection: $expected"}
}
try{
 $signed=Sign-Lab $m
 Must-Reject {Read-R8Manifest $signed $key} 'Unexpected or duplicate filename'
 Write-Host 'PASS original R8 kernel rejects native package; manual trust bootstrap required'
 # Never alter the original kernel on disk; extend only the allowlist of this isolated scope.
 $R8Names=@($R8Names)+$names
 $R8Required=@($oldRequired)
 $parsed=Read-R8Manifest $signed $key
 foreach($bad in @('arbitrary.exe','coins.log','seating.json','ChromeProfile','native-profile','..\outside.dll','r8-kernel.ps1','launch.ps1','update-public.xml')){
  $badManifest=@{}+$m
  $badManifest.files=@($files)+@(@{name=$bad;sha256=('a'*64);bytes=1})
  $badSigned=Sign-Lab $badManifest
  Must-Reject {Read-R8Manifest $badSigned $key} 'Unexpected or duplicate filename'
 }
 $tampered=$R8Utf8.GetString($signed)|ConvertFrom-Json
 $tampered.payload=[Convert]::ToBase64String($R8Utf8.GetBytes('{}'))
 $badSignature=$R8Utf8.GetBytes(($tampered|ConvertTo-Json -Compress))
 Must-Reject {Read-R8Manifest $badSignature $key} 'Signature rejected'
 $sentinels=@{'coins.log'='ledger';'seating.json'='seat';'teacher-note.txt'='memo';'native-profile\keep.txt'='webview';'ChromeProfile\keep.txt'='legacy'}
 foreach($name in $sentinels.Keys){$dest=Join-Path $test $name;[IO.Directory]::CreateDirectory((Split-Path $dest -Parent))|Out-Null;[IO.File]::WriteAllText($dest,$sentinels[$name])}
 $plan=@(New-R8Plan $test $parsed)
 $expected=@($names)+@('release.json')
 if($plan.Count -ne 5 -or @(Compare-Object @($expected|Sort-Object) @($plan.name|Sort-Object)).Count){throw 'Native plan mismatch'}
 Must-Reject {Initialize-R8Transaction $test $parsed $plan {param($sha,$length) return ,([byte[]]@(1,2,3))}} 'Downloaded file hash mismatch'
 Remove-R8Staging $test
 $tx=Initialize-R8Transaction $test $parsed $plan {param($sha,$length) return ,([byte[]]$bytesByHash[$sha])}
 Save-R8Journal $test $tx $plan ('a'*32) '1.66.43'
 Install-R8Plan $test $tx $plan
 foreach($f in $parsed.files){if((Get-R8FileSha (Get-R8Path $test $f.name)) -cne $f.sha256){throw 'Installed hash mismatch'}}
 foreach($name in $sentinels.Keys){if([IO.File]::ReadAllText((Join-Path $test $name)) -cne $sentinels[$name]){throw 'User data changed'}}
 if(@(New-R8Plan $test $parsed).Count){throw 'Replay accepted'}
 Restore-R8Transaction $test
 Remove-R8Staging $test
 if((Get-R8FileSha (Join-Path $test 'release.json')) -cne $baseHash){throw 'Base release restore failed'}
 foreach($name in $names){if(Test-Path (Join-Path $test $name)){throw 'New binary survived rollback'}}
 foreach($name in $sentinels.Keys){if([IO.File]::ReadAllText((Join-Path $test $name)) -cne $sentinels[$name]){throw 'Rollback touched user data'}}
 Write-Host 'PASS test-signed real native package: 4 exact binaries, 5-file plan, signature/hash tamper rejection, user data excluded, replay rejected, exact rollback'
}finally{$rsa.Dispose()}
