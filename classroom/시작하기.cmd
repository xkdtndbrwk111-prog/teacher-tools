@echo off
chcp 65001 >nul
if not exist "%~dp0..\seating\index.html" (
 echo 압축을 먼저 풀어 주세요. 압축 파일을 마우스 오른쪽 버튼으로 눌러 [모두 압축 풀기] 후, 풀린 폴더에서 실행하면 됩니다.
 pause
 exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 (echo. & echo 오류가 발생했습니다. & pause & exit /b 1)
