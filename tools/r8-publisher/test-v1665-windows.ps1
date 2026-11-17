param([Parameter(Mandatory=$true)][string]$Kernel,[Parameter(Mandatory=$true)][string]$Seed,[Parameter(Mandatory=$true)][string]$Candidate)
$ErrorActionPreference='Stop'
. $Kernel
$root=Join-Path $env:RUNNER_TEMP 'r8-real-files'
New-Item -ItemType Directory -Path $root | Out-Null
$base=Get-Content -Raw (Join-Path $Seed 'payload.json') | ConvertFrom-Json
$target=Get-Content -Raw (Join-Path $Candidate 'payload.json') | ConvertFrom-Json
foreach($f in $base.files){
 $bytes=[IO.File]::ReadAllBytes((Join-Path $Seed ('blobs/'+$f.sha256+'.bin')))
 if((Get-R8Sha $bytes) -cne $f.sha256){throw 'Base blob mismatch'}
 Write-R8Atomic (Get-R8Path $root $f.name) $bytes
}
$sentinels=@{'coins.log'='virtual ledger';'settings.json'='virtual settings';'roster.json'='virtual roster'}
foreach($n in $sentinels.Keys){[IO.File]::WriteAllText((Join-Path $root $n),$sentinels[$n])}
$rsa=New-Object Security.Cryptography.RSACryptoServiceProvider(2048)
try {
 $key=Join-Path $root 'update-public.xml'
 [IO.File]::WriteAllText($key,$rsa.ToXmlString($false))
 $payload=[IO.File]::ReadAllBytes((Join-Path $Candidate 'payload.json'))
 $signature=$rsa.SignData($payload,'SHA256')
 $envelope=$R8Utf8.GetBytes((ConvertTo-Json -Compress @{payload=[Convert]::ToBase64String($payload);signature=[Convert]::ToBase64String($signature)}))
 $m=Read-R8Manifest $envelope $key
 if($m.version -cne '1.66.5'){throw 'Wrong version'}
 $plan=@(New-R8Plan $root $m)
 if($plan.Count -ne 5 -or @('dashboard.html','release.json','server.ps1','podo.js','privacy-reset.ps1' | Where-Object {$_ -cnotin @($plan.name)}).Count){throw 'Unexpected update plan'}
 function Check-Sentinels {foreach($n in $sentinels.Keys){if([IO.File]::ReadAllText((Join-Path $root $n)) -cne $sentinels[$n]){throw ('User data touched: '+$n)}}}
 function Check-Files($files){foreach($f in $files){if((Get-R8FileSha (Get-R8Path $root $f.name)) -cne $f.sha256){throw ('File mismatch: '+$f.name)}}}
 function Fetch-Blob($sha,$length){return ,([IO.File]::ReadAllBytes((Join-Path $Candidate ('blobs/'+$sha+'.bin'))))}
 try {Initialize-R8Transaction $root $m $plan {param($sha,$length) return ,([byte[]]@(1,2,3))}|Out-Null; throw 'Tampered download was accepted'}catch{if($_.Exception.Message -ne 'Downloaded file hash mismatch.'){throw}}
 Remove-R8Staging $root
 Check-Files $base.files
 foreach($cut in 0..$plan.Count){
  $tx=Initialize-R8Transaction $root $m $plan {param($sha,$length) Fetch-Blob $sha $length}
  Save-R8Journal $root $tx $plan ('a'*32) '1.66.5'
  if($cut){Install-R8Plan $root $tx @($plan[0..($cut-1)])}
  Restore-R8Transaction $root;Remove-R8Staging $root
  Check-Files $base.files;Check-Sentinels
 }
 $tx=Initialize-R8Transaction $root $m $plan {param($sha,$length) Fetch-Blob $sha $length}
 Save-R8Journal $root $tx $plan ('b'*32) '1.66.5'
 Install-R8Plan $root $tx $plan
 Check-Files $target.files;Check-Sentinels
 if(@(New-R8Plan $root $m).Count){throw 'Replay was not ignored'}
 Restore-R8Transaction $root;Remove-R8Staging $root
 Check-Files $base.files;Check-Sentinels
 Write-Host 'PASS: actual 39-file 1.66.3 to 1.66.5 inventory, exact five-file plan, tamper rejection, all six interruption boundaries, complete rollback, replay rejection, virtual data preservation. Ephemeral key/local blobs only; no actual board launch or production feed.'
}finally{$rsa.Dispose();Remove-Item -LiteralPath $root -Recurse -Force}
