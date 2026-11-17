param([int]$Port=17439)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runtime.ps1')
. (Join-Path $PSScriptRoot 'presentation-server.ps1')
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$sheetTemplate='1-vejhJz909ivFnhzNRkpbd31BSJsElEPzXUYkONdJRQ'
$schoolFile=Join-Path $TTInstallDir 'school.json'
$weatherPlaceFile=Join-Path $TTInstallDir 'weather-place.json'
$script:weatherCache=$null
$script:fontList=$null
$script:school=$null
$script:privacyResetToken=[guid]::NewGuid().ToString('N')
$script:backupRestoreToken=[guid]::NewGuid().ToString('N')
$script:updateApproveToken=[guid]::NewGuid().ToString('N')
if(Test-Path -LiteralPath $schoolFile -PathType Leaf){try{$script:school=ConvertFrom-Json ([IO.File]::ReadAllText($schoolFile,[Text.Encoding]::UTF8))}catch{$script:school=$null}}
$script:timetableCache=@{}
function RemoteText([string]$url) {
  $req=[System.Net.WebRequest]::Create($url); $req.Method='GET'; $req.Timeout=9000; $req.ReadWriteTimeout=9000; $req.UserAgent='Mozilla/5.0'
  $res=$req.GetResponse(); try { $stream=$res.GetResponseStream(); try { $reader=New-Object System.IO.StreamReader($stream,[Text.Encoding]::UTF8); try { return $reader.ReadToEnd() } finally { $reader.Dispose() } } finally {$stream.Dispose()} } finally {$res.Dispose()}
}
function Get-WeekReference([datetime]$Today) {
  $d=$Today.Date
  if($d.DayOfWeek -eq [DayOfWeek]::Saturday){return $d.AddDays(2)}
  if($d.DayOfWeek -eq [DayOfWeek]::Sunday){return $d.AddDays(1)}
  return $d
}
function Select-WeekTab($Tabs,[datetime]$Today) {
  $reference=Get-WeekReference $Today
  $found=@(foreach($tab in $Tabs){
    if($tab.title -notmatch '(?<sm>\d{1,2})\.(?<sd>\d{1,2})\s*~\s*(?<em>\d{1,2})\.(?<ed>\d{1,2})'){continue}
    $sm=[int]$Matches.sm;$sd=[int]$Matches.sd;$em=[int]$Matches.em;$ed=[int]$Matches.ed
    foreach($year in @(($reference.Year-1),$reference.Year)){
      try{$start=[datetime]::new($year,$sm,$sd);$endYear=$year;if($em -lt $sm){$endYear++};$end=[datetime]::new($endYear,$em,$ed)}catch{continue}
      if($reference -ge $start -and $reference -le $end){$tab;break}
    }
  })
  if($found.Count -eq 0){throw ('No weekly sheet includes '+$reference.ToString('yyyy-MM-dd'))}
  if($found.Count -ne 1){throw ('Multiple weekly sheets include '+$reference.ToString('yyyy-MM-dd'))}
  return $found[0]
}

# Without an API key NEIS answers with the first 5 rows, so a day of 6 or 7 lessons takes extra calls by period.
function TimetableData {
  if(-not $script:school -or -not $script:school.cls){throw 'NEIS_NO_CLASS'}
  $today=[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([datetime]::UtcNow,'Korea Standard Time').Date
  $reference=Get-WeekReference $today
  $monday=$reference.AddDays(1-[int]$reference.DayOfWeek)
  $endpoint=switch([string]$script:school.kind){'중학교'{'misTimetable'}'고등학교'{'hisTimetable'}default{'elsTimetable'}}
  $year=if($monday.Month -lt 3){$monday.Year-1}else{$monday.Year}
  $base="AY=$year&GRADE=$($script:school.grade)&CLASS_NM=$([uri]::EscapeDataString([string]$script:school.cls))"
  $cached=$script:timetableCache[$monday.ToString('yyyyMMdd')]
  if($cached -and $cached.until -gt [datetime]::UtcNow){$slots=$cached.slots}
  else{
   $slots=@{}
   for($day=0;$day -lt 5;$day++){
    $ymd=$monday.AddDays($day).ToString('yyyyMMdd')
    $answer=Fetch-NeisTable $endpoint "$base&ALL_TI_YMD=$ymd"
    $rows=@($answer.rows)
    for($period=1;$period -le 8 -and $rows.Count -lt $answer.total;$period++){
     if(@($rows | Where-Object {[int]$_.PERIO -eq $period}).Count -eq 0){$rows+=@((Fetch-NeisTable $endpoint "$base&ALL_TI_YMD=$ymd&PERIO=$period").rows)}
    }
    foreach($row in $rows){
     $period=[int]$row.PERIO
     if(-not $slots.ContainsKey($period)){$slots[$period]=@('','','','','')}
     $slots[$period][$day]=([string]$row.ITRT_CNTNT).Trim()
    }
   }
   $script:timetableCache[$monday.ToString('yyyyMMdd')]=@{slots=$slots;until=[datetime]::UtcNow.AddHours(1)}
  }
  if($slots.Count -eq 0){throw 'NEIS_NO_TIMETABLE'}
  $lessons=@(foreach($period in ($slots.Keys | Sort-Object)){[pscustomobject]@{label="$($period)교시";cells=$slots[$period];notices=@('','','','','')}})
  $dates=@(for($day=0;$day -lt 5;$day++){$d=$monday.AddDays($day);"$($d.Month)/$($d.Day)"})
  return [pscustomobject]@{title='나이스 기본 시간표';dates=$dates;rows=$lessons;events=@('','','','','');referenceDate=$reference.ToString('yyyy-MM-dd');selection=if($today -ne $reference){'next-week'}else{'today'}}
}
function WeekData {
  if(-not $script:school -or -not $script:school.sheet){return TimetableData}
  $sheet=[string]$script:school.sheet
  $today=[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([datetime]::UtcNow,'Korea Standard Time').Date
  $reference=Get-WeekReference $today
  $page=RemoteText "https://docs.google.com/spreadsheets/d/$sheet/htmlview"
  $pattern='items\.push\(\{name:\s*("(?:\\.|[^"\\])*"),\s*pageUrl:[\s\S]*?gid:\s*"(\d+)"'
  $matches=[regex]::Matches($page,$pattern)
  $tabs=@(foreach($m in $matches){ $title=ConvertFrom-Json $m.Groups[1].Value; if ($title -match '주(?:차)?\s*\(') { [pscustomobject]@{ title=$title; gid=$m.Groups[2].Value } } })
  if ($tabs.Count -eq 0) { throw 'Weekly sheet is not publicly accessible or no weekly tab was found.' }
  $tab=Select-WeekTab $tabs $today;$raw=RemoteText "https://docs.google.com/spreadsheets/d/$sheet/gviz/tq?tqx=out:json&headers=0&gid=$($tab.gid)&range=A1:F30"
  $begin=$raw.IndexOf('{');$end=$raw.LastIndexOf('}');if($begin -lt 0 -or $end -le $begin){throw 'Invalid sheet response.'}
  $json=ConvertFrom-Json ($raw.Substring($begin,$end-$begin+1));if($json.status -ne 'ok'){throw 'Cannot read sheet.'}
  $rows=@(foreach($row in $json.table.rows){ $cells=@(for($i=0;$i -lt 6;$i++){if($i -lt $row.c.Count -and $null -ne $row.c[$i]) {if($null -ne $row.c[$i].f){[string]$row.c[$i].f}elseif($null -ne $row.c[$i].v){[string]$row.c[$i].v}else{''}}else{''}}); ,$cells })
  $dates=@('','','','','');$events=@('','','','','');$lessons=New-Object System.Collections.Generic.List[object]
  for($r=0;$r -lt $rows.Count;$r++){
    $cells=$rows[$r]
    if (@($cells[1..5] | Where-Object { $_ -match '^\d{1,2}/\d{1,2}$' }).Count -ge 3) { $dates=@($cells[1..5]) }
    if ($r -eq 3) { $events=@($cells[1..5]) } # Sheet row 4 is the daily education activity row. Preserve embedded line breaks.
    if ($cells[0] -match '^([1-7])교시') {
      $label=$Matches[0];$values=@($cells[1..5]);
      $notes=@('','','','','')
      if($r+1 -lt $rows.Count -and -not ([string]$rows[$r+1][0]).Trim()) {
       for($c=0;$c -lt 5;$c++){ $notes[$c]=([string]$rows[$r+1][$c+1]).Trim() }
      }
      $lessons.Add([pscustomobject]@{label=$label;cells=$values;notices=$notes})
    }
  }
  $targetDate=$reference.Month.ToString()+'/'+$reference.Day.ToString()
  if($dates -notcontains $targetDate){throw ('Selected sheet does not contain reference date '+$targetDate)}
  if($rows[0][0] -match '(?<year>20\d{2})' -and [int]$Matches.year -notin @($reference.Year,$(if($reference.Month -lt 3){$reference.Year-1}else{$reference.Year}))){throw 'Weekly sheet year does not match reference year.'}
  if($lessons.Count -eq 0){throw 'Weekly sheet has no recognizable lessons.'}
  return [pscustomobject]@{title=$tab.title;dates=$dates;rows=@($lessons.ToArray());events=$events;referenceDate=$reference.ToString('yyyy-MM-dd');selection=if($today -ne $reference){'next-week'}else{'today'}}
}
function Fetch-NeisTable([string]$endpoint,[string]$query){
 $data=ConvertFrom-Json (RemoteText "https://open.neis.go.kr/hub/${endpoint}?Type=json&pSize=100&ATPT_OFCDC_SC_CODE=$($script:school.office)&SD_SCHUL_CODE=$($script:school.code)&$query")
 if($null -ne $data.RESULT -and $data.RESULT.CODE -ne 'INFO-200') {throw ('NEIS: '+$data.RESULT.MESSAGE)}
 $table=$data.$endpoint
 if($null -eq $table -or $table.Count -lt 2){return [pscustomobject]@{total=0;rows=@()}}
 return [pscustomobject]@{total=[int]$table[0].head[0].list_total_count;rows=@($table[1].row)}
}
function Search-Schools([string]$name,[string]$office){
 $url="https://open.neis.go.kr/hub/schoolInfo?Type=json&pSize=100&SCHUL_NM=$([uri]::EscapeDataString($name))"
 if($office){$url+="&ATPT_OFCDC_SC_CODE=$office"}
 $data=ConvertFrom-Json (RemoteText $url)
 if($null -ne $data.RESULT -and $data.RESULT.CODE -ne 'INFO-200') {throw ('NEIS: '+$data.RESULT.MESSAGE)}
 $table=$data.schoolInfo
 if($null -eq $table -or $table.Count -lt 2){return [pscustomobject]@{total=0;rows=@()}}
 $rows=@(foreach($row in $table[1].row){[pscustomobject]@{office=[string]$row.ATPT_OFCDC_SC_CODE;code=[string]$row.SD_SCHUL_CODE;name=[string]$row.SCHUL_NM;kind=[string]$row.SCHUL_KND_SC_NM;address=[string]$row.ORG_RDNMA}})
 return [pscustomobject]@{total=[int]$table[0].head[0].list_total_count;rows=$rows}
}
# Offline approximate district/city centers: lookup is possible even if a school network blocks online geocoding.
# These are region centers, not exact school coordinates; the weather panel labels them accordingly.
function Get-TTKnownWeatherPlaces {
 $rows=@(
  '서울특별시 종로구|37.5735|126.9790'
  '서울특별시 중구|37.5636|126.9976'
  '서울특별시 용산구|37.5326|126.9906'
  '서울특별시 성동구|37.5633|127.0369'
  '서울특별시 광진구|37.5386|127.0823'
  '서울특별시 동대문구|37.5744|127.0400'
  '서울특별시 중랑구|37.6063|127.0928'
  '서울특별시 성북구|37.5894|127.0167'
  '서울특별시 강북구|37.6396|127.0255'
  '서울특별시 도봉구|37.6688|127.0471'
  '서울특별시 노원구|37.6542|127.0568'
  '서울특별시 은평구|37.6027|126.9292'
  '서울특별시 서대문구|37.5791|126.9368'
  '서울특별시 마포구|37.5665|126.9015'
  '서울특별시 양천구|37.5170|126.8665'
  '서울특별시 강서구|37.5509|126.8495'
  '서울특별시 구로구|37.4954|126.8874'
  '서울특별시 금천구|37.4569|126.8955'
  '서울특별시 영등포구|37.5264|126.8962'
  '서울특별시 동작구|37.5124|126.9395'
  '서울특별시 관악구|37.4780|126.9515'
  '서울특별시 서초구|37.4837|127.0324'
  '서울특별시 강남구|37.5172|127.0473'
  '서울특별시 송파구|37.5146|127.1059'
  '서울특별시 강동구|37.5301|127.1238'
  '부산광역시|35.1796|129.0756'
  '대구광역시|35.8714|128.6014'
  '인천광역시|37.4563|126.7052'
  '광주광역시|35.1595|126.8526'
  '대전광역시|36.3504|127.3845'
  '울산광역시|35.5384|129.3114'
  '세종특별자치시|36.4800|127.2890'
  '경기도 수원시|37.2636|127.0286'
  '경기도 성남시|37.4200|127.1265'
  '경기도 고양시|37.6584|126.8320'
  '경기도 용인시|37.2411|127.1776'
  '경기도 화성시|37.1995|126.8312'
  '경기도 안양시|37.3943|126.9568'
  '경기도 안산시|37.3219|126.8309'
  '경기도 부천시|37.5034|126.7660'
  '경기도 광명시|37.4780|126.8640'
  '경기도 남양주시|37.6360|127.2165'
  '경기도 김포시|37.6152|126.7156'
  '경기도 의정부시|37.7381|127.0337'
  '경기도 파주시|37.7603|126.7799'
  '경기도 평택시|36.9920|127.0850'
  '경기도 시흥시|37.3800|126.8030'
  '충청남도 공주시|36.4465|127.1191'
  '충청남도 천안시|36.8151|127.1139'
  '충청남도 아산시|36.7898|127.0018'
  '충청북도 청주시|36.6424|127.4890'
  '충청북도 충주시|36.9910|127.9259'
  '강원특별자치도 춘천시|37.8813|127.7298'
  '강원특별자치도 원주시|37.3422|127.9202'
  '강원특별자치도 강릉시|37.7519|128.8761'
  '전북특별자치도 전주시|35.8242|127.1480'
  '전북특별자치도 익산시|35.9483|126.9576'
  '전북특별자치도 군산시|35.9677|126.7366'
  '전라남도 목포시|34.8118|126.3922'
  '전라남도 순천시|34.9506|127.4872'
  '전라남도 여수시|34.7604|127.6622'
  '경상북도 포항시|36.0190|129.3435'
  '경상북도 구미시|36.1195|128.3446'
  '경상북도 경주시|35.8562|129.2247'
  '경상북도 안동시|36.5684|128.7294'
  '경상남도 창원시|35.2279|128.6811'
  '경상남도 김해시|35.2285|128.8894'
  '경상남도 진주시|35.1803|128.1076'
  '경상남도 거제시|34.8806|128.6210'
  '제주특별자치도 제주시|33.4996|126.5312'
  '제주특별자치도 서귀포시|33.2541|126.5601'
 )
 $inv=[Globalization.CultureInfo]::InvariantCulture
 foreach($row in $rows){
  $a=$row.Split('|');if($a.Length -ne 3){continue}
  [pscustomobject]@{name=$a[0];lat=[double]::Parse($a[1],$inv);lon=[double]::Parse($a[2],$inv)}
 }
}
function Find-TTKnownWeatherPlace([string]$address){
 $words=@($address -split '[\s,]+' | Where-Object { $_ })
 if($words.Count -eq 0){return $null}
 $province=[string]$words[0];$city=if($words.Count -gt 1){[string]$words[1]}else{''}
 foreach($p in @(Get-TTKnownWeatherPlaces)){
  if($city -and $p.name -eq ($province+' '+$city)){return $p}
  if(-not $city -and $p.name -eq $province){return $p}
  if($p.name -eq $province){return $p}
  # Province names changed in the administrative system; city centers remain equivalent.
  if($city -and $province -in @('강원도','전라북도') -and $p.name -eq (($province -replace '강원도','강원특별자치도' -replace '전라북도','전북특별자치도')+' '+$city)){return $p}
 }
 return $null
}
function Search-TTKnownWeatherPlaces([string]$q,[int]$count){
 $q=$q.Trim();if(-not $q){return @()}
 $needle=($q -replace '서울시','서울특별시' -replace '서울 ','서울특별시 ' -replace '전북도','전북특별자치도').Trim()
 @(Get-TTKnownWeatherPlaces | Where-Object { $_.name.Contains($needle) -or $_.name.EndsWith(' '+$q) } | Select-Object -First $count)
}

function Find-TTPlaces([string]$q,[int]$count){
 $offline=@(Search-TTKnownWeatherPlaces $q $count);if($offline.Count -gt 0){return $offline}
 # OpenStreetMap's place search asks every program to name itself; this is that name, not a browser's.
 $url="https://nominatim.openstreetmap.org/search?format=json&limit=$count&countrycodes=kr&accept-language=ko&q=$([uri]::EscapeDataString($q))"
 $req=[System.Net.WebRequest]::Create($url);$req.Method='GET';$req.Timeout=12000;$req.UserAgent='TeacherTools/1.26 (classroom dashboard)'
 $res=$req.GetResponse();try{$reader=New-Object System.IO.StreamReader($res.GetResponseStream(),[Text.Encoding]::UTF8);try{$text=$reader.ReadToEnd()}finally{$reader.Dispose()}}finally{$res.Dispose()}
 @(foreach($p in @(ConvertFrom-Json $text)){
  $names=@(([string]$p.display_name) -split ',\s*' | Where-Object { $_ -and $_ -ne '대한민국' -and $_ -notmatch '^\d' })
  [array]::Reverse($names)
  [pscustomobject]@{name=($names -join ' ');lat=[double]$p.lat;lon=[double]$p.lon}
 })
}
function Get-TTWeatherPlace {
 if(Test-Path -LiteralPath $weatherPlaceFile){try{$p=Get-Content -LiteralPath $weatherPlaceFile -Raw -Encoding UTF8 | ConvertFrom-Json;if($p.lat -and $p.lon){return $p}}catch{}}
 if(-not $script:school){throw 'Choose the school first.'}
 $addr=[string]$script:school.address
 if(-not $addr){
  # Older school settings may have no address; try NEIS, but report lookup failure separately.
  try{
   $found=Search-Schools ([string]$script:school.name) ([string]$script:school.office)
   $hit=@($found.rows | Where-Object { $_.code -eq $script:school.code })[0]
   if($hit){$addr=[string]$hit.address}
  }catch{}
 }
 if(-not $addr){throw 'TT_WEATHER_NO_ADDRESS'}
 $known=Find-TTKnownWeatherPlace $addr
 if($known){
  $p=[pscustomobject]@{name=([string]$known.name+' (지역 중심)');lat=$known.lat;lon=$known.lon;auto=$true}
  [IO.File]::WriteAllText($weatherPlaceFile,(ConvertTo-Json -Compress $p),(New-Object Text.UTF8Encoding($false)))
  return $p
 }
 $tokens=@($addr -split '\s+' | Where-Object { $_ })
 $parts=@($tokens[0]);for($i=1;$i -lt [Math]::Min(3,$tokens.Count);$i++){if($tokens[$i] -match '(시|군|구)$'){$parts+=$tokens[$i]}else{break}}
 $q=$parts -join ' '
 $hit=$null
 try{$hit=@(Find-TTPlaces $q 1)[0]}catch{}
 if(-not $hit){try{$hit=@(Find-TTPlaces $tokens[0] 1)[0]}catch{}}
 if(-not $hit){throw 'TT_WEATHER_LOCATION_LOOKUP_FAILED'}
 $p=[pscustomobject]@{name=$q;lat=$hit.lat;lon=$hit.lon;auto=$true}
 [IO.File]::WriteAllText($weatherPlaceFile,(ConvertTo-Json -Compress $p),(New-Object Text.UTF8Encoding($false)))
 return $p
}
# Weather cache is disposable, not a student record or a backup payload.
$weatherCacheFile=Join-Path $TTInstallDir 'weather-cache.json'
$script:weatherStore=$null
function Get-TTWeatherStore {
 if($null -eq $script:weatherStore){
  $script:weatherStore=@{}
  try{
   if((Get-Item -LiteralPath $weatherCacheFile -ErrorAction Stop).Length -le 4194304){
    $saved=Get-Content -Raw -Encoding UTF8 -LiteralPath $weatherCacheFile | ConvertFrom-Json
    foreach($prop in $saved.PSObject.Properties){if($prop.Name -match '^\d{2}\.\d{4},\d{3}\.\d{4}$'){$script:weatherStore[$prop.Name]=$prop.Value}}
   }
  }catch{}
 }
 return $script:weatherStore
}
function Save-TTWeatherStore {
 try{
  $json=ConvertTo-Json -InputObject $script:weatherStore -Depth 16 -Compress
  if([Text.Encoding]::UTF8.GetByteCount($json) -gt 4194304){return $false}
  $temp=$weatherCacheFile+'.tmp'
  [IO.File]::WriteAllText($temp,$json,[Text.UTF8Encoding]::new($false))
  # Windows PowerShell 5.1 coerces a null string backup path; use a concrete disposable backup.
  $backup=$weatherCacheFile+'.bak'
  if([IO.File]::Exists($weatherCacheFile)){
   if([IO.File]::Exists($backup)){[IO.File]::Delete($backup)}
   [IO.File]::Replace($temp,$weatherCacheFile,$backup)
  }else{[IO.File]::Move($temp,$weatherCacheFile)}
  return $true
 }catch{return $false}finally{
  if($temp -and (Test-Path -LiteralPath $temp)){Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue}
  if($backup -and (Test-Path -LiteralPath $weatherCacheFile) -and (Test-Path -LiteralPath $backup)){Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue}
 }
}
function Get-TTWeatherRemote([string]$url,[string]$modified=''){
 # Fixed provider URLs only; bounded reads and no credentials or classroom data.
 $req=[Net.HttpWebRequest]::Create($url);$req.Method='GET';$req.Timeout=4000;$req.ReadWriteTimeout=4000
 $req.UserAgent='HOJA-Board/1.66.5 (contact: xkdtndbrwk111@gmail.com)'
 $req.AutomaticDecompression=[Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
 if($modified){try{$req.IfModifiedSince=[datetime]::Parse($modified,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AdjustToUniversal)}catch{}}
 $res=$null
 try{try{$res=$req.GetResponse()}catch [Net.WebException]{if($_.Exception.Response){$res=$_.Exception.Response}else{throw}}
  $status=[int]$res.StatusCode;$expires=[long]0;$retry=[long]0
  try{$expires=([DateTimeOffset]::Parse($res.Headers['Expires'])).ToUnixTimeMilliseconds()}catch{}
  $ra=$res.Headers['Retry-After'];if($ra){try{$retry=([DateTimeOffset]::UtcNow.AddSeconds([double]$ra)).ToUnixTimeMilliseconds()}catch{try{$retry=([DateTimeOffset]::Parse($ra)).ToUnixTimeMilliseconds()}catch{}}}
  $raw=$null
  if($status -in 200,203){
   $stream=$res.GetResponseStream();$mem=[IO.MemoryStream]::new();$watch=[Diagnostics.Stopwatch]::StartNew();$buf=New-Object byte[] 16384
   try{while(($n=$stream.Read($buf,0,$buf.Length)) -gt 0){if($watch.Elapsed.TotalSeconds -gt 5 -or $mem.Length+$n -gt 2097152){throw 'Weather response limit'};$mem.Write($buf,0,$n)};$raw=[Text.Encoding]::UTF8.GetString($mem.ToArray())|ConvertFrom-Json}finally{$stream.Dispose();$mem.Dispose()}
  }
  return [pscustomobject]@{status=$status;data=$raw;expires=$expires;retry=$retry;modified=[string]$res.Headers['Last-Modified']}
 }finally{if($res){$res.Dispose()}}
}
function Convert-TTMetCode([string]$symbol){
 if(-not $symbol){return $null}
 $s=$symbol -replace '_(day|night|polartwilight)$',''
 if($s -match 'thunder'){return 95};if($s -match 'sleet'){return 66};if($s -match 'snow'){if($s -match 'heavy'){return 75};return 71}
 if($s -match 'rain'){if($s -match 'heavy'){return 65};if($s -match 'light'){return 61};return 63}
 switch($s){'clearsky'{return 0};'fair'{return 1};'partlycloudy'{return 2};'cloudy'{return 3};'fog'{return 45};default{return $null}}
}
function Convert-TTMetForecast($raw,[long]$now){
 $series=@($raw.properties.timeseries);if($series.Count -lt 2){throw 'Invalid MET response'}
 $local=[DateTimeOffset]::FromUnixTimeMilliseconds($now).ToOffset([timespan]::FromHours(9));$today=$local.ToString('yyyy-MM-dd');$points=@()
 foreach($point in $series){
  $t=([DateTimeOffset]::Parse([string]$point.time)).ToOffset([timespan]::FromHours(9));$instant=$point.data.instant.details
  if($null -eq $instant.air_temperature){continue}
  $one=$point.data.next_1_hours;$six=$point.data.next_6_hours;$twelve=$point.data.next_12_hours
  $part=if($one){$one}elseif($six){$six}else{$twelve}
  $prob=$null;if($one -and $null -ne $one.details.probability_of_precipitation){$prob=$one.details.probability_of_precipitation}
  $code=Convert-TTMetCode $part.summary.symbol_code
  $wind=$null;if($null -ne $instant.wind_speed){$wind=[math]::Round([double]$instant.wind_speed*3.6,1)}
  $points+= [pscustomobject]@{time=$t.ToString('yyyy-MM-ddTHH:mm');stamp=$t.ToUnixTimeMilliseconds();temp=[double]$instant.air_temperature;code=$code;wind=$wind;rain=$prob;precip=$one.details.precipitation_amount;min=$six.details.air_temperature_min;max=$six.details.air_temperature_max;sixRain=$six.details.probability_of_precipitation}
 }
 $current=@($points|Where-Object {$_.stamp -le $now}|Select-Object -Last 1)[0];if(-not $current){$current=$points[0]}
 if(-not $current -or [math]::Abs($current.stamp-$now) -gt 21600000){throw 'MET forecast is out of date'}
 $hourly=@($points|Where-Object {$_.stamp -ge ($now-3600000) -and $_.stamp -lt ($now+43200000)})
 $daily=@(foreach($i in 0..4){$day=$local.AddDays($i).ToString('yyyy-MM-dd');$items=@($points|Where-Object {$_.time.StartsWith($day)});if(-not $items.Count){continue}
  $temps=@($items|ForEach-Object {$_.temp});$codes=@($items|Where-Object {$null -ne $_.code});$rains=@($items|ForEach-Object {$_.rain;$_.sixRain}|Where-Object {$null -ne $_})
  # Daily extrema and probability are derived from available samples, not official daily values.
  $mx=($temps|Measure-Object -Maximum).Maximum;$mn=($temps|Measure-Object -Minimum).Minimum
  $dc=$null;if($codes.Count){$dc=($codes|Sort-Object code -Descending|Select-Object -First 1).code}
  $rp=$null;if($rains.Count){$rp=[math]::Round(($rains|Measure-Object -Maximum).Maximum)}
  [pscustomobject]@{time=$day;max=$mx;min=$mn;code=$dc;rain=$rp}
 })
 if(-not $daily.Count){throw 'MET daily forecast missing'}
 return [pscustomobject]@{current=@{time=$current.time;temperature_2m=$current.temp;weather_code=$current.code;wind_speed_10m=$current.wind;precipitation=$current.precip};hourly=@{time=@($hourly|ForEach-Object {$_.time});temperature_2m=@($hourly|ForEach-Object {$_.temp});weather_code=@($hourly|ForEach-Object {$_.code});precipitation_probability=@($hourly|ForEach-Object {$_.rain})};daily=@{time=@($daily|ForEach-Object {$_.time});temperature_2m_max=@($daily|ForEach-Object {$_.max});temperature_2m_min=@($daily|ForEach-Object {$_.min});weather_code=@($daily|ForEach-Object {$_.code});precipitation_probability_max=@($daily|ForEach-Object {$_.rain})}}
}
function Test-TTForecast($w){return ($null -ne $w.current.temperature_2m -and $null -ne $w.current.weather_code -and $null -ne $w.daily.time -and $w.daily.time.Count -gt 0 -and $w.daily.temperature_2m_max.Count -eq $w.daily.time.Count -and $w.daily.temperature_2m_min.Count -eq $w.daily.time.Count -and $w.daily.weather_code.Count -eq $w.daily.time.Count -and $w.hourly.time.Count -gt 0 -and $w.hourly.temperature_2m.Count -eq $w.hourly.time.Count -and $w.hourly.weather_code.Count -eq $w.hourly.time.Count)}
function Test-TTAir($a){return ($null -ne $a.current -and ($null -ne $a.current.pm10 -or $null -ne $a.current.pm2_5) -and $a.hourly.time.Count -gt 0 -and $a.hourly.pm10.Count -eq $a.hourly.time.Count -and $a.hourly.pm2_5.Count -eq $a.hourly.time.Count)}
function Get-TTWeather([bool]$fresh,[bool]$allowMet=$false){
 try{$p=Get-TTWeatherPlace}catch{throw ('TT_WEATHER_LOCATION:'+ $_.Exception.Message)}
 $inv=[Globalization.CultureInfo]::InvariantCulture
 $lat=([math]::Truncate([double]$p.lat*10000)/10000).ToString('0.0000',$inv);$lon=([math]::Truncate([double]$p.lon*10000)/10000).ToString('0.0000',$inv)
 $id="$lat,$lon";$now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$store=Get-TTWeatherStore
 if(-not $store.ContainsKey($id)){$store[$id]=[pscustomobject]@{weather=$null;air=$null;met=$null;primaryNext=[long]0;airNext=[long]0;metNext=[long]0}}
 $c=$store[$id];$dirty=$false
 foreach($key in @($store.Keys)){if($key -eq $id){continue};$old=$store[$key];$last=[math]::Max([long]$old.metNext,[math]::Max([long]$old.weather.at,[long]$old.air.at));if($now-$last -gt 86400000){$store.Remove($key);$dirty=$true}}
 # A user refresh may bypass the half-hour TTL but never a failed-request backoff or MET interval.
 if($now -ge [long]$c.primaryNext -and ($fresh -or -not $c.weather -or $now-[long]$c.weather.at -ge 1800000)){
  $c.primaryNext=$now+300000;$dirty=$true
  try{$r=Get-TTWeatherRemote "https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon&current=temperature_2m,weather_code,wind_speed_10m,precipitation&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=5"
   $c.primaryNext=[math]::Max([long]$c.primaryNext,[long]$r.retry)
   if($r.status -eq 200 -and (Test-TTForecast $r.data)){$c.weather=[pscustomobject]@{data=$r.data;at=$now};$c.primaryNext=0}
   elseif($c.weather){$c.weather|Add-Member -NotePropertyName attemptFailed -NotePropertyValue $true -Force}
  }catch{if($c.weather){$c.weather|Add-Member -NotePropertyName attemptFailed -NotePropertyValue $true -Force}}
 }
 $w=$null;$at=0;$source='';$stale=$false
 if($c.weather -and $now-[long]$c.weather.at -lt 1800000 -and -not $c.weather.attemptFailed){$w=$c.weather.data;$at=$c.weather.at;$source='Open-Meteo'}
 if(-not $w -and $allowMet){
  if($now -ge [long]$c.metNext -and ($store.Count -le 12 -or $c.met)){
   # Persist the retry floor BEFORE the request, including on failure/restart.
   $c.metNext=$now+10800000;$saved=Save-TTWeatherStore;$dirty=$true
   try{if(-not $saved){throw 'Cannot persist MET request interval'};$r=Get-TTWeatherRemote "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=$lat&lon=$lon" ([string]$c.met.modified)
    $c.metNext=[math]::Max([long]$c.metNext,[math]::Max([long]$r.expires,[long]$r.retry))
    if($r.status -eq 304 -and $c.met){$c.met.at=$now}
    elseif($r.status -in 200,203){$null=Convert-TTMetForecast $r.data $now;$c.met=[pscustomobject]@{data=$r.data;at=$now;modified=$r.modified;deprecated=($r.status -eq 203)}}
   }catch{}
  }
  if($c.met -and $now-[long]$c.met.at -lt 86400000){try{$w=Convert-TTMetForecast $c.met.data $now;$at=$c.met.at;$source='MET Norway';$stale=($now-[long]$at -ge 21600000)}catch{}}
 }
 if(-not $w -and $c.weather -and $now-[long]$c.weather.at -lt 86400000){$w=$c.weather.data;$at=$c.weather.at;$source='Open-Meteo';$stale=$true}
 # Independent air-quality lookup, even if both weather providers fail.
 if($now -ge [long]$c.airNext -and ($fresh -or -not $c.air -or $now-[long]$c.air.at -ge 1800000)){
  $c.airNext=$now+300000;$dirty=$true
  try{$r=Get-TTWeatherRemote "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=$lat&longitude=$lon&current=pm10,pm2_5&hourly=pm10,pm2_5&timezone=Asia%2FSeoul&forecast_days=5"
   $c.airNext=[math]::Max([long]$c.airNext,[long]$r.retry)
   if($r.status -eq 200 -and (Test-TTAir $r.data)){$c.air=[pscustomobject]@{data=$r.data;at=$now};$c.airNext=0}
   elseif($c.air){$c.air|Add-Member -NotePropertyName attemptFailed -NotePropertyValue $true -Force}
  }catch{if($c.air){$c.air|Add-Member -NotePropertyName attemptFailed -NotePropertyValue $true -Force}}
 }
 if($dirty){$null=Save-TTWeatherStore}
 $a=$null;$airAt=0;$airStale=$false
 if($c.air -and $now-[long]$c.air.at -lt 86400000){$a=$c.air.data;$airAt=$c.air.at;$airStale=($now-[long]$airAt -ge 1800000 -or $c.air.attemptFailed)}
 if(-not $w -and -not $a){throw 'TT_WEATHER_FORECAST_UNAVAILABLE'}
 return (ConvertTo-Json -Depth 16 -Compress @{place=@{name=[string]$p.name;lat=[double]$p.lat;lon=[double]$p.lon};weather=$w;air=$a;at=$at;source=$source;stale=$stale;airAt=$airAt;airStale=$airStale;metDeprecated=($source -eq 'MET Norway' -and $c.met.deprecated)})
}
function Fetch-NeisRows([string]$endpoint,[string]$query){
 $url="https://open.neis.go.kr/hub/${endpoint}?Type=json&pSize=100&ATPT_OFCDC_SC_CODE=$($script:school.office)&SD_SCHUL_CODE=$($script:school.code)&$query"
 $data=ConvertFrom-Json (RemoteText $url)
 if($null -ne $data.RESULT -and $data.RESULT.CODE -ne 'INFO-200') {throw ('NEIS: '+$data.RESULT.MESSAGE)}
 $records=@();$table=$data.$endpoint
 if($null -ne $table -and $table.Count -gt 1){$records=@($table[1].row)}
 return $records
}
# Without an API key NEIS answers with the first 5 rows of a range and ignores paging,
# so walk the range forward from the last date received until a short answer ends it.
function Fetch-NeisSchedule([string]$from,[string]$to) {
 $seen=@{};$rows=@();$cursor=$from
 for($i=0;$i -lt 12 -and $cursor -le $to;$i++){
  try{$batch=@(Fetch-NeisRows 'SchoolSchedule' "AA_FROM_YMD=$cursor&AA_TO_YMD=$to")}
  catch{if($rows.Count -eq 0){throw};break}
  foreach($row in $batch){
   $id=[string]$row.AA_YMD+'|'+[string]$row.EVENT_NM
   if(-not $seen.ContainsKey($id)){$seen[$id]=$true;$rows+=$row}
  }
  if($batch.Count -lt 5){break}
  $last=@($batch | ForEach-Object {[string]$_.AA_YMD} | Sort-Object)[-1]
  # Restart on the last date in case it has more rows; five rows on one date must still move on.
  if($last -gt $cursor){$cursor=$last}
  else{$cursor=[datetime]::ParseExact($cursor,'yyyyMMdd',[Globalization.CultureInfo]::InvariantCulture).AddDays(1).ToString('yyyyMMdd')}
 }
 return $rows
}
function NeisData([string]$kind,[string]$date) {
 if(-not $script:school){return [pscustomobject]@{rows=@()}}
 if($date -notmatch '^\d{8}$'){throw 'Invalid date.'}
 $d=[datetime]::ParseExact($date,'yyyyMMdd',[Globalization.CultureInfo]::InvariantCulture)
 if($kind -eq 'meal'){
  $endpoint='mealServiceDietInfo'
  # Show five actual school lunch dates starting today, never past meals.
  # Compact 10-day request avoids the old 15-day lookup. Extend only when
  # school breaks leave fewer than five recorded lunch dates.
  $from=$d.ToString('yyyyMMdd')
  $through=$d.AddDays(9).ToString('yyyyMMdd')
  $records=@()
  $queryError=$null
  try {
    $records=@(Fetch-NeisRows $endpoint "MLSV_FROM_YMD=$from&MLSV_TO_YMD=$through&MMEAL_SC_CODE=2")
  } catch { $queryError=$_.Exception.Message }
  # Some providers return a truncated date range; verify the *current day*
  # explicitly instead of treating an incomplete response as successful.
  if($d.DayOfWeek -ne [DayOfWeek]::Saturday -and $d.DayOfWeek -ne [DayOfWeek]::Sunday){
    $todayPresent=@($records | Where-Object { [string]$_.MLSV_YMD -eq $from }).Count -gt 0
    if(-not $todayPresent){
      try {
        $records+=@(Fetch-NeisRows $endpoint "MLSV_FROM_YMD=$from&MLSV_TO_YMD=$from&MMEAL_SC_CODE=2")
      } catch { if($records.Count -eq 0){$queryError=$_.Exception.Message} }
    }
  }
  $valid=@($records | Where-Object {
    $dayText=[string]$_.MLSV_YMD
    if($dayText -notmatch '^\d{8}$' -or $dayText -lt $from -or -not $_.DDISH_NM){return $false}
    try{$mealDate=[datetime]::ParseExact($dayText,'yyyyMMdd',[Globalization.CultureInfo]::InvariantCulture)}catch{return $false}
    return ($mealDate.DayOfWeek -ne [DayOfWeek]::Saturday -and $mealDate.DayOfWeek -ne [DayOfWeek]::Sunday)
  } | Sort-Object MLSV_YMD -Unique)
  if($valid.Count -lt 5){
    $next=$d.AddDays(10).ToString('yyyyMMdd')
    $later=$d.AddDays(24).ToString('yyyyMMdd')
    try{$records+=@(Fetch-NeisRows $endpoint "MLSV_FROM_YMD=$next&MLSV_TO_YMD=$later&MMEAL_SC_CODE=2")}
    catch {if($records.Count -eq 0){$queryError=$_.Exception.Message}}
  }
  if($records.Count -eq 0 -and $queryError){throw ('Meal NEIS request failed: '+$queryError)}
  $records=@($records | Where-Object {
    $dayText=[string]$_.MLSV_YMD
    if($dayText -notmatch '^\d{8}$' -or $dayText -lt $from -or -not $_.DDISH_NM){return $false}
    try{$mealDate=[datetime]::ParseExact($dayText,'yyyyMMdd',[Globalization.CultureInfo]::InvariantCulture)}catch{return $false}
    return ($mealDate.DayOfWeek -ne [DayOfWeek]::Saturday -and $mealDate.DayOfWeek -ne [DayOfWeek]::Sunday)
  } | Sort-Object MLSV_YMD -Unique | Select-Object -First 5)
 }else{
  $endpoint='SchoolSchedule';$end=$d.AddDays(45).ToString('yyyyMMdd')
  $records=@(Fetch-NeisSchedule $date $end)
 }
 $output=@(foreach($item in $records){
  if($kind -eq 'meal'){
    $menu=([string]$item.DDISH_NM -replace '(?i)<br\s*/?\s*>',"`n" -replace '\s*\([\d.]+\)','' -replace '&amp;','&')
    [pscustomobject]@{date=[string]$item.MLSV_YMD;menu=$menu}
  }elseif($item.EVENT_NM -ne '토요휴업일'){
    [pscustomobject]@{date=[string]$item.AA_YMD;name=[string]$item.EVENT_NM}
  }
 })
 return [pscustomobject]@{rows=$output}
}
# Photo album: only files listed from the folder the teacher picked can ever be served, by position in the list.
$photoSetting=Join-Path $TTInstallDir 'photos.txt'
$photoTypes=@{'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.png'='image/png';'.webp'='image/webp';'.gif'='image/gif';'.bmp'='image/bmp'}
$script:photoFiles=@()
function Update-PhotoList {
 $folder='';$missing=$false;$skipped=0;$script:photoFiles=@()
 if(Test-Path -LiteralPath $photoSetting){$folder=([IO.File]::ReadAllText($photoSetting,[Text.Encoding]::UTF8)).Trim()}
 if($folder){
  if(Test-Path -LiteralPath $folder -PathType Container){
   $all=@(Get-ChildItem -LiteralPath $folder -Recurse -File -ErrorAction SilentlyContinue)
   $script:photoFiles=@($all | Where-Object {$photoTypes.ContainsKey($_.Extension.ToLowerInvariant())} | Sort-Object FullName | Select-Object -First 3000 | ForEach-Object {$_.FullName})
   $skipped=@($all | Where-Object {@('.heic','.heif') -contains $_.Extension.ToLowerInvariant()}).Count
  }else{$missing=$true}
 }
 return [pscustomobject]@{folder=$folder;count=$script:photoFiles.Count;skipped=$skipped;missing=$missing}
}
function Select-PhotoFolder {
 Add-Type -AssemblyName System.Windows.Forms
 # The dashboard sits at the bottom of the window stack, so the dialog needs a topmost owner to be seen.
 $owner=New-Object System.Windows.Forms.Form
 $owner.TopMost=$true;$owner.ShowInTaskbar=$false;$owner.Opacity=0;$owner.StartPosition='CenterScreen'
 $dialog=New-Object System.Windows.Forms.FolderBrowserDialog
 $dialog.Description='대시보드 사진첩에 표시할 사진 폴더를 고르세요. 하위 폴더의 사진도 함께 표시됩니다.'
 $dialog.ShowNewFolderButton=$false
 if(Test-Path -LiteralPath $photoSetting){
  $old=([IO.File]::ReadAllText($photoSetting,[Text.Encoding]::UTF8)).Trim()
  if($old -and (Test-Path -LiteralPath $old -PathType Container)){$dialog.SelectedPath=$old}
 }
 try{
  $owner.Show();$owner.Activate()
  if($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK){[IO.File]::WriteAllText($photoSetting,$dialog.SelectedPath,[Text.Encoding]::UTF8)}
 }finally{$dialog.Dispose();$owner.Close();$owner.Dispose()}
}
$seatingFile=Join-Path $TTInstallDir 'seating.json'
$coinFile=Join-Path $TTInstallDir 'coins.log'
function Get-TTCoinRevision([byte[]]$Bytes){
 $sha=[Security.Cryptography.SHA256]::Create()
 try{return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
}
function Read-TTCoinBytes([string]$File){if([IO.File]::Exists($File)){return ,([IO.File]::ReadAllBytes($File))};return ,([byte[]]@())}

$noticeFile=Join-Path $TTInstallDir 'notice.log'
. (Join-Path $PSScriptRoot 'speaker.ps1')
# Public read-only, privacy-free status only. Neither student data nor window IDs are returned.
function Test-TTWallpaper {
  $file=Join-Path $TTInstallDir 'board-mode.json'
  if(-not (Test-Path -LiteralPath $file -PathType Leaf)){return $false}
  try {
    $info=Get-Item -LiteralPath $file
    if(((Get-Date)-$info.LastWriteTime).TotalSeconds -ge 13){return $false}
    $data=ConvertFrom-Json ([IO.File]::ReadAllText($file,[Text.Encoding]::UTF8))
    if($data.mode -notin @('wallpaper','window') -or [string]$data.release -ne $TTRelease){return $false}
    if([int64]$data.window -le 0 -or [int]$data.pid -le 0){return $false}
    return ($null -ne (Get-Process -Id ([int]$data.pid) -ErrorAction SilentlyContinue))
  }catch{return $false}
}
# R5: Windows socket handles must never be inherited by the updater or helper processes.
if (-not ('TTSocketHandleGuard' -as [type])) {
 Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class TTSocketHandleGuard {
    private const uint HANDLE_FLAG_INHERIT = 1;
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetHandleInformation(IntPtr handle, out uint flags);
    public static void MakeNonInheritable(IntPtr handle) {
        if (!SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        uint flags;
        if (!GetHandleInformation(handle, out flags))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        if ((flags & HANDLE_FLAG_INHERIT) != 0)
            throw new InvalidOperationException("Teacher Tools socket is inheritable.");
    }
}
'@
}
$listener=New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$Port)
try {
 [TTSocketHandleGuard]::MakeNonInheritable($listener.Server.Handle)
 $listener.Start()
 [TTSocketHandleGuard]::MakeNonInheritable($listener.Server.Handle)
 while($true){
 $client=$listener.AcceptTcpClient();$client.ReceiveTimeout=1000;$client.SendTimeout=10000
 $reader=$null;$stream=$null
 try {
  [TTSocketHandleGuard]::MakeNonInheritable($client.Client.Handle)
  $stream=$client.GetStream();$reader=New-Object IO.StreamReader($stream,[Text.Encoding]::ASCII,$false,1024,$true)
  $request=$reader.ReadLine();if(-not $request){continue};$fetchSite='';$hostName='';$origin='';$resetToken='';$backupToken='';$updateToken='';$coinRevision='';$seatRevision='';$extraHeaders='';$contentLength=0
  do {
   $line=$reader.ReadLine()
   if($line -match '^Sec-Fetch-Site:\s*(.+)$'){$fetchSite=$Matches[1].Trim()}
   elseif($line -match '^Host:\s*(.+)$'){$hostName=$Matches[1].Trim()}
   elseif($line -match '^Origin:\s*(.+)$'){$origin=$Matches[1].Trim()}
   elseif($line -match '^X-TT-Reset-Token:\s*([a-fA-F0-9]{32})\s*$'){$resetToken=$Matches[1].ToLowerInvariant()}
   elseif($line -match '^X-TT-Backup-Token:\s*([a-fA-F0-9]{32})\s*$'){$backupToken=$Matches[1].ToLowerInvariant()}
   elseif($line -match '^X-TT-Update-Token:\s*([a-fA-F0-9]{32})\s*$'){$updateToken=$Matches[1].ToLowerInvariant()}
   elseif($line -match '^X-TT-Coin-Revision:\s*([a-f0-9]{64})\s*$'){$coinRevision=$Matches[1].ToLowerInvariant()}
   elseif($line -match '^X-TT-Seating-Revision:\s*([a-f0-9]{64})\s*$'){$seatRevision=$Matches[1].ToLowerInvariant()}
   elseif($line -match '^Content-Length:\s*(\d{1,9})\s*$'){$contentLength=[int]$Matches[1]}
  } while($null -ne $line -and $line -ne '')
  $parts=$request.Split(' ');if($parts.Length -lt 2 -or $parts[0] -notin @('GET','POST','OPTIONS')){throw 'Unsupported method.'}
  $bodyText=''
  if($parts[0] -eq 'POST'){
   $limit=if($parts[1] -eq '/api/backup/restore'){33554432}else{8388608}
   if($contentLength -gt $limit){throw 'Request too large.'}
   $chars=New-Object char[] $contentLength;$got=0
   while($got -lt $contentLength){$n=$reader.Read($chars,$got,$contentLength-$got);if($n -le 0){break};$got+=$n}
   $bodyText=New-Object string ($chars,0,$got)
  }
  $uri=[uri]('http://localhost'+$parts[1]);$path=$uri.AbsolutePath;$status='200 OK';$ctype='application/json; charset=utf-8';$raw=$null;$body=''
  $localHost=($hostName -eq "127.0.0.1:$Port" -or $hostName -eq "localhost:$Port")
  $allowedOrigins=@('https://xkdtndbrwk111-prog.github.io','http://127.0.0.1:4192','http://localhost:4192','http://127.0.0.1:4188','http://localhost:4188')
  $managerOrigin=($origin -in $allowedOrigins)
  $statusCors=($path -eq '/api/board-status' -and $localHost -and $managerOrigin)
  $presentCors=($localHost -and $managerOrigin -and $path -in @('/api/presentation/send','/api/presentation/receipt','/api/presentation/close'))
  try {
   if($path -like '/api/presentation/*'){
    $boardOrigin=$localHost -and $fetchSite -eq 'same-origin' -and (-not $origin -or $origin -in @("http://127.0.0.1:$Port","http://localhost:$Port"))
    $answer=Invoke-TTPresent $path $parts[0] $localHost $managerOrigin $boardOrigin $bodyText $uri
    $status=$answer.status;$body=$answer.body
   }
   elseif($path -eq '/api/board-status'){
    if(-not $localHost -or ($origin -and -not $managerOrigin)){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($parts[0] -eq 'OPTIONS'){$status='204 No Content';$body=''}
    elseif($parts[0] -ne 'GET'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
    else{
     $wallpaper=[bool](Test-TTWallpaper)
     # 'wallpaper' stays true for both modes so the published classroom manager keeps working; 'mode' says which.
      $mode=''
      try{$mode=[string](ConvertFrom-Json ([IO.File]::ReadAllText((Join-Path $TTInstallDir 'board-mode.json'),[Text.Encoding]::UTF8))).mode}catch{}
      $result=@{service='teacher-tools-local';version=40;coinProtocol=3;presentationProtocol=1;presentationReady=[bool](Get-TTPresentReady);wallpaper=$wallpaper;mode=$(if($wallpaper){$mode}else{''});screen=$null}
     if($wallpaper){
      # Read only Windows display bounds; never expose student data or stored files.
      try{
       Add-Type -AssemblyName System.Windows.Forms
       $deviceFile=Join-Path $TTInstallDir 'display.txt'
       $device=if(Test-Path -LiteralPath $deviceFile -PathType Leaf){([IO.File]::ReadAllText($deviceFile,[Text.Encoding]::UTF8)).Trim()}else{''}
       $screen=[System.Windows.Forms.Screen]::AllScreens | Where-Object { $_.DeviceName -eq $device } | Select-Object -First 1
       if($null -eq $screen){$screen=[System.Windows.Forms.Screen]::PrimaryScreen}
       if($null -ne $screen){
        $r=$screen.Bounds
        $result.screen=@{left=[int]$r.X;top=[int]$r.Y;width=[int]$r.Width;height=[int]$r.Height}
       }
      }catch{$result.screen=$null}
     }
     $body=ConvertTo-Json -Compress -Depth 4 $result
    }
   }
   elseif($parts[0] -eq 'OPTIONS'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
   elseif($parts[0] -eq 'POST' -and $path -ne '/api/seating' -and $path -ne '/api/open-manager' -and $path -ne '/api/open-web' -and $path -ne '/api/coins' -and $path -ne '/api/notice' -and $path -ne '/api/share-input' -and $path -ne '/api/share-input/restart' -and $path -ne '/api/touch-check/fix' -and $path -ne '/api/speakers/set' -and $path -ne '/api/volume' -and $path -ne '/api/weather/place' -and $path -ne '/api/open-sound-settings' -and $path -ne '/api/school' -and $path -ne '/api/open-sheet-copy' -and $path -ne '/api/privacy-reset' -and $path -ne '/api/backup/restore' -and $path -notin @('/api/update/apply','/api/update/auto/on','/api/update/auto/off')){$status='405 Method Not Allowed';$body='{"error":"method"}'}

   elseif($path -in @('/api/update/status','/api/update/check','/api/update/apply','/api/update/auto/on','/api/update/auto/off')){
    $onlyLocal=$localHost -and $fetchSite -eq 'same-origin' -and (-not $origin -or $origin -in @("http://127.0.0.1:$Port","http://localhost:$Port"))
    if(-not $onlyLocal){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($path -in @('/api/update/apply','/api/update/auto/on','/api/update/auto/off') -and $parts[0] -ne 'POST'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
    elseif($path -in @('/api/update/status','/api/update/check') -and $parts[0] -ne 'GET'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
    else{
     $stateFile=Join-Path $TTInstallDir 'update-state.json'
     $pref=Join-Path $TTInstallDir 'startup-update-disabled.flag'
     $state=@{status='idle';message='아직 확인하지 않았습니다.';checkedAt='';current=[string]$TTReleaseInfo.version;latest='';notes=@();manualSupported=$true;startupSupported=$true;autoStartup=(-not (Test-Path -LiteralPath $pref))}
     if(Test-Path -LiteralPath $stateFile){try{$saved=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json;foreach($key in @('status','message','checkedAt','latest','notes')){if($null -ne $saved.$key){$state[$key]=$saved.$key}}}catch{}}
     $when=[datetime]::MinValue;try{$when=[datetime]::Parse([string]$state.checkedAt).ToUniversalTime()}catch{}
     if($state.status -in @('checking','installing') -and ([datetime]::UtcNow-$when).TotalMinutes -gt 3){$state.status='error';$state.message='업데이트 확인이 지연되었습니다. 다시 시도하세요.'}
      if($path -in @('/api/update/auto/on','/api/update/auto/off')){
       if($parts[0] -ne 'POST' -or $origin -notin @("http://127.0.0.1:$Port","http://localhost:$Port") -or $updateToken -cne $script:updateApproveToken){$status='403 Forbidden';$body='{"error":"token"}'}
       elseif($state.status -in @('checking','installing')){$status='409 Conflict';$body='{"error":"busy"}'}
       else{
        $script:updateApproveToken=[guid]::NewGuid().ToString('N')
        try{
        if($path -eq '/api/update/auto/off'){[IO.File]::WriteAllText($pref,'disabled',[Text.UTF8Encoding]::new($false))}
         elseif(Test-Path -LiteralPath $pref){Remove-Item -LiteralPath $pref -Force -ErrorAction Stop}
         $state.autoStartup=(-not (Test-Path -LiteralPath $pref))
        }catch{$status='500 Internal Server Error';$body='{"error":"preference"}'}
       }
      }
      elseif($path -eq '/api/update/apply'){
      if($parts[0] -ne 'POST' -or $origin -notin @("http://127.0.0.1:$Port","http://localhost:$Port") -or $updateToken -cne $script:updateApproveToken){$status='403 Forbidden';$body='{"error":"token"}'}
      elseif([string]$TTReleaseInfo.channel -ne 'stable' -or [string]$TTReleaseInfo.updateMode -ne 'auto-pilot'){$status='409 Conflict';$body='{"error":"channel"}'}
      elseif($state.status -in @('checking','installing')){$status='409 Conflict';$body='{"error":"busy"}'}
      else{
       $script:updateApproveToken=[guid]::NewGuid().ToString('N')
       $state.status='checking';$state.message='새 버전 확인 중입니다.';$state.checkedAt=[datetime]::UtcNow.ToString('o')
       [IO.File]::WriteAllText($stateFile,(ConvertTo-Json -Compress -Depth 4 $state),(New-Object Text.UTF8Encoding($false)))
       $windowed=$false
       try{$bm=Get-Content -LiteralPath (Join-Path $TTInstallDir 'board-mode.json') -Raw -Encoding UTF8 | ConvertFrom-Json;$windowed=([string]$bm.mode -eq 'window')}catch{}
       try{
        $info=New-Object System.Diagnostics.ProcessStartInfo
        $info.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $info.Arguments='-NoProfile -File "'+(Join-Path $TTInstallDir 'launch.ps1')+'" -ManualUpdate'+$(if($windowed){' -Windowed'}else{''})
        $info.WorkingDirectory=$TTInstallDir;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
        [void][System.Diagnostics.Process]::Start($info)
       }catch{$state.status='error';$state.message='업데이트 실행 시작 실패: '+$_.Exception.Message;[IO.File]::WriteAllText($stateFile,(ConvertTo-Json -Compress -Depth 4 $state),(New-Object Text.UTF8Encoding($false)))}
      }
     }
     if($status -eq '200 OK'){$state.token=$script:updateApproveToken;$body=ConvertTo-Json -Compress -Depth 5 $state}
    }
   }
   elseif($path -in @('/api/backup/export','/api/backup/token','/api/backup/restore')){
    # Export/restore ONLY known Teacher Tools files. Images, photos, browser profiles,
    # cookies, credentials, diagnostic logs, and arbitrary paths are never backed up.
    $localOnly=$localHost -and $fetchSite -eq 'same-origin' -and (-not $origin -or $origin -in @("http://127.0.0.1:$Port","http://localhost:$Port"))
    if(-not $localOnly){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($path -eq '/api/backup/token'){
     if($parts[0] -ne 'GET'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
     else{$body=ConvertTo-Json -Compress @{token=$script:backupRestoreToken}}
    }
    elseif($path -eq '/api/backup/export'){
     if($parts[0] -ne 'GET'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
     else{
      $names=@('school.json','weather-place.json','seating.json','coins.log','notice.log')
      $records=@{}
      foreach($name in $names){
       $file=Join-Path $TTInstallDir $name
       if(-not (Test-Path -LiteralPath $file)){continue}
       $entry=Get-Item -LiteralPath $file -Force
       if($entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Unsafe backup file.'}
       if($entry.Length -gt 16777216){throw 'Backup file exceeds 16 MiB.'}
       $records[$name]=[Convert]::ToBase64String([IO.File]::ReadAllBytes($file))
      }
      $body=ConvertTo-Json -Compress -Depth 5 @{format='teacher-tools-server-files';version=1;files=$records}
     }
    }
    elseif($parts[0] -ne 'POST'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
    elseif($backupToken -cne $script:backupRestoreToken){$status='403 Forbidden';$body='{"error":"token"}'}
    else{
     # A single allowlist prevents imports from writing outside the installed app directory.
     $names=@('school.json','weather-place.json','seating.json','coins.log','notice.log')
     $decoded=@{};$old=@{}
     try{
      $payload=ConvertFrom-Json -InputObject $bodyText
      if($payload.format -cne 'teacher-tools-server-files' -or [int]$payload.version -ne 1 -or $payload.mode -notin @('with-students','settings-only')){throw 'Unsupported backup format.'}
      if($null -eq $payload.files -or $null -eq $payload.files.PSObject){throw 'Missing files.'}
      $props=@($payload.files.PSObject.Properties)
      foreach($prop in $props){if($prop.Name -cnotin $names){throw 'Unknown data file.'}}
      if($payload.mode -eq 'settings-only' -and $props.Count -gt 0){throw 'Settings-only backup must contain no student files.'}
      $total=[int64]0
      foreach($name in $names){
       $p=$payload.files.PSObject.Properties[$name]
       if($null -ne $p){
        if($p.Value -isnot [string]){throw 'Invalid encoded data.'}
        $bytes=[Convert]::FromBase64String([string]$p.Value)
        $total+=$bytes.Length
        if($bytes.Length -gt 16777216 -or $total -gt 25165824){throw 'Data exceeds allowed size.'}
        if($name.EndsWith('.json')){[void](ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString($bytes)))}
        if($name.EndsWith('.log')){
         foreach($line in ([Text.Encoding]::UTF8.GetString($bytes) -split "`n")){
          if($line.Trim()){[void](ConvertFrom-Json -InputObject $line)}
         }
        }
        $decoded[$name]=$bytes
       }
      }
      foreach($name in $names){
       $p=Join-Path $TTInstallDir $name
       if(Test-Path -LiteralPath $p){
        $item=Get-Item -LiteralPath $p -Force
        if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Unsafe existing data file.'}
        $old[$name]=[IO.File]::ReadAllBytes($p)
       }else{$old[$name]=$null}
      }
      try{
       foreach($name in $names){
        $p=Join-Path $TTInstallDir $name
        if($decoded.ContainsKey($name)){
         $temp=Join-Path $TTInstallDir ('.tt-restore-'+[guid]::NewGuid().ToString('N')+'.tmp')
         try{[IO.File]::WriteAllBytes($temp,$decoded[$name]);Move-Item -LiteralPath $temp -Destination $p -Force -ErrorAction Stop}
         finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue}}
        }elseif(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force -ErrorAction Stop}
       }
       $script:school=$null
       if(Test-Path -LiteralPath $schoolFile){$script:school=ConvertFrom-Json ([IO.File]::ReadAllText($schoolFile,[Text.Encoding]::UTF8))}
       $script:timetableCache=@{};$script:weatherCache=$null
      }catch{
       foreach($name in $names){
        $p=Join-Path $TTInstallDir $name
        try{
         if($null -eq $old[$name]){if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
         else{[IO.File]::WriteAllBytes($p,$old[$name])}
        }catch{}
       }
       throw
      }
      $script:backupRestoreToken=[guid]::NewGuid().ToString('N')
$script:updateApproveToken=[guid]::NewGuid().ToString('N')
      $body='{"ok":true}'
     }catch{
      $status='400 Bad Request';$body=ConvertTo-Json -Compress @{error='restore_failed';message=$_.Exception.Message}
     }
    }
   }
   elseif($path -eq '/api/privacy-reset/token' -or $path -eq '/api/privacy-reset'){
    # No wildcard CORS. A request from an external page must never erase local data.
    $localOnly=$localHost -and $fetchSite -eq 'same-origin' -and (-not $origin -or $origin -eq "http://127.0.0.1:$Port")
    if(-not $localOnly){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($path -eq '/api/privacy-reset/token'){
     if($parts[0] -ne 'GET'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
     else{$body=ConvertTo-Json -Compress @{token=$script:privacyResetToken}}
    }
    elseif($parts[0] -ne 'POST'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
    elseif($resetToken -cne $script:privacyResetToken){$status='403 Forbidden';$body='{"error":"token"}'}
    else{
     $confirm='';try{$confirm=[string](ConvertFrom-Json $bodyText).confirm}catch{}
     if($confirm -cne 'RESET_TEACHER_TOOLS'){$status='400 Bad Request';$body='{"error":"confirmation"}'}
     elseif(-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'privacy-reset.ps1'))){$status='500 Internal Server Error';$body='{"error":"worker_missing"}'}
     else{
      # Invalidate token before launching the detached worker to prevent repeat requests.
      $script:privacyResetToken=[guid]::NewGuid().ToString('N')
      Start-TTHidden -ScriptPath (Join-Path $PSScriptRoot 'privacy-reset.ps1')
      $body='{"ok":true,"closing":true}'
     }
    }
   }
   elseif($path -eq '/api/open-web'){
    if(-not ($localHost -and $fetchSite -eq 'same-origin')){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($parts[0] -ne 'POST'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
    else{
     $webUrl='';try{$webUrl=[string](ConvertFrom-Json $bodyText).url}catch{}
     $webUri=$null
     if($webUrl.Length -gt 2000 -or -not [Uri]::TryCreate($webUrl,[UriKind]::Absolute,[ref]$webUri) -or ($webUri.Scheme -ne 'http' -and $webUri.Scheme -ne 'https')){$status='400 Bad Request';$body='{"error":"url"}'}
     else{
      $info=New-Object System.Diagnostics.ProcessStartInfo
      $info.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
      $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'open-web.ps1')+'" -Url "'+$webUri.AbsoluteUri.Replace('"','%22')+'"'
      $info.WorkingDirectory=$PSScriptRoot;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
      [void][System.Diagnostics.Process]::Start($info)
      $body='{"ok":true}'
     }
    }
   }
   elseif($path -eq '/seating-inbox'){
    if($localHost){$ctype='text/html; charset=utf-8';$raw=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'seating-inbox.html'))}
    else{$status='403 Forbidden';$body='{"error":"forbidden"}'}
   }
    elseif($path -match '^/museum-sway/(base|sheet)/(spring|summer|autumn|winter)(?:/(left|right))?$'){
     if($localHost -and $parts[0] -eq 'GET'){
      $kind=$Matches[1];$season=$Matches[2];$half=$Matches[3]
      $assetName=$null
      if($kind -eq 'base'){
       if(-not $half){$assetName=('museum-sway-'+$season+'-'+$kind+'.webp')}
      }elseif($season -eq 'winter'){
       if($half -in @('left','right')){$assetName=('museum-sway-winter-'+$half+'.png')}
      }elseif(-not $half){$assetName=('museum-sway-'+$season+'-sheet.png')}
      if(-not $assetName){$status='404 Not Found';$body='{"error":"invalid sway route"}'}
      else{
       $assetPath=Join-Path $PSScriptRoot $assetName
       if(Test-Path -LiteralPath $assetPath -PathType Leaf){
        $ctype=if($assetName.EndsWith('.png')){'image/png'}else{'image/webp'}
        $raw=[IO.File]::ReadAllBytes($assetPath)
       }else{$status='404 Not Found';$body='{"error":"sway asset missing"}'}
      }
     }else{$status='403 Forbidden';$body='{"error":"forbidden"}'}
    }
    elseif($path -match '^/museum-clouds/(sky|far|near)$'){
     if($localHost -and $parts[0] -eq 'GET'){
      $part=$Matches[1]
      $assetName=if($part -eq 'sky'){'museum-sky.webp'}else{'museum-cloud-'+$part+'.webp'}
      $assetPath=Join-Path $PSScriptRoot $assetName
      if(Test-Path -LiteralPath $assetPath -PathType Leaf){$ctype='image/webp';$raw=[IO.File]::ReadAllBytes($assetPath)}
      else{$status='404 Not Found';$body='{"error":"missing cloud asset"}'}
     }else{$status='403 Forbidden';$body='{"error":"forbidden"}'}
    }
   elseif($path -eq '/update-ui.js' -or $path -eq '/podo.js' -or $path -eq '/handmade-paper.png' -or $path -eq '/hoja_face_original.webp' -or $path -eq '/nahan_face_original.webp'){
    if($localHost -and $parts[0] -eq 'GET'){
     $file=Join-Path $PSScriptRoot $path.TrimStart('/')
     if(Test-Path -LiteralPath $file -PathType Leaf){
      $ctype=if($path.EndsWith('.js')){'text/javascript; charset=utf-8'}elseif($path.EndsWith('.png')){'image/png'}else{'image/webp'}
      $raw=[IO.File]::ReadAllBytes($file)
     }else{$status='404 Not Found';$body='{"error":"missing asset"}'}
    }else{$status='403 Forbidden';$body='{"error":"forbidden"}'}
   }
   elseif($path -eq '/coins.js' -or $path -eq '/coins-ui.js'){
    if($localHost){$ctype='text/javascript; charset=utf-8';$raw=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $path.TrimStart('/')))}
    else{$status='403 Forbidden';$body='{"error":"forbidden"}'}
   }
   elseif($path -eq '/api/coins'){
    # Single listener serializes the compare-and-commit step. Reject stale clients, never silently replay.
    if(-not ($localHost -and ($fetchSite -eq 'same-origin' -or ($parts[0] -eq 'GET' -and -not $fetchSite)))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    else{
     [byte[]]$old=Read-TTCoinBytes $coinFile
     $rev=Get-TTCoinRevision $old
     if($parts[0] -eq 'POST'){
      if(-not $coinRevision){$status='428 Precondition Required';$body='{"error":"revision_required"}'}
      elseif($coinRevision -ne $rev -or ($seatRevision -and $seatRevision -ne (Get-TTCoinRevision (Read-TTCoinBytes $seatingFile)))){$status='409 Conflict';$body='{"error":"stale_snapshot"}'}
      else{
       $text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($bodyText))
       $lines=@($text -split "`n" | Where-Object {$_.Trim()})
       if($lines.Count -eq 0 -or $lines.Count -gt 1000){throw 'Invalid coin batch'}
       foreach($item in $lines){[void](ConvertFrom-Json $item)}
       $temp=$coinFile+'.r7-tmp'
       try{
        [IO.File]::WriteAllBytes($temp,$old)
        if($old.Length -gt 0 -and $old[$old.Length-1] -ne 10){[IO.File]::AppendAllText($temp,"`n",(New-Object Text.UTF8Encoding($false)))}
        [IO.File]::AppendAllText($temp,(($lines -join "`n")+"`n"),(New-Object Text.UTF8Encoding($false)))
        $newRev=Get-TTCoinRevision (Read-TTCoinBytes $temp)
        if([IO.File]::Exists($coinFile)){[IO.File]::Replace($temp,$coinFile,[NullString]::Value)}else{[IO.File]::Move($temp,$coinFile)}
        $extraHeaders="X-TT-Coin-Revision: $newRev`r`n";$body='{"ok":true}'
       }finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
      }
     }else{$ctype='text/plain; charset=utf-8';$raw=$old;$extraHeaders="X-TT-Coin-Revision: $rev`r`n"}
    }
   }
   elseif($path -eq '/api/speakers' -or $path -eq '/api/speakers/set' -or $path -eq '/api/open-sound-settings'){
    if(-not ($localHost -and ($fetchSite -eq 'same-origin' -or ($parts[0] -eq 'GET' -and -not $fetchSite)))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($path -eq '/api/open-sound-settings'){Start-Process 'ms-settings:sound';$body='{"ok":true}'}
    else{
     try{
      if($path -eq '/api/speakers/set'){
       $pick=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($bodyText)) | ConvertFrom-Json
       Set-TTSpeaker ([string]$pick.id)
       $body='{"ok":true}'
      }else{$body=ConvertTo-Json -Compress -Depth 4 @{list=@(Get-TTSpeakers)}}
     }catch{$status='500 Internal Server Error';$body=ConvertTo-Json -Compress @{error=$_.Exception.Message}}
    }
   }
   elseif($path -eq '/api/volume'){
    if(-not ($localHost -and ($fetchSite -eq 'same-origin' -or ($parts[0] -eq 'GET' -and -not $fetchSite)))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    else{
     try{
      if($parts[0] -eq 'POST'){
       $want=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($bodyText)) | ConvertFrom-Json
       $level=if($null -ne $want.level){[math]::Max(0,[math]::Min(100,[double]$want.level))}else{$null}
       $muted=if($null -ne $want.muted){[bool]$want.muted}else{$null}
       Set-TTVolume $level $muted
      }
      $body=ConvertTo-Json -Compress (Get-TTVolume)
     }catch{$status='500 Internal Server Error';$body=ConvertTo-Json -Compress @{error=$_.Exception.Message}}
    }
   }
   elseif($path -eq '/api/fonts'){
    if(-not $localHost){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    else{
     if(-not $script:fontList){Add-Type -AssemblyName System.Drawing;$script:fontList=@((New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name })}
     $body=ConvertTo-Json -Compress @{list=@($script:fontList)}
    }
   }
   elseif($path -like '/api/weather*'){
    if(-not ($localHost -and ($fetchSite -eq 'same-origin' -or ($parts[0] -eq 'GET' -and -not $fetchSite)))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    else{
     try{
      if($path -eq '/api/weather/places'){
       if($uri.Query -notmatch '(?:^\?|&)q=([^&]+)'){throw 'Invalid search.'};$q=[uri]::UnescapeDataString($Matches[1])
       $body=ConvertTo-Json -Compress -Depth 4 @{list=@(Find-TTPlaces $q 5)}
      }elseif($path -eq '/api/weather/place'){
       $sent=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($bodyText)) | ConvertFrom-Json
       if($sent.auto){Remove-Item -LiteralPath $weatherPlaceFile -ErrorAction SilentlyContinue}
       elseif(([string]$sent.name).Length -in 1..60 -and [double]$sent.lat -gt 32 -and [double]$sent.lat -lt 39.5 -and [double]$sent.lon -gt 124 -and [double]$sent.lon -lt 132){
        $p=[pscustomobject]@{name=[string]$sent.name;lat=[double]$sent.lat;lon=[double]$sent.lon;auto=$false}
        [IO.File]::WriteAllText($weatherPlaceFile,(ConvertTo-Json -Compress $p),(New-Object Text.UTF8Encoding($false)))
       }else{throw 'Invalid place.'}
       $script:weatherCache=$null;$body='{"ok":true}'
      }elseif($path -eq '/api/weather'){$body=Get-TTWeather ($uri.Query -match '(?:^\?|&)fresh=1(?:&|$)') ($uri.Query -match '(?:^\?|&)met=1(?:&|$)')}
      else{$status='404 Not Found';$body='{"error":"none"}'}
     }catch{
      $status='502 Bad Gateway';$why=[string]$_.Exception.Message
      if($why -match 'TT_WEATHER_NO_ADDRESS|Choose the school first'){$code='WEATHER_NO_SCHOOL_ADDRESS';$message='학교 주소를 찾지 못했어요. 설정에서 학교를 다시 선택하거나 날씨 위치를 직접 지정해 주세요.'}
      elseif($why -match 'TT_WEATHER_LOCATION'){$code='WEATHER_PLACE_UNAVAILABLE';$message='자동 위치 확인에 실패했어요. 설정의 날씨 위치에서 시·군·구를 선택해 주세요.'}
      elseif($why -match 'TT_WEATHER_FORECAST_UNAVAILABLE'){$code='WEATHER_API_UNAVAILABLE';$message='위치는 확인했지만 날씨 서비스에 연결하지 못했어요. 네트워크 차단이나 날씨 서버 상태를 확인해 주세요.'}
      else{$code='WEATHER_REQUEST_FAILED';$message='날씨를 불러오지 못했어요. 다시 시도하거나 날씨 설정을 확인해 주세요.'}
      $body=ConvertTo-Json -Compress @{code=$code;error=$message}
     }
    }
   }
   elseif($path -eq '/api/touch-check' -or $path -eq '/api/touch-check/fix'){
    if(-not ($localHost -and ($fetchSite -eq 'same-origin' -or ($parts[0] -eq 'GET' -and -not $fetchSite)))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($path -eq '/api/touch-check/fix'){
     # Windows' own touch-screen setup: it asks which screen to touch; nothing here changes settings by itself.
     # A 32-bit PowerShell sees System32 redirected; Sysnative reaches the real one there.
     $digimon=Join-Path $env:WINDIR 'Sysnative\MultiDigiMon.exe'
     if(-not (Test-Path -LiteralPath $digimon)){$digimon=Join-Path $env:WINDIR 'System32\MultiDigiMon.exe'}
     Start-Process -FilePath $digimon -ArgumentList '-touch'
     $body='{"ok":true}'
    }
    else{$body=ConvertTo-Json -Compress -Depth 4 (Get-TTTouchCheck)}
   }
   elseif($path -eq '/api/share-input/status' -or $path -eq '/api/share-input/restart'){
    if(-not ($localHost -and ($fetchSite -eq 'same-origin' -or ($parts[0] -eq 'GET' -and -not $fetchSite)))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($path -eq '/api/share-input/restart'){
     # The helper keeps one copy per PC itself, so a second start while one runs only notes that in its log.
     if(-not (Get-TTShareHelper).running){Start-TTHidden -ScriptPath (Join-Path $TTInstallDir 'share-input.ps1')}
     $body='{"ok":true}'
    }
    else{$body=ConvertTo-Json -Compress (Get-TTShareHelper)}
   }
   elseif($path -eq '/api/share-input'){
    if(-not ($localHost -and ($fetchSite -eq 'same-origin' -or ($parts[0] -eq 'GET' -and -not $fetchSite)))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    else{
     $shareFile=Join-Path $TTInstallDir 'share-input.json'
     if($parts[0] -eq 'POST'){
      $o=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($bodyText)) | ConvertFrom-Json
      $body=ConvertTo-Json -Compress @{keyboard=($o.keyboard -eq $true);cursor=($o.cursor -eq $true)}
      [IO.File]::WriteAllText($shareFile,$body,(New-Object Text.UTF8Encoding($false)))
     }
     elseif(Test-Path -LiteralPath $shareFile -PathType Leaf){$body=[IO.File]::ReadAllText($shareFile)}
     else{$body='{"keyboard":false,"cursor":false}'}
    }
   }
   elseif($path -eq '/api/notice'){
    if(-not ($localHost -and ($fetchSite -eq 'same-origin' -or ($parts[0] -eq 'GET' -and -not $fetchSite)))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($parts[0] -eq 'POST'){
     $text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($bodyText))
     [void](ConvertFrom-Json $text)
     [IO.File]::AppendAllText($noticeFile,($text+"`n"),(New-Object Text.UTF8Encoding($false)))
     $body='{"ok":true}'
    }
    elseif(Test-Path -LiteralPath $noticeFile -PathType Leaf){$ctype='text/plain; charset=utf-8';$raw=[IO.File]::ReadAllBytes($noticeFile)}
    else{$ctype='text/plain; charset=utf-8';$body=''}
   }
   elseif($path -like '/api/school*' -or $path -eq '/api/open-sheet-copy'){
    if(-not ($localHost -and ($fetchSite -eq 'same-origin' -or ($parts[0] -eq 'GET' -and -not $fetchSite)))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($path -eq '/api/open-sheet-copy'){
     if($parts[0] -ne 'POST' -or -not $sheetTemplate){$status='405 Method Not Allowed';$body='{"error":"method"}'}
     else{Start-Process "https://docs.google.com/spreadsheets/d/$sheetTemplate/copy";$body='{"ok":true}'}
    }
    elseif($path -eq '/api/school/search'){
     if($uri.Query -notmatch '(?:^\?|&)q=([^&]+)'){throw 'Invalid search.'};$name=[uri]::UnescapeDataString($Matches[1])
     $office=if($uri.Query -match '(?:^\?|&)office=([A-Z]\d{2})(?:&|$)'){$Matches[1]}else{''}
     $body=ConvertTo-Json -Depth 5 -Compress (Search-Schools $name $office)
    }
    elseif($path -ne '/api/school'){$status='404 Not Found';$body='{"error":"none"}'}
    elseif($parts[0] -eq 'POST'){
     $text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($bodyText))
     $sent=ConvertFrom-Json $text
     $valid=([string]$sent.office -match '^[A-Z]\d{2}$') -and ([string]$sent.code -match '^\d{7}$') -and ([string]$sent.name).Length -in 1..60 -and ([string]$sent.grade -match '^\d{0,2}$') -and ([string]$sent.cls -match '^[0-9A-Za-z\uAC00-\uD7A3]{0,4}$') -and ([string]$sent.sheet -match '^([\w-]{20,80})?$')
     if(-not $valid){$status='400 Bad Request';$body='{"error":"invalid school"}'}
     else{
      $temp=$schoolFile+'.tmp'
      [IO.File]::WriteAllText($temp,$text,(New-Object Text.UTF8Encoding($false)))
      Move-Item -LiteralPath $temp -Destination $schoolFile -Force
      $script:school=$sent;$script:timetableCache=@{};$script:weatherCache=$null;Remove-Item -LiteralPath $weatherPlaceFile -ErrorAction SilentlyContinue
      $body='{"ok":true}'
     }
    }
    else{$body=ConvertTo-Json -Depth 5 -Compress ([pscustomobject]@{school=$script:school;template=$sheetTemplate})}
   }
   elseif($path -eq '/school.js'){
    if($localHost){$ctype='text/javascript; charset=utf-8';$raw=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'school.js'))}
    else{$status='403 Forbidden';$body='{"error":"forbidden"}'}
   }
   elseif($path -eq '/api/seating' -or $path -eq '/api/open-manager'){
    # Other websites in the teacher's browser must not read or replace the seating.
    $sameSite=$localHost -and ($fetchSite -eq 'same-origin' -or ($parts[0] -eq 'GET' -and -not $fetchSite))
    if(-not $sameSite){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($path -eq '/api/open-manager'){
     if($parts[0] -ne 'POST'){$status='405 Method Not Allowed';$body='{"error":"method"}'}
     else{Start-Process 'https://xkdtndbrwk111-prog.github.io/teacher-tools/seating/';$body='{"ok":true}'}
    }
    elseif($parts[0] -eq 'POST'){
     $text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($bodyText))
     $sent=ConvertFrom-Json $text
     if(-not $sent.assignments -or -not $sent.students -or -not $sent.layout){$status='400 Bad Request';$body='{"error":"invalid seating"}'}
     else{
      $temp=$seatingFile+'.tmp'
      [IO.File]::WriteAllText($temp,$text,(New-Object Text.UTF8Encoding($false)))
      Move-Item -LiteralPath $temp -Destination $seatingFile -Force
      $body='{"ok":true}'
     }
    }
    else{[byte[]]$seatBytes=Read-TTCoinBytes $seatingFile;$seatRev=Get-TTCoinRevision $seatBytes;$extraHeaders="X-TT-Seating-Revision: $seatRev`r`n";if([IO.File]::Exists($seatingFile)){$raw=$seatBytes}else{$status='404 Not Found';$body='{"error":"none"}'}}
   }
   elseif($path -in @('/presentation-board.js','/presentation-board.css') -or $path -like '/presentation/*'){
    if(-not $localHost -or $parts[0] -ne 'GET' -or ($fetchSite -and $fetchSite -notin @('same-origin','none'))){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    else{
     $name=$path.TrimStart('/')
     if($name -notmatch '^presentation(?:-board\.(?:js|css)|/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(?:html|css|js|mjs|png|svg|txt))$' -or $name.Contains('..')){$status='404 Not Found';$body='{"error":"not found"}'}
     else{
      $ctype=switch([IO.Path]::GetExtension($name)){'.html'{'text/html; charset=utf-8'} '.css'{'text/css; charset=utf-8'} '.js'{'text/javascript; charset=utf-8'} '.mjs'{'text/javascript; charset=utf-8'} '.png'{'image/png'} '.svg'{'image/svg+xml'} default{'text/plain; charset=utf-8'}}
      if($name -in @('presentation-board.js','presentation-board.css')){
       $asset=Join-Path $PSScriptRoot $name
       if(Test-Path -LiteralPath $asset -PathType Leaf){$raw=[IO.File]::ReadAllBytes($asset)}else{$status='404 Not Found';$body='{"error":"not found"}'}
      }else{
       $archive=[IO.Compression.ZipFile]::OpenRead($script:ttPresentAssetPath)
       try{
        $key=$name.Substring('presentation/'.Length)
        $entry=$archive.GetEntry($key)
        if($null -eq $entry -and $key -cmatch '^shared/assets/(?:playback|students|teacher)/[A-Za-z0-9_-]+\.png$'){
         $entry=$archive.GetEntry($key.Substring(0,$key.Length-4)+'.webp')
         if($null -ne $entry){$ctype='image/webp'}
        }
        if($null -eq $entry -or $entry.Length -gt 2097152){$status='404 Not Found';$body='{"error":"not found"}'}
        else{$inputStream=$entry.Open();$outputStream=New-Object IO.MemoryStream;try{$inputStream.CopyTo($outputStream);$raw=$outputStream.ToArray()}finally{$inputStream.Dispose();$outputStream.Dispose()}}
       }finally{$archive.Dispose()}
      }
     }
    }
   }
   else {
   # V1.59: read-only data routes also check Host / Origin / Sec-Fetch-Site (DNS rebinding and other sites).
   $readLocal=$localHost -and (-not $fetchSite -or $fetchSite -eq 'same-origin' -or $fetchSite -eq 'none') -and (-not $origin -or $origin -in @("http://127.0.0.1:$Port","http://localhost:$Port"))
   if($path -eq '/health'){$body='{"service":"teacher-tools-local","version":493,"release":"'+$TTRelease+'"}'}
   elseif(($path -eq '/' -or $path -eq '/index.html') -and -not $localHost){$status='403 Forbidden';$body='{"error":"forbidden"}'}
   elseif(($path -eq '/api/week' -or $path -eq '/api/meal' -or $path -eq '/api/events') -and -not $readLocal){$status='403 Forbidden';$body='{"error":"forbidden"}'}
   elseif($path -eq '/' -or $path -eq '/index.html'){$ctype='text/html; charset=utf-8';$body=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'dashboard.html'),[Text.Encoding]::UTF8)}
   elseif($path -eq '/api/week'){$body=ConvertTo-Json -Depth 20 -Compress (WeekData)}
   elseif($path -eq '/api/meal' -or $path -eq '/api/events'){if($uri.Query -notmatch '(?:^\?|&)date=(\d{8})(?:&|$)'){throw 'Invalid date.'};$date=$Matches[1];$kind=if($path -eq '/api/meal'){'meal'}else{'events'};$body=ConvertTo-Json -Depth 20 -Compress (NeisData $kind $date)}
   elseif($path -eq '/api/photos' -or $path -eq '/api/photos/pick' -or $path -eq '/photo'){
    # Other websites in the teacher's browser must not reach the class photos.
    if($hostName -ne "127.0.0.1:$Port" -or ($fetchSite -and $fetchSite -ne 'same-origin')){$status='403 Forbidden';$body='{"error":"forbidden"}'}
    elseif($path -eq '/api/photos'){$body=ConvertTo-Json -Compress (Update-PhotoList)}
    elseif($path -eq '/api/photos/pick'){Select-PhotoFolder;$body=ConvertTo-Json -Compress (Update-PhotoList)}
    else{
     if($script:photoFiles.Count -eq 0){[void](Update-PhotoList)}
     $index=-1
     if($uri.Query -match '(?:^\?|&)i=(\d{1,5})(?:&|$)'){$index=[int]$Matches[1]}
     if($index -lt 0 -or $index -ge $script:photoFiles.Count -or -not (Test-Path -LiteralPath $script:photoFiles[$index] -PathType Leaf)){$status='404 Not Found';$body='{"error":"not found"}'}
     else{
      $photoPath=$script:photoFiles[$index]
      if((Get-Item -LiteralPath $photoPath).Length -gt 62914560){$status='404 Not Found';$body='{"error":"too large"}'}
      else{$ctype=$photoTypes[[IO.Path]::GetExtension($photoPath).ToLowerInvariant()];$raw=[IO.File]::ReadAllBytes($photoPath)}
     }
    }
   }
   else {$status='404 Not Found';$body='{"error":"not found"}'}
   }
   } catch {if($_.Exception.Message -like 'No weekly sheet*'){$status='404 Not Found';$body=ConvertTo-Json -Compress @{code='WEEK_NOT_FOUND';error='시트에 이번 주 탭이 없습니다. 시트에서 이번 주 탭을 만들면 나타납니다.'}}elseif($_.Exception.Message -eq 'NEIS_NO_CLASS'){$status='404 Not Found';$body=ConvertTo-Json -Compress @{code='WEEK_NOT_FOUND';error='설정에서 학년과 반을 고르면 기본 시간표가 나옵니다.'}}elseif($_.Exception.Message -eq 'NEIS_NO_TIMETABLE'){$status='404 Not Found';$body=ConvertTo-Json -Compress @{code='WEEK_NOT_FOUND';error='나이스에 이번 주 시간표가 아직 없습니다.'}}else{$status='502 Bad Gateway';$code=if($path -eq '/api/meal'){'MEAL_FETCH_ERROR'}else{'UPSTREAM_ERROR'};$body=ConvertTo-Json -Compress @{code=$code;error='온라인 자료를 가져오지 못했습니다. 인터넷 연결 및 나이스 API 상태를 확인하세요.'}} }
  if($null -ne $raw){$bytes=$raw}else{$bytes=[Text.Encoding]::UTF8.GetBytes($body)}
  $corsHeaders=''
  if($statusCors){$corsHeaders="Access-Control-Allow-Origin: $origin`r`nAccess-Control-Allow-Methods: GET, OPTIONS`r`nAccess-Control-Allow-Private-Network: true`r`nVary: Origin, Access-Control-Request-Private-Network`r`n"}
  if($presentCors){$corsHeaders="Access-Control-Allow-Origin: $origin`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`nVary: Origin, Access-Control-Request-Private-Network`r`n"}
  $headers="HTTP/1.1 $status`r`nContent-Type: $ctype`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`nX-Content-Type-Options: nosniff`r`n$corsHeaders$extraHeaders`r`n";$headerBytes=[Text.Encoding]::ASCII.GetBytes($headers);$stream.Write($headerBytes,0,$headerBytes.Length);$stream.Write($bytes,0,$bytes.Length);$stream.Flush()
 } catch {} finally {if($reader){try{$reader.Dispose()}catch{}};if($stream){try{$stream.Dispose()}catch{}};$client.Close()}
} } finally {$listener.Stop()}
