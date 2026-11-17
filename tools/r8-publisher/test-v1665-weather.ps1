param([string]$Candidate)
$ErrorActionPreference='Stop'
$root=Join-Path $env:RUNNER_TEMP ('r8-weather-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try{
 $m=Get-Content -Raw (Join-Path $Candidate 'payload.json') | ConvertFrom-Json
 foreach($f in $m.files | Where-Object {$_.name -like '*.ps1'}){
  $tokens=$null;$errors=$null
  $null=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $Candidate ('blobs/'+$f.sha256+'.bin')),[ref]$tokens,[ref]$errors)
  if($errors.Count){throw ('Syntax failed: '+$f.name+' '+($errors|Out-String))}
 }
 $f=$m.files|Where-Object {$_.name -ceq 'server.ps1'}
 $scriptText=[IO.File]::ReadAllText((Join-Path $Candidate ('blobs/'+$f.sha256+'.bin')))
 $a=$scriptText.IndexOf('# Weather cache is disposable')
 $b=$scriptText.IndexOf('function Fetch-NeisRows',$a)
 if($a -lt 0 -or $b -le $a){throw 'Weather function block not found'}
 $TTInstallDir=$root
 . ([scriptblock]::Create($scriptText.Substring($a,$b-$a)))
 function Get-TTWeatherPlace {return @{name='Synthetic test location';lat=37.5;lon=127.0}}
 $script:weatherFail=$false;$script:airFail=$false;$script:metFail=$false;$script:metCalls=0
 $t=[DateTimeOffset]::UtcNow
 $local=$t.ToOffset([timespan]::FromHours(9))
 $hour=$local.ToString('yyyy-MM-ddTHH:mm')
 $day=$local.ToString('yyyy-MM-dd')
 $open=@{current=@{temperature_2m=9;weather_code=0};hourly=@{time=@($hour);temperature_2m=@(9);weather_code=@(0)};daily=@{time=@($day);temperature_2m_max=@(11);temperature_2m_min=@(5);weather_code=@(0)}}
 $air=@{current=@{pm10=20;pm2_5=10};hourly=@{time=@($hour);pm10=@(20);pm2_5=@(10)}}
 $met=@{properties=@{timeseries=@(foreach($i in -1..25){@{time=$t.AddHours($i).ToString('o');data=@{instant=@{details=@{air_temperature=8;wind_speed=2}};next_1_hours=@{summary=@{symbol_code='clearsky_day'};details=@{precipitation_amount=0;probability_of_precipitation=0}}}}})}}
 function Get-TTWeatherRemote([string]$url,[string]$modified=''){
  if($url -like 'https://api.met.no/*'){$script:metCalls++;if($script:metFail){throw 'simulated outage'};$d=$met}
  elseif($url -like 'https://air-quality-api.open-meteo.com/*'){if($script:airFail){throw 'simulated outage'};$d=$air}
  elseif($url -like 'https://api.open-meteo.com/*'){if($script:weatherFail){throw 'simulated outage'};$d=$open}
  else{throw 'Unexpected endpoint'}
  return [pscustomobject]@{status=200;data=$d;expires=0;retry=0;modified=''}
 }
 function Assert-True($condition,[string]$message){if(-not $condition){throw $message}}
 $x=Get-TTWeather $false $false|ConvertFrom-Json
 Assert-True ($x.source -eq 'Open-Meteo' -and $x.air.current.pm10 -eq 20 -and $script:metCalls -eq 0) 'Primary/air/no consent failed'
 $script:weatherFail=$true
 $x=Get-TTWeather $true $false|ConvertFrom-Json
 Assert-True ($x.source -eq 'Open-Meteo' -and $x.stale -and $script:metCalls -eq 0) 'Stale/no consent failed'
 $x=Get-TTWeather $true $true|ConvertFrom-Json
 Assert-True ($x.source -eq 'MET Norway' -and $x.weather.current.temperature_2m -eq 8 -and $script:metCalls -eq 1) 'Fallback failed'
 $script:weatherStore=$null
 $x=Get-TTWeather $true $true|ConvertFrom-Json
 Assert-True ($x.source -eq 'MET Norway' -and $script:metCalls -eq 1) 'Restart cache or interval failed'
 $x=Get-TTWeather $true $false|ConvertFrom-Json
 Assert-True ($x.source -eq 'Open-Meteo' -and $x.stale -and $script:metCalls -eq 1) 'Consent revocation failed'
 $script:weatherStore=@{};Remove-Item -LiteralPath $weatherCacheFile -ErrorAction SilentlyContinue
 $x=Get-TTWeather $true $false|ConvertFrom-Json
 Assert-True ($null -eq $x.weather -and $x.air.current.pm10 -eq 20) 'Independent air failed'
 $script:weatherStore=@{};$script:weatherFail=$false
 $x=Get-TTWeather $true $true|ConvertFrom-Json
 Assert-True ($x.source -eq 'Open-Meteo') 'Return to primary failed'
 Write-Host 'PASS: PowerShell parse all program scripts; primary, no consent, stale, fallback, persisted throttle, consent revocation, independent air, primary recovery (mock providers only).'
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
