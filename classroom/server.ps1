# 교실 매니저 Windows 실행 - Windows PowerShell 5.1, 설치와 관리자 권한이 필요 없습니다.
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$port = 4188
$url = "http://127.0.0.1:$port/seating/"
$types = @{
 '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
 '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'
 '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.webp' = 'image/webp'; '.mp4' = 'video/mp4'; '.xlsx' = 'application/octet-stream'
}
function Send-Response($stream, [string]$status, [string]$type, [byte[]]$body) {
 $head = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
 $bytes = [Text.Encoding]::ASCII.GetBytes($head)
 $stream.Write($bytes, 0, $bytes.Length)
 if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
 $stream.Flush()
}
function Send-Text($stream, [string]$status) {
 Send-Response $stream $status 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($status))
}
function Get-RequestedFile([string]$target) {
 $path = [Uri]::UnescapeDataString(($target -split '\?', 2)[0]).Replace('/', '\').TrimStart('\')
 if (-not $path) { $path = 'index.html' }
 if ($path -match '(^|\\)\.\.(\\|$)' -or $path.Contains(':')) { return $null }
 $file = [IO.Path]::GetFullPath((Join-Path $root $path))
 if ($file -ne $root -and -not $file.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { return $null }
 if (Test-Path -LiteralPath $file -PathType Container) { $file = Join-Path $file 'index.html' }
 if (Test-Path -LiteralPath $file -PathType Leaf) { return $file }
 return $null
}
$listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
try { $listener.Start() }
catch {
 Write-Host "이미 실행 중이거나 $port 번 포트를 다른 프로그램이 쓰고 있습니다. 브라우저를 엽니다."
 Start-Process $url
 exit 0
}
Write-Host "교실 매니저 주소: $url"
Write-Host '이 창을 닫으면 교실 매니저가 멈춥니다. 자료는 브라우저에 남습니다.'
Start-Process $url
try {
 while ($true) {
  $client = $listener.AcceptTcpClient()
  # A browser may open a connection and send nothing, so an idle one must not hold up the rest.
  $client.ReceiveTimeout = 1000
  $client.SendTimeout = 10000
  try {
   $stream = $client.GetStream()
   $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
   $request = $reader.ReadLine()
   if (-not $request) { continue }
   $hostName = ''
   do {
    $line = $reader.ReadLine()
    if ($line -match '^Host:\s*(.+)$') { $hostName = $Matches[1].Trim() }
   } while ($null -ne $line -and $line -ne '')
   $parts = $request.Split(' ')
   if ($parts.Length -lt 2 -or $parts[0] -ne 'GET') { Send-Text $stream '405 Method Not Allowed'; continue }
   # Other websites must not reach this server through a look-alike address.
   if ($hostName -ne "127.0.0.1:$port" -and $hostName -ne "localhost:$port") { Send-Text $stream '403 Forbidden'; continue }
   $file = Get-RequestedFile $parts[1]
   if (-not $file) { Send-Text $stream '404 Not Found'; continue }
   $type = $types[[IO.Path]::GetExtension($file).ToLowerInvariant()]
   if (-not $type) { $type = 'application/octet-stream' }
   Send-Response $stream '200 OK' $type ([IO.File]::ReadAllBytes($file))
  }
  catch { Write-Verbose $_.Exception.Message }
  finally { $client.Close() }
 }
}
finally { $listener.Stop() }
