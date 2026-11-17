param([string]$Server)
$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($Server,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
$root=Join-Path $env:RUNNER_TEMP ('weather-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $root|Out-Null
$TTInstallDir=$root;$weatherCacheFile=Join-Path $root 'weather-cache.json';$script:weatherStore=$null
$names=@('Get-TTWeatherStore','Save-TTWeatherStore','Convert-TTMetCode','Convert-TTMetForecast','Test-TTForecast','Test-TTAir','Get-TTWeather')
foreach($name in $names){
 $node=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)|Where-Object {$_.Name -ceq $name})
 if($node.Count -ne 1){throw ('Expected one '+$name)}
 . ([scriptblock]::Create($node[0].Extent.Text))
}
function Get-TTWeatherPlace {return @{name='Synthetic place';lat=37.5;lon=127.0}}
$script:mode='primary';$script:calls=@()
$now=[DateTimeOffset]::UtcNow
$day=$now.ToOffset([timespan]::FromHours(9)).ToString('yyyy-MM-dd')
$hour=$now.ToOffset([timespan]::FromHours(9)).ToString('yyyy-MM-ddTHH:00')
$forecast=[pscustomobject]@{current=@{temperature_2m=12;weather_code=1};daily=@{time=@($day);temperature_2m_max=@(16);temperature_2m_min=@(8);weather_code=@(1)};hourly=@{time=@($hour);temperature_2m=@(12);weather_code=@(1)}}
$air=[pscustomobject]@{current=@{pm10=21;pm2_5=9};hourly=@{time=@($hour);pm10=@(21);pm2_5=@(9)}}
$met=[pscustomobject]@{properties=@{timeseries=@(foreach($i in -1..6){@{time=$now.AddHours($i).ToString('o');data=@{instant=@{details=@{air_temperature=11+$i;wind_speed=1.5}};next_1_hours=@{summary=@{symbol_code='fair_day'};details=@{probability_of_precipitation=10;precipitation_amount=0}};next_6_hours=@{details=@{}}}}})}}
function Get-TTWeatherRemote([string]$url,[string]$modified=''){
 $script:calls+= $url
 if($url -like 'https://air-quality-api.open-meteo.com/*'){if($script:mode -eq 'allfail'){throw 'mock air failure'};return @{status=200;data=$air;retry=0}}
 if($url -like 'https://api.open-meteo.com/*'){if($script:mode -eq 'primary'){return @{status=200;data=$forecast;retry=0}};throw 'mock primary failure'}
 if($url -like 'https://api.met.no/*'){if($script:mode -eq 'allfail'){throw 'mock MET failure'};return @{status=200;data=$met;expires=0;retry=0;modified=''}}
 throw 'Unexpected provider'
}
function Check($condition,[string]$message){if(-not $condition){throw $message};Write-Host ('PASS: '+$message)}
try {
 $a=Get-TTWeather $true $false|ConvertFrom-Json
 Check ($a.source -eq 'Open-Meteo' -and $a.air.current.pm10 -eq 21) 'default primary and independent air quality'
 $script:mode='fallback';$script:calls=@()
 $a=Get-TTWeather $true $false|ConvertFrom-Json
 Check ($a.source -eq 'Open-Meteo' -and $a.stale -and -not @($script:calls|Where-Object {$_ -like 'https://api.met.no/*'}).Count) 'no MET without consent; cached primary marked stale'
 $probe=Convert-TTMetForecast $met ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds());Check ($probe.current.temperature_2m -ne $null) 'MET converter direct sample'
 $persist=Save-TTWeatherStore;Write-Host ('Persistent cache repeated write: '+$persist)
 $a=Get-TTWeather $true $true|ConvertFrom-Json
 Write-Host ('Fallback diagnostic: source='+$a.source+' calls='+($script:calls -join ',')+' store='+((Get-TTWeatherStore)|ConvertTo-Json -Compress -Depth 3))
 Check ($a.source -eq 'MET Norway' -and $a.weather.current.temperature_2m -ne $null) 'consent enables failover'
 $script:calls=@();$script:weatherStore=$null
 $a=Get-TTWeather $true $true|ConvertFrom-Json
 Check ($a.source -eq 'MET Norway' -and -not @($script:calls|Where-Object {$_ -like 'https://api.met.no/*'}).Count) 'restart preserves three-hour fallback request floor'
 $a=Get-TTWeather $false $false|ConvertFrom-Json
 Check ($a.source -ne 'MET Norway') 'revoking consent disables cached MET'
 $script:mode='primary';$store=Get-TTWeatherStore;foreach($key in @($store.Keys)){$store[$key].primaryNext=0}
 $a=Get-TTWeather $true $true|ConvertFrom-Json
 Check ($a.source -eq 'Open-Meteo' -and -not $a.stale) 'return to primary provider'
 Write-Host 'Weather backend synthetic provider tests PASS; no external weather requests.'
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
