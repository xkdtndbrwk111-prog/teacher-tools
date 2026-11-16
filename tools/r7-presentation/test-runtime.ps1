param([string]$SystemDir)
$ErrorActionPreference='Stop'
$scriptPath=Join-Path $SystemDir 'presentation-server.ps1'
$tokens=$null;$errors=$null
[void][System.Management.Automation.Language.Parser]::ParseFile($scriptPath,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
. $scriptPath
function Assert-Present($condition,[string]$message){if(-not $condition){throw $message}}
$origin=[uri]'http://localhost/api/presentation/poll'
$id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';$id2='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
$payload=@{id=$id;kind='seating';payload=@{students=@(@{id='v1';name='virtual'});layout=@{rows=2};assignments=@()}}
$encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Depth 8 -Compress $payload)))
Assert-Present ((Invoke-TTPresent '/api/presentation/send' 'POST' $true $true $false $encoded $origin).status -eq '409 Conflict') 'unavailable'
Assert-Present ((Invoke-TTPresent '/api/presentation/poll' 'GET' $true $true $false '' $origin).status -eq '403 Forbidden') 'manager cannot read data'
Assert-Present ((Invoke-TTPresent '/api/presentation/poll' 'GET' $true $false $true '' $origin).status -eq '200 OK') 'heartbeat'
Assert-Present (Get-TTPresentReady) 'capability'
Assert-Present ((Invoke-TTPresent '/api/presentation/send' 'POST' $false $true $false $encoded $origin).status -eq '403 Forbidden') 'reject nonlocal Host'
Assert-Present ((Invoke-TTPresent '/api/presentation/send' 'POST' $true $false $false $encoded $origin).status -eq '403 Forbidden') 'reject unknown origin'
Assert-Present ((Invoke-TTPresent '/api/presentation/send' 'POST' $true $true $false $encoded $origin).status -eq '200 OK') 'send'
$poll=ConvertFrom-Json ((Invoke-TTPresent '/api/presentation/poll' 'GET' $true $false $true '' $origin).body)
Assert-Present ($poll.id -eq $id -and $poll.data.payload.students[0].name -eq 'virtual') 'payload'
Assert-Present ((Invoke-TTPresent '/api/presentation/ack' 'POST' $true $false $true "${id}:displayed" $origin).status -eq '200 OK') 'ack'
$receipt=[uri]("http://localhost/api/presentation/receipt?id="+$id)
Assert-Present ((ConvertFrom-Json ((Invoke-TTPresent '/api/presentation/receipt' 'GET' $true $true $false '' $receipt).body)).state -eq 'displayed') 'receipt'
Assert-Present ((Invoke-TTPresent '/api/presentation/send' 'POST' $true $true $false $encoded $origin).status -eq '409 Conflict') 'duplicate'
Assert-Present ((Invoke-TTPresent '/api/presentation/close' 'POST' $true $true $false $id2 $origin).status -eq '200 OK') 'stale close'
Assert-Present ($script:ttPresent.id -eq $id) 'stale close ignored'
Assert-Present ((Invoke-TTPresent '/api/presentation/close' 'POST' $true $true $false $id $origin).status -eq '200 OK') 'close'
Assert-Present ($null -eq $script:ttPresent) 'data removed'
Write-Host 'presentation runtime 15 assertions PASS'
