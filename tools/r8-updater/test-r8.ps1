$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runtime\r8-kernel.ps1')
$root=Join-Path ([IO.Path]::GetTempPath()) ('tt-r8-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root|Out-Null
$script:n=0
function Check($condition,[string]$message){if(-not $condition){throw $message};$script:n++}
function Reject([scriptblock]$run,[string]$message){$ok=$false;try{& $run|Out-Null}catch{$ok=$true};Check $ok $message}
function Bytes([string]$s){return ,$R8Utf8.GetBytes($s)}
try {
 $rsa=New-Object Security.Cryptography.RSACryptoServiceProvider(2048)
 $key=Join-Path $root 'update-public.xml';[IO.File]::WriteAllText($key,$rsa.ToXmlString($false))
 $oldRelease=Bytes '{"version":"1.70.0","release":"2026-11-17-V1.70.0-STABLE-PILOT","channel":"stable","runtimeProtocol":1,"updateMode":"auto-pilot"}'
 $newRelease=Bytes '{"version":"1.70.1","release":"2026-11-17-V1.70.1-STABLE-PILOT","channel":"stable","runtimeProtocol":1,"updateMode":"auto-pilot"}'
 $content=@{}
 foreach($name in $R8Required){$b=if($name -eq 'release.json'){$oldRelease}else{Bytes ('old-'+$name)};Write-R8Atomic (Get-R8Path $root $name) $b;$content[$name]=$b}
 $sentinel=Join-Path $root 'coins.log';[IO.File]::WriteAllText($sentinel,'virtual ledger')
 $content['release.json']=$newRelease;$content['dashboard.html']=Bytes 'new dashboard';$content['server.ps1']=Bytes 'new server';$content['asset-test.png']=Bytes 'image'
 $files=@(foreach($k in $content.Keys){@{name=$k;bytes=$content[$k].Length;sha256=(Get-R8Sha $content[$k])}})
 $manifest=@{schema='TT-RUNTIME-SNAPSHOT-1';channel='stable';kernel=1;version='1.70.1';bases=@((Get-R8Sha $oldRelease));files=$files}
 function Sign($m){$p=Bytes (ConvertTo-Json -Depth 12 -Compress $m);return ,(Bytes (ConvertTo-Json -Compress @{payload=[Convert]::ToBase64String($p);signature=[Convert]::ToBase64String($rsa.SignData($p,'SHA256'))}))}
 $raw=Sign $manifest;$m=Read-R8Manifest $raw $key
 Check ($m.version -eq '1.70.1') 'valid signed manifest'
 $bad=Read-R8Json (Join-Path $root 'release.json')
 $tampered=$R8Utf8.GetString($raw)|ConvertFrom-Json;$tampered.signature=[Convert]::ToBase64String((New-Object byte[] 256))
 Reject {Read-R8Manifest (Bytes (ConvertTo-Json -Compress $tampered)) $key} 'forged signature accepted'
 foreach($n in @('../coins.log','coins.log','update-public.xml','launch.ps1','r8-kernel.ps1','ChromeProfile','asset-a.png:stream','SERVER.PS1')){Check (-not(Test-R8Name $n)) ('private or unsafe accepted: '+$n)}
 $badManifest=@{}+$manifest;$badManifest.files=@($files)+@($files[0]);Reject {Read-R8Manifest (Sign $badManifest) $key} 'duplicate accepted'
 $badManifest=@{}+$manifest;$badManifest.bases=@(('f'*64));$wrong=Read-R8Manifest (Sign $badManifest) $key;Reject {New-R8Plan $root $wrong} 'unapproved base accepted'
 $plan=@(New-R8Plan $root $m);Check ($plan.Count -eq 4) 'only changed files selected'
 $lookup=@{};foreach($f in $files){$lookup[$f.sha256]=$content[$f.name]}
 Reject {Initialize-R8Transaction $root $m $plan {param($sha,$length) Bytes 'corrupted'}} 'corruption accepted'
 Check ((Get-R8FileSha (Join-Path $root 'release.json')) -eq (Get-R8Sha $oldRelease)) 'staging altered installed release'
 Remove-R8Staging $root
 $tx=Initialize-R8Transaction $root $m $plan {param($sha,$length) return ,$lookup[$sha]}
 $token='a'*32;Save-R8Journal $root $tx $plan $token '1.70.1'
 # Simulate interrupted sequence after the first file.
 Install-R8Plan $root $tx @($plan[0])
 Check ($null -ne (Read-R8Journal $root)) 'journal missing'
 Restore-R8Transaction $root
 Check ((Get-R8FileSha (Join-Path $root 'release.json')) -eq (Get-R8Sha $oldRelease)) 'rollback release'
 Check (-not(Test-Path (Join-Path $root 'asset-test.png'))) 'rollback added file'
 Check ([IO.File]::ReadAllText($sentinel) -eq 'virtual ledger') 'ledger changed'
 Remove-R8Staging $root
 $tx=Initialize-R8Transaction $root $m $plan {param($sha,$length) return ,$lookup[$sha]}
 Save-R8Journal $root $tx $plan $token '1.70.1';Install-R8Plan $root $tx $plan
 Check ((Get-R8FileSha (Join-Path $root 'server.ps1')) -eq (Get-R8Sha $content['server.ps1'])) 'runtime install'
 Check ((Get-R8FileSha (Join-Path $root 'asset-test.png')) -eq (Get-R8Sha $content['asset-test.png'])) 'asset install'
 Check (@(New-R8Plan $root $m).Count -eq 0) 'downgrade/replay'
 Restore-R8Transaction $root;Remove-R8Staging $root
 Check ((Get-R8FileSha (Join-Path $root 'server.ps1')) -eq (Get-R8Sha (Bytes 'old-server.ps1'))) 'runtime rollback'
 Check ([IO.File]::ReadAllText($sentinel) -eq 'virtual ledger') 'sentinel after rollback'
 Write-Host "R8 signed runtime fixture: $script:n assertions PASS"
}finally{if($rsa){$rsa.Dispose()};Remove-Item -LiteralPath $root -Recurse -Force}
