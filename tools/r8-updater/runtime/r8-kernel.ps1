# Trusted, manually provisioned kernel. Windows PowerShell 5.1. No downloaded script is run before verification.
$R8Utf8=[Text.UTF8Encoding]::new($false,$true)
$R8Feed='https://xkdtndbrwk111-prog.github.io/teacher-tools/stable/runtime-v1/'
$R8MaxFile=16777216
$R8MaxTotal=67108864
$R8Names=@('dashboard.html','release.json','board-launch.ps1','server.ps1','runtime.ps1','privacy-reset.ps1','start-teacher-tools.ps1','stop-teacher-tools.ps1','change-monitor.ps1','disable-autostart.ps1','speaker.ps1','share-input.ps1','board-heartbeat.ps1','open-web.ps1','seating-inbox.html','coins.js','coins-ui.js','school.js','podo.js','update-ui.js','classkit_QR_LICENSE.txt','handmade-paper.png','hoja.ico','presentation-board.js','presentation-board.css','presentation-server.ps1','presentation-assets.zip','museum-sky.webp','museum-cloud-far.webp','museum-cloud-near.webp','museum-sway-spring-base.webp','museum-sway-spring-sheet.png','museum-sway-summer-base.webp','museum-sway-summer-sheet.png','museum-sway-autumn-base.webp','museum-sway-autumn-sheet.png','museum-sway-winter-base.webp','museum-sway-winter-left.png','museum-sway-winter-right.png')
$R8Required=@($R8Names)
function Test-R8Name([string]$Name){
 return (($Name -cin $R8Names) -or ($Name -cmatch '^asset-[a-z0-9][a-z0-9_-]{0,60}\.(png|webp|jpg|ogg|mp3|wav|woff2|zip)$'))
}
function Assert-R8Plain([string]$Path){
 if(Test-Path -LiteralPath $Path){
  $item=Get-Item -LiteralPath $Path -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point rejected.'}
 }
}
function Get-R8Path([string]$Root,[string]$Name){
 if(-not(Test-R8Name $Name)){throw 'File not in program allowlist.'}
 $path=Join-Path $Root $Name;Assert-R8Plain $Root;Assert-R8Plain $path
 if(Test-Path -LiteralPath $path -PathType Container){throw 'Expected file, found directory.'}
 return $path
}
function Get-R8Sha([byte[]]$Bytes){
 $sha=[Security.Cryptography.SHA256]::Create()
 try{return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
}
function Get-R8FileSha([string]$Path){
 if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){return ''}
 return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Write-R8Atomic([string]$Path,[byte[]]$Bytes){
 Assert-R8Plain $Path
 $tmp=$Path+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
 $swap=$tmp+'.bak'
 try{
  $stream=[IO.FileStream]::new($tmp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
  try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  if([IO.File]::Exists($Path)){[IO.File]::Replace($tmp,$Path,$swap)}else{[IO.File]::Move($tmp,$Path)}
 }finally{if([IO.File]::Exists($tmp)){[IO.File]::Delete($tmp)};if([IO.File]::Exists($swap)){[IO.File]::Delete($swap)}}
}
function Write-R8Json([string]$Path,$Value){
 Write-R8Atomic $Path ($R8Utf8.GetBytes((ConvertTo-Json -InputObject $Value -Depth 14 -Compress)))
}
function Read-R8Json([string]$Path,[int]$Max=524288){
 Assert-R8Plain $Path
 if((Get-Item -LiteralPath $Path).Length -gt $Max){throw 'JSON size limit.'}
 return ($R8Utf8.GetString([IO.File]::ReadAllBytes($Path))|ConvertFrom-Json)
}
function Get-R8Remote([string]$Relative,[int]$Limit){
 if($Relative -cnotmatch '^(latest\.json|blobs/[a-f0-9]{64}\.bin)$'){throw 'Unexpected download path.'}
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 $req=[Net.HttpWebRequest]::Create($R8Feed+$Relative);$req.AllowAutoRedirect=$false;$req.Timeout=5000;$req.ReadWriteTimeout=5000;$req.UserAgent='HOJA-Board-R8'
 $req.Headers['Cache-Control']='no-cache'
 $response=$req.GetResponse();$out=[IO.MemoryStream]::new()
 try{
  if([int]$response.StatusCode -ne 200 -or $response.ContentLength -gt $Limit){throw 'Download response rejected.'}
  $watch=[Diagnostics.Stopwatch]::StartNew();$inputStream=$response.GetResponseStream()
  try{
   $buffer=New-Object byte[] 32768
   while(($n=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0){if($watch.Elapsed.TotalSeconds -gt 20 -or $out.Length+$n -gt $Limit){throw 'Download size limit.'};$out.Write($buffer,0,$n)}
   return ,$out.ToArray()
  }finally{$inputStream.Dispose()}
 }finally{$out.Dispose();$response.Dispose()}
}
function Read-R8Manifest([byte[]]$Envelope,[string]$KeyPath){
 if($Envelope.Length -gt 524288){throw 'Envelope too large.'}
 $e=$R8Utf8.GetString($Envelope)|ConvertFrom-Json
 if($e.status -ceq 'unreleased'){return $null}
 $payload=[Convert]::FromBase64String([string]$e.payload);$sig=[Convert]::FromBase64String([string]$e.signature)
 if($payload.Length -gt 262144 -or $sig.Length -ne 256){throw 'Signature size mismatch.'}
 Assert-R8Plain $KeyPath
 $rsa=New-Object Security.Cryptography.RSACryptoServiceProvider
 try{$rsa.FromXmlString([IO.File]::ReadAllText($KeyPath));if($rsa.KeySize -ne 2048 -or -not $rsa.VerifyData($payload,'SHA256',$sig)){throw 'Signature rejected.'}}finally{$rsa.Dispose()}
 $m=$R8Utf8.GetString($payload)|ConvertFrom-Json
 if($m.schema -cne 'TT-RUNTIME-SNAPSHOT-1' -or $m.channel -cne 'stable' -or $m.kernel -ne 1 -or [string]$m.version -cnotmatch '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,4}$'){throw 'Manifest contract mismatch.'}
 if(@($m.bases).Count -lt 1 -or @($m.bases).Count -gt 80){throw 'Base list limit.'}
 foreach($b in $m.bases){if([string]$b -cnotmatch '^[a-f0-9]{64}$'){throw 'Base hash invalid.'}}
 if(@($m.files).Count -lt $R8Required.Count -or @($m.files).Count -gt 128){throw 'File count limit.'}
 $names=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);$total=[long]0
 foreach($f in $m.files){
  if(-not(Test-R8Name ([string]$f.name)) -or -not $names.Add([string]$f.name)){throw 'Unexpected or duplicate filename.'}
  if([string]$f.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $f.bytes -isnot [ValueType] -or [double]$f.bytes -ne [math]::Floor([double]$f.bytes) -or $f.bytes -lt 1 -or $f.bytes -gt $R8MaxFile){throw 'Invalid file metadata.'}
  $total+=[long]$f.bytes
  if($total -gt $R8MaxTotal){throw 'Total size limit.'}
 }
 foreach($n in $R8Required){if(-not $names.Contains($n)){throw 'Required program file missing.'}}
 return $m
}
function New-R8Plan([string]$Root,$Manifest){
 $current=Read-R8Json (Get-R8Path $Root 'release.json')
 if($current.channel -cne 'stable' -or $current.runtimeProtocol -ne 1){throw 'Manual R8 bootstrap installation required.'}
 if([version]$Manifest.version -le [version]$current.version){return @()}
 if((Get-R8FileSha (Get-R8Path $Root 'release.json')) -cnotin @($Manifest.bases)){throw 'Installed release is not an approved base.'}
 $signedNames=@($Manifest.files|ForEach-Object {$_.name})
 foreach($item in @(Get-ChildItem -LiteralPath $Root -File -Force)){if((Test-R8Name $item.Name) -and $item.Name -cnotin $signedNames){throw 'Program file removal requires manual migration.'}}
 $plan=@()
 foreach($f in $Manifest.files){
  $before=Get-R8FileSha (Get-R8Path $Root $f.name)
  if($before -cne $f.sha256){$plan+=@{name=[string]$f.name;before=$before;after=[string]$f.sha256;bytes=[int]$f.bytes}}
 }
 if(-not @($plan|Where-Object {$_.name -ceq 'release.json'}).Count){throw 'New release metadata missing.'}
 return $plan
}
function Initialize-R8Transaction([string]$Root,$Manifest,$Plan,[scriptblock]$Download){
 $tx=Join-Path $Root 'r8-transaction';Assert-R8Plain $tx
 if(Test-Path -LiteralPath $tx){throw 'Previous transaction must be cleared first.'}
 New-Item -ItemType Directory -Path $tx|Out-Null
 foreach($sub in @('new','old')){New-Item -ItemType Directory -Path (Join-Path $tx $sub)|Out-Null}
 foreach($f in $Plan){
  [byte[]]$bytes=& $Download ([string]$f.after) ([int]$f.bytes)
  if($bytes.Length -ne $f.bytes -or (Get-R8Sha $bytes) -cne $f.after){throw 'Downloaded file hash mismatch.'}
  Write-R8Atomic (Get-R8Path (Join-Path $tx 'new') $f.name) $bytes
 }
 $release=Read-R8Json (Get-R8Path (Join-Path $tx 'new') 'release.json')
 if($release.version -cne $Manifest.version -or $release.channel -cne 'stable' -or $release.runtimeProtocol -ne 1 -or $release.updateMode -cne 'auto-pilot' -or [string]$release.release -cnotmatch ('^\d{4}-\d{2}-\d{2}-V'+[regex]::Escape([string]$Manifest.version)+'-STABLE-PILOT$')){throw 'Target release metadata mismatch.'}
 return $tx
}
function Save-R8Journal([string]$Root,[string]$Tx,$Plan,[string]$Token,[string]$Version){
 # All rollback bytes are verified and flushed before the durable pending record.
 foreach($f in $Plan){
  $src=Get-R8Path $Root $f.name
  if((Get-R8FileSha $src) -cne $f.before){throw 'Installed files changed during download.'}
  if($f.before){
   $bytes=[IO.File]::ReadAllBytes($src)
   if((Get-R8Sha $bytes) -cne $f.before){throw 'Backup hash mismatch.'}
   Write-R8Atomic (Get-R8Path (Join-Path $Tx 'old') $f.name) $bytes
  }
 }
 Write-R8Json (Join-Path $Tx 'pending.json') @{schema=1;token=$Token;version=$Version;files=@($Plan)}
}
function Install-R8Plan([string]$Root,[string]$Tx,$Plan){
 foreach($f in $Plan){
  $bytes=[IO.File]::ReadAllBytes((Get-R8Path (Join-Path $Tx 'new') $f.name))
  if((Get-R8Sha $bytes) -cne $f.after){throw 'Staged file changed.'}
  Write-R8Atomic (Get-R8Path $Root $f.name) $bytes
 }
 foreach($f in $Plan){if((Get-R8FileSha (Get-R8Path $Root $f.name)) -cne $f.after){throw 'Installed verification failed.'}}
}
function Read-R8Journal([string]$Root){
 $tx=Join-Path $Root 'r8-transaction';Assert-R8Plain $tx
 $pending=Join-Path $tx 'pending.json'
 if(-not(Test-Path -LiteralPath $pending -PathType Leaf)){return $null}
 $j=Read-R8Json $pending
 if($j.schema -ne 1 -or $j.token -cnotmatch '^[a-f0-9]{32}$' -or @($j.files).Count -lt 1 -or @($j.files).Count -gt 128){throw 'Recovery record is invalid.'}
 $names=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
 foreach($f in $j.files){
  $null=Get-R8Path $Root $f.name
  if(-not $names.Add([string]$f.name) -or ([string]$f.before -and $f.before -cnotmatch '^[a-f0-9]{64}$') -or $f.after -cnotmatch '^[a-f0-9]{64}$'){throw 'Recovery file record invalid.'}
  if($f.before -and (Get-R8FileSha (Get-R8Path (Join-Path $tx 'old') $f.name)) -cne $f.before){throw 'Recovery backup missing or corrupted; no files changed.'}
 }
 return $j
}
function Restore-R8Transaction([string]$Root){
 $tx=Join-Path $Root 'r8-transaction';$j=Read-R8Journal $Root
 if($null -eq $j){return}
 # Prevalidated entire backup set; repeating this after interruption is safe.
 foreach($f in $j.files){
  $dest=Get-R8Path $Root $f.name
  if($f.before){Write-R8Atomic $dest ([IO.File]::ReadAllBytes((Get-R8Path (Join-Path $tx 'old') $f.name)))}
  elseif([IO.File]::Exists($dest)){[IO.File]::Delete($dest)}
 }
 foreach($f in $j.files){if((Get-R8FileSha (Get-R8Path $Root $f.name)) -cne [string]$f.before){throw 'Rollback verification failed.'}}
 [IO.File]::Delete((Join-Path $tx 'pending.json'))
}
function Remove-R8Staging([string]$Root){
 $tx=Join-Path $Root 'r8-transaction';Assert-R8Plain $tx
 if(Test-Path -LiteralPath (Join-Path $tx 'pending.json')){throw 'Cannot remove an unfinished transaction.'}
 if(Test-Path -LiteralPath $tx){
  foreach($item in @(Get-ChildItem -LiteralPath $tx -Force -Recurse)){Assert-R8Plain $item.FullName}
  Remove-Item -LiteralPath $tx -Recurse -Force
 }
}
function Write-R8State([string]$Root,[string]$State,[string]$Message,[string]$Latest=''){
 try{Write-R8Json (Join-Path $Root 'update-state.json') @{status=$State;message=$Message;latest=$Latest;checkedAt=[datetime]::UtcNow.ToString('o');notes=@()}}catch{}
}
