# Local transient presentation protocol. No student data on disk or in the receipt API.
$script:ttPresent=$null
$script:ttPresentLastBoard=[datetime]::MinValue
$script:ttPresentReceipt=@{}
function Get-TTPresentReady {
 return (([datetime]::UtcNow-$script:ttPresentLastBoard).TotalSeconds -lt 5 -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'presentation\seating\index.html') -PathType Leaf))
}
function Set-TTPresentReceipt([string]$Id,[string]$State){
 if($Id -notmatch '^[a-f0-9]{32}$'){return}
 $script:ttPresentReceipt[$Id]=@{state=$State;time=[datetime]::UtcNow}
 foreach($key in @($script:ttPresentReceipt.Keys)){if(([datetime]::UtcNow-$script:ttPresentReceipt[$key].time).TotalMinutes -gt 5){$script:ttPresentReceipt.Remove($key)}}
 if($script:ttPresentReceipt.Count -gt 64){$old=@($script:ttPresentReceipt.GetEnumerator()|Sort-Object {$_.Value.time}|Select-Object -First ($script:ttPresentReceipt.Count-64));foreach($x in $old){$script:ttPresentReceipt.Remove($x.Key)}}
}
function Clear-TTPresent([string]$State){
 if($null -ne $script:ttPresent){Set-TTPresentReceipt $script:ttPresent.id $State;$script:ttPresent=$null}
}
function Expire-TTPresent {
 if($null -ne $script:ttPresent -and (([datetime]::UtcNow -gt $script:ttPresent.until) -or -not (Get-TTPresentReady))){Clear-TTPresent 'expired'}
}
# Return only primitive response values to the loopback HTTP handler.
function Invoke-TTPresent([string]$Path,[string]$Method,[bool]$LocalHost,[bool]$Manager,[bool]$Board,[string]$Text,[uri]$Uri){
 $bad=@{status='400 Bad Request';body='{"error":"invalid presentation"}'}
 $denied=@{status='403 Forbidden';body='{"error":"forbidden"}'}
 if(-not $LocalHost){return $denied}
 if($Path -in @('/api/presentation/send','/api/presentation/receipt','/api/presentation/close')){
  if(-not $Manager){return $denied}
  Expire-TTPresent
  if($Method -eq 'OPTIONS'){return @{status='204 No Content';body=''}}
  if($Path -eq '/api/presentation/receipt'){
   if($Method -ne 'GET' -or $Uri.Query -notmatch '^\?id=([a-f0-9]{32})$'){return $bad}
   $id=$Matches[1];$entry=$script:ttPresentReceipt[$id]
   $state=if($null -ne $entry){$entry.state}else{'expired'}
   return @{status='200 OK';body=(ConvertTo-Json -Compress @{state=$state})}
  }
  if($Method -ne 'POST'){return $bad}
  if($Path -eq '/api/presentation/close'){
   if($Text -notmatch '^[a-f0-9]{32}$'){return $bad}
   if($null -ne $script:ttPresent -and $script:ttPresent.id -eq $Text){Clear-TTPresent 'closed'}
   return @{status='200 OK';body='{"ok":true}'}
  }
  if(-not (Get-TTPresentReady)){return @{status='409 Conflict';body='{"error":"board unavailable"}'}}
  try{
   if($Text.Length -gt 240000){return $bad}
   $decoded=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Text))
   $item=ConvertFrom-Json $decoded
   if($item.id -notmatch '^[a-f0-9]{32}$' -or $item.kind -notin @('seating','pe','life-qr') -or $null -eq $item.payload){return $bad}
   if(@($item.PSObject.Properties.Name|Where-Object {$_ -notin @('id','kind','payload')}).Count -ne 0){return $bad}
   # Only the offline renderer gets the payload, and it validates every visible field.
   if($null -ne $script:ttPresentReceipt[$item.id]){return @{status='409 Conflict';body='{"error":"duplicate"}'}}
   Clear-TTPresent 'superseded'
   $script:ttPresent=@{id=[string]$item.id;data=@{kind=$item.kind;payload=$item.payload};until=[datetime]::UtcNow.AddSeconds(35)}
   Set-TTPresentReceipt $item.id 'pending'
   return @{status='200 OK';body=(ConvertTo-Json -Compress @{id=$item.id})}
  }catch{return $bad}
 }
 if(-not $Board){return $denied}
 if($Path -eq '/api/presentation/poll' -and $Method -eq 'GET'){
  # A live board, not merely a running server, is required for discovery.
  Expire-TTPresent
  $script:ttPresentLastBoard=[datetime]::UtcNow
  if($null -eq $script:ttPresent){return @{status='200 OK';body='{"id":null}'}}
  return @{status='200 OK';body=(ConvertTo-Json -Depth 22 -Compress @{id=$script:ttPresent.id;data=$script:ttPresent.data})}
 }
 if($Path -eq '/api/presentation/ack' -and $Method -eq 'POST'){
  if($Text -notmatch '^([a-f0-9]{32}):(displayed|failed|closed)$'){return $bad}
  $id=$Matches[1];$state=$Matches[2]
  if($null -eq $script:ttPresent -or $script:ttPresent.id -ne $id){return @{status='409 Conflict';body='{"error":"stale"}'}}
  if($state -eq 'displayed'){$script:ttPresent.until=[datetime]::UtcNow.AddMinutes(90);Set-TTPresentReceipt $id $state}else{Clear-TTPresent $state}
  return @{status='200 OK';body='{"ok":true}'}
 }
 return $bad
}
