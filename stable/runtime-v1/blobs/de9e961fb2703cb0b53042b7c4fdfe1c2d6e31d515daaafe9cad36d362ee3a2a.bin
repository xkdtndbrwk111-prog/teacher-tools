$startup=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$hiddenStart=Join-Path $env:LOCALAPPDATA 'TeacherToolsLocal\launch-hidden.vbs'
$shell=New-Object -ComObject WScript.Shell
foreach($name in @('호자보드.lnk','Teacher Tools Local.lnk')){
 $link=Join-Path $startup $name
 if(Test-Path -LiteralPath $link){$sc=$shell.CreateShortcut($link);if($sc.Arguments.Trim('"') -eq $hiddenStart -and $sc.TargetPath -eq (Join-Path $env:SystemRoot 'System32\wscript.exe')){Remove-Item -LiteralPath $link -Force}}
}
Write-Host '로그인 자동실행 해제 완료.'
